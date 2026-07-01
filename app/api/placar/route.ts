import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AnyRecord = Record<string, unknown>;

type Match = {
  id: string;
  status: string;
  statusType: 'contracts' | 'value';
  left: Team;
  right: Team;
  leftScore: number;
  rightScore: number;
  advancing: string;
  criterion: string;
  distance: string;
};

type Team = {
  name: string;
  primary: string;
  secondary: string;
  tone: 'green' | 'blue' | 'gold' | 'orange';
  badge: 'mountain' | 'city' | 'landmark' | 'bridge';
};

type RankingRow = {
  position: number;
  name: string;
  value: string;
};

type PanelPayload = {
  ok: boolean;
  updatedAt: string;
  headlineDate: string;
  matches: Match[];
  rankingTop: RankingRow[];
  ticker: RankingRow[];
  source: 'apps-script' | 'stale' | 'error' | 'normalized';
  warning?: string;
  diagnostics?: {
    cache: 'fresh' | 'stale' | 'error';
    responseMs: number;
    fetchedAt?: string;
  };
};

let lastGoodPayload: {
  payload: PanelPayload;
  fetchedAt: number;
} | null = null;

export async function GET() {
  const startedAt = Date.now();
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;

  if (!appsScriptUrl) {
    return jsonNoStore(errorPayload('APPS_SCRIPT_URL não configurada.', startedAt));
  }

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Apps Script respondeu HTTP ${response.status}`);
    }

    const raw = await response.json();
    const normalized = normalizePayload(raw);

    if (!normalized.ok || !Array.isArray(normalized.matches) || !Array.isArray(normalized.rankingTop)) {
      throw new Error('Payload do Apps Script veio em formato inválido.');
    }

    const payload = withDiagnostics(normalized, 'fresh', startedAt);
    lastGoodPayload = {
      payload,
      fetchedAt: Date.now()
    };

    return jsonNoStore(payload);
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Erro desconhecido ao consultar Apps Script';

    if (lastGoodPayload) {
      return jsonNoStore(withDiagnostics({
        ...lastGoodPayload.payload,
        source: 'stale',
        warning
      }, 'stale', startedAt, lastGoodPayload.fetchedAt));
    }

    return jsonNoStore(errorPayload(warning, startedAt));
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

function errorPayload(warning: string, startedAt: number): PanelPayload {
  return {
    ok: false,
    updatedAt: currentHourLabel(),
    headlineDate: '01/07',
    source: 'error',
    warning,
    matches: [thirdPlaceFallbackMatch()],
    rankingTop: [],
    ticker: [],
    diagnostics: {
      cache: 'error',
      responseMs: Date.now() - startedAt
    }
  };
}

function withDiagnostics(payload: PanelPayload, cache: 'fresh' | 'stale' | 'error', startedAt: number, fetchedAt?: number): PanelPayload {
  return {
    ...payload,
    diagnostics: {
      cache,
      responseMs: Date.now() - startedAt,
      fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : new Date().toISOString()
    }
  };
}

function normalizePayload(raw: unknown): PanelPayload {
  if (isRecord(raw) && Array.isArray(raw.matches) && Array.isArray(raw.rankingTop)) {
    const rawMatches = (raw.matches as unknown[]).filter(isRecord);
    const matches = rawMatches.slice(0, 2).map((match, index) => normalizeMatch(match, index));
    const allRanking = [
      ...(raw.rankingTop as unknown[]).filter(isRecord).map(normalizeRankingRow),
      ...(Array.isArray(raw.ticker) ? (raw.ticker as unknown[]).filter(isRecord).map(normalizeRankingRow) : [])
    ];

    return {
      ok: Boolean(raw.ok ?? true),
      updatedAt: String(raw.updatedAt ?? currentHourLabel()),
      headlineDate: '01/07',
      source: 'apps-script',
      matches: matches.length > 0 ? matches : [thirdPlaceFallbackMatch()],
      rankingTop: allRanking.slice(0, 10),
      ticker: allRanking.slice(10, 20)
    };
  }

  if (!isRecord(raw)) {
    return errorPayload('Payload vazio ou inválido recebido do Apps Script.', Date.now());
  }

  const jogos = Array.isArray(raw.jogos) ? raw.jogos.filter(isRecord) : [];
  const matches = jogos.slice(0, 2).map((jogo, index) => normalizeMatch(jogo, index));

  const rankingSource = firstArray(raw, ['rankingTop', 'top10', 'ranking', 'classificacao', 'rankingGeral']);
  const rankingTop = rankingSource.slice(0, 10).filter(isRecord).map(normalizeRankingRow);
  const ticker = rankingSource.slice(10, 20).filter(isRecord).map(normalizeRankingRow);

  return {
    ok: matches.length > 0 || rankingTop.length > 0,
    updatedAt: String(raw.updatedAt ?? raw.atualizadoAs ?? raw.ultimaAtualizacao ?? currentHourLabel()),
    headlineDate: '01/07',
    source: 'normalized',
    matches: matches.length > 0 ? matches : [thirdPlaceFallbackMatch()],
    rankingTop,
    ticker
  };
}

function normalizeMatch(jogo: AnyRecord, index: number): Match {
  const leftName = pickString(jogo, ['leftName', 'timeA', 'lojaA', 'mandante', 'casa', 'equipeA', 'nomeLojaA'], 'Cuiabá Prainha');
  const rightName = pickString(jogo, ['rightName', 'timeB', 'lojaB', 'visitante', 'fora', 'equipeB', 'nomeLojaB'], 'Porto Seguro Centro');
  const leftScore = pickNumber(jogo, ['leftScore', 'scoreA', 'placarA', 'contratosA', 'golsA'], 0);
  const rightScore = pickNumber(jogo, ['rightScore', 'scoreB', 'placarB', 'contratosB', 'golsB'], 0);
  const tied = leftScore === rightScore;
  const hasProduction = leftScore > 0 || rightScore > 0;
  const rawAdvancing = pickString(jogo, ['advancing', 'classificando', 'classificandoAgora', 'vencedorAtual'], '');
  const advancing = rawAdvancing && rawAdvancing !== 'PENDENTE MANUAL' && rawAdvancing !== 'EM ANDAMENTO'
    ? rawAdvancing
    : tied
      ? 'EM ANDAMENTO'
      : leftScore > rightScore
        ? leftName
        : rightName;

  return {
    id: '3º LUGAR',
    status: tied ? (hasProduction ? 'DESEMPATE POR VALOR' : 'AGUARDANDO CONTRATOS') : 'VANTAGEM POR CONTRATOS',
    statusType: tied ? 'value' : 'contracts',
    left: team(leftName, 'gold', 'city'),
    right: team(rightName, 'blue', 'bridge'),
    leftScore,
    rightScore,
    advancing,
    criterion: tied ? 'Contratos empatados; desempate por valor' : 'Contratos',
    distance: tied ? (hasProduction ? 'Empate em contratos' : 'Aguardando produção') : `${Math.abs(leftScore - rightScore)} contrato${Math.abs(leftScore - rightScore) === 1 ? '' : 's'}`
  };
}

function thirdPlaceFallbackMatch(): Match {
  return {
    id: '3º LUGAR',
    status: 'AGUARDANDO CONTRATOS',
    statusType: 'value',
    left: team('Cuiabá Prainha', 'gold', 'city'),
    right: team('Porto Seguro Centro', 'blue', 'bridge'),
    leftScore: 0,
    rightScore: 0,
    advancing: 'EM ANDAMENTO',
    criterion: 'Contratos; empate por valor',
    distance: 'Aguardando produção'
  };
}

function normalizeRankingRow(row: AnyRecord, index: number): RankingRow {
  return {
    position: pickNumber(row, ['position', 'posicao', 'rank', 'colocacao'], index + 1),
    name: pickString(row, ['name', 'loja', 'equipe', 'unidade'], 'Loja'),
    value: pickString(row, ['value', 'valor', 'producao', 'valorFormatado'], '')
  };
}

function team(name: string, tone: Team['tone'], badge: Team['badge']): Team {
  const parts = name.trim().split(/\s+/);
  const primary = parts.slice(0, 1).join(' ').toUpperCase();
  const secondary = parts.slice(1).join(' ').toUpperCase();
  return { name, primary, secondary, tone, badge };
}

function firstArray(source: AnyRecord, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function pickString(source: AnyRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return fallback;
}

function pickNumber(source: AnyRecord, keys: string[], fallback: number): number {
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

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentHourLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h');
}
