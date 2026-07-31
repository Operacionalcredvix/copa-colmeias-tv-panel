import { JWT } from 'google-auth-library';
import { getRadarPayload, handleRadarRequest } from '../../../lib/radar-core';
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

  return handleVisualPayload(request);
}

export async function POST(request) {
  return GET(request);
}

async function handleVisualPayload(request) {
  const url = new URL(request.url);
  const noCache = url.searchParams.get('cache') === '0' || url.searchParams.get('refresh') === '1';

  try {
    const [base, values] = await Promise.all([
      getRadarPayload({ noCache }),
      getDailyValues()
    ]);
    const operational = parseDailyOperational(values);
    const payload = patchPayload(base, operational);

    return Response.json(payload, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'RADAR_V15_DATA_ERROR',
      message: error?.message || String(error)
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function getDailyValues() {
  const token = await getAccessToken();
  const range = "'DIÁRIA ESTÁTICA'!A1:J123";
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${MANAGEMENT_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`DIÁRIA ESTÁTICA indisponível: Google Sheets HTTP ${response.status}`);
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

        const monthGoal = value(headers, data, ['META JULHO', 'META']);
        const monthRealized = value(headers, data, ['REALIZADO JULHO', 'REALIZADO']);
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

function patchPayload(base, operational) {
  const total = operational.summary;
  const paidToday = total.paidToday;
  const soldToday = total.soldToday;
  const dailyGoal = total.dailyGoal;
  const dailyGap = Math.max(0, dailyGoal - paidToday);
  const soldGap = Math.max(0, dailyGoal - soldToday);
  const pending = Math.max(0, soldToday - paidToday);
  const monthDelta = total.monthRealized - total.monthGoal;
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
    const delta = item.monthRealized - item.monthGoal;

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
      monthPercent: item.monthPercent,
      monthDelta: delta,
      monthDeltaFormatted: signedMoney(delta),
      projectionGapFormatted: signedMoney(delta),
      zeroCount,
      storeCount: coordinatorStores.length,
      status: item.status,
      risk: zeroCount >= 3 || item.monthPercent < 85 ? 'Risco elevado' : zeroCount > 0 || item.monthPercent < 100 ? 'Atenção' : 'Controlado',
      priority: zeroCount ? 'Atuar nas lojas zeradas' : 'Acompanhar operação',
      diagnosis: `${zeroCount} loja(s) zerada(s) e ${formatPercent(item.monthPercent)} da meta mensal.`
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

  return {
    ...base,
    ok: true,
    viewVersion: 'RADAR_V1_5_MOCK',
    updatedAt: extractHour(operational.updateLabel) || base.updatedAt,
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
      monthPercent: total.monthPercent,
      monthGap: Math.max(0, total.monthGoal - total.monthRealized),
      monthGapFormatted: money(Math.max(0, total.monthGoal - total.monthRealized)),
      projectionFormatted: formatPercent(total.monthPercent),
      projectionGap: monthDelta,
      projectionGapFormatted: signedMoney(monthDelta)
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
      generatedAt: extractHour(operational.updateLabel),
      text: buildDiagnosis(responsiblePerformance),
      priorityResponsible: highestRisk(responsiblePerformance)?.name || ''
    },
    ticker: [
      `Pago hoje: ${money(paidToday)}`,
      `Vendido hoje: ${money(soldToday)}`,
      `Falta hoje: ${money(dailyGap)}`,
      `Projeção do mês: ${formatPercent(total.monthPercent)}`
    ],
    counts: {
      ...(base.counts || {}),
      zeroStores: zeroStores.length,
      operationalStores: operational.stores.length,
      soldActiveStores: operational.stores.filter((store) => store.soldToday > 0).length,
      paidActiveStores: operational.stores.filter((store) => store.paidToday > 0).length
    },
    missingData: []
  };
}

function buildDiagnosis(rows) {
  const risk = highestRisk(rows);
  if (!risk) return 'Sem leitura consolidada por coordenação nesta atualização.';
  return `${risk.name} concentra o maior risco do dia por ${formatPercent(risk.monthPercent)} da meta e ${risk.zeroCount} loja(s) zerada(s).`;
}

function highestRisk(rows) {
  return [...rows].sort((a, b) => {
    const scoreA = (a.monthPercent < 85 ? 1000 : 0) + a.zeroCount * 100 + Math.max(0, 100 - a.monthPercent);
    const scoreB = (b.monthPercent < 85 ? 1000 : 0) + b.zeroCount * 100 + Math.max(0, 100 - b.monthPercent);
    return scoreB - scoreA;
  })[0];
}

function findBaseDate(values) {
  for (const row of values) {
    if (normalize(row?.[0]) === 'DATA BASE') return formatDate(row?.[1]);
  }
  return '';
}

function value(headers, row, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return number(row[index]);
  }
  return 0;
}

function text(headers, row, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return String(row[index] ?? '').trim();
  }
  return '';
}

function number(input) {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const raw = String(input ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(input) {
  const parsed = number(input);
  return Math.abs(parsed) <= 2 ? parsed * 100 : parsed;
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
  const value = Number(input || 0);
  if (Math.abs(value) < 0.005) return 'R$ 0,00';
  return `${value > 0 ? '+' : '-'}${money(Math.abs(value))}`;
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
