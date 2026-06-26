const PAINEL_TV_SPREADSHEET_ID = '1vE3Ba1D9A5PyjazGuhJ4pk48GPdE4pEjpoQ2GVHiTsw';
const PAINEL_TV_DATA_FINAL = '30/06';

function doGet(e) {
  try {
    if (!painelTvTokenOk_(e)) {
      return painelTvJson_({
        ok: false,
        error: 'TOKEN_INVALIDO'
      });
    }

    return painelTvJson_(painelTvGetPayload_());

  } catch (err) {
    return painelTvJson_({
      ok: false,
      error: 'ERRO_INTERNO_APPS_SCRIPT',
      message: err && err.message ? err.message : String(err)
    });
  }
}

function painelTvJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function painelTvTokenOk_(e) {
  const tokenEsperado = PropertiesService
    .getScriptProperties()
    .getProperty('PAINEL_TV_TOKEN');

  if (!tokenEsperado) {
    return true;
  }

  const tokenRecebido = e && e.parameter
    ? String(e.parameter.token || '')
    : '';

  return tokenRecebido === tokenEsperado;
}

function painelTvGetPayload_() {
  const ss = SpreadsheetApp.openById(PAINEL_TV_SPREADSHEET_ID);

  const shPlacar = ss.getSheetByName('PLACAR_HOJE_TEMPO_REAL');
  const shRanking = ss.getSheetByName('RANKING_PRODUCAO_LOJAS');

  if (!shPlacar) {
    throw new Error('Aba PLACAR_HOJE_TEMPO_REAL não encontrada.');
  }

  if (!shRanking) {
    throw new Error('Aba RANKING_PRODUCAO_LOJAS não encontrada.');
  }

  const ultimaCarga = shPlacar.getRange('B3').getDisplayValue();
  const ranking = painelTvLerRanking_(shRanking);

  return {
    ok: true,
    source: 'apps-script',
    updatedAt: painelTvExtrairHora_(ultimaCarga),
    headlineDate: PAINEL_TV_DATA_FINAL,
    matches: painelTvLerJogos_(shPlacar),
    rankingTop: ranking.slice(0, 5),
    ticker: ranking.slice(5, 10)
  };
}

function painelTvLerJogos_(sh) {
  const lastRow = sh.getLastRow();

  if (lastRow < 6) {
    return [];
  }

  const values = sh
    .getRange(6, 1, lastRow - 5, 11)
    .getDisplayValues();

  return values
    .filter(function(row) {
      const fase = String(row[0] || '').toUpperCase();

      return fase &&
        row[1] &&
        row[3] &&
        (
          fase.includes('SEMIFINAL') ||
          fase.includes('SF') ||
          fase.includes('FINAL')
        );
    })
    .slice(0, 2)
    .map(function(row, index) {
      return painelTvNormalizarJogo_(row, index);
    });
}

function painelTvNormalizarJogo_(row, index) {
  const fase = String(row[0] || '').trim();
  const lojaA = String(row[1] || '').trim();
  const placarTexto = String(row[2] || '').trim();
  const lojaB = String(row[3] || '').trim();
  const vencedor = String(row[4] || '').trim();
  const criterioOriginal = String(row[5] || '').trim().toUpperCase();

  const placar = painelTvParsePlacar_(placarTexto);

  const contratosA = placar
    ? placar[0]
    : painelTvNumero_(row[7]);

  const contratosB = placar
    ? placar[1]
    : painelTvNumero_(row[9]);

  const empate = contratosA === contratosB;
  const criterioValor = criterioOriginal.includes('VALOR');

  const statusType = empate || criterioValor ? 'value' : 'contracts';

  return {
    id: painelTvExtrairIdJogo_(fase, index),
    status: statusType === 'value' ? 'DESEMPATE POR VALOR' : 'VANTAGEM POR CONTRATOS',
    statusType: statusType,
    left: painelTvTeam_(
      lojaA,
      index === 0 ? 'green' : 'gold',
      index === 0 ? 'mountain' : 'landmark'
    ),
    right: painelTvTeam_(
      lojaB,
      'blue',
      index === 0 ? 'city' : 'bridge'
    ),
    leftScore: contratosA,
    rightScore: contratosB,
    advancing: vencedor || (contratosA >= contratosB ? lojaA : lojaB),
    criterion: statusType === 'value' ? 'Valor produzido' : 'Contratos',
    distance: empate ? 'Empate' : painelTvDistancia_(contratosA, contratosB)
  };
}

function painelTvLerRanking_(sh) {
  const lastRow = sh.getLastRow();

  if (lastRow < 7) {
    return [];
  }

  const values = sh
    .getRange(7, 1, lastRow - 6, 6)
    .getValues();

  return values
    .filter(function(row) {
      return row[0] && row[1];
    })
    .map(function(row) {
      return {
        position: Number(row[0]),
        name: String(row[1]),
        value: painelTvFormatarMil_(row[4])
      };
    });
}

function painelTvTeam_(name, tone, badge) {
  const parts = String(name || '').trim().split(/\s+/);

  return {
    name: String(name || '').trim(),
    primary: parts.slice(0, 1).join(' ').toUpperCase(),
    secondary: parts.slice(1).join(' ').toUpperCase(),
    tone: tone,
    badge: badge
  };
}

function painelTvParsePlacar_(txt) {
  const m = String(txt || '').match(/(\d+)\s*x\s*(\d+)/i);

  if (!m) {
    return null;
  }

  return [
    Number(m[1]),
    Number(m[2])
  ];
}

function painelTvExtrairIdJogo_(fase, index) {
  const txt = String(fase || '').toUpperCase();

  if (txt.includes('SF1')) {
    return 'SF1';
  }

  if (txt.includes('SF2')) {
    return 'SF2';
  }

  if (txt.includes('FINAL')) {
    return 'FINAL';
  }

  return 'SF' + (index + 1);
}

function painelTvDistancia_(a, b) {
  const diff = Math.abs(Number(a) - Number(b));

  return '+' + diff + ' ' + (diff === 1 ? 'contrato' : 'contratos');
}

function painelTvNumero_(value) {
  const n = Number(String(value || '0').replace(',', '.'));

  return isNaN(n) ? 0 : n;
}

function painelTvFormatarMil_(value) {
  const n = Number(value || 0);
  const mil = n / 1000;

  return 'R$ ' + mil.toFixed(1).replace('.', ',') + ' mil';
}

function painelTvExtrairHora_(value) {
  const txt = String(value || '');
  const match = txt.match(/(\d{2}):(\d{2})/);

  if (match) {
    return match[1] + 'h' + match[2];
  }

  return Utilities.formatDate(
    new Date(),
    'America/Sao_Paulo',
    "HH'h'mm"
  );
}

function testarApiPainelTv() {
  Logger.log(JSON.stringify(painelTvGetPayload_(), null, 2));
}
