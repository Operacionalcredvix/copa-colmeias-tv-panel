/**
 * Painel de Produção CredVix — API JSON para TV
 *
 * IMPORTANTE:
 * Este arquivo NÃO cria outro doGet, para não conflitar com o ApiPainelTV.gs.
 * Cole este arquivo no Apps Script e, no doGet(e) existente, adicione a rota:
 *
 * if (String(e && e.parameter && e.parameter.painel || '').toLowerCase() === 'producao') {
 *   return painelTvJson_(painelProducaoGetPayload_());
 * }
 *
 * Depois use na Vercel:
 * APPS_SCRIPT_PRODUCAO_URL = https://script.google.com/macros/s/SEU_DEPLOY/exec?token=copa-tv-2026-credvix&painel=producao
 */

const PAINEL_PRODUCAO_SPREADSHEET_ID = '1vE3Ba1D9A5PyjazGuhJ4pk48GPdE4pEjpoQ2GVHiTsw';
const PAINEL_PRODUCAO_TZ = 'America/Sao_Paulo';
const PAINEL_PRODUCAO_CACHE_MINUTOS = 30;
const PAINEL_PRODUCAO_META_DIA = 340000;

function painelProducaoGetPayload_() {
  const ss = SpreadsheetApp.openById(PAINEL_PRODUCAO_SPREADSHEET_ID);
  const shBase = ss.getSheetByName('BASE_COPA') || ss.getSheetByName('base_propostas_pagas');
  const shMapa = ss.getSheetByName('MAPA_LOJAS');

  if (!shBase) {
    throw new Error('Aba BASE_COPA ou base_propostas_pagas não encontrada.');
  }

  const now = new Date();
  const todayKey = Utilities.formatDate(now, PAINEL_PRODUCAO_TZ, 'yyyy-MM-dd');
  const updatedAt = Utilities.formatDate(now, PAINEL_PRODUCAO_TZ, "HH'h'mm");

  const base = painelProducaoLerBase_(shBase);
  const mapa = shMapa ? painelProducaoLerMapaLojas_(shMapa) : { lojas: [], regionalPorLoja: {} };
  const producaoHoje = painelProducaoFiltrarHoje_(base.rows, base.headers, todayKey);
  const lojasOficiais = painelProducaoListarLojas_(mapa.lojas, base.rows, base.headers);

  const porLoja = painelProducaoAgruparPorLoja_(producaoHoje);
  const porRegional = painelProducaoAgruparPorRegional_(porLoja, lojasOficiais, mapa.regionalPorLoja);
  const resumo = painelProducaoMontarResumo_(porLoja, lojasOficiais);
  const topStores = painelProducaoMontarTopLojas_(porLoja);
  const zeroStoresList = painelProducaoMontarZeradas_(lojasOficiais, porLoja);
  const regionalPerformance = painelProducaoMontarRegionais_(porRegional);
  const movers = painelProducaoCalcularMovers_(porLoja);
  const alerts = painelProducaoMontarAlertas_(resumo, topStores, zeroStoresList, regionalPerformance);
  const rhythm = painelProducaoMontarRitmo_(resumo);

  const payloadBase = {
    ok: true,
    source: 'apps-script',
    updatedAt: updatedAt,
    dateLabel: 'HOJE',
    summary: resumo,
    deltas: painelProducaoMontarDeltas_(resumo),
    rhythm: rhythm,
    topStores: topStores,
    movers: movers,
    zeroStoresList: zeroStoresList,
    regionalPerformance: regionalPerformance,
    alerts: alerts,
    ticker: painelProducaoMontarTicker_(resumo, topStores, zeroStoresList, alerts)
  };

  payloadBase.aiReading = painelProducaoGetAiReading_(payloadBase);

  painelProducaoSalvarSnapshot_(porLoja);

  return payloadBase;
}

function painelProducaoLerBase_(sh) {
  const values = sh.getDataRange().getValues();

  if (values.length < 2) {
    return { headers: {}, rows: [] };
  }

  const headerRow = values[0].map(function (h) {
    return painelProducaoNormalizarTexto_(h);
  });

  const headers = {};
  headerRow.forEach(function (h, idx) {
    if (h) headers[h] = idx;
  });

  const rows = values.slice(1);
  return { headers: headers, rows: rows };
}

function painelProducaoLerMapaLojas_(sh) {
  const values = sh.getDataRange().getValues();

  if (values.length < 2) {
    return { lojas: [], regionalPorLoja: {} };
  }

  const headers = {};
  values[0].forEach(function (h, idx) {
    headers[painelProducaoNormalizarTexto_(h)] = idx;
  });

  const idxLoja = painelProducaoPrimeiroIndice_(headers, ['loja_oficial', 'loja oficial', 'loja']);
  const idxRegional = painelProducaoPrimeiroIndice_(headers, ['regional', 'supervisor', 'coordenador', 'colmeia']);
  const lojas = [];
  const regionalPorLoja = {};

  values.slice(1).forEach(function (row) {
    const loja = painelProducaoTexto_(row[idxLoja]);
    if (!loja) return;

    if (lojas.indexOf(loja) === -1) lojas.push(loja);
    regionalPorLoja[loja] = idxRegional >= 0 ? (painelProducaoTexto_(row[idxRegional]) || 'Sem regional') : 'Sem regional';
  });

  return { lojas: lojas, regionalPorLoja: regionalPorLoja };
}

function painelProducaoFiltrarHoje_(rows, headers, todayKey) {
  const idxPagamento = painelProducaoPrimeiroIndice_(headers, ['pagamento', 'data_pagamento', 'data']);
  const idxProposta = painelProducaoPrimeiroIndice_(headers, ['proposta', 'contrato']);
  const idxLojaOficial = painelProducaoPrimeiroIndice_(headers, ['loja_oficial', 'loja oficial', 'loja']);
  const idxStatus = painelProducaoPrimeiroIndice_(headers, ['status_normalizacao', 'status']);
  const idxGrupo = painelProducaoPrimeiroIndice_(headers, ['grupo']);
  const idxValor = painelProducaoPrimeiroIndice_(headers, ['valor', 'producao']);

  return rows
    .filter(function (row) {
      const dataKey = painelProducaoDateKey_(row[idxPagamento]);
      if (dataKey !== todayKey) return false;

      if (idxStatus >= 0) {
        const status = painelProducaoTexto_(row[idxStatus]).toUpperCase();
        if (status && status !== 'OK') return false;
      }

      if (idxGrupo >= 0) {
        const grupo = painelProducaoNormalizarTexto_(row[idxGrupo]);
        if (grupo && grupo !== painelProducaoNormalizarTexto_('Crédito na Conta')) return false;
      }

      const loja = painelProducaoTexto_(row[idxLojaOficial]);
      const proposta = painelProducaoTexto_(row[idxProposta]);
      if (!loja || !proposta) return false;

      return true;
    })
    .map(function (row) {
      return {
        loja: painelProducaoTexto_(row[idxLojaOficial]),
        proposta: painelProducaoTexto_(row[idxProposta]),
        valor: painelProducaoNumero_(row[idxValor])
      };
    });
}

function painelProducaoListarLojas_(lojasMapa, rows, headers) {
  if (lojasMapa && lojasMapa.length) {
    return lojasMapa.slice().sort();
  }

  const idxLoja = painelProducaoPrimeiroIndice_(headers, ['loja_oficial', 'loja oficial', 'loja']);
  const lojas = [];

  rows.forEach(function (row) {
    const loja = painelProducaoTexto_(row[idxLoja]);
    if (loja && lojas.indexOf(loja) === -1) lojas.push(loja);
  });

  return lojas.sort();
}

function painelProducaoAgruparPorLoja_(registros) {
  const mapa = {};
  const propostasPorLoja = {};

  registros.forEach(function (item) {
    if (!mapa[item.loja]) {
      mapa[item.loja] = { name: item.loja, contracts: 0, valueNumber: 0 };
      propostasPorLoja[item.loja] = {};
    }

    if (!propostasPorLoja[item.loja][item.proposta]) {
      propostasPorLoja[item.loja][item.proposta] = true;
      mapa[item.loja].contracts += 1;
    }

    mapa[item.loja].valueNumber += item.valor;
  });

  return mapa;
}

function painelProducaoAgruparPorRegional_(porLoja, lojasOficiais, regionalPorLoja) {
  const mapa = {};

  lojasOficiais.forEach(function (loja) {
    const regional = regionalPorLoja[loja] || 'Sem regional';

    if (!mapa[regional]) {
      mapa[regional] = {
        name: regional,
        contracts: 0,
        valueNumber: 0,
        activeStores: 0,
        zeroStores: 0
      };
    }

    const item = porLoja[loja];

    if (item && item.contracts > 0) {
      mapa[regional].contracts += item.contracts;
      mapa[regional].valueNumber += item.valueNumber;
      mapa[regional].activeStores += 1;
    } else {
      mapa[regional].zeroStores += 1;
    }
  });

  return mapa;
}

function painelProducaoMontarResumo_(porLoja, lojasOficiais) {
  let contracts = 0;
  let productionNumber = 0;
  let activeStores = 0;

  Object.keys(porLoja).forEach(function (loja) {
    contracts += porLoja[loja].contracts;
    productionNumber += porLoja[loja].valueNumber;
    if (porLoja[loja].contracts > 0) activeStores += 1;
  });

  const zeroStores = Math.max(0, lojasOficiais.length - activeStores);
  const averageTicketNumber = contracts ? productionNumber / contracts : 0;
  const projectionNumber = painelProducaoProjetarDia_(productionNumber);
  const goalPercent = PAINEL_PRODUCAO_META_DIA ? Math.round((projectionNumber / PAINEL_PRODUCAO_META_DIA) * 100) : 0;

  return {
    contracts: contracts,
    production: painelProducaoFormatarMil_(productionNumber),
    averageTicket: painelProducaoFormatarMil_(averageTicketNumber),
    activeStores: activeStores,
    zeroStores: zeroStores,
    projection: painelProducaoFormatarMil_(projectionNumber),
    goalPercent: goalPercent
  };
}

function painelProducaoMontarTopLojas_(porLoja) {
  return Object.keys(porLoja)
    .map(function (loja) {
      return porLoja[loja];
    })
    .sort(function (a, b) {
      return b.valueNumber - a.valueNumber || b.contracts - a.contracts || a.name.localeCompare(b.name);
    })
    .slice(0, 10)
    .map(function (item, index) {
      return {
        position: index + 1,
        name: item.name,
        contracts: item.contracts,
        value: painelProducaoFormatarMil_(item.valueNumber)
      };
    });
}

function painelProducaoMontarZeradas_(lojasOficiais, porLoja) {
  return lojasOficiais
    .filter(function (loja) {
      return !porLoja[loja] || porLoja[loja].contracts === 0;
    })
    .sort()
    .slice(0, 14);
}

function painelProducaoMontarRegionais_(porRegional) {
  return Object.keys(porRegional)
    .map(function (regional) {
      const item = porRegional[regional];
      const ticket = item.contracts ? item.valueNumber / item.contracts : 0;

      return {
        name: item.name,
        contracts: item.contracts,
        production: painelProducaoFormatarMil_(item.valueNumber),
        averageTicket: item.contracts ? painelProducaoFormatarMil_(ticket) : '-',
        activeStores: item.activeStores,
        zeroStores: item.zeroStores,
        valueNumber: item.valueNumber
      };
    })
    .sort(function (a, b) {
      return b.valueNumber - a.valueNumber || b.contracts - a.contracts || a.name.localeCompare(b.name);
    })
    .slice(0, 8)
    .map(function (item) {
      delete item.valueNumber;
      return item;
    });
}

function painelProducaoCalcularMovers_(porLoja) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('PAINEL_PRODUCAO_LAST_SNAPSHOT');
  const anterior = raw ? JSON.parse(raw) : {};

  return Object.keys(porLoja)
    .map(function (loja) {
      const atual = porLoja[loja];
      const prev = anterior[loja] || { contracts: 0, valueNumber: 0 };
      return {
        name: loja,
        contractsDelta: Math.max(0, atual.contracts - Number(prev.contracts || 0)),
        valueDeltaNumber: Math.max(0, atual.valueNumber - Number(prev.valueNumber || 0))
      };
    })
    .filter(function (item) {
      return item.contractsDelta > 0 || item.valueDeltaNumber > 0;
    })
    .sort(function (a, b) {
      return b.contractsDelta - a.contractsDelta || b.valueDeltaNumber - a.valueDeltaNumber || a.name.localeCompare(b.name);
    })
    .slice(0, 6)
    .map(function (item) {
      return {
        name: item.name,
        contractsDelta: item.contractsDelta,
        valueDelta: painelProducaoFormatarMil_(item.valueDeltaNumber)
      };
    });
}

function painelProducaoSalvarSnapshot_(porLoja) {
  const snapshot = {};

  Object.keys(porLoja).forEach(function (loja) {
    snapshot[loja] = {
      contracts: porLoja[loja].contracts,
      valueNumber: porLoja[loja].valueNumber
    };
  });

  PropertiesService.getScriptProperties().setProperty('PAINEL_PRODUCAO_LAST_SNAPSHOT', JSON.stringify(snapshot));
}

function painelProducaoMontarAlertas_(resumo, topStores, zeroStoresList, regionalPerformance) {
  const alerts = [];

  if (resumo.zeroStores > 0) {
    alerts.push({
      level: resumo.zeroStores >= 8 ? 'critical' : 'attention',
      title: 'Lojas zeradas',
      description: resumo.zeroStores + ' lojas ainda sem produção hoje.'
    });
  }

  const regionalCritica = regionalPerformance.slice().sort(function (a, b) {
    return b.zeroStores - a.zeroStores;
  })[0];

  if (regionalCritica && regionalCritica.zeroStores > 0) {
    alerts.push({
      level: regionalCritica.zeroStores >= 4 ? 'critical' : 'attention',
      title: 'Regional crítica',
      description: regionalCritica.name + ' com ' + regionalCritica.zeroStores + ' lojas zeradas.'
    });
  }

  if (topStores.length >= 3) {
    alerts.push({
      level: 'info',
      title: 'Concentração',
      description: 'Top 3 concentra parte relevante da produção do dia.'
    });
  }

  if (topStores[0]) {
    alerts.push({
      level: 'good',
      title: 'Destaque do dia',
      description: topStores[0].name + ' lidera a produção hoje.'
    });
  }

  if (!alerts.length) {
    alerts.push({
      level: 'good',
      title: 'Operação saudável',
      description: 'Sem alertas críticos no momento.'
    });
  }

  return alerts.slice(0, 5);
}

function painelProducaoMontarRitmo_(resumo) {
  const percent = Math.max(0, Math.min(100, resumo.goalPercent || 0));
  let label = 'EM OBSERVAÇÃO';
  let tone = 'neutral';

  if (percent >= 90) {
    label = 'ACIMA DA META';
    tone = 'positive';
  } else if (percent >= 70) {
    label = 'EM RITMO BOM';
    tone = 'positive';
  } else if (percent >= 45) {
    label = 'RITMO MODERADO';
    tone = 'neutral';
  } else {
    label = 'ABAIXO DO RITMO';
    tone = 'negative';
  }

  return {
    label: label,
    description: percent + '% da meta projetada do dia',
    percent: percent,
    tone: tone
  };
}

function painelProducaoMontarDeltas_(resumo) {
  return {
    contracts: { label: resumo.contracts + ' contratos hoje', tone: resumo.contracts > 0 ? 'positive' : 'neutral' },
    production: { label: 'produção acumulada', tone: resumo.contracts > 0 ? 'positive' : 'neutral' },
    averageTicket: { label: 'ticket do dia', tone: 'neutral' },
    activeStores: { label: resumo.activeStores + ' lojas ativas', tone: resumo.activeStores > 0 ? 'positive' : 'neutral' },
    zeroStores: { label: resumo.zeroStores + ' zeradas', tone: resumo.zeroStores > 0 ? 'negative' : 'positive' },
    projection: { label: resumo.goalPercent + '% da meta', tone: resumo.goalPercent >= 70 ? 'positive' : 'neutral' },
    goalPercent: undefined
  };
}

function painelProducaoMontarTicker_(resumo, topStores, zeroStoresList, alerts) {
  const ticker = [];

  ticker.push('Contratos hoje: ' + resumo.contracts);
  ticker.push('Produção hoje: ' + resumo.production);
  ticker.push('Lojas zeradas: ' + resumo.zeroStores);

  if (topStores[0]) ticker.push('Líder do dia: ' + topStores[0].name + ' — ' + topStores[0].value);
  if (zeroStoresList.length) ticker.push('Prioridade: reduzir lojas zeradas');
  if (alerts[0]) ticker.push(alerts[0].title + ': ' + alerts[0].description);

  return ticker;
}

function painelProducaoGetAiReading_(payloadBase) {
  const props = PropertiesService.getScriptProperties();
  const cacheRaw = props.getProperty('PAINEL_PRODUCAO_AI_CACHE');
  const signature = painelProducaoAssinatura_(payloadBase);
  const now = new Date();

  if (cacheRaw) {
    try {
      const cache = JSON.parse(cacheRaw);
      const idadeMin = (now.getTime() - new Date(cache.generatedAtIso).getTime()) / 60000;

      if (cache.signature === signature && idadeMin < PAINEL_PRODUCAO_CACHE_MINUTOS) {
        return {
          generatedAt: cache.generatedAt,
          text: cache.text,
          status: 'CACHE'
        };
      }
    } catch (err) {
      // Cache inválido. Segue sem bloquear.
    }
  }

  try {
    const text = painelProducaoChamarDeepSeek_(payloadBase);
    const generatedAt = Utilities.formatDate(now, PAINEL_PRODUCAO_TZ, "HH'h'mm");

    props.setProperty('PAINEL_PRODUCAO_AI_CACHE', JSON.stringify({
      signature: signature,
      generatedAt: generatedAt,
      generatedAtIso: now.toISOString(),
      text: text
    }));

    return {
      generatedAt: generatedAt,
      text: text,
      status: 'OK'
    };
  } catch (err) {
    return {
      generatedAt: Utilities.formatDate(now, PAINEL_PRODUCAO_TZ, "HH'h'mm"),
      text: painelProducaoLeituraFallback_(payloadBase),
      status: 'FALLBACK'
    };
  }
}

function painelProducaoChamarDeepSeek_(payloadBase) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('DEEPSEEK_API_KEY') || props.getProperty('DEEPSEEK_TOKEN') || props.getProperty('DEEPSEEK_CREDVIX_TOKEN');

  if (!apiKey) {
    throw new Error('Token DeepSeek não configurado nas Propriedades do Script.');
  }

  const context = {
    updatedAt: payloadBase.updatedAt,
    summary: payloadBase.summary,
    rhythm: payloadBase.rhythm,
    topStores: payloadBase.topStores.slice(0, 5),
    movers: payloadBase.movers.slice(0, 5),
    zeroStoresList: payloadBase.zeroStoresList.slice(0, 8),
    regionalPerformance: payloadBase.regionalPerformance.slice(0, 5),
    alerts: payloadBase.alerts.slice(0, 5)
  };

  const body = {
    model: 'deepseek-chat',
    temperature: 0.25,
    max_tokens: 180,
    messages: [
      {
        role: 'system',
        content: 'Você é um analista operacional da CredVix. Gere uma leitura curta para TV corporativa. Seja direto, prático e orientado a ação. Não invente dados. Não use markdown. Máximo de 4 frases curtas.'
      },
      {
        role: 'user',
        content: 'Analise este cenário de produção e gere a leitura IA para o painel: ' + JSON.stringify(context)
      }
    ]
  };

  const response = UrlFetchApp.fetch('https://api.deepseek.com/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const raw = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('DeepSeek respondeu HTTP ' + code + ': ' + raw);
  }

  const json = JSON.parse(raw);
  const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
    ? String(json.choices[0].message.content).trim()
    : '';

  if (!text) {
    throw new Error('DeepSeek não retornou texto.');
  }

  return text.replace(/\s+/g, ' ').slice(0, 520);
}

function painelProducaoLeituraFallback_(payloadBase) {
  const resumo = payloadBase.summary;
  const top = payloadBase.topStores[0] ? payloadBase.topStores[0].name : 'sem líder definido';
  const zeradas = resumo.zeroStores;

  if (resumo.contracts === 0) {
    return 'Ainda não há produção registrada hoje. A prioridade é ativar as primeiras lojas e acompanhar a próxima carga da base.';
  }

  if (zeradas > 0) {
    return 'O dia já tem produção registrada, com ' + resumo.contracts + ' contratos e ' + resumo.production + '. A liderança parcial é de ' + top + '. O principal ponto de atenção são ' + zeradas + ' lojas zeradas, que precisam ser acionadas.';
  }

  return 'O dia está saudável, com ' + resumo.contracts + ' contratos e ' + resumo.production + ' em produção. A liderança parcial é de ' + top + '. O foco agora é manter ritmo e proteger o ticket médio.';
}

function painelProducaoAssinatura_(payloadBase) {
  return JSON.stringify({
    contracts: payloadBase.summary.contracts,
    production: payloadBase.summary.production,
    activeStores: payloadBase.summary.activeStores,
    zeroStores: payloadBase.summary.zeroStores,
    leader: payloadBase.topStores[0] ? payloadBase.topStores[0].name : '',
    critical: payloadBase.alerts[0] ? payloadBase.alerts[0].description : ''
  });
}

function painelProducaoProjetarDia_(productionNumber) {
  const now = new Date();
  const hora = Number(Utilities.formatDate(now, PAINEL_PRODUCAO_TZ, 'H'));
  const minuto = Number(Utilities.formatDate(now, PAINEL_PRODUCAO_TZ, 'm'));
  const minutosAgora = hora * 60 + minuto;
  const inicio = 9 * 60;
  const fim = 18 * 60;

  if (minutosAgora <= inicio) return productionNumber;
  if (minutosAgora >= fim) return productionNumber;

  const progresso = Math.max(0.15, Math.min(1, (minutosAgora - inicio) / (fim - inicio)));
  return productionNumber / progresso;
}

function painelProducaoPrimeiroIndice_(headers, names) {
  for (let i = 0; i < names.length; i++) {
    const key = painelProducaoNormalizarTexto_(names[i]);
    if (headers[key] !== undefined) return headers[key];
  }
  return -1;
}

function painelProducaoDateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, PAINEL_PRODUCAO_TZ, 'yyyy-MM-dd');
  }

  const txt = painelProducaoTexto_(value);
  const m = txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (m) {
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }

  const iso = txt.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  return '';
}

function painelProducaoNumero_(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;

  const txt = String(value || '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');

  const n = Number(txt);
  return isNaN(n) ? 0 : n;
}

function painelProducaoFormatarMil_(value) {
  const n = Number(value || 0);

  if (Math.abs(n) >= 1000) {
    return 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + ' mil';
  }

  return 'R$ ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function painelProducaoTexto_(value) {
  return String(value || '').trim();
}

function painelProducaoNormalizarTexto_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function testarApiPainelProducao() {
  Logger.log(JSON.stringify(painelProducaoGetPayload_(), null, 2));
}
