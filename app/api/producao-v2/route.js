import { JWT } from 'google-auth-library';
import { getRadarPayload } from '../../../lib/radar-core';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MANAGEMENT_ID = process.env.MANAGEMENT_SPREADSHEET_ID || '1atj9Gi-2uqsEJB-K3fbivZ8Jn9zoOpeSQRnW6SlnkMY';
let tokenCache = null;

export async function GET(request) {
  const url = new URL(request.url);
  const noCache = url.searchParams.get('refresh') === '1' || url.searchParams.get('cache') === '0';

  try {
    const base = await getRadarPayload({ noCache });
    let operationalStores = [];
    let detailWarning = '';

    try {
      operationalStores = await readOperationalStores();
    } catch (error) {
      detailWarning = error?.message || String(error);
    }

    return Response.json({
      ...base,
      viewVersion: 'RADAR_TV_V2',
      operationalStores,
      detailWarning
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      viewVersion: 'RADAR_TV_V2',
      error: 'RADAR_V2_ERROR',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}

async function readOperationalStores() {
  const values = await getSheetValues("'DIÁRIA ESTÁTICA'!A1:J123");
  const stores = [];
  let responsible = '';

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const first = String(row[0] || '').trim();
    const firstKey = norm(first);
    const headers = row.map(norm);

    if (firstKey.startsWith('COORDENACAO')) {
      responsible = first.replace(/^coordenação\s*/i, '').trim();
      continue;
    }

    if (headers[0] !== 'LOJA' || !headers.includes('VENDIDO HOJE')) continue;

    for (let i = rowIndex + 1; i < values.length; i += 1) {
      const data = values[i] || [];
      const rawName = String(data[0] || '').trim();
      const key = norm(rawName);
      if (!rawName || key.startsWith('COORDENACAO') || key.startsWith('TOTAL')) break;

      const dailyGoal = value(headers, data, ['DIARIA']);
      const soldToday = value(headers, data, ['VENDIDO HOJE']);
      const paidToday = value(headers, data, ['PAGO NO RETRATO', 'PAGO HOJE']);
      const monthGoal = value(headers, data, ['META JULHO', 'META']);
      const monthRealized = value(headers, data, ['REALIZADO JULHO', 'REALIZADO']);
      const paidGap = dailyGoal ? Math.max(0, dailyGoal - paidToday) : null;
      const conversionPending = Math.max(0, soldToday - paidToday);

      stores.push({
        name: cleanStoreName(rawName),
        responsible,
        monthGoal,
        monthGoalFormatted: money(monthGoal),
        monthRealized,
        monthRealizedFormatted: money(monthRealized),
        monthPercent: monthGoal ? Math.round((monthRealized / monthGoal) * 100) : null,
        dailyGoal,
        dailyGoalFormatted: dailyGoal ? money(dailyGoal) : 'Sem diária',
        soldToday,
        soldTodayFormatted: money(soldToday),
        paidToday,
        paidTodayFormatted: money(paidToday),
        paidGap,
        paidGapFormatted: paidGap === null ? 'Sem gap' : money(paidGap),
        soldPercent: dailyGoal ? Math.round((soldToday / dailyGoal) * 100) : null,
        paidPercent: dailyGoal ? Math.round((paidToday / dailyGoal) * 100) : null,
        conversionPending,
        conversionPendingFormatted: money(conversionPending),
        status: statusFor({ dailyGoal, soldToday, paidToday, paidGap })
      });
    }
  }

  return stores;
}

function statusFor({ dailyGoal, soldToday, paidToday, paidGap }) {
  if (soldToday <= 0 && paidToday <= 0) return 'ZERADA';
  if (soldToday > 0 && paidToday <= 0) return 'SEM_PAGO';
  if (!dailyGoal) return 'SEM_META';
  if (paidGap <= 0) return 'ENTREGUE';
  if (paidToday / dailyGoal >= 0.8) return 'PROXIMA';
  return 'ATENCAO';
}

async function getSheetValues(range) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${MANAGEMENT_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Detalhe operacional indisponível: Google Sheets HTTP ${response.status}`);
  const json = await response.json();
  return json.values || [];
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60000) return tokenCache.token;
  const client = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const token = await client.authorize();
  tokenCache = { token: token.access_token, expiresAt: token.expiry_date || now + 3000000 };
  return tokenCache.token;
}

function value(headers, row, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return number(row[index]);
  }
  return 0;
}

function number(input) {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const text = String(input ?? '').trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
    : text.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(input) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(input || 0));
}

function norm(input) {
  return String(input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
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
