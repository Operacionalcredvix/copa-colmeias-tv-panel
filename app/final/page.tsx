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
const STORAGE_KEY = 'copa-colmeias-final-last-scores-v1';
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
      console.error('Erro ao carregar painel da final', error);
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
        showGoal({ teamName: 'Finalista da Copa', score: '1 X 0', matchId: 'demo-final' });
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
    const finalMatch = getFinalMatch(payload.matches);
    if (!finalMatch) return;

    const nextScores: Record<string, { left: number; right: number }> = {
      [finalMatch.id]: { left: finalMatch.leftScore, right: finalMatch.rightScore }
    };

    const previous = previousScores.current;
    const before = previous?.[finalMatch.id];

    previousScores.current = nextScores;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextScores));
    } catch {
      // Sem efeito critico para TV.
    }

    if (!before) return;

    if (finalMatch.leftScore > before.left) {
      showGoal({
        teamName: finalMatch.left.name,
        score: `${finalMatch.leftScore} X ${finalMatch.rightScore}`,
        matchId: finalMatch.id
      });
      return;
    }

    if (finalMatch.rightScore > before.right) {
      showGoal({
        teamName: finalMatch.right.name,
        score: `${finalMatch.leftScore} X ${finalMatch.rightScore}`,
        matchId: finalMatch.id
      });
    }
  };

  const showGoal = (goal: GoalEvent) => {
    setActiveGoal(goal);
    if (goalTimer.current) clearTimeout(goalTimer.current);
    goalTimer.current = setTimeout(() => setActiveGoal(null), 6800);
  };

  const finalMatch = useMemo(() => {
    if (!data) return null;
    return getFinalMatch(data.matches);
  }, [data]);

  const finalHasPortoSeguro = useMemo(() => {
    if (!finalMatch) return false;
    return isPortoSeguro(finalMatch.left.name) || isPortoSeguro(finalMatch.right.name);
  }, [finalMatch]);

  const finalDate = finalHasPortoSeguro ? '01/07' : '30/06';
  const scheduleNote = finalHasPortoSeguro
    ? 'Data ajustada por feriado municipal em Porto Seguro'
    : 'Data prevista da grande final';

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
          <p>Carregando painel da grande final...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="screen loading-screen">
        <div className="loader-card">
          <div className="brand-mark mini"><HoneyIcon /></div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>Não foi possível carregar os dados da final.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`screen final-screen ${activeGoal ? 'goal-active' : ''}`}>
      <style jsx global>{`
        .final-screen .topbar p {
          color: var(--gold);
        }

        .final-stage {
          position: relative;
          height: calc(100vh - 13.2vh - 70px);
          min-height: 500px;
          padding: 2.2vh 2.75vw 1.7vh;
          display: grid;
          grid-template-columns: minmax(780px, 1fr) minmax(330px, 28vw);
          gap: 2vw;
        }

        .final-main {
          min-width: 0;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 2vh;
        }

        .final-topline {
          min-height: 96px;
          padding: 18px 34px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 24px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: linear-gradient(135deg, rgba(9, 21, 35, 0.96), rgba(2, 8, 18, 0.76));
          clip-path: polygon(2% 0, 97% 0, 100% 50%, 97% 100%, 0 100%, 0 14%);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25), inset 0 0 60px rgba(255, 255, 255, 0.025);
        }

        .final-topline h2 {
          margin: 0;
          font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
          font-size: clamp(46px, 5vw, 84px);
          line-height: 0.86;
          font-weight: 900;
          font-style: italic;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          color: white;
        }

        .final-topline p {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.72);
          font-size: clamp(14px, 1.1vw, 18px);
        }

        .final-date-card {
          min-width: 230px;
          padding: 12px 22px;
          border: 2px solid var(--gold);
          background: rgba(2, 9, 17, 0.72);
          text-align: center;
          transform: skewX(-10deg);
          box-shadow: inset 0 0 40px rgba(255, 194, 42, 0.06);
        }

        .final-date-card strong {
          display: block;
          font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
          font-size: clamp(36px, 3.1vw, 52px);
          font-weight: 900;
          line-height: 0.86;
          color: white;
        }

        .final-date-card span {
          display: block;
          margin-top: 9px;
          color: var(--gold);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.15;
          text-transform: uppercase;
          transform: skewX(10deg);
        }

        .final-card {
          position: relative;
          min-height: 0;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background:
            radial-gradient(circle at 50% 0%, rgba(255, 194, 42, 0.16), transparent 42%),
            linear-gradient(180deg, rgba(7, 20, 34, 0.98), rgba(5, 16, 28, 0.94));
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42), inset 0 0 80px rgba(255, 255, 255, 0.03);
          clip-path: polygon(1.5% 0, 100% 0, 100% 91%, 97.5% 100%, 0 100%, 0 6%);
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr auto;
          padding: 28px 34px 30px;
        }

        .final-card::before {
          content: '';
          position: absolute;
          inset: 0 auto auto 0;
          width: 55%;
          height: 8px;
          background: linear-gradient(90deg, var(--gold), transparent);
        }

        .final-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
          color: rgba(255, 255, 255, 0.74);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.045em;
        }

        .final-status-row strong {
          color: var(--gold);
        }

        .final-score-row {
          display: grid;
          grid-template-columns: minmax(230px, 1fr) minmax(245px, 0.66fr) minmax(230px, 1fr);
          align-items: center;
          gap: 28px;
          min-height: 270px;
        }

        .final-score-row .team-block {
          min-width: 0;
          align-items: center;
          gap: 20px;
        }

        .final-score-row .team-block.left {
          justify-content: flex-start;
        }

        .final-score-row .team-block.right {
          justify-content: flex-end;
        }

        .final-score-row .team-badge {
          width: clamp(82px, 6.5vw, 118px);
          height: clamp(82px, 6.5vw, 118px);
        }

        .final-score-row .team-badge svg {
          width: 66%;
          height: 66%;
        }

        .final-score-row .team-name strong {
          font-size: clamp(46px, 4.7vw, 80px);
          line-height: 0.82;
        }

        .final-score-row .team-name span {
          font-size: clamp(28px, 2.4vw, 44px);
          line-height: 0.95;
        }

        .final-score-core {
          height: clamp(140px, 18vh, 210px);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(14px, 1.6vw, 28px);
          border: 1px solid rgba(255, 194, 42, 0.34);
          background: radial-gradient(circle at 50% 45%, rgba(255, 134, 25, 0.14), rgba(3, 11, 20, 0.86));
          box-shadow: inset 0 0 55px rgba(255, 194, 42, 0.06), 0 22px 60px rgba(0, 0, 0, 0.3);
          clip-path: polygon(9% 0, 91% 0, 100% 50%, 91% 100%, 9% 100%, 0 50%);
        }

        .final-score-core span {
          font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
          font-size: clamp(96px, 11vw, 180px);
          font-weight: 900;
          font-style: italic;
          line-height: 0.82;
          color: white;
          text-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        }

        .final-score-core em {
          font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
          font-size: clamp(36px, 3.4vw, 58px);
          font-weight: 900;
          font-style: italic;
          color: var(--orange);
        }

        .final-meta-grid {
          display: grid;
          grid-template-columns: 1.25fr 0.85fr 0.85fr;
          gap: 14px;
        }

        .final-meta-grid .meta-item {
          min-height: 86px;
        }

        .final-waiting-card {
          min-height: 360px;
          display: grid;
          place-items: center;
          text-align: center;
          color: rgba(255, 255, 255, 0.72);
        }

        .final-waiting-card h3 {
          margin: 0;
          font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
          font-size: clamp(48px, 5vw, 86px);
          font-style: italic;
          text-transform: uppercase;
          color: white;
        }

        .final-ranking-panel .ranking-list-animated {
          animation: rankingSwapIn 760ms cubic-bezier(0.18, 0.72, 0.18, 1) both;
        }

        .final-ranking-panel .ranking-list-animated .ranking-item {
          animation: rankingItemIn 620ms cubic-bezier(0.18, 0.72, 0.18, 1) both;
        }

        .final-ranking-panel .ranking-list-animated .ranking-item:nth-child(1) { animation-delay: 0ms; }
        .final-ranking-panel .ranking-list-animated .ranking-item:nth-child(2) { animation-delay: 55ms; }
        .final-ranking-panel .ranking-list-animated .ranking-item:nth-child(3) { animation-delay: 110ms; }
        .final-ranking-panel .ranking-list-animated .ranking-item:nth-child(4) { animation-delay: 165ms; }
        .final-ranking-panel .ranking-list-animated .ranking-item:nth-child(5) { animation-delay: 220ms; }

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
      <Header updatedAt={data.updatedAt} />

      <section className="final-stage">
        <div className="final-main">
          <div className="final-topline">
            <div>
              <h2>GRANDE FINAL</h2>
              <p>Um jogo. Dois finalistas. Cada contrato pode decidir a Copa das Colmeias.</p>
            </div>
            <div className="final-date-card">
              <strong>{finalDate}</strong>
              <span>{scheduleNote}</span>
            </div>
          </div>

          {finalMatch ? (
            <FinalMatchCard match={finalMatch} />
          ) : (
            <div className="final-card final-waiting-card">
              <div>
                <h3>Aguardando finalistas</h3>
                <p>Assim que a aba de placar receber a linha da FINAL, este painel passa a mostrar o confronto decisivo.</p>
              </div>
            </div>
          )}
        </div>

        <aside className="pressure-panel final-ranking-panel">
          <div className="panel-title"><span /> CAMINHO DO TÍTULO</div>
          <div className="transmission-card">
            <div className="signal-icon">◉</div>
            <div>
              <strong>Final ao vivo</strong>
              <small>vale TV e título da Copa.</small>
            </div>
            <LivePill compact />
          </div>

          <div className="ranking-heading">
            <h3>TOP 10 GERAL</h3>
            <p>
              <strong>{rankingWindowLabel}</strong> • Ranking por <strong>VALOR</strong> produzido.
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
              <strong>DISPUTA FINAL</strong>
              <small>placar principal por contratos</small>
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

function FinalMatchCard({ match }: { match: Match }) {
  const advancing = normalizeText(match.advancing);
  const leftAdvancing = advancing.includes(normalizeText(match.left.name).split(' ')[0]);
  const rightAdvancing = advancing.includes(normalizeText(match.right.name).split(' ')[0]);
  const leaderLabel = match.leftScore === match.rightScore ? 'Decisão parcial por valor' : 'Campeã parcial';
  const status = match.leftScore === match.rightScore ? 'DESEMPATE POR VALOR' : 'VANTAGEM POR CONTRATOS';

  return (
    <article className={`final-card ${match.statusType}`}>
      <div className="final-status-row">
        <span><strong>FINAL</strong> • {status}</span>
        <span>{match.leftScore === match.rightScore ? 'Empate no placar' : match.distance}</span>
      </div>

      <div className="final-score-row">
        <TeamBlock team={match.left} align="left" advancing={leftAdvancing} />
        <div className="final-score-core">
          <span>{match.leftScore}</span>
          <em>x</em>
          <span>{match.rightScore}</span>
        </div>
        <TeamBlock team={match.right} align="right" advancing={rightAdvancing} />
      </div>

      <div className="final-meta-grid">
        <MetaItem label={leaderLabel} value={match.advancing} highlight />
        <MetaItem label="Critério atual" value={match.criterion} />
        <MetaItem label="Distância" value={match.distance} highlight={match.distance.includes('+')} />
      </div>
    </article>
  );
}

function Header({ updatedAt }: { updatedAt: string }) {
  return (
    <header className="topbar">
      <div className="brand-area">
        <div className="brand-mark"><HoneyIcon /></div>
        <div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>GRANDE FINAL AO VIVO • DISPUTA POR CONTRATOS</p>
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
          <span>GRANDE FINAL AO VIVO</span>
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

function getFinalMatch(matches: Match[]) {
  return matches.find((match) => normalizeText(match.id).includes('final')) ?? matches[0] ?? null;
}

function isPortoSeguro(value: string) {
  return normalizeText(value).includes('porto seguro');
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
