'use client';

import { useEffect, useMemo, useState } from 'react';

const STEP_MS = 15000;
const REFRESH_MS = 60000;

type Coordinator = { name?: string; realized?: string; goal?: string; projectedPercent?: string; dailyGoal?: string; soldToday?: string; paidToday?: string; status?: string };
type Store = { name?: string; responsible?: string; monthRealized?: string; projectedPercent?: string; dailyGoal?: string; soldToday?: string; paidToday?: string; status?: string; insight?: string };
type CoordinatorView = { name?: string; stores?: Store[]; totals?: Coordinator; insight?: string };
type ViewData = { title?: string; subtitle?: string; updatedAt?: string; date?: string; coordinators?: Coordinator[]; total?: Coordinator | null; priorityStores?: Store[]; coordinatorViews?: CoordinatorView[] };
type Payload = { ok: boolean; version?: string; generatedAt?: string; daily?: ViewData; projection?: ViewData; message?: string };

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
    return () => { alive = false; window.clearInterval(refresh); };
  }, []);

  useEffect(() => {
    const started = Date.now();
    setProgress(100);
    const tick = window.setInterval(() => {
      setProgress(Math.max(0, 100 - ((Date.now() - started) / STEP_MS) * 100));
    }, 200);
    const rotate = window.setTimeout(() => setPhase((current) => (current + 1) % 4), STEP_MS);
    return () => { window.clearInterval(tick); window.clearTimeout(rotate); };
  }, [phase]);

  const projection = phase > 0;
  const current = projection ? payload?.projection : payload?.daily;
  const coordinatorView = projection ? current?.coordinatorViews?.[phase - 1] : undefined;
  const stores = useMemo(() => projection ? coordinatorView?.stores || [] : current?.priorityStores || [], [projection, coordinatorView, current]);

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
            <div><span>{projection ? 'RESULTADO POR COORDENAÇÃO' : 'ACOMPANHAMENTO DO RETRATO'}</span><h2>{projection ? `COORDENAÇÃO ${coordinatorView?.name || '-'}` : 'Resultado das lojas no dia'}</h2><p>{projection ? 'Resultado das lojas da coordenação' : 'Recorte das lojas com maior lacuna no retrato atual'}</p></div>
            {projection && <b>{phase}/3</b>}
          </div>

          {projection ? <ProjectionTable stores={stores} totals={coordinatorView?.totals} name={coordinatorView?.name} /> : <DailyTable stores={stores} />}
        </div>

        <aside>
          <TotalCard current={current} projection={projection} />
          <div className="insightCard">
            <div className="insightHead"><span>INSIGHT OPERACIONAL</span><i>AI</i></div>
            <p>{projection ? coordinatorView?.insight || 'Leitura operacional indisponível.' : dailyInsight(current, stores)}</p>
          </div>
        </aside>
      </section>

      <footer>
        <div className="dots"><i className={!projection ? 'active' : ''} /><i className={projection ? 'active' : ''} /></div>
        <span>{projection ? 'Visão de projeção: 45 segundos no total • troca de coordenação a cada 15 segundos' : 'Visão diária: 15 segundos'}</span>
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
        <em>{payload.version}</em>
      </footer>
    </main>
  );
}

function CoordinatorCard({ item, projection }: { item: Coordinator; projection: boolean }) {
  const positive = projection ? numberPercent(item.projectedPercent) >= 100 : delivered(item.status);
  return <article className={positive ? 'positive' : 'critical'}><div className="coordHead"><span>COORDENADORA</span><b>{item.name}</b></div><div className="coordMain"><strong>{projection ? item.projectedPercent || '--' : item.paidToday || 'R$ 0'}</strong><small>{projection ? 'projeção do mês' : 'pago hoje'}</small></div><div className="coordStats"><div><span>{projection ? 'Realizado' : 'Vendido'}</span><b>{projection ? item.realized || '--' : item.soldToday || '--'}</b></div><div><span>{projection ? 'Meta' : 'Diária'}</span><b>{projection ? item.goal || '--' : item.dailyGoal || '--'}</b></div></div></article>;
}

function ProjectionTable({ stores, totals, name }: { stores: Store[]; totals?: Coordinator; name?: string }) {
  return <div className="projectionTable"><div className="tableHeader projectionCols"><span>Loja</span><span>Diária</span><span>Vendido hoje</span><span>Pago no retrato</span><span>Status</span></div><div className="rows projectionRows">{stores.map((store) => <div className="projectionRow projectionCols" key={store.name}><b>{store.name || '-'}</b><span>{store.dailyGoal || '--'}</span><strong className={moneyNumber(store.soldToday) <= 0 ? 'redText' : ''}>{store.soldToday || 'R$ 0'}</strong><strong className={moneyNumber(store.paidToday) <= 0 ? 'redText' : ''}>{store.paidToday || '0,00'}</strong><Status value={store.status} /></div>)}</div><div className="totalRow projectionCols"><b>TOTAL {String(name || '').toUpperCase()}</b><span>{totals?.dailyGoal || '--'}</span><strong>{totals?.soldToday || '--'}</strong><strong>{totals?.paidToday || '--'}</strong><Status value={totals?.status} /></div></div>;
}

function DailyTable({ stores }: { stores: Store[] }) {
  return <div className="dailyTable"><div className="tableHeader dailyCols"><span>Loja</span><span>Coord.</span><span>Vendido</span><span>Pago</span><span>Diária</span><span>Leitura</span></div><div className="rows">{stores.map((store) => <div className="dailyRow dailyCols" key={`${store.responsible}-${store.name}`}><b>{store.name || '-'}</b><span>{store.responsible || '-'}</span><strong>{store.soldToday || 'R$ 0'}</strong><strong className="highlight">{store.paidToday || 'R$ 0'}</strong><span>{store.dailyGoal || '--'}</span><small>{store.insight || 'Sem leitura.'}</small></div>)}</div></div>;
}

function Status({ value }: { value?: string }) {
  const ok = delivered(value);
  const accelerate = String(value || '').toUpperCase().includes('ACELERA');
  return <span className={`status ${ok ? 'ok' : accelerate ? 'warn' : 'bad'}`}><i />{ok ? 'ENTREGUE' : accelerate ? 'ACELERA' : 'NÃO ENTREGUE'}</span>;
}

function TotalCard({ current, projection }: { current?: ViewData; projection: boolean }) {
  return <div className="totalCard"><span>CONSOLIDADO CREDVIX</span><h3>{projection ? current?.total?.projectedPercent || '--' : current?.total?.paidToday || 'R$ 0'}</h3><p>{projection ? 'Projeção consolidada' : 'Pago no retrato'}</p><div><small>{projection ? 'Meta consolidada' : 'Diária necessária'}</small><strong>{projection ? current?.total?.goal || '--' : current?.total?.dailyGoal || '--'}</strong></div><div><small>{projection ? 'Realizado' : 'Vendido hoje'}</small><strong>{projection ? current?.total?.realized || '--' : current?.total?.soldToday || '--'}</strong></div></div>;
}

function dailyInsight(current: ViewData | undefined, stores: Store[]) {
  const zero = stores.filter((store) => moneyNumber(store.paidToday) <= 0).length;
  const sold = stores.filter((store) => moneyNumber(store.soldToday) > 0 && moneyNumber(store.paidToday) <= 0).length;
  return `${zero} lojas do recorte estão sem pagamento no retrato; ${sold} delas já registram vendido ainda não convertido em pago. Consolidado atual: ${current?.total?.paidToday || 'R$ 0'} pagos sobre diária de ${current?.total?.dailyGoal || '--'}.`;
}

function delivered(value?: string) { const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); return text.includes('ENTREGUE') && !text.includes('NAO ENTREGUE'); }
function numberPercent(value?: string) { const n = Number(String(value || '').replace('%', '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function moneyNumber(value?: string) { const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function State({ title, text }: { title: string; text: string }) { return <main className="state"><style jsx global>{styles}</style><Logo /><h1>{title}</h1><p>{text}</p></main>; }
function Logo() { return <svg viewBox="0 0 68 68" aria-hidden="true"><path d="M34 5 59 19v30L34 63 9 49V19L34 5Z"/><path d="m22 28 12-7 12 7v13l-12 7-12-7V28Z"/></svg>; }

const styles = `
*{box-sizing:border-box}html,body{margin:0;background:#06101b;overflow:hidden}.tv,.state{width:100vw;height:100vh;color:#f7f9fc;font-family:"Segoe UI Variable",Inter,"Segoe UI",Arial,sans-serif;background:radial-gradient(circle at 9% 0%,rgba(242,112,16,.13),transparent 29%),linear-gradient(135deg,#06101b,#091b2d 58%,#06101b);overflow:hidden}.tv:before{content:'';position:absolute;inset:0;opacity:.06;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:36px 36px}.tv header,.coordinators,.content,.tv footer,.warning{position:relative;z-index:2}.tv header{height:86px;padding:12px 22px;display:grid;grid-template-columns:300px 1fr 220px;gap:20px;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(4,13,23,.91)}.brand{display:flex;align-items:center;gap:12px}.brand svg,.state svg{width:48px;height:48px;padding:8px;border-radius:14px;background:rgba(242,112,16,.08);border:1px solid rgba(242,112,16,.4)}svg path{fill:none;stroke:#f27010;stroke-width:4;stroke-linejoin:round}.brand strong{display:block;color:#f27010;font-size:27px;line-height:1;font-weight:850;letter-spacing:-.03em}.brand span{display:block;margin-top:6px;font-size:10px;font-weight:650;letter-spacing:.18em;color:rgba(255,255,255,.67)}.title{text-align:center;min-width:0}.title span{color:#f99503;font-size:10px;font-weight:800;letter-spacing:.15em}.title h1{margin:3px 0 2px;font-size:31px;line-height:1;font-weight:780;letter-spacing:-.025em}.title p{margin:0;color:rgba(255,255,255,.67);font-size:12px;font-weight:500}.meta{text-align:right}.meta span{display:block;color:rgba(255,255,255,.5);font-size:9px;font-weight:700}.meta strong{display:block;margin-top:2px;color:#f99503;font-size:28px;line-height:1}.meta small{display:block;margin-top:5px;color:rgba(255,255,255,.55);font-size:10px}.warning{height:25px;padding:5px 22px;background:rgba(235,72,20,.18);color:#ffd7cd;font-size:11px;font-weight:700}.coordinators{height:142px;padding:12px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:13px}.coordinators article{position:relative;display:grid;grid-template-columns:1.12fr .9fr 1.1fr;gap:14px;align-items:center;padding:15px 17px;border-radius:18px;background:linear-gradient(180deg,rgba(15,36,58,.96),rgba(8,23,38,.96));border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 30px rgba(0,0,0,.2);overflow:hidden}.coordinators article:before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:#f27010}.coordinators article.positive:before{background:#40c985}.coordHead span,.coordStats span{display:block;color:rgba(255,255,255,.5);font-size:9px;font-weight:700}.coordHead b{display:block;margin-top:6px;font-size:21px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.coordMain{text-align:center;border-left:1px solid rgba(255,255,255,.08);border-right:1px solid rgba(255,255,255,.08)}.coordMain strong{display:block;color:#f99503;font-size:26px;font-weight:780;white-space:nowrap}.coordMain small{display:block;margin-top:4px;color:rgba(255,255,255,.58);font-size:9px;font-weight:600}.coordStats{display:grid;gap:9px}.coordStats div{display:flex;justify-content:space-between;gap:8px}.coordStats b{font-size:12px;color:#fff;font-weight:650;white-space:nowrap}.content{height:calc(100vh - 276px);padding:0 22px 10px;display:grid;grid-template-columns:minmax(0,1fr) 315px;gap:14px}.warning~.coordinators+.content{height:calc(100vh - 301px)}.tablePanel,.totalCard,.insightCard{border-radius:18px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(13,31,50,.97),rgba(7,20,34,.97));box-shadow:0 18px 36px rgba(0,0,0,.22)}.tablePanel{padding:12px 15px;min-width:0;overflow:hidden}.panelTitle{height:62px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.panelTitle span,.totalCard>span,.insightHead>span{display:block;color:#f99503;font-size:9px;font-weight:800;letter-spacing:.13em}.panelTitle h2{margin:4px 0 0;font-size:20px;line-height:1;font-weight:730}.panelTitle p{margin:5px 0 0;color:rgba(255,255,255,.58);font-size:11px}.panelTitle>b{padding:7px 10px;border-radius:10px;background:rgba(242,112,16,.12);color:#f99503;font-size:12px}.tableHeader{height:26px;color:rgba(255,255,255,.45);font-size:9px;font-weight:750;text-transform:uppercase}.projectionCols{display:grid;grid-template-columns:minmax(260px,1.7fr) 120px 120px 130px 135px;gap:10px;align-items:center}.projectionRows{display:grid;gap:3px}.projectionRow{height:27px;padding:0 9px;border-radius:8px;background:rgba(255,255,255,.035);border-bottom:1px solid rgba(255,255,255,.045)}.projectionRow b{font-size:11px;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.projectionRow>span,.projectionRow>strong,.totalRow>span,.totalRow>strong{font-size:11px;text-align:right;white-space:nowrap}.projectionRow>strong{font-weight:650}.redText{color:#ff5964}.status{display:flex!important;justify-content:flex-start;align-items:center;gap:7px!important;text-align:left!important;font-size:10px!important;font-weight:700;color:#ff5964}.status i{width:9px;height:9px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}.status.ok{color:#42d99a}.status.warn{color:#f9c74f}.totalRow{height:34px;margin-top:4px;padding:0 9px;border-radius:9px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.06)}.totalRow>b{font-size:11px;font-weight:700}.dailyCols{display:grid;grid-template-columns:minmax(220px,1.45fr) 105px 100px 100px 105px minmax(190px,1fr);gap:9px;align-items:center}.dailyRow{height:38px;padding:0 10px;border-radius:9px;background:rgba(255,255,255,.04);border-left:3px solid #f27010}.dailyRow>b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dailyRow>span{font-size:10px;color:rgba(255,255,255,.67);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dailyRow>strong{font-size:12px;text-align:right;white-space:nowrap}.dailyRow .highlight{color:#f99503;font-size:13px}.dailyRow>small{font-size:9px;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}aside{display:grid;grid-template-rows:.88fr 1.12fr;gap:14px}.totalCard,.insightCard{padding:17px;overflow:hidden}.totalCard h3{margin:11px 0 1px;color:#f99503;font-size:35px;line-height:1;font-weight:780}.totalCard>p{margin:0 0 17px;color:rgba(255,255,255,.58);font-size:11px;font-weight:600}.totalCard>div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}.totalCard small{color:rgba(255,255,255,.5);font-size:9px;font-weight:650}.totalCard div strong{font-size:13px;text-align:right}.insightHead{display:flex;align-items:center;justify-content:space-between}.insightHead i{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;border:1px solid rgba(249,149,3,.55);color:#f99503;font-size:12px;font-style:normal;font-weight:800}.insightCard p{margin:16px 0 0;color:rgba(255,255,255,.86);font-size:13px;line-height:1.48;font-weight:480}.tv footer{height:48px;padding:0 22px;display:grid;grid-template-columns:55px 480px 1fr 150px;gap:14px;align-items:center;border-top:1px solid rgba(255,255,255,.1);background:rgba(4,13,23,.91)}.dots{display:flex;gap:7px}.dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.18)}.dots i.active{background:#f27010;box-shadow:0 0 12px rgba(242,112,16,.7)}footer span{color:rgba(255,255,255,.58);font-size:10px;font-weight:650;white-space:nowrap}.progress{height:5px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.progress i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#f27010,#f99503)}footer em{text-align:right;color:rgba(255,255,255,.38);font-size:9px;font-style:normal;font-weight:700}.state{display:grid;place-content:center;text-align:center}.state svg{margin:auto}.state h1{margin:18px 0 8px;font-size:34px}.state p{margin:0;color:rgba(255,255,255,.65)}
`;
