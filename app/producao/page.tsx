'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './page.module.css';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS || 30000);
const COORDINATOR_ORDER = ['DAIELLY', 'MARIA FERNANDA', 'MARIELEN'];
const PROJECTION_CRITICAL = 70;
const PROJECTION_ATTENTION = 90;
const DAILY_CRITICAL = 35;
const DAILY_ATTENTION = 80;

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
  conversionPendingFormatted?: string;
  monthPercent?: number;
  status?: string;
  insight?: string;
};

type Responsible = {
  name?: string;
  paidToday?: number;
  paidTodayFormatted?: string;
  productionTodayFormatted?: string;
  soldToday?: number;
  soldTodayFormatted?: string;
  dailyGoal?: number;
  dailyGoalFormatted?: string;
  dailyPercent?: Value;
  monthGoal?: number;
  monthGoalFormatted?: string;
  monthRealized?: number;
  monthRealizedFormatted?: string;
  monthPercent?: Value;
  monthAchievedPercent?: Value;
  monthProjectionPercent?: Value;
  monthProjectionAmount?: number;
  monthProjectionAmountFormatted?: string;
  monthProjectionGap?: number;
  monthProjectionGapFormatted?: string;
  monthDelta?: number;
  monthDeltaFormatted?: string;
  projectionGapFormatted?: string;
  zeroCount?: number;
  storeCount?: number;
  status?: string;
  risk?: string;
  priority?: string;
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
    soldGap?: number;
    soldGapFormatted?: string;
    conversionPending?: number;
    conversionPendingFormatted?: string;
    dailyPercent?: Value;
    monthGoal?: number;
    monthRealized?: number;
    monthPercent?: Value;
    monthAchievedPercent?: Value;
    monthProjectionPercent?: Value;
    monthProjectionAmount?: number;
    monthProjectionGap?: number;
    monthProjectionGapFormatted?: string;
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
  monthProjectionPercentNormalized: number;
  monthAchievedPercentNormalized: number;
  zeroCountNormalized: number;
  storeCountNormalized: number;
  tone: Tone;
  actionLabel: string;
  statusReason: string;
};

type Priority = {
  title: string;
  kind: 'ZERADA' | 'CONVERSÃO' | 'ABAIXO DA DIÁRIA';
  detail: string;
  responsible: string;
  impact: string;
  impactLabel: string;
  impactValue: number;
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
          <Kpi
            icon={<DollarIcon />}
            label="Pago hoje"
            value={view.paid}
            detail={<><strong>{view.dailyPercent}</strong> da diária necessária</>}
            tone={view.paidTone}
          />
          <Kpi
            icon={<CartIcon />}
            label="Vendido hoje"
            value={view.sold}
            detail={<>{view.pendingPayment} aguardam pagamento</>}
            tone="neutral"
          />
          <Kpi
            icon={<WarningIcon />}
            label="Falta hoje"
            value={view.gap}
            detail={<>{view.pendingConversion} conversão • {view.newSalesNeed} novas vendas</>}
            tone="attention"
          />
          <Kpi
            icon={<TargetIcon />}
            label="Projeção do mês"
            value={view.monthProjection}
            detail={<>{view.monthAchieved} realizado • gap proj. {view.monthProjectionGap}</>}
            tone="projection"
          />
        </section>

        <section className={styles.mainGrid}>
          <section className={styles.performancePanel}>
            <h2>Performance por coordenação</h2>
            <div className={styles.tableHeader}>
              <span>Coordenação</span>
              <span>Pago hoje / diária</span>
              <span>Ritmo do dia</span>
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
          <div><DatabaseIcon /><span>Fonte: Diária Estática + Projeção de Meta</span></div>
          <div><RefreshIcon /><span>Atualização automática</span></div>
          <span aria-hidden="true" />
          <span style={{ justifySelf: 'end', color: '#f58220', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em' }}>Visão executiva</span>
        </footer>
      </div>

      {(error || view.warning) && <div className={styles.warning}>{error || view.warning}</div>}
    </main>
  );
}

function Header({ data, view, panelTime, stale }: { data: Payload; view: ReturnType<typeof buildView>; panelTime: string; stale: boolean }) {
  const freshness = stale
    ? { label: 'Última carga válida', color: '#f04b59' }
    : loadFreshness(data.updatedAt);

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
        <small style={{ color: freshness.color }}>
          <em style={{ background: freshness.color, boxShadow: `0 0 10px ${freshness.color}99` }} />
          {freshness.label}
        </small>
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
        <b className={styles[monthTone(coordinator.monthProjectionPercentNormalized)]}>{formatPercent(coordinator.monthProjectionPercentNormalized)}</b>
        <small>{formatPercent(coordinator.monthAchievedPercentNormalized, 1)} realizado</small>
      </div>

      <div className={styles.zeroCell}>
        <b className={coordinator.zeroCountNormalized === 0 ? styles.greenText : styles[coordinator.tone]}>{coordinator.zeroCountNormalized} de {coordinator.storeCountNormalized}</b>
        <small>{coordinator.storeCountNormalized ? Math.round((coordinator.zeroCountNormalized / coordinator.storeCountNormalized) * 100) : 0}%</small>
      </div>

      <div className={styles.statusCell}>
        <span className={`${styles.statusBadge} ${styles[coordinator.tone]}`}>{toneLabel(coordinator.tone)}</span>
        <small>{coordinator.statusReason}</small>
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
        <span>{priority.kind} • {priority.detail}</span>
        <small>Responsável: {priority.responsible}</small>
      </div>
      <div className={styles.impact}><span>{priority.impactLabel}</span><b>{priority.impact}</b></div>
    </div>
  );
}

function buildView(data: Payload | null) {
  const summary = data?.summary || {};
  const goal = data?.goal || {};
  const responsibleRows = Array.isArray(data?.responsiblePerformance) ? data!.responsiblePerformance! : data?.regionalPerformance || [];
  const allowed = new Set(COORDINATOR_ORDER);
  const stores = (Array.isArray(data?.operationalStores) ? data!.operationalStores! : [])
    .filter((store) => allowed.has(norm(store.responsible)));
  const zeroStores = (Array.isArray(data?.zeroStores) ? data!.zeroStores! : [])
    .filter((store) => allowed.has(norm(store.responsible)));

  const coordinators = COORDINATOR_ORDER.map((expectedName) => responsibleRows.find((row) => norm(row.name) === expectedName))
    .filter(Boolean)
    .map((row) => buildCoordinator(row as Responsible, stores, zeroStores));

  const hasCoordinatorData = coordinators.length > 0;
  const paid = hasCoordinatorData
    ? coordinators.reduce((sum, item) => sum + Number(item.paidToday || 0), 0)
    : Number(summary.paidToday || 0);
  const sold = hasCoordinatorData
    ? coordinators.reduce((sum, item) => sum + Number(item.soldToday || 0), 0)
    : Number(summary.soldToday || 0);
  const dailyGoal = hasCoordinatorData
    ? coordinators.reduce((sum, item) => sum + Number(item.dailyGoal || 0), 0)
    : Number(goal.dailyGoal || 0);
  const monthGoal = coordinators.reduce((sum, item) => sum + Number(item.monthGoal || 0), 0) || Number(goal.monthGoal || 0);
  const monthRealized = coordinators.reduce((sum, item) => sum + Number(item.monthRealized || 0), 0) || Number(goal.monthRealized || 0);
  const hasProjectionAmounts = coordinators.length > 0 && coordinators.every((item) => Number.isFinite(Number(item.monthProjectionAmount)));
  const projectedAmount = hasProjectionAmounts
    ? coordinators.reduce((sum, item) => sum + Number(item.monthProjectionAmount || 0), 0)
    : Number(goal.monthProjectionAmount || 0);

  const dailyPercent = dailyGoal > 0 ? (paid / dailyGoal) * 100 : toPercent(goal.dailyPercent);
  const monthAchieved = monthGoal > 0 ? (monthRealized / monthGoal) * 100 : toPercent(goal.monthAchievedPercent);
  const monthProjection = monthGoal > 0 && projectedAmount > 0
    ? (projectedAmount / monthGoal) * 100
    : toPercent(goal.monthProjectionPercent ?? goal.monthPercent);
  const pending = Math.max(0, sold - paid);
  const dailyGap = Math.max(0, dailyGoal - paid);
  const newSalesNeed = Math.max(0, dailyGoal - sold);
  const projectionGap = projectedAmount > 0 && monthGoal > 0
    ? projectedAmount - monthGoal
    : Number(goal.monthProjectionGap || 0);
  const priorities = buildPriorities(zeroStores, stores);
  const rhythmLabel = paid >= dailyGoal
    ? 'DIÁRIA ENTREGUE'
    : pending > 0
      ? 'CONVERSÃO É A PRIORIDADE'
      : 'ACELERAR PRODUÇÃO';
  const rhythmDetail = paid >= dailyGoal
    ? `${money(paid)} pagos contra diária de ${money(dailyGoal)}`
    : `${money(pending)} vendidos aguardam pagamento • ${money(newSalesNeed)} ainda faltam em vendas para a diária`;

  return {
    paid: money(paid),
    sold: money(sold),
    gap: money(dailyGap),
    dailyPercent: formatPercent(dailyPercent),
    pendingPayment: moneyShort(pending),
    pendingConversion: moneyShort(Math.min(pending, dailyGap)),
    newSalesNeed: moneyShort(newSalesNeed),
    monthProjection: formatPercent(monthProjection),
    monthAchieved: formatPercent(monthAchieved, 1),
    monthProjectionGap: moneyShort(projectionGap),
    paidTone: dailyPercent >= 100 ? 'positive' as Tone : dailyPercent >= 50 ? 'attention' as Tone : 'critical' as Tone,
    rhythmLabel,
    rhythmDetail,
    coordinators,
    priorities,
    diagnosis: buildExecutiveDiagnosis(coordinators, priorities),
    warning: data?.warning || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '')
  };
}

function buildCoordinator(row: Responsible, stores: Store[], zeroStores: ZeroStore[]): CoordinatorView {
  const coordinatorStores = stores.filter((store) => norm(store.responsible) === norm(row.name));
  const paid = Number(row.paidToday || 0);
  const dailyGoal = Number(row.dailyGoal || 0);
  const monthProjectionPercentNormalized = toPercent(row.monthProjectionPercent ?? row.monthPercent);
  const monthAchievedPercentNormalized = toPercent(row.monthAchievedPercent);
  const percent = dailyGoal > 0 ? (paid / dailyGoal) * 100 : 0;
  const zeroCountNormalized = Number(row.zeroCount ?? zeroStores.filter((store) => norm(store.responsible) === norm(row.name)).length);
  const storeCountNormalized = Number(row.storeCount ?? coordinatorStores.length);
  const tone = coordinatorTone(monthProjectionPercentNormalized, zeroCountNormalized, percent);
  const statusReason = coordinatorReason(monthProjectionPercentNormalized, zeroCountNormalized, percent);

  return {
    ...row,
    percent,
    monthProjectionPercentNormalized,
    monthAchievedPercentNormalized,
    zeroCountNormalized,
    storeCountNormalized,
    tone,
    statusReason,
    actionLabel: tone === 'critical' ? 'Ação imediata' : tone === 'attention' ? 'Acompanhar' : 'Controlado'
  };
}

function coordinatorTone(projection: number, zeroCount: number, dailyPercent: number): Tone {
  if (projection < PROJECTION_CRITICAL || zeroCount >= 3 || dailyPercent < DAILY_CRITICAL) return 'critical';
  if (projection < PROJECTION_ATTENTION || zeroCount > 0 || dailyPercent < DAILY_ATTENTION) return 'attention';
  return 'positive';
}

function coordinatorReason(projection: number, zeroCount: number, dailyPercent: number) {
  if (projection < PROJECTION_CRITICAL) return 'PROJEÇÃO';
  if (zeroCount >= 3) return `${zeroCount} ZERADAS`;
  if (dailyPercent < DAILY_CRITICAL) return 'RITMO DO DIA';
  if (projection < PROJECTION_ATTENTION) return 'PROJEÇÃO';
  if (zeroCount > 0) return `${zeroCount} ${zeroCount === 1 ? 'ZERADA' : 'ZERADAS'}`;
  if (dailyPercent < 100) return 'DIÁRIA';
  return 'CONTROLADO';
}

function buildPriorities(zeroStores: ZeroStore[], stores: Store[]): Priority[] {
  const zeroNames = new Set(zeroStores.map((store) => norm(store.name)));

  const zeroPriorities: Priority[] = [...zeroStores]
    .sort((a, b) => Number(b.dailyGoal || 0) - Number(a.dailyGoal || 0))
    .map((store, index) => {
      const gap = Math.max(0, Number(store.dailyGoal || 0));
      return {
        title: String(store.name || 'Loja zerada').toUpperCase(),
        kind: 'ZERADA' as const,
        detail: 'Acionar carteira agora',
        responsible: store.responsible || 'Sem coordenação',
        impact: moneyCompact(gap),
        impactLabel: 'Gap recuperável',
        impactValue: gap,
        tone: (index === 0 ? 'critical' : index < 3 ? 'attention' : 'neutral') as Tone
      };
    });

  const conversionPriorities: Priority[] = stores
    .filter((store) => !zeroNames.has(norm(store.name)) && Number(store.conversionPending || 0) > 0 && Number(store.dailyGoal || 0) > Number(store.paidToday || 0))
    .map((store) => {
      const dailyGap = Math.max(0, Number(store.dailyGoal || 0) - Number(store.paidToday || 0));
      const pending = Math.max(0, Number(store.conversionPending || 0));
      const recoverable = Math.min(dailyGap, pending);
      return {
        store,
        priority: {
          title: String(store.name || 'Loja').toUpperCase(),
          kind: 'CONVERSÃO' as const,
          detail: `Converter ${moneyShort(pending)} já vendidos`,
          responsible: store.responsible || 'Sem coordenação',
          impact: moneyCompact(recoverable),
          impactLabel: 'Gap recuperável',
          impactValue: recoverable,
          tone: 'attention' as Tone
        }
      };
    })
    .sort((a, b) => b.priority.impactValue - a.priority.impactValue)
    .map((item) => item.priority);

  const priorityNames = new Set([...zeroPriorities, ...conversionPriorities].map((item) => norm(item.title)));
  const gapPriorities: Priority[] = stores
    .filter((store) => !priorityNames.has(norm(store.name)) && Number(store.dailyGoal || 0) > Number(store.paidToday || 0))
    .map((store) => {
      const gap = Math.max(0, Number(store.dailyGoal || 0) - Number(store.paidToday || 0));
      return {
        title: String(store.name || 'Loja').toUpperCase(),
        kind: 'ABAIXO DA DIÁRIA' as const,
        detail: 'Recuperar produção ainda hoje',
        responsible: store.responsible || 'Sem coordenação',
        impact: moneyCompact(gap),
        impactLabel: 'Gap recuperável',
        impactValue: gap,
        tone: 'neutral' as Tone
      };
    })
    .sort((a, b) => b.impactValue - a.impactValue);

  return [...zeroPriorities, ...conversionPriorities, ...gapPriorities].slice(0, 5);
}

function buildExecutiveDiagnosis(coordinators: CoordinatorView[], priorities: Priority[]) {
  const risk = [...coordinators].sort((a, b) => coordinatorRiskScore(b) - coordinatorRiskScore(a))[0];
  if (!risk) return 'Sem leitura consolidada por coordenação nesta atualização.';

  const related = priorities.filter((priority) => norm(priority.responsible) === norm(risk.name)).slice(0, 2);
  const action = related.length
    ? `Atuar primeiro em ${related.map((item) => titleCase(item.title)).join(' e ')}, com ${moneyShort(related.reduce((sum, item) => sum + item.impactValue, 0))} de gap recuperável.`
    : 'Reforçar a atuação da coordenação nas lojas abaixo da diária.';

  return `Prioridade: ${risk.name} — projeção de ${formatPercent(risk.monthProjectionPercentNormalized)}, ${formatPercent(risk.monthAchievedPercentNormalized, 1)} realizado e ${risk.zeroCountNormalized} loja(s) zerada(s). ${action}`;
}

function coordinatorRiskScore(row: CoordinatorView) {
  return Math.max(0, 100 - row.monthProjectionPercentNormalized) * 10
    + row.zeroCountNormalized * 120
    + Math.max(0, 100 - row.percent);
}

function toneLabel(tone: Tone) {
  if (tone === 'critical') return 'Crítico';
  if (tone === 'attention') return 'Atenção';
  if (tone === 'positive') return 'Controlado';
  return 'Monitorar';
}

function monthTone(percent: number): Tone {
  return percent >= 100 ? 'positive' : percent >= PROJECTION_ATTENTION ? 'attention' : 'critical';
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

function formatPercent(value: number, digits = 0) {
  return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function moneyCompact(value: Value) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(parsed);
}

function moneyShort(value: Value) {
  const parsed = Number(value || 0);
  const absolute = Math.abs(parsed);
  const sign = parsed < 0 ? '-' : '';
  if (absolute >= 1_000_000) return `${sign}R$ ${(absolute / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (absolute >= 1_000) return `${sign}R$ ${(absolute / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  return `${sign}${money(absolute)}`;
}

function normalizeHour(value?: string) {
  const raw = String(value || '').trim();
  const direct = raw.match(/(\d{1,2})h(\d{2})/i);
  if (direct) return `${direct[1].padStart(2, '0')}h${direct[2]}`;
  const colon = raw.match(/(\d{1,2}):(\d{2})/);
  return colon ? `${colon[1].padStart(2, '0')}h${colon[2]}` : '--h--';
}

function loadFreshness(value?: string): { label: string; color: string } {
  const normalized = normalizeHour(value);
  const match = normalized.match(/(\d{2})h(\d{2})/);
  if (!match) return { label: 'Horário da carga indisponível', color: '#f04b59' };

  const loadMinutes = Number(match[1]) * 60 + Number(match[2]);
  let age = currentSaoPauloMinutes() - loadMinutes;
  if (age < 0) age += 24 * 60;

  if (age <= 15) return { label: age <= 1 ? 'Dados atualizados agora' : `Dados atualizados • há ${age} min`, color: '#43c96f' };
  if (age <= 30) return { label: `Atenção à carga • há ${age} min`, color: '#f6ae10' };
  return { label: `Carga desatualizada • há ${age} min`, color: '#f04b59' };
}

function currentSaoPauloMinutes() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function currentHourLabel() {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value || '--';
  const minute = parts.find((part) => part.type === 'minute')?.value || '--';
  return `${hour}h${minute}`;
}

function titleCase(value: string) {
  return String(value || '').toLocaleLowerCase('pt-BR').replace(/(^|[\s-])([\p{L}])/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);
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
