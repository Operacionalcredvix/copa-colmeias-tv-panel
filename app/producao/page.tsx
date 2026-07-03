'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);
const AI_POLL_MS = Number(process.env.NEXT_PUBLIC_AI_POLL_MS ?? 300000);

type Value = number | string | null | undefined;
type Summary = { contractsToday?: number; productionTodayFormatted?: string; averageTicketFormatted?: string; activeStores?: number; totalStores?: number; zeroStores?: number };
type Goal = { dailyGoalFormatted?: string; dailyGapFormatted?: string; dailyPercent?: Value; monthGoalFormatted?: string; monthRealizedFormatted?: string; monthGapFormatted?: string; projectionFormatted?: string; projectionGapFormatted?: string };
type Rhythm = { label?: string; tone?: string; percent?: Value; description?: string };
type Pace = { expectedPercentNow?: Value; diffVsExpected?: Value; label?: string; sampleDays?: number; basis?: string };
type Comparison = { labelContracts?: string; labelProduction?: string; productionDeltaPercent?: number };
type Store = { position?: number; name?: string; responsible?: string; contracts?: number; productionFormatted?: string; averageTicketFormatted?: string; goalDailyFormatted?: string; monthGoalFormatted?: string; goalPercent?: Value; goalGapFormatted?: string };
type Responsible = { name?: string; contractsToday?: number; productionTodayFormatted?: string; dailyGoalFormatted?: string; dailyGapFormatted?: string; dailyPercent?: Value; monthGoalFormatted?: string; monthRealizedFormatted?: string; projectionFormatted?: string; projectionGapFormatted?: string; risk?: string; priority?: string; diagnosis?: string };
type ZeroStore = { name?: string; responsible?: string; reason?: string; dailyGoalFormatted?: string; monthGoalFormatted?: string };
type Consultant = { name?: string; store?: string; responsible?: string; contracts?: number; productionFormatted?: string };
type AiReading = { status?: string; generatedAt?: string; text?: string; priorityResponsible?: string };

type Payload = {
  ok: boolean;
  version?: string;
  updatedAt?: string;
  date?: string;
  summary?: Summary;
  goal?: Goal;
  rhythm?: Rhythm;
  paceContext?: Pace;
  comparisons?: { yesterday?: Comparison; sevenDayAverage?: Comparison };
  topStores?: Store[];
  topStoresRankingMode?: string;
  topConsultants?: Consultant[];
  responsiblePerformance?: Responsible[];
  regionalPerformance?: Responsible[];
  zeroStores?: ZeroStore[];
  aiReading?: AiReading;
  ticker?: string[];
  missingData?: string[];
  warning?: string;
  diagnostics?: { warning?: string };
};

type AiPayload = { ok?: boolean; version?: string; ai?: AiReading };

export default function ProducaoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [ai, setAi] = useState<AiReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch('/api/producao', { cache: 'no-store' });
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
        const response = await fetch('/api/producao?mode=ai', { cache: 'no-store' });
        const payload = (await response.json()) as AiPayload;
        if (!alive) return;
        if (payload.ai) {
          setAi(payload.ai);
          setAiError('');
        } else {
          setAiError('Retorno de IA indisponível.');
        }
      } catch (err) {
        console.error(err);
        if (alive) setAiError('Falha ao acionar DeepSeek.');
      }
    }
    loadAi();
    const id = window.setInterval(loadAi, AI_POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const view = useMemo(() => buildView(data, ai, aiError), [data, ai, aiError]);

  if (loading && !data) return <Frame><Loader text="Carregando painel de gestão..." /></Frame>;
  if (!data) return <Frame><Loader text={error || 'Não foi possível carregar os dados.'} /></Frame>;

  return (
    <Frame>
      <header className="topbar">
        <div className="brand"><Logo /><div><b>RADAR DE PRODUÇÃO</b><span>CREDVIX • GESTÃO COMERCIAL</span></div></div>
        <div className="headline"><span>PAINEL EXECUTIVO EM TEMPO REAL</span><strong>{view.rhythmLabel}</strong><small>{view.rhythmDescription}</small></div>
        <div className="updated"><span>ATUALIZADO</span><b>{data.updatedAt || '--h--'}</b><em>{data.date || '--/--/----'}</em></div>
      </header>

      {view.warning && <div className="warning">{view.warning}</div>}

      <section className="kpis">
        <Kpi title="Contratos" value={view.contracts} detail={view.contractsDetail} />
        <Kpi title="Produção" value={view.production} detail={view.productionDetail} accent />
        <Kpi title="Meta do dia" value={view.dailyGoal} detail={`Gap: ${view.dailyGap}`} good={view.dailyGap === 'R$ 0,00'} />
        <Kpi title="Lojas" value={view.storesActive} detail={`${view.zeroCount} zeradas`} danger={view.zeroCountNumber > 0} />
      </section>

      <section className="grid">
        <Panel title="Top lojas por atingimento da meta" className="ranking">
          <div className="subline"><span>{view.rankingMode}</span><b>{view.goalPercentLabel}</b></div>
          {view.leader ? <Leader store={view.leader} /> : <Empty text="Sem loja líder." />}
          <div className="storeList">{view.otherStores.map((store) => <StoreLine key={`${store.position}-${store.name}`} store={store} />)}</div>
        </Panel>

        <div className="side">
          <Panel title="Performance por coordenadora" className="coordPanel">
            <div className="coordList">{view.responsibles.map((row) => <CoordLine key={row.name} row={row} />)}</div>
          </Panel>

          <Panel title="Inteligência comercial" className="intelPanel">
            <DeepSeekCard ai={view.ai} fallback={data.aiReading} error={view.aiError} />
            <ZeroCard stores={view.zeroStores} />
          </Panel>
        </div>
      </section>

      <footer><b>CREDVIX</b><span>{view.ticker}</span><em>{data.version || 'RADAR'}</em></footer>
    </Frame>
  );
}

function buildView(data: Payload | null, ai: AiReading | null, aiError: string) {
  const summary = data?.summary || {};
  const goal = data?.goal || {};
  const rhythm = data?.rhythm || {};
  const pace = data?.paceContext || {};
  const comparisons = data?.comparisons || {};
  const stores = Array.isArray(data?.topStores) ? data!.topStores!.slice(0, 10) : [];
  const responsibles = Array.isArray(data?.responsiblePerformance) ? data!.responsiblePerformance! : Array.isArray(data?.regionalPerformance) ? data!.regionalPerformance! : [];
  const zeroStores = Array.isArray(data?.zeroStores) ? data!.zeroStores!.slice(0, 8) : [];
  const dailyPercent = num(goal.dailyPercent);
  const zeroCount = Number(summary.zeroStores ?? zeroStores.length ?? 0);
  const warning = data?.diagnostics?.warning || data?.warning || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '');
  const ticker = (data?.ticker?.length ? data.ticker : [
    `Contratos hoje: ${summary.contractsToday ?? 0}`,
    `Produção hoje: ${summary.productionTodayFormatted || 'R$ 0,00'}`,
    `Meta do dia: ${goal.dailyGoalFormatted || 'DADO AUSENTE'}`,
    `Gap: ${goal.dailyGapFormatted || 'DADO AUSENTE'}`,
    `Zeradas: ${summary.zeroStores ?? zeroStores.length}`
  ]).join('   •   ');

  return {
    contracts: String(summary.contractsToday ?? 0),
    production: summary.productionTodayFormatted || 'R$ 0,00',
    dailyGoal: goal.dailyGoalFormatted || 'DADO AUSENTE',
    dailyGap: goal.dailyGapFormatted || 'DADO AUSENTE',
    storesActive: `${summary.activeStores ?? 0}/${summary.totalStores ?? 0}`,
    zeroCount: String(zeroCount),
    zeroCountNumber: zeroCount,
    contractsDetail: comparisons.yesterday?.labelContracts || 'vs ontem indisponível',
    productionDetail: comparisons.sevenDayAverage?.labelProduction || 'vs média 7d indisponível',
    rhythmLabel: rhythm.label || 'RITMO INDETERMINADO',
    rhythmDescription: rhythm.description || pace.label || 'Sem leitura por horário.',
    rankingMode: data?.topStoresRankingMode === 'ATINGIMENTO_META' ? 'Ranking por % da meta diária' : 'Ranking por produção em R$',
    goalPercentLabel: dailyPercent !== null ? `${dailyPercent}% da meta do dia` : 'Meta do dia ausente',
    leader: stores[0] || null,
    otherStores: stores.slice(1),
    responsibles,
    zeroStores,
    ai,
    aiError,
    warning,
    ticker
  };
}

function Frame({ children }: { children: ReactNode }) { return <main className="screen"><Style />{children}</main>; }
function Loader({ text }: { text: string }) { return <div className="loader"><Logo /><h1>RADAR DE PRODUÇÃO</h1><p>{text}</p></div>; }
function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><h2>{title}</h2>{children}</section>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

function Kpi({ title, value, detail, accent, danger, good }: { title: string; value: string; detail: string; accent?: boolean; danger?: boolean; good?: boolean }) {
  return <div className={`kpi ${accent ? 'accent' : ''} ${danger ? 'danger' : ''} ${good ? 'good' : ''}`}><span>{title}</span><b>{value}</b><small>{detail}</small></div>;
}

function Leader({ store }: { store: Store }) {
  return <div className="leader"><em>1</em><div><span>Loja líder</span><b>{store.name || '-'}</b><small>{store.responsible || 'Sem coordenadora'}</small></div><strong>{store.productionFormatted || 'R$ 0,00'}</strong><i>{fmtPercent(store.goalPercent)}</i><small>Meta diária: {store.goalDailyFormatted || 'DADO AUSENTE'} • Gap: {store.goalGapFormatted || 'DADO AUSENTE'}</small></div>;
}

function StoreLine({ store }: { store: Store }) {
  const percent = num(store.goalPercent);
  const width = percent === null ? 0 : Math.max(4, Math.min(100, percent));
  return <div className="storeRow"><em>{store.position ?? '-'}</em><div><b>{store.name || '-'}</b><small>{store.responsible || 'Sem coordenadora'}</small></div><span>{store.contracts ?? 0} ct</span><strong>{store.productionFormatted || 'R$ 0,00'}</strong><div className="goalbar"><i style={{ width: `${width}%` }} /><small>{fmtPercent(store.goalPercent)} • meta {store.goalDailyFormatted || 'DADO AUSENTE'}</small></div></div>;
}

function CoordLine({ row }: { row: Responsible }) {
  const percent = num(row.dailyPercent);
  const width = percent === null ? 0 : Math.max(5, Math.min(100, percent));
  const tone = percent === null ? 'neutral' : percent >= 100 ? 'good' : percent >= 90 ? 'attention' : 'critical';
  return <div className={`coord ${tone}`}><div><b>{row.name || '-'}</b><strong>{fmtPercent(row.dailyPercent)}</strong></div><span>{row.contractsToday ?? 0} ct • {row.productionTodayFormatted || 'R$ 0,00'}</span><div className="bar"><i style={{ width: `${width}%` }} /></div><small>Meta dia: {row.dailyGoalFormatted || 'DADO AUSENTE'} • Gap: {row.dailyGapFormatted || 'DADO AUSENTE'} • Meta mês: {row.monthGoalFormatted || 'DADO AUSENTE'}</small><p>{row.diagnosis || row.priority || 'Sem diagnóstico.'}</p></div>;
}

function DeepSeekCard({ ai, fallback, error }: { ai: AiReading | null; fallback?: AiReading; error?: string }) {
  const reading = ai?.text ? ai : fallback;
  const isActive = Boolean(ai?.text && ai.status === 'OK');
  const status = ai?.status || fallback?.status || 'SEM LEITURA';
  const text = reading?.text || error || 'Configure DEEPSEEK_API_KEY no Vercel para ativar a inteligência comercial automática.';
  return <div className={`deepseek ${isActive ? 'active' : ''}`}><span>IA COMERCIAL</span><b>{isActive ? 'DeepSeek ativo' : 'Aguardando DeepSeek'}</b><em>{status} • {reading?.generatedAt || '--'}</em><p>{text}</p>{error && <small>{error}</small>}</div>;
}

function ZeroCard({ stores }: { stores: ZeroStore[] }) {
  return <div className="zeros"><div><span>Lojas zeradas</span><b>{stores.length}</b></div>{stores.length ? stores.map((store) => <p key={`${store.responsible}-${store.name}`}><strong>{store.name}</strong><span>{store.responsible || 'Sem coordenadora'}</span><em>{store.dailyGoalFormatted || 'DADO AUSENTE'}</em></p>) : <Empty text="Nenhuma loja zerada." />}</div>;
}

function num(value: Value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function fmtPercent(value: Value) { const n = num(value); return n === null ? 'DADO AUSENTE' : `${n}%`; }
function Logo() { return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 55 18v28L32 59 9 46V18L32 5Z"/><path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z"/></svg>; }

function Style() {
  return <style jsx global>{`
    *{box-sizing:border-box}html,body{margin:0;background:#020812;overflow:hidden}.screen{width:100vw;height:100vh;overflow:hidden;color:#fff;font-family:Inter,Arial,sans-serif;background:radial-gradient(circle at 8% 0%,rgba(255,193,43,.14),transparent 30%),linear-gradient(135deg,#020812,#06182b 55%,#020812)}.screen:before{content:'';position:absolute;inset:0;opacity:.14;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:30px 30px}.topbar,.kpis,.grid,footer,.warning{position:relative;z-index:2}.topbar{height:88px;padding:12px 18px;display:grid;grid-template-columns:340px 1fr 160px;gap:18px;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(2,8,18,.82)}.brand{display:flex;gap:13px;align-items:center}.brand svg{width:46px;height:46px;padding:9px;border:1px solid rgba(255,193,43,.3);border-radius:15px;background:rgba(255,193,43,.07)}svg path{fill:none;stroke:#ffc12b;stroke-width:4;stroke-linejoin:round}.brand b{display:block;font-size:22px;font-weight:1000}.brand span,.headline span{display:block;color:#ffc12b;font-size:11px;font-weight:900;letter-spacing:.14em}.headline{text-align:center;min-width:0}.headline strong{display:block;margin-top:3px;font-size:31px;font-style:italic;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.headline small{display:block;margin-top:6px;color:rgba(255,255,255,.65);font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.updated{justify-self:end;min-width:148px;padding:9px 12px;text-align:right;border-radius:15px;border:1px solid rgba(255,193,43,.28);background:rgba(255,193,43,.08)}.updated span{display:block;color:rgba(255,255,255,.65);font-size:10px;font-weight:900}.updated b{display:block;color:#ffc12b;font-size:35px;line-height:1}.updated em{display:block;color:rgba(255,255,255,.62);font-size:10px;font-style:normal}.warning{height:30px;padding:6px 18px;background:rgba(255,91,91,.16);color:#ffd4d4;font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpis{height:112px;padding:12px 18px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.panel{border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(9,23,39,.96),rgba(5,15,27,.96));box-shadow:0 20px 42px rgba(0,0,0,.28)}.kpi{position:relative;border-radius:18px;padding:14px 16px;overflow:hidden}.kpi:before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:#4da3ff}.kpi.accent:before{background:#ffc12b}.kpi.danger:before{background:#ff5967}.kpi.good:before{background:#59e49b}.kpi span{display:block;color:rgba(255,255,255,.68);font-size:12px;font-weight:900;text-transform:uppercase}.kpi b{display:block;margin-top:6px;font-size:31px;line-height:1;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpi.accent b{color:#ffc12b}.kpi.danger b{color:#ff7474}.kpi.good b{color:#62e8a2}.kpi small{display:block;margin-top:9px;color:rgba(255,255,255,.62);font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.grid{height:calc(100vh - 256px);padding:12px 18px 14px;display:grid;grid-template-columns:58% 42%;gap:14px}.warning~.kpis+.grid{height:calc(100vh - 286px)}.side{display:grid;grid-template-rows:52% 48%;gap:14px;min-height:0}.panel{border-radius:20px;padding:15px 16px;overflow:hidden;min-height:0}.panel h2{margin:0 0 13px;color:#ffc12b;font-size:19px;font-weight:1000;text-transform:uppercase}.ranking{display:grid;grid-template-rows:auto auto 1fr}.subline{height:28px;margin:-4px 0 10px;display:flex;justify-content:space-between;color:rgba(255,255,255,.68);font-size:12px;font-weight:900}.subline b{color:#ffc12b}.leader{display:grid;grid-template-columns:50px 1fr 140px 80px;grid-template-rows:auto auto;gap:9px 12px;align-items:center;margin-bottom:10px;padding:13px;border-radius:17px;border:1px solid rgba(255,193,43,.2);background:rgba(255,193,43,.07)}.leader em{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(135deg,#ffb01f,#ffd35d);color:#07111c;font-size:27px;font-style:normal;font-weight:1000}.leader div{min-width:0}.leader span{display:block;color:#ffc12b;font-size:10px;font-weight:1000;text-transform:uppercase}.leader b{display:block;margin-top:5px;font-size:28px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.leader div small{display:block;margin-top:6px;color:rgba(255,255,255,.62);font-size:12px;font-weight:900}.leader strong{color:#ffc12b;text-align:right;white-space:nowrap}.leader i{font-style:normal;font-weight:1000;text-align:right}.leader>small{grid-column:2/5;color:rgba(255,255,255,.65);font-size:11px;font-weight:900}.storeList{display:grid;gap:7px;align-content:start}.storeRow{display:grid;grid-template-columns:34px minmax(0,1fr) 62px 120px 210px;gap:9px;align-items:center;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.storeRow em{width:29px;height:29px;display:grid;place-items:center;border-radius:10px;background:rgba(255,193,43,.16);color:#ffc12b;font-style:normal;font-weight:1000}.storeRow div{min-width:0}.storeRow b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.storeRow div small{display:block;margin-top:4px;color:rgba(255,255,255,.54);font-size:11px;font-weight:800}.storeRow span{color:#65e29f;font-size:13px;font-weight:1000;text-align:right}.storeRow>strong{color:#ffc12b;font-size:14px;text-align:right;white-space:nowrap}.goalbar{position:relative;height:27px;padding-top:15px}.goalbar:before{content:'';position:absolute;left:0;right:0;top:3px;height:8px;border-radius:999px;background:rgba(255,255,255,.08)}.goalbar i{position:absolute;left:0;top:3px;height:8px;border-radius:999px;background:linear-gradient(90deg,#43da8d,#ffd052)}.goalbar small{display:block;color:rgba(255,255,255,.6);font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.coordPanel{display:grid;grid-template-rows:auto 1fr}.coordList{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.coord{padding:10px 11px;border-radius:15px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);border-left:4px solid #7aa9ff}.coord.good{border-left-color:#59e49b}.coord.attention{border-left-color:#ffd052}.coord.critical{border-left-color:#ff6b6b}.coord div:first-child{display:flex;justify-content:space-between;gap:10px}.coord b{font-size:16px}.coord strong{color:#ffc12b;font-size:22px;line-height:1}.coord.good strong{color:#62e8a2}.coord.critical strong{color:#ff7d7d}.coord>span{display:block;margin-top:5px;color:rgba(255,255,255,.6);font-size:10px;font-weight:900}.bar{height:9px;margin:9px 0;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#ff6b6b,#ffc12b,#62e8a2)}.coord small{display:block;color:rgba(255,255,255,.66);font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.coord p{margin:7px 0 0;color:rgba(255,255,255,.8);font-size:11px;line-height:1.22}.intelPanel{display:grid;grid-template-rows:auto 1fr}.intelPanel>h2{margin-bottom:10px}.intelPanel{grid-template-columns:none}.deepseek,.zeros{border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.045);overflow:hidden}.intelPanel .deepseek{float:left;width:59%;height:calc(100% - 35px);padding:14px}.intelPanel .zeros{float:right;width:39%;height:calc(100% - 35px);padding:12px}.deepseek.active{border-color:rgba(89,228,155,.35)}.deepseek span,.zeros span{display:block;color:#ffc12b;font-size:10px;font-weight:1000;text-transform:uppercase;letter-spacing:.08em}.deepseek b{display:block;margin-top:4px;font-size:18px}.deepseek em{display:block;margin-top:3px;color:rgba(255,255,255,.54);font-style:normal;font-size:10px;font-weight:900}.deepseek p{margin:12px 0 0;color:rgba(255,255,255,.9);font-size:14px;line-height:1.34}.deepseek small{display:block;margin-top:8px;color:#ffb0b0;font-size:10px;font-weight:900}.zeros>div{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.zeros>div b{font-size:26px;color:#ff7474}.zeros p{display:grid;grid-template-columns:minmax(0,1fr) 86px 82px;gap:8px;align-items:center;margin:0 0 6px;padding:7px 8px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.05)}.zeros p strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.zeros p span{color:rgba(255,255,255,.58);font-size:10px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.zeros p em{color:#ffc12b;font-size:10px;font-style:normal;font-weight:900;text-align:right}.empty{height:100%;min-height:60px;display:grid;place-items:center;color:rgba(255,255,255,.46);font-weight:900;text-align:center}footer{height:56px;display:grid;grid-template-columns:120px 1fr 140px;align-items:center;gap:14px;padding:0 18px;border-top:1px solid rgba(255,255,255,.1);background:rgba(2,8,18,.86)}footer b{color:#ffc12b;font-size:15px}footer span{overflow:hidden;white-space:nowrap;color:rgba(255,255,255,.88);font-size:14px;font-weight:900}footer em{text-align:right;color:rgba(255,255,255,.5);font-style:normal;font-size:11px;font-weight:900}.loader{position:relative;z-index:2;margin:23vh auto 0;width:520px;padding:38px;border-radius:20px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(9,23,39,.96),rgba(5,15,27,.96));text-align:center}.loader svg{width:40px;height:40px}.loader h1{margin:16px 0 8px;font-size:34px;line-height:1}.loader p{margin:0;color:rgba(255,255,255,.7)}
  `}</style>;
}
