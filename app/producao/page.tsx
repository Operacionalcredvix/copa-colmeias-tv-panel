'use client';

import { useEffect, useMemo, useState } from 'react';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);

type Store = { position: number; name: string; regional: string; contracts: number; productionFormatted: string; averageTicketFormatted?: string };
type Regional = { name: string; contracts: number; production: number; productionFormatted: string; activeStores: number; totalStores: number; zeroStores: number };
type Alert = { level: string; title: string; description: string };

type Payload = {
  ok: boolean;
  source: string;
  version: string;
  updatedAt: string;
  date: string;
  summary: {
    contractsToday: number;
    productionTodayFormatted: string;
    averageTicketFormatted: string;
    activeStores: number;
    totalStores: number;
    zeroStores: number;
    projectionFormatted: string;
    goalPercent: number;
  };
  comparisons: {
    yesterday: { productionDeltaPercent?: number };
    sevenDayAverage: { productionDeltaPercent?: number };
  };
  rhythm: { label: string; tone: string; percent: number; description: string };
  topStores: Store[];
  topConsultants: Array<{ name: string; store: string; productionFormatted: string; contracts: number }>;
  regionalPerformance: Regional[];
  alerts: Alert[];
  aiReading: { status: string; generatedAt: string; text: string };
  ticker: string[];
  warning?: string;
  diagnostics?: { warning?: string };
};

export default function ProducaoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch('/api/producao', { cache: 'no-store' });
        const payload = (await response.json()) as Payload;
        if (alive) setData(payload);
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const ticker = useMemo(() => {
    if (!data) return 'Carregando Radar de Produção...';
    const items = data.ticker?.length ? data.ticker : [
      `Contratos hoje: ${data.summary.contractsToday}`,
      `Produção hoje: ${data.summary.productionTodayFormatted}`,
      `Lojas zeradas: ${data.summary.zeroStores}`
    ];
    return items.join('   •   ');
  }, [data]);

  if (loading && !data) return <Frame><Loader label="Carregando painel..." /></Frame>;
  if (!data) return <Frame><Loader label="Não foi possível carregar os dados." /></Frame>;

  const summary = data.summary;
  const stores = data.topStores?.slice(0, 8) ?? [];
  const leader = stores[0];
  const otherStores = stores.slice(1);
  const regionals = data.regionalPerformance ?? [];
  const consultant = data.topConsultants?.[0];
  const alerts = data.alerts?.slice(0, 3) ?? [];
  const warning = data.diagnostics?.warning || data.warning || '';

  return (
    <Frame>
      <header className="topbar">
        <div className="brand">
          <div className="mark"><Logo /></div>
          <div>
            <strong>RADAR DE PRODUÇÃO</strong>
            <span>CREDVIX • PAINEL EM TEMPO REAL</span>
          </div>
        </div>

        <div className="headline">
          <span>ACOMPANHAMENTO COMERCIAL</span>
          <h1>{data.rhythm?.label || 'EM OBSERVAÇÃO'}</h1>
        </div>

        <div className="updated">
          <span>ATUALIZADO</span>
          <strong>{data.updatedAt}</strong>
          <em>{data.date}</em>
        </div>
      </header>

      {warning && <div className="warning">{warning}</div>}

      <section className="kpis">
        <Kpi title="Contratos" value={String(summary.contractsToday ?? 0)} detail={`${delta(data.comparisons?.yesterday?.productionDeltaPercent)} vs ontem`} />
        <Kpi title="Produção" value={summary.productionTodayFormatted || 'R$ 0,00'} detail={`${delta(data.comparisons?.sevenDayAverage?.productionDeltaPercent)} vs média 7d`} accent />
        <Kpi title="Ticket médio" value={summary.averageTicketFormatted || 'R$ 0,00'} detail="por contrato pago" />
        <Kpi title="Lojas ativas" value={`${summary.activeStores ?? 0}/${summary.totalStores ?? 0}`} detail={`${summary.zeroStores ?? 0} zeradas`} danger={(summary.zeroStores ?? 0) > 0} />
      </section>

      <section className="layout">
        <Panel title="Top lojas do dia" className="rankingPanel">
          {leader ? <LeaderCard store={leader} /> : <Empty text="Sem líder no payload." />}
          <div className="rankingList">
            {otherStores.length ? otherStores.map((store) => <StoreRow key={`${store.position}-${store.name}`} store={store} />) : <Empty text="Sem lojas adicionais." />}
          </div>
        </Panel>

        <div className="rightStack">
          <Panel title="Produção por regional" className="regionalPanel">
            {regionals.length ? <RegionalBars rows={regionals} /> : <Empty text="Sem dados regionais." />}
          </Panel>

          <Panel title="Leitura operacional" className="readingPanel">
            <div className="readingGrid">
              <div className={`pace ${data.rhythm?.tone || 'neutral'}`}>
                <span>Ritmo</span>
                <strong>{data.rhythm?.percent ?? 0}%</strong>
                <small>{data.rhythm?.description || 'Sem descrição.'}</small>
                <div className="track"><i style={{ width: `${Math.max(6, Math.min(100, data.rhythm?.percent ?? 0))}%` }} /></div>
              </div>

              <div className="projection">
                <span>Projeção</span>
                <strong>{summary.projectionFormatted || 'R$ 0,00'}</strong>
                <small>{summary.goalPercent ?? 0}% da meta</small>
              </div>
            </div>

            <div className="aiBox">
              <div><b>Diagnóstico</b><span>{data.aiReading?.status || 'N/A'} • {data.aiReading?.generatedAt || '--'}</span></div>
              <p>{data.aiReading?.text || 'Leitura indisponível.'}</p>
            </div>

            <div className="bottomGrid">
              <div className="consultant">
                <span>Consultor destaque</span>
                <strong>{consultant?.name || '-'}</strong>
                <small>{consultant ? `${consultant.store} • ${consultant.contracts} ct • ${consultant.productionFormatted}` : 'Sem dados disponíveis.'}</small>
              </div>
              <div className="alerts">
                {alerts.length ? alerts.map((alert) => <AlertChip key={`${alert.title}-${alert.description}`} alert={alert} />) : <AlertChip alert={{ level: 'info', title: 'Sem alertas', description: 'Nenhum alerta operacional no momento.' }} />}
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <footer className="footer">
        <strong>CREDVIX</strong>
        <div><span>{ticker}</span></div>
        <em>{data.version || 'RADAR'}</em>
      </footer>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="screen"><Style />{children}</main>;
}

function Loader({ label }: { label: string }) {
  return <div className="loader"><Logo /><h1>RADAR DE PRODUÇÃO</h1><p>{label}</p></div>;
}

function Kpi({ title, value, detail, accent, danger }: { title: string; value: string; detail: string; accent?: boolean; danger?: boolean }) {
  return <div className={`kpi ${accent ? 'accent' : ''} ${danger ? 'danger' : ''}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><h2>{title}</h2>{children}</section>;
}

function LeaderCard({ store }: { store: Store }) {
  return <div className="leader"><div className="rankGlow">1</div><div className="leaderText"><span>Loja líder</span><strong>{store.name}</strong><small>{store.regional}</small></div><div className="leaderNumbers"><b>{store.contracts} ct</b><strong>{store.productionFormatted}</strong><small>{store.averageTicketFormatted || 'ticket n/d'}</small></div></div>;
}

function StoreRow({ store }: { store: Store }) {
  return <div className="storeRow"><em>{store.position}</em><div><b>{store.name}</b><small>{store.regional}</small></div><span>{store.contracts} ct</span><strong>{store.productionFormatted}</strong></div>;
}

function RegionalBars({ rows }: { rows: Regional[] }) {
  const max = Math.max(...rows.map((r) => Number(r.production || 0)), 1);
  return <div className="regionalBars">{rows.map((row) => { const width = Math.max(7, Number(row.production || 0) / max * 100); return <div className="regionalRow" key={row.name}><div className="regionalName"><b>{row.name}</b><small>{row.contracts} ct • {row.activeStores}/{row.totalStores} lojas • {row.zeroStores} zeradas</small></div><div className="bar"><i style={{ width: `${width}%` }} /></div><strong>{row.productionFormatted}</strong></div>; })}</div>;
}

function AlertChip({ alert }: { alert: Alert }) {
  const level = alert.level === 'critical' ? 'critical' : alert.level === 'good' ? 'good' : alert.level === 'attention' ? 'attention' : 'info';
  return <div className={`alert ${level}`}><b>{alert.title}</b><span>{alert.description}</span></div>;
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function delta(value?: number) { return typeof value === 'number' ? `${value > 0 ? '+' : ''}${value}%` : '0%'; }

function Logo() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 55 18v28L32 59 9 46V18L32 5Z"/><path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z"/></svg>;
}

function Style() {
  return <style jsx global>{`
    *{box-sizing:border-box}html,body{margin:0;background:#020812;overflow:hidden}.screen{position:relative;width:100vw;height:100vh;color:#fff;overflow:hidden;font-family:Inter,Arial,sans-serif;background:radial-gradient(circle at 8% 0%,rgba(255,193,43,.14),transparent 30%),radial-gradient(circle at 94% 12%,rgba(25,130,255,.16),transparent 32%),linear-gradient(135deg,#020812 0%,#06182b 54%,#020812 100%)}.screen:before{content:'';position:absolute;inset:0;opacity:.18;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:30px 30px}.screen:after{content:'';position:absolute;width:520px;height:520px;right:-220px;bottom:-260px;background:rgba(255,193,43,.08);filter:blur(90px);border-radius:50%}.topbar,.kpis,.layout,.footer,.warning{position:relative;z-index:2}.topbar{height:84px;padding:12px 18px;display:grid;grid-template-columns:330px 1fr 160px;align-items:center;gap:18px;border-bottom:1px solid rgba(255,255,255,.10);background:rgba(2,8,18,.78);backdrop-filter:blur(12px)}.brand{display:flex;align-items:center;gap:13px}.mark{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;border:1px solid rgba(255,193,43,.28);background:rgba(255,193,43,.06);box-shadow:0 0 24px rgba(255,193,43,.11)}svg{width:28px;height:28px}svg path{fill:none;stroke:#ffc12b;stroke-width:4;stroke-linejoin:round}.brand strong{display:block;font-size:22px;line-height:.9;font-weight:1000;letter-spacing:.01em}.brand span{display:block;margin-top:7px;color:#ffc12b;font-size:11px;font-weight:900;letter-spacing:.14em}.headline{text-align:center;min-width:0}.headline span{color:rgba(255,255,255,.70);font-size:12px;font-weight:900;letter-spacing:.22em}.headline h1{margin:2px 0 0;font-size:31px;line-height:1;font-weight:1000;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 22px rgba(255,255,255,.10)}.updated{justify-self:end;min-width:148px;padding:9px 12px;text-align:right;border-radius:15px;border:1px solid rgba(255,193,43,.28);background:linear-gradient(180deg,rgba(255,193,43,.10),rgba(255,255,255,.02))}.updated span{display:block;color:rgba(255,255,255,.65);font-size:10px;font-weight:900}.updated strong{display:block;color:#ffc12b;font-size:35px;line-height:.96}.updated em{display:block;color:rgba(255,255,255,.62);font-size:10px;font-style:normal;font-weight:800}.warning{height:30px;padding:6px 18px;background:rgba(255,91,91,.16);color:#ffd4d4;border-bottom:1px solid rgba(255,91,91,.22);font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpis{height:110px;padding:12px 18px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.panel{border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(9,23,39,.96),rgba(5,15,27,.96));box-shadow:0 20px 42px rgba(0,0,0,.28),inset 0 0 44px rgba(255,255,255,.018)}.kpi{position:relative;overflow:hidden;border-radius:18px;padding:14px 16px}.kpi:before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#2f92ff,#82ccff)}.kpi.accent:before{background:linear-gradient(90deg,#ff9b1d,#ffd35c)}.kpi.danger:before{background:linear-gradient(90deg,#ff5967,#ff969d)}.kpi span{display:block;color:rgba(255,255,255,.68);font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.kpi strong{display:block;margin-top:6px;font-size:31px;line-height:1;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi.accent strong{color:#ffc12b}.kpi.danger strong{color:#ff7171}.kpi small{display:block;margin-top:9px;color:rgba(255,255,255,.62);font-size:11px;font-weight:800}.layout{height:calc(100vh - 250px);padding:12px 18px 14px;display:grid;grid-template-columns:57% 43%;gap:14px}.warning~.kpis+.layout{height:calc(100vh - 280px)}.rightStack{display:grid;grid-template-rows:1fr 1fr;gap:14px;min-height:0}.panel{border-radius:20px;padding:15px 16px;overflow:hidden;min-height:0}.panel h2{margin:0 0 13px;color:#ffc12b;font-size:20px;line-height:1;font-weight:1000;text-transform:uppercase;letter-spacing:.06em}.rankingPanel{display:grid;grid-template-rows:auto 1fr}.leader{padding:14px;border-radius:17px;border:1px solid rgba(255,193,43,.20);background:radial-gradient(circle at 10% 10%,rgba(255,193,43,.13),transparent 42%),linear-gradient(180deg,rgba(255,193,43,.08),rgba(255,255,255,.025));display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:14px;margin-bottom:12px}.rankGlow{width:50px;height:50px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(135deg,#ffb01f,#ffd35d);color:#07111c;font-size:28px;font-weight:1000;box-shadow:0 0 24px rgba(255,193,43,.24)}.leaderText span{display:block;color:#ffc12b;font-size:10px;font-weight:1000;text-transform:uppercase;letter-spacing:.10em}.leaderText strong{display:block;margin-top:6px;font-size:29px;line-height:1;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.leaderText small{display:block;margin-top:6px;color:rgba(255,255,255,.60);font-size:12px;font-weight:800}.leaderNumbers{display:grid;grid-template-columns:70px 135px 120px;gap:10px}.leaderNumbers b,.leaderNumbers strong,.leaderNumbers small{display:block;padding:10px 11px;border-radius:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);font-style:normal;font-weight:1000;text-align:center;white-space:nowrap}.leaderNumbers b{color:#65e29f}.leaderNumbers strong{color:#ffc12b}.leaderNumbers small{color:#fff;font-size:13px}.rankingList{display:grid;gap:8px;align-content:start}.storeRow{display:grid;grid-template-columns:36px minmax(0,1fr) 68px 128px;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.storeRow em{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:rgba(255,193,43,.16);color:#ffc12b;font-style:normal;font-weight:1000}.storeRow b{display:block;font-size:17px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow small{display:block;margin-top:4px;color:rgba(255,255,255,.52);font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow span{color:#65e29f;font-size:14px;font-weight:1000;text-align:right}.storeRow strong{color:#ffc12b;font-size:15px;font-weight:1000;text-align:right;white-space:nowrap}.regionalBars{display:grid;gap:14px}.regionalRow{display:grid;grid-template-columns:178px 1fr 122px;gap:12px;align-items:center}.regionalName{min-width:0}.regionalName b{display:block;font-size:17px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.regionalName small{display:block;margin-top:5px;color:rgba(255,255,255,.58);font-size:10px;font-weight:800}.bar{height:18px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff9018,#ffd052);box-shadow:0 0 18px rgba(255,193,43,.28)}.regionalRow>strong{color:#ffc12b;font-size:16px;text-align:right;white-space:nowrap}.readingPanel{display:grid;grid-template-rows:auto auto auto;gap:12px}.readingPanel h2{margin-bottom:0}.readingGrid{display:grid;grid-template-columns:1fr 145px;gap:12px}.pace,.projection,.aiBox,.consultant,.alert{border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.045)}.pace,.projection{padding:13px}.pace span,.projection span,.consultant span{display:block;color:rgba(255,255,255,.64);font-size:10px;font-weight:1000;text-transform:uppercase;letter-spacing:.07em}.pace strong{display:block;margin-top:5px;font-size:34px;line-height:1;color:#ffc12b}.pace.negative strong{color:#ff6b6b}.pace.positive strong{color:#59e49b}.pace small,.projection small{display:block;margin-top:5px;color:rgba(255,255,255,.66);font-size:11px;font-weight:800}.track{margin-top:10px;height:9px;border-radius:999px;background:rgba(255,255,255,.09);overflow:hidden}.track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff5f6d,#ffc12b)}.projection strong{display:block;margin-top:7px;color:#fff;font-size:17px;line-height:1.1}.aiBox{padding:13px}.aiBox div{display:flex;justify-content:space-between;gap:10px}.aiBox b{color:#ffc12b;font-size:11px;text-transform:uppercase;letter-spacing:.07em}.aiBox span{color:rgba(255,255,255,.48);font-size:10px;font-weight:800}.aiBox p{margin:9px 0 0;color:rgba(255,255,255,.88);font-size:15px;line-height:1.30}.bottomGrid{display:grid;grid-template-columns:1fr 1.2fr;gap:12px;min-height:0}.consultant{padding:13px}.consultant strong{display:block;margin-top:8px;color:#fff;font-size:17px;line-height:1.1}.consultant small{display:block;margin-top:7px;color:#ffc12b;font-size:11px;line-height:1.25;font-weight:800}.alerts{display:grid;gap:7px}.alert{padding:9px 11px;border-left:4px solid #44a9ff}.alert.critical{border-left-color:#ff6464}.alert.good{border-left-color:#4be091}.alert.attention{border-left-color:#ffba2d}.alert b{display:block;font-size:11px;font-weight:1000;text-transform:uppercase}.alert.critical b{color:#ff7d7d}.alert.good b{color:#70ecab}.alert.attention b{color:#ffd05d}.alert span{display:block;margin-top:4px;color:rgba(255,255,255,.70);font-size:10px;line-height:1.22}.empty{height:100%;display:grid;place-items:center;color:rgba(255,255,255,.46);font-weight:900}.footer{height:56px;display:grid;grid-template-columns:120px 1fr 120px;align-items:center;gap:14px;padding:0 18px;border-top:1px solid rgba(255,255,255,.10);background:rgba(2,8,18,.84)}.footer strong{color:#ffc12b;font-size:15px}.footer div{overflow:hidden;white-space:nowrap}.footer div span{display:inline-block;min-width:100%;color:rgba(255,255,255,.88);font-size:14px;font-weight:900;animation:ticker 34s linear infinite}.footer em{text-align:right;color:rgba(255,255,255,.50);font-style:normal;font-size:11px;font-weight:900}.loader{position:relative;z-index:2;margin:23vh auto 0;width:520px;padding:38px;border-radius:20px;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(9,23,39,.96),rgba(5,15,27,.96));text-align:center}.loader svg{width:40px;height:40px}.loader h1{margin:16px 0 8px;font-size:34px;line-height:1}.loader p{margin:0;color:rgba(255,255,255,.70)}@keyframes ticker{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
  `}</style>;
}
