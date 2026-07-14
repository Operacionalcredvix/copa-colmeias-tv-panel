'use client';

import { useEffect, useMemo, useState } from 'react';

const POLL_MS = 30000;
const ROTATE_MS = 18000;
const VIEWS = ['summary', 'coordinators', 'stores', 'ranking', 'actions'] as const;
type ViewKey = typeof VIEWS[number];

export default function RadarPage() {
  const [main, setMain] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [ai, setAi] = useState<any>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [coordinatorIndex, setCoordinatorIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const now = useClock();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [mainRes, detailRes] = await Promise.all([
          fetch('/api/producao?refresh=1', { cache: 'no-store' }),
          fetch('/api/producao/detalhes?refresh=1', { cache: 'no-store' })
        ]);
        const [mainPayload, detailPayload] = await Promise.all([mainRes.json(), detailRes.json()]);
        if (!mainPayload?.ok) throw new Error(mainPayload?.message || 'Falha na fonte principal');
        if (!detailPayload?.ok) throw new Error(detailPayload?.message || 'Falha na fonte operacional');
        if (!alive) return;
        setMain(mainPayload);
        setDetails(detailPayload);
        setError('');
      } catch (err) {
        console.error(err);
        if (alive) setError('Fonte temporariamente indisponível. A última leitura válida foi preservada.');
      }
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadAi = async () => {
      try {
        const response = await fetch('/api/producao?mode=ai&refresh=1', { cache: 'no-store' });
        const payload = await response.json();
        if (alive && payload?.ai) setAi(payload.ai);
      } catch (err) {
        console.error(err);
      }
    };
    loadAi();
    const id = window.setInterval(loadAi, 300000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    if (paused || !main || !details) return;
    const id = window.setInterval(() => setViewIndex((value) => (value + 1) % VIEWS.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, main, details]);

  const view = VIEWS[viewIndex];
  const coordinators = details?.coordinators || [];
  const activeCoordinator = coordinators[coordinatorIndex] || coordinators[0] || null;
  const stores = useMemo(() => {
    if (!activeCoordinator) return [];
    return (details?.stores || [])
      .filter((store: any) => norm(store.responsible) === norm(activeCoordinator.name))
      .sort(storePriority);
  }, [details, activeCoordinator]);

  if (!main || !details) {
    return <main className="loading"><Styles /><Brand /><h1>RADAR OPERACIONAL</h1><p>{error || 'Carregando leitura da operação...'}</p></main>;
  }

  const title = viewTitle(view, activeCoordinator?.name);
  const subtitle = viewSubtitle(view);
  const loadTime = details.generatedAt?.match(/\d{2}:\d{2}/)?.[0] || main.updatedAt || '--:--';

  return (
    <main className="radar-shell">
      <Styles />
      <header className="topbar">
        <Brand />
        <div className="top-title"><span>{subtitle}</span><strong>{title}</strong></div>
        <div className="live"><i /> AO VIVO</div>
        <div className="load"><small>CARGA {loadTime}</small><b>{now}</b></div>
        <button onClick={() => setPaused((value) => !value)}>{paused ? '▶' : 'Ⅱ'}</button>
        <button onClick={() => setViewIndex((value) => (value + 1) % 5)}>›</button>
        <button onClick={() => document.documentElement.requestFullscreen?.()}>⛶</button>
      </header>

      {error && <div className="warning">{error}</div>}

      <section className="viewport">
        {view === 'summary' && <SummaryScreen main={main} details={details} />}
        {view === 'coordinators' && <CoordinatorScreen coordinators={coordinators} />}
        {view === 'stores' && <StoresScreen coordinator={activeCoordinator} coordinators={coordinators} stores={stores} selected={coordinatorIndex} onSelect={setCoordinatorIndex} />}
        {view === 'ranking' && <RankingScreen main={main} details={details} />}
        {view === 'actions' && <ActionScreen main={main} details={details} ai={ai || main.aiReading} />}
      </section>

      <footer className="footer">
        <b>CREDVIX</b>
        <div className="ticker">Vendido hoje: {details.summary.soldTodayFormatted} • Pago hoje: {details.summary.paidTodayFormatted} • Aguardando conversão: {details.summary.pendingFormatted} • Diária: {details.summary.dailyGoalFormatted}</div>
        <nav>{VIEWS.map((item, index) => <button key={item} className={index === viewIndex ? 'active' : ''} onClick={() => setViewIndex(index)}><i />{navLabel(item)}</button>)}</nav>
        <strong>{viewIndex + 1}/5</strong><small>ROTAÇÃO AUTOMÁTICA</small>
      </footer>
    </main>
  );
}

function SummaryScreen({ main, details }: any) {
  const s = details.summary;
  const expected = expectedPercent();
  const actual = Number(s.dailyPercent || 0);
  const deviation = actual - expected;
  const projection = projectedClose(s.paidToday, expected);
  const gap = Math.max(0, s.dailyGoal - projection);
  const headline = actual >= expected ? 'MANTER O RITMO' : 'ACELERAR A ENTREGA';
  const top = [...(details.stores || [])].filter((item) => item.soldPercent !== null).sort((a, b) => (b.soldPercent || 0) - (a.soldPercent || 0)).slice(0, 5);
  const actions = buildActions(details).slice(0, 2);
  return <div className="screen summary-screen">
    <section className="hero panel">
      <div className="ring" style={{'--pct': `${Math.min(100, actual)}%`} as any}><div><b>{actual}%</b><span>DA META DIÁRIA</span></div></div>
      <div className="hero-copy"><span>LEITURA DO DIA</span><h1>{headline}</h1><p>{actual}% realizado vs ~{expected}% esperado às {new Date().getHours()}h</p><strong>{money(s.dailyGap)}</strong><small>para a diária • cerca de {averageContracts(s.dailyGap, main.summary?.averageTicket)} contratos médios</small></div>
      <div className="hero-metrics"><Metric label="Esperado agora" value={`${expected}%`} /><Metric label="Desvio da curva" value={`${deviation > 0 ? '+' : ''}${deviation} p.p.`} danger={deviation < 0} /><Metric label="Projeção no fechamento" value={`${Math.round((projection / s.dailyGoal) * 100 || 0)}%`} sub={money(projection)} /></div>
    </section>
    <section className="kpis"><Kpi label="PAGO HOJE" value={s.paidTodayFormatted} sub={`${main.summary?.contractsToday || 0} contratos • ${actual}% da diária`} tone="blue" /><Kpi label="VENDIDO HOJE" value={s.soldTodayFormatted} sub={`${s.storesCount - countNoSale(details.stores)}/${s.storesCount} lojas com venda`} tone="orange" /><Kpi label="META DIÁRIA" value={s.dailyGoalFormatted} sub={`${money(s.dailyGap)} • ${averageContracts(s.dailyGap, main.summary?.averageTicket)} contratos médios`} tone="green" /><Kpi label="REALIZADO NO MÊS" value={s.monthRealizedFormatted} sub={`${Math.round((s.monthRealized / s.monthGoal) * 100 || 0)}% da meta de ${s.monthGoalFormatted}`} tone="neutral" /></section>
    <section className="two-columns"><Panel eyebrow="VENDIDO HOJE • % DA DIÁRIA" title="Ranking de lojas"><div className="mini-ranking">{top.map((item, index) => <div key={item.name}><em>{index + 1}</em><b>{item.name}</b><strong>{item.soldPercent}%</strong><span>{item.soldTodayFormatted}</span></div>)}</div></Panel><Panel eyebrow="PRIORIDADES DO MOMENTO" title="Ação agora"><div className="priority-list">{actions.map((item, index) => <Priority key={item.title} index={index + 1} {...item} />)}</div></Panel></section>
  </div>;
}

function CoordinatorScreen({ coordinators }: any) {
  return <div className="screen"><SectionHeader eyebrow="ACOMPANHAMENTO CONSOLIDADO" title="Entrega das coordenações" description="Pagamento confirmado, necessidade do dia e projeção mensal no mesmo ponto de decisão." /><Panel eyebrow="ORDENADAS POR NECESSIDADE DE AÇÃO" title="Coordenações" large><div className="table coord-table"><div className="thead"><span>COORDENADORA</span><span>VENDIDO HOJE</span><span>PAGO HOJE</span><span>NECESSÁRIO HOJE</span><span>ENTREGA</span><span>PROJEÇÃO MENSAL</span><span>LEITURA</span></div>{coordinators.map((c: any) => <div className={`trow ${coordTone(c)}`} key={c.name}><span><b>{c.name}</b><small>{c.noSaleStores ? `${c.noSaleStores} lojas sem venda captada` : 'Cobertura completa de vendas'}</small></span><span>{c.soldTodayFormatted}</span><span><b>{c.paidTodayFormatted}</b></span><span className="orange"><b>{c.dailyGoalFormatted}</b></span><span className={Number(c.dailyPercent) >= 100 ? 'green' : 'red'}>{c.dailyPercent === null ? 'Sem meta' : `${c.dailyPercent}%`}</span><span>{c.projectionFormatted}</span><span><small>{c.reading}</small></span></div>)}</div></Panel></div>;
}

function StoresScreen({ coordinator, coordinators, stores, selected, onSelect }: any) {
  if (!coordinator) return <Empty text="Nenhuma coordenação encontrada." />;
  return <div className="screen"><div className="store-heading"><SectionHeader eyebrow="GESTÃO OPERACIONAL POR LOJA" title={coordinator.name} description={`${coordinator.deliveredStores} de ${coordinator.storesCount} lojas entregaram a necessidade do dia`} /><div className="tabs">{coordinators.map((item: any, index: number) => <button className={index === selected ? 'active' : ''} onClick={() => onSelect(index)} key={item.name}>{item.name}</button>)}</div></div><section className="kpis compact"><Kpi label="VENDIDO HOJE" value={coordinator.soldTodayFormatted} /><Kpi label="PAGO HOJE" value={coordinator.paidTodayFormatted} /><Kpi label="NECESSÁRIO HOJE" value={coordinator.dailyGoalFormatted} /><Kpi label="ENTREGA DA DIÁRIA" value={coordinator.dailyPercent === null ? 'Sem meta' : `${coordinator.dailyPercent}%`} tone={coordinator.dailyPercent >= 100 ? 'green' : 'red'} /><Kpi label="PROJEÇÃO MENSAL" value={coordinator.projectionFormatted} /></section><Panel eyebrow="NÃO ENTREGUES PRIMEIRO • VALORES SEM LEITURA NÃO VIRAM ZERO" title="Lojas da coordenação" large><div className="table store-table"><div className="thead"><span>LOJA</span><span>VENDIDO HOJE</span><span>PAGO HOJE</span><span>NECESSÁRIO HOJE</span><span>FALTA</span><span>STATUS</span></div>{stores.slice(0, 12).map((store: any) => <div className={`trow ${storeTone(store.status)}`} key={store.name}><span><b>{store.name}</b></span><span>{store.soldTodayFormatted}</span><span><b>{store.paidTodayFormatted}</b></span><span>{store.dailyGoalFormatted}</span><span className={store.missing > 0 ? 'red' : 'green'}>{store.missingFormatted}</span><span><Status status={store.status} /></span></div>)}</div></Panel></div>;
}

function RankingScreen({ main, details }: any) {
  const stores = [...(details.stores || [])].filter((item) => item.soldPercent !== null).sort((a, b) => (b.soldPercent || 0) - (a.soldPercent || 0)).slice(0, 5);
  const consultants = pickConsultants(main).slice(0, 5);
  const expected = expectedPercent();
  const actual = Number(details.summary.dailyPercent || 0);
  return <div className="screen"><SectionHeader eyebrow="DESEMPENHO DO DIA" title="Quem entrega e quem precisa acelerar" description="Venda captada, pagamento confirmado e cobertura por loja." /><section className="two-columns equal"><Panel eyebrow="TOP 5 • % DA DIÁRIA" title="Lojas por venda"><RankingTable items={stores.map((item, index) => ({rank:index + 1, name:item.name, meta:item.responsible, cols:[item.soldTodayFormatted, item.paidTodayFormatted, `${item.soldPercent}%`]}))} headers={['LOJA','COORDENAÇÃO','VENDIDO','PAGO','% DIÁRIA']} /></Panel><Panel eyebrow="TOP 5 • PAGAMENTO CONFIRMADO" title="Consultores em destaque"><RankingTable items={consultants.map((item:any, index:number) => ({rank:index + 1, name:item.name || item.consultant || '-', meta:item.store || '-', cols:[String(item.contracts || item.contractsToday || 0), item.productionFormatted || item.paidFormatted || money(item.production || item.paid || 0)]}))} headers={['CONSULTOR','LOJA','CT','PAGO']} /></Panel></section><section className="comparison-row"><CompareCard label="RITMO DO HORÁRIO" value={`${actual}% x ${expected}%`} sub={`${expected - actual} p.p. abaixo da curva`} tone="orange" /><CompareCard label="VERSUS ONTEM" value={main.comparisons?.yesterday?.labelProduction || 'Comparação indisponível'} sub={main.comparisons?.yesterday?.labelContracts || ''} /><CompareCard label="VERSUS MÉDIA 7 DIAS" value={main.comparisons?.sevenDayAverage?.labelProduction || 'Comparação indisponível'} sub={main.comparisons?.sevenDayAverage?.labelContracts || ''} /></section></div>;
}

function ActionScreen({ main, details, ai }: any) {
  const expected = expectedPercent();
  const actual = Number(details.summary.dailyPercent || 0);
  const projected = projectedClose(details.summary.paidToday, expected);
  const projectedPct = Math.round((projected / details.summary.dailyGoal) * 100 || 0);
  const gap = Math.max(0, details.summary.dailyGoal - projected);
  const fallbackActions = buildActions(details);
  const structured = ai?.structured || ai || {};
  const actions = (structured.actions?.length ? structured.actions : fallbackActions).slice(0, 3);
  const risks = (structured.risks?.length ? structured.risks : buildRisks(details, expected)).slice(0, 3);
  const questions = (structured.questions?.length ? structured.questions : [`Quais propostas podem virar pagamento antes da próxima carga?`, `Qual ação imediata reduziria o gap projetado de ${money(gap)}?`]).slice(0, 3);
  return <div className="screen"><SectionHeader eyebrow="LEITURA OPERACIONAL • REGRAS DE NEGÓCIO" title={`Projeção de ${projectedPct}% da diária`} description={`${actual}% realizado contra ${expected}% esperado agora. No ritmo atual, o fechamento tende a ${money(projected)}.`} /><div className="executive"><span>PRIORIDADE EXECUTIVA</span><b>{structured.priority || `Recuperar ${money(gap)} da projeção`}</b></div><section className="three-columns"><Panel eyebrow="O QUE FAZER AGORA" title="Ações recomendadas"><div className="priority-list">{actions.map((item:any, index:number) => <Priority key={index} index={index + 1} title={item.title || item.name || 'Ação operacional'} detail={item.detail || item.description || ''} owner={item.responsible || item.owner || 'GESTÃO COMERCIAL'} impact={item.impact || item.impactFormatted || ''} />)}</div></Panel><Panel eyebrow="PONTOS DE ATENÇÃO" title="Riscos identificados"><div className="risk-list">{risks.map((item:any, index:number) => <Risk key={index} index={index + 1} title={item.title || 'Risco operacional'} detail={item.detail || item.description || ''} owner={item.responsible || 'GESTÃO COMERCIAL'} />)}</div></Panel><Panel eyebrow="ALINHAMENTO DA GESTÃO" title="Perguntas para decisão"><div className="questions">{questions.map((question:string, index:number) => <div key={question}><b>0{index + 1}</b><p>{question}</p></div>)}</div></Panel></section><small className="source">FONTE: PAINEL COMERCIAL, DIÁRIA ESTÁTICA E BASE TRANSACIONAL.</small></div>;
}

function Brand() { return <div className="brand"><div className="radar-mark"><i /><span /></div><div><b>RADAR OPERACIONAL</b><small>CREDVIX • GESTÃO COMERCIAL</small></div></div>; }
function SectionHeader({ eyebrow, title, description }: any) { return <div className="section-header"><div><span>{eyebrow}</span><h1>{title}</h1></div><p>{description}</p></div>; }
function Panel({ eyebrow, title, children, large }: any) { return <section className={`panel content-panel ${large ? 'large' : ''}`}><div className="panel-title"><span>{eyebrow}</span><h2>{title}</h2><i /></div>{children}</section>; }
function Kpi({ label, value, sub, tone = '' }: any) { return <div className={`kpi ${tone}`}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>; }
function Metric({ label, value, sub, danger }: any) { return <div className="metric"><span>{label}</span><b className={danger ? 'red' : ''}>{value}</b>{sub && <small>{sub}</small>}</div>; }
function Priority({ index, title, detail, owner, impact }: any) { return <div className="priority"><em>{index}</em><div><b>{title}</b><p>{detail}</p><small>{owner}</small></div>{impact && <strong>{impact}</strong>}</div>; }
function Risk({ index, title, detail, owner }: any) { return <div className="risk"><em>{index}</em><div><b>{title}</b><p>{detail}</p><small>{owner}</small></div></div>; }
function Status({ status }: any) { return <b className={`status ${storeTone(status)}`}><i />{status === 'NAO ENTREGUE' ? 'Não entregue' : status === 'A AVALIAR' ? 'A avaliar' : status === 'AGUARDANDO PAGAMENTO' ? 'Aguardando' : 'Entregue'}</b>; }
function CompareCard({ label, value, sub, tone }: any) { return <div className={`compare ${tone || ''}`}><span>{label}</span><b>{value}</b><small>{sub}</small></div>; }
function RankingTable({ items, headers }: any) { return <div className="ranking-table"><div className="rank-head"><span>#</span>{headers.map((h:string) => <span key={h}>{h}</span>)}</div>{items.map((item:any) => <div className="rank-row" key={`${item.rank}-${item.name}`}><em>{item.rank}</em><b>{item.name}</b><small>{item.meta}</small>{item.cols.map((col:string, index:number) => <span className={index === item.cols.length - 1 ? 'highlight' : ''} key={index}>{col}</span>)}</div>)}</div>; }
function Empty({ text }: any) { return <div className="empty">{text}</div>; }

function buildActions(details:any) {
  const coordinators = [...(details.coordinators || [])].filter((c:any) => c.dailyGap > 0).sort((a:any,b:any) => b.dailyGap - a.dailyGap);
  const stores = [...(details.stores || [])].filter((s:any) => s.pending > 0 && s.status !== 'ENTREGUE').sort((a:any,b:any) => b.pending - a.pending);
  const noSale = [...(details.stores || [])].filter((s:any) => s.soldToday <= 0 && s.dailyGoal > 0).sort((a:any,b:any) => b.dailyGoal - a.dailyGoal);
  const output:any[] = [];
  if (coordinators[0]) output.push({title:`Recuperar ${coordinators[0].dailyGapFormatted} da coordenação ${coordinators[0].name}`, detail:`${coordinators[0].dailyPercent || 0}% da necessidade diária entregue`, owner:'GESTÃO COMERCIAL', impact:coordinators[0].dailyGapFormatted});
  if (stores[0]) output.push({title:`Converter ${stores[0].name}`, detail:`${stores[0].pendingFormatted} vendidos ainda sem pagamento confirmado`, owner:stores[0].responsible, impact:stores[0].pendingFormatted});
  if (noSale[0]) output.push({title:`Ativar ${noSale[0].name}`, detail:`Maior diária entre as lojas sem venda captada: ${noSale[0].dailyGoalFormatted}`, owner:noSale[0].responsible, impact:noSale[0].dailyGoalFormatted});
  return output;
}
function buildRisks(details:any, expected:number) { const s=details.summary; return [{title:'Ritmo abaixo da curva',detail:`${s.dailyPercent || 0}% realizado contra ${expected}% esperado`,responsible:'GESTÃO COMERCIAL'},{title:'Cobertura comercial',detail:`${countNoSale(details.stores)} lojas ainda não registraram venda captada hoje`,responsible:'GESTÃO COMERCIAL'},{title:'Conversão pendente',detail:`${s.pendingFormatted} vendidos aguardam pagamento confirmado`,responsible:'COORDENAÇÕES'}]; }
function pickConsultants(main:any) { return main.topConsultants || main.consultantRanking || main.consultants || main.topSellers || []; }
function countNoSale(stores:any[]) { return (stores || []).filter((s:any) => Number(s.soldToday || 0) <= 0).length; }
function expectedPercent() { const now = new Date(); const minutes = now.getHours()*60 + now.getMinutes(); const start=9*60; const end=18*60; if(minutes<=start) return 0; if(minutes>=end) return 100; return Math.round(((minutes-start)/(end-start))*100); }
function projectedClose(paid:number, expected:number) { if(expected<=0) return paid; return paid/(expected/100); }
function averageContracts(value:number, ticket:number) { const avg=Number(ticket || 1600); return Math.max(0, Math.round(Number(value || 0)/avg)); }
function money(value:any) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0)); }
function norm(value:any) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(); }
function storePriority(a:any,b:any) { const score=(s:any)=>s.status==='NAO ENTREGUE'?0:s.status==='AGUARDANDO PAGAMENTO'?1:s.status==='A AVALIAR'?2:3; return score(a)-score(b)||(b.missing||0)-(a.missing||0); }
function storeTone(status:string) { return status==='ENTREGUE'?'delivered':status==='A AVALIAR'?'evaluate':status==='AGUARDANDO PAGAMENTO'?'waiting':'failed'; }
function coordTone(c:any) { return c.dailyPercent===null?'evaluate':Number(c.dailyPercent)>=100?'delivered':Number(c.dailyPercent)<70?'failed':'waiting'; }
function viewTitle(view:ViewKey, coordinator?:string) { return view==='stores' ? coordinator || 'DETALHE DA COORDENAÇÃO' : view==='summary'?'ACELERAR A ENTREGA':view==='coordinators'?'ACELERAR A ENTREGA':view==='ranking'?'ACELERAR A ENTREGA':'ACELERAR A ENTREGA'; }
function viewSubtitle(view:ViewKey) { return view==='summary'?'VISÃO GERAL':view==='coordinators'?'CONSOLIDADO DAS COORDENAÇÕES':view==='stores'?'DETALHE DA COORDENAÇÃO':view==='ranking'?'PERFORMANCE':'AÇÕES E INTELIGÊNCIA'; }
function navLabel(view:ViewKey) { return view==='summary'?'RESUMO':view==='coordinators'?'COORD.':view==='stores'?'LOJAS':view==='ranking'?'RANKING':'AÇÃO'; }
function useClock() { const [time,setTime]=useState(''); useEffect(()=>{const update=()=>setTime(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())); update(); const id=setInterval(update,30000); return()=>clearInterval(id);},[]); return time; }

function Styles() { return <style jsx global>{`
*{box-sizing:border-box}html,body{margin:0;background:#020b15;color:#f5f7fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.radar-shell{width:100vw;height:100vh;min-width:1180px;min-height:650px;background:radial-gradient(circle at 50% 0,#0a2035 0,#061523 36%,#020b15 75%);display:grid;grid-template-rows:64px 1fr 44px}.topbar{display:grid;grid-template-columns:340px 1fr auto 120px 38px 38px 38px;align-items:center;gap:8px;padding:0 22px;border-bottom:1px solid #173148;background:#020a14}.brand{display:flex;align-items:center;gap:12px}.brand>div:last-child{display:flex;flex-direction:column}.brand b{font-size:18px}.brand small{color:#ff7a18;font-size:9px;font-weight:800;letter-spacing:1.5px}.radar-mark{width:42px;height:42px;border:2px solid #ff6a00;border-radius:50%;position:relative}.radar-mark:before{content:"";position:absolute;inset:8px;border:2px solid #ff6a00;border-radius:50%;border-left-color:transparent}.radar-mark i{position:absolute;width:7px;height:7px;border-radius:50%;background:#ff6a00;left:18px;top:18px}.radar-mark span{position:absolute;width:24px;height:2px;background:#ff6a00;transform:rotate(-42deg);left:18px;top:10px;transform-origin:left}.top-title{text-align:center;display:flex;flex-direction:column}.top-title span{font-size:9px;color:#90a0b2;font-weight:800;letter-spacing:2px}.top-title strong{font-size:19px}.live{border:1px solid #14533b;background:#062a22;border-radius:20px;padding:8px 14px;color:#b7f8d1;font-size:12px;font-weight:800}.live i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4be08b;box-shadow:0 0 12px #4be08b;margin-right:6px}.load{padding-left:12px;border-left:1px solid #243345;text-align:right}.load small{display:block;color:#8d9bad;font-size:9px;font-weight:800}.load b{font-size:22px}.topbar button{height:32px;border:1px solid #1d3145;background:#071423;color:#aab7c6;border-radius:9px;font-size:16px}.viewport{min-height:0;padding:12px 20px 8px}.screen{height:100%;display:flex;flex-direction:column;gap:12px}.warning{position:absolute;top:68px;left:50%;transform:translateX(-50%);z-index:20;background:#3b2510;border:1px solid #bb691f;color:#ffd6ad;padding:7px 14px;border-radius:8px;font-size:11px}.panel{border:1px solid #17334b;background:linear-gradient(180deg,rgba(9,31,52,.96),rgba(4,18,31,.96));border-radius:18px;box-shadow:inset 0 1px rgba(255,255,255,.02)}.hero{height:140px;display:grid;grid-template-columns:220px 1fr 290px;align-items:center;padding:14px 24px}.ring{width:112px;height:112px;margin:auto;border-radius:50%;background:conic-gradient(#ff7417 var(--pct),#183147 0);display:grid;place-items:center;position:relative}.ring:after{content:"";position:absolute;inset:10px;border-radius:50%;background:#0a1a2b}.ring div{z-index:1;text-align:center}.ring b{font-size:33px}.ring span{display:block;font-size:8px;color:#9cacbd;font-weight:800}.hero-copy{border-left:1px solid #24415a;padding-left:24px}.hero-copy>span,.panel-title>span,.section-header span{font-size:9px;color:#ff8428;font-weight:900;letter-spacing:1.4px}.hero-copy h1{margin:4px 0 0;font-size:28px}.hero-copy p{margin:0 0 8px;color:#c0cad4}.hero-copy strong{color:#ff8428;font-size:25px}.hero-copy small{margin-left:8px;color:#95a4b4}.hero-metrics{height:100%;border-left:1px solid #18364f;padding-left:20px;display:flex;flex-direction:column;justify-content:center}.metric{display:grid;grid-template-columns:1fr auto;gap:2px;padding:5px 0}.metric span{font-size:10px;color:#91a0b1}.metric b{font-size:17px}.metric small{grid-column:2;font-size:9px;color:#9aa8b7}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpis.compact{grid-template-columns:repeat(5,1fr)}.kpi{height:84px;border:1px solid #17334b;border-top:3px solid #78899a;background:linear-gradient(180deg,#0c2137,#071524);border-radius:14px;padding:12px 15px;display:flex;flex-direction:column;justify-content:center}.compact .kpi{height:72px}.kpi span{font-size:9px;color:#91a1b1;font-weight:900;letter-spacing:1px}.kpi b{font-size:25px;line-height:1.15}.compact .kpi b{font-size:19px}.kpi small{font-size:9px;color:#8d9dad}.kpi.orange{border-top-color:#ff7417}.kpi.orange b,.orange{color:#ff8428}.kpi.blue{border-top-color:#42a5ff}.kpi.green{border-top-color:#50d58a}.kpi.red{border-top-color:#ff536d}.kpi.red b,.red{color:#ff536d!important}.green{color:#53dc8f!important}.two-columns{display:grid;grid-template-columns:1.08fr 1fr;gap:12px;min-height:0;flex:1}.two-columns.equal{grid-template-columns:1fr 1fr}.content-panel{padding:14px 16px;min-height:0;overflow:hidden}.panel-title{height:46px;border-bottom:1px solid #173149;position:relative}.panel-title h2{margin:2px 0 0;font-size:20px}.panel-title i{position:absolute;right:4px;top:18px;width:26px;height:3px;background:#ff7417}.mini-ranking>div{height:39px;display:grid;grid-template-columns:28px 1fr 70px 110px;align-items:center;border-bottom:1px solid #152b40;background:rgba(255,255,255,.015);padding:0 8px}.mini-ranking em{color:#ff8629;font-style:normal;font-weight:900}.mini-ranking b{font-size:12px}.mini-ranking strong{color:#49df88;font-size:12px}.mini-ranking span{text-align:right;font-size:11px;color:#d2d8df}.priority-list,.risk-list{display:flex;flex-direction:column;gap:9px;padding-top:8px}.priority,.risk{min-height:63px;border:1px solid #4c2636;background:linear-gradient(90deg,rgba(89,29,46,.35),rgba(22,24,39,.65));border-radius:11px;display:grid;grid-template-columns:38px 1fr auto;align-items:center;padding:10px}.priority:nth-child(2){border-color:#4d4625;background:linear-gradient(90deg,rgba(79,68,25,.3),rgba(21,30,34,.7))}.priority em,.risk em{width:29px;height:29px;border-radius:8px;background:#603044;display:grid;place-items:center;font-style:normal;font-weight:900}.priority b,.risk b{font-size:13px}.priority p,.risk p{font-size:10px;color:#9ca9b8;margin:3px 0}.priority small,.risk small{color:#ff8b2e;font-size:8px;font-weight:900}.priority strong{font-size:9px;color:#b8c4cf}.section-header{height:64px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #173149;padding:0 4px}.section-header h1{margin:4px 0 0;font-size:27px}.section-header p{color:#aab5c1;max-width:560px;text-align:right;font-size:12px}.table{padding-top:6px}.thead,.trow{display:grid;align-items:center;column-gap:10px}.coord-table .thead,.coord-table .trow{grid-template-columns:1.55fr .65fr .65fr .68fr .38fr .62fr 1.45fr}.store-table .thead,.store-table .trow{grid-template-columns:2fr .7fr .7fr .75fr .55fr .55fr}.thead{height:28px;padding:0 10px;color:#70839a;font-size:8px;font-weight:900;letter-spacing:.8px}.trow{min-height:55px;margin:5px 0;border-left:3px solid #4aa8ff;border-radius:10px;background:#0d1d2e;padding:7px 10px;font-size:11px}.trow.failed{border-left-color:#ff536d;background:#171a2b}.trow.waiting{border-left-color:#f1c14b;background:#161f27}.trow.delivered{border-left-color:#4bdc8a}.trow.evaluate{border-left-color:#f0c54e}.trow span:first-child{display:flex;flex-direction:column}.trow b{font-size:12px}.trow small{font-size:9px;color:#8d9bac}.store-heading{display:flex;justify-content:space-between;align-items:flex-end}.store-heading .section-header{flex:1}.tabs{display:flex;gap:7px;padding-bottom:11px}.tabs button{border:1px solid #1d344a;background:#071524;color:#8fa0b2;border-radius:12px;padding:9px 12px;font-size:9px}.tabs button.active{border-color:#ff7417;color:white;box-shadow:inset 0 -2px #ff7417}.status{font-size:9px;display:flex;align-items:center;gap:6px}.status i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}.status.delivered{color:#4bdc8a}.status.failed{color:#ff536d}.status.evaluate,.status.waiting{color:#f0c54e}.ranking-table{padding-top:5px}.rank-head,.rank-row{display:grid;grid-template-columns:26px 1.25fr 1fr .65fr .75fr .5fr;align-items:center;gap:6px}.rank-head{height:28px;font-size:8px;color:#76889d;font-weight:900}.rank-row{height:51px;padding:0 8px;margin:4px 0;background:#0d1d2e;border-radius:8px}.rank-row em{color:#ff8629;font-style:normal;font-weight:900;font-size:16px}.rank-row b{font-size:12px}.rank-row small{color:#8d9bad;font-size:9px}.rank-row span{font-size:10px;text-align:right}.rank-row .highlight{color:#54dc8f;font-weight:900}.comparison-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.compare{height:74px;border:1px solid #17334b;border-radius:12px;background:#081a2c;padding:12px;display:flex;flex-direction:column}.compare span{font-size:9px;color:#8d9bac;font-weight:900}.compare b{font-size:18px}.compare small{color:#8d9bac;font-size:9px}.compare.orange{border-color:#66350f;background:#22140e}.compare.orange b{color:#ff8428}.executive{height:60px;border:1px solid #6b3b16;border-radius:15px;background:linear-gradient(90deg,#48210d,#0b1727);display:grid;grid-template-columns:180px 1fr;align-items:center;padding:0 20px}.executive span{font-size:9px;color:#ff8428;font-weight:900;letter-spacing:1px}.executive b{font-size:21px}.three-columns{display:grid;grid-template-columns:1.14fr .92fr .84fr;gap:12px;min-height:0;flex:1}.questions{display:flex;flex-direction:column;gap:12px;padding-top:8px}.questions div{background:#0b2238;border:1px solid #173b5b;border-radius:10px;padding:13px}.questions b{font-size:22px;color:#42a5ff}.questions p{font-size:11px;color:#d0d7df}.source{font-size:8px;color:#607287}.footer{display:grid;grid-template-columns:70px 1fr auto 40px 120px;align-items:center;gap:10px;padding:0 20px;border-top:1px solid #ff7417;background:#030b14}.footer>b{color:#ff8428}.ticker{font-size:9px;color:#a7b2bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.footer nav{display:flex;gap:8px}.footer nav button{background:none;border:0;color:#6d7f92;font-size:8px;font-weight:900}.footer nav button i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#40566c;margin-right:5px}.footer nav button.active{color:white;background:#24150f;border-radius:9px;padding:9px}.footer nav button.active i{background:#ff7417;box-shadow:0 0 8px #ff7417}.footer>strong{color:#ff8428}.footer>small{font-size:8px;color:#77899c}.loading{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#030c16}.loading .brand{position:absolute;top:20px;left:20px}.loading h1{font-size:26px}.loading p{color:#93a3b4}.empty{display:grid;place-items:center;height:100%;color:#8495a7}@media(max-height:700px){.radar-shell{grid-template-rows:58px 1fr 40px}.viewport{padding-top:8px}.hero{height:125px}.kpi{height:74px}.trow{min-height:48px}.section-header{height:56px}.panel-title{height:40px}.priority,.risk{min-height:55px}}
`}</style>; }
