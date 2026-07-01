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
const STORAGE_KEY = 'copa-colmeias-third-place-scores-v2';
const RANKING_ROTATE_MS = 7000;

export default function Home() {
  const [data, setData] = useState<PanelPayload | null>(null);
  const [activeGoal, setActiveGoal] = useState<GoalEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rankingPage, setRankingPage] = useState(0);

  const previousScores = useRef<Record<string, { left: number; right: number }> | null>(null);
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef<PanelPayload | null>(null);

  const showGoal = useCallback((goal: GoalEvent) => {
    setActiveGoal(goal);
    if (goalTimer.current) clearTimeout(goalTimer.current);
    goalTimer.current = setTimeout(() => setActiveGoal(null), 6800);
  }, []);

  const evaluateGoal = useCallback((payload: PanelPayload) => {
    const nextScores: Record<string, { left: number; right: number }> = {};
    const previous = previousScores.current;
    const goals: GoalEvent[] = [];

    payload.matches.forEach((match) => {
      nextScores[match.id] = { left: match.leftScore, right: match.rightScore };
      const before = previous?.[match.id];
      if (!before) return;

      if (match.leftScore > before.left) {
        goals.push({ teamName: match.left.name, score: `${match.leftScore} X ${match.rightScore}`, matchId: match.id });
      }

      if (match.rightScore > before.right) {
        goals.push({ teamName: match.right.name, score: `${match.leftScore} X ${match.rightScore}`, matchId: match.id });
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
  }, [showGoal]);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/placar', { cache: 'no-store' });
      const payload = (await response.json()) as PanelPayload;
      latestData.current = payload;
      setData(payload);
      setIsLoading(false);
      evaluateGoal(payload);
    } catch (error) {
      console.error('Erro ao carregar painel', error);
      setIsLoading(false);
    }
  }, [evaluateGoal]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) previousScores.current = JSON.parse(saved);
    } catch {
      previousScores.current = null;
    }

    loadData();
    const interval = window.setInterval(loadData, POLL_MS);

    return () => {
      window.clearInterval(interval);
      if (goalTimer.current) clearTimeout(goalTimer.current);
    };
  }, [loadData]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'g') return;

      const match = latestData.current?.matches[0];
      showGoal({
        teamName: match?.left.name ?? 'Cuiabá Prainha',
        score: match ? `${match.leftScore} X ${match.rightScore}` : '1 X 0',
        matchId: match?.id ?? 'demo'
      });
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showGoal]);

  const hasRankingSecondPage = (data?.rankingTop.length ?? 0) > 5;

  useEffect(() => {
    if (!hasRankingSecondPage) {
      setRankingPage(0);
      return;
    }

    const interval = window.setInterval(() => {
      setRankingPage((prev) => (prev === 0 ? 1 : 0));
    }, RANKING_ROTATE_MS);

    return () => window.clearInterval(interval);
  }, [hasRankingSecondPage]);

  const tickerText = useMemo(() => {
    if (!data) return '';
    return data.ticker.map((row) => `${row.position}º ${row.name}${row.value ? `  ${row.value}` : ''}`).join('   •   ');
  }, [data]);

  const visibleRanking = useMemo(() => {
    if (!data) return [];
    const start = rankingPage * 5;
    return data.rankingTop.slice(start, start + 5);
  }, [data, rankingPage]);

  const rankingWindowLabel = useMemo(() => (rankingPage === 0 ? '1º ao 5º' : '6º ao 10º'), [rankingPage]);

  if (!data && isLoading) {
    return (
      <main className="screen loading-screen">
        <div className="loader-card">
          <div className="brand-mark mini"><HoneyIcon /></div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>Carregando disputa de terceiro lugar...</p>
        </div>
      </main>
    );
  }

  const payload = data!;

  return (
    <main className={`screen third-place-screen ${activeGoal ? 'goal-active' : ''}`}>
      <style jsx global>{`
        .ranking-list-animated { animation: rankingSwapIn 760ms cubic-bezier(0.18, 0.72, 0.18, 1) both; }
        .ranking-list-animated .ranking-item { animation: rankingItemIn 620ms cubic-bezier(0.18, 0.72, 0.18, 1) both; }
        .ranking-list-animated .ranking-item:nth-child(1) { animation-delay: 0ms; }
        .ranking-list-animated .ranking-item:nth-child(2) { animation-delay: 55ms; }
        .ranking-list-animated .ranking-item:nth-child(3) { animation-delay: 110ms; }
        .ranking-list-animated .ranking-item:nth-child(4) { animation-delay: 165ms; }
        .ranking-list-animated .ranking-item:nth-child(5) { animation-delay: 220ms; }
        @keyframes rankingSwapIn { from { opacity: 0; transform: translateY(10px) scale(0.985); filter: blur(5px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
        @keyframes rankingItemIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }

        .third-place-screen {
          min-height: 0 !important;
          display: grid !important;
          grid-template-rows: 86px minmax(0, 1fr) 54px !important;
          overflow: hidden !important;
        }

        .third-place-screen .topbar {
          height: auto !important;
          min-height: 0 !important;
          padding: 10px 24px 8px !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) auto auto !important;
          align-items: start !important;
          gap: 16px !important;
        }

        .third-place-screen .brand-area { gap: 12px !important; min-width: 0 !important; }
        .third-place-screen .brand-mark { width: 52px !important; height: 52px !important; }
        .third-place-screen .brand-mark svg { width: 32px !important; height: 32px !important; }
        .third-place-screen .topbar h1 { margin: -2px 0 0 !important; font-size: clamp(34px, 3.2vw, 48px) !important; line-height: 0.85 !important; }
        .third-place-screen .topbar p { margin-top: 5px !important; font-size: clamp(12px, 1vw, 16px) !important; line-height: 1 !important; }

        .third-place-screen .live-pill {
          min-width: 98px !important;
          padding: 8px 13px 9px !important;
          font-size: 13px !important;
          gap: 7px !important;
        }

        .third-place-screen .live-pill i { width: 10px !important; height: 10px !important; }

        .third-place-screen .update-box {
          width: 190px !important;
          min-width: 190px !important;
          height: 42px !important;
          padding: 0 14px !important;
          font-size: 13px !important;
          line-height: 1.05 !important;
          text-align: center !important;
          white-space: normal !important;
          overflow: hidden !important;
        }

        .third-place-screen .clock-icon { display: none !important; }

        .third-place-screen .stage {
          height: auto !important;
          min-height: 0 !important;
          padding: 12px 22px 10px !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 330px !important;
          gap: 16px !important;
          overflow: hidden !important;
        }

        .third-place-screen .main-column {
          min-height: 0 !important;
          display: grid !important;
          grid-template-rows: auto minmax(0, 1fr) !important;
          gap: 14px !important;
        }

        .third-place-screen .headline-card {
          min-height: 0 !important;
          height: 102px !important;
          padding: 20px 34px 16px !important;
          align-items: center !important;
          gap: 14px !important;
        }

        .third-place-screen .headline-card h2 { font-size: clamp(40px, 4vw, 56px) !important; line-height: 0.9 !important; }
        .third-place-screen .headline-card p { margin-top: 8px !important; font-size: 15px !important; line-height: 1.12 !important; }
        .third-place-screen .date-pill { padding: 12px 28px !important; font-size: 29px !important; }

        .third-place-screen .matches-stack {
          min-height: 0 !important;
          display: grid !important;
          grid-template-rows: minmax(0, 1fr) !important;
          gap: 0 !important;
        }

        .third-place-screen .match-card {
          min-height: 0 !important;
          height: 100% !important;
          display: grid !important;
          grid-template-rows: minmax(0, 1fr) 86px !important;
          overflow: hidden !important;
        }

        .third-place-screen .match-tab {
          width: 118px !important;
          height: 42px !important;
          font-size: 29px !important;
        }

        .third-place-screen .status-pill {
          top: 18px !important;
          right: 0 !important;
          min-width: 220px !important;
          height: 38px !important;
          font-size: 16px !important;
        }

        .third-place-screen .score-row {
          height: auto !important;
          min-height: 0 !important;
          padding: 48px 34px 12px !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 190px minmax(0, 1fr) !important;
          gap: 18px !important;
          align-items: center !important;
        }

        .third-place-screen .team-block { gap: 12px !important; min-width: 0 !important; }
        .third-place-screen .team-badge { width: 64px !important; height: 64px !important; border-width: 2px !important; }
        .third-place-screen .team-badge svg { width: 42px !important; height: 42px !important; }
        .third-place-screen .team-name strong { font-size: clamp(32px, 3vw, 46px) !important; line-height: 0.9 !important; }
        .third-place-screen .team-name span { margin-top: 6px !important; font-size: clamp(20px, 1.6vw, 26px) !important; line-height: 0.95 !important; }

        .third-place-screen .score-core {
          width: 190px !important;
          min-width: 190px !important;
          height: 112px !important;
          gap: 18px !important;
          font-size: clamp(78px, 7vw, 104px) !important;
        }

        .third-place-screen .score-core em { font-size: 0.48em !important; margin-top: 4px !important; }

        .third-place-screen .match-meta {
          height: 86px !important;
          min-height: 86px !important;
          display: grid !important;
          grid-template-columns: 1fr 1fr 1fr !important;
          align-items: stretch !important;
        }

        .third-place-screen .meta-item {
          height: 100% !important;
          min-width: 0 !important;
          padding: 0 14px !important;
          justify-content: center !important;
          overflow: hidden !important;
        }

        .third-place-screen .meta-item span {
          font-size: 11px !important;
          line-height: 1.05 !important;
          margin-bottom: 5px !important;
        }

        .third-place-screen .meta-item strong {
          margin-top: 0 !important;
          font-size: clamp(17px, 1.35vw, 22px) !important;
          line-height: 1.06 !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          word-break: normal !important;
        }

        .third-place-screen .pressure-panel {
          height: 100% !important;
          min-height: 0 !important;
          padding: 18px 16px 14px !important;
          display: grid !important;
          grid-template-rows: auto auto auto minmax(0, 1fr) auto !important;
          gap: 12px !important;
          overflow: hidden !important;
        }

        .third-place-screen .panel-title { padding: 4px 0 12px !important; font-size: 26px !important; line-height: 0.95 !important; }
        .third-place-screen .panel-title span { width: 25px !important; height: 19px !important; margin-right: 8px !important; }
        .third-place-screen .transmission-card { min-height: 0 !important; padding: 14px 14px !important; grid-template-columns: 38px minmax(0, 1fr) auto !important; gap: 10px !important; }
        .third-place-screen .signal-icon { font-size: 28px !important; }
        .third-place-screen .transmission-card strong { font-size: 16px !important; line-height: 1.05 !important; }
        .third-place-screen .transmission-card small { font-size: 15px !important; line-height: 1.05 !important; }
        .third-place-screen .ranking-heading h3 { font-size: 28px !important; line-height: 0.9 !important; margin: 4px 0 4px !important; }
        .third-place-screen .ranking-heading p { font-size: 13px !important; line-height: 1.1 !important; }
        .third-place-screen .ranking-list { min-height: 0 !important; gap: 9px !important; align-content: start !important; overflow: hidden !important; }
        .third-place-screen .ranking-item { height: 48px !important; grid-template-columns: 38px minmax(0, 1fr) auto !important; gap: 10px !important; padding: 0 10px 0 8px !important; }
        .third-place-screen .rank-badge { height: 30px !important; font-size: 15px !important; }
        .third-place-screen .ranking-item strong { font-size: 12px !important; line-height: 1.05 !important; white-space: normal !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; }
        .third-place-screen .ranking-item em { font-size: 12px !important; }
        .third-place-screen .tv-status-card { min-height: 58px !important; padding: 12px 16px !important; gap: 12px !important; }
        .third-place-screen .monitor-icon { width: 42px !important; height: 34px !important; border-width: 3px !important; }
        .third-place-screen .tv-status-card strong { font-size: 20px !important; }
        .third-place-screen .tv-status-card small { margin-top: 4px !important; font-size: 13px !important; }

        .third-place-screen .ticker-bar {
          position: relative !important;
          left: auto !important;
          right: auto !important;
          bottom: auto !important;
          height: 54px !important;
          display: grid !important;
          grid-template-columns: 170px auto minmax(0, 1fr) 210px !important;
          gap: 10px !important;
          padding: 0 22px !important;
          overflow: hidden !important;
        }

        .third-place-screen .ticker-label { height: 42px !important; padding: 0 14px !important; }
        .third-place-screen .ticker-label strong { font-size: 18px !important; }
        .third-place-screen .ticker-label svg { width: 22px !important; height: 22px !important; }
        .third-place-screen .ticker-content { font-size: 13px !important; }
        .third-place-screen .footer-brand { font-size: 13px !important; }

        @media (max-width: 1366px) {
          .third-place-screen .stage { grid-template-columns: minmax(0, 1fr) 330px !important; gap: 14px !important; }
          .third-place-screen .headline-card h2 { font-size: 50px !important; }
          .third-place-screen .team-name strong { font-size: 38px !important; }
          .third-place-screen .team-name span { font-size: 21px !important; }
          .third-place-screen .score-core { width: 178px !important; min-width: 178px !important; height: 104px !important; font-size: 86px !important; }
          .third-place-screen .score-row { grid-template-columns: minmax(0, 1fr) 178px minmax(0, 1fr) !important; padding-left: 28px !important; padding-right: 28px !important; }
          .third-place-screen .team-badge { width: 60px !important; height: 60px !important; }
          .third-place-screen .pressure-panel { padding-left: 14px !important; padding-right: 14px !important; }
        }
      `}</style>

      <div className="background-grid" />
      <Header updatedAt={payload.updatedAt} />

      <section className="stage">
        <div className="main-column">
          <div className="headline-card">
            <div>
              <h2>DISPUTA DE TERCEIRO LUGAR</h2>
              <p>Cuiabá Prainha x Porto Seguro Centro&nbsp;&nbsp;|&nbsp;&nbsp;cada contrato decide o pódio</p>
            </div>
            <span className="date-pill">{payload.headlineDate}</span>
          </div>

          <div className="matches-stack single-match">
            {payload.matches.slice(0, 1).map((match) => <MatchCard key={match.id} match={match} />)}
          </div>
        </div>

        <aside className="pressure-panel">
          <div className="panel-title"><span /> PAINEL DE PRESSÃO</div>
          <div className="transmission-card">
            <div className="signal-icon">◉</div>
            <div>
              <strong>Transmissão interna</strong>
              <small>contratos atualizados pela base oficial.</small>
            </div>
            <LivePill compact />
          </div>

          <div className="ranking-heading">
            <h3>TOP 10 GERAL</h3>
            <p><strong>{rankingWindowLabel}</strong> • Ranking por <strong>VALOR</strong> produzido.</p>
          </div>

          <div key={rankingPage} className="ranking-list ranking-list-animated">
            {visibleRanking.map((row) => <RankingItem key={`${row.position}-${row.name}`} row={row} />)}
          </div>

          <div className="tv-status-card">
            <div className="monitor-icon"><span /></div>
            <div>
              <strong>PAINEL DA LOJA</strong>
              <small>terceiro lugar em tempo real</small>
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
          <p>TERCEIRO LUGAR AO VIVO • DISPUTA POR CONTRATOS</p>
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
  const winner = normalizeText(match.advancing);
  const leftWinning = winner.includes(normalizeText(match.left.name).split(' ')[0]);
  const rightWinning = winner.includes(normalizeText(match.right.name).split(' ')[0]);

  return (
    <article className={`match-card ${match.statusType}`}>
      <div className="match-tab">{match.id}</div>
      <div className="status-pill">{match.status}</div>
      <div className="score-row">
        <TeamBlock team={match.left} align="left" advancing={leftWinning} />
        <div className="score-core"><span>{match.leftScore}</span><em>x</em><span>{match.rightScore}</span></div>
        <TeamBlock team={match.right} align="right" advancing={rightWinning} />
      </div>
      <div className="match-meta">
        <MetaItem label="Situação" value={match.advancing} highlight />
        <MetaItem label="Critério" value={match.criterion} />
        <MetaItem label="Distância" value={match.distance} highlight={match.distance.includes('+')} />
      </div>
    </article>
  );
}

function TeamBlock({ team, align, advancing }: { team: Team; align: 'left' | 'right'; advancing: boolean }) {
  return (
    <div className={`team-block ${align} ${advancing ? 'advancing' : ''}`}>
      {align === 'left' && <TeamBadge team={team} />}
      <div className="team-name"><strong>{team.primary}</strong><span className={`tone-${team.tone}`}>{team.secondary}</span></div>
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
  return <div className="ranking-item"><span className={`rank-badge ${tone}`}>{row.position}</span><strong>{row.name}</strong><em>{row.value}</em></div>;
}

function MetaItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className="meta-item"><span>{label}</span><strong className={highlight ? 'highlight' : ''}>{value}</strong></div>;
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
        <div className="goal-team-line"><span className="goal-bee">🐝</span><strong>{goal.teamName} marca!</strong></div>
        <div className="goal-score"><span>PLACAR:</span><strong>{goal.score}</strong></div>
        <div className="goal-status"><em><HoneyIcon /></em><span>TERCEIRO LUGAR AO VIVO</span></div>
        <p>cada contrato <strong>muda</strong> o jogo.</p>
      </div>
    </div>
  );
}

function HoneyIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 55 18v28L32 59 9 46V18L32 5Z" /><path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z" /><path d="M13 18 32 7l19 11M13 46l19 11 19-11" /></svg>;
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
