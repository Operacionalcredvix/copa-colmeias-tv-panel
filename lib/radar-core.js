import { JWT } from 'google-auth-library';

const TZ = 'America/Sao_Paulo';
const VERSION = 'RADAR_VERCEL_MVP_1';

const DEFAULT_PRODUCTION_ID = '1vE3Ba1D9A5PyjazGuhJ4pk48GPdE4pEjpoQ2GVHiTsw';
const DEFAULT_MANAGEMENT_ID = '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';

const PRODUCTION_ID = process.env.PRODUCTION_SPREADSHEET_ID || DEFAULT_PRODUCTION_ID;
const MANAGEMENT_ID = process.env.MANAGEMENT_SPREADSHEET_ID || DEFAULT_MANAGEMENT_ID;

let accessTokenCache = null;
let payloadCache = null;

export async function handleRadarRequest(request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const mode = String(url.searchParams.get('mode') || url.searchParams.get('rota') || 'tv').toLowerCase();
  const noCache = url.searchParams.get('cache') === '0' || url.searchParams.get('refresh') === '1';

  try {
    if (mode === 'ai' || mode === 'radar-ai') {
      const payload = await getRadarPayload({ noCache });
      const ai = await buildDeepSeekReading(payload);
      return withJson({ ok: true, source: 'vercel', version: VERSION, mode: 'ai', ai, input: buildAiInput(payload), diagnostics: diag(startedAt) });
    }

    if (mode === 'report' || mode === 'radar-report') {
      const payload = await getRadarPayload({ noCache });
      const coordenadora = url.searchParams.get('coordenadora') || url.searchParams.get('responsavel') || 'TODAS';
      return withJson(buildReportPayload(payload, coordenadora, startedAt));
    }

    if (mode === 'send-report') {
      const payload = await getRadarPayload({ noCache });
      const coordenadora = url.searchParams.get('coordenadora') || url.searchParams.get('responsavel') || 'TODAS';
      const dryRun = url.searchParams.get('dryRun') !== '0';
      const report = buildReportPayload(payload, coordenadora, startedAt);
      const send = await sendClikchatReport(report, { dryRun });
      return withJson({ ok: true, source: 'vercel', version: VERSION, mode: 'send-report', dryRun, report, send, diagnostics: diag(startedAt) });
    }

    if (mode === 'status' || mode === 'radar-status') {
      const payload = await getRadarPayload({ noCache: true });
      return withJson({
        ok: true,
        source: 'vercel',
        version: VERSION,
        generatedAt: nowDateTime(),
        sheets: payload.sourceAudit,
        counts: payload.counts,
        missingData: payload.missingData,
        env: envStatus(),
        diagnostics: diag(startedAt)
      });
    }

    const payload = await getRadarPayload({ noCache });
    return withJson({ ...payload, diagnostics: diag(startedAt) });
  } catch (error) {
    return withJson({
      ok: false,
      source: 'vercel',
      version: VERSION,
      error: 'RADAR_API_ERROR',
      message: error?.message || String(error),
      env: envStatus(),
      diagnostics: diag(startedAt)
    }, 500);
  }
}

export async function getRadarPayload({ noCache = false } = {}) {
  const now = Date.now();
  if (!noCache && payloadCache && now - payloadCache.fetchedAt < 60_000) return payloadCache.payload;

  assertGoogleEnv();
  const ranges = await batchGet(PRODUCTION_ID, [
    'base_propostas_pagas!A1:Z5000',
    'base_propostas_pagas_historica!A1:Z20000',
    'MAPA_REGIONAIS_ACOMPANHAMENTO!A1:F200',
    'MAPA_CONSULTORES_CREDVIX!A1:J300'
  ]);

  const management = await batchGet(MANAGEMENT_ID, [
    'PAINEL COMERCIAL!A1:AF300',
    'PROJEÇÃO DE META!A1:H200',
    'METAS JULHO!A1:X1200',
    'ZERADOS DIRETORIA!A1:AN300',
    'DADOS!A1:Z6000'
  ]);

  const productionMonth = tableFromValues(ranges['base_propostas_pagas!A1:Z5000'] || []);
  const productionHistoric = tableFromValues(ranges['base_propostas_pagas_historica!A1:Z20000'] || []);
  const storeMap = readStoreMap(ranges['MAPA_REGIONAIS_ACOMPANHAMENTO!A1:F200'] || []);
  const credvixMap = readCredvixMap(ranges['MAPA_CONSULTORES_CREDVIX!A1:J300'] || []);

  const rawRows = dedupeRows([...productionHistoric.rows, ...productionMonth.rows].map((row) => normalizeProductionRow(row, storeMap, credvixMap)).filter(Boolean));
  const today = todayKey();
  const yesterday = addDaysKey(today, -1);
  const todayRows = rawRows.filter((row) => row.paymentKey === today);
  const yesterdayRows = rawRows.filter((row) => row.paymentKey === yesterday);
  const sevenRows = rawRows.filter((row) => dateDiffDays(row.paymentKey, today) >= 1 && dateDiffDays(row.paymentKey, today) <= 7);

  const managementSummary = readManagementSummary(management['PAINEL COMERCIAL!A1:AF300'] || []);
  const coordinators = readCoordinatorRows(management['PAINEL COMERCIAL!A1:AF300'] || []);
  const storeGoals = readStoreGoals(management['PROJEÇÃO DE META!A1:H200'] || [], management['METAS JULHO!A1:X1200'] || []);

  const summary = summarizeRows(todayRows);
  const yesterdaySummary = summarizeRows(yesterdayRows);
  const sevenAvg = averageByDate(sevenRows);
  const goal = buildGoal(summary, managementSummary);
  const zeroStores = buildZeroStores(storeMap, todayRows, storeGoals);
  const topStoresByProduction = groupStores(todayRows, storeGoals, false).slice(0, 10);
  const topStoresByGoal = groupStores(todayRows, storeGoals, true).slice(0, 10);
  const responsiblePerformance = buildResponsiblePerformance(coordinators, todayRows);
  const paceContext = buildPaceContext(rawRows, today, summary, goal);
  const missingData = missing({ managementSummary, storeGoals, paceContext, zeroStores, coordinators });

  const payload = {
    ok: true,
    source: 'vercel-google-sheets',
    version: VERSION,
    generatedAt: nowDateTime(),
    updatedAt: latestLoadLabel(productionMonth.rows) || nowHour(),
    date: formatDateBr(today),
    responsibleLabel: 'COORDENADORA',
    summary: {
      contractsToday: summary.contracts,
      productionToday: round2(summary.production),
      productionTodayFormatted: money(summary.production),
      averageTicket: round2(summary.averageTicket),
      averageTicketFormatted: money(summary.averageTicket),
      activeStores: summary.activeStores,
      totalStores: storeMap.stores.length,
      zeroStores: zeroStores.length
    },
    goal,
    rhythm: {
      label: paceContext.status === 'ATRASADO' ? 'ATRASADO PARA O HORÁRIO' : paceContext.status === 'ADIANTADO' ? 'ADIANTADO PARA O HORÁRIO' : paceContext.status === 'NO_RITMO' ? 'NO RITMO DO HORÁRIO' : 'RITMO INDETERMINADO',
      tone: paceContext.tone,
      percent: typeof goal.dailyPercent === 'number' ? goal.dailyPercent : 0,
      description: paceContext.label
    },
    paceContext,
    comparisons: {
      yesterday: comparison(summary, yesterdaySummary, 'ontem'),
      sevenDayAverage: comparison(summary, { contracts: sevenAvg.contractsAverage, production: sevenAvg.productionAverage }, 'média 7d', sevenAvg.days)
    },
    topStores: topStoresByGoal.length ? topStoresByGoal : topStoresByProduction,
    topStoresRankingMode: topStoresByGoal.length ? 'ATINGIMENTO_META' : 'PRODUCAO_R$',
    topStoresByGoal,
    topStoresByProduction,
    topConsultants: groupConsultants(todayRows).slice(0, 10),
    responsiblePerformance,
    regionalPerformance: responsiblePerformance,
    zeroStores,
    aiReading: deterministicReading(summary, goal, paceContext, zeroStores, responsiblePerformance),
    ticker: buildTicker(summary, goal, zeroStores, topStoresByProduction),
    sourceAudit: {
      productionSpreadsheetId: PRODUCTION_ID,
      managementSpreadsheetId: MANAGEMENT_ID,
      productionSheets: ['base_propostas_pagas', 'base_propostas_pagas_historica', 'MAPA_REGIONAIS_ACOMPANHAMENTO'],
      managementSheets: ['PAINEL COMERCIAL', 'PROJEÇÃO DE META', 'METAS JULHO', 'ZERADOS DIRETORIA'],
      storeGoalsCount: Object.keys(storeGoals.byName).length
    },
    counts: {
      monthRows: productionMonth.rows.length,
      historicRows: productionHistoric.rows.length,
      allRows: rawRows.length,
      todayRows: todayRows.length,
      yesterdayRows: yesterdayRows.length,
      zeroStores: zeroStores.length,
      storeGoals: Object.keys(storeGoals.byName).length,
      coordinators: coordinators.length
    },
    missingData
  };

  payloadCache = { fetchedAt: now, payload };
  return payload;
}

function assertGoogleEnv() {
  const missing = [];
  if (!process.env.GOOGLE_CLIENT_EMAIL) missing.push('GOOGLE_CLIENT_EMAIL');
  if (!process.env.GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
  if (missing.length) throw new Error('Variáveis Google ausentes: ' + missing.join(', '));
}

async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt - now > 60_000) return accessTokenCache.token;

  const privateKey = String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const client = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const token = await client.authorize();
  accessTokenCache = { token: token.access_token, expiresAt: token.expiry_date || now + 3_000_000 };
  return accessTokenCache.token;
}

async function batchGet(spreadsheetId, ranges) {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  ranges.forEach((range) => params.append('ranges', range));
  params.set('majorDimension', 'ROWS');
  params.set('valueRenderOption', 'UNFORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const out = {};
  for (const vr of json.valueRanges || []) out[vr.range.replace(/'/g, '')] = vr.values || [];
  return out;
}

function tableFromValues(values) {
  const header = (values[0] || []).map(norm);
  const rows = values.slice(1).filter((row) => row.some((cell) => String(cell || '').trim() !== '')).map((row) => rowToObject(header, row));
  return { header, rows };
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => { if (header) obj[header] = row[index]; });
  return obj;
}

function normalizeProductionRow(row, storeMap, credvixMap) {
  const group = norm(first(row, ['GRUPO']));
  if (group !== 'CREDITO NA CONTA') return null;

  const product = norm(first(row, ['PRODUTO']));
  if (product.includes('13') || product.includes('ANTECIPACAO')) return null;

  const payment = parseDate(first(row, ['PAGAMENTO', 'DATA PAGAMENTO', 'DATA_PAGAMENTO']));
  if (!payment) return null;

  const storeRaw = String(first(row, ['LOJA', 'UNIDADE']) || '').trim();
  const consultant = String(first(row, ['CONSULTOR', 'VENDEDOR']) || '').trim();
  const resolved = resolveStore(storeRaw, storeMap, credvixMap, consultant);
  if (resolved.skip) return null;

  return {
    paymentKey: dateKey(payment),
    inputDate: parseDate(first(row, ['DIGITACAO', 'DIGITAÇÃO', 'DATA DIGITACAO'])),
    loadRaw: first(row, ['CARGA_EM', 'CARGA EM', 'ULTIMA CARGA']),
    proposal: String(first(row, ['PROPOSTA', 'CONTRATO']) || '').trim(),
    storeRaw,
    storeName: resolved.name,
    responsible: resolved.responsible,
    consultant,
    product: String(first(row, ['PRODUTO']) || ''),
    origin: String(first(row, ['ORIGEM']) || ''),
    value: num(first(row, ['VALOR', 'PRODUCAO', 'PRODUÇÃO']))
  };
}

function readStoreMap(values) {
  const table = tableFromValues(values);
  const stores = [];
  const byName = {};
  const byCode = {};
  for (const row of table.rows) {
    const responsible = String(first(row, ['REGIONAL', 'COORDENADORA', 'COORDENADOR']) || '').trim();
    const raw = String(first(row, ['LOJA', 'UNIDADE', 'LOJA OFICIAL']) || '').trim();
    if (!responsible || !raw) continue;
    const name = cleanStoreName(raw);
    const code = extractCode(raw);
    const item = { name, storeName: name, responsible, code };
    stores.push(item);
    if (code) byCode[code] = item;
    [raw, name, canon(name)].forEach((key) => { if (key) byName[canon(key)] = item; });
  }
  return { stores, byName, byCode };
}

function readCredvixMap(values) {
  const table = tableFromValues(values);
  const fallback = { ANTONIA: 'Credvix Cariacica', THAYNARA: 'Credvix Cariacica', DENYSSANE: 'Credvix Vila Velha', 'DANIELE CASTELAR': 'Credvix Vila Velha', 'DANIELE SANTOS': 'Credvix Vila Velha', 'HELEN MENDES': 'Credvix Vila Velha' };
  const map = { ...fallback };
  for (const row of table.rows) {
    const consultant = norm(first(row, ['CONSULTOR_CHAVE', 'CONSULTOR CHAVE', 'CONSULTOR', 'NOME']));
    const store = String(first(row, ['LOJA_OFICIAL', 'LOJA OFICIAL', 'LOJA']) || '').trim();
    if (consultant && store) map[consultant] = store;
  }
  return map;
}

function resolveStore(storeRaw, storeMap, credvixMap, consultant) {
  const code = extractCode(storeRaw);
  if (code === '55634') {
    const target = credvixMap[norm(consultant)];
    if (!target) return { skip: true, name: 'CREDVIX Digital 1', responsible: 'SEM COORDENADORA' };
    const item = storeMap.byName[canon(target)];
    return item ? { name: item.name, responsible: item.responsible } : { name: target, responsible: 'SEM COORDENADORA' };
  }
  if (code && storeMap.byCode[code]) return { name: storeMap.byCode[code].name, responsible: storeMap.byCode[code].responsible };
  const clean = cleanStoreName(storeRaw);
  const item = storeMap.byName[canon(clean)] || storeMap.byName[canon(storeRaw)];
  return item ? { name: item.name, responsible: item.responsible } : { name: clean, responsible: 'SEM COORDENADORA' };
}

function readManagementSummary(values) {
  const out = {};
  for (let i = 0; i < values.length - 1; i++) {
    const headers = (values[i] || []).map(norm);
    if (!headers.join(' ').includes('META TOTAL')) continue;
    const row = values[i + 1] || [];
    out.monthGoal = valueByHeader(headers, row, ['META TOTAL']);
    out.monthRealized = valueByHeader(headers, row, ['REALIZADO CNC VALIDO', 'REALIZADO']);
    out.monthGap = valueByHeader(headers, row, ['FALTA']);
    out.monthPercent = valueByHeader(headers, row, ['% ATINGIMENTO', 'ATINGIMENTO']);
    out.dailyGoal = valueByHeader(headers, row, ['DIARIA GRUPO']);
    out.todaySold = valueByHeader(headers, row, ['VENDIDO HOJE']);
    out.todayGap = valueByHeader(headers, row, ['FALTA P/HOJE', 'FALTA P HOJE']);
    out.projection = valueByHeader(headers, row, ['PROJECAO FECHAMENTO']);
    out.projectionGap = valueByHeader(headers, row, ['GAP VS PROJECAO']);
    break;
  }
  return out;
}

function readCoordinatorRows(values) {
  const out = [];
  for (let r = 0; r < values.length; r++) {
    const headers = (values[r] || []).map(norm);
    if (!headers.includes('COORDENADORA') || !headers.join(' ').includes('META')) continue;
    for (let i = r + 1; i < values.length; i++) {
      const row = values[i] || [];
      const name = String(row[0] || '').trim();
      if (!name) break;
      const monthGoal = valueByHeader(headers, row, ['META JULHO 2026', 'META']);
      const monthRealized = valueByHeader(headers, row, ['REALIZADO CNC VALIDO', 'REALIZADO']);
      const todaySold = valueByHeader(headers, row, ['VENDIDO HOJE']);
      if (!monthGoal && !monthRealized && !todaySold) continue;
      out.push({
        name,
        monthGoal,
        monthRealized,
        monthPercent: valueByHeader(headers, row, ['%']),
        dailyGoal: valueByHeader(headers, row, ['DIARIA NECESSARIA', 'DIARIA']),
        todaySold,
        todayGap: valueByHeader(headers, row, ['FALTA P/HOJE', 'FALTA P HOJE']),
        projection: valueByHeader(headers, row, ['PROJECAO FECHAMENTO']),
        projectionGap: valueByHeader(headers, row, ['GAP VS PROJECAO']),
        risk: textByHeader(headers, row, ['RISCO']),
        priority: textByHeader(headers, row, ['PRIORIDADE DO DIA']),
        diagnosis: textByHeader(headers, row, ['DIAGNOSTICO / ACAO', 'DIAGNOSTICO'])
      });
    }
    break;
  }
  return out;
}

function readStoreGoals(projecaoValues, metasValues) {
  const byName = {};
  for (const values of [projecaoValues, metasValues]) {
    for (let r = 0; r < Math.min(values.length, 80); r++) {
      const headers = (values[r] || []).map(norm);
      const idxStore = findHeader(headers, ['LOJA', 'UNIDADE']);
      const idxDaily = findHeader(headers, ['META DIA', 'META DIARIA', 'DIARIA', 'DIARIA LOJA', 'META HOJE']);
      const idxMonth = findHeader(headers, ['META MES', 'META JULHO 2026', 'META JULHO', 'META']);
      const idxResp = findHeader(headers, ['COORDENADORA', 'RESPONSAVEL', 'REGIONAL']);
      if (idxStore < 0 || (idxDaily < 0 && idxMonth < 0)) continue;
      for (let i = r + 1; i < values.length; i++) {
        const row = values[i] || [];
        const store = cleanStoreName(row[idxStore]);
        if (!store) continue;
        const dailyGoal = idxDaily >= 0 ? num(row[idxDaily]) : 0;
        const monthGoal = idxMonth >= 0 ? num(row[idxMonth]) : 0;
        if (!dailyGoal && !monthGoal) continue;
        byName[canon(store)] = { name: store, dailyGoal: dailyGoal || null, monthGoal: monthGoal || null, responsible: idxResp >= 0 ? String(row[idxResp] || '') : '' };
      }
      break;
    }
  }
  return { byName };
}

function summarizeRows(rows) {
  const stores = new Set();
  let production = 0;
  rows.forEach((row) => { if (row.storeName) stores.add(canon(row.storeName)); production += Number(row.value || 0); });
  const contracts = rows.length;
  return { contracts, production, averageTicket: contracts ? production / contracts : 0, activeStores: stores.size };
}

function buildGoal(summary, management) {
  const dailyGoal = management.dailyGoal || 0;
  const dailyGap = dailyGoal ? Math.max(0, dailyGoal - summary.production) : null;
  return {
    dailyGoal: dailyGoal || null,
    dailyGoalFormatted: dailyGoal ? money(dailyGoal) : 'DADO AUSENTE',
    dailyGap,
    dailyGapFormatted: dailyGoal ? money(dailyGap) : 'DADO AUSENTE',
    dailyPercent: dailyGoal ? Math.round((summary.production / dailyGoal) * 100) : 'DADO AUSENTE',
    monthGoal: management.monthGoal || null,
    monthGoalFormatted: management.monthGoal ? money(management.monthGoal) : 'DADO AUSENTE',
    monthRealized: management.monthRealized || null,
    monthRealizedFormatted: management.monthRealized ? money(management.monthRealized) : 'DADO AUSENTE',
    monthGapFormatted: management.monthGap ? money(management.monthGap) : 'DADO AUSENTE',
    projectionFormatted: management.projection ? money(management.projection) : 'DADO AUSENTE',
    projectionGapFormatted: typeof management.projectionGap === 'number' ? money(management.projectionGap) : 'DADO AUSENTE'
  };
}

function buildPaceContext(allRows, today, summary, goal) {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));
  const currentPercent = typeof goal.dailyPercent === 'number' ? goal.dailyPercent : 'DADO AUSENTE';
  const curve = historicalCurve(allRows, today);
  if (!goal.dailyGoal || !curve.ok) return { currentPercent, expectedPercentNow: 'DADO AUSENTE', status: 'DADO AUSENTE', tone: 'neutral', hour, label: 'DADO AUSENTE: meta do dia ou curva histórica por horário indisponível', basis: curve.basis, sampleDays: curve.sampleDays };
  const expected = Math.round(curve.byHour[hour] || 0);
  const diff = currentPercent - expected;
  const status = diff <= -6 ? 'ATRASADO' : diff >= 6 ? 'ADIANTADO' : 'NO_RITMO';
  return { currentPercent, expectedPercentNow: expected, diffVsExpected: diff, status, tone: status === 'ATRASADO' ? 'negative' : status === 'ADIANTADO' ? 'positive' : 'neutral', hour, label: `${currentPercent}% realizado vs ~${expected}% esperado às ${hour}h`, basis: curve.basis, sampleDays: curve.sampleDays };
}

function historicalCurve(rows, today) {
  const byDay = {};
  rows.forEach((row) => {
    if (!row.inputDate) return;
    const diff = dateDiffDays(row.paymentKey, today);
    if (diff < 1 || diff > 30) return;
    const day = row.paymentKey;
    const hour = row.inputDate.getHours();
    byDay[day] ||= { total: 0, hours: {} };
    byDay[day].total += row.value;
    for (let h = hour; h <= 23; h++) byDay[day].hours[h] = (byDay[day].hours[h] || 0) + row.value;
  });
  const days = Object.keys(byDay).filter((day) => byDay[day].total > 0);
  if (days.length < 3) return { ok: false, basis: 'digitacao_proxy', sampleDays: days.length, byHour: {} };
  const byHour = {};
  for (let h = 0; h < 24; h++) byHour[h] = days.reduce((acc, day) => acc + ((byDay[day].hours[h] || 0) / byDay[day].total) * 100, 0) / days.length;
  return { ok: true, basis: 'digitacao_proxy', sampleDays: days.length, byHour };
}

function buildZeroStores(storeMap, todayRows, goals) {
  const active = new Set(todayRows.map((row) => canon(row.storeName)));
  return storeMap.stores.filter((store) => !active.has(canon(store.name))).map((store) => {
    const goal = goals.byName[canon(store.name)] || {};
    return { name: store.name, responsible: store.responsible, responsibleLabel: 'COORDENADORA', reason: 'Sem produção hoje', dailyGoalFormatted: goal.dailyGoal ? money(goal.dailyGoal) : 'DADO AUSENTE' };
  }).sort((a, b) => a.responsible.localeCompare(b.responsible, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
}

function groupStores(rows, goals, byGoal) {
  const map = {};
  rows.forEach((row) => { const key = canon(row.storeName); map[key] ||= { name: row.storeName, responsible: row.responsible, contracts: 0, production: 0 }; map[key].contracts++; map[key].production += row.value; });
  let out = Object.values(map).map((x) => { const goal = goals.byName[canon(x.name)] || {}; const goalDaily = goal.dailyGoal || null; const goalPercent = goalDaily ? Math.round((x.production / goalDaily) * 100) : 'DADO AUSENTE'; return { ...x, productionFormatted: money(x.production), averageTicketFormatted: money(x.contracts ? x.production / x.contracts : 0), goalDaily, goalDailyFormatted: goalDaily ? money(goalDaily) : 'DADO AUSENTE', goalPercent, goalGapFormatted: goalDaily ? money(Math.max(0, goalDaily - x.production)) : 'DADO AUSENTE' }; });
  if (byGoal) out = out.filter((x) => typeof x.goalPercent === 'number').sort((a, b) => b.goalPercent - a.goalPercent || b.production - a.production); else out.sort((a, b) => b.production - a.production);
  return out.map((x, i) => ({ ...x, position: i + 1 }));
}

function groupConsultants(rows) {
  const map = {};
  rows.forEach((row) => { const key = norm(row.consultant) || 'SEM CONSULTOR'; map[key] ||= { name: row.consultant || 'SEM CONSULTOR', store: row.storeName, responsible: row.responsible, contracts: 0, production: 0 }; map[key].contracts++; map[key].production += row.value; });
  return Object.values(map).sort((a, b) => b.production - a.production).map((x, i) => ({ ...x, position: i + 1, productionFormatted: money(x.production), averageTicketFormatted: money(x.contracts ? x.production / x.contracts : 0) }));
}

function buildResponsiblePerformance(coordinators, todayRows) {
  const today = {};
  todayRows.forEach((row) => { today[row.responsible] ||= { contracts: 0, production: 0 }; today[row.responsible].contracts++; today[row.responsible].production += row.value; });
  return coordinators.map((c) => { const t = today[c.name] || { contracts: 0, production: 0 }; const dailyGoal = c.dailyGoal || null; return { name: c.name, responsibleLabel: 'COORDENADORA', contractsToday: t.contracts, productionToday: t.production, productionTodayFormatted: money(t.production), dailyGoal, dailyGoalFormatted: dailyGoal ? money(dailyGoal) : 'DADO AUSENTE', dailyGapFormatted: dailyGoal ? money(Math.max(0, dailyGoal - t.production)) : 'DADO AUSENTE', dailyPercent: dailyGoal ? Math.round((t.production / dailyGoal) * 100) : 'DADO AUSENTE', monthGoalFormatted: money(c.monthGoal), monthRealizedFormatted: money(c.monthRealized), projectionFormatted: money(c.projection), projectionGapFormatted: money(c.projectionGap), risk: c.risk || 'DADO AUSENTE', priority: c.priority || 'DADO AUSENTE', diagnosis: c.diagnosis || 'DADO AUSENTE' }; }).sort((a, b) => b.productionToday - a.productionToday);
}

function comparison(summary, other, label, days) {
  const contractsDelta = summary.contracts - (other.contracts || 0);
  const productionDelta = summary.production - (other.production || 0);
  return { days, contracts: other.contracts || 0, production: other.production || 0, productionFormatted: money(other.production || 0), contractsDelta, productionDelta, productionDeltaFormatted: money(productionDelta), productionDeltaPercent: percentDelta(summary.production, other.production || 0), labelContracts: `${summary.contracts} contratos • ${signed(contractsDelta)} vs ${label}`, labelProduction: `${money(summary.production)} • ${signedPercent(percentDelta(summary.production, other.production || 0))} vs ${label}` };
}

function averageByDate(rows) { const byDate = {}; rows.forEach((row) => { byDate[row.paymentKey] ||= { contracts: 0, production: 0 }; byDate[row.paymentKey].contracts++; byDate[row.paymentKey].production += row.value; }); const dates = Object.keys(byDate); const div = Math.max(1, dates.length); return { days: dates.length, contractsAverage: Math.round(dates.reduce((a, d) => a + byDate[d].contracts, 0) / div), productionAverage: dates.reduce((a, d) => a + byDate[d].production, 0) / div }; }
function deterministicReading(summary, goal, pace, zeroStores, responsible) { const gap = goal.dailyGapFormatted !== 'DADO AUSENTE' ? `Faltam ${goal.dailyGapFormatted} para a meta do dia.` : 'Meta diária ausente.'; const ritmo = pace.status !== 'DADO AUSENTE' ? pace.label + '.' : 'Curva por horário indisponível.'; const zeros = `${zeroStores.length} lojas zeradas exigem acionamento nominal.`; return { status: 'DETERMINISTIC', generatedAt: nowHour(), text: `${gap} ${ritmo} ${zeros}`, priorityResponsible: responsible?.[0]?.name || 'DADO AUSENTE' }; }
function buildTicker(summary, goal, zeroStores, topStores) { return [`Contratos hoje: ${summary.contracts}`, `Produção hoje: ${money(summary.production)}`, `Meta do dia: ${goal.dailyGoalFormatted}`, `Gap: ${goal.dailyGapFormatted}`, `Lojas zeradas: ${zeroStores.length}`, topStores?.[0] ? `Líder em R$: ${topStores[0].name} — ${topStores[0].productionFormatted}` : 'Sem líder em R$']; }
function missing({ managementSummary, storeGoals, paceContext, zeroStores, coordinators }) { const m = []; if (!managementSummary.dailyGoal) m.push('META_DO_DIA_R$'); if (!Object.keys(storeGoals.byName).length) m.push('META_POR_LOJA_INDIVIDUAL'); if (paceContext.expectedPercentNow === 'DADO AUSENTE') m.push('CURVA_HISTORICA_FECHAMENTO_POR_HORARIO'); if (!zeroStores.length) m.push('LISTA_NOMINAL_LOJAS_ZERADAS_VAZIA'); if (!coordinators.length) m.push('CONSOLIDADO_POR_COORDENADORA'); return [...new Set(m)]; }
function dedupeRows(rows) { const seen = new Set(); return rows.filter((row, i) => { const key = row.proposal || [row.paymentKey, row.storeName, row.consultant, row.value, i].join('|'); if (seen.has(key)) return false; seen.add(key); return true; }); }

export async function buildDeepSeekReading(payload) {
  if (!process.env.DEEPSEEK_API_KEY) return { status: 'TOKEN_AUSENTE', text: 'DEEPSEEK_API_KEY não configurado no Vercel.' };
  const input = buildAiInput(payload);
  const prompt = `Você é uma IA de inteligência comercial da CREDVIX. Não invente números. Gere: diagnóstico executivo, ações por coordenadora, lojas zeradas críticas, riscos até o próximo checkpoint e perguntas para diretoria. JSON:\n${JSON.stringify(input, null, 2)}`;
  const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', temperature: 0.2, messages: [{ role: 'system', content: 'Responda em português do Brasil, com foco executivo e acionável.' }, { role: 'user', content: prompt }] }) });
  if (!response.ok) return { status: 'ERRO_DEEPSEEK', text: await response.text() };
  const json = await response.json();
  return { status: 'OK', generatedAt: nowHour(), text: json.choices?.[0]?.message?.content || JSON.stringify(json) };
}

function buildAiInput(payload) { return { date: payload.date, updatedAt: payload.updatedAt, summary: payload.summary, goal: payload.goal, paceContext: payload.paceContext, responsiblePerformance: payload.responsiblePerformance, topStoresByGoal: payload.topStoresByGoal, topStoresByProduction: payload.topStoresByProduction, zeroStores: payload.zeroStores, missingData: payload.missingData }; }
function buildReportPayload(payload, coordenadora, startedAt) { const key = norm(coordenadora); const all = key === 'TODAS'; const filt = (arr) => all ? arr : arr.filter((x) => norm(x.responsible || x.name) === key); return { ok: true, source: 'vercel', version: VERSION, mode: 'report', date: payload.date, updatedAt: payload.updatedAt, responsibleLabel: 'COORDENADORA', responsible: coordenadora, summary: payload.summary, goal: payload.goal, paceContext: payload.paceContext, responsiblePerformance: filt(payload.responsiblePerformance || []), topStoresByGoal: filt(payload.topStoresByGoal || []), zeroStores: filt(payload.zeroStores || []), aiReading: payload.aiReading, missingData: payload.missingData, diagnostics: diag(startedAt) }; }
async function sendClikchatReport(report, { dryRun }) { const body = formatReportText(report); if (dryRun) return { status: 'DRY_RUN', body }; const token = process.env.CLIKCHAT_TOKEN; const whatsappId = process.env.CLIKCHAT_WHATSAPP_ID; const number = process.env.CLIKCHAT_DEFAULT_NUMBER; if (!token || !whatsappId || !number) return { status: 'CONFIG_AUSENTE', missing: ['CLIKCHAT_TOKEN', 'CLIKCHAT_WHATSAPP_ID', 'CLIKCHAT_DEFAULT_NUMBER'].filter((k) => !process.env[k]), body }; const response = await fetch(process.env.CLIKCHAT_API_URL || 'https://api.clikchat.com.br/api/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ whatsappId, number, body, name: `Radar ${report.responsible}` }) }); return { status: response.ok ? 'ENVIADO' : 'ERRO', httpStatus: response.status, response: await response.text(), body }; }
function formatReportText(report) { return [`📊 RADAR DE PRODUÇÃO — ${report.responsible}`, `Atualizado: ${report.updatedAt}`, `Produção: ${report.summary.productionTodayFormatted}`, `Meta do dia: ${report.goal.dailyGoalFormatted}`, `Gap: ${report.goal.dailyGapFormatted}`, `Ritmo: ${report.paceContext.label}`, `Zeradas: ${report.zeroStores.map((z) => z.name).join(', ') || 'nenhuma'}`].join('\n'); }

function first(row, keys) { for (const key of keys) { const k = norm(key); if (row[k] !== undefined && row[k] !== '') return row[k]; } return ''; }
function findHeader(headers, candidates) { return headers.findIndex((header) => candidates.some((candidate) => header === norm(candidate) || header.includes(norm(candidate)))); }
function valueByHeader(headers, row, candidates) { const idx = findHeader(headers, candidates); return idx >= 0 ? num(row[idx]) : 0; }
function textByHeader(headers, row, candidates) { const idx = findHeader(headers, candidates); return idx >= 0 ? String(row[idx] || '').trim() : ''; }
function num(value) { if (typeof value === 'number') return value; const n = Number(String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function norm(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/º/g, 'O').trim().toUpperCase(); }
function canon(value) { return cleanStoreName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase(); }
function extractCode(value) { return String(value || '').match(/\b\d{5}\b/)?.[0] || ''; }
function cleanStoreName(value) { return String(value || '').replace(/^\s*\d{5}\s*-\s*/i, '').replace(/help!/gi, '').replace(/\bhelp\b/gi, '').replace(/\bES\b|\bMT\b|\bBA\b|\bDF\b|\bGO\b|\bMG\b/gi, '').replace(/[-!|•●]/g, ' ').replace(/\bCPA\s*II\b/gi, 'CPA 2').replace(/\bCENTRO\s*NORTE\b/gi, 'Centro-Norte').replace(/\s+/g, ' ').trim(); }
function parseDate(value) { if (!value) return null; if (value instanceof Date) return value; const s = String(value).trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)); m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/); if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)); return null; }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function todayKey() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`; }
function addDaysKey(key, delta) { const [y, m, d] = key.split('-').map(Number); const date = new Date(y, m - 1, d + delta); return dateKey(date); }
function dateDiffDays(a, b) { const da = new Date(a + 'T00:00:00'); const db = new Date(b + 'T00:00:00'); return Math.round((db - da) / 86400000); }
function formatDateBr(key) { const [y, m, d] = key.split('-'); return `${d}/${m}/${y}`; }
function nowDateTime() { return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' }).format(new Date()); }
function nowHour() { return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h'); }
function latestLoadLabel(rows) { return ''; }
function money(value) { const n = Number(value || 0); const sign = n < 0 ? '-' : ''; return sign + 'R$ ' + Math.abs(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function percentDelta(current, previous) { if (!previous && !current) return 0; if (!previous && current) return 100; return Math.round(((current - previous) / previous) * 100); }
function signed(v) { return `${v > 0 ? '+' : ''}${v}`; }
function signedPercent(v) { return `${v > 0 ? '+' : ''}${v}%`; }
function round2(v) { return Math.round(Number(v || 0) * 100) / 100; }
function envStatus() { return { googleClientEmail: Boolean(process.env.GOOGLE_CLIENT_EMAIL), googlePrivateKey: Boolean(process.env.GOOGLE_PRIVATE_KEY), deepseek: Boolean(process.env.DEEPSEEK_API_KEY), clikchat: Boolean(process.env.CLIKCHAT_TOKEN), productionSpreadsheetId: PRODUCTION_ID, managementSpreadsheetId: MANAGEMENT_ID }; }
function diag(startedAt) { return { responseMs: Date.now() - startedAt, generatedAt: new Date().toISOString(), env: envStatus() }; }
function withJson(data, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
