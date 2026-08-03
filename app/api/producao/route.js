import { JWT } from 'google-auth-library';
import { handleRadarRequest } from '../../../lib/radar-core';
import { handleStructuredAiRequest } from '../../../lib/deepseek-structured';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MANAGEMENT_ID = process.env.MANAGEMENT_SPREADSHEET_ID || '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';
const TZ = 'America/Sao_Paulo';
let tokenCache = null;

export async function GET(request) {
  const mode = requestMode(request);

  if (mode === 'ai' || mode === 'radar-ai') {
    return handleStructuredAiRequest(request);
  }

  if (mode && mode !== 'tv' && mode !== 'painel') {
    return handleRadarRequest(request);
  }

  return handleVisualPayload();
}

export async function POST(request) {
  return GET(request);
}

async function handleVisualPayload() {
  try {
    const [dailyValues, projectionResult] = await Promise.all([
      getSheetValues("'DIÁRIA ESTÁTICA'!A1:N123", 'DIÁRIA ESTÁTICA'),
      getSheetValues("'PROJEÇÃO DE META'!A1:G127", 'PROJEÇÃO DE META')
        .then((values) => ({ values, error: null }))
        .catch((error) => {
          console.error('[RADAR_V16_PROJECTION_READ_ERROR]', error);
          return { values: null, error };
        })
    ]);

    const operational = parseDailyOperational(dailyValues);
    let projection = emptyProjection();

    if (projectionResult.values) {
      try {
        projection = parseProjection(projectionResult.values);
      } catch (error) {
        console.error('[RADAR_V16_PROJECTION_PARSE_ERROR]', error);
        projection = emptyProjection(error?.message || String(error));
      }
    } else {
      projection = emptyProjection(projectionResult.error?.message || String(projectionResult.error || 'Falha de leitura.'));
    }

    const payload = patchPayload({}, operational, projection);

    return Response.json(payload, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    console.error('[RADAR_V16_DATA_ERROR]', error);

    return Response.json({
      ok: false,
      error: 'RADAR_V16_DATA_ERROR',
      message: error?.message || String(error)
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function getSheetValues(range, label) {
  const token = await getAccessToken();
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${MANAGEMENT_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${label} indisponível: Google Sheets HTTP ${response.status} ${detail}`);
  }

  const json = await response.json();
  return json.values || [];
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60_000) return tokenCache.token;

  const client = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const auth = await client.authorize();
  tokenCache = {
    token: auth.access_token,
    expiresAt: auth.expiry_date || now + 3_000_000
  };
  return tokenCache.token;
}

function parseDailyOperational(values) {
  const coordinators = [];
  const stores = [];
  let summary = null;
  let currentResponsible = '';

  const flatText = values.flat().map((cell) => String(cell ?? '').trim()).filter(Boolean);
  const updateLabel = flatText.find((text) => /^Atualizado às\s+/i.test(text)) || '';
  const baseDate = findBaseDate(values);

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const firstCell = String(row[0] || '').trim();
    const firstKey = normalize(firstCell);
    const headers = row.map(normalize);

    if (firstKey.startsWith('COORDENACAO')) {
      currentResponsible = firstCell.replace(/^coordenação\s*/i, '').trim();
      continue;
    }

    if (headers[0] === 'COORDENADORA' && headers.includes('PAGO NO RETRATO')) {
      for (let index = rowIndex + 1; index < values.length; index += 1) {
        const data = values[index] || [];
        const name = String(data[0] || '').trim();
        const key = normalize(name);
        if (!name) break;

        const item = parseSummaryRow(headers, data);
        if (key === 'TOTAL') {
          summary = item;
          break;
        }
        coordinators.push({ name, ...item });
      }
      continue;
    }

    if (headers[0] === 'LOJA' && headers.includes('PAGO NO RETRATO')) {
      for (let index = rowIndex + 1; index < values.length; index += 1) {
        const data = values[index] || [];
        const rawName = String(data[0] || '').trim();
        const key = normalize(rawName);
        if (!rawName || key.startsWith('TOTAL') || key.startsWith('COORDENACAO')) break;

        const monthGoal = value(headers, data, ['META AGOSTO', 'META JULHO', 'META']);
        const monthRealized = value(headers, data, ['REALIZADO AGOSTO', 'REALIZADO JULHO', 'REALIZADO']);
        const dailyGoal = value(headers, data, ['DIARIA']);
        const soldToday = value(headers, data, ['VENDIDO HOJE']);
        const paidToday = value(headers, data, ['PAGO NO RETRATO', 'PAGO HOJE']);

        stores.push({
          name: cleanStoreName(rawName),
          responsible: currentResponsible,
          monthGoal,
          monthGoalFormatted: money(monthGoal),
          monthRealized,
          monthRealizedFormatted: money(monthRealized),
          monthPercent: percent(value(headers, data, ['% ATINGIDO', '% PROJETADO', '%'])),
          dailyGoal,
          dailyGoalFormatted: money(dailyGoal),
          soldToday,
          soldTodayFormatted: money(soldToday),
          paidToday,
          paidTodayFormatted: money(paidToday),
          paidPercent: dailyGoal > 0 ? (paidToday / dailyGoal) * 100 : monthRealized >= monthGoal && monthGoal > 0 ? 100 : 0,
          conversionPending: Math.max(0, soldToday - paidToday),
          conversionPendingFormatted: money(Math.max(0, soldToday - paidToday)),
          status: text(headers, data, ['STATUS']),
          insight: text(headers, data, ['INSIGHT'])
        });
      }
    }
  }

  if (!summary) throw new Error('Linha TOTAL da DIÁRIA ESTÁTICA não encontrada.');
  if (!coordinators.length) throw new Error('Resumo de coordenadoras não encontrado na DIÁRIA ESTÁTICA.');
  if (!stores.length) throw new Error('Blocos de lojas não encontrados na DIÁRIA ESTÁTICA.');

  return { summary, coordinators, stores, updateLabel, baseDate };
}

function parseSummaryRow(headers, row) {
  const monthRealized = value(headers, row, ['REALIZADO']);
  const monthGoal = value(headers, row, ['META']);
  const dailyGoal = value(headers, row, ['DIARIA NECESSARIA DO DIA', 'DIARIA']);
  const soldToday = value(headers, row, ['VENDIDO HOJE']);
  const paidToday = value(headers, row, ['PAGO NO RETRATO', 'PAGO HOJE']);

  return {
    monthRealized,
    monthGoal,
    monthPercent: percent(value(headers, row, ['% ATINGIDO', '% PROJETADO', '%'])),
    dailyGoal,
    soldToday,
    paidToday,
    status: text(headers, row, ['STATUS'])
  };
}

function parseProjection(values) {
  const rows = [];
  const flatText = values.flat().map((cell) => String(cell ?? '').trim()).filter(Boolean);
  const updateLabel = flatText.find((text) => /^Atualizado às\s+/i.test(text)) || '';
  let headerIndex = -1;
  let headers = [];

  for (let index = 0; index < values.length; index += 1) {
    const candidate = (values[index] || []).map(normalize);
    if (candidate[0] === 'COORDENADORA' && candidate.includes('% PROJETADO')) {
      headerIndex = index;
      headers = candidate;
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error('Cabeçalho consolidado da PROJEÇÃO DE META não encontrado.');
  }

  for (let index = headerIndex + 1; index < values.length; index += 1) {
    const row = values[index] || [];
    const name = String(row[0] || '').trim();
    const key = normalize(name);

    if (!name || key.startsWith('COORDENACAO')) break;

    rows.push({
      name,
      monthRealized: nullableNumber(rawValue(headers, row, ['REALIZADO'])),
      monthGoal: nullableNumber(rawValue(headers, row, ['META'])),
      projectionPercent: nullablePercent(rawValue(headers, row, ['% PROJETADO'])),
      dailyGoal: nullableNumber(rawValue(headers, row, ['DIARIA NECESSARIA DO DIA', 'DIARIA'])),
      paidToday: nullableNumber(rawValue(headers, row, ['PAGO HOJE', 'PAGO NO RETRATO']))
    });
  }

  if (!rows.length) {
    throw new Error('Resumo de projeção por coordenação não encontrado na PROJEÇÃO DE META.');
  }

  return { rows, updateLabel, warning: '' };
}

function emptyProjection(message = '') {
  return {
    rows: [],
    updateLabel: '',
    warning: message ? `Projeção mensal indisponível: ${message}` : ''
  };
}

function patchPayload(base, operational, projection) {
  const total = operational.summary;
  const paidToday = total.paidToday;
  const soldToday = total.soldToday;
  const dailyGoal = total.dailyGoal;
  const dailyGap = Math.max(0, dailyGoal - paidToday);
  const soldGap = Math.max(0, dailyGoal - soldToday);
  const pending = Math.max(0, soldToday - paidToday);
  const actualMonthDelta = total.monthRealized - total.monthGoal;
  const projectionByName = new Map(projection.rows.map((item) => [normalize(item.name), item]));

  const projectionMatches = operational.coordinators.map((item) => ({
    operational: item,
    projection: projectionByName.get(normalize(item.name)) || null
  }));
  const missingProjectionNames = projectionMatches
    .filter(({ projection: item }) => !item || !Number.isFinite(item.projectionPercent))
    .map(({ operational: item }) => item.name);
  const hasCompleteProjection = projectionMatches.length > 0 && missingProjectionNames.length === 0;
  const projectedMonthAmount = hasCompleteProjection
    ? projectionMatches.reduce((sum, { operational: item, projection: projected }) => sum + (item.monthGoal * projected.projectionPercent / 100), 0)
    : null;
  const monthProjectionPercent = hasCompleteProjection && total.monthGoal > 0
    ? (projectedMonthAmount / total.monthGoal) * 100
    : null;
  const monthProjectionGap = monthProjectionPercent === null ? null : projectedMonthAmount - total.monthGoal;

  const zeroStores = operational.stores
    .filter((store) => store.soldToday <= 0)
    .sort((a, b) => b.dailyGoal - a.dailyGoal)
    .map((store) => ({
      name: store.name,
      responsible: store.responsible,
      responsibleLabel: 'COORDENADORA',
      reason: 'Sem venda hoje',
      dailyGoal: store.dailyGoal,
      dailyGoalFormatted: money(store.dailyGoal),
      monthGoal: store.monthGoal,
      monthGoalFormatted: money(store.monthGoal)
    }));

  const responsiblePerformance = operational.coordinators.map((item) => {
    const coordinatorStores = operational.stores.filter((store) => normalize(store.responsible) === normalize(item.name));
    const zeroCount = coordinatorStores.filter((store) => store.soldToday <= 0).length;
    const dailyPercent = item.dailyGoal > 0
      ? (item.paidToday / item.dailyGoal) * 100
      : item.monthPercent >= 100 ? 100 : 0;
    const actualDelta = item.monthRealized - item.monthGoal;
    const projectionRow = projectionByName.get(normalize(item.name));
    const projectionPercent = Number.isFinite(projectionRow?.projectionPercent) ? projectionRow.projectionPercent : null;
    const projectionAmount = projectionPercent === null ? null : item.monthGoal * projectionPercent / 100;
    const projectionGap = projectionAmount === null ? null : projectionAmount - item.monthGoal;
    const projectionRisk = projectionPercent === null ? true : projectionPercent < 85;

    return {
      name: item.name,
      responsibleLabel: 'COORDENADORA',
      productionToday: item.paidToday,
      productionTodayFormatted: money(item.paidToday),
      paidToday: item.paidToday,
      paidTodayFormatted: money(item.paidToday),
      soldToday: item.soldToday,
      soldTodayFormatted: money(item.soldToday),
      conversionPending: Math.max(0, item.soldToday - item.paidToday),
      conversionPendingFormatted: money(Math.max(0, item.soldToday - item.paidToday)),
      dailyGoal: item.dailyGoal,
      dailyGoalFormatted: money(item.dailyGoal),
      dailyGap: Math.max(0, item.dailyGoal - item.paidToday),
      dailyGapFormatted: money(Math.max(0, item.dailyGoal - item.paidToday)),
      dailyPercent,
      monthGoal: item.monthGoal,
      monthGoalFormatted: money(item.monthGoal),
      monthRealized: item.monthRealized,
      monthRealizedFormatted: money(item.monthRealized),
      monthPercent: projectionPercent,
      monthAchievedPercent: item.monthPercent,
      monthProjectionPercent: projectionPercent,
      monthProjectionAmount: projectionAmount,
      monthProjectionAmountFormatted: projectionAmount === null ? '' : money(projectionAmount),
      monthProjectionGap: projectionGap,
      monthProjectionGapFormatted: projectionGap === null ? '' : signedMoney(projectionGap),
      monthDelta: item.monthPercent,
      monthDeltaFormatted: `${formatPercent(item.monthPercent)} cumprido`,
      monthActualGap: actualDelta,
      monthActualGapFormatted: signedMoney(actualDelta),
      projectionGapFormatted: projectionGap === null ? '' : signedMoney(projectionGap),
      zeroCount,
      storeCount: coordinatorStores.length,
      status: item.status,
      risk: projectionRisk || zeroCount >= 3 ? 'Risco elevado' : zeroCount > 0 || dailyPercent < 100 ? 'Atenção' : 'Controlado',
      priority: zeroCount ? 'Atuar nas lojas zeradas' : 'Acompanhar operação',
      diagnosis: projectionPercent === null
        ? `${zeroCount} loja(s) zerada(s), ${formatPercent(item.monthPercent)} da meta cumprida e projeção indisponível.`
        : `${zeroCount} loja(s) zerada(s), ${formatPercent(item.monthPercent)} cumprido e projeção mensal de ${formatPercent(projectionPercent)}.`
    };
  });

  const paidPercent = dailyGoal > 0 ? (paidToday / dailyGoal) * 100 : 0;
  const soldPercent = dailyGoal > 0 ? (soldToday / dailyGoal) * 100 : 0;
  const rhythmLabel = paidToday >= dailyGoal
    ? 'DIÁRIA ENTREGUE'
    : pending > 0
      ? 'CONVERSÃO É A PRIORIDADE'
      : 'ACELERAR PRODUÇÃO';
  const rhythmDescription = paidToday >= dailyGoal
    ? `${money(paidToday)} pagos contra diária de ${money(dailyGoal)}`
    : `${money(pending)} vendidos aguardam pagamento • ${money(soldGap)} ainda faltam em vendas para a diária`;
  const warnings = [projection.warning];

  if (missingProjectionNames.length) {
    warnings.push(`Sem projeção mensal para: ${missingProjectionNames.join(', ')}.`);
  }

  const warning = warnings.filter(Boolean).join(' ');
  const updatedAt = latestUpdateHour(operational.updateLabel, projection.updateLabel) || base.updatedAt;

  return {
    ...base,
    ok: true,
    source: 'gestao-preditiva-diaria-estatica+projecao-meta',
    version: 'RADAR_V1_6_PROJECAO_E_CUMPRIMENTO',
    viewVersion: 'RADAR_V1_6',
    updatedAt,
    date: operational.baseDate || base.date,
    summary: {
      ...(base.summary || {}),
      productionToday: paidToday,
      productionTodayFormatted: money(paidToday),
      paidToday,
      paidTodayFormatted: money(paidToday),
      soldToday,
      soldTodayFormatted: money(soldToday),
      conversionPending: pending,
      conversionPendingFormatted: money(pending),
      activeStores: operational.stores.filter((store) => store.soldToday > 0).length,
      paidActiveStores: operational.stores.filter((store) => store.paidToday > 0).length,
      totalStores: operational.stores.length,
      zeroStores: zeroStores.length,
      zeroPaidStores: operational.stores.filter((store) => store.paidToday <= 0).length
    },
    goal: {
      ...(base.goal || {}),
      dailyGoal,
      dailyGoalFormatted: money(dailyGoal),
      dailyGap,
      dailyGapFormatted: money(dailyGap),
      dailyPercent: paidPercent,
      soldGap,
      soldGapFormatted: money(soldGap),
      soldPercent,
      conversionPending: pending,
      conversionPendingFormatted: money(pending),
      monthGoal: total.monthGoal,
      monthGoalFormatted: money(total.monthGoal),
      monthRealized: total.monthRealized,
      monthRealizedFormatted: money(total.monthRealized),
      monthPercent: monthProjectionPercent,
      monthAchievedPercent: total.monthPercent,
      monthGap: Math.max(0, total.monthGoal - total.monthRealized),
      monthGapFormatted: money(Math.max(0, total.monthGoal - total.monthRealized)),
      monthProjectionPercent,
      monthProjectionAmount: projectedMonthAmount,
      monthProjectionAmountFormatted: projectedMonthAmount === null ? '' : money(projectedMonthAmount),
      monthProjectionGap,
      monthProjectionGapFormatted: monthProjectionGap === null ? '' : signedMoney(monthProjectionGap),
      projectionFormatted: monthProjectionPercent === null ? '' : formatPercent(monthProjectionPercent),
      projectionGap: monthProjectionGap,
      projectionGapFormatted: monthProjectionPercent === null ? '' : `+${formatPercent(total.monthPercent)} cumprido`,
      actualGap: actualMonthDelta,
      actualGapFormatted: signedMoney(actualMonthDelta)
    },
    rhythm: {
      label: rhythmLabel,
      tone: paidToday >= dailyGoal ? 'positive' : 'attention',
      percent: Math.round(paidPercent),
      description: rhythmDescription
    },
    responsiblePerformance,
    regionalPerformance: responsiblePerformance,
    operationalStores: operational.stores,
    zeroStores,
    aiReading: {
      status: 'DETERMINISTIC',
      generatedAt: updatedAt,
      text: buildDiagnosis(responsiblePerformance),
      priorityResponsible: highestRisk(responsiblePerformance)?.name || ''
    },
    ticker: [
      `Pago hoje: ${money(paidToday)}`,
      `Vendido hoje: ${money(soldToday)}`,
      `Falta hoje: ${money(dailyGap)}`,
      monthProjectionPercent === null
        ? `Meta cumprida: ${formatPercent(total.monthPercent)}`
        : `Projeção do mês: ${formatPercent(monthProjectionPercent)} • cumprido: ${formatPercent(total.monthPercent)}`
    ],
    counts: {
      ...(base.counts || {}),
      zeroStores: zeroStores.length,
      operationalStores: operational.stores.length,
      soldActiveStores: operational.stores.filter((store) => store.soldToday > 0).length,
      paidActiveStores: operational.stores.filter((store) => store.paidToday > 0).length
    },
    missingData: missingProjectionNames.map((name) => `PROJEÇÃO MENSAL ${name}`),
    warning
  };
}

function buildDiagnosis(rows) {
  const risk = highestRisk(rows);
  if (!risk) return 'Sem leitura consolidada por coordenação nesta atualização.';

  if (!Number.isFinite(risk.monthProjectionPercent)) {
    return `${risk.name} concentra o maior risco por ${risk.zeroCount} loja(s) zerada(s); projeção mensal indisponível.`;
  }

  return `${risk.name} concentra o maior risco: projeção de ${formatPercent(risk.monthProjectionPercent)}, ${formatPercent(risk.monthAchievedPercent)} da meta cumprida e ${risk.zeroCount} loja(s) zerada(s).`;
}

function highestRisk(rows) {
  return [...rows].sort((a, b) => riskScore(b) - riskScore(a))[0];
}

function riskScore(row) {
  const projectionPenalty = Number.isFinite(row.monthProjectionPercent)
    ? Math.max(0, 100 - row.monthProjectionPercent) * 10
    : 1500;
  return projectionPenalty + row.zeroCount * 100 + Math.max(0, 100 - row.dailyPercent);
}

function findBaseDate(values) {
  for (const row of values) {
    if (normalize(row?.[0]) === 'DATA BASE') return formatDate(row?.[1]);
  }
  return '';
}

function rawValue(headers, row, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return row[index];
  }
  return null;
}

function value(headers, row, names) {
  return number(rawValue(headers, row, names));
}

function text(headers, row, names) {
  const result = rawValue(headers, row, names);
  return result === null || result === undefined ? '' : String(result).trim();
}

function nullableNumber(input) {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(input) {
  return nullableNumber(input) ?? 0;
}

function nullablePercent(input) {
  const parsed = nullableNumber(input);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 2 ? parsed * 100 : parsed;
}

function percent(input) {
  return nullablePercent(input) ?? 0;
}

function money(input) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(input || 0));
}

function signedMoney(input) {
  const numericValue = Number(input || 0);
  if (Math.abs(numericValue) < 0.005) return 'R$ 0,00';
  return `${numericValue > 0 ? '+' : '-'}${money(Math.abs(numericValue))}`;
}

function formatPercent(input) {
  return `${Number(input || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function cleanStoreName(input) {
  return String(input || '')
    .replace(/^\d+\s*-\s*/i, '')
    .replace(/^help!\s*-?\s*/i, '')
    .replace(/^([A-Z]{2})\s*-\s*/i, '')
    .replace(/^([A-Z]{2})\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function extractHour(input) {
  const match = String(input || '').match(/(\d{1,2})h(\d{2})/i);
  return match ? `${match[1].padStart(2, '0')}h${match[2]}` : '';
}

function latestUpdateHour(...inputs) {
  return inputs
    .map(extractHour)
    .filter(Boolean)
    .sort((a, b) => hourToMinutes(b) - hourToMinutes(a))[0] || '';
}

function hourToMinutes(input) {
  const match = String(input || '').match(/(\d{2})h(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

function formatDate(input) {
  if (typeof input === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(input.trim())) return input.trim();
  if (typeof input === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + input * 86400000);
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(date);
  }
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(date);
}

function requestMode(request) {
  const url = new URL(request.url);
  return String(url.searchParams.get('mode') || url.searchParams.get('rota') || '').toLowerCase();
}
