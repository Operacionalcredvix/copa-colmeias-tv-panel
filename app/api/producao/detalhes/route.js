import { JWT } from 'google-auth-library';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TZ = 'America/Sao_Paulo';
const VERSION = 'OPERATIONAL_DETAIL_V2';
const DEFAULT_MANAGEMENT_ID = '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';
const MANAGEMENT_ID = process.env.MANAGEMENT_SPREADSHEET_ID || DEFAULT_MANAGEMENT_ID;
const RANGE = 'DIÁRIA ESTÁTICA!A1:J123';

let tokenCache = null;
let payloadCache = null;

export async function GET(request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const noCache = url.searchParams.get('refresh') === '1' || url.searchParams.get('cache') === '0';
  try {
    const payload = await getPayload({ noCache });
    return Response.json({ ...payload, diagnostics: { elapsedMs: Date.now() - startedAt } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, version: VERSION, error: 'OPERATIONAL_DETAIL_ERROR', message: error?.message || String(error), diagnostics: { elapsedMs: Date.now() - startedAt } }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function getPayload({ noCache = false } = {}) {
  const now = Date.now();
  if (!noCache && payloadCache && now - payloadCache.fetchedAt < 60000) return payloadCache.payload;
  const values = await getRange(MANAGEMENT_ID, RANGE);
  const parsed = parseOperational(values);
  const payload = { ok: true, version: VERSION, generatedAt: nowLabel(), date: dateLabel(), ...parsed, sourceAudit: { spreadsheetId: MANAGEMENT_ID, range: RANGE, rowsRead: values.length } };
  payloadCache = { fetchedAt: now, payload };
  return payload;
}

async function getRange(spreadsheetId, range) {
  const token = await getAccessToken();
  const params = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
  params.append('ranges', range);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}: ${await response.text()}`);
  return (await response.json()).valueRanges?.[0]?.values || [];
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60000) return tokenCache.token;
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Variáveis Google ausentes.');
  const client = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const auth = await client.authorize();
  tokenCache = { token: auth.access_token, expiresAt: auth.expiry_date || now + 3000000 };
  return tokenCache.token;
}

function parseOperational(values) {
  const stores = [];
  const coordinatorRows = [];
  const summaryRow = {};
  let currentResponsible = '';

  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    const first = text(row[0]);
    const firstNorm = norm(first);
    const headers = row.map(norm);

    if (firstNorm.startsWith('COORDENACAO')) {
      currentResponsible = first.replace(/^coordenação\s*/i, '').trim();
      continue;
    }

    if (headers[0] === 'COORDENADORA' && headers.includes('VENDIDO HOJE')) {
      for (let i = r + 1; i < values.length; i++) {
        const dataRow = values[i] || [];
        const name = text(dataRow[0]);
        if (!name) break;
        const item = {
          name,
          monthRealized: valueByHeader(headers, dataRow, ['REALIZADO']),
          monthGoal: valueByHeader(headers, dataRow, ['META']),
          projectionPercent: percent(valueByHeader(headers, dataRow, ['% PROJETADO', '%'])),
          dailyGoal: valueByHeader(headers, dataRow, ['DIARIA NECESSARIA DO DIA', 'DIARIA']),
          soldToday: valueByHeader(headers, dataRow, ['VENDIDO HOJE']),
          paidToday: valueByHeader(headers, dataRow, ['PAGO HOJE']),
          status: textByHeader(headers, dataRow, ['STATUS'])
        };
        if (norm(name) === 'TOTAL') { Object.assign(summaryRow, item); break; }
        coordinatorRows.push(item);
      }
      continue;
    }

    if (headers[0] === 'LOJA' && headers.includes('VENDIDO HOJE')) {
      for (let i = r + 1; i < values.length; i++) {
        const dataRow = values[i] || [];
        const name = text(dataRow[0]);
        const nameNorm = norm(name);
        if (!name || nameNorm.startsWith('COORDENACAO') || nameNorm.startsWith('TOTAL')) break;
        const soldToday = valueByHeader(headers, dataRow, ['VENDIDO HOJE']);
        const paidToday = valueByHeader(headers, dataRow, ['PAGO HOJE']);
        const dailyGoal = valueByHeader(headers, dataRow, ['DIARIA']);
        const monthGoal = valueByHeader(headers, dataRow, ['META JULHO', 'META']);
        const monthRealized = valueByHeader(headers, dataRow, ['REALIZADO JULHO', 'REALIZADO']);
        const hasDailyGoal = dailyGoal > 0;
        const missing = hasDailyGoal ? Math.max(0, dailyGoal - paidToday) : null;
        const pending = Math.max(0, soldToday - paidToday);
        const status = !hasDailyGoal ? 'A AVALIAR' : paidToday >= dailyGoal ? 'ENTREGUE' : pending > 0 ? 'AGUARDANDO PAGAMENTO' : 'NAO ENTREGUE';
        stores.push({
          name, responsible: currentResponsible || 'SEM COORDENADORA', soldToday, soldTodayFormatted: money(soldToday), paidToday, paidTodayFormatted: paidToday > 0 ? money(paidToday) : '—', dailyGoal, dailyGoalFormatted: hasDailyGoal ? money(dailyGoal) : 'Sem diária', missing, missingFormatted: missing === null ? '—' : money(missing), pending, pendingFormatted: money(pending), paidPercent: hasDailyGoal ? Math.round((paidToday / dailyGoal) * 100) : null, soldPercent: hasDailyGoal ? Math.round((soldToday / dailyGoal) * 100) : null, monthGoal, monthGoalFormatted: monthGoal > 0 ? money(monthGoal) : 'Sem meta', monthRealized, monthRealizedFormatted: money(monthRealized), monthPercent: percent(valueByHeader(headers, dataRow, ['% ATINGIDO', '%'])), status, sourceStatus: textByHeader(headers, dataRow, ['STATUS']), insight: textByHeader(headers, dataRow, ['INSIGHT'])
        });
      }
    }
  }

  const grouped = new Map();
  for (const store of stores) {
    const key = norm(store.responsible);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(store);
  }
  const baseByName = new Map(coordinatorRows.map((item) => [norm(item.name), item]));
  const names = new Set([...grouped.keys(), ...baseByName.keys()]);
  const coordinators = [...names].map((key) => {
    const base = baseByName.get(key) || {};
    const list = grouped.get(key) || [];
    const name = base.name || list[0]?.responsible || 'SEM COORDENADORA';
    const soldToday = list.length ? sum(list, 'soldToday') : number(base.soldToday);
    const paidToday = list.length ? sum(list, 'paidToday') : number(base.paidToday);
    const dailyGoal = list.length ? sum(list, 'dailyGoal') : number(base.dailyGoal);
    const monthGoal = list.length ? sum(list, 'monthGoal') : number(base.monthGoal);
    const monthRealized = list.length ? sum(list, 'monthRealized') : number(base.monthRealized);
    const deliveredStores = list.filter((store) => store.status === 'ENTREGUE').length;
    const withoutDailyGoal = list.filter((store) => store.status === 'A AVALIAR').length;
    const noSaleStores = list.filter((store) => store.soldToday <= 0).length;
    const dailyGap = dailyGoal > 0 ? Math.max(0, dailyGoal - paidToday) : null;
    return {
      name, storesCount: list.length, deliveredStores, withoutDailyGoal, notDeliveredStores: list.filter((store) => ['NAO ENTREGUE', 'AGUARDANDO PAGAMENTO'].includes(store.status)).length, noSaleStores, soldToday, soldTodayFormatted: money(soldToday), paidToday, paidTodayFormatted: money(paidToday), dailyGoal, dailyGoalFormatted: dailyGoal > 0 ? money(dailyGoal) : 'Sem diária', dailyGap, dailyGapFormatted: dailyGap === null ? 'Sem gap' : money(dailyGap), dailyPercent: dailyGoal > 0 ? Math.round((paidToday / dailyGoal) * 100) : null, pending: Math.max(0, soldToday - paidToday), pendingFormatted: money(Math.max(0, soldToday - paidToday)), monthGoal, monthGoalFormatted: monthGoal > 0 ? money(monthGoal) : 'Sem meta', monthRealized, monthRealizedFormatted: money(monthRealized), projectionPercent: percent(base.projectionPercent), projectionFormatted: projection(base.projectionPercent, monthGoal), status: text(base.status) || (dailyGoal > 0 && paidToday >= dailyGoal ? 'ENTREGUE' : 'EM ACOMPANHAMENTO'), reading: buildReading({ noSaleStores, withoutDailyGoal, dailyGap, pending: Math.max(0, soldToday - paidToday) })
    };
  }).sort((a, b) => (a.dailyPercent ?? -1) - (b.dailyPercent ?? -1) || (b.dailyGap || 0) - (a.dailyGap || 0));

  const soldToday = number(summaryRow.soldToday) || sum(stores, 'soldToday');
  const paidToday = number(summaryRow.paidToday) || sum(stores, 'paidToday');
  const dailyGoal = number(summaryRow.dailyGoal) || sum(stores, 'dailyGoal');
  const monthGoal = number(summaryRow.monthGoal) || sum(stores, 'monthGoal');
  const monthRealized = number(summaryRow.monthRealized) || sum(stores, 'monthRealized');
  const summary = {
    soldToday, soldTodayFormatted: money(soldToday), paidToday, paidTodayFormatted: money(paidToday), dailyGoal, dailyGoalFormatted: money(dailyGoal), dailyPercent: dailyGoal > 0 ? Math.round((paidToday / dailyGoal) * 100) : null, pending: Math.max(0, soldToday - paidToday), pendingFormatted: money(Math.max(0, soldToday - paidToday)), dailyGap: Math.max(0, dailyGoal - paidToday), dailyGapFormatted: money(Math.max(0, dailyGoal - paidToday)), storesCount: stores.length, deliveredStores: stores.filter((s) => s.status === 'ENTREGUE').length, withoutDailyGoal: stores.filter((s) => s.status === 'A AVALIAR').length, notDeliveredStores: stores.filter((s) => ['NAO ENTREGUE', 'AGUARDANDO PAGAMENTO'].includes(s.status)).length, monthGoal, monthGoalFormatted: money(monthGoal), monthRealized, monthRealizedFormatted: money(monthRealized), projectionPercent: percent(summaryRow.projectionPercent), projectionFormatted: projection(summaryRow.projectionPercent, monthGoal)
  };

  return { summary, coordinators, stores };
}

function buildReading({ noSaleStores, withoutDailyGoal, dailyGap, pending }) {
  const parts = [];
  if (noSaleStores) parts.push(`${noSaleStores} ${noSaleStores === 1 ? 'loja sem venda captada' : 'lojas sem venda captada'}`);
  if (withoutDailyGoal) parts.push(`${withoutDailyGoal} sem diária cadastrada`);
  if (pending > 0) parts.push(`${money(pending)} aguardando conversão`);
  if (!parts.length && dailyGap === 0) return 'Cobertura completa da necessidade do dia';
  return parts.join(' • ') || 'Operação em acompanhamento';
}

function projection(value, goal) {
  const pct = percent(value);
  return pct && goal > 0 ? money(goal * pct / 100) : 'Sem projeção';
}
function percent(value) {
  const n = number(value);
  if (!n) return null;
  return Math.abs(n) <= 3 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}
function valueByHeader(headers, row, candidates) { for (const candidate of candidates) { const index = headers.indexOf(norm(candidate)); if (index >= 0) return number(row[index]); } return 0; }
function textByHeader(headers, row, candidates) { for (const candidate of candidates) { const index = headers.indexOf(norm(candidate)); if (index >= 0) return text(row[index]); } return ''; }
function sum(rows, field) { return rows.reduce((total, row) => total + number(row[field]), 0); }
function number(value) { if (typeof value === 'number' && Number.isFinite(value)) return value; const cleaned = String(value ?? '').trim().replace(/[^0-9,.-]/g, ''); if (!cleaned) return 0; const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned; const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0; }
function text(value) { return String(value ?? '').trim(); }
function norm(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number(value)); }
function nowLabel() { return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()); }
function dateLabel() { return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()); }
