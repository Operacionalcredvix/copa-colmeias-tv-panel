'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Team = {
  name: string;
  primary: string;
  secondary: string;
  tone: string;
  badge: string;
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

type PanelPayload = {
  ok: boolean;
  updatedAt: string;
  headlineDate: string;
  matches: Match[];
  source?: string;
  warning?: string;
};

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);

export default function ChampionPage() {
  const [data, setData] = useState<PanelPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/placar', { cache: 'no-store' });
      const payload = (await response.json()) as PanelPayload;
      if (payload.ok) setData(payload);
    } catch (error) {
      console.error('Erro ao carregar tela de campeão', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const finalMatch = useMemo(() => {
    if (!data?.matches?.length) return null;
    return data.matches.find((match) => normalizeText(match.id).includes('final')) ?? data.matches[0];
  }, [data]);

  const champion = useMemo(() => {
    if (!finalMatch) return null;
    if (finalMatch.leftScore === finalMatch.rightScore) return finalMatch.advancing || 'Decisão por critério';
    return finalMatch.leftScore > finalMatch.rightScore ? finalMatch.left.name : finalMatch.right.name;
  }, [finalMatch]);

  const runnerUp = useMemo(() => {
    if (!finalMatch || !champion) return null;
    const normalizedChampion = normalizeText(champion);
    if (normalizedChampion.includes(normalizeText(finalMatch.left.name).split(' ')[0])) return finalMatch.right.name;
    if (normalizedChampion.includes(normalizeText(finalMatch.right.name).split(' ')[0])) return finalMatch.left.name;
    return finalMatch.leftScore >= finalMatch.rightScore ? finalMatch.right.name : finalMatch.left.name;
  }, [finalMatch, champion]);

  if (isLoading && !data) {
    return (
      <main className="champion-screen">
        <style jsx global>{styles}</style>
        <div className="champion-bg" />
        <section className="loading-card">
          <TrophyIcon />
          <h1>Carregando campeã...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="champion-screen">
      <style jsx global>{styles}</style>
      <div className="champion-bg" />
      <div className="confetti c1" />
      <div className="confetti c2" />
      <div className="confetti c3" />

      <header className="champion-header">
        <div className="brand-seal">COPA DAS COLMEIAS 2026</div>
        <div className="live-chip">TÍTULO DEFINIDO</div>
      </header>

      <section className="champion-stage">
        <div className="trophy-wrap">
          <TrophyIcon />
          <div className="trophy-glow" />
        </div>

        <div className="champion-copy">
          <span className="eyebrow">CAMPEÃ DA COPA DAS COLMEIAS</span>
          <h1>{champion ? abbreviateStoreName(champion) : 'Aguardando resultado'}</h1>
          <p>Parabéns pela conquista. Cada contrato foi um gol. Hoje, valeu o título.</p>
        </div>

        {finalMatch && (
          <div className="score-card">
            <span>PLACAR FINAL</span>
            <strong>{finalMatch.leftScore} <em>x</em> {finalMatch.rightScore}</strong>
            <div className="match-line">
              <b>{abbreviateStoreName(finalMatch.left.name)}</b>
              <i>vs</i>
              <b>{abbreviateStoreName(finalMatch.right.name)}</b>
            </div>
          </div>
        )}
      </section>

      <footer className="champion-footer">
        <div>
          <span>VICE-CAMPEÃ</span>
          <strong>{runnerUp ? abbreviateStoreName(runnerUp) : 'Aguardando'}</strong>
        </div>
        <div>
          <span>CRITÉRIO</span>
          <strong>{finalMatch?.criterion || 'Contratos'}</strong>
        </div>
        <div>
          <span>ATUALIZADO ÀS</span>
          <strong>{data?.updatedAt || '--h--'}</strong>
        </div>
      </footer>
    </main>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true" className="trophy-icon">
      <path d="M47 25h66v18c0 35-14 56-33 56S47 78 47 43V25Z" />
      <path d="M47 36H22c2 25 12 39 31 43" />
      <path d="M113 36h25c-2 25-12 39-31 43" />
      <path d="M80 99v24" />
      <path d="M56 136h48" />
      <path d="M66 123h28l8 13H58l8-13Z" />
      <path d="M68 48l12-8 12 8-4 14H72l-4-14Z" />
    </svg>
  );
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function abbreviateStoreName(value: string) {
  return value
    .replace(/Cariacica Campo Grande/g, 'Cariacica Campo Grande')
    .replace(/Linhares Centro/g, 'Linhares Centro')
    .replace(/Vitória Praia do Canto/g, 'Vitória Praia do Canto')
    .replace(/Teixeira de Freitas Centro/g, 'Teixeira de Freitas')
    .trim();
}

const styles = `
  body {
    margin: 0;
    background: #020812;
  }

  .champion-screen {
    --gold: #ffc22a;
    --deep-gold: #ff8619;
    --green: #58e94f;
    --blue: #32a6ff;
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(circle at 50% 12%, rgba(255, 194, 42, .32), transparent 32%),
      radial-gradient(circle at 12% 68%, rgba(88, 233, 79, .14), transparent 26%),
      radial-gradient(circle at 88% 62%, rgba(50, 166, 255, .16), transparent 28%),
      linear-gradient(135deg, #020711 0%, #071927 48%, #020711 100%);
    isolation: isolate;
    font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
    text-transform: uppercase;
  }

  .champion-bg {
    position: absolute;
    inset: 0;
    z-index: -3;
    background-image:
      linear-gradient(30deg, rgba(255,255,255,.045) 1px, transparent 1px),
      linear-gradient(150deg, rgba(255,255,255,.025) 1px, transparent 1px),
      radial-gradient(circle at 1px 1px, rgba(255,194,42,.18) 1px, transparent 0);
    background-size: 110px 110px, 110px 110px, 34px 34px;
    opacity: .52;
  }

  .champion-screen::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    background:
      linear-gradient(115deg, transparent 0 43%, rgba(255, 194, 42, .16) 44%, transparent 45% 100%),
      linear-gradient(245deg, transparent 0 48%, rgba(255, 134, 25, .12) 49%, transparent 50% 100%);
  }

  .champion-header {
    height: 92px;
    padding: 22px 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand-seal,
  .live-chip {
    border: 1px solid rgba(255,194,42,.48);
    background: rgba(5,17,29,.72);
    box-shadow: 0 0 24px rgba(255,194,42,.10), inset 0 0 30px rgba(255,194,42,.035);
    font-weight: 900;
    letter-spacing: .08em;
  }

  .brand-seal {
    padding: 13px 18px;
    color: var(--gold);
    font-size: 18px;
  }

  .live-chip {
    padding: 13px 20px;
    color: #07111e;
    background: linear-gradient(90deg, var(--gold), #ffe274, var(--deep-gold));
    border-color: transparent;
    font-size: 18px;
  }

  .champion-stage {
    height: calc(100vh - 216px);
    padding: 12px 48px 0;
    display: grid;
    grid-template-columns: 330px minmax(0, 1fr);
    grid-template-rows: 1fr 132px;
    gap: 20px 34px;
    align-items: center;
  }

  .trophy-wrap {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
  }

  .trophy-icon {
    position: relative;
    z-index: 2;
    width: min(290px, 26vw);
    height: min(290px, 26vw);
    filter: drop-shadow(0 0 34px rgba(255,194,42,.45));
  }

  .trophy-icon path {
    fill: none;
    stroke: var(--gold);
    stroke-width: 8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .trophy-glow {
    position: absolute;
    width: 330px;
    height: 330px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,194,42,.30), transparent 62%);
    filter: blur(8px);
  }

  .champion-copy {
    min-width: 0;
  }

  .eyebrow {
    display: inline-flex;
    padding: 9px 16px;
    color: #07111e;
    background: linear-gradient(90deg, var(--gold), #ffe274);
    font-size: clamp(24px, 2vw, 38px);
    line-height: 1;
    font-weight: 900;
    font-style: italic;
    clip-path: polygon(5% 0, 100% 0, 95% 100%, 0 100%);
  }

  .champion-copy h1 {
    margin: 22px 0 0;
    color: white;
    font-size: clamp(96px, 10vw, 178px);
    line-height: .78;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -.035em;
    text-shadow: 0 8px 0 rgba(0,0,0,.34), 0 0 40px rgba(255,194,42,.24);
  }

  .champion-copy p {
    margin: 24px 0 0;
    max-width: 960px;
    color: rgba(255,255,255,.86);
    font-family: Arial, sans-serif;
    text-transform: none;
    font-size: clamp(18px, 1.55vw, 27px);
    line-height: 1.3;
    font-weight: 700;
  }

  .score-card {
    grid-column: 1 / -1;
    height: 132px;
    padding: 18px 28px;
    display: grid;
    grid-template-columns: 190px 340px minmax(0, 1fr);
    align-items: center;
    gap: 22px;
    border: 1px solid rgba(255,194,42,.48);
    background:
      linear-gradient(135deg, rgba(255,194,42,.12), transparent 34%),
      rgba(4,14,26,.88);
    box-shadow: 0 20px 60px rgba(0,0,0,.34), inset 0 0 48px rgba(255,194,42,.04);
  }

  .score-card span,
  .champion-footer span {
    color: var(--gold);
    font-size: 18px;
    font-weight: 900;
    letter-spacing: .08em;
  }

  .score-card strong {
    color: white;
    font-size: 90px;
    line-height: .8;
    font-weight: 900;
    font-style: italic;
    white-space: nowrap;
  }

  .score-card em {
    color: var(--deep-gold);
    font-style: italic;
  }

  .match-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    color: white;
    font-size: 30px;
    line-height: .95;
    font-weight: 900;
    font-style: italic;
  }

  .match-line b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .match-line i {
    color: var(--gold);
    font-style: italic;
    text-align: center;
  }

  .champion-footer {
    height: 124px;
    padding: 16px 34px 24px;
    display: grid;
    grid-template-columns: 1.15fr .85fr .65fr;
    gap: 18px;
  }

  .champion-footer div {
    padding: 18px 22px;
    border: 1px solid rgba(255,194,42,.30);
    background: rgba(4,14,26,.76);
    box-shadow: inset 0 0 34px rgba(255,255,255,.025);
  }

  .champion-footer strong {
    display: block;
    margin-top: 7px;
    color: white;
    font-size: clamp(26px, 2.4vw, 42px);
    line-height: .9;
    font-weight: 900;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .confetti {
    position: absolute;
    z-index: -1;
    width: 180px;
    height: 180px;
    background:
      radial-gradient(circle, var(--gold) 0 3px, transparent 4px),
      radial-gradient(circle, var(--green) 0 3px, transparent 4px),
      radial-gradient(circle, var(--blue) 0 3px, transparent 4px),
      radial-gradient(circle, var(--deep-gold) 0 3px, transparent 4px);
    background-size: 30px 30px, 40px 40px, 48px 48px, 36px 36px;
    opacity: .42;
    filter: blur(.2px);
  }

  .c1 { top: 105px; left: 42px; transform: rotate(-12deg); }
  .c2 { top: 120px; right: 44px; transform: rotate(18deg); }
  .c3 { bottom: 105px; left: 48%; transform: rotate(6deg); opacity: .26; }

  .loading-card {
    height: 100vh;
    display: grid;
    place-items: center;
    text-align: center;
  }

  .loading-card h1 {
    color: var(--gold);
    font-size: 64px;
    font-weight: 900;
    font-style: italic;
  }

  @media (max-height: 760px) {
    .champion-header {
      height: 78px;
      padding: 17px 28px;
    }

    .champion-stage {
      height: calc(100vh - 184px);
      grid-template-columns: 270px minmax(0, 1fr);
      grid-template-rows: 1fr 112px;
      padding: 8px 40px 0;
    }

    .trophy-icon {
      width: min(230px, 22vw);
      height: min(230px, 22vw);
    }

    .champion-copy h1 {
      font-size: clamp(82px, 8.9vw, 148px);
    }

    .score-card {
      height: 112px;
      grid-template-columns: 170px 290px minmax(0, 1fr);
      padding: 14px 24px;
    }

    .score-card strong {
      font-size: 72px;
    }

    .match-line {
      font-size: 25px;
    }

    .champion-footer {
      height: 106px;
      padding: 12px 28px 18px;
    }

    .champion-footer div {
      padding: 14px 18px;
    }
  }
`;
