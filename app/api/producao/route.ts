import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FETCH_TIMEOUT_MS = 22000;
const CACHE_TTL_MS = 60000;
const STALE_TTL_MS = 480000;

type CacheState = 'hit' | 'stale' | 'miss' | 'mock';
type AnyRecord = Record<string, unknown>;

type RadarPayload = AnyRecord & {
  ok: boolean;
  source?: string;
  version?: string;
  updatedAt?: string;
  summary?: AnyRecord;
  diagnostics?: AnyRecord;
  warning?: string;
};

let memoryCache: { payload: RadarPayload; fetchedAt: number } | null = null;
let refreshPromise: Promise<RadarPayload> | null = null;

const MOCK_PAYLOAD: RadarPayload = {
  ok: true,
  source: 'mock',
  version: 'RADAR_MOCK',
  updatedAt: currentHourLabel(),
  date: new Intl.DateTimeFormat('pt-BR').format(new Date()),
  summary: {
    contractsToday: 0,
    productionToday: 0,
    productionTodayFormatted: 'R$ 0,00',
    averageTicket: 0,
    averageTicketFormatted: 'R$ 0,00',
    activeStores: 0,
    totalStores: 0,
    zeroStores: 0,
    projection: 0,
    projectionFormatted: 'R$ 0,00',
    goalPercent: 0
  },
  comparisons: {
    yesterday: { contracts: 0, production: 0, productionFormatted: 'R$ 0,00', productionDeltaPercent: 0 },
    sevenDayAverage: { contractsAverage: 0, productionAverage: 0, productionAverageFormatted: 'R$ 0,00', productionDeltaPercent: 0 }
  },
  rhythm: { label: 'SEM DADOS DO RADAR', tone: 'neutral', percent: 0, description: 'A API recebeu payload legado ou a URL do Apps Script ainda não aponta para rota=radar-tv.' },
  hourlyEvolution: [],
  topStores: [],
  topConsultants: [],
  regionalPerformance: [],
  alerts: [
    { level: 'critical', title: 'Radar não conectado', description: 'Atualize a implantação do Apps Script e confira a variável APPS_SCRIPT_RADAR_TV_URL no Vercel.' }
  ],
  aiReading: { generatedAt: currentHourLabel(), text: 'Radar ainda não conectado ao payload novo. A API recebeu dados legados da Copa ou uma URL antiga do Apps Script.', status: 'ERROR' },
  ticker: ['Radar não conectado', 'Verificar Apps Script', 'Verificar variável do Vercel']
};

export async function GET() {
  const startedAt = Date.now();
  const rawUrl = process.env.APPS_SCRIPT_RADAR_TV_URL || process.env.APPS_SCRIPT_PRODUCAO_URL || process.env.APPS_SCRIPT_URL;

  if (!rawUrl) {
    return jsonNoStore(withDiagnostics(MOCK_PAYLOAD, 'mock', startedAt, 'Variável APPS_SCRIPT_RADAR_TV_URL não configurada.'));
  }

  const url = normalizeAppsScriptUrl(rawUrl);
  const now = Date.now();
  const age = memoryCache ? now - memoryCache.fetchedAt : Number.POSITIVE_INFINITY;

  if (memoryCache && age <= CACHE_TTL_MS) {
    return jsonCached(withDiagnostics(memoryCache.payload, 'hit', startedAt));
  }

  if (memoryCache && age <= STALE_TTL_MS) {
    void refreshCache(url);
    return jsonCached(withDiagnostics(memoryCache.payload, 'stale', startedAt));
  }

  try {
    const payload = await refreshCache(url);
    return jsonCached(withDiagnostics(payload, 'miss', startedAt));
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Erro desconhecido ao consultar Apps Script.';
    if (memoryCache) return jsonCached(withDiagnostics(memoryCache.payload, 'stale', startedAt, warning));
    return jsonNoStore(withDiagnostics({ ...MOCK_PAYLOAD, warning }, 'mock', startedAt, warning));
  }
}

async function refreshCache(url: string) {
  if (!refreshPromise) {
    refreshPromise = fetchRadarPayload(url)
      .then((payload) => {
        memoryCache = { payload, fetchedAt: Date.now() };
        return payload;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function fetchRadarPayload(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error(`Apps Script respondeu HTTP ${response.status}`);

    const raw = await response.json();
    const payload = normalizeRadarPayload(raw);

    if (!isRadarPayload(payload)) {
      const detected = describePayload(raw);
      throw new Error(`Apps Script retornou payload legado/inválido (${detected}). A implantação do Web App provavelmente não foi atualizada para o Radar MVP 3.`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAppsScriptUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete('painel');
    url.searchParams.delete('api');
    url.searchParams.set('rota', 'radar-tv');
    return url.toString();
  } catch {
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}rota=radar-tv`;
  }
}

function normalizeRadarPayload(raw: unknown): RadarPayload {
  if (!isRecord(raw)) return { ...MOCK_PAYLOAD, warning: 'Resposta do Apps Script não é JSON válido.' };

  const ticker = Array.isArray(raw.ticker)
    ? raw.ticker.map((item) => typeof item === 'string' ? item : stringifyTickerItem(item))
    : [];

  return {
    ...raw,
    ok: Boolean(raw.ok ?? true),
    version: String(raw.version ?? ''),
    source: String(raw.source ?? 'apps-script'),
    ticker
  };
}

function isRadarPayload(payload: RadarPayload) {
  if (!isRecord(payload.summary)) return false;
  if (!Array.isArray(payload.topStores)) return false;
  if (!Array.isArray(payload.regionalPerformance)) return false;
  return typeof payload.summary.contractsToday === 'number' || typeof payload.summary.productionTodayFormatted === 'string';
}

function describePayload(raw: unknown) {
  if (!isRecord(raw)) return 'não-objeto';
  if (Array.isArray(raw.matches) || Array.isArray(raw.rankingTop)) return 'painel legado da Copa';
  if (!raw.summary) return 'sem summary';
  return 'summary incompatível';
}

function stringifyTickerItem(item: unknown) {
  if (!isRecord(item)) return String(item);
  const position = item.position ? `${item.position}º ` : '';
  const name = item.name ? String(item.name) : '';
  const value = item.value ? ` ${item.value}` : '';
  return `${position}${name}${value}`.trim() || JSON.stringify(item);
}

function jsonCached(payload: unknown) {
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      'CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120'
    }
  });
}

function jsonNoStore(payload: unknown) {
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}

function withDiagnostics(payload: RadarPayload, cache: CacheState, startedAt: number, warning?: string): RadarPayload {
  return {
    ...payload,
    diagnostics: {
      cache,
      responseMs: Date.now() - startedAt,
      fetchedAt: memoryCache ? new Date(memoryCache.fetchedAt).toISOString() : undefined,
      warning
    }
  };
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentHourLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h');
}
