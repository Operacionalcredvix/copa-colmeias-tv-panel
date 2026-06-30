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
const STORAGE_KEY = 'copa-colmeias-final-last-scores-v4';
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

      if (!payload.ok) {
        console.error('Payload inválido no painel da final', payload.warning);
        setIsLoading(false);
        return;
      }

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

  const finalMatch = useMemo(() => {
    if (!data) return null;
    return getFinalMatch(data.matches);
  }, [data]);

  const finalHasPortoSeguro = useMemo(() => {
    if (!finalMatch) return false;
    return isPortoSeguro(finalMatch.left.name) || isPortoSeguro(finalMatch.right.name);
  }, [finalMatch]);

  const finalDate = finalHasPortoSeguro ? '01/07' : '30/06';
  const scheduleNote = finalHasPortoSeguro ? 'Final ajustada por feriado municipal em Porto Seguro' : 'Data prevista da grande final';
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

  const evaluateGoal = (payload: PanelPayload) => {
    const match = getFinalMatch(payload.matches);
    if (!match) return;

    const nextScores: Record<string, { left: number; right: number }> = {
      [match.id]: { left: match.leftScore, right: match.rightScore }
    };

    const previous = previousScores.current;
    const before = previous?.[match.id];

    previousScores.current = nextScores;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextScores));
    } catch {
      // Sem efeito critico para TV.
    }

    if (!before) return;

    if (match.leftScore > before.left) {
      showGoal({ teamName: match.left.name, score: `${match.leftScore} X ${match.rightScore}`, matchId: match.id });
      return;
    }

    if (match.rightScore > before.right) {
      showGoal({ teamName: match.right.name, score: `${match.leftScore} X ${match.rightScore}`, matchId: match.id });
    }
  };

  const showGoal = (goal: GoalEvent) => {
    setActiveGoal(goal);
    if (goalTimer.current) clearTimeout(goalTimer.current);
    goalTimer.current = setTimeout(() => setActiveGoal(null), 6800);
  };

  if (!data && isLoading) {
    return <LoadingScreen text="Carregando painel da grande final..." />;
  }

  if (!data) {
    return <LoadingScreen text="Sem conexão com o placar oficial. Atualize a página em alguns segundos." />;
  }

  return (
    <main className={`final-screen ${activeGoal ? 'goal-active' : ''}`}>
      <style jsx global>{styles}</style>
      <div className="background-grid" />
      <Header updatedAt={data.updatedAt} />

      <section className="final-stage">
        <div className="final-main">
          <div className="final-hero">
            <div className="hero-copy">
              <span>JOGO DECISIVO</span>
              <h2>GRANDE FINAL</h2>
              <p>Cada contrato é um gol. A loja que produzir mais levanta a Copa das Colmeias.</p>
            </div>
            <div className="date-card">
              <small>DATA</small>
              <strong>{finalDate}</strong>
              <em>{scheduleNote}</em>
            </div>
          </div>

          {finalMatch ? <FinalMatchCard match={finalMatch} /> : <WaitingFinalCard />}
        </div>

        <aside className="final-aside">
          <div className="side-panel title-panel">
            <span>DECISÃO</span>
            <strong>TÍTULO DA COPA</strong>
            <p>A final ocupa o painel principal. O ranking geral segue como referência lateral.</p>
          </div>

          <div className="side-panel ranking-panel">
            <div className="panel-title">TOP 10 GERAL</div>
            <p><strong>{rankingWindowLabel}</strong> • Ranking por valor produzido.</p>
            <div key={rankingPage} className="ranking-list">
              {visibleRanking.map((row) => <RankingItem key={`${row.position}-${row.name}`} row={row} />)}
            </div>
          </div>
        </aside>
      </section>

      <footer className="ticker-bar">
        <div className="ticker-label"><HoneyIcon /><strong>11º AO 20º</strong></div>
        <div className="ticker-track"><div className="ticker-content">{tickerText}</div></div>
        <div className="footer-brand">CREDVIX • CADA CONTRATO É UM GOL</div>
      </footer>

      {activeGoal && <GoalOverlay goal={activeGoal} />}
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="final-screen loading-screen">
      <style jsx global>{styles}</style>
      <div className="loader-card">
        <div className="brand-mark mini"><HoneyIcon /></div>
        <h1>COPA DAS COLMEIAS</h1>
        <p>{text}</p>
      </div>
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
          <p>GRANDE FINAL AO VIVO • DISPUTA POR CONTRATOS</p>
        </div>
      </div>
      <LivePill />
      <div className="update-box"><span>Atualizado às</span><strong>{updatedAt}</strong></div>
    </header>
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
      <div className="status-row">
        <span><strong>FINAL</strong> • {status}</span>
        <em>{match.leftScore === match.rightScore ? 'Empate no placar' : match.distance}</em>
      </div>

      <div className="score-row">
        <TeamBlock team={match.left} align="left" advancing={leftAdvancing} />
        <div className="score-core">
          <span>{match.leftScore}</span>
          <em>x</em>
          <span>{match.rightScore}</span>
        </div>
        <TeamBlock team={match.right} align="right" advancing={rightAdvancing} />
      </div>

      <div className="meta-grid">
        <MetaItem label={leaderLabel} value={match.advancing} highlight />
        <MetaItem label="Critério atual" value={match.criterion} />
        <MetaItem label="Distância" value={match.distance} highlight={match.distance.includes('+')} />
      </div>
    </article>
  );
}

function WaitingFinalCard() {
  return (
    <div className="final-card waiting-card">
      <div>
        <h3>Aguardando finalistas</h3>
        <p>Assim que a aba de placar receber a linha da FINAL, este painel passa a mostrar o confronto decisivo.</p>
      </div>
    </div>
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
      <div className="goal-card">
        <LivePill compact />
        <h2>GOL!</h2>
        <div className="goal-team-line"><span>🐝</span><strong>{goal.teamName} marca!</strong></div>
        <div className="goal-score"><span>PLACAR:</span><strong>{goal.score}</strong></div>
        <p>Cada contrato muda o jogo.</p>
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

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #020812; }

  .final-screen {
    --gold: #ffc22a;
    --orange: #ff8619;
    --green: #58c94f;
    --blue: #3c94ea;
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% -10%, rgba(255, 194, 42, 0.18), transparent 30%),
      radial-gradient(circle at 12% 96%, rgba(60, 148, 234, 0.14), transparent 30%),
      linear-gradient(135deg, #020812 0%, #061524 54%, #020812 100%);
    color: #f5f7fb;
    isolation: isolate;
  }

  .background-grid {
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: .34;
    background-image:
      linear-gradient(30deg, rgba(255,255,255,.04) 1px, transparent 1px),
      radial-gradient(circle at 1px 1px, rgba(255,194,42,.10) 1px, transparent 0);
    background-size: 92px 92px, 34px 34px;
  }

  .loader-card h1,
  .topbar h1,
  .final-hero h2,
  .final-hero span,
  .final-card,
  .panel-title,
  .team-name,
  .score-core,
  .rank-badge,
  .goal-card h2,
  .footer-brand {
    font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: .015em;
  }

  .loading-screen { display: grid; place-items: center; }
  .loader-card { width: min(640px, 70vw); padding: 42px 48px; text-align: center; border: 1px solid rgba(255,194,42,.45); background: rgba(5,17,29,.86); box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 80px rgba(255,194,42,.07); }
  .brand-mark, .brand-mark.mini { width: 50px; height: 50px; display: grid; place-items: center; border: 2px solid var(--gold); clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%); }
  .brand-mark svg, .brand-mark.mini svg, .ticker-label svg { width: 31px; height: 31px; }
  .brand-mark svg path, .brand-mark.mini svg path, .ticker-label svg path { fill: none; stroke: var(--gold); stroke-width: 4; stroke-linejoin: round; }

  .topbar {
    height: 82px;
    padding: 12px 24px 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 172px;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid rgba(255,255,255,.14);
    background: rgba(2,8,18,.94);
  }

  .brand-area { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .topbar h1 { margin: 0; font-size: clamp(31px, 3.2vw, 52px); line-height: .82; font-weight: 900; font-style: italic; white-space: nowrap; }
  .topbar p { margin: 5px 0 0; color: var(--gold); font-size: 11px; font-weight: 900; white-space: nowrap; }
  .update-box { justify-self: end; width: 172px; padding: 6px 10px; text-align: right; border-left: 1px solid rgba(255,134,25,.55); color: rgba(255,255,255,.78); font-weight: 900; text-transform: uppercase; }
  .update-box span { display: block; font-size: 11px; line-height: 1; }
  .update-box strong { display: block; margin-top: 4px; color: var(--gold); font-size: 34px; line-height: .84; }

  .live-pill { justify-self: end; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 31px; padding: 0 13px; border: 1px solid rgba(88,201,79,.42); border-radius: 999px; color: #dfffe0; font-size: 12px; font-weight: 900; white-space: nowrap; background: rgba(88,201,79,.08); }
  .live-pill.compact { height: 26px; padding: 0 10px; font-size: 11px; }
  .live-pill i { width: 9px; height: 9px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 5px rgba(88,201,79,.15); }

  .final-stage {
    height: calc(100vh - 138px);
    padding: 14px 18px 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 350px;
    gap: 14px;
  }

  .final-main {
    min-height: 0;
    display: grid;
    grid-template-rows: 136px 1fr;
    gap: 14px;
  }

  .final-hero {
    padding: 14px 22px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 190px;
    align-items: center;
    gap: 16px;
    border: 1px solid rgba(255,255,255,.16);
    background: linear-gradient(135deg, rgba(9,21,35,.96), rgba(2,8,18,.76));
    box-shadow: 0 22px 70px rgba(0,0,0,.24), inset 0 0 55px rgba(255,255,255,.025);
    overflow: hidden;
  }

  .final-hero span { display: block; color: var(--gold); font-size: 18px; font-weight: 900; }
  .final-hero h2 { margin: 1px 0 0; color: white; font-size: clamp(62px, 6.4vw, 96px); line-height: .82; font-weight: 900; font-style: italic; text-shadow: 0 10px 38px rgba(0,0,0,.48); white-space: nowrap; }
  .final-hero p { margin: 8px 0 0; color: rgba(255,255,255,.74); font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .date-card { padding: 11px 13px; text-align: center; border: 2px solid var(--gold); background: rgba(2,9,17,.72); transform: skewX(-8deg); }
  .date-card small, .date-card em { display: block; transform: skewX(8deg); }
  .date-card small { color: var(--gold); font-size: 10px; font-weight: 900; }
  .date-card strong { display: block; color: white; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: 48px; line-height: .82; font-weight: 900; }
  .date-card em { margin-top: 7px; color: var(--gold); font-size: 9px; font-style: normal; font-weight: 900; line-height: 1.1; text-transform: uppercase; }

  .final-card { min-height: 0; padding: 20px 24px 18px; display: grid; grid-template-rows: auto 1fr auto; border: 1px solid rgba(255,255,255,.18); background: radial-gradient(circle at 50% 0%, rgba(255,194,42,.16), transparent 42%), linear-gradient(180deg, rgba(7,20,34,.98), rgba(5,16,28,.94)); box-shadow: 0 24px 80px rgba(0,0,0,.42), inset 0 0 80px rgba(255,255,255,.03); overflow: hidden; }
  .status-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; color: rgba(255,255,255,.74); font-weight: 900; text-transform: uppercase; font-size: 13px; }
  .status-row strong, .status-row em { color: var(--gold); font-style: normal; }

  .score-row { display: grid; grid-template-columns: minmax(250px, 1.05fr) minmax(222px, .52fr) minmax(250px, 1.05fr); align-items: center; gap: 22px; min-height: 0; }
  .team-block { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .team-block.right { justify-content: flex-end; text-align: right; }
  .team-badge { width: clamp(64px, 5vw, 88px); height: clamp(64px, 5vw, 88px); display: grid; place-items: center; border: 2px solid currentColor; border-radius: 50%; background: rgba(255,255,255,.04); flex: 0 0 auto; }
  .team-badge svg { width: 66%; height: 66%; }
  .team-badge svg path { fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }

  .tone-green { color: var(--green); }
  .tone-blue { color: var(--blue); }
  .tone-gold { color: var(--gold); }
  .tone-orange { color: var(--orange); }

  .team-name { min-width: 0; max-width: 245px; }
  .team-name strong { display: block; color: white; font-size: clamp(39px, 3.45vw, 58px); line-height: .9; font-weight: 900; font-style: italic; white-space: normal; overflow: visible; text-overflow: clip; }
  .team-name span { display: block; margin-top: 6px; font-size: clamp(23px, 2vw, 34px); line-height: .95; font-weight: 900; font-style: italic; white-space: normal; overflow: visible; text-overflow: clip; }

  .score-core { height: clamp(136px, 17.5vh, 184px); display: flex; align-items: center; justify-content: center; gap: 18px; border: 1px solid rgba(255,194,42,.34); background: radial-gradient(circle at 50% 45%, rgba(255,134,25,.14), rgba(3,11,20,.86)); box-shadow: inset 0 0 55px rgba(255,194,42,.06), 0 22px 60px rgba(0,0,0,.3); clip-path: polygon(9% 0, 91% 0, 100% 50%, 91% 100%, 9% 100%, 0 50%); }
  .score-core span { font-size: clamp(88px, 9.2vw, 144px); font-weight: 900; font-style: italic; line-height: .82; color: white; text-shadow: 0 8px 28px rgba(0,0,0,.45); }
  .score-core em { font-size: clamp(34px, 3vw, 50px); font-weight: 900; font-style: italic; color: var(--orange); }

  .meta-grid { display: grid; grid-template-columns: 1.25fr .85fr .85fr; gap: 12px; }
  .meta-item { min-height: 64px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.035); }
  .meta-item span { display: block; color: rgba(255,255,255,.58); font-size: 10px; font-weight: 900; text-transform: uppercase; }
  .meta-item strong { display: block; margin-top: 6px; color: white; font-size: clamp(15px, 1.28vw, 22px); line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta-item strong.highlight { color: var(--gold); }

  .waiting-card { display: grid; place-items: center; text-align: center; color: rgba(255,255,255,.72); }
  .waiting-card h3 { margin: 0; color: white; font-size: clamp(52px, 5.4vw, 84px); font-style: italic; text-transform: uppercase; }

  .final-aside { min-height: 0; display: grid; grid-template-rows: 114px 1fr; gap: 14px; }
  .side-panel { min-height: 0; padding: 15px 16px; border: 1px solid rgba(255,255,255,.16); background: linear-gradient(180deg, rgba(7,20,34,.96), rgba(5,16,28,.92)); box-shadow: 0 18px 55px rgba(0,0,0,.30), inset 0 0 48px rgba(255,255,255,.025); overflow: hidden; }
  .title-panel span { display: block; color: var(--gold); font-size: 12px; font-weight: 900; text-transform: uppercase; }
  .title-panel strong { display: block; margin-top: 6px; color: white; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: 31px; line-height: .9; font-weight: 900; text-transform: uppercase; }
  .title-panel p { margin: 8px 0 0; color: rgba(255,255,255,.70); font-size: 12px; line-height: 1.18; }

  .panel-title { color: var(--gold); font-size: clamp(21px, 1.6vw, 28px); font-weight: 900; }
  .ranking-panel p { margin: 7px 0 12px; color: rgba(255,255,255,.70); font-size: 12px; }
  .ranking-list { display: grid; gap: 9px; animation: rankingSwapIn .68s cubic-bezier(.18,.72,.18,1) both; }
  @keyframes rankingSwapIn { from { opacity: 0; transform: translateY(8px); filter: blur(4px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
  .ranking-item { min-height: 48px; display: grid; grid-template-columns: 40px 1fr 92px; align-items: center; gap: 9px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .rank-badge { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: #07111e; font-weight: 900; background: var(--blue); }
  .rank-badge.green { background: var(--green); }
  .rank-badge.orange { background: var(--orange); }
  .ranking-item strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: white; font-weight: 900; font-size: 13px; }
  .ranking-item em { color: var(--gold); font-style: normal; text-align: right; font-weight: 900; white-space: nowrap; font-size: 13px; }

  .ticker-bar { height: 56px; padding: 0 22px; display: grid; grid-template-columns: 160px 1fr 286px; align-items: center; gap: 16px; border-top: 1px solid rgba(255,255,255,.13); background: rgba(2,8,18,.94); }
  .ticker-label { display: flex; align-items: center; gap: 10px; color: white; }
  .ticker-track { overflow: hidden; white-space: nowrap; }
  .ticker-content { display: inline-block; color: rgba(255,255,255,.78); font-weight: 800; animation: finalTicker 38s linear infinite; }
  @keyframes finalTicker { from { transform: translateX(45%); } to { transform: translateX(-100%); } }
  .footer-brand { justify-self: end; color: var(--gold); font-weight: 900; font-size: 13px; }

  .goal-layer { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(2,8,18,.78); backdrop-filter: blur(8px); }
  .goal-card { width: min(760px, 70vw); padding: 36px 42px; text-align: center; border: 2px solid var(--gold); background: radial-gradient(circle at 50% 0%, rgba(255,194,42,.20), rgba(5,16,28,.96)); box-shadow: 0 30px 120px rgba(0,0,0,.65); }
  .goal-card h2 { margin: 18px 0; color: white; font-size: clamp(100px, 12vw, 180px); line-height: .8; font-style: italic; }
  .goal-team-line { display: flex; align-items: center; justify-content: center; gap: 14px; color: var(--gold); font-size: 28px; }
  .goal-score { margin-top: 22px; display: flex; align-items: center; justify-content: center; gap: 16px; }
  .goal-score strong { color: white; font-size: 52px; }

  @media (max-height: 760px) {
    .topbar { height: 76px; padding-top: 10px; }
    .topbar h1 { font-size: clamp(29px, 3vw, 46px); }
    .brand-mark { width: 46px; height: 46px; }
    .update-box strong { font-size: 29px; }
    .final-stage { height: calc(100vh - 130px); padding-top: 11px; padding-bottom: 10px; gap: 12px; }
    .ticker-bar { height: 54px; }
    .final-main { grid-template-rows: 118px 1fr; gap: 12px; }
    .final-aside { grid-template-rows: 104px 1fr; gap: 12px; }
    .final-hero { padding: 12px 18px; }
    .final-hero h2 { font-size: clamp(54px, 5.8vw, 82px); }
    .final-card { padding: 18px 22px; }
    .score-row { gap: 18px; grid-template-columns: minmax(232px, 1.05fr) minmax(206px, .5fr) minmax(232px, 1.05fr); }
    .score-core { height: clamp(124px, 16.5vh, 168px); }
    .score-core span { font-size: clamp(78px, 8.2vw, 126px); }
    .team-badge { width: clamp(56px, 4.6vw, 76px); height: clamp(56px, 4.6vw, 76px); }
    .team-name strong { font-size: clamp(34px, 3.05vw, 50px); }
    .team-name span { font-size: clamp(20px, 1.75vw, 30px); }
  }
`;
