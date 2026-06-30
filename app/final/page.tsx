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
const STORAGE_KEY = 'copa-colmeias-final-last-scores-v5';
const RANKING_ROTATE_MS = 7000;
const FOOTER_ROTATE_MS = 3800;

export default function FinalPage() {
  const [data, setData] = useState<PanelPayload | null>(null);
  const [activeGoal, setActiveGoal] = useState<GoalEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rankingPage, setRankingPage] = useState(0);
  const [footerIndex, setFooterIndex] = useState(0);

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
  const scheduleNote = 'Final ao vivo';

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

  useEffect(() => {
    const total = data?.ticker.length ?? 0;
    if (!total) {
      setFooterIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setFooterIndex((prev) => (prev + 1) % total);
    }, FOOTER_ROTATE_MS);

    return () => window.clearInterval(interval);
  }, [data?.ticker.length]);

  const visibleRanking = useMemo(() => {
    if (!data) return [];
    const start = rankingPage * 5;
    return data.rankingTop.slice(start, start + 5);
  }, [data, rankingPage]);

  const rankingWindowLabel = rankingPage === 0 ? '1º ao 5º' : '6º ao 10º';
  const footerRow = data?.ticker.length ? data.ticker[footerIndex % data.ticker.length] : null;

  const leaderInfo = useMemo(() => {
    if (!finalMatch) {
      return {
        label: 'Aguardando',
        name: 'Finalistas',
        detail: 'Placar oficial'
      };
    }

    if (finalMatch.leftScore === finalMatch.rightScore) {
      return {
        label: 'Empate no placar',
        name: finalMatch.advancing || 'Decisão por valor',
        detail: finalMatch.criterion || 'Valor produzido'
      };
    }

    return {
      label: 'Vencendo agora',
      name: finalMatch.advancing,
      detail: finalMatch.distance
    };
  }, [finalMatch]);

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
      // Sem efeito crítico para TV.
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
    <main className={`final-screen sport-edition ${activeGoal ? 'goal-active' : ''}`}>
      <style jsx global>{polishStyles}</style>
      <div className="background-grid" />
      <div className="stadium-lights" />
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
            <span>{leaderInfo.label}</span>
            <strong>{abbreviateStoreName(leaderInfo.name)}</strong>
            <div className="title-tags">
              <b>{leaderInfo.detail}</b>
              <b>Placar oficial</b>
            </div>
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

      <footer className="ticker-bar slide-footer">
        <div className="ticker-label"><HoneyIcon /><strong>11º AO 20º</strong></div>
        <div key={footerRow ? `${footerRow.position}-${footerRow.name}` : 'empty'} className="ticker-slide">
          {footerRow ? (
            <>
              <span>{footerRow.position}º LUGAR</span>
              <strong>{abbreviateStoreName(footerRow.name)}</strong>
              <em>{footerRow.value}</em>
            </>
          ) : (
            <strong>Aguardando ranking geral</strong>
          )}
        </div>
        <div className="footer-brand">CREDVIX • CADA CONTRATO É UM GOL</div>
      </footer>

      {activeGoal && <GoalOverlay goal={activeGoal} />}
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="final-screen loading-screen sport-edition">
      <style jsx global>{polishStyles}</style>
      <div className="background-grid" />
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
        <div className="brand-mark trophy-mark"><HoneyIcon /></div>
        <div>
          <h1>COPA DAS COLMEIAS</h1>
          <p>GRANDE FINAL AO VIVO • DISPUTA POR CONTRATOS</p>
        </div>
      </div>

      <div className="status-area">
        <LivePill />
        <div className="update-box"><span>Atualizado às</span><strong>{updatedAt}</strong></div>
      </div>
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
      <div className="pitch-glow" />
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
        <MetaItem icon="🏆" label={leaderLabel} value={match.advancing} highlight />
        <MetaItem icon="📋" label="Critério atual" value={match.criterion} />
        <MetaItem icon="📍" label="Distância" value={match.distance} highlight={match.distance.includes('+')} />
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
      <strong title={row.name}>{abbreviateStoreName(row.name)}</strong>
      <em>{row.value}</em>
    </div>
  );
}

function MetaItem({ icon, label, value, highlight = false }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="meta-item">
      <i>{icon}</i>
      <div>
        <span>{label}</span>
        <strong className={highlight ? 'highlight' : ''}>{value}</strong>
      </div>
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

function abbreviateStoreName(value: string) {
  return value
    .replace(/Várzea Grande/g, 'Várzea G.')
    .replace(/Varzea Grande/g, 'Várzea G.')
    .replace(/Cachoeiro de Itapemirim/g, 'Cachoeiro de Itap.')
    .replace(/Teixeira de Freitas Centro/g, 'Teixeira de Freitas')
    .replace(/Vitória Praia do Canto/g, 'Vitória P. do Canto')
    .replace(/Cariacica Campo Grande/g, 'Cariacica C. Grande')
    .replace(/Brasília Taguatinga/g, 'Brasília Tag.')
    .replace(/Brasília Ceilândia Sul/g, 'Brasília Ceilândia')
    .replace(/Cariacica Expedito Garcia/g, 'Cariacica Exp. Garcia')
    .trim();
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const polishStyles = `
  .final-screen .final-main {
    grid-template-rows: 166px 1fr !important;
  }

  .final-screen .final-hero {
    padding-top: 16px !important;
    padding-bottom: 14px !important;
  }

  .final-screen .final-hero::before {
    bottom: 8px !important;
    opacity: .35 !important;
  }

  .final-screen .final-hero h2 {
    font-size: clamp(72px, 7vw, 118px) !important;
    line-height: .78 !important;
  }

  .final-screen .final-hero p {
    position: relative !important;
    z-index: 2 !important;
    margin-top: 7px !important;
    padding-bottom: 2px !important;
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    line-height: 1.12 !important;
  }

  .final-screen .final-aside {
    grid-template-rows: 148px 1fr !important;
  }

  .final-screen .title-panel {
    justify-content: flex-start !important;
    padding: 16px 18px 12px !important;
    overflow: hidden !important;
  }

  .final-screen .title-panel span {
    display: block !important;
    font-size: 11px !important;
    line-height: 1 !important;
    margin-bottom: 7px !important;
  }

  .final-screen .title-panel strong {
    display: block !important;
    margin: 0 !important;
    color: #fff !important;
    font-size: 29px !important;
    line-height: .92 !important;
    font-weight: 900 !important;
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    max-height: 54px !important;
  }

  .final-screen .title-tags {
    margin-top: 10px !important;
    gap: 7px !important;
  }

  .final-screen .title-tags b {
    height: 22px !important;
    padding: 0 9px !important;
    font-size: 9px !important;
    line-height: 1 !important;
  }

  @media (max-height: 760px) {
    .final-screen .final-main {
      grid-template-rows: 136px 1fr !important;
    }

    .final-screen .final-hero {
      padding-top: 13px !important;
      padding-bottom: 11px !important;
    }

    .final-screen .final-hero h2 {
      font-size: clamp(58px, 6.05vw, 88px) !important;
    }

    .final-screen .final-hero p {
      margin-top: 5px !important;
      font-size: 13px !important;
    }

    .final-screen .final-aside {
      grid-template-rows: 128px 1fr !important;
    }

    .final-screen .title-panel {
      padding: 13px 16px 10px !important;
    }

    .final-screen .title-panel strong {
      font-size: 25px !important;
      max-height: 47px !important;
    }

    .final-screen .title-tags b {
      height: 20px !important;
      font-size: 8.5px !important;
    }
  }
`;
