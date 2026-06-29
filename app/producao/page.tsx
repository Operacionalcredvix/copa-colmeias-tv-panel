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
const SCREEN_ROTATE_MS = 14000;

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
      } catch (error) {
        console.error('Erro ao carregar painel de producao', error);
      } finally {
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
        <style jsx global>{styles}</style>
        <LoaderCard text="Carregando dados em tempo real..." />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="prod-screen loading-screen">
        <style jsx global>{styles}</style>
        <LoaderCard text="Não foi possível carregar os dados." />
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
        <div className="prod-footer-phrase">CADA CONTRATO CONTA</div>
      </footer>
    </main>
  );
}

function LoaderCard({ text }: { text: string }) {
  return (
    <div className="prod-loader-card">
      <div className="prod-logo-mark"><HoneyIcon /></div>
      <h1>PAINEL DE PRODUÇÃO</h1>
      <p>{text}</p>
    </div>
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
        <span>ATUALIZADO</span>
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
      <div className="metric-grid">
        <MetricCard label="Contratos hoje" value={String(s.contracts)} icon="CT" delta={data.deltas.contracts} />
        <MetricCard label="Valor produzido" value={s.production} icon="R$" delta={data.deltas.production} />
        <MetricCard label="Ticket médio" value={s.averageTicket} icon="TM" delta={data.deltas.averageTicket} />
        <MetricCard label="Lojas com produção" value={String(s.activeStores)} icon="ON" delta={data.deltas.activeStores} />
        <MetricCard label="Lojas zeradas" value={String(s.zeroStores)} icon="0" delta={data.deltas.zeroStores} />
        <MetricCard label="Projeção do dia" value={s.projection} icon="PR" delta={data.deltas.projection} />
      </div>

      <div className="insight-column">
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
          <div className="prod-panel-title"><span>◷</span> STATUS DA BASE</div>
          <strong>{data.updatedAt}</strong>
          <p>{data.source === 'mock' ? 'dados de demonstração' : 'planilha operacional'}</p>
        </div>
      </div>
    </div>
  );
}

function StoresScreen({ data }: { data: ProductionPayload }) {
  return (
    <div className="prod-screen-grid stores-grid">
      <div className="prod-panel top-stores-panel">
        <div className="prod-panel-title">TOP 10 LOJAS DO DIA</div>
        <p className="panel-subtitle">Ranking por valor produzido</p>
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
            <span>↗</span>
            <div><strong>REAÇÃO DO DIA</strong><p>{data.movers[0].name} foi a loja que mais cresceu desde a última atualização.</p></div>
          </div>
        )}
      </div>

      <div className="prod-panel zeros-panel">
        <div className="prod-panel-title danger">LOJAS ZERADAS</div>
        <p className="panel-subtitle">Sem produção registrada hoje</p>
        <div className="zero-list">
          {data.zeroStoresList.slice(0, 10).map((store) => (
            <div key={store} className="zero-row"><span>●</span><strong>{store}</strong></div>
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
        <div className="prod-panel-title danger">ALERTAS OPERACIONAIS</div>
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
          <p>Reduzir lojas zeradas, ampliar cobertura e proteger ticket médio.</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, delta }: { label: string; value: string; icon: string; delta?: MetricDelta }) {
  return (
    <div className="metric-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {delta && <em className={delta.tone}>{delta.label}</em>}
      </div>
    </div>
  );
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
  * { box-sizing: border-box; }

  body { margin: 0; background: #020812; }

  .prod-screen {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(circle at 12% 0%, rgba(255, 194, 42, 0.13), transparent 28%),
      radial-gradient(circle at 92% 20%, rgba(60, 148, 234, 0.13), transparent 30%),
      linear-gradient(135deg, #020812 0%, #061524 52%, #020812 100%);
    color: #f5f7fb;
    isolation: isolate;
  }

  .prod-bg-grid {
    position: absolute;
    inset: 0;
    opacity: 0.36;
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
    width: 64px;
    height: 64px;
    margin: 0 auto 18px;
    border: 2px solid #ffc22a;
    display: grid;
    place-items: center;
    clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%);
  }

  .prod-logo-mark svg { width: 40px; height: 40px; }
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
    height: 94px;
    padding: 16px 26px 12px;
    display: grid;
    grid-template-columns: 128px 1fr 204px;
    align-items: start;
    gap: 22px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.14);
    background: linear-gradient(to bottom, rgba(2, 8, 18, 0.98), rgba(2, 8, 18, 0.68));
  }

  .prod-screen-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    background: linear-gradient(135deg, #ffc22a, #ff8619);
    color: #07111e;
    font-size: 18px;
    font-weight: 900;
    clip-path: polygon(0 0, 100% 0, 92% 100%, 0 100%);
  }

  .prod-title-block { text-align: center; min-width: 0; }
  .prod-title-block span { display: block; margin-bottom: 4px; color: white; font-size: clamp(16px, 1.5vw, 23px); font-weight: 800; }
  .prod-title-block h1 { margin: 0; font-size: clamp(34px, 4.2vw, 62px); line-height: 0.84; font-weight: 900; font-style: italic; }
  .prod-title-block h1 em { color: #ffc22a; font-style: italic; }
  .prod-title-block p { margin: 6px 0 0; color: rgba(255,255,255,0.68); font-weight: 700; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }

  .prod-update-box { justify-self: end; text-align: right; }
  .prod-update-box span { display: block; color: rgba(255,255,255,0.84); font-weight: 900; font-size: 13px; }
  .prod-update-box strong { display: block; color: #ffc22a; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: clamp(38px, 4vw, 56px); line-height: 0.82; font-weight: 900; }
  .prod-update-box small { display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; color: rgba(255,255,255,0.78); font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .prod-update-box i { width: 10px; height: 10px; border-radius: 50%; background: #58c94f; box-shadow: 0 0 0 5px rgba(88,201,79,0.16); }

  .prod-stage {
    height: calc(100vh - 150px);
    padding: 16px 20px 14px;
  }

  .prod-stage-animated { animation: prodScreenIn 520ms cubic-bezier(0.18, 0.72, 0.18, 1) both; }

  @keyframes prodScreenIn {
    from { opacity: 0; transform: translateY(10px); filter: blur(4px); }
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }

  .prod-screen-grid { height: 100%; display: grid; gap: 16px; min-height: 0; }
  .executive-grid { grid-template-columns: minmax(0, 1.55fr) minmax(340px, 0.95fr); }
  .stores-grid { grid-template-columns: minmax(0, 1.28fr) minmax(320px, 0.9fr) minmax(320px, 0.95fr); }
  .regionals-grid { grid-template-columns: minmax(0, 1.65fr) minmax(360px, 0.85fr); }
  .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 16px; min-height: 0; }
  .insight-column { display: grid; grid-template-rows: 0.82fr 1.18fr 0.72fr; gap: 16px; min-height: 0; }

  .metric-card,
  .prod-panel {
    border: 1px solid rgba(255,255,255,0.16);
    background: linear-gradient(180deg, rgba(7,20,34,0.96), rgba(5,16,28,0.92));
    box-shadow: 0 18px 55px rgba(0,0,0,0.30), inset 0 0 48px rgba(255,255,255,0.025);
  }

  .metric-card {
    padding: 16px;
    display: grid;
    grid-template-columns: 54px 1fr;
    align-items: center;
    gap: 14px;
    min-width: 0;
    min-height: 0;
  }

  .metric-card > span {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,194,42,0.45);
    border-radius: 50%;
    color: #ffc22a;
    font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
    font-size: 19px;
    font-weight: 900;
  }

  .metric-card small { display: block; color: rgba(255,255,255,0.82); font-weight: 900; text-transform: uppercase; font-size: clamp(11px, 0.95vw, 15px); }
  .metric-card strong { display: block; margin-top: 9px; font-size: clamp(28px, 3vw, 46px); line-height: 0.92; font-weight: 900; white-space: nowrap; }
  .metric-card em { display: block; margin-top: 11px; font-style: normal; font-size: clamp(12px, 0.95vw, 16px); font-weight: 900; white-space: nowrap; }

  .positive { color: #58c94f !important; }
  .negative { color: #ff4d3d !important; }
  .neutral { color: #aab2bf !important; }

  .prod-panel { padding: 18px 20px; min-width: 0; min-height: 0; overflow: hidden; }
  .prod-panel-title { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: #ffc22a; font-size: clamp(18px, 1.55vw, 27px); line-height: 1; font-weight: 900; }
  .prod-panel-title.danger { color: #ff4d3d; }
  .panel-subtitle { margin: -5px 0 13px; color: rgba(255,255,255,0.70); font-size: 13px; }

  .rhythm-label { display: block; margin: 4px 0 5px; font-size: clamp(28px, 2.4vw, 42px); line-height: .95; font-weight: 900; }
  .rhythm-panel p { margin: 0 0 16px; font-size: clamp(14px, 1.12vw, 19px); font-weight: 700; color: white; }
  .rhythm-bar { height: 13px; border-radius: 999px; overflow: hidden; background: linear-gradient(90deg, #e81635, #ffb21e, #58c94f); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
  .rhythm-bar i { display: block; height: 100%; border-right: 8px solid white; }

  .ai-panel { border-color: rgba(255,194,42,0.56); box-shadow: 0 18px 55px rgba(0,0,0,0.30), 0 0 24px rgba(255,194,42,0.10), inset 0 0 48px rgba(255,194,42,0.04); }
  .ai-panel p { margin: 0; color: white; font-size: clamp(14px, 1.15vw, 20px); line-height: 1.35; font-weight: 650; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .ai-panel small { display: block; margin-top: 12px; color: rgba(255,255,255,0.55); font-size: 11px; font-weight: 800; text-transform: uppercase; }

  .update-panel { text-align: center; }
  .update-panel strong { display: block; margin-top: 4px; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; font-size: clamp(40px, 4.4vw, 62px); line-height: .82; }
  .update-panel p { margin: 8px 0 0; color: rgba(255,255,255,0.76); font-size: 13px; font-weight: 700; }

  .top-stores-panel,
  .movers-panel,
  .zeros-panel,
  .regional-table-panel,
  .alerts-panel { height: 100%; }

  .store-ranking-list,
  .movers-list,
  .zero-list,
  .alerts-list { display: grid; gap: 8px; min-height: 0; }

  .store-row {
    min-height: 38px;
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) 56px 106px;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-weight: 800;
  }

  .store-row span { color: rgba(255,255,255,0.82); }
  .store-row span.podium { color: #ffc22a; }
  .store-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: clamp(13px, 1vw, 17px); }
  .store-row small { color: #aab2bf; font-weight: 900; white-space: nowrap; }
  .store-row em { color: white; font-style: normal; text-align: right; font-weight: 900; white-space: nowrap; }

  .mover-row { min-height: 44px; display: grid; grid-template-columns: 28px minmax(0, 1fr) 76px; align-items: center; gap: 10px; font-weight: 900; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .mover-row span, .mover-row em { color: #58c94f; font-style: normal; }
  .mover-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: clamp(13px, 1vw, 17px); }

  .good-news-box {
    margin-top: 18px;
    padding: 14px;
    display: grid;
    grid-template-columns: 42px 1fr;
    gap: 12px;
    border: 1px solid rgba(88,201,79,0.42);
    background: rgba(88,201,79,0.09);
  }
  .good-news-box > span { color: #58c94f; font-size: 32px; font-weight: 900; }
  .good-news-box strong { color: #58c94f; }
  .good-news-box p { margin: 5px 0 0; color: white; line-height: 1.28; font-size: 13px; }

  .zero-row { min-height: 37px; display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 10px; color: white; font-weight: 800; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .zero-row span { color: #ff4d3d; font-size: 13px; }
  .zero-row strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: clamp(13px, 1vw, 17px); }

  .regional-table { height: calc(100% - 44px); display: grid; grid-template-rows: 38px repeat(8, minmax(34px, 1fr)); }
  .regional-head,
  .regional-row { display: grid; grid-template-columns: 1.15fr 0.62fr 0.92fr 0.72fr 0.74fr 0.62fr; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.09); }
  .regional-head { color: rgba(255,255,255,0.78); font-size: clamp(11px, 0.88vw, 14px); font-weight: 900; }
  .regional-row { font-weight: 800; font-size: clamp(12px, 0.95vw, 16px); }
  .regional-row strong, .regional-row span, .regional-row em { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .regional-row strong { color: white; }
  .regional-row span { color: rgba(255,255,255,0.84); }
  .regional-row em { color: #ff4d3d; font-style: normal; font-weight: 900; }
  .total-row { border-top: 1px solid rgba(60,148,234,0.36); }
  .total-row strong, .total-row span { color: #7fc8ff; }

  .alert-row { min-height: 66px; display: grid; grid-template-columns: 32px 1fr; align-items: center; gap: 12px; padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.12); }
  .alert-row > span { font-size: 24px; font-weight: 900; }
  .alert-row.critical > span { color: #ff4d3d; }
  .alert-row.attention > span { color: #ffc22a; }
  .alert-row.good > span { color: #58c94f; }
  .alert-row.info > span { color: #3c94ea; }
  .alert-row strong { color: white; font-size: clamp(13px, 1vw, 17px); }
  .alert-row p { margin: 4px 0 0; color: rgba(255,255,255,0.78); line-height: 1.22; font-size: clamp(12px, .95vw, 15px); }

  .focus-box { margin-top: 14px; padding: 14px; border: 1px solid rgba(60,148,234,0.56); background: rgba(60,148,234,0.12); }
  .focus-box strong { color: #7fc8ff; }
  .focus-box p { margin: 7px 0 0; color: white; font-size: 13px; line-height: 1.28; }

  .prod-footer {
    height: 56px;
    padding: 0 22px;
    display: grid;
    grid-template-columns: 174px 1fr 260px;
    align-items: center;
    gap: 18px;
    border-top: 1px solid rgba(255,255,255,0.13);
    background: rgba(2,8,18,0.94);
  }

  .prod-footer-logo { display: flex; align-items: center; gap: 10px; color: white; }
  .prod-footer-logo svg { width: 30px; height: 30px; }
  .prod-footer-logo svg path { fill: none; stroke: #ffc22a; stroke-width: 4; stroke-linejoin: round; }
  .prod-footer-logo strong { font-weight: 900; }

  .prod-ticker-track { overflow: hidden; white-space: nowrap; }
  .prod-ticker-content { display: inline-block; color: rgba(255,255,255,0.78); font-weight: 800; animation: prodTicker 34s linear infinite; }
  @keyframes prodTicker { from { transform: translateX(48%); } to { transform: translateX(-100%); } }

  .prod-footer-phrase { justify-self: end; color: #ffc22a; font-size: 16px; font-weight: 900; }

  @media (max-height: 760px) {
    .prod-topbar { height: 86px; padding-top: 12px; }
    .prod-stage { height: calc(100vh - 140px); padding-top: 12px; padding-bottom: 12px; }
    .prod-footer { height: 54px; }
    .metric-grid, .insight-column, .prod-screen-grid { gap: 12px; }
    .metric-card { padding: 13px; grid-template-columns: 46px 1fr; }
    .metric-card > span { width: 42px; height: 42px; font-size: 17px; }
    .metric-card strong { font-size: clamp(24px, 2.6vw, 38px); }
    .prod-panel { padding: 14px 16px; }
    .store-row { min-height: 34px; }
    .zero-row { min-height: 33px; }
    .mover-row { min-height: 38px; }
    .alert-row { min-height: 58px; }
  }
`;
