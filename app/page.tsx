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
const STORAGE_KEY = 'copa-colmeias-third-place-broadcast-v1';
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

  const rankingWindowLabel = rankingPage === 0 ? '1º ao 5º' : '6º ao 10º';
  const payload = data;
  const match = payload?.matches[0];

  if (!payload && isLoading) {
    return (
      <main className="broadcast-screen broadcast-loading">
        <BroadcastStyle />
        <div className="loader-card">
          <HoneyMark />
          <h1>COPA DAS COLMEIAS</h1>
          <p>Carregando disputa de terceiro lugar...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`broadcast-screen ${activeGoal ? 'goal-active' : ''}`}>
      <BroadcastStyle />
      <div className="broadcast-bg" />
      <div className="broadcast-glow left" />
      <div className="broadcast-glow right" />

      <header className="broadcast-topbar">
        <div className="brand-lockup">
          <HoneyMark />
          <div>
            <h1>COPA DAS COLMEIAS</h1>
            <p>TERCEIRO LUGAR AO VIVO • DISPUTA POR CONTRATOS</p>
          </div>
        </div>
        <LivePill />
        <div className="update-chip">ATUALIZADO ÀS {payload?.updatedAt ?? '--h--'}</div>
      </header>

      <section className="broadcast-stage">
        <div className="field-column">
          <div className="hero-strip">
            <div>
              <span className="eyebrow">DECISÃO DO PÓDIO</span>
              <h2>DISPUTA DE TERCEIRO LUGAR</h2>
              <p>Cuiabá Prainha x Porto Seguro Centro • cada contrato muda o jogo</p>
            </div>
            <strong className="date-badge">{payload?.headlineDate ?? '01/07'}</strong>
          </div>

          {match ? <MatchBoard match={match} /> : <EmptyMatch />}
        </div>

        <aside className="side-panel">
          <div className="side-title"><span /> PAINEL DE PRESSÃO</div>

          <div className="broadcast-card live-card">
            <div className="signal-ring"><i /></div>
            <div>
              <strong>Transmissão interna</strong>
              <small>produção puxada da base oficial.</small>
            </div>
            <LivePill compact />
          </div>

          <div className="ranking-head">
            <h3>TOP 10 GERAL</h3>
            <p><strong>{rankingWindowLabel}</strong> • ranking por <strong>VALOR</strong> produzido</p>
          </div>

          <div key={rankingPage} className="ranking-list-v2">
            {visibleRanking.map((row) => <RankingItem key={`${row.position}-${row.name}`} row={row} />)}
          </div>

          <div className="broadcast-card status-card">
            <div className="mini-monitor"><span /></div>
            <div>
              <strong>PAINEL DA LOJA</strong>
              <small>terceiro lugar em tempo real</small>
            </div>
          </div>
        </aside>
      </section>

      <footer className="broadcast-ticker">
        <div className="ticker-title"><HoneyIcon /><strong>11º AO 20º</strong></div>
        <LivePill compact />
        <div className="ticker-track-v2"><div>{tickerText}</div></div>
        <div className="footer-brand"><strong>CREDVIX</strong><span>•</span>Cada contrato é um gol</div>
      </footer>

      {activeGoal && <GoalOverlay goal={activeGoal} />}
    </main>
  );
}

function MatchBoard({ match }: { match: Match }) {
  const winner = normalizeText(match.advancing);
  const leftWinning = winner.includes(normalizeText(match.left.name).split(' ')[0]);
  const rightWinning = winner.includes(normalizeText(match.right.name).split(' ')[0]);

  return (
    <article className={`match-board ${match.statusType}`}>
      <div className="match-ribbon">{match.id}</div>
      <div className="match-status">{match.status}</div>

      <div className="score-zone">
        <TeamPanel team={match.left} align="left" active={leftWinning} />
        <div className="scorebox">
          <span>{match.leftScore}</span>
          <em>x</em>
          <span>{match.rightScore}</span>
        </div>
        <TeamPanel team={match.right} align="right" active={rightWinning} />
      </div>

      <div className="meta-row-v2">
        <MetaItem label="Situação" value={match.advancing} highlight />
        <MetaItem label="Critério" value={match.criterion} />
        <MetaItem label="Distância" value={match.distance} />
      </div>
    </article>
  );
}

function EmptyMatch() {
  return (
    <article className="match-board value empty-match">
      <div className="match-ribbon">3º LUGAR</div>
      <div className="match-status">AGUARDANDO CONTRATOS</div>
      <div className="score-zone">
        <TeamPanel team={{ name: 'Cuiabá Prainha', primary: 'CUIABÁ', secondary: 'PRAINHA', tone: 'gold', badge: 'city' }} align="left" active={false} />
        <div className="scorebox"><span>0</span><em>x</em><span>0</span></div>
        <TeamPanel team={{ name: 'Porto Seguro Centro', primary: 'PORTO', secondary: 'SEGURO CENTRO', tone: 'blue', badge: 'bridge' }} align="right" active={false} />
      </div>
      <div className="meta-row-v2">
        <MetaItem label="Situação" value="EM ANDAMENTO" highlight />
        <MetaItem label="Critério" value="Empate por valor" />
        <MetaItem label="Distância" value="Aguardando" />
      </div>
    </article>
  );
}

function TeamPanel({ team, align, active }: { team: Team; align: 'left' | 'right'; active: boolean }) {
  return (
    <div className={`team-panel ${align} ${active ? 'active' : ''}`}>
      {align === 'left' && <TeamBadge team={team} />}
      <div className="team-copy">
        <strong>{team.primary}</strong>
        <span className={`tone-${team.tone}`}>{team.secondary}</span>
      </div>
      {align === 'right' && <TeamBadge team={team} />}
    </div>
  );
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <div className={`team-badge-v2 tone-${team.tone}`} aria-label={team.name}>
      {team.badge === 'mountain' && <svg viewBox="0 0 64 64"><path d="M8 45l16-20 10 12 8-8 14 16H8z" /><path d="M8 50c12-5 23 5 34 0 6-3 10-2 14 0" /></svg>}
      {team.badge === 'city' && <svg viewBox="0 0 64 64"><path d="M12 46h40" /><path d="M17 46V30h8v16M29 46V20h8v26M41 46V27h8v19" /><path d="M8 52c10-4 20 4 30 0 8-3 12-2 18 0" /></svg>}
      {team.badge === 'landmark' && <svg viewBox="0 0 64 64"><path d="M12 46h40" /><path d="M22 46V27l10-9 10 9v19" /><path d="M28 46V34h8v12" /><path d="M10 52c9-4 19 4 29 0 7-3 12-2 15 0" /></svg>}
      {team.badge === 'bridge' && <svg viewBox="0 0 64 64"><path d="M10 45h44" /><path d="M16 45c8-22 24-22 32 0" /><path d="M22 45V30M32 45V25M42 45V30" /><path d="M9 52c10-4 20 4 30 0 7-3 12-2 16 0" /></svg>}
    </div>
  );
}

function RankingItem({ row }: { row: RankingRow }) {
  const medal = row.position <= 3 ? 'medal' : '';
  return (
    <div className={`ranking-item-v2 ${medal}`}>
      <span>{row.position}</span>
      <strong>{row.name}</strong>
      <em>{row.value}</em>
    </div>
  );
}

function MetaItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="meta-item-v2">
      <span>{label}</span>
      <strong className={highlight ? 'highlight' : ''}>{value}</strong>
    </div>
  );
}

function LivePill({ compact = false }: { compact?: boolean }) {
  return <span className={`live-pill-v2 ${compact ? 'compact' : ''}`}><i /> AO VIVO</span>;
}

function GoalOverlay({ goal }: { goal: GoalEvent }) {
  return (
    <div className="goal-layer-v2" role="status" aria-live="assertive">
      <div className="goal-card-v2">
        <LivePill compact />
        <h2>GOL!</h2>
        <strong>{goal.teamName} marca!</strong>
        <div><span>PLACAR</span><em>{goal.score}</em></div>
        <p>cada contrato muda o jogo.</p>
      </div>
    </div>
  );
}

function HoneyMark() {
  return <div className="honey-mark"><HoneyIcon /></div>;
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

function BroadcastStyle() {
  return (
    <style jsx global>{`
      .broadcast-screen {
        position: relative;
        width: 100vw;
        height: 100vh;
        min-height: 0;
        overflow: hidden;
        display: grid;
        grid-template-rows: 86px minmax(0, 1fr) 56px;
        color: #f8fbff;
        background:
          radial-gradient(circle at 12% 10%, rgba(255, 148, 28, 0.20), transparent 24%),
          radial-gradient(circle at 85% 22%, rgba(56, 148, 255, 0.18), transparent 27%),
          linear-gradient(180deg, #020812 0%, #06192b 48%, #020912 100%);
        isolation: isolate;
      }

      .broadcast-bg {
        position: absolute;
        inset: 0;
        z-index: -3;
        background-image:
          linear-gradient(120deg, transparent 0 24%, rgba(255,255,255,0.035) 24.2% 24.6%, transparent 24.8% 100%),
          linear-gradient(120deg, transparent 0 66%, rgba(255, 166, 34, 0.06) 66.2% 66.6%, transparent 66.8% 100%),
          radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0);
        background-size: auto, auto, 32px 32px;
        opacity: 0.9;
      }

      .broadcast-glow {
        position: absolute;
        z-index: -2;
        width: 430px;
        height: 430px;
        filter: blur(70px);
        opacity: 0.28;
        pointer-events: none;
      }

      .broadcast-glow.left { left: -120px; top: 120px; background: #ff8a1e; }
      .broadcast-glow.right { right: -150px; top: 120px; background: #287bff; }

      .broadcast-loading { place-items: center; display: grid; }
      .loader-card { width: min(520px, 70vw); padding: 38px 44px; text-align: center; border: 1px solid rgba(255, 189, 46, 0.42); background: rgba(4, 18, 32, 0.92); box-shadow: 0 30px 90px rgba(0,0,0,0.5), inset 0 0 70px rgba(255, 176, 34, 0.06); }
      .loader-card h1 { margin: 14px 0 4px; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 44px; font-style: italic; line-height: 0.9; }
      .loader-card p { margin: 0; color: rgba(255,255,255,0.7); }

      .broadcast-topbar {
        min-height: 0;
        padding: 10px 24px 8px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 178px;
        gap: 14px;
        align-items: start;
        border-bottom: 1px solid rgba(255,255,255,0.09);
        background: linear-gradient(180deg, rgba(2, 9, 17, 0.96), rgba(2, 9, 17, 0.74));
        box-shadow: inset 0 -1px rgba(255, 177, 31, 0.08);
      }

      .brand-lockup { min-width: 0; display: flex; align-items: center; gap: 12px; }
      .honey-mark { flex: 0 0 auto; width: 52px; height: 52px; display: grid; place-items: center; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); border: 2px solid #ffb62c; background: rgba(3, 14, 26, 0.94); box-shadow: 0 0 24px rgba(255, 182, 44, 0.16), inset 0 0 0 5px rgba(255, 182, 44, 0.05); }
      .honey-mark svg { width: 32px; height: 32px; }
      .honey-mark path { fill: none; stroke: #ffbf32; stroke-width: 4; stroke-linejoin: round; }
      .honey-mark path:nth-child(2) { stroke: #ffffff; opacity: 0.85; }
      .honey-mark path:nth-child(3) { opacity: 0.5; }

      .broadcast-topbar h1, .hero-strip h2, .side-title, .ranking-head h3, .team-copy strong, .match-ribbon, .match-status, .ticker-title strong, .goal-card-v2 h2, .status-card strong {
        font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }

      .broadcast-topbar h1 { margin: -2px 0 0; font-size: clamp(34px, 3.2vw, 48px); line-height: 0.84; font-weight: 900; font-style: italic; color: #fff; text-shadow: 0 5px 18px rgba(0,0,0,0.45); }
      .broadcast-topbar p { margin: 5px 0 0; color: #ffc233; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: clamp(12px, 0.95vw, 16px); line-height: 1; font-weight: 900; font-style: italic; letter-spacing: 0.045em; }

      .live-pill-v2 { align-self: start; justify-self: center; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 98px; height: 34px; padding: 0 12px; border-radius: 999px; background: linear-gradient(180deg, #164025, #0e2e1b); border: 1px solid rgba(90, 223, 96, 0.38); color: #fff; font-size: 13px; font-weight: 900; line-height: 1; box-shadow: 0 0 18px rgba(90, 223, 96, 0.12), inset 0 1px rgba(255,255,255,0.08); white-space: nowrap; }
      .live-pill-v2.compact { min-width: 84px; height: 31px; padding: 0 10px; font-size: 12px; gap: 6px; }
      .live-pill-v2 i { width: 10px; height: 10px; border-radius: 50%; background: #55df61; box-shadow: 0 0 0 4px rgba(85, 223, 97, 0.16); animation: livePulse 1.8s infinite ease-in-out; }

      .update-chip { justify-self: end; width: 178px; height: 40px; display: grid; place-items: center; padding: 0 12px; color: rgba(255,255,255,0.92); font-size: 13px; font-weight: 900; white-space: nowrap; border: 1px solid rgba(255, 176, 28, 0.48); background: linear-gradient(135deg, rgba(20, 31, 48, 0.95), rgba(9, 15, 27, 0.95)); clip-path: polygon(8% 0, 100% 0, 95% 100%, 0 100%); }

      .broadcast-stage {
        min-height: 0;
        padding: 10px 22px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 342px;
        gap: 16px;
        overflow: hidden;
      }

      .field-column { min-width: 0; min-height: 0; display: grid; grid-template-rows: 100px minmax(0, 1fr); gap: 14px; }

      .hero-strip { position: relative; min-width: 0; min-height: 0; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid rgba(255,255,255,0.10); background: linear-gradient(135deg, rgba(7, 22, 39, 0.98), rgba(4, 14, 25, 0.95)); clip-path: polygon(2% 0, 98% 0, 100% 50%, 98% 100%, 0 100%, 0 14%); box-shadow: 0 16px 50px rgba(0,0,0,0.25), inset 0 0 60px rgba(24, 104, 212, 0.05), inset 0 0 80px rgba(255, 148, 24, 0.04); overflow: hidden; }
      .hero-strip::before { content: ''; position: absolute; inset: 0 auto auto 0; height: 5px; width: 56%; background: linear-gradient(90deg, #ff951c, #ffcb32, transparent); }
      .hero-strip::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(120deg, transparent 0 64%, rgba(255,255,255,0.06) 64.2% 64.7%, transparent 65% 100%); }
      .eyebrow { display: block; margin-bottom: 4px; color: #ffc233; font-size: 12px; font-weight: 900; letter-spacing: 0.14em; }
      .hero-strip h2 { position: relative; z-index: 1; margin: 0; font-size: clamp(40px, 3.9vw, 56px); line-height: 0.88; font-weight: 900; font-style: italic; color: #fff; text-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      .hero-strip p { position: relative; z-index: 1; margin: 8px 0 0; font-size: 14px; line-height: 1.12; color: rgba(255,255,255,0.78); }
      .date-badge { position: relative; z-index: 1; flex: 0 0 auto; padding: 12px 28px; border: 2px solid #ff9b1f; border-radius: 12px; background: linear-gradient(180deg, rgba(11, 23, 39, 0.96), rgba(5, 13, 23, 0.96)); color: #fff; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 28px; font-weight: 900; font-style: italic; line-height: 1; transform: skewX(-12deg); box-shadow: 0 0 24px rgba(255,155,31,0.12), inset 0 0 20px rgba(255,155,31,0.04); }

      .match-board { position: relative; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) 86px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); border-left: 3px solid rgba(255, 183, 31, 0.9); background: radial-gradient(circle at 50% 50%, rgba(12, 52, 104, 0.12), transparent 52%), linear-gradient(180deg, rgba(4, 20, 38, 0.98), rgba(3, 13, 24, 0.98)); box-shadow: 0 20px 60px rgba(0,0,0,0.32), inset 0 0 80px rgba(255,255,255,0.015), inset 0 0 90px rgba(30, 120, 220, 0.03); clip-path: polygon(1.5% 0, 100% 0, 100% 90%, 98% 100%, 0 100%, 0 6%); }
      .match-board.contracts { border-left-color: rgba(76, 212, 91, 0.8); }
      .match-board::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(255,255,255,0.03), transparent 22% 78%, rgba(255,255,255,0.025)), linear-gradient(120deg, transparent 0 70%, rgba(255, 170, 34, 0.05) 70.2% 70.6%, transparent 70.8% 100%); }

      .match-ribbon { position: absolute; z-index: 3; top: 0; left: 0; width: 116px; height: 42px; display: grid; place-items: center; background: linear-gradient(135deg, #ff9820, #ff6517); color: white; font-size: 28px; font-weight: 900; clip-path: polygon(0 0, 100% 0, 78% 100%, 0 100%); text-shadow: 0 2px rgba(0,0,0,0.25); box-shadow: 0 6px 16px rgba(255, 120, 20, 0.20); }
      .match-status { position: absolute; z-index: 3; top: 18px; right: 0; min-width: 210px; height: 38px; display: grid; place-items: center; padding: 0 18px; font-size: 15px; font-weight: 900; background: linear-gradient(90deg, #ffcd37, #ff9b1e); color: #1f1200; clip-path: polygon(8% 0, 100% 0, 95% 100%, 0 100%); box-shadow: 0 8px 22px rgba(0,0,0,0.18); }
      .contracts .match-status { background: linear-gradient(90deg, #1fbe56, #11763d); color: white; }

      .score-zone { position: relative; z-index: 1; min-height: 0; padding: 48px 30px 14px; display: grid; grid-template-columns: minmax(0, 1fr) 188px minmax(0, 1fr); gap: 16px; align-items: center; }
      .team-panel { min-width: 0; display: flex; align-items: center; gap: 12px; }
      .team-panel.right { justify-content: flex-end; text-align: right; }
      .team-panel.active .team-copy strong { color: #fff8d8; text-shadow: 0 0 18px rgba(255, 203, 61, 0.20), 0 5px 18px rgba(0,0,0,0.45); }
      .team-copy { min-width: 0; }
      .team-copy strong { display: block; color: white; font-size: clamp(32px, 2.9vw, 44px); line-height: 0.88; font-weight: 900; font-style: italic; white-space: nowrap; text-shadow: 0 5px 18px rgba(0,0,0,0.45); }
      .team-copy span { display: block; margin-top: 6px; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: clamp(20px, 1.55vw, 25px); line-height: 0.94; font-weight: 900; font-style: italic; letter-spacing: 0.04em; white-space: nowrap; }
      .tone-green { color: #58c94f; } .tone-blue { color: #4da6ff; } .tone-gold { color: #ffc433; } .tone-orange { color: #ff8d1e; }

      .team-badge-v2 { flex: 0 0 auto; width: 66px; height: 66px; display: grid; place-items: center; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); border: 2px solid currentColor; background: linear-gradient(145deg, rgba(255,255,255,0.2), rgba(255,255,255,0.04)); box-shadow: 0 10px 24px rgba(0,0,0,0.35), 0 0 16px rgba(255,255,255,0.05), inset 0 0 0 4px rgba(0,0,0,0.22), inset 0 0 24px rgba(255,255,255,0.07); }
      .team-badge-v2 svg { width: 42px; height: 42px; }
      .team-badge-v2 path { fill: none; stroke: white; stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.3)); }
      .team-badge-v2.tone-blue { background: linear-gradient(145deg, rgba(60, 148, 234, 0.82), rgba(10, 45, 86, 0.9)); }
      .team-badge-v2.tone-gold { background: linear-gradient(145deg, rgba(255, 194, 42, 0.9), rgba(84, 49, 5, 0.94)); }
      .team-badge-v2.tone-green { background: linear-gradient(145deg, rgba(67, 191, 75, 0.85), rgba(12, 52, 38, 0.9)); }
      .team-badge-v2.tone-orange { background: linear-gradient(145deg, rgba(255, 141, 30, 0.86), rgba(86, 39, 6, 0.92)); }

      .scorebox { position: relative; width: 188px; min-width: 188px; height: 108px; display: flex; align-items: center; justify-content: center; gap: 16px; color: white; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: clamp(78px, 6.8vw, 100px); line-height: 0.78; font-weight: 900; background: linear-gradient(180deg, rgba(7, 13, 22, 0.98), rgba(14, 23, 37, 0.98)); clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%); border: 1px solid rgba(255,255,255,0.10); box-shadow: inset 0 0 40px rgba(255,255,255,0.03), 0 10px 28px rgba(0,0,0,0.25); text-shadow: 0 6px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.5); }
      .scorebox::after { content: ''; position: absolute; left: 22px; right: 22px; top: 0; bottom: 0; pointer-events: none; background: linear-gradient(180deg, rgba(255, 196, 42, 0.7), transparent 6%, transparent 94%, rgba(255, 196, 42, 0.7)); opacity: 0.8; clip-path: inherit; }
      .scorebox em { font-size: 0.47em; font-style: normal; margin-top: 2px; opacity: 0.95; }

      .meta-row-v2 { position: relative; z-index: 1; height: 86px; min-height: 86px; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: stretch; border-top: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(15, 18, 22, 0.36), rgba(9, 15, 21, 0.56)); }
      .meta-item-v2 { min-width: 0; height: 100%; padding: 0 14px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; border-right: 1px solid rgba(255,255,255,0.12); }
      .meta-item-v2:last-child { border-right: 0; }
      .meta-item-v2 span { margin-bottom: 5px; color: rgba(255,255,255,0.58); font-size: 11px; line-height: 1.05; text-transform: uppercase; letter-spacing: 0.04em; }
      .meta-item-v2 strong { color: #fff; font-size: clamp(17px, 1.3vw, 21px); font-weight: 900; line-height: 1.05; white-space: normal; overflow-wrap: anywhere; }
      .meta-item-v2 strong.highlight { color: #ffcb3d; text-shadow: 0 0 14px rgba(255, 203, 61, 0.16); }

      .side-panel { min-width: 0; min-height: 0; padding: 16px 15px 14px; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; gap: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.10); background: radial-gradient(circle at 100% 0%, rgba(255, 157, 28, 0.07), transparent 30%), radial-gradient(circle at 0% 70%, rgba(67, 146, 255, 0.08), transparent 36%), linear-gradient(180deg, rgba(6, 20, 35, 0.98), rgba(3, 12, 22, 0.98)); box-shadow: 0 20px 60px rgba(0,0,0,0.32), inset 0 0 60px rgba(255,255,255,0.015); clip-path: polygon(5% 0, 100% 0, 100% 96%, 96% 100%, 0 100%, 0 5%); }
      .side-title { padding: 2px 0 10px; border-bottom: 1px solid rgba(255,255,255,0.10); color: #ffc633; font-size: 25px; line-height: 0.94; font-weight: 900; font-style: italic; text-shadow: 0 0 14px rgba(255, 198, 51, 0.12); }
      .side-title span { display: inline-block; width: 24px; height: 18px; margin-right: 8px; vertical-align: -2px; background: linear-gradient(120deg, transparent 0 25%, #ff8d1e 25% 35%, transparent 35% 45%, #ff8d1e 45% 55%, transparent 55% 100%); }

      .broadcast-card { border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(135deg, rgba(11, 27, 44, 0.92), rgba(7, 14, 24, 0.94)); box-shadow: inset 0 0 24px rgba(255,255,255,0.015); }
      .live-card { min-height: 0; padding: 12px 13px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; border-color: rgba(255, 40, 96, 0.35); clip-path: polygon(4% 0, 100% 0, 100% 76%, 96% 100%, 0 100%, 0 20%); }
      .signal-ring { width: 28px; height: 28px; display: grid; place-items: center; border: 3px solid rgba(255,255,255,0.9); border-radius: 50%; box-shadow: 0 0 14px rgba(255,255,255,0.18); }
      .signal-ring i { width: 9px; height: 9px; border-radius: 50%; background: #fff; opacity: 0.9; }
      .live-card strong { display: block; color: #fff; font-size: 15px; line-height: 1.02; }
      .live-card small { display: block; margin-top: 3px; color: #ffc633; font-size: 14px; font-weight: 900; line-height: 1.02; }

      .ranking-head h3 { margin: 3px 0; font-size: 27px; line-height: 0.9; font-weight: 900; font-style: italic; color: #fff; }
      .ranking-head p { margin: 0; color: rgba(255,255,255,0.68); font-size: 12px; line-height: 1.08; }

      .ranking-list-v2 { min-height: 0; display: grid; grid-auto-rows: 43px; gap: 7px; align-content: start; overflow: hidden; padding-top: 2px; }
      .ranking-item-v2 { height: 43px; min-height: 43px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 0 10px 0 7px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); background: linear-gradient(90deg, rgba(17, 58, 104, 0.84), rgba(11, 25, 42, 0.96)); box-shadow: 0 8px 18px rgba(0,0,0,0.18), inset 0 1px rgba(255,255,255,0.03); }
      .ranking-item-v2 span { height: 28px; display: grid; place-items: center; border-radius: 999px; color: white; background: linear-gradient(180deg, #4aa8ff, #1d67b4); font-weight: 900; font-size: 14px; box-shadow: 0 0 0 2px rgba(255,255,255,0.04), inset 0 1px rgba(255,255,255,0.16); }
      .ranking-item-v2.medal span { background: linear-gradient(180deg, #5ed45a, #2f8f34); }
      .ranking-item-v2 strong { min-width: 0; color: #fff; font-size: 12px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ranking-item-v2 em { color: #55e069; font-size: 12px; font-weight: 900; font-style: normal; white-space: nowrap; }

      .status-card { min-height: 56px; padding: 11px 14px; display: flex; align-items: center; gap: 12px; border-color: rgba(255, 162, 28, 0.34); background: linear-gradient(135deg, rgba(9, 18, 31, 0.98), rgba(13, 19, 30, 0.88)); clip-path: polygon(5% 0, 100% 0, 100% 80%, 96% 100%, 0 100%, 0 22%); }
      .mini-monitor { flex: 0 0 auto; width: 38px; height: 30px; position: relative; border: 3px solid #ffb62c; border-radius: 4px; box-shadow: 0 0 16px rgba(255,178,30,0.18); }
      .mini-monitor::before { content: ''; position: absolute; left: 11px; right: 11px; bottom: -12px; height: 8px; border-bottom: 4px solid #ffb62c; border-left: 3px solid transparent; border-right: 3px solid transparent; }
      .mini-monitor span { position: absolute; left: 8px; right: 8px; bottom: 6px; height: 16px; background: linear-gradient(145deg, transparent 0 40%, #ff8d1e 41% 46%, transparent 47% 100%), linear-gradient(90deg, transparent 0 10%, #ff8d1e 11% 18%, transparent 19% 40%, #ff8d1e 41% 48%, transparent 49% 70%, #ff8d1e 71% 78%, transparent 79% 100%); }
      .status-card strong { display: block; color: #fff; font-size: 18px; font-weight: 900; font-style: italic; line-height: 0.92; }
      .status-card small { display: block; margin-top: 4px; color: rgba(255,255,255,0.72); font-size: 12px; line-height: 1.05; font-style: italic; }

      .broadcast-ticker { min-height: 0; height: 56px; display: grid; grid-template-columns: 152px 92px minmax(0, 1fr) 190px; align-items: center; gap: 10px; padding: 0 18px; overflow: hidden; border-top: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(4, 12, 22, 0.98), rgba(2, 8, 16, 0.98)); box-shadow: inset 0 1px rgba(255, 177, 29, 0.05), 0 -14px 40px rgba(0,0,0,0.24); }
      .ticker-title { height: 40px; padding: 0 13px; display: flex; align-items: center; gap: 8px; border-left: 4px solid #ff8d1e; border-right: 4px solid #ff8d1e; background: linear-gradient(135deg, rgba(12, 25, 40, 0.98), rgba(8, 16, 27, 0.94)); clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%); }
      .ticker-title svg { width: 20px; height: 20px; flex: 0 0 auto; }
      .ticker-title path { fill: none; stroke: #ffb62c; stroke-width: 4; stroke-linejoin: round; }
      .ticker-title strong { color: #fff; font-size: 17px; font-weight: 900; font-style: italic; white-space: nowrap; }
      .ticker-track-v2 { min-width: 0; height: 100%; display: flex; align-items: center; overflow: hidden; mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent); }
      .ticker-track-v2 div { flex: 0 0 auto; min-width: max-content; white-space: nowrap; color: rgba(255,255,255,0.82); font-size: 13px; font-weight: 800; animation: ticker 34s linear infinite; }
      .footer-brand { justify-self: end; color: rgba(255,255,255,0.64); font-size: 12px; white-space: nowrap; }
      .footer-brand strong { color: #ffb328; margin-right: 8px; }
      .footer-brand span { margin: 0 8px; color: #ffc633; }

      .goal-active .broadcast-topbar, .goal-active .broadcast-stage, .goal-active .broadcast-ticker { filter: brightness(0.46) blur(1.2px); }
      .goal-layer-v2 { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: radial-gradient(circle at 50% 50%, rgba(255, 184, 30, 0.13), rgba(0,0,0,0.72) 62%, rgba(0,0,0,0.84)); animation: overlayIn 360ms ease-out both; }
      .goal-card-v2 { width: min(880px, 72vw); min-height: 420px; padding: 58px 64px 46px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border: 1px solid rgba(255, 194, 42, 0.72); background: radial-gradient(circle at 50% 5%, rgba(255, 194, 42, 0.17), transparent 28%), linear-gradient(135deg, rgba(4,16,28,0.98), rgba(5,13,22,0.98)); clip-path: polygon(11% 0, 91% 0, 100% 18%, 94% 100%, 7% 100%, 0 79%, 5% 15%); box-shadow: 0 0 90px rgba(255, 178, 30, 0.26), 0 34px 120px rgba(0,0,0,0.64); }
      .goal-card-v2 h2 { margin: 20px 0 8px; color: #ffc633; font-size: 132px; font-weight: 900; font-style: italic; line-height: 0.78; text-shadow: 0 0 28px rgba(255, 198, 51, 0.22); }
      .goal-card-v2 > strong { color: #fff; font-size: 34px; }
      .goal-card-v2 div span { display: block; margin-top: 24px; color: rgba(255,255,255,0.64); font-size: 16px; font-weight: 900; letter-spacing: 0.12em; }
      .goal-card-v2 div em { display: block; color: #fff; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 72px; font-style: italic; font-weight: 900; line-height: 0.9; }
      .goal-card-v2 p { margin: 18px 0 0; color: rgba(255,255,255,0.72); }

      @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes livePulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.72); opacity: 0.65; } }
      @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

      @media (max-width: 1366px) {
        .broadcast-stage { grid-template-columns: minmax(0, 1fr) 332px; gap: 14px; }
        .hero-strip { height: 96px; padding-left: 28px; padding-right: 28px; }
        .field-column { grid-template-rows: 96px minmax(0, 1fr); }
        .hero-strip h2 { font-size: 48px; }
        .score-zone { grid-template-columns: minmax(0, 1fr) 176px minmax(0, 1fr); padding-left: 26px; padding-right: 26px; }
        .scorebox { width: 176px; min-width: 176px; height: 102px; font-size: 84px; }
        .team-copy strong { font-size: 38px; }
        .team-copy span { font-size: 21px; }
        .team-badge-v2 { width: 60px; height: 60px; }
        .ranking-item-v2 strong { font-size: 11.5px; }
        .broadcast-ticker { grid-template-columns: 145px 88px minmax(0, 1fr) 180px; }
      }
    `}</style>
  );
}
