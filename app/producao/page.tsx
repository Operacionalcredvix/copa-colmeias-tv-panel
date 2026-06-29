'use client';

import { useEffect, useMemo, useState } from 'react';

type MetricDelta = {
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
};

type Summary = {
  contracts: number;
  production: string;
  averageTicket: string;
  activeStores: number;
  zeroStores: number;
  projection: string;
  goalPercent: number;
};

type StoreRow = {
  position: number;
  name: string;
  contracts: number;
  value: string;
};

type MoverRow = {
  name: string;
  contractsDelta: number;
  valueDelta: string;
};

type RegionalRow = {
  name: string;
  contracts: number;
  production: string;
  averageTicket: string;
  activeStores: number;
  zeroStores: number;
};

type AlertRow = {
  level: 'good' | 'attention' | 'critical' | 'info';
  title: string;
  description: string;
};

type AiReading = {
  generatedAt: string;
  text: string;
  status: 'OK' | 'CACHE' | 'FALLBACK' | 'ERROR';
};

type ProductionPayload = {
  ok: boolean;
  source: string;
  updatedAt: string;
  dateLabel: string;
  summary: Summary;
  deltas: Record<keyof Summary, MetricDelta | undefined>;
  rhythm: {
    label: string;
    description: string;
    percent: number;
    tone: 'positive' | 'negative' | 'neutral';
  };
  aiReading: AiReading;
  topStores: StoreRow[];
  movers: MoverRow[];
  zeroStoresList: string[];
  regionalPerformance: RegionalRow[];
  alerts: AlertRow[];
  ticker: string[];
};

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 15000);
const SCREEN_ROTATE_MS = 16000;

export default function ProducaoPage() {
  const [data, setData] = useState<ProductionPayload | null>(null);
  const [screen, setScreen] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/producao', { cache: 'no-store' });
        const payload = (await response.json()) as ProductionPayload;
        setData(payload);
        setIsLoading(false);
      } catch (error) {
        console.error('Erro ao carregar painel de producao', error);
        setIsLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setScreen((prev) => (prev + 1) % 3);
    }, SCREEN_ROTATE_MS);

    return () => window.clearInterval(interval);
  }, []);

  const tickerText = useMemo(() => {
    if (!data) return '';
    return data.ticker.join('   •   ');
  }, [data]);

  if (!data && isLoading) {
    return (
      <main className="prod-screen loading-screen">
        <div className="prod-loader-card">
          <div className="prod-logo-mark"><HoneyIcon /></div>
          <h1>PAINEL DE PRODUÇÃO</h1>
          <p>Carregando dados em tempo real...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="prod-screen loading-screen">
        <div className="prod-loader-card">
          <div className="prod-logo-mark"><HoneyIcon /></div>
          <h1>PAINEL DE PRODUÇÃO</h1>
          <p>Não foi possível carregar os dados.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="prod-screen">
      <style jsx global>{styles}</style>
      <div className="prod-bg-grid" />
      <Header updatedAt={data.updatedAt} screen={screen} />

      <section key={screen} className="prod-stage prod-stage-animated">
        {screen === 0 && <ExecutiveScreen data={data} />}
        {screen === 1 && <StoresScreen data={data} />}
        {screen === 2 && <RegionalsScreen data={data} />}
      </section>

      <footer className="prod-footer">
        <div className="prod-footer-logo"><HoneyIcon /><strong>CREDVIX</strong></div>
        <div className="prod-ticker-track"><div className="prod-ticker-content">{tickerText}</div></div>
        <div className="prod-footer-phrase">CADA CONTRATO CONTA PARA O RESULTADO</div>
      </footer>
    </main>
  );
}

function Header({ updatedAt, screen }: { updatedAt: string; screen: number }) {
  const titles = ['VISÃO EXECUTIVA DO DIA', 'RANKING E PRESSÃO POR LOJA', 'REGIONAIS E ALERTAS'];

  return (
    <header className="prod-topbar">
      <div className="prod-screen-pill">TELA {screen + 1}</div>
      <div className="prod-title-block">
        <span>{titles[screen]}</span>
        <h1>PAINEL DE PRODUÇÃO <em>CREDVIX</em></h1>
        <p>Gestão comercial em tempo real</p>
      </div>
      <div className="prod-update-box">
        <span>ATUALIZADO ÀS</span>
        <strong>{updatedAt}</strong>
        <small><i /> ao vivo</small>
      </div>
    </header>
  );
}

function ExecutiveScreen({ data }: { data: ProductionPayload }) {
  const s = data.summary;

  return (
    <div className="prod-screen-grid executive-grid">
      <MetricCard label="Contratos hoje" value={String(s.contracts)} icon="handshake" delta={data.deltas.contracts} />
      <MetricCard label="Valor produzido" value={s.production} icon="money" delta={data.deltas.production} />
      <MetricCard label="Ticket médio" value={s.averageTicket} icon="chart" delta={data.deltas.averageTicket} />
      <MetricCard label="Lojas com produção" value={String(s.activeStores)} icon="store" delta={data.deltas.activeStores} />
      <MetricCard label="Lojas zeradas" value={String(s.zeroStores)} icon="alertStore" delta={data.deltas.zeroStores} />
      <MetricCard label="Projeção do dia" value={s.projection} icon="target" delta={data.deltas.projection} />

      <div className="prod-panel rhythm-panel">
        <div className="prod-panel-title"><span>↗</span> RITMO DO DIA</div>
        <strong className={`rhythm-label ${data.rhythm.tone}`}>{data.rhythm.label}</strong>
        <p>{data.rhythm.description}</p>
        <div className="rhythm-bar"><i style={{ width: `${Math.max(5, Math.min(100, data.rhythm.percent))}%` }} /></div>
      </div>

      <div className="prod-panel ai-panel">
        <div className="prod-panel-title"><span>◎</span> LEITURA IA</div>
        <p>{data.aiReading.text}</p>
        <small>Gerada às {data.aiReading.generatedAt} • {data.aiReading.status}</small>
      </div>

      <div className="prod-panel update-panel">
        <div className="prod-panel-title"><span>◷</span> STATUS</div>
        <strong>{data.updatedAt}</strong>
        <p>Fonte: {data.source === 'mock' ? 'dados de demonstração' : 'planilha operacional'}</p>
        <div className="sync-icon">↻</div>
      </div>
    </div>
  );
}

function StoresScreen({ data }: { data: ProductionPayload }) {
  return (
    <div className="prod-screen-grid stores-grid">
      <div className="prod-panel top-stores-panel">
        <div className="prod-panel-title">TOP 10 LOJAS DO DIA</div>
        <p className="panel-subtitle">Por valor produzido</p>
        <div className="store-ranking-list">
          {data.topStores.slice(0, 10).map((store) => (
            <div key={`${store.position}-${store.name}`} className="store-row">
              <span className={store.position <= 3 ? 'podium' : ''}>{store.position}º</span>
              <strong>{store.name}</strong>
              <small>{store.contracts} ct</small>
              <em>{store.value}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="prod-panel movers-panel">
        <div className="prod-panel-title">MAIORES REAÇÕES</div>
        <p className="panel-subtitle">Desde a última atualização</p>
        <div className="movers-list">
          {data.movers.slice(0, 6).map((mover) => (
            <div key={mover.name} className="mover-row">
              <span>▲</span>
              <strong>{mover.name}</strong>
              <em>+{mover.contractsDelta} ct</em>
            </div>
          ))}
        </div>
        {data.movers[0] && (
          <div className="good-news-box">
            <span>🏆</span>
            <div><strong>BOA NOTÍCIA DO DIA</strong><p>{data.movers[0].name} foi a loja que mais cresceu desde a última atualização.</p></div>
          </div>
        )}
      </div>

      <div className="prod-panel zeros-panel">
        <div className="prod-panel-title danger">LOJAS ZERADAS</div>
        <p className="panel-subtitle">Sem produção hoje</p>
        <div className="zero-list">
          {data.zeroStoresList.slice(0, 10).map((store) => (
            <div key={store} className="zero-row"><span>●</span>{store}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RegionalsScreen({ data }: { data: ProductionPayload }) {
  const totals = data.regionalPerformance.reduce((acc, row) => {
    acc.contracts += row.contracts;
    acc.activeStores += row.activeStores;
    acc.zeroStores += row.zeroStores;
    return acc;
  }, { contracts: 0, activeStores: 0, zeroStores: 0 });

  return (
    <div className="prod-screen-grid regionals-grid">
      <div className="prod-panel regional-table-panel">
        <div className="prod-panel-title">PERFORMANCE POR REGIONAL</div>
        <div className="regional-table">
          <div className="regional-head">
            <span>Regional</span><span>Contratos</span><span>Produção</span><span>Ticket</span><span>Com prod.</span><span>Zeradas</span>
          </div>
          {data.regionalPerformance.slice(0, 7).map((row) => (
            <div key={row.name} className="regional-row">
              <strong>{row.name}</strong>
              <span>{row.contracts}</span>
              <span>{row.production}</span>
              <span>{row.averageTicket}</span>
              <span>{row.activeStores}</span>
              <em>{row.zeroStores}</em>
            </div>
          ))}
          <div className="regional-row total-row">
            <strong>TOTAL</strong>
            <span>{totals.contracts}</span>
            <span>{data.summary.production}</span>
            <span>{data.summary.averageTicket}</span>
            <span>{totals.activeStores}</span>
            <em>{totals.zeroStores}</em>
          </div>
        </div>
      </div>

      <div className="prod-panel alerts-panel">
        <div className="prod-panel-title danger">ALERTAS</div>
        <div className="alerts-list">
          {data.alerts.slice(0, 5).map((alert) => (
            <div key={`${alert.title}-${alert.description}`} className={`alert-row ${alert.level}`}>
              <span>{alertIcon(alert.level)}</span>
              <div><strong>{alert.title}</strong><p>{alert.description}</p></div>
            </div>
          ))}
        </div>
        <div className="focus-box">
          <strong>FOCO DO DIA</strong>
          <p>Reduzir lojas zeradas e proteger o ticket médio.</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, delta }: { label: string; value: string; icon: string; delta?: MetricDelta }) {
  return (
    <div className="metric-card">
      <span>{metricIcon(icon)}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {delta && <em className={delta.tone}>{delta.label}</em>}
      </div>
    </div>
  );
}

function metricIcon(icon: string) {
  const icons: Record<string, string> = {
    handshake: '🤝',
    money: '💰',
    chart: '📈',
    store: '🏪',
    alertStore: '🏚',
    target: '🎯'
  };
  return icons[icon] ?? '⬢';
}

function alertIcon(level: AlertRow['level']) {
  if (level === 'critical') return '▲';
  if (level === 'attention') return '◆';
  if (level === 'good') return '●';
  return '◷';
}

function HoneyIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 5 55 18v28L32 59 9 46V18L32 5Z" />
      <path d="M22 25 32 19l10 6v12l-10 6-10-6V25Z" />
      <path d="M13 18 32 7l19 11M13 46l19 11 19-11" />
    </svg>
  );
}

const styles = `
  .prod-screen {
    position: relative;
    width: 100vw;
    height: 100vh;
    min-height: 680px;
    overflow: hidden;
    background:
      radial-gradient(circle at 15% 0%, rgba(255, 194, 42, 0.12), transparent 29%),
      radial-gradient(circle at 90% 20%, rgba(60, 148, 234, 0.13), transparent 32%),
      linear-gradient(135deg, #020812 0%, #061524 48%, #020812 100%);
    color: #f5f7fb;
    isolation: isolate;
  }

  .prod-bg-grid {
    position: absolute;
    inset: 0;
    opacity: 0.46;
    z-index: -1;
    background-image:
      linear-gradient(30deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(150deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      radial-gradient(circle at 1px 1px, rgba(255, 194, 42, 0.10) 1px, transparent 0);
    background-size: 92px 92px, 92px 92px, 34px 34px;
  }

  .loading-screen { display: grid; place-items: center; }

  .prod-loader-card {
    width: min(620px, 70vw);
    border: 1px solid rgba(255, 194, 42, 0.45);
    background: rgba(5, 17, 29, 0.86);
    padding: 42px 48px;
    text-align: center;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 0 80px rgba(255, 194, 42, 0.07);
  }

  .prod-logo-mark {
    width: 68px;
    height: 68px;
    margin: 0 auto 18px;
    border: 2px solid #ffc22a;
    display: grid;
    place-items: center;
    clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%);
  }

  .prod-logo-mark svg { width: 42px; height: 42px; }
  .prod-logo-mark svg path { fill: none; stroke: #ffc22a; stroke-width: 4; stroke-linejoin: round; }

  .prod-loader-card h1,
  .prod-title-block h1,
  .prod-title-block span,
  .prod-screen-pill,
  .prod-panel-title,
  .metric-card strong,
  .rhythm-label,
  .regional-head,
  .prod-footer-phrase {
    font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }

  .prod-topbar {
    height: 13vh;
    min-height: 104px;
    padding: 2.4vh 2.6vw 1.8vh;
    display: grid;
    grid-template-columns: 150px 1fr 250px;
    align-items: start;
    gap: 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.14);
    background: linear-gradient(to bottom, rgba(2, 8, 18, 0.96), rgba(2, 8, 18, 0.64));
  }

  .prod-screen-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    background: linear-gradient(135deg, #ffc22a, #ff8619);
    color: #07111e;
    font-size: 20px;
    font-weight: 900;
    clip-path: polygon(0 0, 100% 0, 92% 100%, 0 100%);
  }

  .prod-title-block { text-align: center; }
  .prod-title-block span { display: block; margin-bottom: 6px; color: white; font-size: 22px; font-weight: 800; }
  .prod-title-block h1 { margin: 0; font-size: clamp(44px, 4.5vw, 78px); line-height: 0.82; font-weight: 900; font-style: italic; }
  .prod-title-block h1 em { color: #ffc22a; font-style: italic; }
  .prod-title-block p { margin: 9px 0 0; color: rgba(255,255,255,0.68); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }

  .prod-update-box { justify-self: end; text-align: right; }
  .prod-update-box span { display: block; color: rgba(255,255,255,0.86); font-weight: 900; font-size: 16px; }
  .prod-update-box strong { display: block; color: #ffc22a; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: clamp(44px, 4vw, 68px); line-height: 0.8; font-weight: 900; }
  .prod-update-box small { display: inline-flex; align-items: center; gap: 8px; margin-top: 9px; color: rgba(255,255,255,0.78); font-weight: 700; text-transform: uppercase; }
  .prod-update-box i { width: 12px; height: 12px; border-radius: 50%; background: #58c94f; box-shadow: 0 0 0 5px rgba(88,201,79,0.16); }

  .prod-stage {
    height: calc(100vh - 13vh - 70px);
    min-height: 500px;
    padding: 2.2vh 2vw 1.7vh;
  }

  .prod-stage-animated { animation: prodScreenIn 700ms cubic-bezier(0.18, 0.72, 0.18, 1) both; }

  @keyframes prodScreenIn {
    from { opacity: 0; transform: translateY(12px); filter: blur(5px); }
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }

  .prod-screen-grid { height: 100%; display: grid; gap: 1.25vw; }
  .executive-grid { grid-template-columns: repeat(6, 1fr); grid-template-rows: minmax(150px, 0.9fr) 1.1fr; }
  .stores-grid { grid-template-columns: 1.2fr 1fr 1fr; }
  .regionals-grid { grid-template-columns: 1.65fr 0.85fr; }

  .metric-card,
  .prod-panel {
    border: 1px solid rgba(255,255,255,0.16);
    background: linear-gradient(180deg, rgba(7,20,34,0.95), rgba(5,16,28,0.91));
    box-shadow: 0 20px 65px rgba(0,0,0,0.30), inset 0 0 55px rgba(255,255,255,0.025);
  }

  .metric-card {
    padding: 22px 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 17px;
    min-width: 0;
  }

  .metric-card > span { font-size: clamp(36px, 3vw, 54px); line-height: 1; }
  .metric-card small { display: block; color: rgba(255,255,255,0.82); font-weight: 900; text-transform: uppercase; font-size: clamp(12px, 0.92vw, 16px); }
  .metric-card strong { display: block; margin-top: 12px; font-size: clamp(34px, 3.5vw, 62px); line-height: 0.86; font-weight: 900; white-space: nowrap; }
  .metric-card em { display: block; margin-top: 13px; font-style: normal; font-size: clamp(14px, 1.05vw, 18px); font-weight: 900; }

  .positive { color: #58c94f !important; }
  .negative { color: #ff4d3d !important; }
  .neutral { color: #aab2bf !important; }

  .prod-panel { padding: 24px 26px; min-width: 0; overflow: hidden; }
  .prod-panel-title { display: flex; align-items: center; gap: 11px; margin-bottom: 16px; color: #ffc22a; font-size: clamp(20px, 1.7vw, 30px); font-weight: 900; }
  .prod-panel-title.danger { color: #ff4d3d; }
  .panel-subtitle { margin: -8px 0 17px; color: rgba(255,255,255,0.70); font-size: 15px; }

  .rhythm-panel { grid-column: span 2; }
  .rhythm-label { display: block; margin: 8px 0 6px; font-size: clamp(30px, 2.4vw, 44px); font-weight: 900; }
  .rhythm-panel p { margin: 0 0 28px; font-size: clamp(17px, 1.25vw, 22px); font-weight: 700; color: white; }
  .rhythm-bar { height: 16px; border-radius: 999px; overflow: hidden; background: linear-gradient(90deg, #e81635, #ffb21e, #58c94f); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
  .rhythm-bar i { display: block; height: 100%; border-right: 9px solid white; }

  .ai-panel { grid-column: span 3; border-color: rgba(255,194,42,0.62); box-shadow: 0 20px 65px rgba(0,0,0,0.30), 0 0 28px rgba(255,194,42,0.10), inset 0 0 55px rgba(255,194,42,0.04); }
  .ai-panel p { margin: 0; color: white; font-size: clamp(18px, 1.28vw, 24px); line-height: 1.42; font-weight: 650; }
  .ai-panel small { display: block; margin-top: 17px; color: rgba(255,255,255,0.55); font-weight: 800; text-transform: uppercase; }

  .update-panel { position: relative; text-align: center; }
  .update-panel strong { display: block; margin-top: 14px; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: clamp(50px, 4.4vw, 72px); line-height: 0.85; }
  .update-panel p { margin: 12px 0 0; color: rgba(255,255,255,0.76); font-weight: 700; }
  .sync-icon { position: absolute; right: 24px; bottom: 20px; color: #58c94f; font-size: 44px; }

  .top-stores-panel,
  .movers-panel,
  .zeros-panel,
  .regional-table-panel,
  .alerts-panel { height: 100%; }

  .store-ranking-list,
  .movers-list,
  .zero-list,
  .alerts-list { display: grid; gap: 10px; }

  .store-row {
    min-height: 41px;
    display: grid;
    grid-template-columns: 48px 1fr 58px 110px;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-weight: 800;
  }

  .store-row span { color: rgba(255,255,255,0.82); }
  .store-row span.podium { color: #ffc22a; }
  .store-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .store-row small { color: #aab2bf; font-weight: 900; }
  .store-row em { color: white; font-style: normal; text-align: right; font-weight: 900; }

  .mover-row { min-height: 48px; display: grid; grid-template-columns: 30px 1fr 80px; align-items: center; gap: 10px; font-weight: 900; }
  .mover-row span, .mover-row em { color: #58c94f; font-style: normal; }
  .mover-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .good-news-box {
    margin-top: 24px;
    padding: 18px;
    display: grid;
    grid-template-columns: 54px 1fr;
    gap: 14px;
    border: 1px solid rgba(88,201,79,0.42);
    background: rgba(88,201,79,0.09);
  }
  .good-news-box > span { font-size: 40px; }
  .good-news-box strong { color: #58c94f; }
  .good-news-box p { margin: 6px 0 0; color: white; line-height: 1.35; }

  .zero-row { min-height: 39px; display: flex; align-items: center; gap: 12px; color: white; font-weight: 750; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .zero-row span { color: #ff4d3d; font-size: 15px; }

  .regional-table { height: calc(100% - 48px); display: grid; grid-template-rows: 44px repeat(8, minmax(38px, 1fr)); }
  .regional-head,
  .regional-row { display: grid; grid-template-columns: 1.1fr 0.65fr 0.9fr 0.75fr 0.75fr 0.65fr; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.09); }
  .regional-head { color: rgba(255,255,255,0.78); font-size: 14px; font-weight: 900; }
  .regional-row { font-weight: 800; }
  .regional-row strong { color: white; }
  .regional-row span { color: rgba(255,255,255,0.84); }
  .regional-row em { color: #ff4d3d; font-style: normal; font-weight: 900; }
  .total-row { color: #3c94ea; border-top: 1px solid rgba(60,148,234,0.36); }
  .total-row strong, .total-row span { color: #7fc8ff; }

  .alert-row { min-height: 76px; display: grid; grid-template-columns: 38px 1fr; align-items: center; gap: 14px; padding: 13px 10px; border-bottom: 1px solid rgba(255,255,255,0.12); }
  .alert-row > span { font-size: 27px; font-weight: 900; }
  .alert-row.critical > span { color: #ff4d3d; }
  .alert-row.attention > span { color: #ffc22a; }
  .alert-row.good > span { color: #58c94f; }
  .alert-row.info > span { color: #3c94ea; }
  .alert-row strong { color: white; }
  .alert-row p { margin: 5px 0 0; color: rgba(255,255,255,0.78); line-height: 1.25; }

  .focus-box { margin-top: 18px; padding: 18px; border: 1px solid rgba(60,148,234,0.56); background: rgba(60,148,234,0.12); }
  .focus-box strong { color: #7fc8ff; }
  .focus-box p { margin: 8px 0 0; color: white; }

  .prod-footer {
    height: 70px;
    padding: 0 2vw;
    display: grid;
    grid-template-columns: 210px 1fr 370px;
    align-items: center;
    gap: 22px;
    border-top: 1px solid rgba(255,255,255,0.13);
    background: rgba(2,8,18,0.94);
  }

  .prod-footer-logo { display: flex; align-items: center; gap: 10px; color: white; }
  .prod-footer-logo svg { width: 36px; height: 36px; }
  .prod-footer-logo svg path { fill: none; stroke: #ffc22a; stroke-width: 4; stroke-linejoin: round; }
  .prod-footer-logo strong { font-weight: 900; }

  .prod-ticker-track { overflow: hidden; white-space: nowrap; }
  .prod-ticker-content { display: inline-block; color: rgba(255,255,255,0.78); font-weight: 800; animation: prodTicker 38s linear infinite; }
  @keyframes prodTicker { from { transform: translateX(55%); } to { transform: translateX(-100%); } }

  .prod-footer-phrase { justify-self: end; color: #ffc22a; font-size: 18px; font-weight: 900; }
`;
