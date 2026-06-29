import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AnyRecord = Record<string, unknown>;

type MetricDelta = {
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
};

type Summary = {
  contracts: number;
  production: string;
  averageTicket: string;
  activeStores: number;
  zeroStores: number;
  projection: string;
  goalPercent: number;
};

type StoreRow = {
  position: number;
  name: string;
  contracts: number;
  value: string;
};

type MoverRow = {
  name: string;
  contractsDelta: number;
  valueDelta: string;
};

type RegionalRow = {
  name: string;
  contracts: number;
  production: string;
  averageTicket: string;
  activeStores: number;
  zeroStores: number;
};

type AlertRow = {
  level: 'good' | 'attention' | 'critical' | 'info';
  title: string;
  description: string;
};

type AiReading = {
  generatedAt: string;
  text: string;
  status: 'OK' | 'CACHE' | 'FALLBACK' | 'ERROR';
};

type ProductionPayload = {
  ok: boolean;
  source: 'apps-script' | 'mock' | 'normalized';
  updatedAt: string;
  dateLabel: string;
  summary: Summary;
  deltas: Record<keyof Summary, MetricDelta | undefined>;
  rhythm: {
    label: string;
    description: string;
    percent: number;
    tone: 'positive' | 'negative' | 'neutral';
  };
  aiReading: AiReading;
  topStores: StoreRow[];
  movers: MoverRow[];
  zeroStoresList: string[];
  regionalPerformance: RegionalRow[];
  alerts: AlertRow[];
  ticker: string[];
};

const MOCK_PAYLOAD: ProductionPayload = {
  ok: true,
  source: 'mock',
  updatedAt: '15h10',
  dateLabel: 'HOJE',
  summary: {
    contracts: 42,
    production: 'R$ 186,4 mil',
    averageTicket: 'R$ 4,4 mil',
    activeStores: 26,
    zeroStores: 8,
    projection: 'R$ 310 mil',
    goalPercent: 92
  },
  deltas: {
    contracts: { label: '+8 vs ontem', tone: 'positive' },
    production: { label: '+18% vs ontem', tone: 'positive' },
    averageTicket: { label: '-3% vs ontem', tone: 'negative' },
    activeStores: { label: '+2 vs ontem', tone: 'positive' },
    zeroStores: { label: '+1 vs ontem', tone: 'negative' },
    projection: { label: '92% da meta', tone: 'positive' },
    goalPercent: undefined
  },
  rhythm: {
    label: 'ACIMA DA MEDIA',
    description: '+18% vs ontem no mesmo horario',
    percent: 82,
    tone: 'positive'
  },
  aiReading: {
    generatedAt: '15h10',
    status: 'FALLBACK',
    text: 'O dia esta acima da media em valor produzido e contratos. A producao esta concentrada nas primeiras lojas, com atencao para regionais com lojas zeradas. Prioridade: reduzir lojas sem producao e proteger o ticket medio.'
  },
  topStores: [
    { position: 1, name: 'Vila Velha Centro', contracts: 8, value: 'R$ 42,1 mil' },
    { position: 2, name: 'Cariacica Campo Grande', contracts: 7, value: 'R$ 38,4 mil' },
    { position: 3, name: 'Serra Laranjeiras', contracts: 6, value: 'R$ 31,7 mil' },
    { position: 4, name: 'Linhares Centro', contracts: 5, value: 'R$ 18,9 mil' },
    { position: 5, name: 'Colatina Centro', contracts: 4, value: 'R$ 15,2 mil' },
    { position: 6, name: 'Guarapari Centro', contracts: 3, value: 'R$ 8,7 mil' },
    { position: 7, name: 'Sao Mateus Centro', contracts: 3, value: 'R$ 7,4 mil' },
    { position: 8, name: 'Porto Seguro Centro', contracts: 2, value: 'R$ 6,1 mil' },
    { position: 9, name: 'Cachoeiro Centro', contracts: 2, value: 'R$ 5,8 mil' },
    { position: 10, name: 'Nova Venecia Centro', contracts: 2, value: 'R$ 4,3 mil' }
  ],
  movers: [
    { name: 'Linhares Centro', contractsDelta: 4, valueDelta: 'R$ 9,1 mil' },
    { name: 'Porto Seguro Centro', contractsDelta: 3, valueDelta: 'R$ 7,4 mil' },
    { name: 'Colatina Centro', contractsDelta: 2, valueDelta: 'R$ 5,2 mil' },
    { name: 'Sao Mateus Centro', contractsDelta: 2, valueDelta: 'R$ 4,8 mil' },
    { name: 'Guarapari Centro', contractsDelta: 1, valueDelta: 'R$ 3,1 mil' }
  ],
  zeroStoresList: [
    'Aracruz Centro',
    'Itapemirim Centro',
    'Teixeira de Freitas Centro',
    'Sao Gabriel da Palha Centro',
    'Barra de Sao Francisco Centro',
    'Montanha Centro',
    'Baixo Guandu Centro',
    'Pinheiros Centro'
  ],
  regionalPerformance: [
    { name: 'Daielly', contracts: 16, production: 'R$ 72,3 mil', averageTicket: 'R$ 4,5 mil', activeStores: 10, zeroStores: 2 },
    { name: 'Mayara', contracts: 12, production: 'R$ 58,1 mil', averageTicket: 'R$ 4,8 mil', activeStores: 8, zeroStores: 4 },
    { name: 'Marielen', contracts: 9, production: 'R$ 44,9 mil', averageTicket: 'R$ 5,0 mil', activeStores: 7, zeroStores: 1 },
    { name: 'Alessandro', contracts: 5, production: 'R$ 28,5 mil', averageTicket: 'R$ 5,7 mil', activeStores: 4, zeroStores: 1 },
    { name: 'Outros', contracts: 0, production: 'R$ 7,3 mil', averageTicket: '-', activeStores: 2, zeroStores: 0 }
  ],
  alerts: [
    { level: 'critical', title: 'Lojas zeradas', description: '8 lojas ainda sem producao hoje.' },
    { level: 'attention', title: 'Concentracao', description: 'Top 3 representa parte relevante da producao.' },
    { level: 'info', title: 'Atualizacao', description: 'Ultima carga ha 7 minutos.' },
    { level: 'good', title: 'Boa reacao', description: 'Linhares Centro foi a loja que mais cresceu.' }
  ],
  ticker: [
    'Cada contrato muda o resultado do dia',
    'Prioridade: reduzir lojas zeradas',
    'Acompanhe top lojas e regionais em tempo real'
  ]
};

export async function GET() {
  const appsScriptUrl = process.env.APPS_SCRIPT_PRODUCAO_URL;

  if (!appsScriptUrl) {
    return jsonNoStore(MOCK_PAYLOAD);
  }

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return jsonNoStore({ ...MOCK_PAYLOAD, source: 'mock', warning: `Apps Script respondeu HTTP ${response.status}` });
    }

    const raw = await response.json();
    return jsonNoStore(normalizePayload(raw));
  } catch (error) {
    return jsonNoStore({
      ...MOCK_PAYLOAD,
      source: 'mock',
      warning: error instanceof Error ? error.message : 'Erro desconhecido ao consultar Apps Script'
    });
  }
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

function normalizePayload(raw: unknown): ProductionPayload {
  if (!isRecord(raw)) return MOCK_PAYLOAD;

  const summary = isRecord(raw.summary) ? raw.summary : {};
  const aiReading = isRecord(raw.aiReading) ? raw.aiReading : {};
  const rhythm = isRecord(raw.rhythm) ? raw.rhythm : {};

  return {
    ok: Boolean(raw.ok ?? true),
    source: 'apps-script',
    updatedAt: String(raw.updatedAt ?? currentHourLabel()),
    dateLabel: String(raw.dateLabel ?? 'HOJE'),
    summary: {
      contracts: pickNumber(summary, ['contracts', 'contratos'], MOCK_PAYLOAD.summary.contracts),
      production: pickString(summary, ['production', 'producao'], MOCK_PAYLOAD.summary.production),
      averageTicket: pickString(summary, ['averageTicket', 'ticketMedio'], MOCK_PAYLOAD.summary.averageTicket),
      activeStores: pickNumber(summary, ['activeStores', 'lojasComProducao'], MOCK_PAYLOAD.summary.activeStores),
      zeroStores: pickNumber(summary, ['zeroStores', 'lojasZeradas'], MOCK_PAYLOAD.summary.zeroStores),
      projection: pickString(summary, ['projection', 'projecao'], MOCK_PAYLOAD.summary.projection),
      goalPercent: pickNumber(summary, ['goalPercent', 'percentualMeta'], MOCK_PAYLOAD.summary.goalPercent)
    },
    deltas: isRecord(raw.deltas) ? (raw.deltas as ProductionPayload['deltas']) : MOCK_PAYLOAD.deltas,
    rhythm: {
      label: pickString(rhythm, ['label', 'rotulo'], MOCK_PAYLOAD.rhythm.label),
      description: pickString(rhythm, ['description', 'descricao'], MOCK_PAYLOAD.rhythm.description),
      percent: pickNumber(rhythm, ['percent', 'percentual'], MOCK_PAYLOAD.rhythm.percent),
      tone: pickTone(rhythm, MOCK_PAYLOAD.rhythm.tone)
    },
    aiReading: {
      generatedAt: pickString(aiReading, ['generatedAt', 'geradoEm'], currentHourLabel()),
      text: pickString(aiReading, ['text', 'texto'], MOCK_PAYLOAD.aiReading.text),
      status: pickAiStatus(aiReading, MOCK_PAYLOAD.aiReading.status)
    },
    topStores: normalizeArray(raw.topStores, MOCK_PAYLOAD.topStores) as StoreRow[],
    movers: normalizeArray(raw.movers, MOCK_PAYLOAD.movers) as MoverRow[],
    zeroStoresList: Array.isArray(raw.zeroStoresList) ? raw.zeroStoresList.map(String) : MOCK_PAYLOAD.zeroStoresList,
    regionalPerformance: normalizeArray(raw.regionalPerformance, MOCK_PAYLOAD.regionalPerformance) as RegionalRow[],
    alerts: normalizeArray(raw.alerts, MOCK_PAYLOAD.alerts) as AlertRow[],
    ticker: Array.isArray(raw.ticker) ? raw.ticker.map(String) : MOCK_PAYLOAD.ticker
  };
}

function normalizeArray(value: unknown, fallback: unknown[]) {
  return Array.isArray(value) && value.length ? value : fallback;
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
      const parsed = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function pickTone(source: AnyRecord, fallback: 'positive' | 'negative' | 'neutral') {
  const value = String(source.tone ?? source.tom ?? '').toLowerCase();
  if (value === 'positive' || value === 'negative' || value === 'neutral') return value;
  return fallback;
}

function pickAiStatus(source: AnyRecord, fallback: AiReading['status']) {
  const value = String(source.status ?? '').toUpperCase();
  if (value === 'OK' || value === 'CACHE' || value === 'FALLBACK' || value === 'ERROR') return value;
  return fallback;
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentHourLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h');
}
