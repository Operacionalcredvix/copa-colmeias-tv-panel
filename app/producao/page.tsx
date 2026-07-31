'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './page.module.css';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS || 30000);
const ROTATE_MS = Number(process.env.NEXT_PUBLIC_ROTATE_MS || 22000);

type Tone = 'positive' | 'attention' | 'critical' | 'neutral';
type Value = number | string | null | undefined;
type Store = { name?: string; responsible?: string; dailyGoal?: number; dailyGoalFormatted?: string; soldToday?: number; soldTodayFormatted?: string; paidToday?: number; paidTodayFormatted?: string; paidGap?: number | null; paidGapFormatted?: string; soldPercent?: number | null; paidPercent?: number | null; conversionPending?: number; conversionPendingFormatted?: string; monthGoal?: number; monthGoalFormatted?: string; monthRealized?: number; monthRealizedFormatted?: string; monthPercent?: number | null; status?: string };
type Responsible = { name?: string; productionToday?: number; productionTodayFormatted?: string; soldToday?: number; soldTodayFormatted?: string; paidToday?: number; paidTodayFormatted?: string; dailyGoal?: number; dailyGoalFormatted?: string; dailyGapFormatted?: string; dailyPercent?: Value; monthGoalFormatted?: string; monthRealizedFormatted?: string; projectionFormatted?: string; projectionGapFormatted?: string; monthPercent?: Value; diagnosis?: string; priority?: string; risk?: string };
type StructuredItem = { title?: string; detail?: string; responsible?: string; severity?: Tone };
type AiReading = { status?: string; generatedAt?: string; structured?: { headline?: string; executiveSummary?: string; priority?: string; actions?: StructuredItem[]; risks?: StructuredItem[] } };
type Payload = { ok: boolean; version?: string; viewVersion?: string; date?: string; updatedAt?: string; summary?: { contractsToday?: number; productionTodayFormatted?: string; paidTodayFormatted?: string; soldTodayFormatted?: string; conversionPendingFormatted?: string; activeStores?: number; totalStores?: number; zeroStores?: number }; goal?: { dailyGoalFormatted?: string; dailyGapFormatted?: string; dailyPercent?: Value; soldPercent?: Value; projectionFormatted?: string; projectionGapFormatted?: string; monthPercent?: Value }; rhythm?: { label?: string; description?: string; tone?: string }; responsiblePerformance?: Responsible[]; regionalPerformance?: Responsible[]; operationalStores?: Store[]; aiReading?: AiReading; warning?: string; detailWarning?: string; missingData?: string[]; message?: string };
type AiPayload = { ok?: boolean; ai?: AiReading };
type CoordinatorView = Responsible & { stores: Store[]; zeroCount: number; tone: Tone; score: number };

export default function ProducaoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [ai, setAi] = useState<AiReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [screenIndex, setScreenIndex] = useState(0);
  const panelTime = useClock();

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch('/api/producao-v2?refresh=1', { cache: 'no-store' });
        const payload = await response.json() as Payload;
        if (!alive) return;
        if (!payload.ok) throw new Error(payload.message || 'API operacional indisponível.');
        setData(payload); setError('');
      } catch (err) {
        console.error(err);
        if (alive) setError(err instanceof Error ? err.message : 'Falha ao carregar o radar.');
      } finally { if (alive) setLoading(false); }
    }
    load(); const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadAi() {
      try {
        const response = await fetch('/api/producao?mode=ai&refresh=1', { cache: 'no-store' });
        const payload = await response.json() as AiPayload;
        if (alive && payload.ai) setAi(payload.ai);
      } catch (err) { console.error(err); }
    }
    loadAi(); const timer = window.setInterval(loadAi, 300000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const model = useMemo(() => buildModel(data, ai), [data, ai]);
  const totalScreens = 2 + model.coordinators.length;

  useEffect(() => {
    const timer = window.setInterval(() => setScreenIndex((current) => (current + 1) % Math.max(1, totalScreens)), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [totalScreens]);

  useEffect(() => { if (screenIndex >= totalScreens) setScreenIndex(0); }, [screenIndex, totalScreens]);

  if (loading && !data) return <Loading text="Carregando painel executivo..." />;
  if (!data) return <Loading text={error || 'Dados indisponíveis.'} />;

  const coordinatorIndex = screenIndex - 1;
  const currentCoordinator = coordinatorIndex >= 0 && coordinatorIndex < model.coordinators.length ? model.coordinators[coordinatorIndex] : null;

  return <main className={styles.screen}>
    <div className={styles.shell}>
      <Header data={data} model={model} panelTime={panelTime} />
      <section className={styles.body}>
        {screenIndex === 0 && <ExecutiveView model={model} />}
        {currentCoordinator && <CoordinatorScreen coordinator={currentCoordinator} ai={model.ai} />}
        {screenIndex === totalScreens - 1 && <ExceptionsView model={model} />}
      </section>
      <Footer current={screenIndex} total={totalScreens} version={data.viewVersion || data.version || 'RADAR V2'} />
    </div>
    {(error || model.warning) && <div className={styles.warning}>{error || model.warning}</div>}
  </main>;
}

function Header({ data, model, panelTime }: { data: Payload; model: ReturnType<typeof buildModel>; panelTime: string }) {
  return <header className={styles.header}>
    <div className={styles.brand}><div className={styles.logo}>VX</div><div><b>RADAR DE PRODUÇÃO</b><span>CREDVIX · GESTÃO COMERCIAL</span></div></div>
    <div className={styles.rhythm}><span className={styles.eyebrow}>Ritmo da operação</span><strong>{model.rhythmLabel}</strong><small>{model.rhythmDescription}</small></div>
    <div className={styles.statusbar}><div className={styles.clock}><span>Painel</span><b>{panelTime}</b></div><div className={styles.clock}><span>Última carga</span><b>{normalizeHour(data.updatedAt)}</b></div><div className={styles.statusline}><span><i className={styles.dot} />Dados atualizados</span><span>{data.date || '--/--/----'}</span></div></div>
  </header>;
}

function ExecutiveView({ model }: { model: ReturnType<typeof buildModel> }) {
  return <div className={styles.view}>
    <div className={styles.kpis}><Kpi label="Pago hoje" value={model.paid} detail={`${model.paidPercent} da diária`} tone={model.paidTone} /><Kpi label="Vendido hoje" value={model.sold} detail={`${model.pending} aguardando conversão`} tone="accent" /><Kpi label="Falta hoje" value={model.gap} detail={model.gapDetail} tone={model.gapTone} /><Kpi label="Projeção do mês" value={model.projection} detail={model.projectionGap} tone={model.projectionTone} /></div>
    <div className={styles.mainGrid}>
      <Panel title="Performance por coordenação" subtitle="Ordenado por prioridade comercial"><div className={styles.coordList}>{model.coordinators.slice(0, 6).map((coordinator) => <CoordinatorRow key={coordinator.name} coordinator={coordinator} />)}</div></Panel>
      <Panel title="Prioridades agora" subtitle="Até cinco ações"><div className={styles.priorityList}>{model.priorities.slice(0, 5).map((priority, index) => <div className={styles.priority} key={`${priority.title}-${index}`}><em>{index + 1}</em><div><b>{priority.title}</b><span>{priority.detail}</span><small>{priority.responsible}</small></div></div>)}</div><div className={styles.diagnosis}><b>Diagnóstico:</b> {model.diagnosis}</div></Panel>
    </div>
  </div>;
}

function CoordinatorRow({ coordinator }: { coordinator: CoordinatorView }) {
  const percent = numeric(coordinator.dailyPercent) ?? 0;
  return <div className={`${styles.coordRow} ${styles[coordinator.tone]}`}><div className={styles.coordName}><b>{coordinator.name || 'Sem coordenação'}</b><small>{coordinator.zeroCount} zeradas · {coordinator.stores.length} lojas</small></div><div className={styles.progress}><div className={styles.bar}><i style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} /></div><small><span>{formatPercent(percent)}</span><span>{short(coordinator.dailyGoalFormatted, 'Sem diária')}</span></small></div><div className={styles.metric}><b>{coordinator.paidTodayFormatted || coordinator.productionTodayFormatted || 'R$ 0'}</b><small>pago hoje</small></div><div className={styles.metric}><b>{coordinator.projectionGapFormatted || 'Sem projeção'}</b><small>gap projeção</small></div><span className={`${styles.pill} ${styles[coordinator.tone]}`}>{toneLabel(coordinator.tone)}</span></div>;
}

function CoordinatorScreen({ coordinator, ai }: { coordinator: CoordinatorView; ai: AiReading | null }) {
  const actions = coordinatorActions(coordinator, ai); const percent = numeric(coordinator.dailyPercent) ?? 0; const stores = [...coordinator.stores].sort(storePriority).slice(0, 8);
  return <div className={styles.coordinatorView}>
    <div className={styles.coordHero}><div><span>Detalhe operacional</span><h1>COORDENAÇÃO {coordinator.name}</h1></div><p>{coordinator.diagnosis || `${coordinator.zeroCount} lojas zeradas e ${formatPercent(percent)} da diária paga.`}</p></div>
    <div className={styles.kpis}><Kpi label="Pago hoje" value={coordinator.paidTodayFormatted || coordinator.productionTodayFormatted || 'R$ 0'} detail={`${formatPercent(percent)} da diária`} tone={coordinator.tone} /><Kpi label="Diária necessária" value={short(coordinator.dailyGoalFormatted, 'Sem diária')} detail={`Gap ${short(coordinator.dailyGapFormatted, 'Sem gap')}`} tone="accent" /><Kpi label="Projeção mensal" value={coordinator.projectionFormatted || short(coordinator.monthPercent, 'Sem projeção')} detail={short(coordinator.projectionGapFormatted, 'Sem gap mensal')} tone={coordinator.tone} /><Kpi label="Lojas zeradas" value={`${coordinator.zeroCount}`} detail={`${coordinator.stores.length} lojas na coordenação`} tone={coordinator.zeroCount ? 'critical' : 'positive'} /></div>
    <div className={styles.coordGrid}><Panel title="Desempenho das lojas" subtitle="Críticas primeiro"><div className={styles.storeTable}><div className={styles.storeHead}><span>Loja</span><span>Pago</span><span>Diária</span><span>Gap</span><span>%</span><span>Status</span></div>{stores.map((store) => <StoreRow key={store.name} store={store} />)}</div></Panel><Panel title="Ações da coordenação" subtitle="Intervenção recomendada"><div className={styles.actions}>{actions.map((action, index) => <div className={`${styles.action} ${styles[action.tone]}`} key={`${action.title}-${index}`}><b>{index + 1}. {action.title}</b><span>{action.detail}</span></div>)}</div><div className={styles.diagnosis}><b>Leitura:</b> {coordinatorInsight(coordinator)}</div></Panel></div>
  </div>;
}

function StoreRow({ store }: { store: Store }) {
  const percent = store.paidPercent ?? 0; const tone = storeTone(store);
  return <div className={styles.storeRow}><b>{store.name}</b><span>{store.paidTodayFormatted || 'R$ 0'}</span><span>{short(store.dailyGoalFormatted, 'Sem diária')}</span><strong>{short(store.paidGapFormatted, 'Sem gap')}</strong><div><div className={styles.miniBar}><i style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} /></div></div><span className={`${styles.pill} ${styles[tone]}`}>{storeStatus(store)}</span></div>;
}

function ExceptionsView({ model }: { model: ReturnType<typeof buildModel> }) {
  return <div className={styles.exceptions}><div className={styles.exceptionsHeader}><div><span>Leitura orientada à ação</span><h1>EXCEÇÕES E OPORTUNIDADES</h1></div><span>{model.stores.length} lojas analisadas</span></div><div className={styles.exceptionGrid}><Exception title="Lojas zeradas" items={model.zeroStores.slice(0, 5).map((store) => ({ store, value: 'R$ 0', detail: `${store.responsible} · diária ${short(store.dailyGoalFormatted, 'não cadastrada')}` }))} /><Exception title="Vendido sem conversão" items={model.conversionStores.slice(0, 5).map((store) => ({ store, value: store.conversionPendingFormatted || 'R$ 0', detail: `Vendido ${store.soldTodayFormatted} · pago ${store.paidTodayFormatted}` }))} /><Exception title="Próximas de entregar" items={model.nearStores.slice(0, 5).map((store) => ({ store, value: store.paidGapFormatted || 'R$ 0', detail: `${store.paidPercent || 0}% da diária · ${store.responsible}` }))} /><Exception title="Maiores gaps" items={model.gapStores.slice(0, 5).map((store) => ({ store, value: store.paidGapFormatted || 'R$ 0', detail: `${store.responsible} · pago ${store.paidTodayFormatted}` }))} /></div></div>;
}

function Exception({ title, items }: { title: string; items: { store: Store; value: string; detail: string }[] }) { return <section className={styles.exception}><h2>{title}</h2><div className={styles.exceptionList}>{items.length ? items.map(({ store, value, detail }) => <div className={styles.exceptionItem} key={store.name}><b>{store.name}</b><span>{value}</span><small>{detail}</small></div>) : <div className={styles.exceptionItem}><b>Nenhuma ocorrência</b><span>OK</span><small>Sem itens nesta categoria.</small></div>}</div></section>; }
function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone | 'accent' }) { return <div className={`${styles.kpi} ${styles[tone]}`}><span>{label}</span><b>{value}</b><small>{detail}</small></div>; }
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) { return <section className={styles.panel}><div className={styles.panelTitle}><h2>{title}</h2><span>{subtitle}</span></div>{children}</section>; }
function Footer({ current, total, version }: { current: number; total: number; version: string }) { return <footer className={styles.footer}><b>CREDVIX</b><span>Fonte: Gestão Preditiva · atualização automática</span><div className={styles.dots}>{Array.from({ length: total }, (_, index) => <i key={index} className={index === current ? styles.active : ''} />)}</div><span>{version}</span></footer>; }
function Loading({ text }: { text: string }) { return <main className={styles.screen}><div className={styles.loading}><div><b>RADAR DE PRODUÇÃO</b><span>{text}</span></div></div></main>; }

function buildModel(data: Payload | null, ai: AiReading | null) {
  const summary = data?.summary || {}; const goal = data?.goal || {}; const stores = Array.isArray(data?.operationalStores) ? data!.operationalStores! : []; const responsibleRows = Array.isArray(data?.responsiblePerformance) ? data!.responsiblePerformance! : data?.regionalPerformance || []; const storeByResponsible = groupBy(stores, (store) => norm(store.responsible));
  const coordinators = responsibleRows.map((row) => { const coordinatorStores = storeByResponsible[norm(row.name)] || []; const zeroCount = coordinatorStores.filter((store) => (store.soldToday || 0) <= 0 && (store.paidToday || 0) <= 0).length; const percent = numeric(row.dailyPercent) ?? paidPercentFromStores(coordinatorStores); const projectionNegative = isNegative(row.projectionGapFormatted); const tone: Tone = projectionNegative || zeroCount >= 3 || percent < 45 ? 'critical' : zeroCount > 0 || percent < 90 ? 'attention' : 'positive'; const score = (projectionNegative ? -1000 : 0) - zeroCount * 100 + percent; return { ...row, dailyPercent: percent, stores: coordinatorStores, zeroCount, tone, score }; }).sort((a, b) => a.score - b.score);
  const zeroStores = stores.filter((store) => (store.soldToday || 0) <= 0 && (store.paidToday || 0) <= 0); const conversionStores = stores.filter((store) => (store.conversionPending || 0) > 0).sort((a, b) => (b.conversionPending || 0) - (a.conversionPending || 0)); const nearStores = stores.filter((store) => (store.paidGap || 0) > 0 && ((store.paidGap || 0) <= 3000 || (store.paidPercent || 0) >= 80)).sort((a, b) => (a.paidGap || 0) - (b.paidGap || 0)); const gapStores = stores.filter((store) => (store.paidGap || 0) > 0).sort((a, b) => (b.paidGap || 0) - (a.paidGap || 0)); const paidPercent = numeric(goal.dailyPercent) ?? 0; const projectionPercent = numeric(goal.monthPercent); const projectionGap = short(goal.projectionGapFormatted, 'Sem gap projetado'); const projectionTone: Tone = isNegative(goal.projectionGapFormatted) || (projectionPercent !== null && projectionPercent < 90) ? 'critical' : projectionPercent !== null && projectionPercent < 100 ? 'attention' : 'positive'; const activeAi = ai?.structured ? ai : data?.aiReading || null; const priorities = buildPriorities(activeAi, coordinators, zeroStores, conversionStores, nearStores);
  return { paid: summary.paidTodayFormatted || summary.productionTodayFormatted || 'R$ 0', sold: summary.soldTodayFormatted || 'R$ 0', pending: summary.conversionPendingFormatted || 'R$ 0', gap: short(goal.dailyGapFormatted, 'Sem diária'), projection: short(goal.projectionFormatted, projectionPercent !== null ? `${projectionPercent}%` : 'Sem projeção'), projectionGap, paidPercent: formatPercent(paidPercent), paidTone: toneFromPercent(paidPercent), gapTone: paidPercent < 50 ? 'critical' as Tone : paidPercent < 90 ? 'attention' as Tone : 'positive' as Tone, projectionTone, gapDetail: `${summary.activeStores || 0}/${summary.totalStores || stores.length} lojas ativas`, rhythmLabel: data?.rhythm?.label || 'RITMO INDETERMINADO', rhythmDescription: data?.rhythm?.description || 'Sem leitura confiável para o horário.', coordinators, stores, zeroStores, conversionStores, nearStores, gapStores, priorities, diagnosis: activeAi?.structured?.executiveSummary || deterministicDiagnosis(coordinators, zeroStores, conversionStores), ai: activeAi, warning: data?.detailWarning || data?.warning || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '') };
}

function buildPriorities(ai: AiReading | null, coordinators: CoordinatorView[], zeroStores: Store[], conversions: Store[], near: Store[]) { const aiActions = ai?.structured?.actions || []; if (aiActions.length) return aiActions.slice(0, 5).map((action) => ({ title: action.title || 'Ação recomendada', detail: action.detail || '', responsible: action.responsible || 'Gestão comercial' })); const out: { title: string; detail: string; responsible: string }[] = []; coordinators.filter((item) => item.tone === 'critical').slice(0, 2).forEach((item) => out.push({ title: item.name || 'Coordenação crítica', detail: `${item.zeroCount} zeradas e ${formatPercent(numeric(item.dailyPercent) || 0)} da diária.`, responsible: item.name || 'Coordenação' })); zeroStores.slice(0, 2).forEach((store) => out.push({ title: store.name || 'Loja zerada', detail: 'Sem vendido e sem pago nesta atualização.', responsible: store.responsible || 'Sem coordenação' })); conversions.slice(0, 1).forEach((store) => out.push({ title: store.name || 'Conversão pendente', detail: `${store.conversionPendingFormatted} vendidos ainda não convertidos em pago.`, responsible: store.responsible || 'Sem coordenação' })); near.slice(0, 1).forEach((store) => out.push({ title: store.name || 'Próxima da diária', detail: `Faltam ${store.paidGapFormatted} para entregar.`, responsible: store.responsible || 'Sem coordenação' })); return out.slice(0, 5); }
function coordinatorActions(coordinator: CoordinatorView, ai: AiReading | null) { const aiActions = (ai?.structured?.actions || []).filter((action) => norm(action.responsible) === norm(coordinator.name)); if (aiActions.length) return aiActions.slice(0, 3).map((action) => ({ title: action.title || 'Ação', detail: action.detail || '', tone: action.severity || 'attention' })); return [...coordinator.stores].sort(storePriority).slice(0, 3).map((store) => { if ((store.soldToday || 0) <= 0) return { title: store.name || 'Loja zerada', detail: 'Sem vendido e sem pago. Acionar supervisor e definir plano de produção.', tone: 'critical' as Tone }; if ((store.conversionPending || 0) > 0) return { title: store.name || 'Conversão pendente', detail: `Revisar propostas: ${store.conversionPendingFormatted} ainda aguardam pagamento.`, tone: 'attention' as Tone }; return { title: store.name || 'Oportunidade', detail: `Faltam ${store.paidGapFormatted} para entregar a diária.`, tone: 'positive' as Tone }; }); }
function coordinatorInsight(coordinator: CoordinatorView) { const totalGap = coordinator.stores.reduce((sum, store) => sum + Number(store.paidGap || 0), 0); const topGap = [...coordinator.stores].sort((a, b) => Number(b.paidGap || 0) - Number(a.paidGap || 0)).slice(0, 4).reduce((sum, store) => sum + Number(store.paidGap || 0), 0); const concentration = totalGap ? Math.round((topGap / totalGap) * 100) : 0; return totalGap ? `${concentration}% do gap está concentrado nas quatro lojas mais críticas.` : 'A diária está entregue; priorizar projeção mensal e superação.'; }
function deterministicDiagnosis(coordinators: CoordinatorView[], zeroStores: Store[], conversions: Store[]) { const priority = coordinators[0]; if (priority) return `${priority.name} concentra o maior risco: ${priority.zeroCount} lojas zeradas e ${formatPercent(numeric(priority.dailyPercent) || 0)} da diária.`; if (zeroStores.length) return `${zeroStores.length} lojas seguem zeradas e exigem acionamento nominal.`; if (conversions.length) return `${conversions.length} lojas possuem venda aguardando conversão em pago.`; return 'Operação sem exceções críticas nesta atualização.'; }
function storePriority(a: Store, b: Store) { const rank = (store: Store) => store.status === 'ZERADA' ? 0 : store.status === 'SEM_PAGO' ? 1 : store.status === 'ATENCAO' ? 2 : store.status === 'PROXIMA' ? 3 : 4; return rank(a) - rank(b) || Number(b.paidGap || 0) - Number(a.paidGap || 0); }
function storeTone(store: Store): Tone { if (store.status === 'ZERADA' || store.status === 'SEM_PAGO') return 'critical'; if (store.status === 'ATENCAO' || store.status === 'PROXIMA') return 'attention'; if (store.status === 'ENTREGUE') return 'positive'; return 'neutral'; }
function storeStatus(store: Store) { const labels: Record<string, string> = { ZERADA: 'zerada', SEM_PAGO: 'sem pago', ATENCAO: 'atenção', PROXIMA: 'próxima', ENTREGUE: 'entregue', SEM_META: 'sem meta' }; return labels[store.status || ''] || 'monitorar'; }
function toneFromPercent(percent: number): Tone { return percent >= 100 ? 'positive' : percent >= 70 ? 'attention' : 'critical'; }
function toneLabel(tone: Tone) { return tone === 'positive' ? 'controlado' : tone === 'attention' ? 'atenção' : tone === 'critical' ? 'crítico' : 'monitorar'; }
function paidPercentFromStores(stores: Store[]) { const goal = stores.reduce((sum, store) => sum + Number(store.dailyGoal || 0), 0); const paid = stores.reduce((sum, store) => sum + Number(store.paidToday || 0), 0); return goal ? Math.round((paid / goal) * 100) : 0; }
function groupBy<T>(items: T[], key: (item: T) => string) { return items.reduce<Record<string, T[]>>((acc, item) => { const value = key(item); (acc[value] ||= []).push(item); return acc; }, {}); }
function numeric(value: Value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function isNegative(value: Value) { return /^-/.test(String(value || '').trim()); }
function short(value: Value, fallback: string) { const text = String(value ?? '').trim(); return !text || text.includes('DADO AUSENTE') ? fallback : text; }
function formatPercent(value: number) { return `${Math.round(value)}%`; }
function norm(value: Value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); }
function normalizeHour(value: Value) { const match = String(value || '').match(/(\d{1,2})[:h](\d{2})/); return match ? `${match[1].padStart(2, '0')}h${match[2]}` : '--h--'; }
function useClock() { const [time, setTime] = useState(now()); useEffect(() => { const timer = window.setInterval(() => setTime(now()), 30000); return () => window.clearInterval(timer); }, []); return time; }
function now() { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', 'h'); }
