import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = "America/Sao_Paulo";
const SOURCE_URL = "https://copa-colmeias-tv-panel.vercel.app/api/producao?mode=tv&snapshotSource=1";
const EXPECTED = ["DAIELLY", "MARIA FERNANDA", "MARIELEN"];
const DB_TABLE = "radar_daily_snapshots";

function isoDateBrazil(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function parseDate(value) {
  const text = String(value || "").trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function minusDay(iso) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function normalize(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function withCents(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function goodBusinessDay(iso, holidays) {
  const day = new Date(iso + "T12:00:00Z").getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(iso);
}
function calendarCount(start, end, holidays) {
  if (end < start) return 0;
  let count = 0;
  for (let current = start, attempts = 0; current <= end; current = nextDay(current), attempts++) {
    if (attempts > 370) throw new Error("Intervalo de calendario invalido.");
    if (goodBusinessDay(current, holidays)) count++;
  }
  return count;
}
function nextDay(iso) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function latestOperationalDay(today, monthStart, holidays) {
  let date = today;
  for (let attempt = 0; attempt < 370 && date >= monthStart; attempt++, date = minusDay(date)) {
    if (goodBusinessDay(date, holidays)) return date;
  }
  return null;
}
function calculateEntity(source, elapsedPrevious, elapsedToday, businessDays) {
  const monthGoal = numberOrNull(source.monthGoal);
  const monthRealized = numberOrNull(source.monthRealized);
  const paidToday = numberOrNull(source.paidToday);
  if (monthGoal === null || monthRealized === null || paidToday === null ||
      monthGoal < 0 || monthRealized < 0 || paidToday < 0 || paidToday > monthRealized + 0.02) {
    throw new Error("Realizado, pago ou meta mensal invalido.");
  }
  const monthRealizedClosed = withCents(Math.max(0, monthRealized - paidToday));
  if (monthGoal === 0) return {
    monthGoal, monthRealizedClosed, monthProjectionPercent: null, monthProjectionAmount: null,
    monthProjectionGap: null, recoveryToday: null, cumulativeTargetToday: null
  };
  const monthProjectionPercent = elapsedPrevious > 0
    ? monthRealizedClosed / elapsedPrevious * businessDays / monthGoal * 100
    : null;
  const monthProjectionAmount = monthProjectionPercent === null ? null
    : monthRealizedClosed / elapsedPrevious * businessDays;
  const cumulativeTargetToday = monthGoal * elapsedToday / businessDays;
  // Somente o fechamento de ontem determina se existe deficit acumulado.
  // A diaria da planilha e dinamica e nao representa monthGoal / businessDays.
  const previousTarget = monthGoal * elapsedPrevious / businessDays;
  const previousBalance = monthRealizedClosed - previousTarget;
  const dailyNormal = monthGoal / businessDays;
  const recoveryToday = withCents(previousBalance) >= 0
    ? 0
    : withCents(dailyNormal + Math.abs(previousBalance));
  return {
    monthGoal, monthRealizedClosed, monthProjectionPercent,
    monthProjectionAmount: monthProjectionAmount === null ? null : withCents(monthProjectionAmount),
    monthProjectionGap: monthProjectionAmount === null ? null : withCents(monthProjectionAmount - monthGoal),
    recoveryToday,
    cumulativeTargetToday: withCents(cumulativeTargetToday)
  };
}
function response(data, code = 200) {
  return Response.json(data, { status: code, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function dbClient() {
  const url = Deno.env.get("SUPABASE_URL");
  let secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (!secret) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      secret = typeof keys === "string" ? keys : Object.values(keys)[0];
    } catch { /* no fallback */ }
  }
  if (!url || !secret) throw new Error("Supabase service credentials indisponiveis.");
  return createClient(url, secret, { auth: { persistSession: false } });
}
async function getSnapshot(client, date) {
  const { data, error } = await client.from(DB_TABLE).select("*").eq("operational_date", date).maybeSingle();
  if (error) throw new Error("Falha de leitura do snapshot: " + error.message);
  return data;
}
function formatSnapshot(row) {
  if (!row) return null;
  return {
    operationalDate: row.operational_date, closedThrough: row.closed_through,
    sourceDate: row.source_date, competence: row.competence,
    calendar: row.calendar, coordinators: row.coordinators, stores: row.stores,
    createdAt: row.created_at, calculationVersion: row.calculation_version
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const client = dbClient();
    const today = isoDateBrazil();
    const existing = await getSnapshot(client, today);
    if (existing) return response({ ok: true, snapshot: formatSnapshot(existing) });

    const sourceResponse = await fetch(SOURCE_URL, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!sourceResponse.ok) throw new Error("Fonte de producao indisponivel: " + sourceResponse.status);
    const source = await sourceResponse.json();
    if (!source.ok || !source.calendar) throw new Error("Calendario da fonte nao foi retornado.");
    const sourceDate = parseDate(source.date);
    const calendar = source.calendar;
    const monthStart = parseDate(calendar.start);
    const monthEnd = parseDate(calendar.end);
    const businessDays = numberOrNull(calendar.businessDays);
    const holidays = new Set((calendar.holidays || []).map(parseDate).filter(Boolean));
    if (!sourceDate || !monthStart || !monthEnd || sourceDate !== today || today < monthStart ||
        today > monthEnd || !Number.isInteger(businessDays) || businessDays < 1) {
      return response({ ok: false, error: "SOURCE_NOT_READY", message: "Data operacional ou calendario nao confere com a origem." }, 503);
    }
    const operationalDate = latestOperationalDay(today, monthStart, holidays);
    if (!operationalDate) return response({ ok: false, error: "NO_BUSINESS_DAY", message: "Nenhum dia operacional nesta competencia." }, 503);

    if (operationalDate !== today) {
      const previous = await getSnapshot(client, operationalDate);
      return previous
        ? response({ ok: true, snapshot: formatSnapshot(previous) })
        : response({ ok: false, error: "NON_BUSINESS_DAY_NO_SNAPSHOT", message: "Nao ha fechamento persistido do ultimo dia operacional." }, 503);
    }

    const elapsedPrevious = calendarCount(monthStart, minusDay(today), holidays);
    const elapsedToday = calendarCount(monthStart, today, holidays);
    if (elapsedToday < 1 || elapsedToday > businessDays) throw new Error("Indice de dias uteis invalido.");

    const rows = Array.isArray(source.responsiblePerformance) ? source.responsiblePerformance : [];
    const coordinators = EXPECTED.map((expectedName) => {
      const row = rows.find((value) => normalize(value.name) === expectedName);
      if (!row) throw new Error("Coordenacao sem dados: " + expectedName);
      return { name: row.name, ...calculateEntity(row, elapsedPrevious, elapsedToday, businessDays) };
    });
    const rawStores = Array.isArray(source.operationalStores) ? source.operationalStores : [];
    const stores = rawStores
      .filter((store) => EXPECTED.includes(normalize(store.responsible)))
      .map((store) => {
        const code = String(store.code || "").trim();
        if (!/^\d{5}$/.test(code)) throw new Error("Loja sem codigo estavel: " + String(store.name || ""));
        return { code, responsible: store.responsible, ...calculateEntity(store, elapsedPrevious, elapsedToday, businessDays) };
      });
    const codes = stores.map((store) => store.code);
    if (!stores.length || new Set(codes).size !== stores.length) throw new Error("Lojas incompletas ou duplicadas.");
    if (coordinators.some((row) => row.monthGoal <= 0)) throw new Error("Meta mensal de coordenacao invalida.");
    const record = {
      operational_date: today, source_date: sourceDate,
      closed_through: minusDay(today), competence: monthStart.slice(0, 7),
      calendar: { start: monthStart, end: monthEnd, businessDays, elapsedPrevious, elapsedToday },
      coordinators, stores, calculation_version: 2
    };
    const { error } = await client.from(DB_TABLE).insert(record);
    if (error && error.code !== "23505") throw new Error("Falha ao gravar snapshot: " + error.message);
    const winner = await getSnapshot(client, today);
    if (!winner) throw new Error("Snapshot nao encontrado apos gravacao.");
    return response({ ok: true, snapshot: formatSnapshot(winner) });
  } catch (error) {
    console.error("[RADAR_SNAPSHOT_ERROR]", error instanceof Error ? error.message : String(error));
    return response({ ok: false, error: "SNAPSHOT_UNAVAILABLE", message: error instanceof Error ? error.message : String(error) }, 503);
  }
});