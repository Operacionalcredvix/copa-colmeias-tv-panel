'use client';

import { useEffect, useMemo, useState } from 'react';

const ROTATION_MS = 15000;
const REFRESH_MS = 60000;

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
  monthGoal?: string;
  monthRealized?: string;
  monthPercent?: string;
  projectedPercent?: string;
  dailyGoal?: string;
  soldToday?: string;
  paidToday?: string;
  status?: string;
  insight?: string;
};

type ViewData = {
  title?: string;
  subtitle?: string;
  updatedAt?: string;
  date?: string;
  coordinators?: Coordinator[];
  total?: Coordinator | null;
  priorityStores?: Store[];
  riskStores?: Store[];
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
  const [screen, setScreen] = useState<'daily' | 'projection'>('daily');
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
      const elapsed = Date.now() - started;
      setProgress(Math.max(0, 100 - (elapsed / ROTATION_MS) * 100));
    }, 200);
    const rotate = window.setTimeout(() => {
      setScreen((current) => current === 'daily' ? 'projection' : 'daily');
    }, ROTATION_MS);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(rotate);
    };
  }, [screen]);

  const current = screen === 'daily' ? payload?.daily : payload?.projection;
  const stores = useMemo(
    () => screen === 'daily' ? current?.priorityStores || [] : current?.riskStores || [],
    [current, screen]
  );

  if (loading && !payload) return <State title="RADAR OPERACIONAL" text="Carregando dados da Gestão Preditiva..." />;
  if (!payload) return <State title="PAINEL INDISPONÍVEL" text={error || 'Não foi possível carregar os dados.'} />;

  return (
    <main className={`tv ${screen}`}>
      <style jsx global>{styles}</style>

      <header>
        <div className="brand">
          <Logo />
          <div>
            <strong>CREDVIX</strong>
            <span>RADAR OPERACIONAL</span>
          </div>
        </div>

        <div className="title">
          <span>{screen === 'daily' ? 'VISÃO 1 DE 2' : 'VISÃO 2 DE 2'}</span>
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
        {(current?.coordinators || []).slice(0, 3).map((item) => (
          <CoordinatorCard key={item.name} item={item} mode={screen} />
        ))}
      </section>

      <section className="content">
        <div className="tablePanel">
          <div className="panelTitle">
            <div>
              <span>{screen === 'daily' ? 'PRIORIDADE IMEDIATA' : 'MAIOR RISCO DE META'}</span>
              <h2>{screen === 'daily' ? 'Lojas que exigem atuação agora' : 'Lojas com pior projeção do mês'}</h2>
            </div>
            <b>TOP {stores.length}</b>
          </div>

          <div className="tableHeader">
            <span>Loja</span>
            <span>Coord.</span>
            <span>{screen === 'daily' ? 'Vendido' : 'Realizado'}</span>
            <span>{screen === 'daily' ? 'Pago' : 'Projeção'}</span>
            <span>Diária</span>
            <span>Leitura</span>
          </div>

          <div className="rows">
            {stores.map((store, index) => (
              <StoreRow key={`${store.name}-${index}`} store={store} position={index + 1} mode={screen} />
            ))}
          </div>
        </div>

        <aside>
          <div className="totalCard">
            <span>CONSOLIDADO CREDVIX</span>
            <h3>{screen === 'daily' ? current?.total?.paidToday || 'R$ 0' : current?.total?.projectedPercent || '--'}</h3>
            <p>{screen === 'daily' ? 'Pago no retrato' : 'Projeção consolidada'}</p>
            <div>
              <small>{screen === 'daily' ? 'Diária necessária' : 'Meta consolidada'}</small>
              <strong>{screen === 'daily' ? current?.total?.dailyGoal || '--' : current?.total?.goal || '--'}</strong>
            </div>
            <div>
              <small>{screen === 'daily' ? 'Vendido hoje' : 'Realizado'}</small>
              <strong>{screen === 'daily' ? current?.total?.soldToday || '--' : current?.total?.realized || '--'}</strong>
            </div>
          </div>

          <div className="decisionCard">
            <span>LEITURA EXECUTIVA</span>
            <h3>{executiveHeadline(screen, current)}</h3>
            <p>{executiveText(screen, current, stores)}</p>
          </div>
        </aside>
      </section>

      <footer>
        <div className="dots"><i className={screen === 'daily' ? 'active' : ''} /><i className={screen === 'projection' ? 'active' : ''} /></div>
        <span>Alternância automática a cada 15 segundos</span>
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
        <em>{payload.version}</em>
      </footer>
    </main>
  );
}

function CoordinatorCard({ item, mode }: { item: Coordinator; mode: 'daily' | 'projection' }) {
  const percent = numberPercent(item.projectedPercent);
  const delivered = String(item.status || '').includes('ENTREGUE') && !String(item.status || '').includes('NÃO');
  const critical = mode === 'projection' ? percent < 85 : !delivered;

  return (
    <article className={critical ? 'critical' : 'positive'}>
      <div className="coordHead">
        <span>COORDENADORA</span>
        <b>{item.name}</b>
      </div>
      <div className="coordMain">
        <strong>{mode === 'daily' ? item.paidToday || 'R$ 0' : item.projectedPercent || '--'}</strong>
        <small>{mode === 'daily' ? 'pago hoje' : 'projeção do mês'}</small>
      </div>
      <div className="coordStats">
        <div><span>{mode === 'daily' ? 'Vendido' : 'Realizado'}</span><b>{mode === 'daily' ? item.soldToday || '--' : item.realized || '--'}</b></div>
        <div><span>{mode === 'daily' ? 'Diária' : 'Meta'}</span><b>{mode === 'daily' ? item.dailyGoal || '--' : item.goal || '--'}</b></div>
      </div>
    </article>
  );
}

function StoreRow({ store, position, mode }: { store: Store; position: number; mode: 'daily' | 'projection' }) {
  const projected = numberPercent(store.projectedPercent);
  const isZero = mode === 'daily' && moneyNumber(store.paidToday) <= 0;
  const level = mode === 'projection' ? (projected < 70 ? 'red' : projected < 100 ? 'yellow' : 'green') : (isZero ? 'red' : 'yellow');

  return (
    <div className={`storeRow ${level}`}>
      <div className="storeName"><em>{position}</em><b>{store.name || '-'}</b></div>
      <span>{store.responsible || '-'}</span>
      <strong>{mode === 'daily' ? store.soldToday || 'R$ 0' : store.monthRealized || 'R$ 0'}</strong>
      <strong className="highlight">{mode === 'daily' ? store.paidToday || 'R$ 0' : store.projectedPercent || '--'}</strong>
      <span>{store.dailyGoal || '--'}</span>
      <small>{shortInsight(store.insight, mode)}</small>
    </div>
  );
}

function executiveHeadline(mode: 'daily' | 'projection', current?: ViewData) {
  if (mode === 'daily') {
    const total = current?.total;
    return String(total?.status || '').includes('NÃO') ? 'Diária ainda não entregue' : 'Diária entregue';
  }
  const percent = numberPercent(current?.total?.projectedPercent);
  if (percent >= 100) return 'Ritmo consolidado acima da meta';
  if (percent >= 90) return 'Meta ainda recuperável';
  return 'Risco consolidado de fechamento';
}

function executiveText(mode: 'daily' | 'projection', current: ViewData | undefined, stores: Store[]) {
  if (mode === 'daily') {
    const zeros = stores.filter((store) => moneyNumber(store.paidToday) <= 0).length;
    return `${zeros} das lojas prioritárias estão sem pagamento no retrato. A atuação deve começar por conversão do vendido em pago e pelas maiores lacunas de diária.`;
  }
  const below = stores.filter((store) => numberPercent(store.projectedPercent) < 100).length;
  return `${below} lojas do recorte estão projetadas abaixo de 100%. Priorizar as unidades abaixo de 70% e cobrar plano de recuperação por coordenadora.`;
}

function shortInsight(value: string | undefined, mode: 'daily' | 'projection') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return mode === 'daily' ? 'Atuação necessária' : 'Risco de meta';
  return text.length > 62 ? `${text.slice(0, 59)}...` : text;
}

function numberPercent(value?: string) {
  const n = Number(String(value || '').replace('%', '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function moneyNumber(value?: string) {
  const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function State({ title, text }: { title: string; text: string }) {
  return <main className="state"><style jsx global>{styles}</style><Logo /><h1>{title}</h1><p>{text}</p></main>;
}

function Logo() {
  return <svg viewBox="0 0 68 68" aria-hidden="true"><path d="M34 5 59 19v30L34 63 9 49V19L34 5Z"/><path d="m22 28 12-7 12 7v13l-12 7-12-7V28Z"/></svg>;
}

const styles = `
  *{box-sizing:border-box}html,body{margin:0;background:#07111c;overflow:hidden}.tv,.state{width:100vw;height:100vh;color:#f7f9fc;font-family:Inter,Arial,sans-serif;background:radial-gradient(circle at 10% 0%,rgba(242,112,16,.17),transparent 32%),linear-gradient(135deg,#06101b,#0a1d30 58%,#06101b);overflow:hidden}.tv:before{content:'';position:absolute;inset:0;opacity:.09;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:34px 34px}.tv header,.coordinators,.content,.tv footer,.warning{position:relative;z-index:2}.tv header{height:88px;padding:13px 22px;display:grid;grid-template-columns:300px 1fr 220px;gap:20px;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(4,13,23,.9)}.brand{display:flex;align-items:center;gap:12px}.brand svg,.state svg{width:48px;height:48px;padding:8px;border-radius:14px;background:rgba(242,112,16,.1);border:1px solid rgba(242,112,16,.35)}svg path{fill:none;stroke:#f27010;stroke-width:4;stroke-linejoin:round}.brand strong{display:block;color:#f27010;font-size:26px;line-height:1;font-weight:1000}.brand span{display:block;margin-top:5px;font-size:10px;font-weight:900;letter-spacing:.18em;color:rgba(255,255,255,.64)}.title{text-align:center;min-width:0}.title span{color:#f99503;font-size:10px;font-weight:1000;letter-spacing:.15em}.title h1{margin:3px 0 2px;font-size:30px;line-height:1;font-weight:1000}.title p{margin:0;color:rgba(255,255,255,.62);font-size:12px;font-weight:700}.meta{text-align:right}.meta span{display:block;color:rgba(255,255,255,.5);font-size:9px;font-weight:900}.meta strong{display:block;margin-top:2px;color:#f99503;font-size:27px}.meta small{display:block;color:rgba(255,255,255,.55);font-size:10px}.warning{height:26px;padding:6px 22px;background:rgba(235,72,20,.18);color:#ffd7cd;font-size:11px;font-weight:900}.coordinators{height:142px;padding:12px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:13px}.coordinators article{position:relative;display:grid;grid-template-columns:1.15fr .9fr 1.1fr;gap:14px;align-items:center;padding:15px 17px;border-radius:18px;background:linear-gradient(180deg,rgba(15,36,58,.96),rgba(8,23,38,.96));border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 30px rgba(0,0,0,.2);overflow:hidden}.coordinators article:before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:#f27010}.coordinators article.positive:before{background:#40c985}.coordHead span,.coordStats span{display:block;color:rgba(255,255,255,.5);font-size:9px;font-weight:900}.coordHead b{display:block;margin-top:6px;font-size:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.coordMain{text-align:center;border-left:1px solid rgba(255,255,255,.08);border-right:1px solid rgba(255,255,255,.08)}.coordMain strong{display:block;color:#f99503;font-size:25px;white-space:nowrap}.coordMain small{display:block;margin-top:4px;color:rgba(255,255,255,.55);font-size:9px;font-weight:900}.coordStats{display:grid;gap:9px}.coordStats div{display:flex;justify-content:space-between;gap:8px}.coordStats b{font-size:12px;color:#fff;white-space:nowrap}.content{height:calc(100vh - 278px);padding:0 22px 12px;display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:14px}.warning~.coordinators+.content{height:calc(100vh - 304px)}.tablePanel,.totalCard,.decisionCard{border-radius:18px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(13,31,50,.97),rgba(7,20,34,.97));box-shadow:0 18px 36px rgba(0,0,0,.22)}.tablePanel{padding:13px 15px;min-width:0;overflow:hidden}.panelTitle{height:49px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.panelTitle span,.totalCard>span,.decisionCard>span{display:block;color:#f99503;font-size:9px;font-weight:1000;letter-spacing:.13em}.panelTitle h2{margin:4px 0 0;font-size:20px;line-height:1}.panelTitle>b{padding:7px 10px;border-radius:10px;background:rgba(242,112,16,.12);color:#f99503;font-size:12px}.tableHeader,.storeRow{display:grid;grid-template-columns:minmax(220px,1.45fr) 105px 100px 100px 105px minmax(190px,1fr);gap:9px;align-items:center}.tableHeader{height:28px;padding:0 10px;color:rgba(255,255,255,.42);font-size:9px;font-weight:1000;text-transform:uppercase}.rows{display:grid;gap:5px}.storeRow{height:39px;padding:0 10px;border-radius:10px;background:rgba(255,255,255,.045);border-left:4px solid #f99503}.storeRow.red{border-left-color:#eb4814;background:rgba(235,72,20,.07)}.storeRow.green{border-left-color:#40c985}.storeName{display:flex;align-items:center;gap:9px;min-width:0}.storeName em{width:25px;height:25px;display:grid;place-items:center;border-radius:8px;background:rgba(249,149,3,.12);color:#f99503;font-size:11px;font-style:normal;font-weight:1000}.storeName b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow>span{font-size:10px;color:rgba(255,255,255,.67);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow>strong{font-size:12px;text-align:right;white-space:nowrap}.storeRow .highlight{color:#f99503;font-size:14px}.storeRow>small{font-size:9px;line-height:1.15;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}aside{display:grid;grid-template-rows:1fr 1fr;gap:14px}.totalCard,.decisionCard{padding:17px}.totalCard h3{margin:11px 0 1px;color:#f99503;font-size:34px;line-height:1}.totalCard>p{margin:0 0 17px;color:rgba(255,255,255,.55);font-size:11px;font-weight:800}.totalCard>div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}.totalCard small{color:rgba(255,255,255,.5);font-size:9px;font-weight:900}.totalCard div strong{font-size:13px;text-align:right}.decisionCard h3{margin:11px 0 8px;font-size:21px;line-height:1.05}.decisionCard p{margin:0;color:rgba(255,255,255,.68);font-size:12px;line-height:1.45}.tv footer{height:48px;padding:0 22px;display:grid;grid-template-columns:55px 220px 1fr 150px;gap:14px;align-items:center;border-top:1px solid rgba(255,255,255,.1);background:rgba(4,13,23,.9)}.dots{display:flex;gap:7px}.dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.18)}.dots i.active{background:#f27010;box-shadow:0 0 12px rgba(242,112,16,.7)}footer span{color:rgba(255,255,255,.54);font-size:10px;font-weight:800}.progress{height:5px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.progress i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#f27010,#f99503)}footer em{text-align:right;color:rgba(255,255,255,.38);font-size:9px;font-style:normal;font-weight:900}.state{display:grid;place-content:center;text-align:center}.state svg{margin:auto}.state h1{margin:18px 0 8px;font-size:34px}.state p{margin:0;color:rgba(255,255,255,.65)}
`;
