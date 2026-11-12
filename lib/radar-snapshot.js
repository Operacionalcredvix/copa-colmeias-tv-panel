const SNAPSHOT_ENDPOINT = 'https://uexvojgictmkuackpofk.supabase.co/functions/v1/radar-daily-snapshot';

const normalized = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

const finite = (value) => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;

const percentage = (amount, goal) => goal > 0 && amount !== null
  ? (amount / goal) * 100 : null;

function unavailable(payload, reason) {
  const responsiblePerformance = (payload.responsiblePerformance || []).map((row) => ({
    ...row,
    monthPercent: null,
    monthProjectionPercent: null,
    monthProjectionAmount: null,
    monthProjectionGap: null,
    recoveryToday: null,
    monthRealizedClosed: null,
    cumulativeTargetToday: null,
  }));
  const operationalStores = (payload.operationalStores || []).map((row) => ({
    ...row,
    monthProjectionPercent: null,
    monthProjectionAmount: null,
    monthProjectionGap: null,
    recoveryToday: null,
    monthRealizedClosed: null,
    cumulativeTargetToday: null,
  }));
  return {
    ...payload, responsiblePerformance, regionalPerformance: responsiblePerformance,
    operationalStores,
    goal: {
      ...payload.goal,
      monthPercent: null,
      monthProjectionPercent: null,
      monthProjectionAmount: null,
      monthProjectionGap: null,
    },
    snapshot: { ok: false, reason },
    warning: [payload.warning, 'Projeções estáticas indisponíveis: ' + reason].filter(Boolean).join(' '),
    missingData: [...(payload.missingData || []), 'SNAPSHOT PROJEÇÃO DIÁRIA'],
  };
}

export async function applyDailySnapshot(payload) {
  let snapshot;
  try {
    const response = await fetch(SNAPSHOT_ENDPOINT, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return unavailable(payload, 'serviço de snapshots não respondeu');
    const data = await response.json();
    snapshot = data?.ok ? data.snapshot : null;
    if (!snapshot) return unavailable(payload, 'fechamento anterior não validado');
  } catch (error) {
    console.error('[RADAR_SNAPSHOT_READ_ERROR]', error);
    return unavailable(payload, 'erro ao consultar persistência');
  }

  const payloadDate = String(payload.date || '').split('/').reverse().join('-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payloadDate) ||
      snapshot.operationalDate > payloadDate ||
      snapshot.competence !== payloadDate.slice(0, 7)) {
    return unavailable(payload, 'data do fechamento incompatível');
  }
  const coordinatorByName = new Map((snapshot.coordinators || []).map((row) => [normalized(row.name), row]));
  const storeByCode = new Map((snapshot.stores || []).map((row) => [String(row.code), row]));
  const responsiblePerformance = (payload.responsiblePerformance || []).map((row) => {
    const frozen = coordinatorByName.get(normalized(row.name));
    if (!frozen) return { ...row, monthProjectionPercent: null, monthProjectionAmount: null, monthProjectionGap: null, monthPercent: null, recoveryToday: null };
    return {
      ...row,
      monthPercent: finite(frozen.monthProjectionPercent),
      monthProjectionPercent: finite(frozen.monthProjectionPercent),
      monthProjectionAmount: finite(frozen.monthProjectionAmount),
      monthProjectionGap: finite(frozen.monthProjectionGap),
      recoveryToday: finite(frozen.recoveryToday),
      monthRealizedClosed: finite(frozen.monthRealizedClosed),
      cumulativeTargetToday: finite(frozen.cumulativeTargetToday),
    };
  });
  const operationalStores = (payload.operationalStores || []).map((row) => {
    const frozen = storeByCode.get(String(row.code));
    return {
      ...row,
      monthProjectionPercent: finite(frozen?.monthProjectionPercent),
      monthProjectionAmount: finite(frozen?.monthProjectionAmount),
      monthProjectionGap: finite(frozen?.monthProjectionGap),
      recoveryToday: finite(frozen?.recoveryToday),
      monthRealizedClosed: finite(frozen?.monthRealizedClosed),
      cumulativeTargetToday: finite(frozen?.cumulativeTargetToday),
    };
  });
  const complete = responsiblePerformance.length === 3 &&
    responsiblePerformance.every((row) => finite(row.monthProjectionPercent) !== null && finite(row.monthGoal) > 0);
  const monthProjectionAmount = complete
    ? responsiblePerformance.reduce((sum, row) => sum + row.monthProjectionAmount, 0) : null;
  const monthGoal = finite(payload.goal?.monthGoal);
  const monthProjectionPercent = percentage(monthProjectionAmount, monthGoal);
  const monthProjectionGap = monthProjectionAmount === null || monthGoal === null
    ? null : monthProjectionAmount - monthGoal;
  const missingStores = operationalStores.filter((row) => finite(row.monthProjectionPercent) === null && finite(row.monthGoal) > 0);
  const missing = [
    ...(payload.missingData || []),
    ...missingStores.map((row) => 'PROJEÇÃO LOJA ' + String(row.code || row.name)),
  ];
  const finalPayload = {
    ...payload,
    responsiblePerformance,
    regionalPerformance: responsiblePerformance,
    operationalStores,
    goal: {
      ...payload.goal,
      monthPercent: monthProjectionPercent,
      monthProjectionPercent,
      monthProjectionAmount,
      monthProjectionGap,
    },
    snapshot: {
      ok: complete,
      operationalDate: snapshot.operationalDate,
      closedThrough: snapshot.closedThrough,
      createdAt: snapshot.createdAt,
    },
    missingData: missing,
    warning: [payload.warning, !complete ? 'Projeção geral incompleta' : '', missingStores.length ? 'Projeções ausentes em algumas lojas' : '']
      .filter(Boolean).join(' '),
  };
  // O diagnóstico de exibição usa somente a projeção consolidada congelada.
  return finalPayload;
}
