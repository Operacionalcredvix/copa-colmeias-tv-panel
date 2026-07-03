'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 30000);
const AI_POLL_MS = Number(process.env.NEXT_PUBLIC_AI_POLL_MS ?? 300000);

type Value = number | string | null | undefined;
type Severity = 'critical' | 'attention' | 'normal';

type Summary = {
  contractsToday?: number;
  productionTodayFormatted?: string;
  averageTicketFormatted?: string;
  activeStores?: number;
  totalStores?: number;
  zeroStores?: number;
};

type Goal = {
  dailyGoalFormatted?: string;
  dailyGapFormatted?: string;
  dailyPercent?: Value;
};

type Rhythm = {
  label?: string;
  percent?: Value;
  description?: string;
};

type Comparison = {
  labelContracts?: string;
  labelProduction?: string;
};

type Store = {
  position?: number;
  name?: string;
  responsible?: string;
  contracts?: number;
  productionFormatted?: string;
  goalDailyFormatted?: string;
  goalPercent?: Value;
  goalGapFormatted?: string;
};

type Responsible = {
  name?: string;
  contractsToday?: number;
  productionToday?: number;
  productionTodayFormatted?: string;
  dailyGoal?: number | null;
  dailyGoalFormatted?: string;
  dailyGap?: number | null;
  dailyGapFormatted?: string;
  dailyPercent?: Value;
  diagnosis?: string;
  priority?: string;
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
  severity?: Severity;
};

type AiRisk = {
  title?: string;
  detail?: string;
  severity?: Severity;
};

type AiStructured = {
  headline?: string;
  executiveSummary?: string;
  priorityCoordinator?: string;
  actions?: AiAction[];
  risks?: AiRisk[];
  zeroStoresCritical?: { name?: string; responsible?: string; impact?: string }[];
  questions?: string[];
};

type AiReading = {
  status?: string;
  generatedAt?: string;
  text?: string;
  priorityResponsible?: string;
  structured?: AiStructured;
};

type Payload = {
  ok: boolean;
  version?: string;
  updatedAt?: string;
  latestLoadAt?: string;
  panelUpdatedAt?: string;
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

    return () => {
      alive = false;
      window.clearInterval(id);
    };
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

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const view = useMemo(
    () => buildView(data, ai, aiError, panelTime),
    [data, ai, aiError, panelTime]
  );

  if (loading && !data) {
    return <Shell><Loader text="Carregando painel de gestão..." /></Shell>;
  }

  if (!data) {
    return <Shell><Loader text={error || 'Não foi possível carregar os dados.'} /></Shell>;
  }

  return (
    <Shell>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <b>RADAR DE PRODUÇÃO</b>
            <span>CREDVIX | GESTÃO COMERCIAL</span>
          </div>
        </div>

        <div className="headline">
          <span>RITMO DO DIA</span>
          <strong>{view.rhythmLabel}</strong>
          <small>{view.rhythmDescription}</small>
        </div>

        <div className="timebox">
          <div>
            <span>PAINEL</span>
            <b>{view.panelTime}</b>
          </div>
          <div>
            <span>CARGA</span>
            <b>{view.loadTime}</b>
          </div>
          <em>{data.date || '--/--/----'}</em>
        </div>
      </header>

      {view.warning && <div className="warning">{view.warning}</div>}

      <section className="kpis">
        <Kpi title="Contratos" value={view.contracts} detail={view.contractsDetail} />
        <Kpi title="Produção hoje" value={view.production} detail={view.productionDetail} accent />
        <Kpi title="Meta / gap" value={view.dailyGoal} detail={`Gap: ${view.dailyGap}`} good={view.dailyGap === 'R$ 0,00'} />
        <Kpi title="Lojas" value={view.storesActive} detail={`${view.zeroCount} zeradas`} danger={view.zeroCountNumber > 0} />
      </section>

      <section className="mainGrid">
        <Panel title="Quem está batendo meta" className="rankingPanel">
          <div className="subline">
            <span>{view.rankingMode}</span>
            <b>{view.goalPercentLabel}</b>
          </div>
          {view.leader ? <Leader store={view.leader} /> : <Empty text="Sem loja líder." />}
          <div className="storeList">
            {view.otherStores.map((store) => <StoreLine key={`${store.position}-${store.name}`} store={store} />)}
          </div>
        </Panel>

        <div className="rightCol">
          <Panel title="Quem precisa de ação" className="actionPanel">
            <ActionTable rows={view.actions} />
          </Panel>

          <Panel title="Inteligência comercial" className="intelPanel">
            <DeepSeekCard reading={view.intel} />
            <ZeroCard stores={view.zeroStores} total={view.zeroCountNumber} />
          </Panel>
        </div>
      </section>

      <footer>
        <b>CREDVIX</b>
        <span>{view.ticker}</span>
        <em>{data.version || 'RADAR'}</em>
      </footer>
    </Shell>
  );
}

function buildView(data: Payload | null, ai: AiReading | null, aiError: string, panelTime: string) {
  const summary = data?.summary || {};
  const goal = data?.goal || {};
  const rhythm = data?.rhythm || {};
  const comparisons = data?.comparisons || {};
  const stores = Array.isArray(data?.topStores) ? data.topStores.slice(0, 6) : [];
  const responsibles = Array.isArray(data?.responsiblePerformance)
    ? data.responsiblePerformance
    : data?.regionalPerformance || [];
  const zeroStores = Array.isArray(data?.zeroStores) ? data.zeroStores.slice(0, 6) : [];
  const zeroCount = Number(summary.zeroStores ?? zeroStores.length ?? 0);
  const dailyPercent = num(goal.dailyPercent);
  const warning = data?.diagnostics?.warning
    || data?.warning
    || (data?.missingData?.length ? `Dados pendentes: ${data.missingData.join(', ')}` : '');
  const ticker = (data?.ticker?.length ? data.ticker : [
    `Contratos hoje: ${summary.contractsToday ?? 0}`,
    `Produção hoje: ${summary.productionTodayFormatted || 'R$ 0,00'}`,
    `Meta do dia: ${goal.dailyGoalFormatted || 'DADO AUSENTE'}`,
    `Gap: ${goal.dailyGapFormatted || 'DADO AUSENTE'}`,
    `Zeradas: ${zeroCount}`
  ]).join(' | ');

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
    rhythmDescription: rhythm.description || 'Sem leitura por horário.',
    rankingMode: data?.topStoresRankingMode === 'ATINGIMENTO_META'
      ? 'Ranking por % da meta diária'
      : 'Ranking por produção em R$',
    goalPercentLabel: dailyPercent !== null ? `${dailyPercent}% da meta do dia` : 'Meta do dia ausente',
    leader: stores[0] || null,
    otherStores: stores.slice(1),
    actions: responsibles.slice().sort(actionSort).slice(0, 5),
    zeroStores,
    intel: buildIntelReading(ai, data?.aiReading, aiError),
    warning,
    ticker,
    panelTime,
    loadTime: data?.latestLoadAt || data?.updatedAt || '--h--'
  };
}

function actionSort(a: Responsible, b: Responsible) {
  const left = actionPriority(a);
  const right = actionPriority(b);

  return left.bucket - right.bucket
    || right.gap - left.gap
    || left.percent - right.percent
    || right.production - left.production;
}

function actionPriority(row: Responsible) {
  const percent = num(row.dailyPercent);
  const production = typeof row.productionToday === 'number'
    ? row.productionToday
    : parseMoney(row.productionTodayFormatted);
  const gap = typeof row.dailyGap === 'number' ? row.dailyGap : parseMoney(row.dailyGapFormatted);

  if (percent !== null && percent < 100) {
    return { bucket: 0, gap, percent, production };
  }

  if (percent === null && production > 0) {
    return { bucket: 1, gap, percent: 999, production };
  }

  if (gap > 0) {
    return { bucket: 2, gap, percent: percent ?? 999, production };
  }

  if (percent !== null) {
    return { bucket: 3, gap, percent, production };
  }

  return { bucket: 4, gap, percent: 999, production };
}

function useClock() {
  const [time, setTime] = useState(formatNow());

  useEffect(() => {
    const id = window.setInterval(() => setTime(formatNow()), 30000);
    return () => window.clearInterval(id);
  }, []);

  return time;
}

function formatNow() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date()).replace(':', 'h');
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="screen"><Style />{children}</main>;
}

function Loader({ text }: { text: string }) {
  return (
    <div className="loader">
      <Logo />
      <h1>RADAR DE PRODUÇÃO</h1>
      <p>{text}</p>
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function Kpi({ title, value, detail, accent, danger, good }: {
  title: string;
  value: string;
  detail: string;
  accent?: boolean;
  danger?: boolean;
  good?: boolean;
}) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''} ${danger ? 'danger' : ''} ${good ? 'good' : ''}`}>
      <span>{title}</span>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}

function Leader({ store }: { store: Store }) {
  return (
    <div className="leader">
      <em>1</em>
      <div>
        <span>Loja líder</span>
        <b>{store.name || '-'}</b>
        <small>{store.responsible || 'Sem coordenadora'}</small>
      </div>
      <strong>{store.productionFormatted || 'R$ 0,00'}</strong>
      <i>{fmtPercent(store.goalPercent, 'sem meta')}</i>
      <small>Meta diária: {store.goalDailyFormatted || 'DADO AUSENTE'} | Gap: {store.goalGapFormatted || 'DADO AUSENTE'}</small>
    </div>
  );
}

function StoreLine({ store }: { store: Store }) {
  const percent = num(store.goalPercent);
  const width = percent === null ? 0 : Math.max(5, Math.min(100, percent));

  return (
    <div className="storeRow">
      <em>{store.position ?? '-'}</em>
      <div>
        <b>{store.name || '-'}</b>
        <small>{store.responsible || 'Sem coordenadora'}</small>
      </div>
      <span>{store.contracts ?? 0} ct</span>
      <strong>{store.productionFormatted || 'R$ 0,00'}</strong>
      <div className="goalbar">
        <i style={{ width: `${width}%` }} />
        <small>{fmtPercent(store.goalPercent, 'sem meta')} | {store.goalDailyFormatted || 'DADO AUSENTE'}</small>
      </div>
    </div>
  );
}

function ActionTable({ rows }: { rows: Responsible[] }) {
  if (!rows.length) {
    return <Empty text="Sem coordenadoras para ação." />;
  }

  return (
    <div className="actionTable">
      {rows.map((row) => <ActionRow key={row.name} row={row} />)}
    </div>
  );
}

function ActionRow({ row }: { row: Responsible }) {
  const percent = num(row.dailyPercent);
  const tone = percent === null ? 'unknown' : percent >= 100 ? 'good' : percent >= 90 ? 'attention' : 'critical';

  return (
    <div className={`actionRow ${tone}`}>
      <b>{row.name || '-'}</b>
      <span>{row.productionTodayFormatted || 'R$ 0,00'}</span>
      <strong>{fmtPercent(row.dailyPercent, 'sem meta')}</strong>
      <small>{row.dailyGapFormatted || 'sem diária'}</small>
      <em>{shortText(row.diagnosis || row.priority || 'Sem diagnóstico.', 92)}</em>
    </div>
  );
}

function DeepSeekCard({ reading }: { reading: IntelReading }) {
  return (
    <div className={`deepseek ${reading.active ? 'active' : ''}`}>
      <div className="intelHead">
        <span>IA comercial</span>
        <b>{reading.title}</b>
        <em>{reading.status} | {reading.generatedAt || '--'}</em>
      </div>
      <p>{reading.summary}</p>
      <div className="intelLists">
        <IntelList title="Ações" items={reading.actions} />
        <IntelList title="Riscos" items={reading.risks} />
      </div>
    </div>
  );
}

function IntelList({ title, items }: { title: string; items: IntelItem[] }) {
  return (
    <section>
      <span>{title}</span>
      {items.length ? items.map((item, index) => (
        <p key={`${title}-${index}`} className={item.severity || 'attention'}>
          <b>{item.title}</b>
          {item.detail && <small>{item.detail}</small>}
        </p>
      )) : <p><b>Sem leitura estruturada.</b></p>}
    </section>
  );
}

function ZeroCard({ stores, total }: { stores: ZeroStore[]; total: number }) {
  return (
    <div className="zeros">
      <div>
        <span>Lojas zeradas</span>
        <b>{total}</b>
      </div>
      <section>
        {stores.length ? stores.map((store) => (
          <p key={`${store.responsible}-${store.name}`}>
            <strong>{store.name}</strong>
            <span>{store.responsible || 'Sem coord.'}</span>
            <em>{store.dailyGoalFormatted || 'DADO AUSENTE'}</em>
          </p>
        )) : <Empty text="Nenhuma loja zerada." />}
      </section>
    </div>
  );
}

type IntelItem = {
  title: string;
  detail?: string;
  severity?: Severity;
};

type IntelReading = {
  active: boolean;
  title: string;
  status: string;
  generatedAt?: string;
  summary: string;
  actions: IntelItem[];
  risks: IntelItem[];
};

function buildIntelReading(ai: AiReading | null, fallback?: AiReading, error?: string): IntelReading {
  const source = ai || fallback || null;
  const structured = source?.structured || parseStructuredFromText(source?.text);
  const status = source?.status || (error ? 'ERRO' : 'SEM LEITURA');
  const active = Boolean(ai && ai.status === 'OK');

  if (structured) {
    return {
      active,
      title: active ? 'DeepSeek ativo' : status === 'TOKEN_AUSENTE' ? 'Token ausente' : 'Leitura estruturada',
      status,
      generatedAt: source?.generatedAt,
      summary: shortText(structured.executiveSummary || structured.headline || 'Sem diagnóstico executivo.', 180),
      actions: (structured.actions || []).slice(0, 3).map((item) => ({
        title: shortText(item.title || item.detail || 'Ação prioritária', 74),
        detail: shortText(item.detail || item.responsible || '', 94),
        severity: item.severity || 'attention'
      })),
      risks: (structured.risks || []).slice(0, 3).map((item) => ({
        title: shortText(item.title || item.detail || 'Risco mapeado', 74),
        detail: shortText(item.detail || '', 94),
        severity: item.severity || 'attention'
      }))
    };
  }

  const lines = markdownToLines(source?.text || error || 'DeepSeek indisponível.');
  const summary = shortText(lines[0] || 'Leitura operacional indisponível.', 180);
  const bullets = lines.slice(1).slice(0, 6);

  return {
    active,
    title: active ? 'DeepSeek ativo' : status === 'TOKEN_AUSENTE' ? 'Token ausente' : 'Aguardando DeepSeek',
    status,
    generatedAt: source?.generatedAt,
    summary,
    actions: bullets.slice(0, 3).map((line) => ({ title: shortText(line, 74), severity: 'attention' })),
    risks: bullets.slice(3, 6).map((line) => ({ title: shortText(line, 74), severity: 'normal' }))
  };
}

function parseStructuredFromText(text?: string): AiStructured | null {
  const raw = String(text || '').trim();

  if (!raw) {
    return null;
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as AiStructured;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function markdownToLines(text: string) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .replace(/[*_`>|]/g, ' ')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^[-:]+$/.test(line) && !/^table/i.test(line));
}

function num(value: Value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fmtPercent(value: Value, empty = 'DADO AUSENTE') {
  const n = num(value);
  return n === null ? empty : `${n}%`;
}

function parseMoney(value: Value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(
    String(value || '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '')
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function shortText(value: Value, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();

  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
    : text;
}

function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 5 55 18v28L32 59 9 46V18L32 5Z" />
      <path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z" />
    </svg>
  );
}

function Style() {
  return <style jsx global>{`
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      background: #020812;
      overflow: hidden;
    }

    .screen {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      color: #f7fbff;
      font-family: Inter, Arial, sans-serif;
      background:
        linear-gradient(135deg, #020812 0%, #06111f 48%, #030810 100%),
        #020812;
    }

    .screen::before {
      content: '';
      position: fixed;
      inset: 0;
      opacity: 0.12;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 32px 32px;
    }

    .topbar,
    .kpis,
    .mainGrid,
    footer,
    .warning {
      position: relative;
      z-index: 1;
    }

    .topbar {
      height: 82px;
      min-height: 0;
      padding: 10px 16px;
      display: grid;
      grid-template-columns: 316px minmax(0, 1fr) 208px;
      gap: 16px;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(2, 8, 18, 0.9);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    .brand svg {
      width: 42px;
      height: 42px;
      padding: 8px;
      border: 1px solid rgba(255, 193, 43, 0.35);
      border-radius: 8px;
      background: rgba(255, 193, 43, 0.08);
      flex: 0 0 auto;
    }

    svg path {
      fill: none;
      stroke: #ffc12b;
      stroke-width: 4;
      stroke-linejoin: round;
    }

    .brand b {
      display: block;
      font-size: 21px;
      line-height: 1;
      font-weight: 1000;
      white-space: nowrap;
    }

    .brand span,
    .headline span {
      display: block;
      color: #ffc12b;
      font-size: 11px;
      line-height: 1.1;
      font-weight: 900;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .headline {
      min-width: 0;
      text-align: center;
    }

    .headline strong {
      display: block;
      margin-top: 3px;
      font-size: 27px;
      line-height: 1;
      font-style: italic;
      font-weight: 1000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .headline small {
      display: block;
      margin-top: 5px;
      color: rgba(255, 255, 255, 0.64);
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .timebox {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid rgba(255, 193, 43, 0.25);
      background: rgba(255, 193, 43, 0.07);
    }

    .timebox span {
      display: block;
      color: rgba(255, 255, 255, 0.6);
      font-size: 9px;
      font-weight: 900;
    }

    .timebox b {
      display: block;
      color: #ffc12b;
      font-size: 24px;
      line-height: 1;
      font-weight: 1000;
    }

    .timebox em {
      grid-column: 1 / 3;
      color: rgba(255, 255, 255, 0.58);
      font-size: 10px;
      font-style: normal;
      font-weight: 800;
      text-align: right;
    }

    .warning {
      height: 26px;
      padding: 5px 16px;
      color: #ffd8d8;
      background: rgba(255, 93, 93, 0.15);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpis {
      height: 94px;
      padding: 10px 16px 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .kpi,
    .panel {
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(9, 23, 39, 0.96), rgba(5, 15, 27, 0.96));
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.22);
    }

    .kpi {
      position: relative;
      min-width: 0;
      overflow: hidden;
      padding: 11px 13px;
    }

    .kpi::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 3px;
      background: #2f92ff;
    }

    .kpi.accent::before {
      background: #ffc12b;
    }

    .kpi.good::before {
      background: #59e49b;
    }

    .kpi.danger::before {
      background: #ff6673;
    }

    .kpi span {
      display: block;
      color: rgba(255, 255, 255, 0.66);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .kpi b {
      display: block;
      margin-top: 4px;
      font-size: 27px;
      line-height: 1;
      font-weight: 1000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi.accent b {
      color: #ffc12b;
    }

    .kpi.good b {
      color: #62e8a2;
    }

    .kpi.danger b {
      color: #ff7777;
    }

    .kpi small {
      display: block;
      margin-top: 6px;
      color: rgba(255, 255, 255, 0.62);
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mainGrid {
      height: calc(100vh - 220px);
      min-height: 0;
      padding: 10px 16px 8px;
      display: grid;
      grid-template-columns: minmax(0, 58%) minmax(0, 42%);
      gap: 12px;
    }

    .warning ~ .kpis + .mainGrid {
      height: calc(100vh - 246px);
    }

    .rightCol {
      min-height: 0;
      display: grid;
      grid-template-rows: 39% 61%;
      gap: 12px;
    }

    .panel {
      min-height: 0;
      overflow: hidden;
      padding: 12px;
    }

    .panel h2 {
      margin: 0 0 8px;
      color: #ffc12b;
      font-size: 18px;
      line-height: 1;
      font-weight: 1000;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .subline {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      color: rgba(255, 255, 255, 0.62);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }

    .subline span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .subline b {
      color: #ffc12b;
      flex: 0 0 auto;
    }

    .leader {
      height: 82px;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 193, 43, 0.2);
      background: rgba(255, 193, 43, 0.07);
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 126px 68px;
      gap: 10px;
      align-items: center;
    }

    .leader > em {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: #ffc12b;
      color: #07111c;
      font-size: 22px;
      font-style: normal;
      font-weight: 1000;
    }

    .leader div {
      min-width: 0;
    }

    .leader span {
      color: #ffc12b;
      font-size: 10px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .leader div b {
      display: block;
      margin-top: 3px;
      font-size: 22px;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .leader div small {
      display: block;
      margin-top: 3px;
      color: rgba(255, 255, 255, 0.64);
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .leader > small {
      grid-column: 2 / 5;
      color: rgba(255, 255, 255, 0.66);
      font-size: 10px;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .leader strong {
      color: #ffc12b;
      font-size: 15px;
      text-align: right;
      white-space: nowrap;
    }

    .leader i {
      font-style: normal;
      font-size: 20px;
      font-weight: 1000;
      text-align: right;
      white-space: nowrap;
    }

    .storeList {
      display: grid;
      gap: 6px;
      margin-top: 8px;
    }

    .storeRow {
      min-width: 0;
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) 52px 108px 168px;
      gap: 8px;
      align-items: center;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
      border: 1px solid rgba(255, 255, 255, 0.07);
    }

    .storeRow em {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: rgba(255, 193, 43, 0.16);
      color: #ffc12b;
      font-style: normal;
      font-weight: 1000;
    }

    .storeRow div {
      min-width: 0;
    }

    .storeRow b {
      display: block;
      font-size: 14px;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .storeRow small {
      display: block;
      margin-top: 3px;
      color: rgba(255, 255, 255, 0.58);
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .storeRow span {
      color: #65e29f;
      font-size: 13px;
      font-weight: 1000;
      text-align: right;
    }

    .storeRow strong {
      color: #ffc12b;
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }

    .goalbar {
      position: relative;
      padding-top: 12px;
      min-width: 0;
    }

    .goalbar::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 0;
      right: 0;
      height: 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.09);
    }

    .goalbar i {
      position: absolute;
      top: 2px;
      left: 0;
      height: 7px;
      border-radius: 999px;
      background: linear-gradient(90deg, #59e49b, #ffd052);
    }

    .actionPanel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .actionTable {
      min-height: 0;
      display: grid;
      grid-template-rows: repeat(5, minmax(0, 1fr));
      gap: 6px;
    }

    .actionRow {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 104px 70px 84px;
      grid-template-rows: auto auto;
      gap: 3px 8px;
      align-items: center;
      padding: 7px 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
      border-left: 4px solid #7aa9ff;
    }

    .actionRow.critical {
      border-left-color: #ff6b6b;
    }

    .actionRow.attention {
      border-left-color: #ffd052;
    }

    .actionRow.good {
      border-left-color: #59e49b;
    }

    .actionRow b {
      min-width: 0;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .actionRow span {
      color: rgba(255, 255, 255, 0.72);
      font-size: 12px;
      font-weight: 900;
      text-align: right;
      white-space: nowrap;
    }

    .actionRow strong {
      color: #ffc12b;
      font-size: 15px;
      text-align: right;
      white-space: nowrap;
    }

    .actionRow.good strong {
      color: #62e8a2;
    }

    .actionRow small {
      color: rgba(255, 255, 255, 0.64);
      font-size: 10px;
      font-weight: 900;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .actionRow em {
      grid-column: 1 / 5;
      min-width: 0;
      color: rgba(255, 255, 255, 0.62);
      font-size: 10px;
      line-height: 1.15;
      font-style: normal;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .intelPanel {
      display: grid;
      grid-template-rows: minmax(0, 1.28fr) minmax(0, 0.72fr);
      gap: 8px;
    }

    .deepseek,
    .zeros {
      min-height: 0;
      overflow: hidden;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
    }

    .deepseek {
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.07);
    }

    .deepseek.active {
      border-color: rgba(89, 228, 155, 0.38);
    }

    .intelHead,
    .zeros > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .intelHead span,
    .zeros span,
    .intelLists section > span {
      color: #ffc12b;
      font-size: 10px;
      font-weight: 1000;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .intelHead b {
      min-width: 0;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .intelHead em {
      color: rgba(255, 255, 255, 0.54);
      font-size: 10px;
      font-style: normal;
      font-weight: 900;
      white-space: nowrap;
    }

    .deepseek > p {
      margin: 7px 0 8px;
      color: rgba(255, 255, 255, 0.88);
      font-size: 12px;
      line-height: 1.25;
      max-height: 32px;
      overflow: hidden;
    }

    .intelLists {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      min-height: 0;
    }

    .intelLists section {
      min-width: 0;
      display: grid;
      gap: 4px;
      align-content: start;
    }

    .intelLists p {
      margin: 0;
      padding: 5px 6px;
      min-width: 0;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
      border-left: 3px solid #ffd052;
    }

    .intelLists p.critical {
      border-left-color: #ff6b6b;
    }

    .intelLists p.normal {
      border-left-color: #7aa9ff;
    }

    .intelLists p b {
      display: block;
      font-size: 10px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .intelLists p small {
      display: block;
      margin-top: 2px;
      color: rgba(255, 255, 255, 0.56);
      font-size: 9px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .zeros {
      padding: 8px;
    }

    .zeros > div b {
      color: #ff7474;
      font-size: 22px;
      line-height: 1;
    }

    .zeros section {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      margin-top: 6px;
    }

    .zeros p {
      margin: 0;
      padding: 5px 6px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
      display: grid;
      grid-template-columns: minmax(0, 1fr) 62px;
      gap: 2px 6px;
    }

    .zeros strong {
      min-width: 0;
      font-size: 10px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .zeros p span {
      color: rgba(255, 255, 255, 0.58);
      font-size: 9px;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .zeros p em {
      grid-column: 1 / 3;
      color: #ffc12b;
      font-size: 9px;
      font-style: normal;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty {
      height: 100%;
      min-height: 0;
      display: grid;
      place-items: center;
      color: rgba(255, 255, 255, 0.48);
      font-weight: 900;
      font-size: 12px;
      text-align: center;
    }

    footer {
      height: 44px;
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr) 132px;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(2, 8, 18, 0.9);
    }

    footer b {
      color: #ffc12b;
      font-size: 13px;
    }

    footer span {
      min-width: 0;
      color: rgba(255, 255, 255, 0.88);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    footer em {
      color: rgba(255, 255, 255, 0.5);
      font-size: 10px;
      font-style: normal;
      font-weight: 900;
      text-align: right;
      white-space: nowrap;
    }

    .loader {
      position: relative;
      z-index: 1;
      width: 480px;
      margin: 23vh auto 0;
      padding: 34px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(9, 23, 39, 0.96);
      text-align: center;
    }

    .loader svg {
      width: 42px;
      height: 42px;
    }

    .loader h1 {
      margin: 14px 0 8px;
      font-size: 31px;
      line-height: 1;
    }

    .loader p {
      margin: 0;
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
    }
  `}</style>;
}
