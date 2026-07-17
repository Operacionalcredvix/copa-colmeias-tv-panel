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
    const rotate = window.setTimeout(() => setPhase((current) => (current + 1) % PHASES), STEP_MS);
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

  if (loading && !payload) return <State title="RADAR OPERACIONAL" text="Carregando dados da Gestão Preditiva..." />;
  if (!payload) return <State title="PAINEL INDISPONÍVEL" text={error || 'Não foi possível carregar os dados.'} />;

  return (
    <main className={`tv ${projection ? 'projection' : 'daily'}`}>
      <style jsx global>{styles}</style>

      <header>
        <div className="brand"><Logo /><div><strong>CREDVIX</strong><span>RADAR OPERACIONAL</span></div></div>
        <div className="title"><span>{projection ? 'VISÃO 2 DE 2' : 'VISÃO 1 DE 2'}</span><h1>{current?.title || '-'}</h1><p>{current?.subtitle || ''}</p></div>
        <div className="meta"><span>ATUALIZAÇÃO</span><strong>{current?.updatedAt || '--'}</strong><small>{current?.date || payload.generatedAt || ''}</small></div>
      </header>

      {error && <div className="warning">Última leitura mantida. Erro na atualização: {error}</div>}

      <section className="coordinators">
        {(current?.coordinators || []).slice(0, 3).map((item) => <CoordinatorCard key={item.name} item={item} projection={projection} />)}
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

          {projection
            ? <ProjectionTable stores={stores} totals={coordinatorView?.totals} name={coordinatorView?.name} />
            : <DailyTable stores={stores} totals={coordinatorView?.totals} name={coordinatorView?.name} />}
        </div>

        <aside>
          <TotalCard current={current} projection={projection} />
          <div className="insightCard">
            <div className="insightHead"><span>{projection ? 'INSIGHT DE PROJEÇÃO' : 'INSIGHT OPERACIONAL'}</span><i>AI</i></div>
            <p>{coordinatorView?.insight || 'Leitura indisponível.'}</p>
          </div>
        </aside>
      </section>

      <footer>
        <div className="dots"><i className={!projection ? 'active' : ''} /><i className={projection ? 'active' : ''} /></div>
        <span>{projection ? 'Projeção de meta • troca de coordenação a cada 15 segundos' : 'Diária estática • troca de coordenação a cada 15 segundos'}</span>
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
        <em>{payload.version}</em>
      </footer>
    </main>
  );
}

function CoordinatorCard({ item, projection }: { item: Coordinator; projection: boolean }) {
  const positive = projection ? numberPercent(item.projectedPercent) >= 100 : delivered(item.status);
  return (
    <article className={positive ? 'positive' : 'critical'}>
      <div className="coordHead"><span>COORDENADORA</span><b>{item.name}</b></div>
      <div className="coordMain"><strong>{projection ? item.projectedPercent || '--' : item.paidToday || 'R$ 0'}</strong><small>{projection ? 'projeção do mês' : 'pago hoje'}</small></div>
      <div className="coordStats">
        <div><span>{projection ? 'Realizado' : 'Vendido'}</span><b>{projection ? item.realized || '--' : item.soldToday || '--'}</b></div>
        <div><span>{projection ? 'Meta' : 'Diária'}</span><b>{projection ? item.goal || '--' : item.dailyGoal || '--'}</b></div>
      </div>
    </article>
  );
}

function DailyTable({ stores, totals, name }: { stores: Store[]; totals?: CoordinatorTotals; name?: string }) {
  return (
    <div className="dataTable">
      <div className="tableHeader dailyCols"><span>Loja</span><span>Diária</span><span>Vendido hoje</span><span>Pago no retrato</span><span>Status</span></div>
      <div className="rows">
        {stores.map((store) => (
          <div className="dataRow dailyCols" key={store.name}>
            <b>{store.name || '-'}</b><span>{store.dailyGoal || '--'}</span><strong>{store.soldToday || 'R$ 0'}</strong>
            <strong className={moneyNumber(store.paidToday) <= 0 ? 'redText' : ''}>{store.paidToday || 'R$ 0'}</strong><Status value={store.status} />
          </div>
        ))}
      </div>
      <div className="totalRow dailyCols"><b>TOTAL {String(name || '').toUpperCase()}</b><span>{totals?.dailyGoal || '--'}</span><strong>{totals?.soldToday || '--'}</strong><strong>{totals?.paidToday || '--'}</strong><Status value={totals?.status} /></div>
    </div>
  );
}

function ProjectionTable({ stores, totals, name }: { stores: Store[]; totals?: CoordinatorTotals; name?: string }) {
  return (
    <div className="dataTable">
      <div className="tableHeader projectionCols"><span>Loja</span><span>Realizado</span><span>Meta</span><span>% projetado</span><span>Diária necessária</span><span>Seguros</span><span>Insight Liga</span></div>
      <div className="rows">
        {stores.map((store) => (
          <div className="dataRow projectionCols" key={store.name}>
            <b>{store.name || '-'}</b><span>{store.monthRealized || '--'}</span><span>{store.monthGoal || '--'}</span>
            <strong className={numberPercent(store.projectedPercent) >= 100 ? 'greenText' : 'redText'}>{store.projectedPercent || '--'}</strong>
            <span>{store.dailyGoal || '--'}</span><span>{store.insurance || '0'}</span><small>{store.insight || '--'}</small>
          </div>
        ))}
      </div>
      <div className="totalRow projectionCols"><b>TOTAL {String(name || '').toUpperCase()}</b><span>{totals?.monthRealized || '--'}</span><span>{totals?.monthGoal || '--'}</span><strong>{totals?.projectedPercent || '--'}</strong><span>{totals?.dailyGoal || '--'}</span><span>{totals?.insurance || '0'}</span><small>Consolidado da coordenação</small></div>
    </div>
  );
}

function Status({ value }: { value?: string }) {
  const ok = delivered(value);
  const accelerate = normalized(value).includes('ACELERA');
  return <span className={`status ${ok ? 'ok' : accelerate ? 'warn' : 'bad'}`}><i />{ok ? 'ENTREGUE' : accelerate ? 'ACELERA' : 'NÃO ENTREGUE'}</span>;
}

function TotalCard({ current, projection }: { current?: ViewData; projection: boolean }) {
  return (
    <div className="totalCard">
      <span>CONSOLIDADO CREDVIX</span><h3>{projection ? current?.total?.projectedPercent || '--' : current?.total?.paidToday || 'R$ 0'}</h3>
      <p>{projection ? 'Projeção consolidada' : 'Pago no retrato'}</p>
      <div><small>{projection ? 'Meta consolidada' : 'Diária necessária'}</small><strong>{projection ? current?.total?.goal || '--' : current?.total?.dailyGoal || '--'}</strong></div>
      <div><small>{projection ? 'Realizado' : 'Vendido hoje'}</small><strong>{projection ? current?.total?.realized || '--' : current?.total?.soldToday || '--'}</strong></div>
    </div>
  );
}

function State({ title, text }: { title: string; text: string }) {
  return <main className="state"><style jsx global>{styles}</style><Logo /><h1>{title}</h1><p>{text}</p></main>;
}

function Logo() {
  return <svg viewBox="0 0 68 68" aria-hidden="true"><path d="M34 5 59 19v30L34 63 9 49V19L34 5Z"/><path d="m22 28 12-7 12 7v13l-12 7-12-7V28Z"/></svg>;
}

function normalized(value?: string) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function delivered(value?: string) { const text = normalized(value); return text.includes('ENTREGUE') && !text.includes('NAO ENTREGUE'); }
function numberPercent(value?: string) { const n = Number(String(value || '').replace('%', '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function moneyNumber(value?: string) { const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }

const styles = `
*{box-sizing:border-box}html,body{margin:0;background:#06101b;overflow:hidden}.tv,.state{width:100vw;height:100vh;color:#f7f9fc;font-family:"Segoe UI Variable",Inter,"Segoe UI",Arial,sans-serif;background:radial-gradient(circle at 9% 0%,rgba(242,112,16,.13),transparent 29%),linear-gradient(135deg,#06101b,#091b2d 58%,#06101b);overflow:hidden}.tv:before{content:'';position:absolute;inset:0;opacity:.06;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:36px 36px}.tv header,.coordinators,.content,.tv footer,.warning{position:relative;z-index:2}.tv header{height:72px;padding:8px 18px;display:grid;grid-template-columns:280px 1fr 205px;gap:16px;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(4,13,23,.91)}.brand{display:flex;align-items:center;gap:10px}.brand svg,.state svg{width:42px;height:42px;padding:7px;border-radius:12px;background:rgba(242,112,16,.08);border:1px solid rgba(242,112,16,.4)}svg path{fill:none;stroke:#f27010;stroke-width:4}.brand strong{display:block;color:#f27010;font-size:24px;line-height:1;font-weight:850}.brand span{display:block;margin-top:4px;font-size:9px;letter-spacing:.16em;color:rgba(255,255,255,.67)}.title{text-align:center}.title span{color:#f99503;font-size:9px;font-weight:800;letter-spacing:.14em}.title h1{margin:2px 0;font-size:27px;line-height:1}.title p{margin:0;color:rgba(255,255,255,.62);font-size:10px}.meta{text-align:right}.meta span{display:block;color:rgba(255,255,255,.5);font-size:8px}.meta strong{display:block;color:#f99503;font-size:24px;line-height:1}.meta small{font-size:9px;color:rgba(255,255,255,.55)}.warning{height:22px;padding:4px 18px;background:rgba(235,72,20,.18);font-size:10px}.coordinators{height:112px;padding:8px 18px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.coordinators article{position:relative;display:grid;grid-template-columns:1.05fr .85fr 1fr;gap:10px;align-items:center;padding:11px 13px;border-radius:15px;background:linear-gradient(180deg,rgba(15,36,58,.96),rgba(8,23,38,.96));border:1px solid rgba(255,255,255,.1);overflow:hidden}.coordinators article:before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:#f27010}.coordinators article.positive:before{background:#40c985}.coordHead span,.coordStats span{display:block;color:rgba(255,255,255,.5);font-size:8px}.coordHead b{display:block;margin-top:4px;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.coordMain{text-align:center;border-left:1px solid rgba(255,255,255,.08);border-right:1px solid rgba(255,255,255,.08)}.coordMain strong{display:block;color:#f99503;font-size:21px;white-space:nowrap}.coordMain small{font-size:8px;color:rgba(255,255,255,.58)}.coordStats{display:grid;gap:6px}.coordStats div{display:flex;justify-content:space-between;gap:6px}.coordStats b{font-size:10px;white-space:nowrap}.content{height:calc(100vh - 226px);padding:0 18px 8px;display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:10px}.warning~.coordinators+.content{height:calc(100vh - 248px)}.tablePanel,.totalCard,.insightCard{border-radius:15px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(13,31,50,.97),rgba(7,20,34,.97))}.tablePanel{padding:8px 11px;min-width:0;overflow:hidden}.panelTitle{height:48px;display:flex;justify-content:space-between}.panelTitle span,.totalCard>span,.insightHead>span{color:#f99503;font-size:8px;font-weight:800;letter-spacing:.12em}.panelTitle h2{margin:2px 0 0;font-size:17px;line-height:1}.panelTitle p{margin:4px 0 0;color:rgba(255,255,255,.55);font-size:9px}.panelTitle>b{height:26px;padding:5px 8px;border-radius:8px;background:rgba(242,112,16,.12);color:#f99503;font-size:10px}.tableHeader{height:22px;color:rgba(255,255,255,.45);font-size:8px;font-weight:750;text-transform:uppercase}.dailyCols{display:grid;grid-template-columns:minmax(220px,1.6fr) 105px 115px 120px 125px;gap:7px;align-items:center}.projectionCols{display:grid;grid-template-columns:minmax(175px,1.35fr) 88px 88px 82px 105px 54px minmax(130px,1fr);gap:6px;align-items:center}.rows{display:grid;gap:2px}.dataRow{height:22px;padding:0 7px;border-radius:6px;background:rgba(255,255,255,.035);border-bottom:1px solid rgba(255,255,255,.04)}.dataRow b,.dataRow span,.dataRow strong,.dataRow small,.totalRow>*{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dataRow>span,.dataRow>strong,.totalRow>span,.totalRow>strong{text-align:right}.dataRow small{color:rgba(255,255,255,.65)}.redText{color:#ff5964}.greenText{color:#42d99a}.status{display:flex!important;align-items:center;gap:5px!important;text-align:left!important;font-weight:700;color:#ff5964}.status i{width:7px;height:7px;border-radius:50%;background:currentColor}.status.ok{color:#42d99a}.status.warn{color:#f9c74f}.totalRow{height:28px;margin-top:3px;padding:0 7px;border-radius:7px;background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.07)}aside{display:grid;grid-template-rows:.86fr 1.14fr;gap:10px}.totalCard,.insightCard{padding:13px;overflow:hidden}.totalCard h3{margin:8px 0 1px;color:#f99503;font-size:30px;line-height:1}.totalCard>p{margin:0 0 10px;color:rgba(255,255,255,.58);font-size:9px}.totalCard>div{display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid rgba(255,255,255,.08)}.totalCard small{font-size:8px;color:rgba(255,255,255,.5)}.totalCard div strong{font-size:11px;text-align:right}.insightHead{display:flex;justify-content:space-between}.insightHead i{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;border:1px solid rgba(249,149,3,.55);color:#f99503;font-size:10px;font-style:normal}.insightCard p{margin:12px 0 0;font-size:11px;line-height:1.42}.tv footer{height:42px;padding:0 18px;display:grid;grid-template-columns:48px 420px 1fr 125px;gap:10px;align-items:center;border-top:1px solid rgba(255,255,255,.1);background:rgba(4,13,23,.91)}.dots{display:flex;gap:6px}.dots i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18)}.dots i.active{background:#f27010}.tv footer span{font-size:9px;color:rgba(255,255,255,.58)}.progress{height:4px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.progress i{display:block;height:100%;background:linear-gradient(90deg,#f27010,#f99503)}footer em{text-align:right;font-size:8px;color:rgba(255,255,255,.35)}.state{display:grid;place-content:center;text-align:center}.state svg{margin:auto}.state h1{margin:15px 0 7px;font-size:31px}.state p{margin:0;color:rgba(255,255,255,.65)}@media(max-height:760px){.dataRow{height:20px}.panelTitle{height:44px}.tableHeader{height:20px}.coordinators{height:106px}.content{height:calc(100vh - 220px)}}
`;