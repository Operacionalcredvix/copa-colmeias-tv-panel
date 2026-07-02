'use client';

import { useEffect, useMemo, useState } from 'react';

const POLL_MS = 15000;

export default function RadarClient() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const response = await fetch('/api/producao', { cache: 'no-store' });
      const payload = await response.json();
      if (alive) setData(payload);
    }

    load().catch(console.error);
    const interval = window.setInterval(() => load().catch(console.error), POLL_MS);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  const ticker = useMemo(() => {
    if (!data) return 'Carregando Radar de Produção...';
    const summary = data.summary || {};
    const items = Array.isArray(data.ticker) && data.ticker.length
      ? data.ticker
      : [
          `Contratos: ${summary.contractsToday || 0}`,
          `Produção: ${summary.productionTodayFormatted || 'R$ 0,00'}`,
          `Zeradas: ${summary.zeroStores || 0}`
        ];
    return items.join('   •   ');
  }, [data]);

  if (!data) {
    return (
      <main className="radarShell loading">
        <Style />
        <div className="loader">RADAR DE PRODUÇÃO<span>Carregando dados...</span></div>
      </main>
    );
  }

  const summary = data.summary || {};
  const stores = Array.isArray(data.topStores) ? data.topStores.slice(0, 5) : [];
  const leader = stores[0];
  const otherStores = stores.slice(1);
  const regionals = Array.isArray(data.regionalPerformance) ? data.regionalPerformance.slice(0, 4) : [];
  const maxRegional = Math.max(...regionals.map((row: any) => Number(row.production || 0)), 1);
  const rhythmPercent = Number(data.rhythm?.percent || 0);

  return (
    <main className="radarShell">
      <Style />

      <header className="topbar">
        <div className="brandBlock">
          <div className="mark">⬡</div>
          <div>
            <strong>RADAR DE PRODUÇÃO</strong>
            <span>CREDVIX • PAINEL EM TEMPO REAL</span>
          </div>
        </div>

        <div className="centerTitle">
          <span>ACOMPANHAMENTO COMERCIAL</span>
          <strong>{data.rhythm?.label || 'EM OBSERVAÇÃO'}</strong>
        </div>

        <div className="clockCard">
          <span>ATUALIZADO</span>
          <strong>{data.updatedAt || '--h--'}</strong>
          <em>{data.date || ''}</em>
        </div>
      </header>

      <section className="kpiGrid">
        <Kpi label="Contratos" value={summary.contractsToday || 0} detail="vs ontem" tone="blue" />
        <Kpi label="Produção" value={summary.productionTodayFormatted || 'R$ 0,00'} detail="vs média 7d" tone="gold" />
        <Kpi label="Ticket médio" value={summary.averageTicketFormatted || 'R$ 0,00'} detail="por contrato pago" tone="blue" />
        <Kpi label="Lojas ativas" value={`${summary.activeStores || 0}/${summary.totalStores || 0}`} detail={`${summary.zeroStores || 0} zeradas`} tone="red" />
      </section>

      <section className="mainGrid">
        <section className="panel rankingPanel">
          <h2>Top lojas do dia</h2>

          {leader ? (
            <div className="leaderCard">
              <div className="rankBadge">1</div>
              <div className="leaderName">
                <span>LOJA LÍDER</span>
                <strong>{leader.name}</strong>
                <em>{leader.regional}</em>
              </div>
              <div className="leaderMeta contracts">{leader.contracts} ct</div>
              <div className="leaderMeta money">{leader.productionFormatted}</div>
            </div>
          ) : (
            <div className="empty">Sem loja líder.</div>
          )}

          <div className="storeRows">
            {otherStores.map((store: any) => (
              <div className="storeRow" key={`${store.position}-${store.name}`}>
                <span>{store.position}</span>
                <div>
                  <strong>{store.name}</strong>
                  <em>{store.regional}</em>
                </div>
                <b>{store.contracts} ct</b>
                <small>{store.productionFormatted}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="rightStack">
          <div className="panel regionalPanel">
            <h2>Produção por regional</h2>
            <div className="regionalRows">
              {regionals.map((regional: any) => {
                const width = Math.max(7, (Number(regional.production || 0) / maxRegional) * 100);
                return (
                  <div className="regionalRow" key={regional.name}>
                    <div className="regionalText">
                      <strong>{regional.name}</strong>
                      <span>{regional.contracts} ct • {regional.activeStores}/{regional.totalStores} lojas • {regional.zeroStores} zeradas</span>
                    </div>
                    <div className="regionalBar"><i style={{ width: `${width}%` }} /></div>
                    <b>{regional.productionFormatted}</b>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel readingPanel">
            <h2>Leitura operacional</h2>

            <div className="readingCards">
              <div className="paceCard">
                <span>Ritmo</span>
                <strong>{rhythmPercent}%</strong>
                <em>{data.rhythm?.description || `${rhythmPercent}% da meta projetada do dia`}</em>
                <div className="progress"><i style={{ width: `${Math.max(6, Math.min(100, rhythmPercent))}%` }} /></div>
              </div>

              <div className="projectionCard">
                <span>Projeção</span>
                <strong>{summary.projectionFormatted || 'R$ 0,00'}</strong>
                <em>{summary.goalPercent || 0}% da meta</em>
              </div>
            </div>

            <div className="diagnosticCard">
              <div>
                <span>Diagnóstico</span>
                <em>{data.aiReading?.status || 'N/A'} • {data.aiReading?.generatedAt || '--'}</em>
              </div>
              <p>{data.aiReading?.text || 'Leitura operacional indisponível.'}</p>
            </div>
          </div>
        </section>
      </section>

      <footer className="footerBar">
        <strong>CREDVIX</strong>
        <span>{ticker}</span>
        <em>{data.version || 'RADAR'}</em>
      </footer>
    </main>
  );
}

function Kpi({ label, value, detail, tone }: any) {
  return (
    <div className={`kpiCard ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

function Style() {
  return (
    <style jsx global>{`
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; overflow: hidden; background: #020812; }

      .radarShell {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        color: #f8fbff;
        font-family: Inter, Arial, sans-serif;
        display: grid;
        grid-template-rows: 64px 78px minmax(0, 1fr) 34px;
        background:
          radial-gradient(circle at 8% 0%, rgba(255, 193, 43, 0.13), transparent 28%),
          radial-gradient(circle at 93% 14%, rgba(47, 146, 255, 0.16), transparent 30%),
          linear-gradient(135deg, #020812 0%, #061a2f 56%, #020812 100%);
      }

      .radarShell::before {
        content: '';
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.14;
        background-image:
          linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
        background-size: 30px 30px;
      }

      .loading { display: grid; place-items: center; }
      .loader {
        position: relative;
        z-index: 1;
        width: 460px;
        padding: 34px;
        text-align: center;
        border-radius: 22px;
        background: rgba(8, 22, 38, 0.94);
        border: 1px solid rgba(255,255,255,0.12);
        color: #fff;
        font-size: 30px;
        font-weight: 1000;
      }
      .loader span { display: block; margin-top: 8px; color: #aeb8c4; font-size: 14px; }

      .topbar {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr) 142px;
        gap: 14px;
        align-items: center;
        padding: 8px 16px;
        background: rgba(2, 8, 18, 0.82);
        border-bottom: 1px solid rgba(255,255,255,0.10);
      }

      .brandBlock { display: flex; align-items: center; gap: 11px; min-width: 0; }
      .mark {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border-radius: 13px;
        border: 1px solid rgba(255,193,43,0.34);
        color: #ffc12b;
        background: rgba(255,193,43,0.07);
        font-size: 25px;
        line-height: 1;
      }
      .brandBlock strong { display: block; font-size: 19px; line-height: 0.92; font-weight: 1000; }
      .brandBlock span { display: block; margin-top: 5px; color: #ffc12b; font-size: 10px; font-weight: 900; letter-spacing: 0.12em; white-space: nowrap; }

      .centerTitle { text-align: center; min-width: 0; }
      .centerTitle span { display: block; color: #b8c2ce; font-size: 10px; font-weight: 900; letter-spacing: 0.24em; }
      .centerTitle strong {
        display: block;
        margin-top: 2px;
        font-size: 24px;
        line-height: 1;
        font-style: italic;
        font-weight: 1000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .clockCard {
        justify-self: end;
        width: 138px;
        padding: 6px 9px;
        text-align: right;
        border-radius: 13px;
        border: 1px solid rgba(255,193,43,0.32);
        background: linear-gradient(180deg, rgba(255,193,43,0.09), rgba(255,255,255,0.025));
      }
      .clockCard span { display: block; color: #b8c2ce; font-size: 9px; font-weight: 900; }
      .clockCard strong { display: block; color: #ffc12b; font-size: 29px; line-height: 0.94; font-weight: 1000; }
      .clockCard em { display: block; color: #b8c2ce; font-size: 9px; font-style: normal; font-weight: 800; }

      .kpiGrid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        padding: 8px 16px;
        min-height: 0;
      }

      .kpiCard {
        min-width: 0;
        height: 62px;
        overflow: hidden;
        padding: 9px 13px;
        border-radius: 15px;
        border: 1px solid rgba(255,255,255,0.10);
        border-top: 3px solid #45a7ff;
        background: linear-gradient(180deg, rgba(11,28,48,0.96), rgba(6,17,31,0.96));
        box-shadow: 0 12px 24px rgba(0,0,0,0.20);
      }
      .kpiCard.gold { border-top-color: #ffc12b; }
      .kpiCard.red { border-top-color: #ff6673; }
      .kpiCard span { display: block; color: #aeb8c4; font-size: 10px; font-weight: 900; text-transform: uppercase; }
      .kpiCard strong { display: block; margin-top: 3px; font-size: 25px; line-height: 1; font-weight: 1000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kpiCard.gold strong { color: #ffc12b; }
      .kpiCard.red strong { color: #ff7171; }
      .kpiCard em { display: block; margin-top: 3px; color: #aeb8c4; font-size: 9px; font-style: normal; font-weight: 800; }

      .mainGrid {
        position: relative;
        z-index: 1;
        min-height: 0;
        overflow: hidden;
        display: grid;
        grid-template-columns: 57% 43%;
        gap: 12px;
        padding: 7px 16px 8px;
      }

      .panel {
        min-height: 0;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(11,28,48,0.96), rgba(6,17,31,0.96));
        padding: 10px 13px;
        box-shadow: 0 16px 32px rgba(0,0,0,0.24);
      }
      .panel h2 { margin: 0 0 8px; color: #ffc12b; font-size: 17px; line-height: 1; font-weight: 1000; text-transform: uppercase; letter-spacing: 0.04em; }

      .rankingPanel { display: grid; grid-template-rows: auto 72px minmax(0, 1fr); gap: 0; }
      .leaderCard {
        height: 70px;
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) 62px 116px;
        gap: 9px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 13px;
        background: radial-gradient(circle at 6% 0%, rgba(255,193,43,0.15), transparent 38%), #132327;
        border: 1px solid rgba(255,193,43,0.18);
      }
      .rankBadge {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: linear-gradient(135deg, #ffb01f, #ffd35d);
        color: #07111c;
        font-size: 22px;
        font-weight: 1000;
      }
      .leaderName { min-width: 0; }
      .leaderName span { display: block; color: #ffc12b; font-size: 8px; font-weight: 1000; letter-spacing: 0.06em; }
      .leaderName strong { display: block; margin-top: 3px; font-size: 21px; line-height: 1; font-weight: 1000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .leaderName em { display: block; margin-top: 3px; color: #aeb8c4; font-size: 9px; font-style: normal; font-weight: 800; }
      .leaderMeta { padding: 7px 8px; border-radius: 10px; background: rgba(255,255,255,0.055); font-size: 13px; font-weight: 1000; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .leaderMeta.contracts { color: #65e29f; }
      .leaderMeta.money { color: #ffc12b; }

      .storeRows { min-height: 0; display: grid; grid-template-rows: repeat(4, minmax(0, 1fr)); gap: 6px; padding-top: 7px; }
      .storeRow {
        min-height: 0;
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr) 54px 110px;
        gap: 8px;
        align-items: center;
        padding: 6px 9px;
        border-radius: 11px;
        background: rgba(13, 26, 41, 0.92);
        border: 1px solid rgba(255,255,255,0.055);
      }
      .storeRow > span { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: #ffc12b; background: rgba(255,193,43,0.15); font-size: 13px; font-weight: 1000; }
      .storeRow div { min-width: 0; }
      .storeRow strong { display: block; font-size: 14px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .storeRow em { display: block; margin-top: 2px; color: #87919d; font-size: 9px; font-style: normal; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .storeRow b { color: #65e29f; font-size: 12px; text-align: right; white-space: nowrap; }
      .storeRow small { color: #ffc12b; font-size: 12px; font-weight: 1000; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .rightStack { min-height: 0; display: grid; grid-template-rows: 43% 57%; gap: 12px; overflow: hidden; }
      .regionalPanel { display: grid; grid-template-rows: auto minmax(0, 1fr); }
      .regionalRows { min-height: 0; display: grid; grid-template-rows: repeat(4, minmax(0, 1fr)); gap: 7px; }
      .regionalRow { min-height: 0; display: grid; grid-template-columns: 145px minmax(0, 1fr) 106px; gap: 8px; align-items: center; }
      .regionalText { min-width: 0; }
      .regionalText strong { display: block; font-size: 13px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .regionalText span { display: block; margin-top: 3px; color: #87919d; font-size: 8px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .regionalBar { height: 13px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
      .regionalBar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ff9018, #ffd052); }
      .regionalRow b { color: #ffc12b; font-size: 12px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .readingPanel { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 8px; }
      .readingPanel h2 { margin-bottom: 0; }
      .readingCards { display: grid; grid-template-columns: 1fr 122px; gap: 8px; }
      .paceCard, .projectionCard, .diagnosticCard {
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(13, 26, 41, 0.92);
        padding: 8px;
        min-width: 0;
      }
      .paceCard span, .projectionCard span, .diagnosticCard span { display: block; color: #aeb8c4; font-size: 8px; font-weight: 1000; text-transform: uppercase; }
      .paceCard strong { display: block; margin-top: 2px; color: #ff7171; font-size: 25px; line-height: 1; font-weight: 1000; }
      .projectionCard strong { display: block; margin-top: 5px; color: #fff; font-size: 13px; line-height: 1.1; font-weight: 1000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .paceCard em, .projectionCard em { display: block; margin-top: 3px; color: #aeb8c4; font-size: 8px; font-style: normal; font-weight: 800; }
      .progress { height: 7px; margin-top: 6px; border-radius: 999px; background: rgba(255,255,255,0.09); overflow: hidden; }
      .progress i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #ff5f6d, #ffc12b); }

      .diagnosticCard { min-height: 0; }
      .diagnosticCard div { display: flex; justify-content: space-between; gap: 8px; }
      .diagnosticCard span { color: #ffc12b; }
      .diagnosticCard em { color: #87919d; font-size: 8px; font-style: normal; font-weight: 800; white-space: nowrap; }
      .diagnosticCard p { margin: 5px 0 0; color: #e8edf5; font-size: 11px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

      .footerBar {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 88px minmax(0, 1fr) 98px;
        gap: 10px;
        align-items: center;
        padding: 0 16px;
        background: rgba(2, 8, 18, 0.92);
        border-top: 1px solid rgba(255,255,255,0.10);
        overflow: hidden;
      }
      .footerBar strong { color: #ffc12b; font-size: 12px; font-weight: 1000; }
      .footerBar span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #e8edf5; font-size: 11px; font-weight: 900; }
      .footerBar em { text-align: right; color: #87919d; font-size: 9px; font-style: normal; font-weight: 900; white-space: nowrap; }
    `}</style>
  );
}
