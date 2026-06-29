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
const STORAGE_KEY = 'copa-colmeias-final-last-scores-v2';
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

    return () => window.clearInterval(interval);
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
      showGoal({ teamName: finalMatch.left.name, score: `${finalMatch.leftScore} X ${finalMatch.rightScore}`, matchId: finalMatch.id });
      return;
    }

    if (finalMatch.rightScore > before.right) {
      showGoal({ teamName: finalMatch.right.name, score: `${finalMatch.leftScore} X ${finalMatch.rightScore}`, matchId: finalMatch.id });
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

  const thirdPlaceMatch = useMemo(() => {
    if (!data) return null;
    return getThirdPlaceMatch(data.matches, finalMatch?.id);
  }, [data, finalMatch]);

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
    return data.ticker.map((row) => `${row.position}º ${row.name}${row.value ? `  ${row.value}` : ''}`).join('   •   ');
  }, [data]);

  const visibleRanking = useMemo(() => {
    if (!data) return [];
    const start = rankingPage * 5;
    return data.rankingTop.slice(start, start + 5);
  }, [data, rankingPage]);

  const rankingWindowLabel = rankingPage === 0 ? '1º ao 5º' : '6º ao 10º';

  if (!data && isLoading) {
    return (
      <main className="final-screen loading-screen">
        <style jsx global>{styles}</style>
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
      <main className="final-screen loading-screen">
        <style jsx global>{styles}</style>
        <div className="loader-card">
          <div className="brand-mark mini"><HoneyIcon /></div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>Não foi possível carregar os dados da final.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`final-screen ${activeGoal ? 'goal-active' : ''}`}>
      <style jsx global>{styles}</style>
      <div className="background-grid" />
      <Header updatedAt={data.updatedAt} />

      <section className="final-stage-v2">
        <div className="final-main-v2">
          <div className="final-topline-v2">
            <div>
              <span>GRANDE FINAL</span>
              <h2>COPA DAS COLMEIAS</h2>
              <p>A decisão do título fica em destaque. A disputa pelo 3º lugar aparece em apoio.</p>
            </div>
            <div className="final-date-card-v2">
              <strong>{finalDate}</strong>
              <small>{scheduleNote}</small>
            </div>
          </div>

          {finalMatch ? (
            <FinalMatchCard match={finalMatch} />
          ) : (
            <WaitingFinalCard />
          )}
        </div>

        <aside className="final-side-v2">
          <ThirdPlaceBox match={thirdPlaceMatch} />

          <div className="side-panel ranking-side-panel">
            <div className="panel-title-v2">TOP 10 GERAL</div>
            <p><strong>{rankingWindowLabel}</strong> • Ranking por valor produzido.</p>
            <div key={rankingPage} className="ranking-list-v2">
              {visibleRanking.map((row) => <RankingItem key={`${row.position}-${row.name}`} row={row} />)}
            </div>
          </div>
        </aside>
      </section>

      <footer className="ticker-bar-v2">
        <div className="ticker-label-v2"><HoneyIcon /><strong>11º AO 20º</strong></div>
        <div className="ticker-track-v2"><div className="ticker-content-v2">{tickerText}</div></div>
        <div className="footer-brand-v2">CREDVIX • Cada contrato é um gol</div>
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
    <article className={`final-card-v2 ${match.statusType}`}>
      <div className="final-status-row-v2">
        <span><strong>FINAL</strong> • {status}</span>
        <em>{match.leftScore === match.rightScore ? 'Empate no placar' : match.distance}</em>
      </div>

      <div className="final-score-row-v2">
        <TeamBlock team={match.left} align="left" advancing={leftAdvancing} size="large" />
        <div className="final-score-core-v2">
          <span>{match.leftScore}</span>
          <em>x</em>
          <span>{match.rightScore}</span>
        </div>
        <TeamBlock team={match.right} align="right" advancing={rightAdvancing} size="large" />
      </div>

      <div className="final-meta-grid-v2">
        <MetaItem label={leaderLabel} value={match.advancing} highlight />
        <MetaItem label="Critério atual" value={match.criterion} />
        <MetaItem label="Distância" value={match.distance} highlight={match.distance.includes('+')} />
      </div>
    </article>
  );
}

function ThirdPlaceBox({ match }: { match: Match | null }) {
  return (
    <div className="side-panel third-place-panel">
      <div className="panel-title-v2 bronze-title">DISPUTA PELO 3º LUGAR</div>
      {match ? (
        <div className="third-match-content">
          <div className="third-mini-row">
            <CompactTeam team={match.left} />
            <div className="third-score"><span>{match.leftScore}</span><em>x</em><span>{match.rightScore}</span></div>
            <CompactTeam team={match.right} right />
          </div>
          <div className="third-meta">
            <strong>{match.advancing}</strong>
            <small>{match.criterion} • {match.distance}</small>
          </div>
        </div>
      ) : (
        <div className="third-waiting">
          <strong>Aguardando confronto</strong>
          <small>Quando a linha do 3º lugar entrar no placar, ela aparece aqui sem disputar destaque com a final.</small>
        </div>
      )}
    </div>
  );
}

function WaitingFinalCard() {
  return (
    <div className="final-card-v2 final-waiting-card-v2">
      <div>
        <h3>Aguardando finalistas</h3>
        <p>Assim que a aba de placar receber a linha da FINAL, este painel passa a mostrar o confronto decisivo.</p>
      </div>
    </div>
  );
}

function Header({ updatedAt }: { updatedAt: string }) {
  return (
    <header className="final-topbar-v2">
      <div className="brand-area-v2">
        <div className="brand-mark-v2"><HoneyIcon /></div>
        <div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>GRANDE FINAL AO VIVO • DISPUTA POR CONTRATOS</p>
        </div>
      </div>
      <LivePill />
      <div className="update-box-v2">Atualizado às <strong>{updatedAt}</strong></div>
    </header>
  );
}

function TeamBlock({ team, align, advancing, size = 'normal' }: { team: Team; align: 'left' | 'right'; advancing: boolean; size?: 'normal' | 'large' }) {
  return (
    <div className={`team-block-v2 ${align} ${size} ${advancing ? 'advancing' : ''}`}>
      {align === 'left' && <TeamBadge team={team} />}
      <div className="team-name-v2">
        <strong>{team.primary}</strong>
        <span className={`tone-${team.tone}`}>{team.secondary}</span>
      </div>
      {align === 'right' && <TeamBadge team={team} />}
    </div>
  );
}

function CompactTeam({ team, right = false }: { team: Team; right?: boolean }) {
  return (
    <div className={`compact-team ${right ? 'right' : ''}`}>
      <strong>{team.primary}</strong>
      <span>{team.secondary}</span>
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
  const tone = row.position <= 2 ? 'green' : row.position <= 4 ? 'orange' : 'blue';
  return (
    <div className="ranking-item-v2">
      <span className={`rank-badge-v2 ${tone}`}>{row.position}</span>
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
        <div className="goal-team-line-v2"><span>🐝</span><strong>{goal.teamName} marca!</strong></div>
        <div className="goal-score-v2"><span>PLACAR:</span><strong>{goal.score}</strong></div>
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

function getThirdPlaceMatch(matches: Match[], finalId?: string) {
  const explicit = matches.find((match) => {
    const id = normalizeText(match.id);
    return id.includes('terceiro') || id.includes('terceira') || id.includes('bronze') || id.includes('3l') || id.includes('3o') || id.includes('3 lugar') || id.includes('terceiro lugar');
  });

  if (explicit) return explicit;

  if (!finalId) return matches[1] ?? null;
  return matches.find((match) => match.id !== finalId) ?? null;
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
  .final-screen { --gold: #ffc22a; --orange: #ff8619; --green: #58c94f; --blue: #3c94ea; position: relative; width: 100vw; height: 100vh; overflow: hidden; background: radial-gradient(circle at 50% -5%, rgba(255,194,42,.15), transparent 30%), linear-gradient(135deg, #020812 0%, #061524 54%, #020812 100%); color: #f5f7fb; isolation: isolate; }
  .background-grid { position: absolute; inset: 0; z-index: -1; opacity: .34; background-image: linear-gradient(30deg, rgba(255,255,255,.04) 1px, transparent 1px), radial-gradient(circle at 1px 1px, rgba(255,194,42,.10) 1px, transparent 0); background-size: 92px 92px, 34px 34px; }
  .loading-screen { display: grid; place-items: center; }
  .loader-card { width: min(640px, 70vw); padding: 42px 48px; text-align: center; border: 1px solid rgba(255,194,42,.45); background: rgba(5,17,29,.86); box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 80px rgba(255,194,42,.07); }
  .loader-card h1, .final-topbar-v2 h1, .final-topline-v2 h2, .final-topline-v2 span, .final-card-v2, .panel-title-v2, .team-name-v2, .final-score-core-v2, .rank-badge-v2, .goal-card-v2 h2 { font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .025em; }
  .brand-mark-v2, .brand-mark.mini { width: 54px; height: 54px; display: grid; place-items: center; border: 2px solid var(--gold); clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%); }
  .brand-mark-v2 svg, .brand-mark.mini svg, .ticker-label-v2 svg { width: 34px; height: 34px; }
  .brand-mark-v2 svg path, .brand-mark.mini svg path, .ticker-label-v2 svg path { fill: none; stroke: var(--gold); stroke-width: 4; stroke-linejoin: round; }
  .final-topbar-v2 { height: 92px; padding: 16px 28px 12px; display: grid; grid-template-columns: 1fr 110px 250px; align-items: center; gap: 22px; border-bottom: 1px solid rgba(255,255,255,.14); background: rgba(2,8,18,.94); }
  .brand-area-v2 { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .final-topbar-v2 h1 { margin: 0; font-size: clamp(32px, 3.4vw, 58px); line-height: .82; font-weight: 900; font-style: italic; }
  .final-topbar-v2 p { margin: 6px 0 0; color: var(--gold); font-size: 13px; font-weight: 800; }
  .update-box-v2 { justify-self: end; color: rgba(255,255,255,.78); font-weight: 800; text-transform: uppercase; }
  .update-box-v2 strong { color: var(--gold); font-size: 26px; }
  .live-pill-v2 { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 34px; padding: 0 14px; border: 1px solid rgba(88,201,79,.42); border-radius: 999px; color: #dfffe0; font-size: 13px; font-weight: 900; }
  .live-pill-v2.compact { height: 26px; padding: 0 10px; font-size: 11px; }
  .live-pill-v2 i { width: 9px; height: 9px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 5px rgba(88,201,79,.15); }
  .final-stage-v2 { height: calc(100vh - 148px); padding: 18px 24px 16px; display: grid; grid-template-columns: minmax(0, 1.62fr) minmax(355px, .68fr); gap: 18px; }
  .final-main-v2 { min-height: 0; display: grid; grid-template-rows: 112px 1fr; gap: 18px; }
  .final-side-v2 { min-height: 0; display: grid; grid-template-rows: 0.72fr 1.28fr; gap: 18px; }
  .final-topline-v2 { padding: 16px 24px; display: grid; grid-template-columns: 1fr 210px; align-items: center; gap: 18px; border: 1px solid rgba(255,255,255,.16); background: linear-gradient(135deg, rgba(9,21,35,.96), rgba(2,8,18,.76)); box-shadow: 0 22px 70px rgba(0,0,0,.24), inset 0 0 55px rgba(255,255,255,.025); }
  .final-topline-v2 span { display: block; color: var(--gold); font-size: 20px; font-weight: 900; }
  .final-topline-v2 h2 { margin: 4px 0 0; color: white; font-size: clamp(48px, 5vw, 82px); line-height: .8; font-weight: 900; font-style: italic; }
  .final-topline-v2 p { margin: 8px 0 0; color: rgba(255,255,255,.68); font-size: 14px; }
  .final-date-card-v2 { padding: 12px 16px; text-align: center; border: 2px solid var(--gold); background: rgba(2,9,17,.72); transform: skewX(-8deg); }
  .final-date-card-v2 strong { display: block; color: white; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: 48px; line-height: .82; font-weight: 900; }
  .final-date-card-v2 small { display: block; margin-top: 8px; color: var(--gold); font-size: 11px; font-weight: 800; line-height: 1.14; text-transform: uppercase; transform: skewX(8deg); }
  .final-card-v2 { min-height: 0; padding: 24px 30px 26px; display: grid; grid-template-rows: auto 1fr auto; border: 1px solid rgba(255,255,255,.18); background: radial-gradient(circle at 50% 0%, rgba(255,194,42,.16), transparent 42%), linear-gradient(180deg, rgba(7,20,34,.98), rgba(5,16,28,.94)); box-shadow: 0 24px 80px rgba(0,0,0,.42), inset 0 0 80px rgba(255,255,255,.03); overflow: hidden; }
  .final-status-row-v2 { display: flex; align-items: center; justify-content: space-between; gap: 18px; color: rgba(255,255,255,.74); font-weight: 900; text-transform: uppercase; }
  .final-status-row-v2 strong, .final-status-row-v2 em { color: var(--gold); font-style: normal; }
  .final-score-row-v2 { display: grid; grid-template-columns: minmax(230px, 1fr) minmax(240px, .64fr) minmax(230px, 1fr); align-items: center; gap: 24px; min-height: 245px; }
  .team-block-v2 { display: flex; align-items: center; gap: 18px; min-width: 0; }
  .team-block-v2.right { justify-content: flex-end; text-align: right; }
  .team-badge-v2 { width: clamp(80px, 6vw, 112px); height: clamp(80px, 6vw, 112px); display: grid; place-items: center; border: 2px solid currentColor; border-radius: 50%; background: rgba(255,255,255,.04); flex: 0 0 auto; }
  .team-badge-v2 svg { width: 66%; height: 66%; }
  .team-badge-v2 svg path { fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  .tone-green { color: var(--green); }
  .tone-blue { color: var(--blue); }
  .tone-gold { color: var(--gold); }
  .tone-orange { color: var(--orange); }
  .team-name-v2 strong { display: block; color: white; font-size: clamp(44px, 4.4vw, 76px); line-height: .82; font-weight: 900; font-style: italic; overflow: hidden; text-overflow: ellipsis; }
  .team-name-v2 span { display: block; margin-top: 6px; font-size: clamp(25px, 2.25vw, 42px); line-height: .95; font-weight: 900; font-style: italic; overflow: hidden; text-overflow: ellipsis; }
  .final-score-core-v2 { height: clamp(134px, 17vh, 198px); display: flex; align-items: center; justify-content: center; gap: 22px; border: 1px solid rgba(255,194,42,.34); background: radial-gradient(circle at 50% 45%, rgba(255,134,25,.14), rgba(3,11,20,.86)); box-shadow: inset 0 0 55px rgba(255,194,42,.06), 0 22px 60px rgba(0,0,0,.3); clip-path: polygon(9% 0, 91% 0, 100% 50%, 91% 100%, 9% 100%, 0 50%); }
  .final-score-core-v2 span { font-size: clamp(90px, 10.2vw, 165px); font-weight: 900; font-style: italic; line-height: .82; color: white; text-shadow: 0 8px 28px rgba(0,0,0,.45); }
  .final-score-core-v2 em { font-size: clamp(34px, 3.2vw, 54px); font-weight: 900; font-style: italic; color: var(--orange); }
  .final-meta-grid-v2 { display: grid; grid-template-columns: 1.25fr .85fr .85fr; gap: 12px; }
  .meta-item-v2 { min-height: 72px; padding: 12px 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.035); }
  .meta-item-v2 span { display: block; color: rgba(255,255,255,.58); font-size: 11px; font-weight: 900; text-transform: uppercase; }
  .meta-item-v2 strong { display: block; margin-top: 7px; color: white; font-size: clamp(15px, 1.35vw, 23px); line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta-item-v2 strong.highlight { color: var(--gold); }
  .final-waiting-card-v2 { display: grid; place-items: center; text-align: center; color: rgba(255,255,255,.72); }
  .final-waiting-card-v2 h3 { margin: 0; color: white; font-size: clamp(48px, 5vw, 84px); font-style: italic; text-transform: uppercase; }
  .side-panel { min-height: 0; padding: 16px 18px; border: 1px solid rgba(255,255,255,.16); background: linear-gradient(180deg, rgba(7,20,34,.96), rgba(5,16,28,.92)); box-shadow: 0 18px 55px rgba(0,0,0,.30), inset 0 0 48px rgba(255,255,255,.025); overflow: hidden; }
  .panel-title-v2 { color: var(--gold); font-size: clamp(20px, 1.55vw, 28px); font-weight: 900; }
  .bronze-title { color: #d7a15b; }
  .third-match-content { margin-top: 14px; display: grid; gap: 14px; }
  .third-mini-row { display: grid; grid-template-columns: 1fr 100px 1fr; align-items: center; gap: 10px; }
  .compact-team { min-width: 0; }
  .compact-team.right { text-align: right; }
  .compact-team strong { display: block; color: white; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: clamp(22px, 1.8vw, 34px); line-height: .92; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .compact-team span { display: block; margin-top: 4px; color: rgba(255,255,255,.72); font-size: 12px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .third-score { height: 64px; display: flex; align-items: center; justify-content: center; gap: 10px; border: 1px solid rgba(215,161,91,.45); background: rgba(215,161,91,.08); }
  .third-score span { color: white; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: 48px; font-weight: 900; line-height: .8; }
  .third-score em { color: #d7a15b; font-style: normal; font-weight: 900; }
  .third-meta { padding: 12px 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.035); }
  .third-meta strong { display: block; color: #d7a15b; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .third-meta small, .third-waiting small { display: block; margin-top: 6px; color: rgba(255,255,255,.70); line-height: 1.25; }
  .third-waiting { height: calc(100% - 36px); display: grid; align-content: center; gap: 6px; color: rgba(255,255,255,.76); }
  .third-waiting strong { color: white; font-size: 20px; text-transform: uppercase; }
  .ranking-side-panel p { margin: 7px 0 13px; color: rgba(255,255,255,.70); font-size: 13px; }
  .ranking-list-v2 { display: grid; gap: 10px; animation: rankingSwapIn .68s cubic-bezier(.18,.72,.18,1) both; }
  @keyframes rankingSwapIn { from { opacity: 0; transform: translateY(8px); filter: blur(4px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
  .ranking-item-v2 { min-height: 46px; display: grid; grid-template-columns: 42px 1fr 92px; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .rank-badge-v2 { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; color: #07111e; font-weight: 900; background: var(--blue); }
  .rank-badge-v2.green { background: var(--green); }
  .rank-badge-v2.orange { background: var(--orange); }
  .ranking-item-v2 strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: white; font-weight: 900; }
  .ranking-item-v2 em { color: var(--gold); font-style: normal; text-align: right; font-weight: 900; white-space: nowrap; }
  .ticker-bar-v2 { height: 56px; padding: 0 24px; display: grid; grid-template-columns: 170px 1fr 260px; align-items: center; gap: 18px; border-top: 1px solid rgba(255,255,255,.13); background: rgba(2,8,18,.94); }
  .ticker-label-v2 { display: flex; align-items: center; gap: 10px; color: white; }
  .ticker-track-v2 { overflow: hidden; white-space: nowrap; }
  .ticker-content-v2 { display: inline-block; color: rgba(255,255,255,.78); font-weight: 800; animation: finalTicker 38s linear infinite; }
  @keyframes finalTicker { from { transform: translateX(45%); } to { transform: translateX(-100%); } }
  .footer-brand-v2 { justify-self: end; color: var(--gold); font-weight: 900; text-transform: uppercase; }
  .goal-layer-v2 { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(2,8,18,.78); backdrop-filter: blur(8px); }
  .goal-card-v2 { width: min(760px, 70vw); padding: 36px 42px; text-align: center; border: 2px solid var(--gold); background: radial-gradient(circle at 50% 0%, rgba(255,194,42,.20), rgba(5,16,28,.96)); box-shadow: 0 30px 120px rgba(0,0,0,.65); }
  .goal-card-v2 h2 { margin: 18px 0; color: white; font-size: clamp(100px, 12vw, 180px); line-height: .8; font-style: italic; }
  .goal-team-line-v2 { display: flex; align-items: center; justify-content: center; gap: 14px; color: var(--gold); font-size: 28px; }
  .goal-score-v2 { margin-top: 22px; display: flex; align-items: center; justify-content: center; gap: 16px; }
  .goal-score-v2 strong { color: white; font-size: 52px; }
  @media (max-height: 760px) { .final-topbar-v2 { height: 82px; padding-top: 12px; } .final-stage-v2 { height: calc(100vh - 136px); padding-top: 14px; padding-bottom: 12px; } .ticker-bar-v2 { height: 54px; } .final-main-v2 { grid-template-rows: 96px 1fr; gap: 14px; } .final-side-v2, .final-stage-v2 { gap: 14px; } .final-card-v2 { padding: 20px 24px; } .final-score-row-v2 { min-height: 220px; } .final-score-core-v2 span { font-size: clamp(80px, 9vw, 142px); } }
`;
