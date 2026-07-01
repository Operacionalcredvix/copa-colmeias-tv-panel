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
const STORAGE_KEY = 'copa-colmeias-third-place-refined-v1';
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
    goalTimer.current = setTimeout(() => setActiveGoal(null), 7200);
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
      // Sem efeito crítico para TV.
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

  const payload = data;
  const match = payload?.matches[0];
  const rankingWindowLabel = rankingPage === 0 ? '1º ao 5º' : '6º ao 10º';
  const hotMatchId = activeGoal?.matchId ?? '';

  if (!payload && isLoading) {
    return (
      <main className="tv-screen loading-view">
        <PanelStyles />
        <div className="loader-card">
          <HoneyMark />
          <h1>COPA DAS COLMEIAS</h1>
          <p>Carregando painel da disputa...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`tv-screen ${activeGoal ? 'goal-active' : ''}`}>
      <PanelStyles />
      <div className="arena-bg" />
      <div className="arena-glow left" />
      <div className="arena-glow right" />

      <header className="topbar-v3">
        <div className="brand-v3">
          <HoneyMark />
          <div>
            <h1>COPA DAS COLMEIAS</h1>
            <p>TERCEIRO LUGAR AO VIVO • DISPUTA POR CONTRATOS</p>
          </div>
        </div>
        <LivePill />
        <div className="update-chip">ATUALIZADO ÀS {payload?.updatedAt ?? '--h--'}</div>
      </header>

      <section className="stage-v3">
        <div className="main-v3">
          <div className="headline-v3">
            <div>
              <span>DECISÃO DO PÓDIO</span>
              <h2>DISPUTA DE TERCEIRO LUGAR</h2>
              <p>Cuiabá Prainha x Porto Seguro Centro • cada contrato muda o jogo</p>
            </div>
            <strong>{payload?.headlineDate ?? '01/07'}</strong>
          </div>

          {match ? <MatchBoard match={match} isHot={hotMatchId === match.id} /> : <EmptyMatch />}
        </div>

        <aside className="pressure-v3">
          <div className="pressure-title"><i /> PAINEL DE PRESSÃO</div>

          <div className="live-card-v3">
            <div className="signal-dot"><i /></div>
            <div>
              <strong>Transmissão interna</strong>
              <small>base oficial em tempo real</small>
            </div>
            <LivePill compact />
          </div>

          <div className="ranking-title">
            <h3>TOP 10 GERAL</h3>
            <p><strong>{rankingWindowLabel}</strong> • ranking por <strong>VALOR</strong> produzido</p>
          </div>

          <div key={rankingPage} className="ranking-list-v3">
            {visibleRanking.map((row) => <RankingItem key={`${row.position}-${row.name}`} row={row} />)}
          </div>

          <div className="status-card-v3">
            <div className="screen-icon"><span /></div>
            <div>
              <strong>PAINEL DA LOJA</strong>
              <small>terceiro lugar em tempo real</small>
            </div>
          </div>
        </aside>
      </section>

      <footer className={`ticker-v3 ${activeGoal ? 'ticker-goal' : ''}`}>
        <div className="ticker-label-v3"><HoneyIcon /><strong>11º AO 20º</strong></div>
        <div className="ticker-track-v3"><div>{tickerText}</div></div>
        <div className="footer-brand"><strong>CREDVIX</strong><span>•</span>Cada contrato é um gol</div>
      </footer>

      {activeGoal && <GoalOverlay goal={activeGoal} />}
    </main>
  );
}

function MatchBoard({ match, isHot }: { match: Match; isHot: boolean }) {
  const winner = normalizeText(match.advancing);
  const leftWinning = winner.includes(normalizeText(match.left.name).split(' ')[0]);
  const rightWinning = winner.includes(normalizeText(match.right.name).split(' ')[0]);
  const totalContracts = match.leftScore + match.rightScore;
  const centerCopy = totalContracts === 0 ? 'AGUARDANDO 1º GOL' : `${totalContracts} contrato${totalContracts === 1 ? '' : 's'} no jogo`;

  return (
    <article className={`match-board-v3 ${match.statusType} ${isHot ? 'contract-event' : ''}`}>
      <div className="field-lines" />
      <div className="match-ribbon">{match.id}</div>
      <div className="match-status">{totalContracts === 0 ? 'AO VIVO • AGUARDANDO PRIMEIRO CONTRATO' : match.status}</div>
      <div className="contract-alert"><span>CONTRATO NO PLACAR</span></div>

      <div className="score-zone-v3">
        <TeamPanel team={match.left} align="left" active={leftWinning} />

        <div className="score-center">
          <div className="scorebox-v3" aria-label={`Placar ${match.leftScore} a ${match.rightScore}`}>
            <ScoreDigit value={match.leftScore} side="left" />
            <em>x</em>
            <ScoreDigit value={match.rightScore} side="right" />
          </div>
          <div className="match-pulse">
            <span>{centerCopy}</span>
            <small>{match.statusType === 'value' ? 'Valor decide em caso de empate' : 'Vantagem definida por contratos'}</small>
          </div>
        </div>

        <TeamPanel team={match.right} align="right" active={rightWinning} />
      </div>

      <div className="meta-row-v3">
        <MetaItem label="Situação" value={match.advancing} highlight />
        <MetaItem label="Critério" value={match.statusType === 'value' ? 'Valor no empate' : match.criterion} />
        <MetaItem label="Diferença" value={totalContracts === 0 ? 'Aguardando 1º gol' : match.distance} />
      </div>
    </article>
  );
}

function EmptyMatch() {
  return (
    <article className="match-board-v3 value">
      <div className="field-lines" />
      <div className="match-ribbon">3º LUGAR</div>
      <div className="match-status">AO VIVO • AGUARDANDO PRIMEIRO CONTRATO</div>
      <div className="score-zone-v3">
        <TeamPanel team={{ name: 'Cuiabá Prainha', primary: 'CUIABÁ', secondary: 'PRAINHA', tone: 'gold', badge: 'city' }} align="left" active={false} />
        <div className="score-center">
          <div className="scorebox-v3"><ScoreDigit value={0} side="left" /><em>x</em><ScoreDigit value={0} side="right" /></div>
          <div className="match-pulse"><span>AGUARDANDO 1º GOL</span><small>Valor decide em caso de empate</small></div>
        </div>
        <TeamPanel team={{ name: 'Porto Seguro Centro', primary: 'PORTO', secondary: 'SEGURO CENTRO', tone: 'blue', badge: 'bridge' }} align="right" active={false} />
      </div>
      <div className="meta-row-v3">
        <MetaItem label="Situação" value="EM ANDAMENTO" highlight />
        <MetaItem label="Critério" value="Valor no empate" />
        <MetaItem label="Diferença" value="Aguardando 1º gol" />
      </div>
    </article>
  );
}

function TeamPanel({ team, align, active }: { team: Team; align: 'left' | 'right'; active: boolean }) {
  return (
    <div className={`team-panel-v3 ${align} ${active ? 'active' : ''}`}>
      {align === 'left' && <StoreCrest team={team} />}
      <div className="team-copy-v3">
        <strong>{team.primary}</strong>
        <span className={`tone-${team.tone}`}>{team.secondary}</span>
      </div>
      {align === 'right' && <StoreCrest team={team} />}
    </div>
  );
}

function StoreCrest({ team }: { team: Team }) {
  const identity = getStoreIdentity(team.name);
  return (
    <div className={`store-crest-v3 ${identity.slug} tone-${team.tone}`} aria-label={`Brasão ${team.name}`}>
      <div className="crest-light" />
      <div className="crest-icon">{identity.slug === 'porto-seguro' ? <PortoSeguroIcon /> : <CuiabaIcon />}</div>
      <strong>{identity.initials}</strong>
      <span>{identity.label}</span>
    </div>
  );
}

function CuiabaIcon() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <path className="icon-main" d="M18 56h44" />
      <path className="icon-main" d="M24 56V41h7v15M36 56V27h8v29M49 56V35h7v21" />
      <path className="icon-accent" d="M17 62c10-4 19 4 30 0 7-3 12-2 17 0" />
      <path className="icon-cell" d="M40 10l10 6v11l-10 6-10-6V16l10-6z" />
    </svg>
  );
}

function PortoSeguroIcon() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <path className="icon-main" d="M18 53h44" />
      <path className="icon-main" d="M23 53c7-20 27-20 34 0" />
      <path className="icon-main" d="M30 53V39M40 53V34M50 53V39" />
      <path className="icon-accent" d="M18 62c10-4 20 4 30 0 7-3 12-2 16 0" />
      <path className="icon-cell" d="M40 12l9 5v10l-9 5-9-5V17l9-5z" />
    </svg>
  );
}

function ScoreDigit({ value, side }: { value: number; side: 'left' | 'right' }) {
  return <span key={`${side}-${value}`} className="score-digit">{value}</span>;
}

function RankingItem({ row }: { row: RankingRow }) {
  return (
    <div className={`ranking-item-v3 rank-${row.position}`}>
      <span>{row.position}</span>
      <strong>{row.name}</strong>
      <em>{row.value}</em>
    </div>
  );
}

function MetaItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="meta-item-v3">
      <span>{label}</span>
      <strong className={highlight ? 'highlight' : ''}>{value}</strong>
    </div>
  );
}

function LivePill({ compact = false }: { compact?: boolean }) {
  return <span className={`live-pill-v3 ${compact ? 'compact' : ''}`}><i /> AO VIVO</span>;
}

function GoalOverlay({ goal }: { goal: GoalEvent }) {
  return (
    <div className="goal-layer-v3" role="status" aria-live="assertive">
      <div className="goal-burst" />
      <div className="goal-particles">{Array.from({ length: 14 }).map((_, index) => <span key={index} />)}</div>
      <div className="goal-card-v3">
        <LivePill compact />
        <div className="goal-kicker">ATUALIZAÇÃO DE PRODUÇÃO</div>
        <h2>GOL!</h2>
        <strong>{goal.teamName} marca no placar</strong>
        <div className="goal-scoreline"><span>PLACAR AGORA</span><em>{goal.score}</em></div>
        <p>contrato confirmado na base oficial da Copa das Colmeias.</p>
      </div>
    </div>
  );
}

function HoneyMark() {
  return <div className="honey-mark-v3"><HoneyIcon /></div>;
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

function getStoreIdentity(name: string) {
  const normalized = normalizeText(name);
  if (normalized.includes('porto')) return { slug: 'porto-seguro', initials: 'PS', label: 'PORTO' };
  return { slug: 'cuiaba-prainha', initials: 'CP', label: 'CUIABÁ' };
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function PanelStyles() {
  return (
    <style jsx global>{`
      .tv-screen {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        display: grid;
        grid-template-rows: 84px minmax(0, 1fr) 62px;
        color: #f8fbff;
        isolation: isolate;
        background:
          radial-gradient(circle at 14% 8%, rgba(255, 149, 28, 0.18), transparent 24%),
          radial-gradient(circle at 88% 22%, rgba(56, 148, 255, 0.16), transparent 26%),
          linear-gradient(180deg, #020812 0%, #06192b 48%, #020912 100%);
      }

      .arena-bg {
        position: absolute;
        inset: 0;
        z-index: -3;
        opacity: 0.88;
        background-image:
          linear-gradient(120deg, transparent 0 24%, rgba(255,255,255,0.035) 24.2% 24.6%, transparent 24.8% 100%),
          linear-gradient(120deg, transparent 0 66%, rgba(255, 166, 34, 0.06) 66.2% 66.6%, transparent 66.8% 100%),
          radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0);
        background-size: auto, auto, 32px 32px;
      }

      .arena-glow {
        position: absolute;
        z-index: -2;
        width: 430px;
        height: 430px;
        filter: blur(72px);
        opacity: 0.26;
        pointer-events: none;
      }
      .arena-glow.left { left: -130px; top: 126px; background: #ff8a1e; }
      .arena-glow.right { right: -150px; top: 116px; background: #287bff; }

      .loading-view { place-items: center; display: grid; }
      .loader-card { width: min(520px, 70vw); padding: 38px 44px; text-align: center; border: 1px solid rgba(255, 189, 46, 0.42); background: rgba(4, 18, 32, 0.92); box-shadow: 0 30px 90px rgba(0,0,0,0.5), inset 0 0 70px rgba(255, 176, 34, 0.06); }
      .loader-card h1 { margin: 14px 0 4px; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 44px; font-style: italic; line-height: 0.9; }
      .loader-card p { margin: 0; color: rgba(255,255,255,0.7); }

      .topbar-v3 {
        min-height: 0;
        padding: 9px 24px 8px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 178px;
        align-items: start;
        gap: 14px;
        border-bottom: 1px solid rgba(255,255,255,0.09);
        background: linear-gradient(180deg, rgba(2, 9, 17, 0.96), rgba(2, 9, 17, 0.74));
        box-shadow: inset 0 -1px rgba(255, 177, 31, 0.08);
      }

      .brand-v3 { min-width: 0; display: flex; align-items: center; gap: 12px; }
      .honey-mark-v3 { flex: 0 0 auto; width: 52px; height: 52px; display: grid; place-items: center; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); border: 2px solid #ffb62c; background: rgba(3, 14, 26, 0.94); box-shadow: 0 0 24px rgba(255, 182, 44, 0.16), inset 0 0 0 5px rgba(255, 182, 44, 0.05); }
      .honey-mark-v3 svg { width: 32px; height: 32px; }
      .honey-mark-v3 path, .ticker-label-v3 path { fill: none; stroke: #ffbf32; stroke-width: 4; stroke-linejoin: round; }
      .honey-mark-v3 path:nth-child(2) { stroke: #fff; opacity: 0.85; }
      .honey-mark-v3 path:nth-child(3) { opacity: 0.5; }

      .topbar-v3 h1, .headline-v3 h2, .pressure-title, .ranking-title h3, .team-copy-v3 strong, .match-ribbon, .match-status, .ticker-label-v3 strong, .goal-card-v3 h2, .status-card-v3 strong, .store-crest-v3 strong, .contract-alert span {
        font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }

      .topbar-v3 h1 { margin: -2px 0 0; font-size: clamp(34px, 3.1vw, 46px); line-height: 0.84; font-weight: 900; font-style: italic; color: #fff; text-shadow: 0 5px 18px rgba(0,0,0,0.45); }
      .topbar-v3 p { margin: 5px 0 0; color: #ffc233; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: clamp(12px, 0.95vw, 16px); line-height: 1; font-weight: 900; font-style: italic; letter-spacing: 0.045em; }

      .live-pill-v3 { align-self: start; justify-self: center; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 98px; height: 34px; padding: 0 12px; border-radius: 999px; background: linear-gradient(180deg, #164025, #0e2e1b); border: 1px solid rgba(90, 223, 96, 0.38); color: #fff; font-size: 13px; font-weight: 900; line-height: 1; box-shadow: 0 0 18px rgba(90, 223, 96, 0.12), inset 0 1px rgba(255,255,255,0.08); white-space: nowrap; }
      .live-pill-v3.compact { min-width: 78px; height: 29px; padding: 0 9px; font-size: 11px; gap: 6px; }
      .live-pill-v3 i { width: 10px; height: 10px; border-radius: 50%; background: #55df61; box-shadow: 0 0 0 4px rgba(85, 223, 97, 0.16); animation: livePulse 1.8s infinite ease-in-out; }

      .update-chip { justify-self: end; width: 178px; height: 40px; display: grid; place-items: center; padding: 0 12px; color: rgba(255,255,255,0.92); font-size: 13px; font-weight: 900; white-space: nowrap; border: 1px solid rgba(255, 176, 28, 0.48); background: linear-gradient(135deg, rgba(20, 31, 48, 0.95), rgba(9, 15, 27, 0.95)); clip-path: polygon(8% 0, 100% 0, 95% 100%, 0 100%); }

      .stage-v3 { min-height: 0; padding: 10px 20px 8px; display: grid; grid-template-columns: minmax(0, 1fr) 342px; gap: 16px; overflow: hidden; }
      .main-v3 { min-width: 0; min-height: 0; display: grid; grid-template-rows: 98px minmax(0, 1fr); gap: 12px; }

      .headline-v3 { position: relative; min-width: 0; padding: 15px 30px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid rgba(255,255,255,0.10); background: linear-gradient(135deg, rgba(7, 22, 39, 0.98), rgba(4, 14, 25, 0.95)); clip-path: polygon(2% 0, 98% 0, 100% 50%, 98% 100%, 0 100%, 0 14%); box-shadow: 0 16px 50px rgba(0,0,0,0.25), inset 0 0 60px rgba(24, 104, 212, 0.05), inset 0 0 80px rgba(255, 148, 24, 0.04); overflow: hidden; }
      .headline-v3::before { content: ''; position: absolute; inset: 0 auto auto 0; height: 5px; width: 56%; background: linear-gradient(90deg, #ff951c, #ffcb32, transparent); }
      .headline-v3::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(120deg, transparent 0 64%, rgba(255,255,255,0.06) 64.2% 64.7%, transparent 65% 100%); }
      .headline-v3 span { position: relative; z-index: 1; display: block; margin-bottom: 4px; color: #ffc233; font-size: 12px; font-weight: 900; letter-spacing: 0.14em; }
      .headline-v3 h2 { position: relative; z-index: 1; margin: 0; font-size: clamp(40px, 3.8vw, 54px); line-height: 0.88; font-weight: 900; font-style: italic; color: #fff; text-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      .headline-v3 p { position: relative; z-index: 1; margin: 8px 0 0; font-size: 14px; line-height: 1.12; color: rgba(255,255,255,0.78); }
      .headline-v3 > strong { position: relative; z-index: 1; flex: 0 0 auto; padding: 12px 28px; border: 2px solid #ff9b1f; border-radius: 12px; background: linear-gradient(180deg, rgba(11, 23, 39, 0.96), rgba(5, 13, 23, 0.96)); color: #fff; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 28px; font-weight: 900; font-style: italic; line-height: 1; transform: skewX(-12deg); }

      .match-board-v3 { position: relative; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) 90px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); border-left: 3px solid rgba(255, 183, 31, 0.9); background: radial-gradient(circle at 50% 50%, rgba(12, 52, 104, 0.12), transparent 52%), linear-gradient(180deg, rgba(4, 20, 38, 0.98), rgba(3, 13, 24, 0.98)); box-shadow: 0 20px 60px rgba(0,0,0,0.32), inset 0 0 80px rgba(255,255,255,0.015), inset 0 0 90px rgba(30, 120, 220, 0.03); clip-path: polygon(1.5% 0, 100% 0, 100% 90%, 98% 100%, 0 100%, 0 6%); }
      .match-board-v3.contracts { border-left-color: rgba(76, 212, 91, 0.8); }
      .match-board-v3::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(255,255,255,0.03), transparent 22% 78%, rgba(255,255,255,0.025)), linear-gradient(120deg, transparent 0 70%, rgba(255, 170, 34, 0.05) 70.2% 70.6%, transparent 70.8% 100%); }

      .field-lines { position: absolute; inset: 54px 32px 110px; opacity: 0.35; pointer-events: none; background: radial-gradient(ellipse at center, transparent 0 38%, rgba(255,255,255,0.08) 38.4% 39%, transparent 39.4%), linear-gradient(90deg, transparent 0 49.8%, rgba(255,255,255,0.06) 50%, transparent 50.2%), linear-gradient(0deg, transparent 0 49.8%, rgba(255,255,255,0.05) 50%, transparent 50.2%); border: 1px solid rgba(255,255,255,0.05); }
      .match-board-v3.contract-event { animation: contractBoardFlash 1.8s ease-out both; }
      .match-board-v3.contract-event::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2; background: radial-gradient(circle at 50% 45%, rgba(255, 203, 61, 0.24), transparent 32%); animation: contractHalo 1.8s ease-out both; }

      .match-ribbon { position: absolute; z-index: 3; top: 0; left: 0; width: 116px; height: 42px; display: grid; place-items: center; background: linear-gradient(135deg, #ff9820, #ff6517); color: white; font-size: 28px; font-weight: 900; clip-path: polygon(0 0, 100% 0, 78% 100%, 0 100%); text-shadow: 0 2px rgba(0,0,0,0.25); }
      .match-status { position: absolute; z-index: 3; top: 18px; right: 0; min-width: 300px; height: 38px; display: grid; place-items: center; padding: 0 18px; font-size: 15px; font-weight: 900; background: linear-gradient(90deg, #ffcd37, #ff9b1e); color: #1f1200; clip-path: polygon(8% 0, 100% 0, 95% 100%, 0 100%); box-shadow: 0 8px 22px rgba(0,0,0,0.18); }
      .contracts .match-status { background: linear-gradient(90deg, #1fbe56, #11763d); color: white; }
      .contract-alert { position: absolute; z-index: 5; left: 50%; top: 16px; transform: translateX(-50%) translateY(-130%); opacity: 0; pointer-events: none; }
      .contract-alert span { display: block; padding: 8px 18px; border-radius: 999px; background: linear-gradient(90deg, #ffcf3d, #ff8d1e); color: #160d00; font-size: 18px; font-weight: 900; box-shadow: 0 12px 30px rgba(255, 160, 31, 0.26); }
      .contract-event .contract-alert { animation: contractAlert 2.2s ease-out both; }

      .score-zone-v3 { position: relative; z-index: 1; min-height: 0; padding: 54px 34px 18px; display: grid; grid-template-columns: minmax(0, 1fr) 220px minmax(0, 1fr); gap: 18px; align-items: center; }
      .team-panel-v3 { min-width: 0; display: flex; align-items: center; gap: 16px; }
      .team-panel-v3.right { justify-content: flex-end; text-align: right; }
      .team-panel-v3.active .team-copy-v3 strong { color: #fff8d8; text-shadow: 0 0 18px rgba(255, 203, 61, 0.20), 0 5px 18px rgba(0,0,0,0.45); }
      .team-panel-v3.active .store-crest-v3 { animation: crestActivePulse 2.2s ease-in-out infinite; }
      .contract-event .team-panel-v3.active .store-crest-v3 { animation: crestGoalPop 1.8s ease-out both; }
      .team-copy-v3 { min-width: 0; }
      .team-copy-v3 strong { display: block; color: white; font-size: clamp(34px, 2.9vw, 46px); line-height: 0.88; font-weight: 900; font-style: italic; white-space: nowrap; text-shadow: 0 5px 18px rgba(0,0,0,0.45); }
      .team-copy-v3 span { display: block; margin-top: 7px; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: clamp(21px, 1.55vw, 26px); line-height: 0.94; font-weight: 900; font-style: italic; letter-spacing: 0.04em; white-space: nowrap; }
      .tone-green { color: #58c94f; } .tone-blue { color: #4da6ff; } .tone-gold { color: #ffc433; } .tone-orange { color: #ff8d1e; }

      .store-crest-v3 { position: relative; flex: 0 0 auto; width: 88px; height: 98px; display: grid; grid-template-rows: 1fr 24px 14px; place-items: center; color: #ffbf32; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02)), linear-gradient(145deg, rgba(255, 194, 42, 0.20), rgba(7, 18, 32, 0.94)); border: 2px solid currentColor; clip-path: polygon(50% 0, 92% 13%, 100% 55%, 78% 100%, 22% 100%, 0 55%, 8% 13%); box-shadow: 0 12px 28px rgba(0,0,0,0.38), 0 0 20px rgba(255, 194, 42, 0.11), inset 0 0 0 5px rgba(0,0,0,0.20), inset 0 0 32px rgba(255,255,255,0.06); overflow: hidden; }
      .store-crest-v3.porto-seguro { color: #4da6ff; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02)), linear-gradient(145deg, rgba(60,148,234,0.25), rgba(7,18,32,0.94)); box-shadow: 0 12px 28px rgba(0,0,0,0.38), 0 0 22px rgba(77,166,255,0.16), inset 0 0 0 5px rgba(0,0,0,0.20), inset 0 0 32px rgba(255,255,255,0.06); }
      .crest-light { position: absolute; inset: -45% auto auto -45%; width: 75%; height: 150%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transform: rotate(28deg); animation: crestSweep 5.8s ease-in-out infinite; }
      .crest-icon { position: relative; z-index: 1; width: 52px; height: 48px; margin-top: 10px; display: grid; place-items: center; }
      .crest-icon svg { width: 52px; height: 52px; }
      .icon-main { fill: none; stroke: rgba(255,255,255,0.94); stroke-width: 4.2; stroke-linecap: round; stroke-linejoin: round; }
      .icon-accent { fill: none; stroke: currentColor; stroke-width: 4.2; stroke-linecap: round; stroke-linejoin: round; }
      .icon-cell { fill: rgba(255,255,255,0.08); stroke: currentColor; stroke-width: 3.6; stroke-linejoin: round; }
      .store-crest-v3 strong { position: relative; z-index: 1; color: #fff; font-size: 27px; font-weight: 900; line-height: 0.85; text-shadow: 0 3px 10px rgba(0,0,0,0.40); }
      .store-crest-v3 span { position: relative; z-index: 1; margin-bottom: 9px; color: currentColor; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 11px; font-weight: 900; letter-spacing: 0.12em; }

      .score-center { min-width: 0; display: grid; justify-items: center; gap: 12px; }
      .scorebox-v3 { position: relative; width: 206px; height: 112px; display: flex; align-items: center; justify-content: center; gap: 17px; color: white; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: clamp(82px, 6.8vw, 104px); line-height: 0.78; font-weight: 900; background: linear-gradient(180deg, rgba(7, 13, 22, 0.98), rgba(14, 23, 37, 0.98)); clip-path: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%); border: 1px solid rgba(255,255,255,0.10); box-shadow: inset 0 0 40px rgba(255,255,255,0.03), 0 10px 28px rgba(0,0,0,0.25); text-shadow: 0 6px 0 rgba(255,255,255,0.06), 0 12px 26px rgba(0,0,0,0.5); animation: scoreboxBreath 5s ease-in-out infinite; }
      .contract-event .scorebox-v3 { animation: scoreGoalFlash 1.8s ease-out both, scoreboxBreath 5s ease-in-out 1.8s infinite; }
      .scorebox-v3::after { content: ''; position: absolute; left: 22px; right: 22px; top: 0; bottom: 0; pointer-events: none; background: linear-gradient(180deg, rgba(255, 196, 42, 0.7), transparent 6%, transparent 94%, rgba(255, 196, 42, 0.7)); opacity: 0.8; clip-path: inherit; }
      .scorebox-v3 em { position: relative; z-index: 1; font-size: 0.47em; font-style: normal; margin-top: 2px; opacity: 0.95; }
      .score-digit { position: relative; z-index: 1; display: inline-block; animation: scoreDigitSettle 520ms cubic-bezier(.18,.88,.28,1.25) both; }

      .match-pulse { min-width: 210px; padding: 9px 14px; text-align: center; border: 1px solid rgba(255, 196, 42, 0.24); border-radius: 999px; background: linear-gradient(90deg, rgba(255, 196, 42, 0.12), rgba(60, 148, 234, 0.09)); box-shadow: inset 0 0 18px rgba(255,255,255,0.02); }
      .match-pulse span { display: block; color: #ffc633; font-size: 13px; font-weight: 900; letter-spacing: 0.08em; }
      .match-pulse small { display: block; margin-top: 2px; color: rgba(255,255,255,0.64); font-size: 11px; font-weight: 700; }

      .meta-row-v3 { position: relative; z-index: 1; height: 90px; display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(15, 18, 22, 0.36), rgba(9, 15, 21, 0.56)); }
      .meta-item-v3 { min-width: 0; padding: 0 14px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; border-right: 1px solid rgba(255,255,255,0.12); }
      .meta-item-v3:last-child { border-right: 0; }
      .meta-item-v3 span { margin-bottom: 5px; color: rgba(255,255,255,0.58); font-size: 11px; line-height: 1.05; text-transform: uppercase; letter-spacing: 0.04em; }
      .meta-item-v3 strong { color: #fff; font-size: clamp(17px, 1.3vw, 21px); font-weight: 900; line-height: 1.05; white-space: normal; overflow-wrap: anywhere; }
      .meta-item-v3 strong.highlight { color: #ffcb3d; text-shadow: 0 0 14px rgba(255, 203, 61, 0.16); }

      .pressure-v3 { min-width: 0; min-height: 0; padding: 15px 14px 13px; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; gap: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.10); background: radial-gradient(circle at 100% 0%, rgba(255, 157, 28, 0.07), transparent 30%), radial-gradient(circle at 0% 70%, rgba(67, 146, 255, 0.08), transparent 36%), linear-gradient(180deg, rgba(6, 20, 35, 0.98), rgba(3, 12, 22, 0.98)); box-shadow: 0 20px 60px rgba(0,0,0,0.32), inset 0 0 60px rgba(255,255,255,0.015); clip-path: polygon(5% 0, 100% 0, 100% 96%, 96% 100%, 0 100%, 0 5%); }
      .pressure-title { padding: 2px 0 10px; border-bottom: 1px solid rgba(255,255,255,0.10); color: #ffc633; font-size: 25px; line-height: 0.94; font-weight: 900; font-style: italic; text-shadow: 0 0 14px rgba(255, 198, 51, 0.12); }
      .pressure-title i { display: inline-block; width: 24px; height: 18px; margin-right: 8px; vertical-align: -2px; background: linear-gradient(120deg, transparent 0 25%, #ff8d1e 25% 35%, transparent 35% 45%, #ff8d1e 45% 55%, transparent 55% 100%); }
      .live-card-v3 { min-height: 0; padding: 12px 12px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 9px; align-items: center; border: 1px solid rgba(255, 40, 96, 0.35); background: linear-gradient(135deg, rgba(11, 27, 44, 0.92), rgba(7, 14, 24, 0.94)); clip-path: polygon(4% 0, 100% 0, 100% 76%, 96% 100%, 0 100%, 0 20%); }
      .signal-dot { width: 27px; height: 27px; display: grid; place-items: center; border: 3px solid rgba(255,255,255,0.9); border-radius: 50%; box-shadow: 0 0 14px rgba(255,255,255,0.18); }
      .signal-dot i { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
      .live-card-v3 strong { display: block; color: #fff; font-size: 15px; line-height: 1.02; }
      .live-card-v3 small { display: block; margin-top: 3px; color: #ffc633; font-size: 14px; font-weight: 900; line-height: 1.02; }

      .ranking-title h3 { margin: 3px 0; font-size: 27px; line-height: 0.9; font-weight: 900; font-style: italic; color: #fff; }
      .ranking-title p { margin: 0; color: rgba(255,255,255,0.68); font-size: 12px; line-height: 1.08; }
      .ranking-list-v3 { min-height: 0; display: grid; grid-auto-rows: 43px; gap: 7px; align-content: start; overflow: hidden; padding-top: 2px; }
      .ranking-item-v3 { height: 43px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 0 10px 0 7px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); background: linear-gradient(90deg, rgba(17, 58, 104, 0.84), rgba(11, 25, 42, 0.96)); box-shadow: 0 8px 18px rgba(0,0,0,0.18), inset 0 1px rgba(255,255,255,0.03); }
      .ranking-item-v3.rank-1 { background: linear-gradient(90deg, rgba(143, 92, 7, 0.92), rgba(34, 25, 11, 0.96)); border-color: rgba(255, 200, 58, 0.28); }
      .ranking-item-v3.rank-2 { background: linear-gradient(90deg, rgba(68, 78, 91, 0.92), rgba(16, 30, 48, 0.96)); }
      .ranking-item-v3.rank-3 { background: linear-gradient(90deg, rgba(100, 60, 27, 0.88), rgba(16, 30, 48, 0.96)); }
      .ranking-item-v3 span { height: 28px; display: grid; place-items: center; border-radius: 999px; color: white; background: linear-gradient(180deg, #4aa8ff, #1d67b4); font-weight: 900; font-size: 14px; box-shadow: 0 0 0 2px rgba(255,255,255,0.04), inset 0 1px rgba(255,255,255,0.16); }
      .ranking-item-v3.rank-1 span { background: linear-gradient(180deg, #ffcf3d, #d59611); color: #1d1200; }
      .ranking-item-v3.rank-2 span { background: linear-gradient(180deg, #d6dde8, #7a8798); color: #07101d; }
      .ranking-item-v3.rank-3 span { background: linear-gradient(180deg, #d99556, #92501b); }
      .ranking-item-v3 strong { min-width: 0; color: #fff; font-size: 12px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ranking-item-v3 em { color: #55e069; font-size: 12px; font-weight: 900; font-style: normal; white-space: nowrap; }

      .status-card-v3 { min-height: 56px; padding: 11px 14px; display: flex; align-items: center; gap: 12px; border: 1px solid rgba(255, 162, 28, 0.34); background: linear-gradient(135deg, rgba(9, 18, 31, 0.98), rgba(13, 19, 30, 0.88)); clip-path: polygon(5% 0, 100% 0, 100% 80%, 96% 100%, 0 100%, 0 22%); }
      .screen-icon { flex: 0 0 auto; width: 38px; height: 30px; position: relative; border: 3px solid #ffb62c; border-radius: 4px; box-shadow: 0 0 16px rgba(255,178,30,0.18); }
      .screen-icon::before { content: ''; position: absolute; left: 11px; right: 11px; bottom: -12px; height: 8px; border-bottom: 4px solid #ffb62c; border-left: 3px solid transparent; border-right: 3px solid transparent; }
      .screen-icon span { position: absolute; left: 8px; right: 8px; bottom: 6px; height: 16px; background: linear-gradient(145deg, transparent 0 40%, #ff8d1e 41% 46%, transparent 47% 100%), linear-gradient(90deg, transparent 0 10%, #ff8d1e 11% 18%, transparent 19% 40%, #ff8d1e 41% 48%, transparent 49% 70%, #ff8d1e 71% 78%, transparent 79% 100%); }
      .status-card-v3 strong { display: block; color: #fff; font-size: 18px; font-weight: 900; font-style: italic; line-height: 0.92; }
      .status-card-v3 small { display: block; margin-top: 4px; color: rgba(255,255,255,0.72); font-size: 12px; line-height: 1.05; font-style: italic; }

      .ticker-v3 { height: 62px; display: grid; grid-template-columns: 160px minmax(0, 1fr) 220px; align-items: center; gap: 14px; padding: 0 20px; overflow: hidden; border-top: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(4, 12, 22, 0.98), rgba(2, 8, 16, 0.98)); box-shadow: inset 0 1px rgba(255, 177, 29, 0.05), 0 -14px 40px rgba(0,0,0,0.24); }
      .ticker-goal { animation: tickerGoalFlash 1.8s ease-out both; }
      .ticker-label-v3 { height: 42px; padding: 0 14px; display: flex; align-items: center; gap: 8px; border-left: 4px solid #ff8d1e; border-right: 4px solid #ff8d1e; background: linear-gradient(135deg, rgba(12, 25, 40, 0.98), rgba(8, 16, 27, 0.94)); clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%); }
      .ticker-label-v3 svg { width: 20px; height: 20px; flex: 0 0 auto; }
      .ticker-label-v3 strong { color: #fff; font-size: 17px; font-weight: 900; font-style: italic; white-space: nowrap; }
      .ticker-track-v3 { min-width: 0; height: 100%; display: flex; align-items: center; overflow: hidden; mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent); }
      .ticker-track-v3 div { flex: 0 0 auto; min-width: max-content; white-space: nowrap; color: rgba(255,255,255,0.82); font-size: 13px; font-weight: 800; animation: ticker 34s linear infinite; }
      .footer-brand { justify-self: end; color: rgba(255,255,255,0.64); font-size: 12px; white-space: nowrap; }
      .footer-brand strong { color: #ffb328; margin-right: 8px; }
      .footer-brand span { margin: 0 8px; color: #ffc633; }

      .goal-active .topbar-v3, .goal-active .stage-v3, .goal-active .ticker-v3 { filter: brightness(0.46) blur(1.2px); }
      .goal-layer-v3 { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: radial-gradient(circle at 50% 50%, rgba(255, 184, 30, 0.18), rgba(0,0,0,0.72) 62%, rgba(0,0,0,0.84)); animation: overlayIn 360ms ease-out both; overflow: hidden; }
      .goal-burst { position: absolute; width: 620px; height: 620px; border-radius: 50%; background: repeating-conic-gradient(from 0deg, rgba(255, 205, 55, 0.18) 0 5deg, transparent 5deg 13deg); opacity: 0.82; animation: goalBurstSpin 7.8s linear infinite, goalBurstIn 700ms ease-out both; }
      .goal-particles { position: absolute; inset: 0; pointer-events: none; }
      .goal-particles span { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; border: 2px solid rgba(255, 205, 55, 0.88); clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); animation: particleFly 1400ms ease-out both; }
      .goal-particles span:nth-child(1) { --x: -360px; --y: -180px; animation-delay: 30ms; }
      .goal-particles span:nth-child(2) { --x: 330px; --y: -150px; animation-delay: 70ms; }
      .goal-particles span:nth-child(3) { --x: -290px; --y: 160px; animation-delay: 110ms; }
      .goal-particles span:nth-child(4) { --x: 310px; --y: 180px; animation-delay: 150ms; }
      .goal-particles span:nth-child(5) { --x: -120px; --y: -260px; animation-delay: 190ms; }
      .goal-particles span:nth-child(6) { --x: 140px; --y: -270px; animation-delay: 230ms; }
      .goal-particles span:nth-child(7) { --x: -150px; --y: 260px; animation-delay: 270ms; }
      .goal-particles span:nth-child(8) { --x: 180px; --y: 255px; animation-delay: 310ms; }
      .goal-particles span:nth-child(9) { --x: -430px; --y: 20px; animation-delay: 350ms; }
      .goal-particles span:nth-child(10) { --x: 430px; --y: -10px; animation-delay: 390ms; }
      .goal-particles span:nth-child(11) { --x: -40px; --y: -330px; animation-delay: 430ms; }
      .goal-particles span:nth-child(12) { --x: 40px; --y: 330px; animation-delay: 470ms; }
      .goal-particles span:nth-child(13) { --x: -250px; --y: -250px; animation-delay: 510ms; }
      .goal-particles span:nth-child(14) { --x: 260px; --y: 250px; animation-delay: 550ms; }

      .goal-card-v3 { position: relative; z-index: 2; width: min(900px, 74vw); min-height: 430px; padding: 54px 62px 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border: 1px solid rgba(255, 194, 42, 0.72); background: radial-gradient(circle at 50% 5%, rgba(255, 194, 42, 0.17), transparent 28%), linear-gradient(135deg, rgba(4,16,28,0.98), rgba(5,13,22,0.98)); clip-path: polygon(11% 0, 91% 0, 100% 18%, 94% 100%, 7% 100%, 0 79%, 5% 15%); box-shadow: 0 0 90px rgba(255, 178, 30, 0.26), 0 34px 120px rgba(0,0,0,0.64); animation: goalCardPop 740ms cubic-bezier(.16,.98,.29,1.08) both; }
      .goal-kicker { margin-top: 16px; color: #ffcf3d; font-size: 14px; font-weight: 900; letter-spacing: 0.16em; }
      .goal-card-v3 h2 { margin: 14px 0 8px; color: #ffc633; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 132px; font-weight: 900; font-style: italic; line-height: 0.78; text-shadow: 0 0 28px rgba(255, 198, 51, 0.28); }
      .goal-card-v3 > strong { color: #fff; font-size: 34px; }
      .goal-scoreline span { display: block; margin-top: 24px; color: rgba(255,255,255,0.64); font-size: 16px; font-weight: 900; letter-spacing: 0.12em; }
      .goal-scoreline em { display: block; color: #fff; font-family: 'Barlow Condensed', Arial, sans-serif; font-size: 74px; font-style: italic; font-weight: 900; line-height: 0.9; }
      .goal-card-v3 p { margin: 18px 0 0; color: rgba(255,255,255,0.72); }

      @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes livePulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.72); opacity: 0.65; } }
      @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes scoreboxBreath { 0%, 100% { transform: scale(1); box-shadow: inset 0 0 40px rgba(255,255,255,0.03), 0 10px 28px rgba(0,0,0,0.25); } 50% { transform: scale(1.012); box-shadow: inset 0 0 44px rgba(255,255,255,0.05), 0 12px 34px rgba(0,0,0,0.28); } }
      @keyframes scoreDigitSettle { from { transform: translateY(-13px) scale(1.16); opacity: 0.35; filter: blur(3px); } to { transform: translateY(0) scale(1); opacity: 1; filter: blur(0); } }
      @keyframes scoreGoalFlash { 0% { transform: scale(1); box-shadow: 0 0 0 rgba(255,203,61,0); } 18% { transform: scale(1.12); box-shadow: 0 0 54px rgba(255,203,61,0.38), inset 0 0 50px rgba(255,203,61,0.12); } 100% { transform: scale(1); box-shadow: inset 0 0 40px rgba(255,255,255,0.03), 0 10px 28px rgba(0,0,0,0.25); } }
      @keyframes contractBoardFlash { 0% { border-color: rgba(255,203,61,0.9); } 100% { border-color: rgba(255,255,255,0.12); } }
      @keyframes contractHalo { 0% { opacity: 0; transform: scale(0.9); } 20% { opacity: 1; } 100% { opacity: 0; transform: scale(1.22); } }
      @keyframes contractAlert { 0% { opacity: 0; transform: translateX(-50%) translateY(-130%) scale(0.88); } 16% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 78% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(-24px) scale(0.96); } }
      @keyframes crestActivePulse { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.035); filter: brightness(1.14); } }
      @keyframes crestGoalPop { 0% { transform: scale(1); } 18% { transform: scale(1.18) rotate(-2deg); filter: brightness(1.35); } 100% { transform: scale(1); filter: brightness(1); } }
      @keyframes crestSweep { 0%, 72% { transform: translateX(-80%) rotate(28deg); } 100% { transform: translateX(240%) rotate(28deg); } }
      @keyframes tickerGoalFlash { 0% { box-shadow: inset 0 1px rgba(255,177,29,0.05), 0 -14px 40px rgba(0,0,0,0.24); } 20% { box-shadow: inset 0 0 28px rgba(255,203,61,0.12), 0 -14px 48px rgba(255,203,61,0.12); } 100% { box-shadow: inset 0 1px rgba(255,177,29,0.05), 0 -14px 40px rgba(0,0,0,0.24); } }
      @keyframes goalBurstSpin { to { transform: rotate(360deg); } }
      @keyframes goalBurstIn { from { opacity: 0; transform: scale(0.4); } to { opacity: 0.82; transform: scale(1); } }
      @keyframes particleFly { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(0deg); } 18% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1.05) rotate(230deg); } }
      @keyframes goalCardPop { from { opacity: 0; transform: translateY(18px) scale(0.92); filter: blur(5px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }

      @media (max-width: 1366px) {
        .stage-v3 { grid-template-columns: minmax(0, 1fr) 332px; gap: 14px; padding-left: 18px; padding-right: 18px; }
        .main-v3 { grid-template-rows: 96px minmax(0, 1fr); }
        .headline-v3 { padding-left: 26px; padding-right: 26px; }
        .headline-v3 h2 { font-size: 47px; }
        .score-zone-v3 { grid-template-columns: minmax(0, 1fr) 205px minmax(0, 1fr); padding-left: 24px; padding-right: 24px; }
        .scorebox-v3 { width: 192px; height: 104px; font-size: 84px; }
        .match-pulse { min-width: 190px; }
        .team-copy-v3 strong { font-size: 38px; }
        .team-copy-v3 span { font-size: 21px; }
        .store-crest-v3 { width: 78px; height: 90px; }
        .store-crest-v3 strong { font-size: 24px; }
        .crest-icon svg { width: 46px; height: 46px; }
        .ranking-item-v3 strong { font-size: 11.5px; }
        .ticker-v3 { grid-template-columns: 150px minmax(0, 1fr) 195px; }
      }
    `}</style>
  );
}
