'use client';

import { useEffect, useState } from 'react';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);

export default function ProducaoPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch('/api/producao', { cache: 'no-store' });
        const j = await r.json();
        if (alive) setData(j);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (loading && !data) return <main className="screen"><Style /><div className="loader">RADAR DE PRODUÇÃO<br /><span>Carregando...</span></div></main>;
  if (!data) return <main className="screen"><Style /><div className="loader">RADAR DE PRODUÇÃO<br /><span>Sem dados.</span></div></main>;

  const s = data.summary || {};
  const stores = Array.isArray(data.topStores) ? data.topStores.slice(0, 7) : [];
  const regionals = Array.isArray(data.regionalPerformance) ? data.regionalPerformance : [];
  const alerts = Array.isArray(data.alerts) ? data.alerts.slice(0, 3) : [];
  const ticker = Array.isArray(data.ticker) && data.ticker.length ? data.ticker.join('   •   ') : `Contratos hoje: ${s.contractsToday || 0}   •   Produção hoje: ${s.productionTodayFormatted || 'R$ 0,00'}`;
  const warning = data?.diagnostics?.warning || data.warning || '';

  return (
    <main className="screen">
      <Style />
      <div className="bg" />
      <header>
        <div className="brand"><Mark /><div><b>RADAR DE PRODUÇÃO</b><span>CREDVIX • PAINEL EM TEMPO REAL</span></div></div>
        <div className="title"><small>ACOMPANHAMENTO COMERCIAL</small><strong>{data?.rhythm?.label || 'EM OBSERVAÇÃO'}</strong></div>
        <div className="time"><span>ATUALIZADO</span><b>{data.updatedAt || '--h--'}</b><em>{data.date || ''}</em></div>
      </header>
      {warning && <div className="warn">{warning}</div>}
      <section className="kpis">
        <Kpi label="Contratos" value={s.contractsToday ?? 0} detail={`${fmtDelta(data?.comparisons?.yesterday?.productionDeltaPercent)} vs ontem`} />
        <Kpi label="Produção" value={s.productionTodayFormatted || 'R$ 0,00'} detail={`${fmtDelta(data?.comparisons?.sevenDayAverage?.productionDeltaPercent)} vs média 7d`} gold />
        <Kpi label="Ticket médio" value={s.averageTicketFormatted || 'R$ 0,00'} detail="por contrato pago" />
        <Kpi label="Lojas ativas" value={`${s.activeStores ?? 0}/${s.totalStores ?? 0}`} detail={`${s.zeroStores ?? 0} zeradas`} danger />
      </section>
      <section className="content">
        <Panel title="Top lojas do dia" className="big">
          {stores.length ? stores.map((x:any) => <div className="row" key={x.name}><i>{x.position}</i><b>{x.name}</b><small>{x.regional}</small><span>{x.contracts} ct</span><strong>{x.productionFormatted}</strong></div>) : <Empty text="Sem lojas no payload." />}
        </Panel>
        <Panel title="Produção por regional">
          {regionals.length ? <Bars rows={regionals} /> : <Empty text="Sem regionais no payload." />}
        </Panel>
        <Panel title="Leitura operacional">
          <div className="rhythm"><b>{data?.rhythm?.percent ?? 0}%</b><span>{data?.rhythm?.description || ''}</span></div>
          <p>{data?.aiReading?.text || 'Leitura indisponível.'}</p>
          <div className="alerts">{alerts.map((a:any) => <div className={`alert ${a.level}`} key={a.title}><b>{a.title}</b><span>{a.description}</span></div>)}</div>
        </Panel>
      </section>
      <footer><b>CREDVIX</b><div><span>{ticker}</span></div><em>{data.version || 'RADAR'}</em></footer>
    </main>
  );
}

function Kpi({ label, value, detail, gold, danger }: any) { return <div className={`kpi ${gold ? 'gold' : ''} ${danger ? 'danger' : ''}`}><span>{label}</span><b>{value}</b><small>{detail}</small></div>; }
function Panel({ title, children, className = '' }: any) { return <div className={`panel ${className}`}><h2>{title}</h2>{children}</div>; }
function Empty({ text }: any) { return <div className="empty">{text}</div>; }
function Bars({ rows }: any) { const max = Math.max(...rows.map((r:any) => Number(r.production || 0)), 1); return <div className="bars">{rows.map((r:any) => <div className="bar" key={r.name}><div><b>{r.name}</b><small>{r.contracts} ct • {r.activeStores}/{r.totalStores} lojas • {r.zeroStores} zeradas</small></div><span><i style={{width:`${Math.max(4, Number(r.production || 0) / max * 100)}%`}} /></span><em>{r.productionFormatted}</em></div>)}</div>; }
function Mark(){return <svg viewBox="0 0 64 64"><path d="M32 5 55 18v28L32 59 9 46V18L32 5Z"/><path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z"/></svg>}
function fmtDelta(v:any){ return typeof v === 'number' ? `${v > 0 ? '+' : ''}${v}%` : '0%'; }

function Style(){return <style jsx global>{`
*{box-sizing:border-box}html,body{margin:0;background:#020812;overflow:hidden}.screen{position:relative;width:100vw;height:100vh;color:#fff;background:linear-gradient(135deg,#020812,#061a2f 55%,#020812);font-family:Inter,Arial,sans-serif}.bg{position:absolute;inset:0;opacity:.22;background-image:radial-gradient(circle at 1px 1px,rgba(255,194,42,.18) 1px,transparent 0);background-size:32px 32px}header{position:relative;height:76px;padding:10px 18px;display:grid;grid-template-columns:320px 1fr 150px;gap:18px;align-items:center;border-bottom:1px solid rgba(255,255,255,.14);background:rgba(2,8,18,.85)}svg{width:45px;height:45px}svg path{fill:none;stroke:#ffc22a;stroke-width:4}.brand{display:flex;align-items:center;gap:12px}.brand b{font-size:25px;line-height:.9}.brand span{display:block;margin-top:5px;color:#ffc22a;font-size:11px;font-weight:900;letter-spacing:.12em}.title{text-align:center;min-width:0}.title small{color:rgba(255,255,255,.72);font-size:12px;font-weight:900;letter-spacing:.22em}.title strong{display:block;margin-top:2px;font-size:24px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.time{text-align:right;border:1px solid rgba(255,194,42,.28);padding:7px 10px}.time span{display:block;font-size:10px;color:rgba(255,255,255,.65);font-weight:900}.time b{display:block;color:#ffc22a;font-size:31px;line-height:.95}.time em{font-size:10px;font-style:normal;color:rgba(255,255,255,.6)}.warn{position:relative;height:28px;padding:5px 18px;background:rgba(255,102,88,.18);color:#ffd9d5;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpis{position:relative;height:102px;padding:12px 14px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.panel{border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,rgba(7,20,34,.96),rgba(5,16,28,.92));box-shadow:0 18px 55px rgba(0,0,0,.28)}.kpi{padding:12px 15px;overflow:hidden}.kpi span{display:block;color:rgba(255,255,255,.68);font-size:12px;font-weight:900;text-transform:uppercase}.kpi b{display:block;margin-top:4px;font-size:29px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi.gold b{color:#ffc22a}.kpi.danger b{color:#ff6658}.kpi small{display:block;margin-top:7px;color:rgba(255,255,255,.58);font-size:12px;font-weight:800}.content{position:relative;height:calc(100vh - 234px);padding:12px 14px;display:grid;grid-template-columns:1.15fr .85fr;grid-template-rows:1fr 170px;gap:12px}.warn~.content{height:calc(100vh - 262px)}.panel{padding:14px;overflow:hidden}.panel.big{grid-row:1/3}.panel h2{margin:0 0 11px;color:#ffc22a;font-size:20px;line-height:1;text-transform:uppercase;letter-spacing:.06em}.row{display:grid;grid-template-columns:34px minmax(0,1fr) 100px 56px 112px;gap:8px;align-items:center;padding:9px 10px;margin-bottom:8px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}.row i{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(135deg,#ffc22a,#ff8619);color:#061524;font-style:normal;font-weight:1000}.row b{font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row small{color:rgba(255,255,255,.55);font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row span{color:#69e05f;font-size:13px;font-weight:1000;text-align:right}.row strong{color:#ffc22a;font-size:15px;text-align:right;white-space:nowrap}.bars{display:grid;gap:12px}.bar{display:grid;grid-template-columns:170px 1fr 112px;gap:12px;align-items:center}.bar b{display:block;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar small{display:block;margin-top:3px;color:rgba(255,255,255,.56);font-size:11px}.bar span{height:18px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff8619,#ffc22a)}.bar em{font-style:normal;color:#ffc22a;font-size:16px;font-weight:1000;text-align:right}.rhythm{display:flex;align-items:baseline;gap:14px}.rhythm b{color:#ffc22a;font-size:34px}.rhythm span{color:rgba(255,255,255,.68);font-weight:800;font-size:13px}.panel p{margin:8px 0;color:rgba(255,255,255,.78);font-size:15px;line-height:1.28}.alerts{display:flex;gap:8px}.alert{flex:1;padding:8px;background:rgba(255,255,255,.055);border-left:3px solid #ffc22a}.alert.critical{border-left-color:#ff6658}.alert b{display:block;font-size:12px;text-transform:uppercase}.alert span{display:block;margin-top:3px;color:rgba(255,255,255,.62);font-size:11px}.empty{height:100%;display:grid;place-items:center;color:rgba(255,255,255,.48);font-weight:900}footer{position:relative;height:56px;display:grid;grid-template-columns:120px 1fr 120px;align-items:center;gap:16px;padding:0 18px;border-top:1px solid rgba(255,255,255,.14);background:rgba(2,8,18,.88)}footer b{color:#ffc22a}footer div{overflow:hidden;white-space:nowrap;color:rgba(255,255,255,.86);font-size:15px;font-weight:900}footer div span{display:inline-block;min-width:100%;animation:ticker 34s linear infinite}@keyframes ticker{from{transform:translateX(100%)}to{transform:translateX(-100%)}}footer em{color:rgba(255,255,255,.52);font-size:11px;font-style:normal;font-weight:900;text-align:right}.loader{position:relative;z-index:1;margin:24vh auto;width:600px;padding:44px;text-align:center;border:1px solid rgba(255,194,42,.4);background:rgba(5,17,29,.88);font-size:42px;font-weight:1000}.loader span{font-size:18px;color:rgba(255,255,255,.7)}
`}</style>}
