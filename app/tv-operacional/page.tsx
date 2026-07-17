'use client';

import { useEffect, useMemo, useState } from 'react';

const STEP_MS = 15000;
const REFRESH_MS = 60000;
const PHASES = 6;

type Coordinator = {
  name?: string;
  realized?: string;
  goal?: string;
  projectedPercent?: string;
  dailyGoal?: string;
  soldToday?: string;
  paidToday?: string;
  status?: string;
};

type Store = {
  name?: string;
  responsible?: string;
  monthRealized?: string;
  monthGoal?: string;
  projectedPercent?: string;
  dailyGoal?: string;
  soldToday?: string;
  paidToday?: string;
  insurance?: string;
  status?: string;
  insight?: string;
};

type CoordinatorTotals = {
  dailyGoal?: string;
  soldToday?: string;
  paidToday?: string;
  status?: string;
  monthRealized?: string;
  monthGoal?: string;
  projectedPercent?: string;
  insurance?: string;
};

type CoordinatorView = {
  name?: string;
  stores?: Store[];
  totals?: CoordinatorTotals;
  insight?: string;
};

type ViewData = {
  title?: string;
  subtitle?: string;
  updatedAt?: string;
  date?: string;
  coordinators?: Coordinator[];
  total?: Coordinator | null;
  coordinatorViews?: CoordinatorView[];
};

type Payload = {
  ok: boolean;
  version?: string;
  generatedAt?: string;
  daily?: ViewData;
  projection?: ViewData;
  message?: string;
};

export default function TvOperacionalPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [phase, setPhase] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch('/api/tv-operacional?refresh=1', { cache: 'no-store' });
        const data = (await response.json()) as Payload;
        if (!alive) return;
        if (!response.ok || !data.ok) throw new Error(data.message || 'Falha ao consultar o painel.');
        setPayload(data);
        setError('');
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Falha ao carregar dados.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    const refresh = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const started = Date.now();
    setProgress(100);

    const tick = window.setInterval(() => {
      setProgress(Math.max(0, 100 - ((Date.now() - started) / STEP_MS) * 100));
    }, 200);

    const rotate = window.setTimeout(() => {
      setPhase((current) => (current + 1) % PHASES);
    }, STEP_MS);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(rotate);
    };
  }, [phase]);

  const projection = phase >= 3;
  const coordinatorIndex = phase % 3;
  const current = projection ? payload?.projection : payload?.daily;
  const coordinatorView = current?.coordinatorViews?.[coordinatorIndex];
  const stores = useMemo(() => coordinatorView?.stores || [], [coordinatorView]);

  if (loading && !payload) {
    return <State title="RADAR OPERACIONAL" text="Carregando dados da Gestão Preditiva..." />;
  }

  if (!payload) {
    return <State title="PAINEL INDISPONÍVEL" text={error || 'Não foi possível carregar os dados.'} />;
  }

  return (
    <main className={`tv ${projection ? 'projection' : 'daily'}`}>
      <style jsx global>{styles}</style>

      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <strong>CREDVIX</strong>
            <span>RADAR OPERACIONAL</span>
          </div>
        </div>

        <div className="title">
          <span>{projection ? 'VISÃO 2 DE 2' : 'VISÃO 1 DE 2'}</span>
          <h1>{current?.title || '-'}</h1>
          <p>{current?.subtitle || ''}</p>
        </div>

        <div className="meta">
          <span>ATUALIZAÇÃO</span>
          <strong>{current?.updatedAt || '--'}</strong>
          <small>{current?.date || payload.generatedAt || ''}</small>
        </div>
      </header>

      {error && <div className="warning">Última leitura mantida. Erro na atualização: {error}</div>}

      <section className="coordinators">
        {(current?.coordinators || []).slice(0, 3).map((item, index) => (
          <CoordinatorCard
            key={item.name}
            item={item}
            projection={projection}
            active={index === coordinatorIndex}
          />
        ))}
      </section>

      <section className="content">
        <div className="tablePanel">
          <div className="panelTitle">
            <div>
              <span>{projection ? 'PROJEÇÃO POR COORDENAÇÃO' : 'ACOMPANHAMENTO POR COORDENAÇÃO'}</span>
              <h2>COORDENAÇÃO {coordinatorView?.name || '-'}</h2>
              <p>{projection ? 'Dados exclusivos da aba PROJEÇÃO DE META' : 'Dados exclusivos da aba DIÁRIA ESTÁTICA'}</p>
            </div>
            <b>{coordinatorIndex + 1}/3</b>
          </div>

          {projection ? (
            <ProjectionTable stores={stores} totals={coordinatorView?.totals} name={coordinatorView?.name} />
          ) : (
            <DailyTable stores={stores} totals={coordinatorView?.totals} name={coordinatorView?.name} />
          )}
        </div>

        <aside>
          <TotalCard current={current} projection={projection} />
          <InsightCard projection={projection} stores={stores} totals={coordinatorView?.totals} />
        </aside>
      </section>

      <footer>
        <div className="dots">
          <i className={!projection ? 'active' : ''} />
          <i className={projection ? 'active' : ''} />
        </div>
        <span>
          {projection
            ? 'Projeção de meta • troca de coordenação a cada 15 segundos'
            : 'Diária estática • troca de coordenação a cada 15 segundos'}
        </span>
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
        <em>{payload.version}</em>
      </footer>
    </main>
  );
}

function CoordinatorCard({ item, projection, active }: { item: Coordinator; projection: boolean; active: boolean }) {
  const positive = projection ? numberPercent(item.projectedPercent) >= 100 : delivered(item.status);

  return (
    <article className={`${positive ? 'positive' : 'critical'} ${active ? 'active' : ''}`}>
      <div className="coordHead">
        <span>COORDENADORA</span>
        <b>{item.name || '-'}</b>
      </div>

      <div className="coordMain">
        <strong>{projection ? item.projectedPercent || '--' : item.paidToday || 'R$ 0'}</strong>
        <small>{projection ? 'projeção do mês' : 'pago hoje'}</small>
      </div>

      <div className="coordStats">
        <div>
          <span>{projection ? 'Realizado' : 'Vendido'}</span>
          <b>{projection ? item.realized || '--' : item.soldToday || '--'}</b>
        </div>
        <div>
          <span>{projection ? 'Meta' : 'Diária'}</span>
          <b>{projection ? item.goal || '--' : item.dailyGoal || '--'}</b>
        </div>
      </div>
    </article>
  );
}

function DailyTable({ stores, totals, name }: { stores: Store[]; totals?: CoordinatorTotals; name?: string }) {
  return (
    <div className="dataTable">
      <div className="tableHeader dailyCols">
        <span>Loja</span>
        <span>Diária</span>
        <span>Vendido hoje</span>
        <span>Pago no retrato</span>
        <span>Status</span>
      </div>

      <div className="rows">
        {stores.map((store) => (
          <div className="dataRow dailyCols" key={store.name}>
            <b>{store.name || '-'}</b>
            <span>{currencyLabel(store.dailyGoal)}</span>
            <strong>{currencyLabel(store.soldToday)}</strong>
            <strong className={moneyNumber(store.paidToday) <= 0 ? 'redText' : ''}>{currencyLabel(store.paidToday)}</strong>
            <Status value={store.status} />
          </div>
        ))}
      </div>

      <div className="totalRow dailyCols">
        <b>TOTAL {String(name || '').toUpperCase()}</b>
        <span>{currencyLabel(totals?.dailyGoal)}</span>
        <strong>{currencyLabel(totals?.soldToday)}</strong>
        <strong>{currencyLabel(totals?.paidToday)}</strong>
        <Status value={totals?.status} />
      </div>
    </div>
  );
}

function ProjectionTable({ stores, totals, name }: { stores: Store[]; totals?: CoordinatorTotals; name?: string }) {
  return (
    <div className="dataTable">
      <div className="tableHeader projectionCols">
        <span>Loja</span>
        <span>Realizado</span>
        <span>Meta</span>
        <span>% projetado</span>
        <span>Diária necessária</span>
        <span>Seguros</span>
        <span>Insight Liga</span>
      </div>

      <div className="rows">
        {stores.map((store) => (
          <div className="dataRow projectionCols" key={store.name}>
            <b>{store.name || '-'}</b>
            <span>{currencyLabel(store.monthRealized)}</span>
            <span>{currencyLabel(store.monthGoal)}</span>
            <strong className={numberPercent(store.projectedPercent) >= 100 ? 'greenText' : 'redText'}>{store.projectedPercent || '--'}</strong>
            <span>{currencyLabel(store.dailyGoal)}</span>
            <span>{store.insurance || '0'}</span>
            <small>{compactInsight(store.insight)}</small>
          </div>
        ))}
      </div>

      <div className="totalRow projectionCols">
        <b>TOTAL {String(name || '').toUpperCase()}</b>
        <span>{currencyLabel(totals?.monthRealized)}</span>
        <span>{currencyLabel(totals?.monthGoal)}</span>
        <strong className={numberPercent(totals?.projectedPercent) >= 100 ? 'greenText' : 'redText'}>{totals?.projectedPercent || '--'}</strong>
        <span>{currencyLabel(totals?.dailyGoal)}</span>
        <span>{totals?.insurance || '0'}</span>
        <small>Consolidado da coordenação</small>
      </div>
    </div>
  );
}

function Status({ value }: { value?: string }) {
  const ok = delivered(value);
  const accelerate = normalized(value).includes('ACELERA');
  return (
    <span className={`status ${ok ? 'ok' : accelerate ? 'warn' : 'bad'}`}>
      <i />
      {ok ? 'ENTREGUE' : accelerate ? 'ACELERA' : 'NÃO ENTREGUE'}
    </span>
  );
}

function TotalCard({ current, projection }: { current?: ViewData; projection: boolean }) {
  return (
    <div className="totalCard">
      <span>CONSOLIDADO CREDVIX</span>
      <h3>{projection ? current?.total?.projectedPercent || '--' : current?.total?.paidToday || 'R$ 0'}</h3>
      <p>{projection ? 'Projeção consolidada' : 'Pago no retrato'}</p>

      <div>
        <small>{projection ? 'Meta consolidada' : 'Diária necessária'}</small>
        <strong>{projection ? currencyLabel(current?.total?.goal) : currencyLabel(current?.total?.dailyGoal)}</strong>
      </div>

      <div>
        <small>{projection ? 'Realizado' : 'Vendido hoje'}</small>
        <strong>{projection ? currencyLabel(current?.total?.realized) : currencyLabel(current?.total?.soldToday)}</strong>
      </div>
    </div>
  );
}

function InsightCard({ projection, stores, totals }: { projection: boolean; stores: Store[]; totals?: CoordinatorTotals }) {
  const dailyDelivered = stores.filter((store) => delivered(store.status)).length;
  const dailyPercentage = stores.length ? Math.round((dailyDelivered / stores.length) * 100) : 0;
  const biggestDifference = stores.reduce<Store | null>((best, store) => {
    const difference = Math.max(0, moneyNumber(store.soldToday) - moneyNumber(store.paidToday));
    const bestDifference = best ? Math.max(0, moneyNumber(best.soldToday) - moneyNumber(best.paidToday)) : -1;
    return difference > bestDifference ? store : best;
  }, null);

  const projectedStores = stores.filter((store) => numberPercent(store.projectedPercent) >= 100).length;
  const projectedPercentage = stores.length ? Math.round((projectedStores / stores.length) * 100) : 0;
  const lowestProjection = stores.reduce<Store | null>((lowest, store) => {
    if (!lowest) return store;
    return numberPercent(store.projectedPercent) < numberPercent(lowest.projectedPercent) ? store : lowest;
  }, null);

  const totalProjection = numberPercent(totals?.projectedPercent);
  const statusText = projection
    ? totalProjection >= 100 ? 'META PROJETADA' : 'ABAIXO DA META'
    : delivered(totals?.status) ? 'ENTREGUE' : normalized(totals?.status).includes('ACELERA') ? 'ACELERA' : 'NÃO ENTREGUE';
  const statusClass = projection
    ? totalProjection >= 100 ? 'good' : 'bad'
    : delivered(totals?.status) ? 'good' : normalized(totals?.status).includes('ACELERA') ? 'attention' : 'bad';

  return (
    <div className="insightCard">
      <div className="insightHead">
        <span>{projection ? 'INSIGHT DE PROJEÇÃO' : 'INSIGHT OPERACIONAL'}</span>
        <i>AI</i>
      </div>

      <div className="insightMetric">
        <MetricIcon type="target" />
        <div>
          <small>Status da coordenação:</small>
          <strong className={statusClass}>{statusText}</strong>
        </div>
      </div>

      <div className="insightMetric split">
        <MetricIcon type="trend" />
        <div>
          <strong>{projection ? `${projectedStores} lojas projetadas ≥100%` : `${dailyDelivered} lojas entregues`}</strong>
        </div>
        <b className="good">{projection ? projectedPercentage : dailyPercentage}%</b>
      </div>

      <div className="insightMetric">
        <MetricIcon type="alert" />
        <div>
          <small>{projection ? 'Menor projeção da coordenação:' : 'Maior diferença vendido-pago:'}</small>
          <strong className="attention">
            {projection
              ? lowestProjection?.projectedPercent || '--'
              : currencyLabel(Math.max(0, moneyNumber(biggestDifference?.soldToday) - moneyNumber(biggestDifference?.paidToday)))}
          </strong>
          <em>({projection ? lowestProjection?.name || '-' : biggestDifference?.name || '-'})</em>
        </div>
      </div>
    </div>
  );
}

function MetricIcon({ type }: { type: 'target' | 'trend' | 'alert' }) {
  if (type === 'trend') {
    return (
      <span className="metricIcon" aria-hidden="true">
        <svg viewBox="0 0 48 48"><path d="M8 36h32M11 31l10-10 7 6 10-13M31 14h7v7" /></svg>
      </span>
    );
  }

  if (type === 'alert') {
    return (
      <span className="metricIcon" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15"/><path d="M24 14v12M24 32h.1" /></svg>
      </span>
    );
  }

  return (
    <span className="metricIcon" aria-hidden="true">
      <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="12"/><circle cx="24" cy="24" r="3"/><path d="M24 5v8M24 35v8M5 24h8M35 24h8" /></svg>
    </span>
  );
}

function State({ title, text }: { title: string; text: string }) {
  return (
    <main className="state">
      <style jsx global>{styles}</style>
      <Logo />
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 68 68" aria-hidden="true">
      <path d="M34 5 59 19v30L34 63 9 49V19L34 5Z" />
      <path d="m22 28 12-7 12 7v13l-12 7-12-7V28Z" />
    </svg>
  );
}

function normalized(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function delivered(value?: string) {
  const text = normalized(value);
  return text.includes('ENTREGUE') && !text.includes('NAO ENTREGUE');
}

function numberPercent(value?: string) {
  const number = Number(String(value || '').replace('%', '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function moneyNumber(value?: string) {
  const number = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function currencyLabel(value?: string | number) {
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  }

  const text = String(value || '').trim();
  if (!text || text === '--') return '--';
  if (/^R\$/i.test(text)) return text;
  if (!/[\d]/.test(text)) return text;
  return `R$ ${text}`;
}

function compactInsight(value?: string) {
  const text = String(value || '').trim();
  if (!text) return '--';
  if (/seguros ok/i.test(text)) return 'Seguros ok • Validar SC';
  const missing = text.match(/Faltam\s+\d+\s+seguro\(s\)/i);
  if (missing) return `${missing[0]} • Validar SC`;
  return text;
}

const styles = `
:root {
  --bg: #030d18;
  --panel: rgba(6, 25, 43, .96);
  --panel-strong: rgba(8, 31, 53, .98);
  --line: rgba(147, 181, 214, .22);
  --line-strong: rgba(147, 181, 214, .34);
  --orange: #ff7a00;
  --orange-soft: #ff9b2f;
  --white: #f7f9fc;
  --muted: #9fb0c2;
  --green: #4bd38a;
  --red: #ff4658;
  --yellow: #ffb21c;
}

* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; height: 100%; background: var(--bg); overflow: hidden; }
body { font-family: "Segoe UI Variable", Inter, "Segoe UI", Arial, sans-serif; }

.tv,
.state {
  width: 100vw;
  height: 100dvh;
  color: var(--white);
  background:
    radial-gradient(circle at 10% 0%, rgba(255, 122, 0, .08), transparent 30%),
    linear-gradient(145deg, #020a13 0%, #061626 57%, #020b14 100%);
  overflow: hidden;
}

.tv {
  position: relative;
  display: grid;
  grid-template-rows: clamp(74px, 9.5vh, 94px) clamp(118px, 14.5vh, 142px) minmax(0, 1fr) clamp(30px, 4vh, 40px);
}

.tv::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .045;
  background-image:
    linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px);
  background-size: 42px 42px;
}

.topbar,
.coordinators,
.content,
footer,
.warning { position: relative; z-index: 2; }

.topbar {
  display: grid;
  grid-template-columns: minmax(270px, .9fr) 1.25fr minmax(190px, .65fr);
  align-items: center;
  gap: 18px;
  padding: 8px clamp(16px, 1.25vw, 24px);
  border-bottom: 1px solid var(--line);
  background: rgba(2, 10, 18, .88);
}

.brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
.brand > svg,
.state > svg {
  width: clamp(48px, 3.7vw, 64px);
  height: clamp(48px, 3.7vw, 64px);
  padding: 8px;
  border: 1px solid rgba(255, 122, 0, .72);
  border-radius: 14px;
  background: rgba(255, 122, 0, .035);
}
.brand svg path,
.state svg path { fill: none; stroke: var(--orange); stroke-width: 4; }
.brand strong {
  display: block;
  color: var(--orange);
  font-size: clamp(26px, 2.35vw, 42px);
  font-weight: 900;
  line-height: .95;
  letter-spacing: -.03em;
}
.brand span {
  display: block;
  margin-top: 6px;
  color: rgba(255,255,255,.78);
  font-size: clamp(10px, .8vw, 15px);
  font-weight: 700;
  letter-spacing: .11em;
}

.title { text-align: center; min-width: 0; }
.title > span {
  display: block;
  color: var(--orange);
  font-size: clamp(10px, .83vw, 15px);
  font-weight: 900;
  letter-spacing: .05em;
}
.title h1 {
  margin: 2px 0 0;
  font-size: clamp(30px, 3vw, 52px);
  font-weight: 950;
  line-height: .96;
  letter-spacing: -.035em;
  text-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.title p {
  margin: 4px 0 0;
  color: rgba(255,255,255,.84);
  font-size: clamp(10px, .92vw, 16px);
  line-height: 1;
}

.meta { text-align: right; }
.meta span {
  display: block;
  color: rgba(255,255,255,.72);
  font-size: clamp(9px, .7vw, 12px);
  font-weight: 700;
}
.meta strong {
  display: block;
  color: var(--orange);
  font-size: clamp(27px, 2.35vw, 42px);
  font-weight: 900;
  line-height: 1;
}
.meta small {
  display: block;
  margin-top: 4px;
  color: rgba(255,255,255,.84);
  font-size: clamp(10px, .8vw, 14px);
}

.warning {
  position: absolute;
  top: clamp(74px, 9.5vh, 94px);
  left: 50%;
  z-index: 8;
  transform: translateX(-50%);
  width: min(92vw, 1100px);
  padding: 6px 14px;
  border: 1px solid rgba(255, 70, 88, .45);
  border-radius: 0 0 10px 10px;
  background: rgba(112, 17, 31, .94);
  color: #fff;
  font-size: 12px;
  text-align: center;
}

.coordinators {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(10px, .8vw, 16px);
  padding: clamp(10px, 1.2vh, 14px) clamp(14px, 1.25vw, 24px) clamp(8px, 1vh, 12px);
}

.coordinators article {
  position: relative;
  display: grid;
  grid-template-columns: minmax(140px, .92fr) minmax(145px, .9fr) minmax(135px, .88fr);
  align-items: center;
  gap: clamp(10px, .75vw, 16px);
  min-width: 0;
  padding: clamp(12px, 1.4vh, 18px) clamp(14px, 1vw, 20px);
  border: 1px solid var(--line);
  border-top: 4px solid var(--orange);
  border-radius: 16px;
  background: linear-gradient(155deg, rgba(8, 31, 53, .98), rgba(3, 17, 31, .98));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
  overflow: hidden;
}

.coordinators article.active {
  border-color: rgba(255, 122, 0, .9);
  border-top-color: var(--orange);
  box-shadow: 0 0 0 1px rgba(255, 122, 0, .18), 0 0 24px rgba(255, 122, 0, .08);
}

.coordHead,
.coordMain,
.coordStats { min-width: 0; }
.coordHead span,
.coordStats span {
  display: block;
  color: rgba(255,255,255,.78);
  font-size: clamp(10px, .75vw, 13px);
}
.coordHead b {
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: clamp(21px, 1.75vw, 31px);
  font-weight: 900;
  line-height: 1.03;
  white-space: normal;
}
.coordMain {
  padding: 0 clamp(10px, .85vw, 16px);
  border-left: 1px solid var(--line-strong);
  border-right: 1px solid var(--line-strong);
  text-align: center;
}
.coordMain strong {
  display: block;
  color: var(--orange);
  font-size: clamp(24px, 2.15vw, 38px);
  font-weight: 950;
  line-height: 1;
  white-space: nowrap;
  letter-spacing: -.025em;
}
.coordMain small {
  display: block;
  margin-top: 8px;
  color: #fff;
  font-size: clamp(11px, .9vw, 16px);
  font-weight: 750;
}
.coordStats { display: grid; gap: clamp(8px, 1vh, 12px); }
.coordStats div { display: grid; gap: 2px; }
.coordStats b {
  color: #fff;
  font-size: clamp(14px, 1.2vw, 21px);
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
}

.content {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 24.5vw, 420px);
  gap: clamp(10px, .85vw, 16px);
  padding: 0 clamp(14px, 1.25vw, 24px) clamp(8px, 1vh, 12px);
}

.tablePanel,
.totalCard,
.insightCard {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(6, 27, 47, .985), rgba(2, 15, 28, .985));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
}

.tablePanel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: clamp(66px, 8vh, 82px) minmax(0, 1fr);
  padding: clamp(10px, 1.2vh, 14px) clamp(12px, 1vw, 18px) clamp(10px, 1.1vh, 14px);
  overflow: hidden;
}

.panelTitle {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.panelTitle > div { min-width: 0; }
.panelTitle span,
.totalCard > span,
.insightHead > span {
  color: var(--orange);
  font-size: clamp(10px, .78vw, 14px);
  font-weight: 900;
  letter-spacing: .02em;
}
.panelTitle h2 {
  margin: 4px 0 0;
  color: #fff;
  font-size: clamp(24px, 2vw, 36px);
  font-weight: 950;
  line-height: 1;
  letter-spacing: -.025em;
}
.panelTitle p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: clamp(10px, .8vw, 14px);
  line-height: 1;
}
.panelTitle > b {
  align-self: flex-start;
  min-width: 58px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 122, 0, .14);
  color: var(--orange);
  font-size: clamp(18px, 1.45vw, 25px);
  font-weight: 900;
  text-align: center;
}

.dataTable {
  min-height: 0;
  display: grid;
  grid-template-rows: clamp(28px, 3.2vh, 36px) minmax(0, 1fr) clamp(32px, 4vh, 42px);
}
.tableHeader,
.dataRow,
.totalRow { min-width: 0; }
.tableHeader {
  padding: 0 10px;
  border: 1px solid rgba(120, 166, 210, .26);
  border-radius: 9px 9px 0 0;
  background: rgba(17, 53, 83, .58);
  color: #fff;
  font-size: clamp(10px, .72vw, 13px);
  font-weight: 850;
  text-transform: uppercase;
}
.tableHeader > span:not(:first-child) { text-align: center; }

.dailyCols {
  display: grid;
  grid-template-columns: minmax(270px, 2fr) minmax(100px, .72fr) minmax(110px, .78fr) minmax(120px, .82fr) minmax(150px, .92fr);
  gap: clamp(8px, .65vw, 13px);
  align-items: center;
}

.projectionCols {
  display: grid;
  grid-template-columns: minmax(205px, 1.55fr) minmax(92px, .7fr) minmax(92px, .7fr) minmax(84px, .62fr) minmax(108px, .78fr) minmax(58px, .42fr) minmax(155px, 1.08fr);
  gap: clamp(6px, .48vw, 10px);
  align-items: center;
}

.rows {
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: hidden;
}

.dataRow {
  flex: 0 0 clamp(24px, 2.75vh, 31px);
  padding: 0 10px;
  border-bottom: 1px solid rgba(116, 155, 190, .2);
  color: #fff;
}
.dataRow:nth-child(even) { background: rgba(255,255,255,.012); }
.dataRow b,
.dataRow span,
.dataRow strong,
.dataRow small,
.totalRow > * {
  min-width: 0;
  font-size: clamp(12px, 1.18vh, 16px);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dataRow b { font-weight: 800; }
.dataRow > span,
.dataRow > strong,
.totalRow > span,
.totalRow > strong { text-align: right; }
.dataRow strong { font-weight: 850; }
.dataRow small { color: rgba(255,255,255,.88); }
.projection .dataRow b,
.projection .dataRow span,
.projection .dataRow strong,
.projection .dataRow small,
.projection .totalRow > * { font-size: clamp(11px, 1.05vh, 14px); }

.totalRow {
  padding: 0 10px;
  border: 1px solid rgba(120, 166, 210, .3);
  border-radius: 0 0 10px 10px;
  background: rgba(20, 55, 85, .68);
  color: #fff;
}
.totalRow b,
.totalRow strong { font-weight: 900; }
.totalRow b { font-size: clamp(13px, 1.25vh, 17px); }

.status {
  display: flex !important;
  align-items: center;
  gap: 8px;
  text-align: left !important;
  font-weight: 900;
  letter-spacing: -.01em;
}
.status i {
  flex: 0 0 auto;
  width: clamp(9px, .72vw, 13px);
  height: clamp(9px, .72vw, 13px);
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 12px currentColor;
}
.status.ok,
.greenText,
.good { color: var(--green) !important; }
.status.warn,
.attention { color: var(--yellow) !important; }
.status.bad,
.redText,
.bad { color: var(--red) !important; }

aside {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(210px, .78fr) minmax(285px, 1.22fr);
  gap: clamp(10px, 1vh, 14px);
}

.totalCard,
.insightCard { min-height: 0; overflow: hidden; }
.totalCard { padding: clamp(16px, 1.6vh, 22px) clamp(18px, 1.25vw, 24px); }
.totalCard h3 {
  margin: clamp(10px, 1.2vh, 15px) 0 0;
  color: var(--orange);
  font-size: clamp(42px, 4vw, 66px);
  font-weight: 950;
  line-height: .94;
  letter-spacing: -.035em;
  white-space: nowrap;
}
.totalCard > p {
  margin: 8px 0 clamp(14px, 1.7vh, 20px);
  color: #fff;
  font-size: clamp(13px, 1.1vw, 19px);
}
.totalCard > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: clamp(42px, 5.4vh, 58px);
  border-top: 1px solid var(--line-strong);
}
.totalCard small {
  color: #fff;
  font-size: clamp(12px, .95vw, 17px);
}
.totalCard strong {
  color: #fff;
  font-size: clamp(15px, 1.25vw, 22px);
  font-weight: 900;
  text-align: right;
  white-space: nowrap;
}

.insightCard { padding: clamp(14px, 1.45vh, 20px) clamp(14px, 1.15vw, 22px); }
.insightHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
}
.insightHead > i {
  display: grid;
  place-items: center;
  width: clamp(42px, 3vw, 54px);
  height: clamp(34px, 3.7vh, 46px);
  border: 1px solid var(--orange);
  border-radius: 12px;
  color: var(--orange);
  font-size: clamp(14px, 1.1vw, 19px);
  font-style: normal;
  font-weight: 900;
}

.insightMetric {
  display: grid;
  grid-template-columns: clamp(46px, 3.7vw, 62px) minmax(0, 1fr);
  align-items: center;
  gap: clamp(12px, .9vw, 18px);
  min-height: clamp(76px, 9.4vh, 96px);
  border-top: 1px solid var(--line-strong);
}
.insightMetric.split { grid-template-columns: clamp(46px, 3.7vw, 62px) minmax(0, 1fr) auto; }
.metricIcon {
  display: grid;
  place-items: center;
  width: clamp(46px, 3.7vw, 62px);
  height: clamp(46px, 3.7vw, 62px);
  border: 1px solid rgba(255, 122, 0, .75);
  border-radius: 13px;
  color: var(--orange);
}
.metricIcon svg { width: 72%; height: 72%; }
.metricIcon svg path,
.metricIcon svg circle { fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.insightMetric > div { min-width: 0; }
.insightMetric small,
.insightMetric strong,
.insightMetric em { display: block; }
.insightMetric small {
  color: #fff;
  font-size: clamp(12px, 1vw, 17px);
  font-weight: 700;
}
.insightMetric strong {
  margin-top: 4px;
  color: #fff;
  font-size: clamp(17px, 1.4vw, 24px);
  font-weight: 900;
  line-height: 1.04;
}
.insightMetric.split strong { margin: 0; }
.insightMetric > b {
  color: var(--green);
  font-size: clamp(24px, 2.2vw, 36px);
  font-weight: 950;
}
.insightMetric em {
  margin-top: 4px;
  color: rgba(255,255,255,.8);
  font-size: clamp(11px, .9vw, 15px);
  font-style: normal;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

footer {
  display: grid;
  grid-template-columns: auto minmax(250px, auto) minmax(260px, 1fr) auto;
  align-items: center;
  gap: clamp(14px, 1.2vw, 24px);
  padding: 0 clamp(16px, 1.25vw, 24px);
  border-top: 1px solid var(--line);
  background: rgba(2, 10, 18, .92);
}
footer > span {
  color: rgba(255,255,255,.72);
  font-size: clamp(9px, .72vw, 13px);
  white-space: nowrap;
}
footer em {
  color: rgba(255,255,255,.48);
  font-size: clamp(9px, .7vw, 12px);
  font-style: italic;
  white-space: nowrap;
}
.dots { display: flex; gap: 8px; }
.dots i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #354556;
}
.dots i.active { background: var(--orange); box-shadow: 0 0 10px rgba(255,122,0,.55); }
.progress {
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,.12);
  overflow: hidden;
}
.progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--orange), var(--orange-soft));
  transition: width .2s linear;
}

.state {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 18px;
  text-align: center;
}
.state h1 { margin: 0; color: var(--orange); font-size: 42px; }
.state p { margin: 0; color: var(--muted); font-size: 18px; }

@media (max-width: 1450px) {
  .topbar { grid-template-columns: minmax(235px, .85fr) 1.2fr minmax(165px, .6fr); }
  .coordinators article { grid-template-columns: minmax(120px, .86fr) minmax(128px, .86fr) minmax(120px, .8fr); }
  .content { grid-template-columns: minmax(0, 1fr) clamp(300px, 24vw, 345px); }
  .dailyCols { grid-template-columns: minmax(230px, 1.85fr) minmax(90px, .7fr) minmax(100px, .75fr) minmax(106px, .78fr) minmax(132px, .86fr); }
  .projectionCols { grid-template-columns: minmax(175px, 1.35fr) 80px 80px 74px 96px 52px minmax(130px, 1fr); }
  .insightMetric { gap: 10px; }
}

@media (max-height: 760px) {
  .tv { grid-template-rows: 72px 116px minmax(0, 1fr) 30px; }
  .topbar { padding-top: 5px; padding-bottom: 5px; }
  .coordinators { padding-top: 8px; padding-bottom: 7px; }
  .coordinators article { padding-top: 10px; padding-bottom: 10px; }
  .tablePanel { grid-template-rows: 62px minmax(0, 1fr); padding-top: 9px; padding-bottom: 9px; }
  .dataTable { grid-template-rows: 27px minmax(0, 1fr) 34px; }
  .dataRow { flex-basis: 24px; }
  aside { grid-template-rows: minmax(184px, .72fr) minmax(252px, 1.28fr); }
  .totalCard { padding-top: 13px; padding-bottom: 13px; }
  .totalCard h3 { margin-top: 7px; }
  .totalCard > p { margin: 5px 0 9px; }
  .totalCard > div { min-height: 38px; }
  .insightCard { padding-top: 10px; padding-bottom: 10px; }
  .insightHead { min-height: 32px; }
  .insightMetric { min-height: 66px; }
}
`;
