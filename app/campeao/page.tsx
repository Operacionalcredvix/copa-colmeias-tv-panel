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
    const leftToken = normalizeText(finalMatch.left.name).split(' ')[0];
    const rightToken = normalizeText(finalMatch.right.name).split(' ')[0];

    if (normalizedChampion.includes(leftToken)) return finalMatch.right.name;
    if (normalizedChampion.includes(rightToken)) return finalMatch.left.name;
    return finalMatch.leftScore >= finalMatch.rightScore ? finalMatch.right.name : finalMatch.left.name;
  }, [finalMatch, champion]);

  const championLines = splitChampionName(champion ?? 'Aguardando resultado');
  const leftName = finalMatch ? abbreviateStoreName(finalMatch.left.name) : 'Finalista A';
  const rightName = finalMatch ? abbreviateStoreName(finalMatch.right.name) : 'Finalista B';

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
      <div className="light-beam beam-left" />
      <div className="light-beam beam-right" />
      <div className="honey-pattern" />
      <div className="confetti c1" />
      <div className="confetti c2" />
      <div className="confetti c3" />

      <header className="champion-header">
        <div className="brand-seal">
          <span className="mini-hex"><HoneyMark /></span>
          <strong>COPA DAS COLMEIAS</strong>
          <b>2026</b>
        </div>
        <div className="title-chip">TÍTULO DEFINIDO</div>
      </header>

      <section className="champion-stage">
        <aside className="trophy-zone">
          <div className="trophy-rings" />
          <div className="trophy-wrap"><TrophyIcon /></div>
          <div className="podium" />
        </aside>

        <section className="hero-zone">
          <div className="gold-ribbon">
            <span>CAMPEÃ DA COPA DAS COLMEIAS</span>
            <i />
            <i />
            <i />
          </div>

          <h1 className="champion-name">
            {championLines.map((line) => <span key={line}>{line}</span>)}
          </h1>

          <p className="champion-message">Parabéns pela conquista. Cada contrato foi um gol. Hoje, valeu o título.</p>
        </section>

        <section className="score-strip">
          <div className="score-label">
            <span>PLACAR FINAL</span>
            <i />
          </div>

          <div className="score-number">
            <strong>{finalMatch?.leftScore ?? '--'}</strong>
            <em>x</em>
            <strong>{finalMatch?.rightScore ?? '--'}</strong>
          </div>

          <div className="teams-vs">
            <b>{leftName}</b>
            <span>VS</span>
            <b>{rightName}</b>
          </div>
        </section>
      </section>

      <footer className="champion-footer">
        <InfoCard icon="trophy" label="VICE-CAMPEÃ" value={runnerUp ? abbreviateStoreName(runnerUp) : 'Aguardando'} />
        <InfoCard icon="clipboard" label="CRITÉRIO" value={finalMatch?.criterion || 'Contratos'} />
        <InfoCard icon="clock" label="ATUALIZADO ÀS" value={data?.updatedAt || '--h--'} />
      </footer>
    </main>
  );
}

function InfoCard({ icon, label, value }: { icon: 'trophy' | 'clipboard' | 'clock'; label: string; value: string }) {
  return (
    <div className="info-card">
      <div className="info-icon">
        {icon === 'trophy' && <SmallTrophy />}
        {icon === 'clipboard' && <ClipboardIcon />}
        {icon === 'clock' && <ClockIcon />}
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 220 250" aria-hidden="true" className="trophy-icon">
      <defs>
        <linearGradient id="cupGold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff2a6" />
          <stop offset=".24" stopColor="#ffc22a" />
          <stop offset=".52" stopColor="#ff8a12" />
          <stop offset=".78" stopColor="#ffe26a" />
          <stop offset="1" stopColor="#a45a00" />
        </linearGradient>
      </defs>
      <path d="M62 28h96v36c0 55-20 88-48 88S62 119 62 64V28Z" />
      <path d="M62 48H25c3 41 19 63 48 72" />
      <path d="M158 48h37c-3 41-19 63-48 72" />
      <path d="M110 152v34" />
      <path d="M76 215h68" />
      <path d="M88 186h44l14 29H74l14-29Z" />
      <path d="M92 76l18-13 18 13-7 25H99l-7-25Z" />
    </svg>
  );
}

function HoneyMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 5 55 18v28L32 59 9 46V18L32 5Z" />
      <path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z" />
    </svg>
  );
}

function SmallTrophy() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 10h24v13c0 15-5 24-12 24s-12-9-12-24V10Z" /><path d="M20 17H8c2 14 7 20 16 22" /><path d="M44 17h12c-2 14-7 20-16 22" /><path d="M32 47v7" /><path d="M22 58h20" /></svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 13h24v43H20z" /><path d="M25 13c1-5 13-5 14 0" /><path d="M27 28h18M27 38h18M27 48h12" /></svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" /><path d="M32 18v16l11 7" /><path d="M32 7v5M32 52v5M7 32h5M52 32h5" /></svg>
  );
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function abbreviateStoreName(value: string) {
  return value
    .replace(/Teixeira de Freitas Centro/g, 'Teixeira de Freitas')
    .replace(/Vitória Praia do Canto/g, 'Vitória Praia do Canto')
    .replace(/Cariacica Campo Grande/g, 'Cariacica Campo Grande')
    .replace(/Linhares Centro/g, 'Linhares Centro')
    .trim();
}

function splitChampionName(value: string) {
  const cleaned = abbreviateStoreName(value).toUpperCase();
  if (cleaned.includes('CARIACICA CAMPO GRANDE')) return ['CARIACICA', 'CAMPO GRANDE'];
  if (cleaned.includes('LINHARES CENTRO')) return ['LINHARES', 'CENTRO'];
  if (cleaned.includes('PORTO SEGURO CENTRO')) return ['PORTO SEGURO', 'CENTRO'];
  const parts = cleaned.split(' ');
  if (parts.length <= 2) return [cleaned];
  const midpoint = Math.ceil(parts.length / 2);
  return [parts.slice(0, midpoint).join(' '), parts.slice(midpoint).join(' ')];
}

const styles = `
  body {
    margin: 0;
    background: #020812;
  }

  .champion-screen {
    --gold: #ffc22a;
    --gold-light: #fff1a3;
    --deep-gold: #ff8619;
    --green: #59f044;
    --blue: #32a6ff;
    --ink: #020812;
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(circle at 28% 18%, rgba(255,194,42,.22), transparent 27%),
      radial-gradient(circle at 78% 22%, rgba(50,166,255,.20), transparent 26%),
      radial-gradient(circle at 10% 76%, rgba(88,233,79,.13), transparent 30%),
      linear-gradient(115deg, #020711 0%, #061626 48%, #020711 100%);
    isolation: isolate;
    font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
    text-transform: uppercase;
  }

  .champion-bg {
    position: absolute;
    inset: 0;
    z-index: -5;
    background-image:
      radial-gradient(circle at 1px 1px, rgba(255,194,42,.16) 1px, transparent 0),
      linear-gradient(30deg, rgba(255,255,255,.045) 1px, transparent 1px),
      linear-gradient(150deg, rgba(255,255,255,.025) 1px, transparent 1px);
    background-size: 34px 34px, 110px 110px, 110px 110px;
    opacity: .50;
  }

  .honey-pattern {
    position: absolute;
    left: -40px;
    top: -60px;
    width: 430px;
    height: 260px;
    z-index: -2;
    opacity: .30;
    background:
      linear-gradient(30deg, transparent 24%, rgba(255,194,42,.55) 25% 30%, transparent 31% 74%, rgba(255,194,42,.55) 75% 80%, transparent 81%),
      linear-gradient(150deg, transparent 24%, rgba(255,194,42,.55) 25% 30%, transparent 31% 74%, rgba(255,194,42,.55) 75% 80%, transparent 81%);
    background-size: 42px 72px;
    filter: drop-shadow(0 0 14px rgba(255,194,42,.34));
  }

  .light-beam {
    position: absolute;
    top: -18%;
    width: 180px;
    height: 132%;
    z-index: -3;
    opacity: .40;
    filter: blur(6px);
    background: linear-gradient(180deg, transparent, rgba(255,194,42,.48), transparent);
  }

  .beam-left {
    left: 34%;
    transform: rotate(-23deg);
  }

  .beam-right {
    right: 12%;
    background: linear-gradient(180deg, transparent, rgba(50,166,255,.54), transparent);
    transform: rotate(27deg);
  }

  .champion-screen::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -4;
    background:
      linear-gradient(115deg, transparent 0 44%, rgba(255,194,42,.14) 45%, transparent 46% 100%),
      linear-gradient(245deg, transparent 0 54%, rgba(50,166,255,.12) 55%, transparent 56% 100%);
  }

  .champion-header {
    height: 104px;
    padding: 22px 40px 10px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .brand-seal,
  .title-chip {
    position: relative;
    min-height: 58px;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    border: 1px solid rgba(255,194,42,.72);
    background: linear-gradient(135deg, rgba(6,24,42,.96), rgba(3,11,20,.88));
    box-shadow: 0 0 26px rgba(255,194,42,.12), inset 0 0 30px rgba(255,194,42,.045);
    font-weight: 900;
    letter-spacing: .045em;
    transform: skewX(-7deg);
  }

  .brand-seal {
    padding: 0 28px 0 18px;
    color: white;
    font-size: 25px;
  }

  .brand-seal > * {
    transform: skewX(7deg);
  }

  .brand-seal b {
    color: var(--gold);
  }

  .mini-hex {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 2px solid var(--gold);
    clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%);
  }

  .mini-hex svg {
    width: 24px;
    height: 24px;
  }

  .mini-hex path {
    fill: none;
    stroke: var(--gold);
    stroke-width: 5;
    stroke-linejoin: round;
  }

  .title-chip {
    padding: 0 31px;
    color: #07111e;
    background: linear-gradient(90deg, #ffe171, var(--gold), var(--deep-gold));
    border-color: rgba(255,226,106,.92);
    font-size: 26px;
    box-shadow: 0 0 32px rgba(255,194,42,.35), inset 0 0 22px rgba(255,255,255,.30);
  }

  .title-chip::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: -8px;
    height: 4px;
    background: var(--gold-light);
    filter: blur(3px);
  }

  .champion-stage {
    height: calc(100vh - 220px);
    padding: 0 40px;
    display: grid;
    grid-template-columns: minmax(300px, 32vw) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 156px;
    gap: 18px 34px;
    align-items: center;
  }

  .trophy-zone {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    place-items: center;
  }

  .trophy-rings {
    position: absolute;
    width: min(480px, 31vw);
    height: min(480px, 31vw);
    border-radius: 50%;
    border: 2px solid rgba(255,194,42,.52);
    box-shadow: 0 0 50px rgba(255,194,42,.28), inset 0 0 70px rgba(255,194,42,.10);
  }

  .trophy-rings::before,
  .trophy-rings::after {
    content: '';
    position: absolute;
    inset: 28px;
    border-radius: 50%;
    border: 1px solid rgba(255,194,42,.30);
  }

  .trophy-rings::after {
    inset: 62px;
    border-style: dashed;
    opacity: .80;
  }

  .trophy-wrap {
    position: relative;
    z-index: 2;
    width: min(410px, 28vw);
    height: min(500px, 52vh);
    display: grid;
    place-items: end center;
    filter: drop-shadow(0 0 42px rgba(255,194,42,.50));
  }

  .trophy-icon {
    width: 100%;
    height: 100%;
  }

  .trophy-icon path {
    fill: rgba(255,194,42,.08);
    stroke: url(#cupGold);
    stroke-width: 9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .podium {
    position: absolute;
    bottom: 5%;
    width: min(360px, 24vw);
    height: 42px;
    z-index: 1;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(255,194,42,.28), transparent 70%);
    filter: blur(5px);
  }

  .hero-zone {
    min-width: 0;
    align-self: center;
  }

  .gold-ribbon {
    position: relative;
    width: max-content;
    max-width: 100%;
    min-height: 64px;
    padding: 0 86px 0 36px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #06101c;
    background: linear-gradient(90deg, var(--deep-gold), var(--gold), var(--gold-light));
    box-shadow: 0 14px 34px rgba(0,0,0,.32), 0 0 24px rgba(255,194,42,.22);
    clip-path: polygon(4% 0, 100% 0, 95% 100%, 0 100%);
    transform: skewX(-9deg);
  }

  .gold-ribbon span,
  .gold-ribbon i {
    transform: skewX(9deg);
  }

  .gold-ribbon span {
    font-size: clamp(26px, 2.5vw, 46px);
    font-weight: 900;
    font-style: italic;
    white-space: nowrap;
  }

  .gold-ribbon i {
    position: absolute;
    right: 68px;
    width: 10px;
    height: 60px;
    background: #fff;
    opacity: .95;
  }

  .gold-ribbon i:nth-child(3) { right: 48px; }
  .gold-ribbon i:nth-child(4) { right: 28px; }

  .champion-name {
    margin: 22px 0 0;
    display: grid;
    gap: 3px;
    color: white;
    font-size: clamp(105px, 10.7vw, 186px);
    line-height: .75;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -.04em;
    text-shadow:
      0 8px 0 rgba(0,0,0,.42),
      0 0 1px var(--gold),
      0 0 34px rgba(255,194,42,.20),
      0 0 52px rgba(50,166,255,.14);
  }

  .champion-name span {
    display: block;
    white-space: nowrap;
  }

  .champion-message {
    position: relative;
    margin: 22px 0 0 28px;
    max-width: 1040px;
    color: rgba(255,255,255,.92);
    font-family: Arial, sans-serif;
    text-transform: none;
    font-size: clamp(18px, 1.45vw, 28px);
    line-height: 1.25;
    font-weight: 800;
  }

  .champion-message::before {
    content: '';
    position: absolute;
    left: -28px;
    top: 2px;
    bottom: 2px;
    width: 5px;
    background: var(--green);
    box-shadow: 0 0 16px rgba(88,233,79,.65);
  }

  .score-strip {
    grid-column: 1 / -1;
    height: 156px;
    padding: 0 38px;
    display: grid;
    grid-template-columns: 210px 395px minmax(0, 1fr);
    align-items: center;
    gap: 28px;
    border: 1px solid rgba(255,194,42,.50);
    background:
      linear-gradient(112deg, rgba(88,233,79,.25) 0 4%, rgba(3,18,33,.98) 4% 78%, rgba(50,166,255,.18)),
      linear-gradient(180deg, rgba(4,14,26,.98), rgba(2,8,18,.94));
    box-shadow: 0 28px 66px rgba(0,0,0,.45), inset 0 0 48px rgba(255,194,42,.05);
    clip-path: polygon(3% 0, 100% 0, 97.5% 100%, 0 100%);
  }

  .score-label span,
  .champion-footer span {
    color: var(--gold);
    font-size: 20px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: .045em;
  }

  .score-label i {
    display: block;
    width: 116px;
    height: 3px;
    margin-top: 11px;
    background: var(--green);
    box-shadow: 0 0 14px rgba(88,233,79,.62);
  }

  .score-number {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 28px;
    white-space: nowrap;
  }

  .score-number strong {
    color: white;
    font-size: clamp(92px, 8vw, 136px);
    line-height: .78;
    font-weight: 900;
    font-style: italic;
    text-shadow: 0 7px 20px rgba(0,0,0,.55);
  }

  .score-number em {
    color: var(--deep-gold);
    font-size: clamp(70px, 5.8vw, 102px);
    line-height: .80;
    font-weight: 900;
    font-style: italic;
    text-shadow: 0 0 18px rgba(255,134,25,.55);
  }

  .teams-vs {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr);
    align-items: center;
    gap: 22px;
  }

  .teams-vs b {
    color: white;
    font-size: clamp(26px, 2.4vw, 45px);
    line-height: .88;
    font-weight: 900;
    font-style: italic;
    text-align: center;
  }

  .teams-vs span {
    color: var(--gold);
    font-size: clamp(38px, 3.3vw, 58px);
    font-weight: 900;
    font-style: italic;
    text-align: center;
  }

  .champion-footer {
    height: 116px;
    padding: 0 40px 22px;
    display: grid;
    grid-template-columns: 1.18fr .95fr .72fr;
    gap: 24px;
  }

  .info-card {
    min-width: 0;
    height: 94px;
    padding: 13px 24px 13px 110px;
    position: relative;
    display: flex;
    align-items: center;
    border: 1px solid rgba(255,194,42,.42);
    background:
      linear-gradient(112deg, rgba(88,233,79,.22) 0 3%, rgba(4,15,28,.92) 3% 100%),
      rgba(4,14,26,.78);
    box-shadow: 0 18px 36px rgba(0,0,0,.32), inset 0 0 36px rgba(255,255,255,.025);
    clip-path: polygon(5% 0, 100% 0, 95% 100%, 0 100%);
  }

  .info-icon {
    position: absolute;
    left: 24px;
    top: 13px;
    width: 66px;
    height: 66px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,194,42,.46);
    background: rgba(255,194,42,.08);
    box-shadow: inset 0 0 20px rgba(255,194,42,.04), 0 0 20px rgba(255,194,42,.10);
  }

  .info-icon svg {
    width: 42px;
    height: 42px;
  }

  .info-icon path,
  .info-icon circle {
    fill: none;
    stroke: var(--gold);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .info-card strong {
    display: block;
    min-width: 0;
    margin-top: 7px;
    color: white;
    font-size: clamp(28px, 2.35vw, 44px);
    line-height: .88;
    font-weight: 900;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .confetti {
    position: absolute;
    z-index: -1;
    width: 235px;
    height: 235px;
    background:
      radial-gradient(circle, var(--gold) 0 3px, transparent 4px),
      radial-gradient(circle, var(--green) 0 3px, transparent 4px),
      radial-gradient(circle, var(--blue) 0 3px, transparent 4px),
      radial-gradient(circle, var(--deep-gold) 0 3px, transparent 4px);
    background-size: 32px 32px, 44px 44px, 52px 52px, 39px 39px;
    opacity: .56;
    filter: drop-shadow(0 0 5px rgba(255,194,42,.25));
  }

  .c1 { top: 128px; left: 55px; transform: rotate(-15deg); }
  .c2 { top: 112px; right: 45px; transform: rotate(20deg); }
  .c3 { bottom: 96px; left: 48%; transform: rotate(8deg); opacity: .32; }

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
      height: 86px;
      padding: 16px 34px 8px;
    }

    .brand-seal,
    .title-chip {
      min-height: 50px;
    }

    .brand-seal {
      font-size: 21px;
    }

    .title-chip {
      font-size: 22px;
    }

    .champion-stage {
      height: calc(100vh - 188px);
      grid-template-columns: minmax(250px, 28vw) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) 128px;
      padding: 0 36px;
      gap: 14px 28px;
    }

    .gold-ribbon {
      min-height: 52px;
      padding-left: 30px;
    }

    .gold-ribbon span {
      font-size: clamp(22px, 2.1vw, 36px);
    }

    .champion-name {
      margin-top: 16px;
      font-size: clamp(82px, 8.8vw, 146px);
    }

    .champion-message {
      margin-top: 18px;
      font-size: clamp(16px, 1.25vw, 22px);
    }

    .score-strip {
      height: 128px;
      grid-template-columns: 185px 315px minmax(0, 1fr);
      padding: 0 32px;
    }

    .score-number strong {
      font-size: clamp(78px, 7vw, 108px);
    }

    .score-number em {
      font-size: clamp(60px, 5vw, 84px);
    }

    .champion-footer {
      height: 102px;
      padding-bottom: 16px;
    }

    .info-card {
      height: 84px;
      padding-left: 96px;
    }

    .info-icon {
      width: 58px;
      height: 58px;
    }

    .info-card strong {
      font-size: clamp(24px, 2.1vw, 36px);
    }
  }
`;
