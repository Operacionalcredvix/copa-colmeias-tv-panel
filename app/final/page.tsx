'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Tone = 'green' | 'blue' | 'gold' | 'orange';
type Badge = 'mountain' | 'city' | 'landmark' | 'bridge';

type Team = {
  name: string;
  primary: string;
  secondary: string;
  tone: Tone;
  badge: Badge;
};

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
  source?: string;
  warning?: string;
};

type GoalEvent = {
  teamName: string;
  score: string;
  matchId: string;
};

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);
const STORAGE_KEY = 'copa-colmeias-last-scores-v1';
const RANKING_ROTATE_MS = 7000;

export default function FinalPage() {
  const [data, setData] = useState<PanelPayload | null>(null);
  const [activeGoal, setActiveGoal] = useState<GoalEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rankingPage, setRankingPage] = useState(0);

  const previousScores = useRef<Record<string, { left: number; right: number }> | null>(null);
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/placar', { cache: 'no-store' });
      const payload = (await response.json()) as PanelPayload;
      setData(payload);
      setIsLoading(false);
      evaluateGoal(payload);
    } catch (error) {
      console.error('Erro ao carregar painel', error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) previousScores.current = JSON.parse(saved);
    } catch {
      previousScores.current = null;
    }

    loadData();
    const interval = window.setInterval(loadData, POLL_MS);

    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'g') {
        showGoal({ teamName: 'Porto Seguro Centro', score: '3 X 1', matchId: 'demo' });
      }
    };

    window.addEventListener('keydown', handleKey);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', handleKey);
      if (goalTimer.current) clearTimeout(goalTimer.current);
    };
  }, [loadData]);

  const hasRankingSecondPage = (data?.rankingTop.length ?? 0) > 5;

  useEffect(() => {
    if (!hasRankingSecondPage) {
      setRankingPage(0);
      return;
    }

    const interval = window.setInterval(() => {
      setRankingPage((prev) => (prev === 0 ? 1 : 0));
    }, RANKING_ROTATE_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [hasRankingSecondPage]);

  const evaluateGoal = (payload: PanelPayload) => {
    const nextScores: Record<string, { left: number; right: number }> = {};
    const previous = previousScores.current;
    const goals: GoalEvent[] = [];

    payload.matches.forEach((match) => {
      nextScores[match.id] = { left: match.leftScore, right: match.rightScore };
      const before = previous?.[match.id];
      if (!before) return;

      if (match.leftScore > before.left) {
        goals.push({
          teamName: match.left.name,
          score: `${match.leftScore} X ${match.rightScore}`,
          matchId: match.id
        });
      }

      if (match.rightScore > before.right) {
        goals.push({
          teamName: match.right.name,
          score: `${match.leftScore} X ${match.rightScore}`,
          matchId: match.id
        });
      }
    });

    previousScores.current = nextScores;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextScores));
    } catch {
      // Sem efeito critico para TV.
    }

    const lastGoal = goals[goals.length - 1];
    if (lastGoal) showGoal(lastGoal);
  };

  const showGoal = (goal: GoalEvent) => {
    setActiveGoal(goal);
    if (goalTimer.current) clearTimeout(goalTimer.current);
    goalTimer.current = setTimeout(() => setActiveGoal(null), 6800);
  };

  const tickerText = useMemo(() => {
    if (!data) return '';
    return data.ticker
      .map((row) => `${row.position}º ${row.name}${row.value ? `  ${row.value}` : ''}`)
      .join('   •   ');
  }, [data]);

  const visibleRanking = useMemo(() => {
    if (!data) return [];
    const start = rankingPage * 5;
    return data.rankingTop.slice(start, start + 5);
  }, [data, rankingPage]);

  const rankingWindowLabel = useMemo(() => {
    return rankingPage === 0 ? '1º ao 5º' : '6º ao 10º';
  }, [rankingPage]);

  if (!data && isLoading) {
    return (
      <main className="screen loading-screen">
        <div className="loader-card">
          <div className="brand-mark mini"><HoneyIcon /></div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>Carregando placar ao vivo...</p>
        </div>
      </main>
    );
  }

  const payload = data!;

  return (
    <main className={`screen ${activeGoal ? 'goal-active' : ''}`}>
      <style jsx global>{`
        .ranking-list-animated {
          animation: rankingSwapIn 760ms cubic-bezier(0.18, 0.72, 0.18, 1) both;
        }

        .ranking-list-animated .ranking-item {
          animation: rankingItemIn 620ms cubic-bezier(0.18, 0.72, 0.18, 1) both;
        }

        .ranking-list-animated .ranking-item:nth-child(1) { animation-delay: 0ms; }
        .ranking-list-animated .ranking-item:nth-child(2) { animation-delay: 55ms; }
        .ranking-list-animated .ranking-item:nth-child(3) { animation-delay: 110ms; }
        .ranking-list-animated .ranking-item:nth-child(4) { animation-delay: 165ms; }
        .ranking-list-animated .ranking-item:nth-child(5) { animation-delay: 220ms; }

        @keyframes rankingSwapIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
            filter: blur(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes rankingItemIn {
          from {
            opacity: 0;
            transform: translateX(14px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      <div className="background-grid" />
      <Header updatedAt={payload.updatedAt} />

      <section className="stage">
        <div className="main-column">
          <div className="headline-card">
            <div>
              <h2>VALE VAGA NA GRANDE FINAL</h2>
              <p>Placar dos confrontos = contratos&nbsp;&nbsp;|&nbsp;&nbsp;Ranking geral = valor produzido</p>
            </div>
            <span className="date-pill">{payload.headlineDate}</span>
          </div>

          <div className="matches-stack">
            {payload.matches.slice(0, 2).map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>

        <aside className="pressure-panel">
          <div className="panel-title"><span /> PAINEL DE PRESSÃO</div>
          <div className="transmission-card">
            <div className="signal-icon">◉</div>
            <div>
              <strong>Transmissão interna</strong>
              <small>cada contrato muda o jogo.</small>
            </div>
            <LivePill compact />
          </div>

          <div className="ranking-heading">
            <h3>TOP 10 GERAL</h3>
            <p>
              <strong>{rankingWindowLabel}</strong> • Ranking por <strong>VALOR</strong> produzido, não por contratos.
            </p>
          </div>

          <div key={rankingPage} className="ranking-list ranking-list-animated">
            {visibleRanking.map((row) => (
              <RankingItem key={`${row.position}-${row.name}`} row={row} />
            ))}
          </div>

          <div className="tv-status-card">
            <div className="monitor-icon"><span /></div>
            <div>
              <strong>PAINEL DA LOJA</strong>
              <small>exibição interna em tempo real</small>
            </div>
          </div>
        </aside>
      </section>

      <footer className="ticker-bar">
        <div className="ticker-label">
          <HoneyIcon />
          <strong>11º AO 20º</strong>
        </div>
        <LivePill compact />
        <div className="ticker-track" aria-label="Ranking geral do 11º ao 20º lugar">
          <div className="ticker-content">{tickerText}</div>
        </div>
        <div className="footer-brand"><strong>CREDVIX</strong><span>•</span>Cada contrato é um gol</div>
      </footer>

      {activeGoal && <GoalOverlay goal={activeGoal} />}
    </main>
  );
}

function Header({ updatedAt }: { updatedAt: string }) {
  return (
    <header className="topbar">
      <div className="brand-area">
        <div className="brand-mark"><HoneyIcon /></div>
        <div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>SEMIFINAL AO VIVO • DISPUTA POR CONTRATOS</p>
        </div>
      </div>
      <LivePill />
      <div className="update-box">
        <span className="clock-icon">◷</span>
        Atualizado às {updatedAt}
      </div>
    </header>
  );
}

function MatchCard({ match }: { match: Match }) {
  const advancing = normalizeText(match.advancing);
  const leftAdvancing = advancing.includes(normalizeText(match.left.name).split(' ')[0]);
  const rightAdvancing = advancing.includes(normalizeText(match.right.name).split(' ')[0]);

  return (
    <article className={`match-card ${match.statusType}`}>
      <div className="match-tab">{match.id}</div>
      <div className="status-pill">{match.status}</div>

      <div className="score-row">
        <TeamBlock team={match.left} align="left" advancing={leftAdvancing} />
        <div className="score-core">
          <span>{match.leftScore}</span>
          <em>x</em>
          <span>{match.rightScore}</span>
        </div>
        <TeamBlock team={match.right} align="right" advancing={rightAdvancing} />
      </div>

      <div className="match-meta">
        <MetaItem label="Classificando agora" value={match.advancing} highlight />
        <MetaItem label="Critério atual" value={match.criterion} />
        <MetaItem label="Distância" value={match.distance} highlight={match.distance.includes('+')} />
      </div>
    </article>
  );
}

function TeamBlock({ team, align, advancing }: { team: Team; align: 'left' | 'right'; advancing: boolean }) {
  return (
    <div className={`team-block ${align} ${advancing ? 'advancing' : ''}`}>
      {align === 'left' && <TeamBadge team={team} />}
      <div className="team-name">
        <strong>{team.primary}</strong>
        <span className={`tone-${team.tone}`}>{team.secondary}</span>
      </div>
      {align === 'right' && <TeamBadge team={team} />}
    </div>
  );
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <div className={`team-badge tone-${team.tone}`} aria-label={team.name}>
      {team.badge === 'mountain' && <svg viewBox="0 0 64 64"><path d="M8 45l16-20 10 12 8-8 14 16H8z" /><path d="M8 50c12-5 23 5 34 0 6-3 10-2 14 0" /></svg>}
      {team.badge === 'city' && <svg viewBox="0 0 64 64"><path d="M12 46h40" /><path d="M17 46V30h8v16M29 46V20h8v26M41 46V27h8v19" /><path d="M8 52c10-4 20 4 30 0 8-3 12-2 18 0" /></svg>}
      {team.badge === 'landmark' && <svg viewBox="0 0 64 64"><path d="M12 46h40" /><path d="M22 46V27l10-9 10 9v19" /><path d="M28 46V34h8v12" /><path d="M10 52c9-4 19 4 29 0 7-3 12-2 15 0" /></svg>}
      {team.badge === 'bridge' && <svg viewBox="0 0 64 64"><path d="M10 45h44" /><path d="M16 45c8-22 24-22 32 0" /><path d="M22 45V30M32 45V25M42 45V30" /><path d="M9 52c10-4 20 4 30 0 7-3 12-2 16 0" /></svg>}
    </div>
  );
}

function RankingItem({ row }: { row: RankingRow }) {
  const tone = row.position <= 2 ? 'green' : row.position <= 4 ? 'orange' : 'blue';
  return (
    <div className="ranking-item">
      <span className={`rank-badge ${tone}`}>{row.position}</span>
      <strong>{row.name}</strong>
      <em>{row.value}</em>
    </div>
  );
}

function MetaItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="meta-item">
      <span>{label}</span>
      <strong className={highlight ? 'highlight' : ''}>{value}</strong>
    </div>
  );
}

function LivePill({ compact = false }: { compact?: boolean }) {
  return <span className={`live-pill ${compact ? 'compact' : ''}`}><i /> AO VIVO</span>;
}

function GoalOverlay({ goal }: { goal: GoalEvent }) {
  return (
    <div className="goal-layer" role="status" aria-live="assertive">
      <div className="goal-flare one" />
      <div className="goal-flare two" />
      <div className="goal-card">
        <div className="goal-card-edge top" />
        <LivePill compact />
        <h2>GOL!</h2>
        <div className="goal-team-line">
          <span className="goal-bee">🐝</span>
          <strong>{goal.teamName} marca!</strong>
        </div>
        <div className="goal-score">
          <span>PLACAR:</span>
          <strong>{goal.score}</strong>
        </div>
        <div className="goal-status">
          <em><HoneyIcon /></em>
          <span>SEMIFINAL AO VIVO</span>
        </div>
        <p>cada contrato <strong>muda</strong> o jogo.</p>
      </div>
    </div>
  );
}

function HoneyIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 5 55 18v28L32 59 9 46V18L32 5Z" />
      <path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z" />
      <path d="M13 18 32 7l19 11M13 46l19 11 19-11" />
    </svg>
  );
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
