'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './page.module.css';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS || 30000);
const COORDINATOR_ORDER = ['DAIELLY', 'MARIA FERNANDA', 'MARIELEN'];

type Tone = 'positive' | 'attention' | 'critical' | 'neutral';
type Value = number | string | null | undefined;

type Store = {
  name?: string;
  responsible?: string;
  dailyGoal?: number;
  dailyGoalFormatted?: string;
  soldToday?: number;
  soldTodayFormatted?: string;
  paidToday?: number;
  paidTodayFormatted?: string;
  paidPercent?: number;
  conversionPending?: number;
  monthPercent?: number;
};

type Responsible = {
  name?: string;
  paidToday?: number;
  paidTodayFormatted?: string;
  productionTodayFormatted?: string;
  dailyGoal?: number;
  dailyGoalFormatted?: string;
  dailyPercent?: Value;
  monthPercent?: Value;
  monthDelta?: number;
  monthDeltaFormatted?: string;
  projectionGapFormatted?: string;
  zeroCount?: number;
  storeCount?: number;
  status?: string;
};

type ZeroStore = {
  name?: string;
  responsible?: string;
  dailyGoal?: number;
  dailyGoalFormatted?: string;
};

type Payload = {
  ok: boolean;
  viewVersion?: string;
  date?: string;
  updatedAt?: string;
  summary?: {
    paidToday?: number;
    paidTodayFormatted?: string;
    productionTodayFormatted?: string;
    soldToday?: number;
    soldTodayFormatted?: string;
    conversionPending?: number;
    conversionPendingFormatted?: string;
  };
  goal?: {
    dailyGoal?: number;
    dailyGoalFormatted?: string;
    dailyGap?: number;
    dailyGapFormatted?: string;
    dailyPercent?: Value;
    monthPercent?: Value;
    projectionGapFormatted?: string;
  };
  rhythm?: { label?: string; description?: string; tone?: string };
  responsiblePerformance?: Responsible[];
  regionalPerformance?: Responsible[];
  operationalStores?: Store[];
  zeroStores?: ZeroStore[];
  aiReading?: { text?: string };
  warning?: string;
  missingData?: string[];
  message?: string;
};

type CoordinatorView = Responsible & {
  percent: number;
  monthPercentNormalized: number;
  zeroCountNormalized: number;
  storeCountNormalized: number;
  tone: Tone;
  actionLabel: string;
};

type Priority = {
  title: string;
  detail: string;
  responsible: string;
  impact: string;
  tone: Tone;
};

export default function ProducaoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const panelTime = useClock();

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch('/api/producao?refresh=1', { cache: 'no-store' });
        const payload = await response.json() as Payload;
        if (!response.ok || payload.ok === false) throw new Error(payload.message || 'API indisponível.');
        if (!active) return;
        setData(payload);
        setError('');
      } catch (requestError) {
        console.error(requestError);
        if (active) setError('Falha na atualização. Exibindo a última carga válida.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const view = useMemo(() => buildView(data), [data]);

  if (loading && !data) return <Loading text="Carregando painel executivo..." />;
  if (!data) return <Loading text="Não foi possível carregar os dados do Radar." />;

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
        <Header data={data} view={view} panelTime={panelTime} stale={Boolean(error)} />

        <section className={styles.kpis}>
          <Kpi icon={<DollarIcon />} label="Pago hoje" value={view.paid} detail={<><strong>{view.dailyPercent}</strong> da diária necessária</>} tone={view.paidTone} />
          <Kpi icon={<CartIcon />} label="Vendido hoje" value={view.sold} detail={<><strong>{view.soldComparison}</strong> contra o retrato pago</>} tone="neutral" />
          <Kpi icon={<WarningIcon />} label="Falta hoje" value={view.gap} detail={<>Necessário: <strong>{view.hourlyNeed}</strong></>} tone="attention" />
          <Kpi icon={<TargetIcon />} label="Projeção do mês" value={view.monthPercent} detail={<strong className={view.monthDeltaTone === 'positive' ? styles.greenText : styles.redText}>{view.monthDelta}</strong>} tone="projection" />
        </section>

        <section className={styles.mainGrid}>
          <section className={styles.performancePanel}>
            <h2>Performance por coordenação</h2>
            <div className={styles.tableHeader}>
              <span>Coordenação</span>
              <span>Pago hoje / diária</span>
              <span>Atingimento</span>
              <span>Projeção mensal</span>
              <span>Lojas zeradas</span>
              <span>Status</span>
            </div>
            <div className={styles.coordinatorList}>
              {view.coordinators.map((coordinator) => <CoordinatorRow key={coordinator.name} coordinator={coordinator} />)}
            </div>
          </section>

          <section className={styles.priorityPanel}>
            <h2><TargetSmallIcon /> Prioridades agora</h2>
            <div className={styles.priorityList}>
              {view.priorities.map((priority, index) => <PriorityRow key={`${priority.title}-${index}`} priority={priority} index={index} />)}
            </div>
          </section>
        </section>

        <section className={styles.diagnosis}>
          <span className={styles.diagnosisIcon}><BrainIcon /></span>
          <div><b>Diagnóstico executivo</b><p>{view.diagnosis}</p></div>
        </section>

        <footer className={styles.footer}>
          <div><DatabaseIcon /><span>Fonte: Gestão Preditiva Credvix</span></div>
          <div><RefreshIcon /><span>Atualização automática</span></div>
          <span>Tela 1 de 5</span>
          <div className={styles.progressDots}>{Array.from({ length: 7 }, (_, index) => <i key={index} className={index === 0 ? styles.activeDot : ''} />)}</div>
        </footer>
      </div>

      {(error || view.warning) && <div className={styles.warning}>{error || view.warning}</div>}
    </main>
  );
}

function Header({ data, view, panelTime, stale }: { data: Payload; view: ReturnType<typeof buildView>; panelTime: string; stale: boolean }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.wordmark}><span>CRED</span><b>VIX</b></div>
        <i />
        <div className={styles.brandTitle}><strong>Radar de produção</strong><span>Gestão comercial</span></div>
      </div>

      <div className={styles.rhythmCard}>
        <span>Ritmo da operação</span>
        <strong>{view.rhythmLabel}</strong>
        <small>{view.rhythmDetail}</small>
      </div>

      <div className={styles.timeCard}>
        <div><span>Painel</span><b><ClockIcon />{panelTime}</b></div>
        <i />
        <div><span><SignalIcon /> Última carga</span><b><RefreshIcon />{normalizeHour(data.updatedAt)}</b></div>
        <small className={stale ? styles.stale : ''}><em />{stale ? 'Última carga válida' : 'Dados atualizados'}</small>
      </div>
    </header>
  );
}

function Kpi({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: ReactNode; tone: Tone | 'projection' }) {
  return (
    <article className={`${styles.kpi} ${styles[tone]}`}>
      <span className={styles.kpiIcon}>{icon}</span>
      <div><span>{label}</span><b>{value}</b><small>{detail}</small></div>
    </article>
  );
}

function CoordinatorRow({ coordinator }: { coordinator: CoordinatorView }) {
  const width = Math.max(2, Math.min(100, coordinator.percent));
  return (
    <div className={styles.coordinatorRow}>
      <div className={styles.coordinatorName}>
        <span className={`${styles.avatar} ${styles[coordinator.tone]}`}><PersonIcon /></span>
        <b>{coordinator.name}</b>
      </div>

      <div className={styles.paidCell}>
        <b>{moneyCompact(coordinator.paidToday)} <em>/ {moneyCompact(coordinator.dailyGoal)}</em></b>
        <div className={styles.bar}><i className={styles[coordinator.tone]} style={{ width: `${width}%` }} /></div>
        <small className={styles[coordinator.tone]}>{formatPercent(coordinator.percent)} da diária</small>
      </div>

      <strong className={`${styles.achievement} ${styles[coordinator.tone]}`}>{formatPercent(coordinator.percent)}</strong>

      <div className={styles.monthCell}>
        <b className={styles[monthTone(coordinator.monthPercentNormalized)]}>{formatPercent(coordinator.monthPercentNormalized)}</b>
        <small className={Number(coordinator.monthDelta || 0) >= 0 ? styles.greenText : styles.redText}>{coordinator.monthDeltaFormatted || 'R$ 0,00'}</small>
      </div>

      <div className={styles.zeroCell}>
        <b className={coordinator.zeroCountNormalized === 0 ? styles.greenText : styles[coordinator.tone]}>{coordinator.zeroCountNormalized} de {coordinator.storeCountNormalized}</b>
        <small>{coordinator.storeCountNormalized ? Math.round((coordinator.zeroCountNormalized / coordinator.storeCountNormalized) * 100) : 0}%</small>
      </div>

      <div className={styles.statusCell}>
        <span className={`${styles.statusBadge} ${styles[coordinator.tone]}`}>{toneLabel(coordinator.tone)}</span>
        <small>{coordinator.actionLabel}</small>
      </div>
    </div>
  );
}

function PriorityRow({ priority, index }: { priority: Priority; index: number }) {
  return (
    <div className={`${styles.priorityRow} ${styles[priority.tone]}`}>
      <em>{index + 1}</em>
      <i />
      <div className={styles.priorityText}>
        <b>{priority.title}</b>
        <span>{priority.detail}</span>
        <small>Responsável: {priority.responsible}</small>
      </div>
      <div className={styles.impact}><span>Impacto diário</span><b>{priority.impact}</b></div>
    </div>
  );
}

function buildView(data: Payload | null) {
  const summary = data?.summary || {};
  const goal = data?.goal || {};
  const responsibleRows = Array.isArray(data?.responsiblePerformance) ? data!.responsiblePerformance! : data?.regionalPerformance || [];
  const stores = Array.isArray(data?.operationalStores) ? data!.operationalStores! : [];
  const zeroStores = Array.isArray(data?.zeroStores) ? data!.zeroStores! : [];

  const coordinators = COORDINATOR_ORDER.map((expectedName) => responsibleRows.find((row) => norm(row.name) === expectedName))
    .filter(Boolean)
    .map((row) => buildCoordinator(row as Responsible, stores, zeroStores));

  const paid = Number(summary.paidToday || 0);
  const sold = Number(summary.soldToday || 0);
  const dailyGoal = Number(goal.dailyGoal || 0);
  const dailyPercent = dailyGoal > 0 ? (paid / dailyGoal) * 100 : toPercent(goal.dailyPercent);
  const monthPercent = toPercent(goal.monthPercent);
  const pending = Math.max(0, sold - paid);
  const workingHoursLeft = hoursLeft();
  const dailyGap = Math.max(0, Number(goal.dailyGap || dailyGoal - paid));
  const monthDelta = String(goal.projectionGapFormatted || 'R$ 0,00');
  const soldVsPaid = paid > 0 ? ((sold - paid) / paid) * 100 : sold > 0 ? 100 : 0;

  return {
    paid: summary.paidTodayFormatted || summary.productionTodayFormatted || money(paid),
    sold: summary.soldTodayFormatted || money(sold),
    gap: goal.dailyGapFormatted || money(dailyGap),
    dailyPercent: formatPercent(dailyPercent),
    soldComparison: `${soldVsPaid >= 0 ? '+' : ''}${Math.round(soldVsPaid)}%`,
    hourlyNeed: workingHoursLeft > 0 ? `${moneyCompact(dailyGap / workingHoursLeft)}/h` : moneyCompact(dailyGap),
    monthPercent: formatPercent(monthPercent),
    monthDelta,
    monthDeltaTone: monthDelta.trim().startsWith('+') ? 'positive' : 'critical',
    paidTone: dailyPercent >= 100 ? 'positive' as Tone : dailyPercent >= 50 ? 'attention' as Tone : 'critical' as Tone,
    rhythmLabel: data?.rhythm?.label || 'ATENÇÃO',
    rhythmDetail: data?.rhythm?.description || `${money(pending)} vendidos aguardam pagamento`,
    coordinators,
    priorities: buildPriorities(zeroStores, stores),
    diagnosis: data?.aiReading?.text || deterministicDiagnosis(coordinators),
    warning: data?.warning || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '')
  };
}

function buildCoordinator(row: Responsible, stores: Store[], zeroStores: ZeroStore[]): CoordinatorView {
  const coordinatorStores = stores.filter((store) => norm(store.responsible) === norm(row.name));
  const paid = Number(row.paidToday || 0);
  const dailyGoal = Number(row.dailyGoal || 0);
  const monthPercentNormalized = toPercent(row.monthPercent);
  const percent = dailyGoal > 0 ? (paid / dailyGoal) * 100 : monthPercentNormalized >= 100 ? 100 : 0;
  const zeroCountNormalized = Number(row.zeroCount ?? zeroStores.filter((store) => norm(store.responsible) === norm(row.name)).length);
  const storeCountNormalized = Number(row.storeCount ?? coordinatorStores.length);
  const tone: Tone = monthPercentNormalized < 85 || zeroCountNormalized >= 3 || percent < 35
    ? 'critical'
    : monthPercentNormalized < 100 || zeroCountNormalized > 0 || percent < 100
      ? 'attention'
      : 'positive';

  return {
    ...row,
    percent,
    monthPercentNormalized,
    zeroCountNormalized,
    storeCountNormalized,
    tone,
    actionLabel: tone === 'critical' ? 'Ação imediata' : tone === 'attention' ? 'Acompanhar' : 'Controlado'
  };
}

function buildPriorities(zeroStores: ZeroStore[], stores: Store[]): Priority[] {
  const zeroPriorities = [...zeroStores]
    .sort((a, b) => Number(b.dailyGoal || 0) - Number(a.dailyGoal || 0))
    .map((store, index) => ({
      title: String(store.name || 'Loja zerada').toUpperCase(),
      detail: `Zerada até ${currentHourLabel()}`,
      responsible: store.responsible || 'Sem coordenação',
      impact: store.dailyGoalFormatted || money(Number(store.dailyGoal || 0)),
      tone: index === 0 ? 'critical' as Tone : index < 3 ? 'attention' as Tone : 'neutral' as Tone
    }));

  const zeroNames = new Set(zeroStores.map((store) => norm(store.name)));
  const gapPriorities = stores
    .filter((store) => !zeroNames.has(norm(store.name)) && Number(store.dailyGoal || 0) > Number(store.paidToday || 0))
    .map((store) => ({ ...store, gap: Math.max(0, Number(store.dailyGoal || 0) - Number(store.paidToday || 0)) }))
    .sort((a, b) => b.gap - a.gap)
    .map((store) => ({
      title: String(store.name || 'Loja').toUpperCase(),
      detail: `${moneyCompact(store.gap)} abaixo da diária`,
      responsible: store.responsible || 'Sem coordenação',
      impact: moneyCompact(store.gap),
      tone: 'neutral' as Tone
    }));

  return [...zeroPriorities, ...gapPriorities].slice(0, 5);
}

function deterministicDiagnosis(coordinators: CoordinatorView[]) {
  const risk = [...coordinators].sort((a, b) => {
    const aScore = (a.monthPercentNormalized < 85 ? 1000 : 0) + a.zeroCountNormalized * 100 + Math.max(0, 100 - a.monthPercentNormalized);
    const bScore = (b.monthPercentNormalized < 85 ? 1000 : 0) + b.zeroCountNormalized * 100 + Math.max(0, 100 - b.monthPercentNormalized);
    return bScore - aScore;
  })[0];
  if (!risk) return 'Sem leitura consolidada por coordenação nesta atualização.';
  return `${risk.name} concentra o maior risco do dia por projeção mensal de ${formatPercent(risk.monthPercentNormalized)} e ${risk.zeroCountNormalized} loja(s) zerada(s).`;
}

function toneLabel(tone: Tone) {
  if (tone === 'critical') return 'Crítico';
  if (tone === 'attention') return 'Atenção';
  if (tone === 'positive') return 'Controlado';
  return 'Monitorar';
}

function monthTone(percent: number): Tone {
  return percent >= 100 ? 'positive' : percent >= 85 ? 'attention' : 'critical';
}

function toPercent(value: Value) {
  const parsed = numeric(value);
  if (parsed === null) return 0;
  return Math.abs(parsed) <= 2 ? parsed * 100 : parsed;
}

function numeric(value: Value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw || /AUSENTE|SEM/i.test(raw)) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')
    : raw.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value: number) {
  return `${Math.round(value).toLocaleString('pt-BR')}%`;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function moneyCompact(value: Value) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(parsed);
}

function normalizeHour(value?: string) {
  const raw = String(value || '').trim();
  const direct = raw.match(/(\d{1,2})h(\d{2})/i);
  if (direct) return `${direct[1].padStart(2, '0')}h${direct[2]}`;
  const colon = raw.match(/(\d{1,2}):(\d{2})/);
  return colon ? `${colon[1].padStart(2, '0')}h${colon[2]}` : '--h--';
}

function hoursLeft() {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now));
  return Math.max(1, 19 - hour);
}

function currentHourLabel() {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value || '--';
  const minute = parts.find((part) => part.type === 'minute')?.value || '--';
  return `${hour}h${minute}`;
}

function norm(value?: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function useClock() {
  const [time, setTime] = useState('--h--');
  useEffect(() => {
    const update = () => setTime(currentHourLabel());
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

function Loading({ text }: { text: string }) {
  return <main className={styles.screen}><div className={styles.loading}><b>RADAR DE PRODUÇÃO</b><span>{text}</span></div></main>;
}

function Svg({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return <svg viewBox={viewBox} aria-hidden="true" focusable="false">{children}</svg>;
}
function DollarIcon() { return <Svg><path d="M12 3v18M16 7.2c-.8-1.1-2.1-1.7-4-1.7-2.4 0-4 1.2-4 3s1.4 2.7 4.2 3.4c2.6.6 3.8 1.5 3.8 3.3 0 2-1.8 3.3-4.4 3.3-2 0-3.6-.7-4.6-2" /></Svg>; }
function CartIcon() { return <Svg><path d="M3 4h2l2.2 10.2h9.9l2-7.2H6.1M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></Svg>; }
function WarningIcon() { return <Svg><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></Svg>; }
function TargetIcon() { return <Svg><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M15 9 21 3m-4 0h4v4" /></Svg>; }
function TargetSmallIcon() { return <span className={styles.titleIcon}><TargetIcon /></span>; }
function ClockIcon() { return <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></Svg>; }
function RefreshIcon() { return <Svg><path d="M20 7v5h-5M4 17v-5h5M6.1 8A7 7 0 0 1 18.4 6.4L20 8M4 16l1.6 1.6A7 7 0 0 0 17.9 16" /></Svg>; }
function SignalIcon() { return <Svg><path d="M4 10a11 11 0 0 1 16 0M7 13a7 7 0 0 1 10 0M10 16a3 3 0 0 1 4 0" /><circle cx="12" cy="19" r="1" /></Svg>; }
function PersonIcon() { return <Svg><circle cx="12" cy="8" r="4" fill="currentColor" stroke="none" /><path d="M4.5 21c.6-5 3-7.5 7.5-7.5s6.9 2.5 7.5 7.5" fill="currentColor" stroke="none" /></Svg>; }
function BrainIcon() { return <Svg><path d="M9.5 4.5A3 3 0 0 0 5 7v1a3 3 0 0 0-1 5.2A3 3 0 0 0 7 18h1.2M14.5 4.5A3 3 0 0 1 19 7v1a3 3 0 0 1 1 5.2A3 3 0 0 1 17 18h-1.2M9.5 4.5v15m5-15v15M7 9.5h2.5m5 0H17M7.5 15h2m5 0h2" /></Svg>; }
function DatabaseIcon() { return <Svg><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Svg>; }
