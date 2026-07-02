import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Tone = 'positive' | 'negative' | 'neutral';
type AlertLevel = 'good' | 'attention' | 'critical' | 'info';
type CacheState = 'hit' | 'stale' | 'miss' | 'mock';

type Summary = {
  contractsToday: number;
  productionToday: number;
  productionTodayFormatted: string;
  averageTicket: number;
  averageTicketFormatted: string;
  activeStores: number;
  totalStores: number;
  zeroStores: number;
  projection: number;
  projectionFormatted: string;
  goalPercent: number;
};

type ComparisonBlock = {
  contracts?: number;
  production?: number;
  productionFormatted?: string;
  productionDeltaPercent?: number;
  contractsAverage?: number;
  productionAverage?: number;
  productionAverageFormatted?: string;
};

type StoreRow = {
  position: number;
  name: string;
  regional: string;
  contracts: number;
  production: number;
  averageTicket: number;
  productionFormatted: string;
  averageTicketFormatted: string;
};

type ConsultantRow = {
  position: number;
  name: string;
  store: string;
  regional: string;
  contracts: number;
  production: number;
  averageTicket: number;
  productionFormatted: string;
  averageTicketFormatted: string;
};

type RegionalRow = {
  name: string;
  contracts: number;
  production: number;
  productionFormatted: string;
  averageTicket: number;
  averageTicketFormatted: string;
  activeStores: number;
  totalStores: number;
  zeroStores: number;
};

type HourlyRow = {
  hour: string;
  contracts: number;
  production: number;
  productionFormatted: string;
  accumulatedContracts: number;
  accumulatedProduction: number;
  accumulatedProductionFormatted: string;
};

type AlertRow = {
  level: AlertLevel;
  title: string;
  description: string;
};

type AiReading = {
  generatedAt: string;
  text: string;
  status: string;
};

type RadarPayload = {
  ok: boolean;
  source: string;
  version: string;
  updatedAt: string;
  date: string;
  cache?: boolean;
  summary: Summary;
  comparisons: {
    yesterday: ComparisonBlock;
    sevenDayAverage: ComparisonBlock;
  };
  rhythm: {
    label: string;
    tone: Tone;
    percent: number;
    description: string;
  };
  hourlyEvolution: HourlyRow[];
  topStores: StoreRow[];
  topConsultants: ConsultantRow[];
  regionalPerformance: RegionalRow[];
  alerts: AlertRow[];
  aiReading: AiReading;
  ticker: string[];
  diagnostics?: {
    cache: CacheState;
    responseMs: number;
    fetchedAt?: string;
    warning?: string;
  };
  warning?: string;
};

type AnyRecord = Record<string, unknown>;

const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 8 * 60_000;
const FETCH_TIMEOUT_MS = 22_000;

let memoryCache: {
  payload: RadarPayload;
  fetchedAt: number;
} | null = null;

let refreshPromise: Promise<RadarPayload> | null = null;

const MOCK_PAYLOAD: RadarPayload = {
  ok: true,
  source: 'mock',
  version: 'RADAR_MOCK',
  updatedAt: '13h00',
  date: new Intl.DateTimeFormat('pt-BR').format(new Date()),
  summary: {
    contractsToday: 51,
    productionToday: 60444.19,
    productionTodayFormatted: 'R$ 60.444,19',
    averageTicket: 1185.18,
    averageTicketFormatted: 'R$ 1.185,18',
    activeStores: 21,
    totalStores: 34,
    zeroStores: 13,
    projection: 118690.41,
    projectionFormatted: 'R$ 118.690,41',
    goalPercent: 35
  },
  comparisons: {
    yesterday: {
      contracts: 64,
      production: 77161.24,
      productionFormatted: 'R$ 77.161,24',
      productionDeltaPercent: -22
    },
    sevenDayAverage: {
      contractsAverage: 64,
      productionAverage: 68698.28,
      productionAverageFormatted: 'R$ 68.698,28',
      productionDeltaPercent: -12
    }
  },
  rhythm: {
    label: 'ABAIXO DO RITMO',
    tone: 'negative',
    percent: 35,
    description: '35% da meta projetada do dia'
  },
  hourlyEvolution: [],
  topStores: [
    { position: 1, name: 'Cariacica Campo Grande', regional: 'MARIELEN', contracts: 5, production: 9474, averageTicket: 1894.8, productionFormatted: 'R$ 9.474,00', averageTicketFormatted: 'R$ 1.894,80' },
    { position: 2, name: 'Cuiabá Prainha', regional: 'MARIA FERNANDA', contracts: 3, production: 6994.08, averageTicket: 2331.36, productionFormatted: 'R$ 6.994,08', averageTicketFormatted: 'R$ 2.331,36' },
    { position: 3, name: 'Rondonópolis Centro', regional: 'MARIA FERNANDA', contracts: 4, production: 5976.59, averageTicket: 1494.15, productionFormatted: 'R$ 5.976,59', averageTicketFormatted: 'R$ 1.494,15' }
  ],
  topConsultants: [
    { position: 1, name: 'LARYSSA SOUZA', store: 'Cuiabá Prainha', regional: 'MARIA FERNANDA', contracts: 3, production: 6994.08, averageTicket: 2331.36, productionFormatted: 'R$ 6.994,08', averageTicketFormatted: 'R$ 2.331,36' }
  ],
  regionalPerformance: [
    { name: 'MARIA FERNANDA', contracts: 17, production: 26638.44, productionFormatted: 'R$ 26.638,44', averageTicket: 1566.97, averageTicketFormatted: 'R$ 1.566,97', activeStores: 6, totalStores: 7, zeroStores: 1 },
    { name: 'MARIELEN', contracts: 22, production: 23487.51, productionFormatted: 'R$ 23.487,51', averageTicket: 1067.61, averageTicketFormatted: 'R$ 1.067,61', activeStores: 9, totalStores: 13, zeroStores: 4 },
    { name: 'DAIELLY', contracts: 7, production: 6256.44, productionFormatted: 'R$ 6.256,44', averageTicket: 893.78, averageTicketFormatted: 'R$ 893,78', activeStores: 5, totalStores: 12, zeroStores: 7 }
  ],
  alerts: [
    { level: 'critical', title: 'Lojas zeradas', description: '13 lojas ainda sem produção hoje.' },
    { level: 'critical', title: 'Regional em atenção', description: 'DAIELLY tem 7 lojas zeradas.' }
  ],
  aiReading: {
    status: 'DETERMINISTIC_MVP',
    generatedAt: '13h00',
    text: 'O dia tem 51 contratos e R$ 60.444,19 em produção. O principal ponto de atenção são 13 lojas zeradas.'
  },
  ticker: [
    'Contratos hoje: 51',
    'Produção hoje: R$ 60.444,19',
    'Lojas zeradas: 13'
  ]
};

export async function GET() {
  const startedAt = Date.now();
  const rawUrl = process.env.APPS_SCRIPT_RADAR_TV_URL || process.env.APPS_SCRIPT_PRODUCAO_URL || process.env.APPS_SCRIPT_URL;

  if (!rawUrl) {
    return jsonNoStore(withDiagnostics(MOCK_PAYLOAD, 'mock', startedAt, 'URL do Apps Script não configurada no Vercel.'));
  }

  const appsScriptUrl = normalizeAppsScriptUrl(rawUrl);
  const now = Date.now();
  const cacheAge = memoryCache ? now - memoryCache.fetchedAt : Number.POSITIVE_INFINITY;

  if (memoryCache && cacheAge <= CACHE_TTL_MS) {
    return jsonCached(withDiagnostics(memoryCache.payload, 'hit', startedAt));
  }

  if (memoryCache && cacheAge <= STALE_TTL_MS) {
    void refreshCache(appsScriptUrl);
    return jsonCached(withDiagnostics(memoryCache.payload, 'stale', startedAt));
  }

  try {
    const payload = await refreshCache(appsScriptUrl);
    return jsonCached(withDiagnostics(payload, 'miss', startedAt));
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Erro desconhecido ao consultar o Radar no Apps Script.';

    if (memoryCache) {
      return jsonCached(withDiagnostics(memoryCache.payload, 'stale', startedAt, warning));
    }

    return jsonNoStore(withDiagnostics({ ...MOCK_PAYLOAD, source: 'mock', warning }, 'mock', startedAt, warning));
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

async function refreshCache(appsScriptUrl: string) {
  if (!refreshPromise) {
    refreshPromise = fetchRadarPayload(appsScriptUrl)
      .then((payload) => {
        memoryCache = {
          payload,
          fetchedAt: Date.now()
        };
        return payload;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function fetchRadarPayload(appsScriptUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Apps Script respondeu HTTP ${response.status}`);
    }

    const raw = await response.json();
    const normalized = normalizeRadarPayload(raw);

    if (!normalized.ok) {
      throw new Error('Radar retornou ok=false.');
    }

    return normalized;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRadarPayload(raw: unknown): RadarPayload {
  if (!isRecord(raw)) return MOCK_PAYLOAD;

  const summary = isRecord(raw.summary) ? raw.summary : {};
  const comparisons = isRecord(raw.comparisons) ? raw.comparisons : {};
  const yesterday = isRecord(comparisons.yesterday) ? comparisons.yesterday : {};
  const sevenDayAverage = isRecord(comparisons.sevenDayAverage) ? comparisons.sevenDayAverage : {};
  const rhythm = isRecord(raw.rhythm) ? raw.rhythm : {};
  const aiReading = isRecord(raw.aiReading) ? raw.aiReading : {};

  return {
    ok: Boolean(raw.ok ?? true),
    source: String(raw.source ?? 'apps-script'),
    version: String(raw.version ?? 'RADAR'),
    updatedAt: String(raw.updatedAt ?? currentHourLabel()),
    date: String(raw.date ?? raw.dateLabel ?? new Intl.DateTimeFormat('pt-BR').format(new Date())),
    cache: Boolean(raw.cache ?? false),
    summary: {
      contractsToday: pickNumber(summary, ['contractsToday', 'contracts', 'contratos'], 0),
      productionToday: pickNumber(summary, ['productionToday', 'production', 'producao'], 0),
      productionTodayFormatted: pickString(summary, ['productionTodayFormatted', 'productionFormatted', 'production', 'producao'], 'R$ 0,00'),
      averageTicket: pickNumber(summary, ['averageTicket', 'ticketMedio'], 0),
      averageTicketFormatted: pickString(summary, ['averageTicketFormatted', 'averageTicket', 'ticketMedio'], 'R$ 0,00'),
      activeStores: pickNumber(summary, ['activeStores', 'lojasComProducao'], 0),
      totalStores: pickNumber(summary, ['totalStores', 'lojasTotal'], 0),
      zeroStores: pickNumber(summary, ['zeroStores', 'lojasZeradas'], 0),
      projection: pickNumber(summary, ['projection', 'projecao'], 0),
      projectionFormatted: pickString(summary, ['projectionFormatted', 'projection', 'projecao'], 'R$ 0,00'),
      goalPercent: pickNumber(summary, ['goalPercent', 'percentualMeta'], 0)
    },
    comparisons: {
      yesterday: {
        contracts: pickNumber(yesterday, ['contracts'], 0),
        production: pickNumber(yesterday, ['production'], 0),
        productionFormatted: pickString(yesterday, ['productionFormatted'], 'R$ 0,00'),
        productionDeltaPercent: pickNumber(yesterday, ['productionDeltaPercent'], 0)
      },
      sevenDayAverage: {
        contractsAverage: pickNumber(sevenDayAverage, ['contractsAverage'], 0),
        productionAverage: pickNumber(sevenDayAverage, ['productionAverage'], 0),
        productionAverageFormatted: pickString(sevenDayAverage, ['productionAverageFormatted'], 'R$ 0,00'),
        productionDeltaPercent: pickNumber(sevenDayAverage, ['productionDeltaPercent'], 0)
      }
    },
    rhythm: {
      label: pickString(rhythm, ['label', 'rotulo'], 'EM OBSERVAÇÃO'),
      description: pickString(rhythm, ['description', 'descricao'], ''),
      percent: pickNumber(rhythm, ['percent', 'percentual'], 0),
      tone: pickTone(rhythm, 'neutral')
    },
    hourlyEvolution: normalizeHourlyRows(raw.hourlyEvolution),
    topStores: normalizeStoreRows(raw.topStores),
    topConsultants: normalizeConsultantRows(raw.topConsultants),
    regionalPerformance: normalizeRegionalRows(raw.regionalPerformance),
    alerts: normalizeAlerts(raw.alerts),
    aiReading: {
      generatedAt: pickString(aiReading, ['generatedAt', 'geradoEm'], currentHourLabel()),
      text: pickString(aiReading, ['text', 'texto'], 'Leitura gerencial ainda indisponível.'),
      status: String(aiReading.status ?? 'FALLBACK')
    },
    ticker: Array.isArray(raw.ticker) ? raw.ticker.map(String) : []
  };
}

function normalizeStoreRows(value: unknown): StoreRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const row = isRecord(item) ? item : {};
    return {
      position: pickNumber(row, ['position'], index + 1),
      name: pickString(row, ['name', 'loja'], 'Loja sem nome'),
      regional: pickString(row, ['regional'], ''),
      contracts: pickNumber(row, ['contracts', 'contratos'], 0),
      production: pickNumber(row, ['production', 'producao'], 0),
      averageTicket: pickNumber(row, ['averageTicket', 'ticketMedio'], 0),
      productionFormatted: pickString(row, ['productionFormatted', 'value', 'producao'], 'R$ 0,00'),
      averageTicketFormatted: pickString(row, ['averageTicketFormatted', 'averageTicket'], 'R$ 0,00')
    };
  });
}

function normalizeConsultantRows(value: unknown): ConsultantRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const row = isRecord(item) ? item : {};
    return {
      position: pickNumber(row, ['position'], index + 1),
      name: pickString(row, ['name', 'consultor'], 'Consultor sem nome'),
      store: pickString(row, ['store', 'loja'], ''),
      regional: pickString(row, ['regional'], ''),
      contracts: pickNumber(row, ['contracts', 'contratos'], 0),
      production: pickNumber(row, ['production', 'producao'], 0),
      averageTicket: pickNumber(row, ['averageTicket', 'ticketMedio'], 0),
      productionFormatted: pickString(row, ['productionFormatted', 'value', 'producao'], 'R$ 0,00'),
      averageTicketFormatted: pickString(row, ['averageTicketFormatted', 'averageTicket'], 'R$ 0,00')
    };
  });
}

function normalizeRegionalRows(value: unknown): RegionalRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const row = isRecord(item) ? item : {};
    return {
      name: pickString(row, ['name', 'regional'], 'Regional'),
      contracts: pickNumber(row, ['contracts', 'contratos'], 0),
      production: pickNumber(row, ['production', 'producao'], 0),
      productionFormatted: pickString(row, ['productionFormatted', 'production', 'producao'], 'R$ 0,00'),
      averageTicket: pickNumber(row, ['averageTicket', 'ticketMedio'], 0),
      averageTicketFormatted: pickString(row, ['averageTicketFormatted', 'averageTicket'], 'R$ 0,00'),
      activeStores: pickNumber(row, ['activeStores', 'lojasComProducao'], 0),
      totalStores: pickNumber(row, ['totalStores', 'lojasTotal'], 0),
      zeroStores: pickNumber(row, ['zeroStores', 'lojasZeradas'], 0)
    };
  });
}

function normalizeHourlyRows(value: unknown): HourlyRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const row = isRecord(item) ? item : {};
    return {
      hour: pickString(row, ['hour', 'hora'], ''),
      contracts: pickNumber(row, ['contracts', 'contratos'], 0),
      production: pickNumber(row, ['production', 'producao'], 0),
      productionFormatted: pickString(row, ['productionFormatted', 'producao'], 'R$ 0,00'),
      accumulatedContracts: pickNumber(row, ['accumulatedContracts'], 0),
      accumulatedProduction: pickNumber(row, ['accumulatedProduction'], 0),
      accumulatedProductionFormatted: pickString(row, ['accumulatedProductionFormatted'], 'R$ 0,00')
    };
  });
}

function normalizeAlerts(value: unknown): AlertRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const row = isRecord(item) ? item : {};
    const level = String(row.level ?? 'info').toLowerCase();
    return {
      level: level === 'good' || level === 'attention' || level === 'critical' || level === 'info' ? level : 'info',
      title: pickString(row, ['title', 'titulo'], 'Alerta'),
      description: pickString(row, ['description', 'descricao'], '')
    };
  });
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
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    }
  });
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

function pickString(source: AnyRecord, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return fallback;
}

function pickNumber(source: AnyRecord, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.includes(',')
        ? value.replace(/\./g, '').replace(',', '.')
        : value;
      const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function pickTone(source: AnyRecord, fallback: Tone): Tone {
  const value = String(source.tone ?? source.tom ?? '').toLowerCase();
  if (value === 'positive' || value === 'negative' || value === 'neutral') return value;
  return fallback;
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentHourLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h');
}
