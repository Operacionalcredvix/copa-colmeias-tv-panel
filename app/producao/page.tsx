'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './page.module.css';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 30000);
const AI_POLL_MS = Number(process.env.NEXT_PUBLIC_AI_POLL_MS ?? 300000);

type Value = number | string | null | undefined;
type Tone = 'positive' | 'attention' | 'critical' | 'neutral';

type Summary = {
  paidTodayFormatted?: string;
  productionTodayFormatted?: string;
  soldTodayFormatted?: string;
  conversionPendingFormatted?: string;
  activeStores?: number;
  totalStores?: number;
};

type Goal = {
  dailyGoalFormatted?: string;
  dailyGapFormatted?: string;
  dailyPercent?: Value;
  monthPercent?: Value;
  projectionFormatted?: string;
  projectionGapFormatted?: string;
};

type Responsible = {
  name?: string;
  productionTodayFormatted?: string;
  paidTodayFormatted?: string;
  dailyGoalFormatted?: string;
  dailyGapFormatted?: string;
  dailyPercent?: Value;
  monthPercent?: Value;
  projectionFormatted?: string;
  projectionGapFormatted?: string;
  diagnosis?: string;
  priority?: string;
  risk?: string;
};

type ZeroStore = {
  name?: string;
  responsible?: string;
  dailyGoalFormatted?: string;
};

type AiAction = {
  title?: string;
  detail?: string;
  responsible?: string;
  severity?: 'critical' | 'attention' | 'normal';
};

type AiReading = {
  status?: string;
  generatedAt?: string;
  structured?: {
    headline?: string;
    executiveSummary?: string;
    priority?: string;
    actions?: AiAction[];
  };
};

type Payload = {
  ok: boolean;
  version?: string;
  date?: string;
  updatedAt?: string;
  summary?: Summary;
  goal?: Goal;
  rhythm?: { label?: string; description?: string; tone?: string };
  responsiblePerformance?: Responsible[];
  regionalPerformance?: Responsible[];
  zeroStores?: ZeroStore[];
  aiReading?: AiReading;
  missingData?: string[];
  warning?: string;
  diagnostics?: { warning?: string };
};

type CoordinatorView = Responsible & {
  zeroCount: number;
  percent: number | null;
  tone: Tone;
  score: number;
};

type Priority = {
  title: string;
  detail: string;
  responsible: string;
  tone: Tone;
};

export default function ProducaoPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [ai, setAi] = useState<AiReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const panelTime = useClock();

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch('/api/producao?refresh=1', { cache: 'no-store' });
        const payload = await response.json() as Payload;
        if (!response.ok || payload.ok === false) throw new Error('API de produção indisponível.');
        if (!alive) return;
        setData(payload);
        setError('');
      } catch (requestError) {
        console.error(requestError);
        if (alive) setError('Falha na atualização. Exibindo a última carga válida.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadAi() {
      try {
        const response = await fetch('/api/producao?mode=ai&refresh=1', { cache: 'no-store' });
        const payload = await response.json() as { ai?: AiReading };
        if (alive && payload.ai) setAi(payload.ai);
      } catch (requestError) {
        console.error(requestError);
      }
    }

    loadAi();
    const timer = window.setInterval(loadAi, AI_POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const view = useMemo(() => buildView(data, ai), [data, ai]);

  if (loading && !data) return <Loading text="Carregando painel executivo..." />;
  if (!data) return <Loading text="Não foi possível carregar os dados do Radar." />;

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
        <Header data={data} view={view} panelTime={panelTime} stale={Boolean(error)} />

        <section className={styles.kpis}>
          <Kpi icon="R$" label="Pago hoje" value={view.paid} detail={`${view.dailyPercentLabel} da diária necessária`} tone={view.dailyTone} />
          <Kpi icon="↗" label="Vendido hoje" value={view.sold} detail={`${view.pending} aguardando pagamento`} tone="neutral" />
          <Kpi icon="!" label="Falta hoje" value={view.dailyGap} detail={`Meta diária: ${view.dailyGoal}`} tone={view.dailyTone} />
          <Kpi icon="◎" label="Projeção do mês" value={view.projection} detail={view.projectionGap} tone={view.projectionTone} />
        </section>

        <section className={styles.mainGrid}>
          <Panel title="Performance por coordenação">
            <div className={styles.tableHeader}>
              <span>Coordenação</span><span>Pago hoje / diária</span><span>Atingimento</span><span>Projeção mensal</span><span>Lojas zeradas</span><span>Status</span>
            </div>
            <div className={styles.coordinatorList}>
              {view.coordinators.map((coordinator) => <CoordinatorRow key={coordinator.name} coordinator={coordinator} />)}
            </div>
          </Panel>

          <Panel title="Prioridades agora" compact>
            <div className={styles.priorityList}>
              {view.priorities.map((priority, index) => <PriorityRow key={`${priority.title}-${index}`} priority={priority} index={index} />)}
            </div>
          </Panel>
        </section>

        <section className={styles.diagnosis}>
          <span className={styles.diagnosisIcon}>IA</span>
          <div><b>Diagnóstico executivo</b><p>{view.diagnosis}</p></div>
        </section>

        <footer className={styles.footer}>
          <span>Fonte: Gestão Preditiva Credvix</span>
          <span>Atualização automática</span>
          <span>RADAR V1.5</span>
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
        <div className={styles.logo}>VX</div>
        <div><b>RADAR DE PRODUÇÃO</b><span>Credvix · Gestão Comercial</span></div>
      </div>

      <div className={styles.rhythm}>
        <span>Ritmo da operação</span>
        <strong>{view.rhythmLabel}</strong>
        <small>{view.rhythmDescription}</small>
      </div>

      <div className={styles.timeArea}>
        <div className={styles.timeCard}><span>Painel</span><b>{panelTime}</b></div>
        <div className={styles.timeCard}><span>Última carga</span><b>{normalizeHour(data.updatedAt)}</b></div>
        <div className={`${styles.loadStatus} ${stale ? styles.stale : ''}`}><i />{stale ? 'Última carga válida' : 'Dados atualizados'}<span>{data.date || '--/--/----'}</span></div>
      </div>
    </header>
  );
}

function Kpi({ icon, label, value, detail, tone }: { icon: string; label: string; value: string; detail: string; tone: Tone }) {
  return (
    <article className={`${styles.kpi} ${styles[tone]}`}>
      <span className={styles.kpiIcon}>{icon}</span>
      <div><span>{label}</span><b>{value}</b><small>{detail}</small></div>
    </article>
  );
}

function Panel({ title, compact = false, children }: { title: string; compact?: boolean; children: ReactNode }) {
  return <section className={`${styles.panel} ${compact ? styles.compact : ''}`}><h2>{title}</h2>{children}</section>;
}

function CoordinatorRow({ coordinator }: { coordinator: CoordinatorView }) {
  const width = coordinator.percent === null ? 0 : Math.max(3, Math.min(100, coordinator.percent));
  return (
    <div className={styles.coordinatorRow}>
      <div className={styles.coordinatorName}><span className={`${styles.avatar} ${styles[coordinator.tone]}`}>●</span><b>{coordinator.name || 'Sem coordenação'}</b></div>
      <div className={styles.paidCell}>
        <b>{coordinator.paidTodayFormatted || coordinator.productionTodayFormatted || 'R$ 0,00'} <em>/ {short(coordinator.dailyGoalFormatted, 'Sem diária')}</em></b>
        <div className={styles.progress}><i className={styles[coordinator.tone]} style={{ width: `${width}%` }} /></div>
      </div>
      <strong className={styles.percent}>{formatPercent(coordinator.percent)}</strong>
      <div className={styles.projectionCell}><b>{projectionLabel(coordinator)}</b><small>{short(coordinator.projectionGapFormatted, 'Sem gap projetado')}</small></div>
      <div className={styles.zeroCell}><b>{coordinator.zeroCount}</b><small>loja(s)</small></div>
      <span className={`${styles.status} ${styles[coordinator.tone]}`}>{toneLabel(coordinator.tone)}</span>
    </div>
  );
}

function PriorityRow({ priority, index }: { priority: Priority; index: number }) {
  return (
    <div className={`${styles.priorityRow} ${styles[priority.tone]}`}>
      <em>{index + 1}</em>
      <div><b>{priority.title}</b><span>{priority.detail}</span><small>Responsável: {priority.responsible}</small></div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return <main className={styles.screen}><div className={styles.loading}><b>RADAR DE PRODUÇÃO</b><span>{text}</span></div></main>;
}

function buildView(data: Payload | null, ai: AiReading | null) {
  const summary = data?.summary || {};
  const goal = data?.goal || {};
  const responsibleRows = Array.isArray(data?.responsiblePerformance) ? data!.responsiblePerformance! : data?.regionalPerformance || [];
  const zeroStores = Array.isArray(data?.zeroStores) ? data!.zeroStores! : [];
  const zeroByResponsible = countZeroStores(zeroStores);

  const coordinators: CoordinatorView[] = responsibleRows.map((row) => {
    const percent = numeric(row.dailyPercent);
    const zeroCount = zeroByResponsible[norm(row.name)] || 0;
    const projectionNegative = isNegative(row.projectionGapFormatted);
    const tone: Tone = projectionNegative || (percent !== null && percent < 50) || zeroCount >= 3
      ? 'critical'
      : (percent !== null && percent < 100) || zeroCount > 0
        ? 'attention'
        : 'positive';
    const score = (projectionNegative ? -1000 : 0) - zeroCount * 100 + (percent ?? 999);
    return { ...row, percent, zeroCount, tone, score };
  }).sort((a, b) => a.score - b.score);

  const activeAi = ai?.structured ? ai : data?.aiReading;
  const priorities = buildPriorities(activeAi, coordinators, zeroStores);
  const dailyPercent = numeric(goal.dailyPercent);
  const monthPercent = numeric(goal.monthPercent);
  const projectionTone: Tone = isNegative(goal.projectionGapFormatted) || (monthPercent !== null && monthPercent < 90)
    ? 'critical'
    : monthPercent !== null && monthPercent < 100
      ? 'attention'
      : 'positive';

  return {
    paid: summary.paidTodayFormatted || summary.productionTodayFormatted || 'R$ 0,00',
    sold: summary.soldTodayFormatted || 'R$ 0,00',
    pending: summary.conversionPendingFormatted || 'R$ 0,00',
    dailyGoal: short(goal.dailyGoalFormatted, 'Sem meta diária'),
    dailyGap: short(goal.dailyGapFormatted, 'Sem gap diário'),
    dailyPercentLabel: formatPercent(dailyPercent),
    dailyTone: toneFromPercent(dailyPercent),
    projection: monthPercent !== null ? `${monthPercent}%` : short(goal.projectionFormatted, 'Sem projeção'),
    projectionGap: short(goal.projectionGapFormatted, 'Sem gap projetado'),
    projectionTone,
    rhythmLabel: data?.rhythm?.label || 'RITMO INDETERMINADO',
    rhythmDescription: data?.rhythm?.description || 'Sem leitura disponível para o horário.',
    coordinators,
    priorities,
    diagnosis: activeAi?.structured?.executiveSummary || deterministicDiagnosis(coordinators),
    warning: data?.diagnostics?.warning || data?.warning || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '')
  };
}

function buildPriorities(ai: AiReading | undefined, coordinators: CoordinatorView[], zeroStores: ZeroStore[]): Priority[] {
  const actions = ai?.structured?.actions || [];
  if (actions.length) {
    return actions.slice(0, 5).map((action) => ({
      title: clean(action.title || 'Ação recomendada'),
      detail: clean(action.detail || ''),
      responsible: clean(action.responsible || 'Gestão comercial'),
      tone: action.severity === 'critical' ? 'critical' : action.severity === 'attention' ? 'attention' : 'neutral'
    }));
  }

  const priorities: Priority[] = [];
  coordinators.filter((item) => item.tone === 'critical').slice(0, 2).forEach((item) => {
    priorities.push({
      title: item.name || 'Coordenação crítica',
      detail: `${formatPercent(item.percent)} da diária e ${item.zeroCount} loja(s) zerada(s).`,
      responsible: item.name || 'Coordenação',
      tone: 'critical'
    });
  });

  zeroStores.slice(0, 3).forEach((store) => priorities.push({
    title: store.name || 'Loja zerada',
    detail: `Sem produção na atualização. Diária: ${short(store.dailyGoalFormatted, 'não cadastrada')}.`,
    responsible: store.responsible || 'Sem coordenação',
    tone: 'attention'
  }));

  return priorities.slice(0, 5);
}

function deterministicDiagnosis(coordinators: CoordinatorView[]) {
  const priority = coordinators[0];
  if (!priority) return 'Operação sem leitura consolidada por coordenação nesta atualização.';
  return `${priority.name} concentra a principal necessidade de atuação, com ${formatPercent(priority.percent)} da diária e ${priority.zeroCount} loja(s) zerada(s).`;
}

function projectionLabel(coordinator: CoordinatorView) {
  const monthPercent = numeric(coordinator.monthPercent);
  if (monthPercent !== null) return `${monthPercent}%`;
  return short(coordinator.projectionFormatted, 'Sem projeção');
}

function countZeroStores(stores: ZeroStore[]) {
  return stores.reduce<Record<string, number>>((acc, store) => {
    const key = norm(store.responsible);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toneFromPercent(percent: number | null): Tone {
  if (percent === null) return 'neutral';
  if (percent >= 100) return 'positive';
  if (percent >= 70) return 'attention';
  return 'critical';
}

function toneLabel(tone: Tone) {
  if (tone === 'positive') return 'Controlado';
  if (tone === 'attention') return 'Atenção';
  if (tone === 'critical') return 'Crítico';
  return 'Monitorar';
}

function numeric(value: Value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatPercent(value: number | null) {
  return value === null ? 'Sem diária' : `${Math.round(value)}%`;
}

function short(value: Value, fallback: string) {
  const text = String(value ?? '').trim();
  return !text || text.includes('DADO AUSENTE') ? fallback : text;
}

function isNegative(value: Value) {
  return String(value || '').trim().startsWith('-');
}

function norm(value: Value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function clean(value: Value) {
  return String(value || '').replace(/[#*_`|>-]{2,}/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeHour(value: Value) {
  const match = String(value || '').match(/(\d{1,2})[:h](\d{2})/);
  return match ? `${match[1].padStart(2, '0')}h${match[2]}` : '--h--';
}

function useClock() {
  const [time, setTime] = useState(now());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

function now() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date()).replace(':', 'h');
}
