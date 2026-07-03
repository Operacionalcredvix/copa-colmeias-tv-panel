'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 30000);
const AI_POLL_MS = Number(process.env.NEXT_PUBLIC_AI_POLL_MS ?? 300000);

type Value = number | string | null | undefined;
type Summary = { contractsToday?: number; productionTodayFormatted?: string; averageTicketFormatted?: string; activeStores?: number; totalStores?: number; zeroStores?: number };
type Goal = { dailyGoalFormatted?: string; dailyGapFormatted?: string; dailyPercent?: Value };
type Rhythm = { label?: string; description?: string };
type Comparison = { labelContracts?: string; labelProduction?: string };
type Store = { position?: number; name?: string; responsible?: string; contracts?: number; productionFormatted?: string; goalDailyFormatted?: string; goalPercent?: Value; goalGapFormatted?: string };
type Responsible = { name?: string; contractsToday?: number; productionToday?: number; productionTodayFormatted?: string; dailyGoalFormatted?: string; dailyGapFormatted?: string; dailyPercent?: Value; monthGoalFormatted?: string; projectionGapFormatted?: string; diagnosis?: string; priority?: string };
type ZeroStore = { name?: string; responsible?: string; dailyGoalFormatted?: string };
type StructuredItem = { title?: string; detail?: string; responsible?: string; severity?: 'critical' | 'attention' | 'normal' };
type StructuredAi = { headline?: string; executiveSummary?: string; priority?: string; actions?: StructuredItem[]; risks?: StructuredItem[]; questions?: string[] };
type AiReading = { status?: string; generatedAt?: string; text?: string; structured?: StructuredAi; priorityResponsible?: string };

type Payload = {
  ok: boolean;
  version?: string;
  updatedAt?: string;
  date?: string;
  summary?: Summary;
  goal?: Goal;
  rhythm?: Rhythm;
  comparisons?: { yesterday?: Comparison; sevenDayAverage?: Comparison };
  topStores?: Store[];
  topStoresRankingMode?: string;
  responsiblePerformance?: Responsible[];
  regionalPerformance?: Responsible[];
  zeroStores?: ZeroStore[];
  aiReading?: AiReading;
  ticker?: string[];
  missingData?: string[];
  warning?: string;
  diagnostics?: { warning?: string };
};

type AiPayload = { ok?: boolean; ai?: AiReading };

export default function ProducaoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [ai, setAi] = useState<AiReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiError, setAiError] = useState('');
  const panelTime = useClock();

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch('/api/producao?refresh=1', { cache: 'no-store' });
        const payload = (await response.json()) as Payload;
        if (!alive) return;
        setData(payload);
        setError(payload.ok === false ? 'API retornou erro.' : '');
      } catch (err) {
        console.error(err);
        if (alive) setError('Falha ao carregar dados do radar.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadAi() {
      try {
        const response = await fetch('/api/producao?mode=ai&refresh=1', { cache: 'no-store' });
        const payload = (await response.json()) as AiPayload;
        if (!alive) return;
        setAi(payload.ai || null);
        setAiError(payload.ai ? '' : 'Retorno de IA indisponível.');
      } catch (err) {
        console.error(err);
        if (alive) setAiError('Falha ao acionar DeepSeek.');
      }
    }
    loadAi();
    const id = window.setInterval(loadAi, AI_POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const view = useMemo(() => buildView(data, ai, aiError, panelTime), [data, ai, aiError, panelTime]);

  if (loading && !data) return <Shell><Loader text="Carregando painel de gestão..." /></Shell>;
  if (!data) return <Shell><Loader text={error || 'Não foi possível carregar os dados.'} /></Shell>;

  return (
    <Shell>
      <header className="topbar">
        <div className="brand"><Logo /><div><b>RADAR DE PRODUÇÃO</b><span>CREDVIX • GESTÃO COMERCIAL</span></div></div>
        <div className="headline"><span>PAINEL EXECUTIVO EM TEMPO REAL</span><strong>{view.rhythmLabel}</strong><small>{view.rhythmDescription}</small></div>
        <div className="timebox"><div><span>PAINEL</span><b>{view.panelTime}</b></div><div><span>CARGA</span><b>{view.loadTime}</b></div><em>{data.date || '--/--/----'}</em></div>
      </header>

      {view.warning && <div className="warning">{view.warning}</div>}

      <section className="kpis">
        <Kpi title="Contratos" value={view.contracts} detail={view.contractsDetail} />
        <Kpi title="Produção" value={view.production} detail={view.productionDetail} accent />
        <Kpi title="Meta do dia" value={view.dailyGoal} detail={`Gap: ${view.dailyGap}`} good={view.dailyGap === 'R$ 0,00'} />
        <Kpi title="Lojas" value={view.storesActive} detail={`${view.zeroCount} zeradas`} danger={view.zeroCountNumber > 0} />
      </section>

      <section className="mainGrid">
        <Panel title="Quem está batendo meta" className="rankingPanel">
          <div className="subline"><span>{view.rankingMode}</span><b>{view.goalPercentLabel}</b></div>
          {view.leader ? <Leader store={view.leader} /> : <Empty text="Sem loja líder." />}
          <div className="storeList">{view.otherStores.map((store) => <StoreLine key={`${store.position}-${store.name}`} store={store} />)}</div>
        </Panel>

        <div className="rightCol">
          <Panel title="Quem precisa de ação" className="actionPanel">
            <div className="actionHead"><span>Coordenadora</span><span>Hoje</span><span>Meta</span><span>Gap</span><span>Motivo</span></div>
            <div className="actionTable">{view.actions.map((row) => <ActionRow key={row.name} row={row} />)}</div>
          </Panel>

          <Panel title="Inteligência comercial" className="intelPanel">
            <DeepSeekCard ai={view.ai} fallback={data.aiReading} error={view.aiError} />
            <ZeroCard stores={view.zeroStores} total={view.zeroCountNumber} />
          </Panel>
        </div>
      </section>

      <footer><b>CREDVIX</b><span>{view.ticker}</span><em>{data.version || 'RADAR'}</em></footer>
    </Shell>
  );
}

function buildView(data: Payload | null, ai: AiReading | null, aiError: string, panelTime: string) {
  const summary = data?.summary || {};
  const goal = data?.goal || {};
  const rhythm = data?.rhythm || {};
  const comparisons = data?.comparisons || {};
  const stores = Array.isArray(data?.topStores) ? data!.topStores!.slice(0, 6) : [];
  const responsibles = Array.isArray(data?.responsiblePerformance) ? data!.responsiblePerformance! : data?.regionalPerformance || [];
  const zeroStores = Array.isArray(data?.zeroStores) ? data!.zeroStores! : [];
  const zeroCount = Number(summary.zeroStores ?? zeroStores.length ?? 0);
  const zeroByResponsible = countZeroByResponsible(zeroStores);
  const dailyPercent = num(goal.dailyPercent);
  const warning = data?.diagnostics?.warning || data?.warning || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '');
  const ticker = (data?.ticker?.length ? data.ticker : [
    `Contratos hoje: ${summary.contractsToday ?? 0}`,
    `Produção hoje: ${summary.productionTodayFormatted || 'R$ 0,00'}`,
    `Meta do dia: ${goal.dailyGoalFormatted || 'Sem meta'}`,
    `Gap: ${goal.dailyGapFormatted || 'Sem gap'}`,
    `Zeradas: ${zeroCount}`
  ]).join('   •   ');

  return {
    contracts: String(summary.contractsToday ?? 0),
    production: summary.productionTodayFormatted || 'R$ 0,00',
    dailyGoal: shortMissing(goal.dailyGoalFormatted, 'Sem meta'),
    dailyGap: shortMissing(goal.dailyGapFormatted, 'Sem gap'),
    storesActive: `${summary.activeStores ?? 0}/${summary.totalStores ?? 0}`,
    zeroCount: String(zeroCount),
    zeroCountNumber: zeroCount,
    contractsDetail: comparisons.yesterday?.labelContracts || 'vs ontem indisponível',
    productionDetail: comparisons.sevenDayAverage?.labelProduction || 'vs média 7d indisponível',
    rhythmLabel: rhythm.label || 'RITMO INDETERMINADO',
    rhythmDescription: rhythm.description || 'Sem leitura por horário.',
    rankingMode: data?.topStoresRankingMode === 'ATINGIMENTO_META' ? 'Ranking por % da meta diária' : 'Ranking por produção em R$',
    goalPercentLabel: dailyPercent !== null ? `${dailyPercent}% da meta do dia` : 'Meta do dia ausente',
    leader: stores[0] || null,
    otherStores: stores.slice(1),
    actions: responsibles.map((row) => buildAction(row, zeroByResponsible)).sort((a, b) => a.score - b.score).slice(0, 5),
    zeroStores: zeroStores.slice(0, 5),
    ai,
    aiError,
    warning,
    ticker,
    panelTime,
    loadTime: normalizeLoadHour(data?.updatedAt || '--h--')
  };
}

function buildAction(row: Responsible, zeroByResponsible: Record<string, number>) {
  const percent = num(row.dailyPercent);
  const zeroCount = zeroByResponsible[norm(row.name)] || 0;
  const projectionNegative = String(row.projectionGapFormatted || '').trim().startsWith('-');
  const hasProduction = Number(row.productionToday || 0) > 0 || Boolean(row.productionTodayFormatted && row.productionTodayFormatted !== 'R$ 0,00');
  let score = 999;
  let motive = 'Monitorar';

  if (projectionNegative) { score = 0; motive = `Projeção negativa${zeroCount ? ` • ${zeroCount} zeradas` : ''}`; }
  else if (zeroCount) { score = 20 - zeroCount; motive = `${zeroCount} lojas zeradas`; }
  else if (percent !== null && percent < 100) { score = 50 + percent; motive = 'Abaixo da meta diária'; }
  else if (percent === null && hasProduction) { score = 80; motive = 'Produção sem diária'; }
  else if (percent !== null) { score = 200 + percent; motive = 'No ritmo'; }

  return { ...row, score, motive };
}

function countZeroByResponsible(stores: ZeroStore[]) {
  return stores.reduce<Record<string, number>>((acc, store) => {
    const key = norm(store.responsible);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function useClock() {
  const [time, setTime] = useState(formatNow());
  useEffect(() => { const id = window.setInterval(() => setTime(formatNow()), 30000); return () => window.clearInterval(id); }, []);
  return time;
}

function formatNow() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h');
}

function normalizeLoadHour(value: string) {
  const match = String(value || '').match(/(\d{1,2})h(\d{2})/);
  if (!match) return value || '--h--';
  const hour = (Number(match[1]) + 3) % 24;
  return `${String(hour).padStart(2, '0')}h${match[2]}`;
}

function Shell({ children }: { children: ReactNode }) { return <main className="screen"><Style />{children}</main>; }
function Loader({ text }: { text: string }) { return <div className="loader"><Logo /><h1>RADAR DE PRODUÇÃO</h1><p>{text}</p></div>; }
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><h2>{title}</h2>{children}</section>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

function Kpi({ title, value, detail, accent, danger, good }: { title: string; value: string; detail: string; accent?: boolean; danger?: boolean; good?: boolean }) {
  return <div className={`kpi ${accent ? 'accent' : ''} ${danger ? 'danger' : ''} ${good ? 'good' : ''}`}><span>{title}</span><b>{value}</b><small>{detail}</small></div>;
}

function Leader({ store }: { store: Store }) {
  return <div className="leader"><em>1</em><div><span>Loja líder</span><b>{store.name || '-'}</b><small>{store.responsible || 'Sem coord.'}</small></div><strong>{store.productionFormatted || 'R$ 0,00'}</strong><i>{fmtPercent(store.goalPercent)}</i><small>{shortMissing(store.goalDailyFormatted, 'Sem meta')} • Gap {shortMissing(store.goalGapFormatted, 'Sem gap')}</small></div>;
}

function StoreLine({ store }: { store: Store }) {
  const percent = num(store.goalPercent);
  const width = percent === null ? 0 : Math.max(5, Math.min(100, percent));
  return <div className="storeRow"><em>{store.position ?? '-'}</em><div><b>{store.name || '-'}</b><small>{store.responsible || 'Sem coord.'}</small></div><span>{store.contracts ?? 0} ct</span><strong>{store.productionFormatted || 'R$ 0,00'}</strong><div className="goalbar"><i style={{ width: `${width}%` }} /><small>{fmtPercent(store.goalPercent)} • {shortMissing(store.goalDailyFormatted, 'Sem meta')}</small></div></div>;
}

function ActionRow({ row }: { row: Responsible & { motive?: string } }) {
  return <div className="actionRow"><b>{row.name || '-'}</b><span>{row.productionTodayFormatted || 'R$ 0,00'}</span><strong>{fmtPercent(row.dailyPercent)}</strong><small>{shortMissing(row.dailyGapFormatted, 'Sem gap')}</small><em>{row.motive || 'Monitorar'}</em></div>;
}

function DeepSeekCard({ ai, fallback, error }: { ai: AiReading | null; fallback?: AiReading; error?: string }) {
  const reading = ai?.structured ? ai : fallback?.structured ? fallback : ai;
  const structured = reading?.structured;
  const status = ai?.status || fallback?.status || 'SEM LEITURA';
  const active = status === 'OK';

  if (!structured) {
    return <div className="deepseek"><div><span>IA COMERCIAL</span><b>{active ? 'IA ativa' : 'Aguardando IA'}</b><em>{status}</em></div><p>{active ? 'IA ativa, mas retorno estruturado indisponível.' : error || 'Aguardando DeepSeek estruturado.'}</p></div>;
  }

  return <div className={`deepseek ${active ? 'active' : ''}`}><div><span>IA COMERCIAL</span><b>{clean(structured.headline || 'DeepSeek ativo')}</b><em>{status} • {reading?.generatedAt || '--'}</em></div><p>{clean(structured.executiveSummary || '')}</p><ul>{(structured.actions || []).slice(0, 3).map((item, index) => <li key={index}><b>{clean(item.title)}</b><span>{clean(item.detail)}</span></li>)}</ul></div>;
}

function ZeroCard({ stores, total }: { stores: ZeroStore[]; total: number }) {
  return <div className="zeros"><div><span>Lojas zeradas</span><b>{total}</b></div><section>{stores.length ? stores.map((store) => <p key={`${store.responsible}-${store.name}`}><strong>{store.name}</strong><span>{store.responsible || 'Sem coord.'}</span><em>{shortMissing(store.dailyGoalFormatted, 'Sem meta')}</em></p>) : <Empty text="Nenhuma loja zerada." />}</section></div>;
}

function num(value: Value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function fmtPercent(value: Value) { const n = num(value); return n === null ? 'Sem diária' : `${n}%`; }
function shortMissing(value: Value, label: string) { return !value || String(value).includes('DADO AUSENTE') ? label : String(value); }
function norm(value: Value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); }
function clean(value: Value) { return String(value || '').replace(/[#*_`|>-]{2,}/g, ' ').replace(/\s+/g, ' ').trim(); }
function Logo() { return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 55 18v28L32 59 9 46V18L32 5Z"/><path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z"/></svg>; }

function Style() {
  return <style jsx global>{`
    *{box-sizing:border-box}html,body{margin:0;background:#020812;overflow:hidden}.screen{width:100vw;height:100vh;overflow:hidden;color:#fff;font-family:Inter,Arial,sans-serif;background:radial-gradient(circle at 8% 0%,rgba(255,193,43,.14),transparent 30%),linear-gradient(135deg,#020812,#06182b 55%,#020812)}.screen:before{content:'';position:absolute;inset:0;opacity:.12;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:30px 30px}.topbar,.kpis,.mainGrid,footer,.warning{position:relative;z-index:2}.topbar{height:86px;padding:12px 18px;display:grid;grid-template-columns:330px 1fr 210px;gap:18px;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(2,8,18,.84)}.brand{display:flex;gap:13px;align-items:center}.brand svg{width:46px;height:46px;padding:9px;border:1px solid rgba(255,193,43,.3);border-radius:15px;background:rgba(255,193,43,.07)}svg path{fill:none;stroke:#ffc12b;stroke-width:4;stroke-linejoin:round}.brand b{display:block;font-size:22px;font-weight:1000}.brand span,.headline span{display:block;color:#ffc12b;font-size:11px;font-weight:900;letter-spacing:.14em}.headline{text-align:center;min-width:0}.headline strong{display:block;margin-top:3px;font-size:30px;font-style:italic;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.headline small{display:block;margin-top:6px;color:rgba(255,255,255,.62);font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timebox{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:9px 10px;border-radius:16px;border:1px solid rgba(255,193,43,.24);background:rgba(255,193,43,.07)}.timebox span{display:block;color:rgba(255,255,255,.58);font-size:9px;font-weight:900}.timebox b{display:block;color:#ffc12b;font-size:25px;line-height:1}.timebox em{grid-column:1/3;color:rgba(255,255,255,.58);font-size:10px;text-align:right;font-style:normal}.warning{height:28px;padding:6px 18px;background:rgba(255,91,91,.16);color:#ffd4d4;font-size:12px;font-weight:900}.kpis{height:100px;padding:11px 18px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.panel{border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(9,23,39,.96),rgba(5,15,27,.96));box-shadow:0 16px 34px rgba(0,0,0,.24)}.kpi{position:relative;overflow:hidden;border-radius:18px;padding:12px 16px}.kpi:before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:#2f92ff}.kpi.accent:before{background:#ffc12b}.kpi.good:before{background:#59e49b}.kpi.danger:before{background:#ff5f6d}.kpi span{display:block;color:rgba(255,255,255,.66);font-size:12px;font-weight:900;text-transform:uppercase}.kpi b{display:block;margin-top:4px;font-size:29px;line-height:1;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi.accent b{color:#ffc12b}.kpi.good b{color:#62e8a2}.kpi.danger b{color:#ff7777}.kpi small{display:block;margin-top:7px;color:rgba(255,255,255,.62);font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mainGrid{height:calc(100vh - 230px);padding:12px 18px 9px;display:grid;grid-template-columns:58% 42%;gap:14px}.warning~.kpis+.mainGrid{height:calc(100vh - 258px)}.rightCol{display:grid;grid-template-rows:43% 57%;gap:14px;min-height:0}.panel{border-radius:20px;padding:14px 16px;overflow:hidden;min-height:0}.panel h2{margin:0 0 8px;color:#ffc12b;font-size:20px;line-height:1;font-weight:1000;text-transform:uppercase}.subline{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;color:rgba(255,255,255,.62);font-size:12px;font-weight:900}.subline b{color:#ffc12b}.leader{height:92px;padding:13px;border-radius:17px;border:1px solid rgba(255,193,43,.2);background:rgba(255,193,43,.07);display:grid;grid-template-columns:50px 1fr 132px 70px;gap:12px;align-items:center}.leader>em{width:46px;height:46px;display:grid;place-items:center;border-radius:15px;background:#ffc12b;color:#07111c;font-size:26px;font-style:normal;font-weight:1000}.leader div{min-width:0}.leader span{color:#ffc12b;font-size:10px;font-weight:1000;text-transform:uppercase}.leader div b{display:block;margin-top:4px;font-size:25px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.leader small{grid-column:2/5;color:rgba(255,255,255,.66);font-size:11px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.leader strong{color:#ffc12b;font-size:16px;text-align:right}.leader i{font-style:normal;font-size:22px;font-weight:1000;text-align:right}.storeList{display:grid;gap:7px;margin-top:8px}.storeRow{display:grid;grid-template-columns:32px minmax(0,1fr) 54px 112px 180px;gap:8px;align-items:center;padding:7px 10px;border-radius:13px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.storeRow em{width:28px;height:28px;display:grid;place-items:center;border-radius:10px;background:rgba(255,193,43,.16);color:#ffc12b;font-style:normal;font-weight:1000}.storeRow b{display:block;font-size:15px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow small{display:block;margin-top:3px;color:rgba(255,255,255,.58);font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow span{color:#65e29f;font-size:13px;font-weight:1000;text-align:right}.storeRow strong{color:#ffc12b;font-size:14px;text-align:right}.goalbar{position:relative;padding-top:13px}.goalbar:before{content:'';position:absolute;top:2px;left:0;right:0;height:8px;border-radius:999px;background:rgba(255,255,255,.09)}.goalbar i{position:absolute;top:2px;left:0;height:8px;border-radius:999px;background:linear-gradient(90deg,#59e49b,#ffd052)}.actionPanel{display:grid;grid-template-rows:auto auto 1fr}.actionHead,.actionRow{display:grid;grid-template-columns:minmax(0,1.15fr) 94px 74px 76px minmax(0,1.1fr);gap:8px;align-items:center}.actionHead{padding:0 10px 6px;color:rgba(255,255,255,.48);font-size:9px;font-weight:1000;text-transform:uppercase}.actionTable{display:grid;gap:6px}.actionRow{padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.045);border-left:4px solid #7aa9ff}.actionRow:first-child{border-left-color:#ff6b6b;background:rgba(255,91,91,.08)}.actionRow b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.actionRow span{color:rgba(255,255,255,.72);font-size:11px;font-weight:900;text-align:right}.actionRow strong{color:#ffc12b;font-size:15px;text-align:right;white-space:nowrap}.actionRow small{color:rgba(255,255,255,.64);font-size:10px;font-weight:900;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.actionRow em{color:rgba(255,255,255,.75);font-size:10px;font-style:normal;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.intelPanel{display:grid;grid-template-rows:auto 1fr .9fr;gap:8px}.deepseek,.zeros{min-height:0;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);padding:10px;overflow:hidden}.deepseek.active{border-color:rgba(89,228,155,.35)}.deepseek>div,.zeros>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.deepseek span,.zeros span{color:#ffc12b;font-size:10px;font-weight:1000;text-transform:uppercase}.deepseek b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.deepseek em{color:rgba(255,255,255,.54);font-size:10px;font-style:normal;font-weight:900;white-space:nowrap}.deepseek p{margin:7px 0 0;color:rgba(255,255,255,.88);font-size:12px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.deepseek ul{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 0;padding:0;list-style:none}.deepseek li{padding:7px;border-radius:10px;background:rgba(255,255,255,.045);min-width:0}.deepseek li b{display:block;color:#fff;font-size:11px}.deepseek li span{display:block;margin-top:3px;color:rgba(255,255,255,.65);font-size:9px;letter-spacing:0;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.zeros>div b{color:#ff7474;font-size:24px}.zeros section{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-top:7px}.zeros p{margin:0;padding:6px 7px;border-radius:9px;background:rgba(255,255,255,.045);display:grid;grid-template-columns:minmax(0,1fr) 60px;gap:3px 6px}.zeros strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.zeros p span{color:rgba(255,255,255,.58);font-size:9px}.zeros p em{grid-column:1/3;color:#ffc12b;font-size:9px;font-style:normal;font-weight:900}.empty{height:100%;display:grid;place-items:center;color:rgba(255,255,255,.46);font-weight:900}footer{height:44px;display:grid;grid-template-columns:110px 1fr 130px;align-items:center;gap:12px;padding:0 18px;border-top:1px solid rgba(255,255,255,.1);background:rgba(2,8,18,.86)}footer b{color:#ffc12b}footer span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.88);font-size:13px;font-weight:900}footer em{text-align:right;color:rgba(255,255,255,.5);font-style:normal;font-size:10px;font-weight:900}.loader{position:relative;z-index:2;margin:23vh auto 0;width:520px;padding:38px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:rgba(9,23,39,.96);text-align:center}.loader svg{width:42px;height:42px}.loader h1{margin:16px 0 8px;font-size:34px}.loader p{margin:0;color:rgba(255,255,255,.7)}
  `}</style>;
}
