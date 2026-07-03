import { getRadarPayload } from './radar-core';

const AI_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const AI_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

export async function handleStructuredAiRequest(request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const noCache = url.searchParams.get('refresh') === '1' || url.searchParams.get('cache') === '0';

  try {
    const payload = await getRadarPayload({ noCache });
    const ai = await buildStructuredDeepSeekReading(payload);

    return Response.json({
      ok: true,
      source: 'vercel',
      version: payload.version,
      mode: 'ai',
      ai,
      diagnostics: {
        responseMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
        env: {
          deepseek: Boolean(process.env.DEEPSEEK_API_KEY)
        }
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      ok: false,
      source: 'vercel',
      mode: 'ai',
      error: 'STRUCTURED_AI_ERROR',
      message: error?.message || String(error),
      diagnostics: {
        responseMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
        env: {
          deepseek: Boolean(process.env.DEEPSEEK_API_KEY)
        }
      }
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function buildStructuredDeepSeekReading(payload) {
  const fallback = buildFallback(payload);

  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      status: 'TOKEN_AUSENTE',
      generatedAt: hourNow(),
      text: fallback.executiveSummary,
      structured: fallback
    };
  }

  const input = buildAiInput(payload);
  const prompt = [
    'Você é uma IA de inteligência comercial da CREDVIX.',
    'Use apenas os dados do JSON enviado. Não invente números.',
    'Responda somente JSON válido. Não use markdown, títulos markdown, tabelas, pipes, emojis ou comentários fora do JSON.',
    'O JSON deve seguir exatamente este formato:',
    '{',
    '  "headline": "string curta",',
    '  "executiveSummary": "máximo 180 caracteres",',
    '  "priority": "string curta",',
    '  "actions": [',
    '    { "title": "string", "detail": "string curta", "responsible": "string", "severity": "critical|attention|normal" }',
    '  ],',
    '  "risks": [',
    '    { "title": "string", "detail": "string curta", "severity": "critical|attention|normal" }',
    '  ],',
    '  "questions": ["string curta"]',
    '}',
    'Regras:',
    '- actions deve ter no máximo 3 itens.',
    '- risks deve ter no máximo 2 itens.',
    '- questions deve ter no máximo 2 itens.',
    '- Priorize projeção mensal negativa, lojas zeradas, gap e dados ausentes críticos.',
    '- Se uma coordenadora estiver acima da meta diária mas com projeção mensal negativa, trate como risco comercial.',
    '',
    'DADOS:',
    JSON.stringify(input)
  ].join('\n');

  try {
    const response = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Responda em português do Brasil. Retorne apenas JSON válido, sem markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        status: 'ERRO_DEEPSEEK',
        generatedAt: hourNow(),
        text: fallback.executiveSummary,
        structured: fallback,
        error: await response.text()
      };
    }

    const json = await response.json();
    const raw = json.choices?.[0]?.message?.content || '';
    const structured = normalizeStructured(parseJson(raw), fallback);

    return {
      status: 'OK',
      generatedAt: hourNow(),
      text: structured.executiveSummary,
      structured
    };
  } catch (error) {
    return {
      status: 'ERRO_DEEPSEEK',
      generatedAt: hourNow(),
      text: fallback.executiveSummary,
      structured: fallback,
      error: error?.message || String(error)
    };
  }
}

function buildAiInput(payload) {
  return {
    date: payload.date,
    updatedAt: payload.updatedAt,
    summary: payload.summary,
    goal: payload.goal,
    rhythm: payload.rhythm,
    paceContext: payload.paceContext,
    responsiblePerformance: payload.responsiblePerformance,
    topStoresByGoal: payload.topStoresByGoal,
    zeroStores: payload.zeroStores,
    missingData: payload.missingData
  };
}

function buildFallback(payload) {
  const summary = payload.summary || {};
  const goal = payload.goal || {};
  const pace = payload.paceContext || {};
  const responsibles = Array.isArray(payload.responsiblePerformance) ? payload.responsiblePerformance : [];
  const zeroStores = Array.isArray(payload.zeroStores) ? payload.zeroStores : [];
  const zeroByResponsible = countZeroByResponsible(zeroStores);
  const priority = pickPriority(responsibles, zeroByResponsible);
  const criticalZeros = zeroStores.slice(0, 3).map((store) => store.name).filter(Boolean).join(', ');

  return {
    headline: `${goal.dailyPercent || 0}% da meta diária`,
    executiveSummary: `${summary.productionTodayFormatted || 'R$ 0,00'} hoje; ${summary.zeroStores || zeroStores.length || 0} lojas zeradas; ${pace.label || 'ritmo sem leitura'}.`,
    priority: priority ? `${priority.name}: ${priority.reason}` : 'Acompanhar lojas zeradas',
    actions: [
      {
        title: priority ? `Acionar ${priority.name}` : 'Acionar responsáveis',
        detail: priority?.reason || 'Priorizar lojas zeradas e gaps do dia.',
        responsible: priority?.name || 'Operação',
        severity: priority?.severity || 'attention'
      },
      {
        title: 'Reverter zeradas',
        detail: criticalZeros ? `Foco em ${criticalZeros}.` : 'Sem lojas zeradas críticas listadas.',
        responsible: 'Coordenação',
        severity: zeroStores.length ? 'critical' : 'normal'
      }
    ],
    risks: [
      {
        title: 'Lojas zeradas',
        detail: `${summary.zeroStores || zeroStores.length || 0} lojas sem produção hoje.`,
        severity: zeroStores.length ? 'critical' : 'normal'
      },
      {
        title: 'Projeção mensal',
        detail: goal.projectionGapFormatted || 'Gap de projeção indisponível.',
        severity: String(goal.projectionGapFormatted || '').startsWith('-') ? 'attention' : 'normal'
      }
    ],
    questions: [
      'Há impedimento operacional nas lojas zeradas?',
      'Precisamos de ação extraordinária para coordenadoras em risco?'
    ]
  };
}

function pickPriority(responsibles, zeroByResponsible) {
  const scored = responsibles.map((item) => {
    const projectionNegative = String(item.projectionGapFormatted || '').trim().startsWith('-');
    const zeroCount = zeroByResponsible[norm(item.name)] || 0;
    const dailyPercent = typeof item.dailyPercent === 'number' ? item.dailyPercent : null;
    const hasProductionNoDaily = dailyPercent === null && Number(item.productionToday || 0) > 0;

    let score = 999;
    let reason = 'Acompanhar cadência';
    let severity = 'normal';

    if (projectionNegative) {
      score = 10;
      reason = `projeção mensal negativa${zeroCount ? ` e ${zeroCount} lojas zeradas` : ''}`;
      severity = 'critical';
    } else if (zeroCount) {
      score = 20 + zeroCount * -1;
      reason = `${zeroCount} lojas zeradas`;
      severity = 'critical';
    } else if (dailyPercent !== null && dailyPercent < 100) {
      score = 40 + dailyPercent;
      reason = `${dailyPercent}% da meta diária`;
      severity = 'attention';
    } else if (hasProductionNoDaily) {
      score = 70;
      reason = 'produção com meta diária ausente';
      severity = 'attention';
    }

    return { ...item, score, reason, severity };
  });

  return scored.sort((a, b) => a.score - b.score)[0] || null;
}

function countZeroByResponsible(zeroStores) {
  return zeroStores.reduce((acc, store) => {
    const key = norm(store.responsible);
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function parseJson(raw) {
  const text = String(raw || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(text);
}

function normalizeStructured(value, fallback) {
  const out = value && typeof value === 'object' ? value : fallback;

  return {
    headline: cleanText(out.headline || fallback.headline, 90),
    executiveSummary: cleanText(out.executiveSummary || fallback.executiveSummary, 180),
    priority: cleanText(out.priority || fallback.priority, 120),
    actions: normalizeItems(out.actions, fallback.actions, 3),
    risks: normalizeItems(out.risks, fallback.risks, 2),
    questions: Array.isArray(out.questions)
      ? out.questions.slice(0, 2).map((item) => cleanText(item, 120))
      : fallback.questions
  };
}

function normalizeItems(items, fallback, limit) {
  const source = Array.isArray(items) && items.length ? items : fallback;

  return source.slice(0, limit).map((item) => ({
    title: cleanText(item?.title || 'Ação', 60),
    detail: cleanText(item?.detail || '', 120),
    responsible: cleanText(item?.responsible || 'Operação', 40),
    severity: ['critical', 'attention', 'normal'].includes(item?.severity) ? item.severity : 'normal'
  }));
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/[#*_`|>\-]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function hourNow() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date()).replace(':', 'h');
}
