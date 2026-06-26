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
  source: 'apps-script' | 'mock' | 'normalized';
};

const MOCK_PAYLOAD: PanelPayload = {
  ok: true,
  updatedAt: '14h32',
  headlineDate: '30/06',
  source: 'mock',
  matches: [
    {
      id: 'SF1',
      status: 'VANTAGEM POR CONTRATOS',
      statusType: 'contracts',
      left: team('Cariacica Campo Grande', 'green', 'mountain'),
      right: team('Cuiabá Prainha', 'blue', 'city'),
      leftScore: 4,
      rightScore: 2,
      advancing: 'Cariacica Campo Grande',
      criterion: 'Contratos',
      distance: '+2 contratos'
    },
    {
      id: 'SF2',
      status: 'DESEMPATE POR VALOR',
      statusType: 'value',
      left: team('Vitória Praia do Canto', 'gold', 'landmark'),
      right: team('Linhares Centro', 'blue', 'bridge'),
      leftScore: 3,
      rightScore: 3,
      advancing: 'Vitória Praia do Canto',
      criterion: 'Valor produzido',
      distance: 'Empate'
    }
  ],
  rankingTop: [
    { position: 1, name: 'Cuiabá Prainha', value: 'R$ 68,4 mil' },
    { position: 2, name: 'Linhares Centro', value: 'R$ 61,7 mil' },
    { position: 3, name: 'Cariacica C. Grande', value: 'R$ 59,2 mil' },
    { position: 4, name: 'Vitória Praia Canto', value: 'R$ 57,8 mil' },
    { position: 5, name: 'Teixeira de Freitas', value: 'R$ 52,6 mil' }
  ],
  ticker: [
    { position: 10, name: 'Cachoeiro Centro', value: 'R$ 44,3 mil' },
    { position: 11, name: 'Teixeira de Freitas', value: 'R$ 42,9 mil' },
    { position: 12, name: 'Serra Laranjeiras', value: 'R$ 41,8 mil' },
    { position: 13, name: 'Vila Velha Centro', value: '' }
  ]
};

export async function GET() {
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;

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
    const normalized = normalizePayload(raw);
    return jsonNoStore(normalized);
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

function normalizePayload(raw: unknown): PanelPayload {
  if (isRecord(raw) && Array.isArray(raw.matches) && Array.isArray(raw.rankingTop)) {
    return {
      ok: Boolean(raw.ok ?? true),
      updatedAt: String(raw.updatedAt ?? currentHourLabel()),
      headlineDate: String(raw.headlineDate ?? '30/06'),
      source: 'apps-script',
      matches: raw.matches as Match[],
      rankingTop: raw.rankingTop as RankingRow[],
      ticker: Array.isArray(raw.ticker) ? (raw.ticker as RankingRow[]) : []
    };
  }

  if (!isRecord(raw)) return MOCK_PAYLOAD;

  const jogos = Array.isArray(raw.jogos) ? raw.jogos.filter(isRecord) : [];
  const matches = jogos.slice(0, 2).map((jogo, index) => normalizeMatch(jogo, index));

  const rankingSource = firstArray(raw, ['rankingTop', 'top10', 'ranking', 'classificacao', 'rankingGeral']);
  const rankingTop = rankingSource.slice(0, 5).filter(isRecord).map(normalizeRankingRow);
  const ticker = rankingSource.slice(9, 13).filter(isRecord).map(normalizeRankingRow);

  return {
    ok: true,
    updatedAt: String(raw.updatedAt ?? raw.atualizadoAs ?? raw.ultimaAtualizacao ?? currentHourLabel()),
    headlineDate: String(raw.headlineDate ?? raw.dataFinal ?? '30/06'),
    source: 'normalized',
    matches: matches.length ? matches : MOCK_PAYLOAD.matches,
    rankingTop: rankingTop.length ? rankingTop : MOCK_PAYLOAD.rankingTop,
    ticker: ticker.length ? ticker : MOCK_PAYLOAD.ticker
  };
}

function normalizeMatch(jogo: AnyRecord, index: number): Match {
  const leftName = pickString(jogo, ['leftName', 'timeA', 'lojaA', 'mandante', 'casa', 'equipeA', 'nomeLojaA'], MOCK_PAYLOAD.matches[index]?.left.name ?? 'Loja A');
  const rightName = pickString(jogo, ['rightName', 'timeB', 'lojaB', 'visitante', 'fora', 'equipeB', 'nomeLojaB'], MOCK_PAYLOAD.matches[index]?.right.name ?? 'Loja B');
  const leftScore = pickNumber(jogo, ['leftScore', 'scoreA', 'placarA', 'contratosA', 'golsA'], MOCK_PAYLOAD.matches[index]?.leftScore ?? 0);
  const rightScore = pickNumber(jogo, ['rightScore', 'scoreB', 'placarB', 'contratosB', 'golsB'], MOCK_PAYLOAD.matches[index]?.rightScore ?? 0);
  const criterion = pickString(jogo, ['criterion', 'criterio', 'criterioAtual'], leftScore === rightScore ? 'Valor produzido' : 'Contratos');
  const advancing = pickString(jogo, ['advancing', 'classificando', 'classificandoAgora', 'vencedorAtual'], leftScore >= rightScore ? leftName : rightName);
  const distance = pickString(jogo, ['distance', 'distancia'], leftScore === rightScore ? 'Empate' : `${Math.abs(leftScore - rightScore) > 0 ? '+' : ''}${Math.abs(leftScore - rightScore)} contratos`);

  return {
    id: pickString(jogo, ['id', 'fase', 'codigo'], `SF${index + 1}`),
    status: leftScore === rightScore ? 'DESEMPATE POR VALOR' : 'VANTAGEM POR CONTRATOS',
    statusType: leftScore === rightScore ? 'value' : 'contracts',
    left: team(leftName, index === 0 ? 'green' : 'gold', index === 0 ? 'mountain' : 'landmark'),
    right: team(rightName, 'blue', index === 0 ? 'city' : 'bridge'),
    leftScore,
    rightScore,
    advancing,
    criterion,
    distance
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
  const date = new Date();
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(':', 'h');
}
