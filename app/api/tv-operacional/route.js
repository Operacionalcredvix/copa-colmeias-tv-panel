import { JWT } from 'google-auth-library';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SPREADSHEET_ID = process.env.MANAGEMENT_SPREADSHEET_ID || '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';
const RANGES = {
  daily: "'DIÁRIA ESTÁTICA'!A1:J123",
  projection: "'PROJEÇÃO DE META'!A1:G127"
};
const COORDINATORS = ['DAIELLY', 'MARIA FERNANDA', 'MARIELEN'];

let tokenCache = null;
let payloadCache = null;
let insightCache = null;

export async function GET(request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  try {
    const payload = await getPayload(forceRefresh);
    return Response.json(payload, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'TV_OPERATIONAL_API_ERROR',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}

async function getPayload(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && payloadCache && now - payloadCache.fetchedAt < 60_000) {
    return payloadCache.payload;
  }

  const values = await batchGet(Object.values(RANGES));
  const daily = parseDaily(values[RANGES.daily] || []);
  const projection = parseProjection(values[RANGES.projection] || []);
  projection.coordinatorViews = buildCoordinatorViews(daily, projection);

  const insights = await getOperationalInsights(projection.coordinatorViews, projection.coordinators);
  projection.coordinatorViews = projection.coordinatorViews.map((view) => ({
    ...view,
    insight: insights[norm(view.name)] || fallbackInsight(view)
  }));

  const payload = {
    ok: true,
    version: 'TV_OPERACIONAL_V2',
    generatedAt: new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date()),
    daily,
    projection
  };

  payloadCache = { fetchedAt: now, payload };
  return payload;
}

async function batchGet(ranges) {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  ranges.forEach((range) => params.append('ranges', range));
  params.set('majorDimension', 'ROWS');
  params.set('valueRenderOption', 'FORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );

  if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}: ${await response.text()}`);

  const json = await response.json();
  const out = {};
  (json.valueRanges || []).forEach((item, index) => {
    out[ranges[index]] = item.values || [];
  });
  return out;
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60_000) return tokenCache.token;
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Variáveis GOOGLE_CLIENT_EMAIL e GOOGLE_PRIVATE_KEY não configuradas.');
  }

  const client = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: String(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const auth = await client.authorize();
  tokenCache = { token: auth.access_token, expiresAt: auth.expiry_date || now + 3_000_000 };
  return tokenCache.token;
}

function parseDaily(rows) {
  const updatedAt = findUpdatedAt(rows);
  const date = String(rows?.[2]?.[1] || '');
  const header = findRow(rows, (row) => norm(row[0]) === 'COORDENADORA' && row.map(norm).includes('VENDIDO HOJE'));
  const all = header ? readUntilBlank(rows, header.index + 1, header.row) : [];
  const coordinators = all.filter((item) => norm(item.name) !== 'TOTAL');
  const total = all.find((item) => norm(item.name) === 'TOTAL') || null;
  const stores = readSections(rows, 'daily');

  return {
    title: 'DIÁRIA ESTÁTICA',
    subtitle: 'Execução do dia por coordenação e lojas',
    updatedAt,
    date,
    coordinators,
    total,
    stores,
    priorityStores: [...stores].sort((a, b) => dailyPriority(b) - dailyPriority(a)).slice(0, 10)
  };
}

function parseProjection(rows) {
  const updatedAt = findUpdatedAt(rows);
  const header = findRow(rows, (row) => norm(row[0]) === 'COORDENADORA' && row.map(norm).includes('% PROJETADO'));
  const all = header ? readUntilBlank(rows, header.index + 1, header.row) : [];
  const coordinators = all.filter((item) => !['KETILA', 'KÉTILA', 'TOTAL'].includes(norm(item.name)));
  const total = all.find((item) => ['KETILA', 'KÉTILA', 'TOTAL'].includes(norm(item.name))) || null;
  const stores = readSections(rows, 'projection');

  return {
    title: 'PROJEÇÃO DE META',
    subtitle: 'Ritmo projetado do mês e desempenho por coordenação',
    updatedAt,
    coordinators,
    total,
    stores
  };
}

function buildCoordinatorViews(daily, projection) {
  const dailyMap = new Map(daily.stores.map((store) => [storeKey(store), store]));

  return COORDINATORS.map((coordinator) => {
    const projectionStores = projection.stores.filter((store) => norm(store.responsible) === coordinator);
    const stores = projectionStores.map((store) => {
      const dailyStore = dailyMap.get(storeKey(store)) || daily.stores.find((item) => norm(item.name) === norm(store.name));
      return {
        ...store,
        soldToday: dailyStore?.soldToday || 'R$ 0',
        paidToday: dailyStore?.paidToday || '0,00',
        status: dailyStore?.status || 'SEM STATUS'
      };
    });

    const coordinatorName = projection.coordinators.find((item) => norm(item.name) === coordinator)?.name
      || daily.coordinators.find((item) => norm(item.name) === coordinator)?.name
      || titleCase(coordinator);

    return {
      name: coordinatorName,
      stores,
      totals: {
        dailyGoal: money(stores.reduce((sum, item) => sum + moneyNumber(item.dailyGoal), 0)),
        soldToday: money(stores.reduce((sum, item) => sum + moneyNumber(item.soldToday), 0)),
        paidToday: money(stores.reduce((sum, item) => sum + moneyNumber(item.paidToday), 0)),
        status: stores.every(isDelivered) ? '🟢 ENTREGUE' : '🔴 NÃO ENTREGUE'
      }
    };
  });
}

async function getOperationalInsights(views, coordinators) {
  const now = Date.now();
  if (insightCache && now - insightCache.fetchedAt < 300_000) return insightCache.value;

  const fallback = Object.fromEntries(views.map((view) => [norm(view.name), fallbackInsight(view)]));
  if (!process.env.DEEPSEEK_API_KEY) return fallback;

  try {
    const compact = views.map((view) => ({
      coordinator: view.name,
      projection: coordinators.find((item) => norm(item.name) === norm(view.name))?.projectedPercent || '',
      stores: view.stores.map((store) => ({
        name: store.name,
        projectedPercent: store.projectedPercent,
        dailyGoal: store.dailyGoal,
        soldToday: store.soldToday,
        paidToday: store.paidToday,
        status: store.status
      }))
    }));

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.2,
        max_tokens: 520,
        messages: [
          {
            role: 'system',
            content: 'Você é uma IA operacional da CREDVIX. Responda somente JSON válido, sem markdown. Produza observações factuais, curtas e neutras. Não mande cobrar, priorizar ou tomar decisão. Cada insight deve ter no máximo 280 caracteres.'
          },
          {
            role: 'user',
            content: `Retorne um objeto JSON com as chaves DAIELLY, MARIA FERNANDA e MARIELEN. Para cada chave, escreva um insight operacional curto com o principal padrão observado, um contraste útil e, quando houver, uma referência positiva. Dados: ${JSON.stringify(compact)}`
          }
        ]
      }),
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const json = await response.json();
    const parsed = parseJsonObject(json.choices?.[0]?.message?.content || '');
    const value = { ...fallback, ...normalizeInsights(parsed) };
    insightCache = { fetchedAt: now, value };
    return value;
  } catch {
    insightCache = { fetchedAt: now, value: fallback };
    return fallback;
  }
}

function normalizeInsights(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [key, text] of Object.entries(value)) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (clean) out[norm(key)] = clean;
  }
  return out;
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function fallbackInsight(view) {
  const total = view.stores.length || 1;
  const delivered = view.stores.filter(isDelivered).length;
  const zeroPaid = view.stores.filter((store) => moneyNumber(store.paidToday) <= 0).length;
  const belowProjection = view.stores.filter((store) => percentNumber(store.projectedPercent) < 100).length;
  const best = [...view.stores].sort((a, b) => percentNumber(b.projectedPercent) - percentNumber(a.projectedPercent))[0];
  return `${delivered} de ${total} lojas entregaram a diária no retrato; ${zeroPaid} seguem sem pagamento e ${belowProjection} projetam abaixo de 100%. ${best?.name || 'Sem referência'} apresenta a maior projeção do bloco.`;
}

function readSections(rows, mode) {
  const stores = [];
  let responsible = '';

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] || [];
    const first = String(row[0] || '').trim();
    if (norm(first).startsWith('COORDENACAO ')) {
      responsible = first.replace(/^coordenação\s*/i, '').trim();
      continue;
    }

    const headers = row.map(norm);
    if (headers[0] !== 'LOJA') continue;

    for (let r = index + 1; r < rows.length; r++) {
      const data = rows[r] || [];
      const name = String(data[0] || '').trim();
      if (!name || norm(name).startsWith('COORDENACAO ') || norm(name).startsWith('NOTA TECNICA')) break;
      if (norm(name).startsWith('TOTAL ')) break;

      if (mode === 'daily') {
        stores.push({
          name: cleanStore(name), responsible,
          monthGoal: cell(headers, data, ['META JULHO', 'META']),
          monthRealized: cell(headers, data, ['REALIZADO JULHO', 'REALIZADO']),
          monthPercent: cell(headers, data, ['% ATINGIDO', '%']),
          dailyGoal: cell(headers, data, ['DIARIA']),
          soldToday: cell(headers, data, ['VENDIDO HOJE']),
          paidToday: cell(headers, data, ['PAGO NO RETRATO', 'PAGO HOJE']),
          status: cell(headers, data, ['STATUS']),
          insight: cell(headers, data, ['INSIGHT'])
        });
      } else {
        stores.push({
          name: cleanStore(name), responsible,
          monthRealized: cell(headers, data, ['REALIZADO']),
          monthGoal: cell(headers, data, ['META']),
          projectedPercent: cell(headers, data, ['% PROJETADO', '%']),
          dailyGoal: cell(headers, data, ['DIARIA NECESSARIA DO DIA', 'DIARIA']),
          insurance: cell(headers, data, ['QTD. SEGUROS', 'QTD SEGUROS']),
          insight: cell(headers, data, ['INSIGHT LIGA', 'INSIGHT'])
        });
      }
    }
  }
  return stores;
}

function readUntilBlank(rows, start, headers) {
  const normalized = headers.map(norm);
  const result = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!String(row[0] || '').trim()) break;
    result.push({
      name: String(row[0] || '').trim(),
      realized: cell(normalized, row, ['REALIZADO']),
      goal: cell(normalized, row, ['META']),
      projectedPercent: cell(normalized, row, ['% PROJETADO']),
      dailyGoal: cell(normalized, row, ['DIARIA NECESSARIA DO DIA', 'DIARIA']),
      soldToday: cell(normalized, row, ['VENDIDO HOJE']),
      paidToday: cell(normalized, row, ['PAGO NO RETRATO', 'PAGO HOJE']),
      status: cell(normalized, row, ['STATUS', 'ENTREGA DIARIA HOJE'])
    });
  }
  return result;
}

function findRow(rows, predicate) {
  for (let index = 0; index < rows.length; index++) {
    if (predicate(rows[index] || [])) return { index, row: rows[index] || [] };
  }
  return null;
}

function findUpdatedAt(rows) {
  for (const row of rows.slice(0, 6)) {
    for (const value of row || []) {
      const text = String(value || '').trim();
      if (/atualizado/i.test(text)) return text.replace(/^atualizado\s*(às|as)?\s*/i, '');
    }
  }
  return '--';
}

function cell(headers, row, aliases) {
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

function storeKey(store) { return `${norm(store.responsible)}|${norm(store.name)}`; }
function isDelivered(store) { return norm(store.status).includes('ENTREGUE') && !norm(store.status).includes('NAO ENTREGUE'); }
function dailyPriority(store) {
  const daily = moneyNumber(store.dailyGoal);
  const paid = moneyNumber(store.paidToday);
  const sold = moneyNumber(store.soldToday);
  return (paid <= 0 ? 1_000_000 : 0) + Math.max(0, daily - paid) + Math.max(0, sold - paid) * 0.2;
}
function moneyNumber(value) {
  const number = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}
function percentNumber(value) {
  const number = Number(String(value || '').replace('%', '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : -1;
}
function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}
function cleanStore(value) {
  return String(value || '')
    .replace(/^\d{5}\s*-\s*/i, '')
    .replace(/^help!\s*-?\s*/i, '')
    .replace(/\s+-\s+(ES|BA|MT|MG|DF|GO)\s+-\s+/i, ' • ')
    .replace(/\s+/g, ' ')
    .trim();
}
function titleCase(value) { return String(value).toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase()); }
function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}
