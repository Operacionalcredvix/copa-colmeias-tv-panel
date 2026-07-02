'use client';

import { useEffect, useMemo, useState } from 'react';

type Tone = 'positive' | 'negative' | 'neutral';
type AlertLevel = 'good' | 'attention' | 'critical' | 'info';

type Summary = {
  contractsToday: number;
  productionTodayFormatted: string;
  averageTicketFormatted: string;
  activeStores: number;
  totalStores: number;
  zeroStores: number;
  projectionFormatted: string;
  goalPercent: number;
};

type StoreRow = {
  position: number;
  name: string;
  regional: string;
  contracts: number;
  production: number;
  productionFormatted: string;
  averageTicketFormatted: string;
};

type ConsultantRow = {
  position: number;
  name: string;
  store: string;
  regional: string;
  contracts: number;
  productionFormatted: string;
};

type RegionalRow = {
  name: string;
  contracts: number;
  production: number;
  productionFormatted: string;
  averageTicketFormatted: string;
  activeStores: number;
  totalStores: number;
  zeroStores: number;
};

type HourlyRow = {
  hour: string;
  accumulatedProduction: number;
  accumulatedProductionFormatted: string;
};

type AlertRow = {
  level: AlertLevel;
  title: string;
  description: string;
};

type RadarPayload = {
  ok: boolean;
  source: string;
  version: string;
  updatedAt: string;
  date: string;
  summary: Summary;
  comparisons: {
    yesterday: { productionDeltaPercent?: number; productionFormatted?: string };
    sevenDayAverage: { productionDeltaPercent?: number; productionAverageFormatted?: string };
  };
  rhythm: { label: string; tone: Tone; percent: number; description: string };
  hourlyEvolution: HourlyRow[];
  topStores: StoreRow[];
  topConsultants: ConsultantRow[];
  regionalPerformance: RegionalRow[];
  alerts: AlertRow[];
  aiReading: { generatedAt: string; text: string; status: string };
  ticker: string[];
  diagnostics?: { cache?: string; responseMs?: number; warning?: string };
  warning?: string;
};

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);
const SCREEN_MS = 15000;

export default function ProducaoPage() {
  const [data, setData] = useState<RadarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch('/api/producao', { cache: 'no-store' });
        const payload = (await response.json()) as RadarPayload;
        if (alive) setData(payload);
      } catch (error) {
        console.error('Erro ao carregar Radar', error);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setScreen((prev) => (prev + 1) % 3), SCREEN_MS);
    return () => window.clearInterval(interval);
  }, []);

  const ticker = useMemo(() => {
    if (!data) return '';
    return (data.ticker.length ? data.ticker : [
      `Contratos hoje: ${data.summary.contractsToday}`,
      `Produção hoje: ${data.summary.productionTodayFormatted}`,
      `Lojas zeradas: ${data.summary.zeroStores}`
    ]).join('   •   ');
  }, [data]);

  if (!data && loading) return <Shell><Loader text="Carregando base oficial..." /></Shell>;
  if (!data) return <Shell><Loader text="Não foi possível carregar os dados." /></Shell>;

  return (
    <Shell>
      <Header data={data} screen={screen} />
      <section className="stage">
        {screen === 0 && <Overview data={data} />}
        {screen === 1 && <Rankings data={data} />}
        {screen === 2 && <Regionals data={data} />}
      </section>
      <footer><strong>CREDVIX</strong><div><span>{ticker}</span></div><em>RADAR MVP 3</em></footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="screen"><style jsx global>{css}</style><div className="bg" />{children}</main>;
}

function Loader({ text }: { text: string }) {
  return <div className="loader"><Logo /><h1>RADAR DE PRODUÇÃO</h1><p>{text}</p></div>;
}

function Header({ data, screen }: { data: RadarPayload; screen: number }) {
  const label = ['VISÃO GERAL', 'RANKINGS', 'REGIONAIS'][screen];
  return (
    <header>
      <div className="brand"><Logo /><div><b>RADAR DE PRODUÇÃO CREDVIX</b><small>PAINEL EM TEMPO REAL</small></div></div>
      <div className="title"><span>{label}</span><h1>ACOMPANHAMENTO COMERCIAL</h1></div>
      <div className="updated"><small>ATUALIZADO ÀS</small><b>{data.updatedAt}</b><span>{data.date}</span></div>
    </header>
  );
}

function Overview({ data }: { data: RadarPayload }) {
  const s = data.summary;
  const leader = data.topStores[0];
  const topRegional = data.regionalPerformance[0];
  return (
    <div className="overview">
      <div className="kpis">
        <Kpi label="Contratos hoje" value={String(s.contractsToday)} detail={`${delta(data.comparisons.yesterday.productionDeltaPercent)} vs ontem`} />
        <Kpi label="Produção hoje" value={s.productionTodayFormatted} detail={`${delta(data.comparisons.sevenDayAverage.productionDeltaPercent)} vs média 7d`} gold />
        <Kpi label="Ticket médio" value={s.averageTicketFormatted} detail="valor médio por contrato" />
        <Kpi label="Lojas com produção" value={`${s.activeStores}/${s.totalStores}`} detail={`${s.zeroStores} zeradas`} danger={s.zeroStores > 0} />
      </div>
      <Panel title="Evolução por hora" className="chartPanel"><Hourly rows={data.hourlyEvolution} /></Panel>
      <div className="side">
        <Panel title="Ritmo do dia"><div className={`rhythm ${data.rhythm.tone}`}><b>{data.rhythm.label}</b><strong>{data.rhythm.percent}%</strong></div><div className="bar"><i style={{ width: `${Math.max(4, Math.min(100, data.rhythm.percent))}%` }} /></div><p>{data.rhythm.description}</p></Panel>
        <Panel title="Leitura operacional"><p className="ai">{data.aiReading.text}</p><small>Gerada às {data.aiReading.generatedAt} • {data.aiReading.status}</small></Panel>
        <div className="minis"><Mini label="Líder" value={leader?.name ?? '-'} detail={leader?.productionFormatted ?? '-'} /><Mini label="Regional líder" value={topRegional?.name ?? '-'} detail={topRegional?.productionFormatted ?? '-'} /><Mini label="Projeção" value={s.projectionFormatted} detail={`${s.goalPercent}% da meta`} /><Mini label="Zeradas" value={String(s.zeroStores)} detail="lojas sem produção" danger /></div>
      </div>
    </div>
  );
}

function Rankings({ data }: { data: RadarPayload }) {
  return <div className="rankings"><Panel title="Top lojas do dia"><StoreRows rows={data.topStores.slice(0, 8)} /></Panel><Panel title="Top consultores do dia"><ConsultantRows rows={data.topConsultants.slice(0, 8)} /></Panel><Panel title="Prioridade agora" danger><div className="alerts">{data.alerts.slice(0, 5).map((a) => <Alert key={`${a.title}-${a.description}`} alert={a} />)}</div></Panel></div>;
}

function Regionals({ data }: { data: RadarPayload }) {
  return <div className="regionals"><Panel title="Produção por regional"><RegionalBars rows={data.regionalPerformance} /></Panel><Panel title="Cobertura operacional"><RegionalTable rows={data.regionalPerformance} /></Panel></div>;
}

function Kpi({ label, value, detail, gold, danger }: { label: string; value: string; detail: string; gold?: boolean; danger?: boolean }) {
  return <div className={`kpi ${gold ? 'gold' : ''} ${danger ? 'danger' : ''}`}><small>{label}</small><b>{value}</b><span>{detail}</span></div>;
}

function Panel({ title, children, danger, className = '' }: { title: string; children: React.ReactNode; danger?: boolean; className?: string }) {
  return <section className={`panel ${className}`}><h2 className={danger ? 'dangerText' : ''}>{title}</h2>{children}</section>;
}

function Mini({ label, value, detail, danger }: { label: string; value: string; detail: string; danger?: boolean }) {
  return <div className={`mini ${danger ? 'danger' : ''}`}><small>{label}</small><b>{value}</b><span>{detail}</span></div>;
}

function Hourly({ rows }: { rows: HourlyRow[] }) {
  const visible = rows.filter((r) => { const h = Number(r.hour.replace('h', '')); return h >= 7 && h <= 18; });
  const max = Math.max(...visible.map((r) => r.accumulatedProduction), 1);
  return <div className="hourly">{visible.map((r) => <div className="hour" key={r.hour}><small>{r.accumulatedProductionFormatted}</small><div><i style={{ height: `${Math.max(3, (r.accumulatedProduction / max) * 100)}%` }} /></div><b>{r.hour}</b></div>)}</div>;
}

function StoreRows({ rows }: { rows: StoreRow[] }) {
  return <div className="rows">{rows.map((r) => <div className="row" key={r.name}><em>{r.position}</em><b>{r.name}</b><small>{r.regional}</small><span>{r.contracts} ct</span><strong>{r.productionFormatted}</strong></div>)}</div>;
}

function ConsultantRows({ rows }: { rows: ConsultantRow[] }) {
  return <div className="rows">{rows.map((r) => <div className="row" key={r.name}><em>{r.position}</em><b>{r.name}</b><small>{r.store}</small><span>{r.contracts} ct</span><strong>{r.productionFormatted}</strong></div>)}</div>;
}

function Alert({ alert }: { alert: AlertRow }) {
  return <div className={`alert ${alert.level}`}><em>{alert.level === 'critical' ? '▲' : alert.level === 'good' ? '●' : '◆'}</em><div><b>{alert.title}</b><p>{alert.description}</p></div></div>;
}

function RegionalBars({ rows }: { rows: RegionalRow[] }) {
  const max = Math.max(...rows.map((r) => r.production), 1);
  return <div className="bars">{rows.map((r) => <div className="barRow" key={r.name}><div><b>{r.name}</b><small>{r.contracts} ct • {r.activeStores}/{r.totalStores} lojas</small></div><span><i style={{ width: `${Math.max(4, (r.production / max) * 100)}%` }} /></span><em>{r.productionFormatted}</em></div>)}</div>;
}

function RegionalTable({ rows }: { rows: RegionalRow[] }) {
  return <div className="table"><div className="head"><span>Regional</span><span>Contratos</span><span>Produção</span><span>Lojas</span><span>Zeradas</span></div>{rows.map((r) => <div className="tr" key={r.name}><b>{r.name}</b><span>{r.contracts}</span><span>{r.productionFormatted}</span><span>{r.activeStores}/{r.totalStores}</span><em>{r.zeroStores}</em></div>)}</div>;
}

function Logo() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 55 18v28L32 59 9 46V18L32 5Z" /><path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z" /></svg>;
}

function delta(value?: number) {
  if (typeof value !== 'number') return '0%';
  return `${value > 0 ? '+' : ''}${value}%`;
}

const css = `
  *{box-sizing:border-box} html,body{margin:0;background:#020812;overflow:hidden}.screen{position:relative;width:100vw;height:100vh;color:#f8fbff;background:radial-gradient(circle at 10% 0%,rgba(255,194,42,.18),transparent 28%),radial-gradient(circle at 92% 16%,rgba(34,115,215,.19),transparent 30%),linear-gradient(135deg,#020812,#051426 48%,#020812);font-family:Inter,system-ui,Segoe UI,sans-serif}.bg{position:absolute;inset:0;opacity:.28;background-image:linear-gradient(30deg,rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(150deg,rgba(255,255,255,.03) 1px,transparent 1px),radial-gradient(circle at 1px 1px,rgba(255,194,42,.10) 1px,transparent 0);background-size:92px 92px,92px 92px,34px 34px}.loader{position:relative;z-index:1;margin:auto;width:min(680px,72vw);padding:48px;text-align:center;border:1px solid rgba(255,194,42,.44);background:rgba(5,17,29,.88)}.loader h1{font-size:54px;font-style:italic;margin:18px 0 8px}.loader p{color:rgba(255,255,255,.72)}svg{width:58px;height:58px}svg path{fill:none;stroke:#ffc22a;stroke-width:4;stroke-linejoin:round}header{position:relative;z-index:1;height:102px;padding:16px 26px 12px;display:grid;grid-template-columns:360px 1fr 220px;align-items:center;gap:24px;border-bottom:1px solid rgba(255,255,255,.14);background:linear-gradient(to bottom,rgba(2,8,18,.98),rgba(2,8,18,.62))}.brand{display:flex;align-items:center;gap:15px}.brand b{display:block;font-size:25px;line-height:.95;font-weight:1000}.brand small{display:block;margin-top:6px;color:#ffc22a;font-size:12px;font-weight:900;letter-spacing:.18em}.title{text-align:center}.title span{color:rgba(255,255,255,.78);font-size:17px;font-weight:900;letter-spacing:.22em}.title h1{margin:4px 0 0;font-size:clamp(42px,5.1vw,76px);line-height:.82;font-weight:1000;font-style:italic}.updated{justify-self:end;text-align:right;padding:12px 16px;min-width:190px;border:1px solid rgba(255,194,42,.32);background:rgba(4,16,31,.78)}.updated small{display:block;color:rgba(255,255,255,.72);font-size:12px;font-weight:900}.updated b{display:block;color:#ffc22a;font-size:46px;line-height:.9}.updated span{color:rgba(255,255,255,.68);font-weight:800}.stage{position:relative;z-index:1;height:calc(100vh - 158px);padding:16px 18px 12px;animation:in .45s ease both}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.panel,.kpi,.mini{border:1px solid rgba(255,255,255,.15);background:linear-gradient(180deg,rgba(7,20,34,.96),rgba(5,16,28,.92));box-shadow:0 18px 55px rgba(0,0,0,.30),inset 0 0 48px rgba(255,255,255,.025)}.panel{padding:18px;overflow:hidden}.panel h2{margin:0 0 14px;color:#ffc22a;font-size:21px;font-weight:1000;letter-spacing:.08em;text-transform:uppercase}.dangerText{color:#ff6658!important}.overview{height:100%;display:grid;grid-template-columns:1.38fr .82fr;grid-template-rows:174px 1fr;gap:14px}.kpis{grid-column:1/3;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.kpi{padding:18px}.kpi.gold{border-color:rgba(255,194,42,.42)}.kpi.danger b{color:#ff6658}.kpi small,.mini small{display:block;color:rgba(255,255,255,.72);font-size:14px;font-weight:900;text-transform:uppercase}.kpi b{display:block;margin-top:5px;font-size:clamp(30px,3vw,52px);line-height:.98;letter-spacing:-.045em;white-space:nowrap}.kpi span,.mini span{display:block;margin-top:8px;color:rgba(255,255,255,.62);font-size:13px;font-weight:800}.chartPanel{min-height:0}.hourly{height:calc(100% - 36px);display:grid;grid-template-columns:repeat(12,1fr);gap:10px;align-items:end;padding-top:18px}.hour{height:100%;display:grid;grid-template-rows:24px 1fr 24px;gap:7px;text-align:center}.hour small{color:rgba(255,255,255,.70);font-size:11px;font-weight:800}.hour div{position:relative;height:100%;border-radius:999px 999px 10px 10px;background:rgba(255,255,255,.06);overflow:hidden}.hour i{position:absolute;left:0;right:0;bottom:0;display:block;border-radius:inherit;background:linear-gradient(180deg,#ffc22a,#ff8619)}.hour b{color:rgba(255,255,255,.68);font-size:12px}.side{display:grid;grid-template-rows:.8fr 1fr 1fr;gap:14px}.rhythm{display:flex;align-items:baseline;justify-content:space-between;margin:10px 0 12px}.rhythm b{font-size:clamp(28px,2.6vw,45px);line-height:.92}.rhythm.negative b{color:#ff6658}.rhythm.positive b{color:#69e05f}.rhythm strong{color:#ffc22a;font-size:42px}.bar{height:14px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff6658,#ffc22a)}.panel p{color:rgba(255,255,255,.76);font-size:16px;line-height:1.38}.ai{font-size:18px!important}.minis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.mini{padding:14px}.mini b{display:block;margin:5px 0;color:#ffc22a;font-size:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini.danger b{color:#ff6658}.rankings{height:100%;display:grid;grid-template-columns:1fr 1fr 400px;gap:14px}.rows{display:grid;gap:10px}.row{display:grid;grid-template-columns:44px minmax(0,1fr) 118px 68px 128px;align-items:center;gap:10px;padding:12px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}.row em{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(135deg,#ffc22a,#ff8619);color:#061524;font-style:normal;font-weight:1000}.row b{font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row small{color:rgba(255,255,255,.58);font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row span{color:#69e05f;font-size:15px;font-weight:1000;text-align:right}.row strong{color:#ffc22a;font-size:17px;text-align:right;white-space:nowrap}.alerts{display:grid;gap:12px}.alert{display:grid;grid-template-columns:42px 1fr;gap:12px;padding:14px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10)}.alert em{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;color:#ffc22a;border:1px solid currentColor;font-style:normal;font-weight:1000}.alert.critical em{color:#ff6658}.alert.good em{color:#69e05f}.alert b{display:block;font-size:18px;text-transform:uppercase}.alert p{margin:4px 0 0;color:rgba(255,255,255,.70);font-size:14px}.regionals{height:100%;display:grid;grid-template-columns:1.12fr 1fr;gap:14px}.bars{display:grid;gap:18px}.barRow{display:grid;grid-template-columns:230px 1fr 148px;align-items:center;gap:16px}.barRow b{display:block;font-size:22px}.barRow small{display:block;margin-top:4px;color:rgba(255,255,255,.56);font-size:13px;font-weight:800}.barRow span{height:24px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.barRow i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff8619,#ffc22a)}.barRow em{color:#ffc22a;font-size:20px;font-style:normal;font-weight:1000;text-align:right}.table{display:grid;gap:9px}.head,.tr{display:grid;grid-template-columns:1fr 96px 142px 100px 90px;align-items:center;gap:10px}.head{padding:0 12px 6px;color:rgba(255,255,255,.52);font-size:12px;font-weight:900;text-transform:uppercase}.tr{padding:14px 12px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}.tr b{font-size:21px}.tr span{color:rgba(255,255,255,.82);font-size:18px;font-weight:900}.tr em{color:#ff6658;font-size:22px;font-style:normal;font-weight:1000}footer{position:relative;z-index:1;height:56px;display:grid;grid-template-columns:180px 1fr 190px;align-items:center;gap:18px;padding:0 22px;border-top:1px solid rgba(255,255,255,.14);background:rgba(2,8,18,.88)}footer strong{color:#ffc22a}footer div{overflow:hidden;white-space:nowrap;color:rgba(255,255,255,.86);font-size:17px;font-weight:900}footer div span{display:inline-block;min-width:100%;animation:ticker 34s linear infinite}@keyframes ticker{from{transform:translateX(100%)}to{transform:translateX(-100%)}}footer em{color:rgba(255,255,255,.54);font-size:12px;font-style:normal;font-weight:900;letter-spacing:.14em;text-align:right}
`;
