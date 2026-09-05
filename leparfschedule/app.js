// Le Parfumier: SCHEDULE — client app. No build step.
//
// Bump APP_VERSION on every deploy that changes app.js, style.css or index.html,
// and bump the matching ?v= query params in index.html.
"use strict";
const APP_VERSION = 1;

// Same Supabase project as the FLAG pilot and the other J3 apps. The anon key is
// public by design; the app is PIN-gated and row level security lets anon write.
const SUPABASE_URL = "https://ikypiznimyzidmyzzoys.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreXBpem5pbXl6aWRteXp6b3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzUzODIsImV4cCI6MjA5MzMxMTM4Mn0.Ee0FWPHjLBSOIFXWmdPSjG8oT3QmKyKG14BF8oPGgjk";
const NOTIFY_FN = "lps-notify";

const T = {
  employees: "lps_employees", availability: "lps_availability", time_off: "lps_time_off",
  must_work: "lps_must_work", shifts: "lps_shifts", swaps: "lps_swap_requests",
  notes: "lps_notifications", settings: "lps_settings",
};
const KEYS = { unlocked: "lps_unlocked", me: "lps_me", local: "lps_local_db" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKS_AHEAD = 6;

// ============================================================ seed (the sheet)
// Times are minutes since midnight. "10 TO 6" is 600..1080. dow 1 = Monday.
const SEED = {
  pin: "4545",
  supervisor_email: "dfrancispro@gmail.com",
  stores: [
    { code: "PL", name: "PL", hours: { 1: [600, 1080], 2: [600, 1080], 3: [600, 1080], 4: [600, 1080], 5: [600, 1080], 6: [600, 1020], 7: null } },
    { code: "PB", name: "PB", hours: { 1: [600, 1080], 2: [600, 1080], 3: [600, 1080], 4: [600, 1140], 5: [600, 1140], 6: [600, 1020], 7: [600, 1020] } },
    { code: "PV", name: "PV", hours: { 1: [600, 1080], 2: [600, 1080], 3: [600, 1080], 4: [600, 1260], 5: [600, 1260], 6: [600, 1020], 7: [600, 1020] } },
  ],
  // The rules "we" set. Every one of these is editable under Manage -> Rules.
  rules: {
    minStaff: 1,            // people on the floor at every open minute
    maxHoursWeek: 40,       // hard ceiling per person per week
    maxDaysWeek: 6,         // hard ceiling on days worked per week
    minShiftMin: 180,       // a fill-in shift is never shorter than 3h
    maxShiftMin: 600,       // a shift is never stretched past 10h
    allowFlexFill: true,    // people marked "flex" can be called in on OFF days to close a gap
    allowCallInAnyone: false, // if true, anyone from that store with no shift that day can be called in
    clampToStoreHours: true,  // trim template shifts to the store's opening hours
    restarts: 220,          // how many randomized attempts the solver makes per week
  },
  employees: [
    { id: "elodie-bourque",    name: "Elodie Bourque",    stores: ["PV"],       home_store: "PV", sort: 10 },
    { id: "maria-izzi",        name: "Maria Izzi",        stores: ["PV"],       home_store: "PV", sort: 20 },
    { id: "mary-catisani",     name: "Mary Catisani",     stores: ["PB"],       home_store: "PB", sort: 30 },
    { id: "elizabeth-boucher", name: "Elizabeth Boucher", stores: ["PB", "PL"], home_store: "PB", sort: 40 },
    { id: "sarah-masone",      name: "Sarah Masone",      stores: ["PV", "PL"], home_store: "PV", sort: 50 },
    { id: "michael-slattery",  name: "Michael Slattery",  stores: ["PL"],       home_store: "PL", sort: 60 },
    { id: "anthony-ortona",    name: "Anthony Ortona",    stores: ["PL"],       home_store: "PL", sort: 70 },
    { id: "katherine-ortona",  name: "Katherine Ortona",  stores: ["PL"],       home_store: "PL", sort: 80, flex: true },
    { id: "selena-gomez",      name: "Selena Gomez",      stores: ["PL"],       home_store: "PL", sort: 90 },
    { id: "carmie-masone",     name: "Carmie Masone",     stores: ["PL"],       home_store: "PL", sort: 100 },
    { id: "manager",           name: "Manager",           stores: ["PL", "PB", "PV"], home_store: null, sort: 900, role: "supervisor", email: "dfrancispro@gmail.com" },
  ],
  // [employee, dow, start, end, store]
  availability: [
    ["elodie-bourque", 2, 600, 1080, "PV"], ["elodie-bourque", 3, 600, 1080, "PV"], ["elodie-bourque", 4, 900, 1260, "PV"], ["elodie-bourque", 5, 960, 1260, "PV"], ["elodie-bourque", 7, 600, 1080, "PV"],
    ["maria-izzi", 1, 600, 1080, "PV"], ["maria-izzi", 4, 600, 900, "PV"], ["maria-izzi", 5, 600, 960, "PV"], ["maria-izzi", 6, 600, 1020, "PV"],
    ["mary-catisani", 2, 600, 1080, "PB"], ["mary-catisani", 3, 600, 1080, "PB"], ["mary-catisani", 4, 600, 1140, "PB"], ["mary-catisani", 5, 600, 1140, "PB"], ["mary-catisani", 6, 600, 1020, "PB"],
    ["elizabeth-boucher", 1, 600, 1080, "PB"], ["elizabeth-boucher", 2, 600, 1080, "PL"], ["elizabeth-boucher", 3, 600, 1080, "PL"], ["elizabeth-boucher", 4, 600, 1080, "PL"], ["elizabeth-boucher", 7, 600, 1080, "PB"],
    ["sarah-masone", 6, 600, 1020, "PV"],
    ["michael-slattery", 1, 600, 1080, "PL"], ["michael-slattery", 2, 840, 1080, "PL"], ["michael-slattery", 3, 780, 1080, "PL"], ["michael-slattery", 5, 600, 1080, "PL"], ["michael-slattery", 6, 600, 1020, "PL"],
    ["anthony-ortona", 2, 600, 1080, "PL"], ["anthony-ortona", 3, 600, 840, "PL"], ["anthony-ortona", 5, 600, 840, "PL"],
    ["selena-gomez", 2, 720, 1080, "PL"], ["selena-gomez", 4, 720, 1080, "PL"], ["selena-gomez", 6, 600, 1020, "PL"],
    ["carmie-masone", 1, 600, 1080, "PL"], ["carmie-masone", 4, 600, 1080, "PL"],
  ],
  time_off: [
    { employee_id: "mary-catisani", date: "2026-10-15", note: "From the sheet" },
    { employee_id: "mary-catisani", date: "2026-12-10", note: "From the sheet" },
  ],
  must_work: [
    { employee_id: "katherine-ortona", date: "2026-09-10", start_min: 600, end_min: 840, store: "PL", note: "From the sheet" },
    { employee_id: "katherine-ortona", date: "2026-09-17", start_min: 600, end_min: 840, store: "PL", note: "From the sheet" },
  ],
};

// ================================================================== state
let sb = null;
const state = {
  unlocked: false, me: null, route: "#mine", week: null, masterStore: "all", adminTab: "team",
  adminEmp: null, reqTab: "me", offline: false, cloudError: null, loaded: false,
  data: { employees: [], availability: [], time_off: [], must_work: [], shifts: [], swaps: [], notes: [], settings: {} },
};

// ================================================================ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const by = (f) => (a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);

function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function today() { return ymd(new Date()); }
function mondayOf(s) { const d = parseYmd(s); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return ymd(d); }
function dowOf(s) { return ((parseYmd(s).getDay() + 6) % 7) + 1; } // 1..7
function dowName(s) { return DOW[dowOf(s) - 1]; }
function fmtDate(s, long) {
  const d = parseYmd(s);
  const m = d.toLocaleDateString("en-US", { month: "short" });
  return long ? `${DOW_LONG[dowOf(s) - 1]}, ${m} ${d.getDate()}` : `${DOW[dowOf(s) - 1]} ${m} ${d.getDate()}`;
}
function fmtMonthDay(s) { const d = parseYmd(s); return d.toLocaleDateString("en-US", { month: "short" }) + " " + d.getDate(); }
function weekLabel(ws) { const we = addDays(ws, 6); return `${fmtMonthDay(ws)} – ${fmtMonthDay(we)}`; }
function fmtT(min) {
  let h = Math.floor(min / 60), m = min % 60; const ap = h >= 12 && h < 24 ? "p" : "a"; h = h % 12 || 12;
  return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
}
function fmtRange(s, e) { return `${fmtT(s)}–${fmtT(e)}`; }
function fmtHours(min) { const h = min / 60; return (Math.round(h * 10) / 10) + "h"; }
function toHHMM(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
function fromHHMM(s) { if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); }
function colorFor(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 48%)`;
}
function initials(name) { return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }
function firstName(name) { return name.split(/\s+/)[0]; }
function toast(msg, kind = "") {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show " + kind;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = "toast"), 3200);
}

// ================================================================ data layer
// A thin layer so the same code runs against Supabase or, when the tables are not
// there yet, against this browser's localStorage. The fallback exists so the app
// can be previewed and so a missing table never blanks the screen.
const local = { tables: null, counter: 0 };
function localLoad() {
  if (local.tables) return local.tables;
  try { local.tables = JSON.parse(localStorage.getItem(KEYS.local) || "null"); } catch (e) { local.tables = null; }
  if (!local.tables) local.tables = Object.fromEntries(Object.values(T).map((t) => [t, []]));
  return local.tables;
}
function localSave() { try { localStorage.setItem(KEYS.local, JSON.stringify(local.tables)); } catch (e) {} }
function matches(row, match) { return Object.keys(match).every((k) => row[k] === match[k]); }

async function dbSelect(table) {
  if (state.offline) return clone(localLoad()[table]);
  const { data, error } = await sb.from(table).select("*");
  if (error) throw error;
  return data;
}
async function dbInsert(table, rows) {
  if (!rows.length) return [];
  if (state.offline) {
    const t = localLoad()[table];
    const out = rows.map((r) => ({ ...r, id: r.id ?? (table === T.shifts || table === T.swaps || table === T.notes ? uid() : ++local.counter + Date.now()), created_at: r.created_at || new Date().toISOString() }));
    t.push(...clone(out)); localSave(); return out;
  }
  const { data, error } = await sb.from(table).insert(rows).select();
  if (error) throw error;
  return data;
}
async function dbUpsert(table, rows, onConflict) {
  if (!rows.length) return [];
  if (state.offline) {
    const t = localLoad()[table]; const keys = onConflict.split(",");
    rows.forEach((r) => { const i = t.findIndex((x) => keys.every((k) => x[k] === r[k])); if (i >= 0) t[i] = { ...t[i], ...r }; else t.push({ ...r, id: r.id ?? ++local.counter + Date.now() }); });
    localSave(); return rows;
  }
  const { data, error } = await sb.from(table).upsert(rows, { onConflict }).select();
  if (error) throw error;
  return data;
}
async function dbUpdate(table, match, patch) {
  if (state.offline) {
    const t = localLoad()[table]; t.forEach((r, i) => { if (matches(r, match)) t[i] = { ...r, ...patch }; }); localSave(); return;
  }
  const { error } = await sb.from(table).update(patch).match(match);
  if (error) throw error;
}
async function dbDelete(table, match) {
  if (state.offline) {
    const t = localLoad()[table]; local.tables[table] = t.filter((r) => !matches(r, match)); localSave(); return;
  }
  const { error } = await sb.from(table).delete().match(match);
  if (error) throw error;
}

async function loadAll() {
  const names = ["employees", "availability", "time_off", "must_work", "shifts", "swaps", "notes", "settings"];
  const rows = await Promise.all(names.map((n) => dbSelect(T[n])));
  names.forEach((n, i) => { state.data[n] = rows[i]; });
  state.data.settings = Object.fromEntries((rows[7] || []).map((r) => [r.key, r.value]));
}
async function refresh(names) {
  const rows = await Promise.all(names.map((n) => dbSelect(T[n])));
  names.forEach((n, i) => { state.data[n] = n === "settings" ? Object.fromEntries(rows[i].map((r) => [r.key, r.value])) : rows[i]; });
}

async function seedIfEmpty() {
  if (state.data.employees.length) return false;
  await dbInsert(T.employees, SEED.employees.map((e) => ({ id: e.id, name: e.name, stores: e.stores, home_store: e.home_store, role: e.role || "staff", email: e.email || null, flex: !!e.flex, active: true, sort: e.sort })));
  await dbInsert(T.availability, SEED.availability.map(([employee_id, dow, start_min, end_min, store]) => ({ employee_id, dow, start_min, end_min, store })));
  await dbInsert(T.time_off, SEED.time_off);
  await dbInsert(T.must_work, SEED.must_work);
  await dbUpsert(T.settings, [
    { key: "stores", value: SEED.stores }, { key: "rules", value: SEED.rules },
    { key: "pin", value: SEED.pin }, { key: "supervisor_email", value: SEED.supervisor_email },
  ], "key");
  await loadAll();
  return true;
}

// accessors
const bySort = (a, b) => ((a.sort ?? 100) - (b.sort ?? 100)) || String(a.name).localeCompare(String(b.name));
const emps = () => state.data.employees.filter((e) => e.active !== false).sort(bySort);
const emp = (id) => state.data.employees.find((e) => e.id === id);
const ename = (id) => (emp(id) || {}).name || "Someone";
const stores = () => state.data.settings.stores || SEED.stores;
const store = (code) => stores().find((s) => s.code === code) || { code, name: code, hours: {} };
const rules = () => ({ ...SEED.rules, ...(state.data.settings.rules || {}) });
const supervisors = () => state.data.employees.filter((e) => e.role === "supervisor" && e.active !== false);
const isSup = () => !!(state.me && state.me.role === "supervisor");
const storeHours = (code, date) => { const h = store(code).hours || {}; const v = h[dowOf(date)]; return v && v.length === 2 ? v : null; };
const shiftsOf = (empId) => state.data.shifts.filter((s) => s.employee_id === empId);
const weekShifts = (ws) => state.data.shifts.filter((s) => s.week_start === ws);
const isOff = (empId, date) => state.data.time_off.some((o) => o.employee_id === empId && o.date === date);
const worksStore = (e, code) => (e.stores || []).includes(code);
const shiftLen = (s) => s.end_min - s.start_min;
const weekMinutes = (empId, ws) => weekShifts(ws).filter((s) => s.employee_id === empId).reduce((a, s) => a + shiftLen(s), 0);
const weeksList = () => { const start = mondayOf(today()); return Array.from({ length: WEEKS_AHEAD + 1 }, (_, i) => addDays(start, 7 * i)); };
function shiftById(id) { return state.data.shifts.find((s) => s.id === id); }
function describeShift(s) { return s ? `${fmtDate(s.date)} · ${fmtRange(s.start_min, s.end_min)} · ${store(s.store).name}` : "—"; }

// ================================================================== solver
// The Jaguars pattern: hard rules filter what is allowed, a randomized greedy pass
// fills demand, a soft score picks the best of many restarts, and anything locked
// (approved swaps, "needs to work", manual pins) is never touched.
function coverage(shifts, code, date) {
  const hrs = storeHours(code, date); if (!hrs) return null;
  const [open, close] = hrs;
  const pts = new Set([open, close]);
  const rel = shifts.filter((s) => s.store === code && s.date === date);
  rel.forEach((s) => { pts.add(Math.max(open, Math.min(close, s.start_min))); pts.add(Math.max(open, Math.min(close, s.end_min))); });
  const cuts = Array.from(pts).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b <= a) continue;
    const n = rel.filter((s) => s.start_min < b && s.end_min > a).length;
    segs.push({ start: a, end: b, count: n });
  }
  return { open, close, segs };
}
function gapsFor(shifts, code, date, minStaff) {
  const c = coverage(shifts, code, date); if (!c) return [];
  const gaps = [];
  c.segs.forEach((g) => {
    if (g.count >= minStaff) return;
    const last = gaps[gaps.length - 1];
    if (last && last.end === g.start && last.count === g.count) last.end = g.end;
    else gaps.push({ store: code, date, start: g.start, end: g.end, count: g.count });
  });
  return gaps;
}
function allGaps(shifts, days, minStaff) {
  const out = [];
  stores().forEach((st) => days.forEach((d) => out.push(...gapsFor(shifts, st.code, d, minStaff))));
  return out;
}
function solverCtx() {
  const R = rules();
  const avail = {};
  state.data.availability.forEach((a) => { (avail[a.employee_id] ||= {})[a.dow] = a; });
  return { R, avail, emps: emps().filter((e) => e.role !== "supervisor" || (e.stores || []).length && state.data.availability.some((a) => a.employee_id === e.id)) };
}
function templateShifts(ws, days, c, fixed) {
  const out = [];
  c.emps.forEach((e) => {
    days.forEach((date) => {
      const a = (c.avail[e.id] || {})[dowOf(date)]; if (!a) return;
      if (isOff(e.id, date)) return;
      if (fixed.some((f) => f.employee_id === e.id && f.date === date)) return;
      let s = a.start_min, en = a.end_min;
      const hrs = storeHours(a.store, date);
      if (!hrs) return; // store closed that day
      if (c.R.clampToStoreHours) { s = Math.max(s, hrs[0]); en = Math.min(en, hrs[1]); }
      if (en - s < 60) return;
      out.push({ week_start: ws, date, employee_id: e.id, store: a.store, start_min: s, end_min: en, locked: false, source: "template" });
    });
  });
  return out;
}
function empMinutes(shifts, id) { return shifts.filter((s) => s.employee_id === id).reduce((a, s) => a + shiftLen(s), 0); }
function empDays(shifts, id) { return new Set(shifts.filter((s) => s.employee_id === id).map((s) => s.date)).size; }
function candidates(gap, shifts, c) {
  const R = c.R, out = [];
  const len = gap.end - gap.start;
  c.emps.forEach((e) => {
    if (!worksStore(e, gap.store) || isOff(e.id, gap.date)) return;
    const mins = empMinutes(shifts, e.id);
    const same = shifts.filter((s) => s.employee_id === e.id && s.date === gap.date);
    const here = same.find((s) => s.store === gap.store && !s.locked && (s.end_min === gap.start || s.start_min === gap.end || (s.start_min < gap.end && s.end_min > gap.start)));
    if (here) {
      const ns = Math.min(here.start_min, gap.start), ne = Math.max(here.end_min, gap.end);
      if (ne - ns <= R.maxShiftMin && mins + (ne - ns - shiftLen(here)) <= R.maxHoursWeek * 60)
        out.push({ kind: "extend", emp: e, shift: here, ns, ne, cost: 1 + mins / 60 * 0.4 });
      return;
    }
    if (same.length) return; // already somewhere else that day
    const flex = !!e.flex && R.allowFlexFill;
    if (!flex && !R.allowCallInAnyone) return;
    if (empDays(shifts, e.id) >= R.maxDaysWeek) return;
    const hrs = storeHours(gap.store, gap.date);
    let ns = gap.start, ne = gap.end;
    if (ne - ns < R.minShiftMin) { ne = Math.min(hrs[1], ns + R.minShiftMin); ns = Math.max(hrs[0], ne - R.minShiftMin); }
    if (ne - ns > R.maxShiftMin) ne = ns + R.maxShiftMin;
    if (mins + (ne - ns) > R.maxHoursWeek * 60) return;
    out.push({ kind: "new", emp: e, ns, ne, cost: (flex ? 6 : 12) + mins / 60 * 0.4 + (e.home_store === gap.store ? 0 : 2) });
  });
  return out;
}
function scoreWeek(shifts, days, c) {
  const R = c.R; let s = 0;
  allGaps(shifts, days, R.minStaff).forEach((g) => { s += ((g.end - g.start) / 30) * 5 * (R.minStaff - g.count); });
  c.emps.forEach((e) => {
    if (empMinutes(shifts, e.id) > R.maxHoursWeek * 60) s += 40;
    if (empDays(shifts, e.id) > R.maxDaysWeek) s += 40;
  });
  shifts.forEach((sh) => { if (sh.source === "fill") s += 2; if (shiftLen(sh) < R.minShiftMin && !sh.locked) s += 3; });
  return s;
}
function solveWeek(ws, fixedRows) {
  const c = solverCtx(), R = c.R;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const fixed = clone(fixedRows);
  state.data.must_work.filter((m) => days.includes(m.date)).forEach((m) => {
    if (fixed.some((f) => f.employee_id === m.employee_id && f.date === m.date)) return;
    fixed.push({ week_start: ws, date: m.date, employee_id: m.employee_id, store: m.store, start_min: m.start_min, end_min: m.end_min, locked: true, source: "must", note: m.note || "Needs to work" });
  });
  const base = templateShifts(ws, days, c, fixed);
  let best = null, bestScore = Infinity;
  for (let run = 0; run < Math.max(1, R.restarts | 0); run++) {
    const shifts = clone(fixed.concat(base));
    const gaps = shuffle(allGaps(shifts, days, R.minStaff));
    for (const g0 of gaps) {
      // the gap may have shrunk since an earlier fill; re-derive what is still open
      const still = gapsFor(shifts, g0.store, g0.date, R.minStaff).filter((g) => g.start < g0.end && g.end > g0.start);
      for (const g of still) {
        const cands = candidates(g, shifts, c);
        if (!cands.length) continue;
        cands.sort((a, b) => a.cost - b.cost + (Math.random() - 0.5) * 3);
        const pick = cands[0];
        if (pick.kind === "extend") { pick.shift.start_min = pick.ns; pick.shift.end_min = pick.ne; pick.shift.source = pick.shift.source === "template" ? "fill" : pick.shift.source; pick.shift.note = "Extended to cover a gap"; }
        else shifts.push({ week_start: ws, date: g.date, employee_id: pick.emp.id, store: g.store, start_min: pick.ns, end_min: pick.ne, locked: false, source: "fill", note: "Called in to cover a gap" });
      }
    }
    const sc = scoreWeek(shifts, days, c);
    if (sc < bestScore) { bestScore = sc; best = shifts; }
    if (bestScore === 0) break;
  }
  return { shifts: best.filter((s) => !s.id), score: bestScore }; // only the new rows; fixed ones already exist
}
function weekIssues(ws) {
  const R = rules(), shifts = weekShifts(ws), issues = [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  allGaps(shifts, days, R.minStaff).forEach((g) => issues.push({ kind: "gap", text: `${store(g.store).name} · ${fmtDate(g.date)} · ${fmtRange(g.start, g.end)} has ${g.count ? g.count + " on" : "nobody on"} (needs ${R.minStaff})`, store: g.store, date: g.date }));
  emps().forEach((e) => {
    const m = empMinutes(shifts, e.id), d = empDays(shifts, e.id);
    if (m > R.maxHoursWeek * 60) issues.push({ kind: "hours", text: `${e.name} is at ${fmtHours(m)} (limit ${R.maxHoursWeek}h)` });
    if (d > R.maxDaysWeek) issues.push({ kind: "days", text: `${e.name} works ${d} days (limit ${R.maxDaysWeek})` });
    const byDate = {}; shifts.filter((s) => s.employee_id === e.id).forEach((s) => (byDate[s.date] ||= []).push(s));
    Object.entries(byDate).forEach(([date, arr]) => {
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
        if (arr[i].start_min < arr[j].end_min && arr[j].start_min < arr[i].end_min) issues.push({ kind: "overlap", text: `${e.name} is double-booked on ${fmtDate(date)}` });
    });
    shifts.filter((s) => s.employee_id === e.id && isOff(e.id, s.date)).forEach((s) => issues.push({ kind: "off", text: `${e.name} is scheduled ${fmtDate(s.date)} but has that day off` }));
  });
  return issues;
}
async function ensureWeeks() {
  const list = weeksList(); let built = 0;
  for (const ws of list) {
    if (weekShifts(ws).length) continue;
    const res = solveWeek(ws, []);
    if (res.shifts.length) { await dbInsert(T.shifts, res.shifts); built++; }
  }
  if (built) await refresh(["shifts"]);
  return built;
}
async function rebuildWeek(ws) {
  const locked = weekShifts(ws).filter((s) => s.locked);
  const loose = weekShifts(ws).filter((s) => !s.locked);
  for (const s of loose) await dbDelete(T.shifts, { id: s.id });
  const res = solveWeek(ws, locked);
  if (res.shifts.length) await dbInsert(T.shifts, res.shifts);
  await refresh(["shifts"]);
  return res;
}

// ============================================================ notifications
async function notify(empIds, kind, title, body, swapId) {
  const rows = Array.from(new Set(empIds.filter(Boolean))).map((employee_id) => ({ employee_id, kind, title, body, swap_id: swapId || null, read: false }));
  if (rows.length) await dbInsert(T.notes, rows);
}
async function sendEmail(to, subject, text) {
  const recipients = Array.from(new Set(to.filter((x) => x && x.includes("@"))));
  if (!recipients.length) return { skipped: "no address" };
  const link = location.origin + location.pathname + "#requests";
  const html = `<div style="font-family:Georgia,serif;max-width:560px"><p style="letter-spacing:.3em;font-size:11px;color:#a86fa5">LE PARFUMIER · SCHEDULE</p>${text.split("\n").map((l) => `<p style="margin:6px 0">${esc(l)}</p>`).join("")}<p style="margin-top:20px"><a href="${link}" style="background:#c68ec3;color:#1a1622;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">Open the schedule to decide</a></p></div>`;
  if (state.offline || !sb) return { skipped: "offline" };
  try {
    const { data, error } = await sb.functions.invoke(NOTIFY_FN, { body: { to: recipients, subject, text: text + "\n\n" + link, html } });
    if (error) throw error;
    return data || { ok: true };
  } catch (e) { console.warn("email not sent", e); return { error: String(e.message || e) }; }
}
function unreadForMe() { return state.me ? state.data.notes.filter((n) => n.employee_id === state.me.id && !n.read) : []; }
function swapsNeedingMe() {
  if (!state.me) return [];
  return state.data.swaps.filter((s) => (s.status === "pending_peer" && s.to_employee === state.me.id) || (s.status === "pending_supervisor" && isSup()));
}
function mySwaps() {
  if (!state.me) return [];
  return state.data.swaps.filter((s) => isSup() || s.from_employee === state.me.id || s.to_employee === state.me.id).sort(by((s) => -new Date(s.created_at).getTime()));
}

// ================================================================ swap flow
async function createSwap({ toEmp, fromShift, toShift, message }) {
  const kind = fromShift && toShift ? "swap" : "cover";
  const row = {
    from_employee: state.me.id, to_employee: toEmp.id, from_shift_id: fromShift ? fromShift.id : null, to_shift_id: toShift ? toShift.id : null,
    kind, message: message || null, status: "pending_peer", from_snapshot: fromShift ? clone(fromShift) : null, to_snapshot: toShift ? clone(toShift) : null,
  };
  const [saved] = await dbInsert(T.swaps, [row]);
  const what = fromShift && toShift ? `switch ${describeShift(fromShift)} for your ${describeShift(toShift)}`
    : fromShift ? `cover their shift ${describeShift(fromShift)}` : `take your shift ${describeShift(toShift)}`;
  await notify([toEmp.id], "swap_ask", `${firstName(state.me.name)} asks you to ${fromShift && toShift ? "switch shifts" : fromShift ? "cover a shift" : "hand over a shift"}`, `${state.me.name} would like to ${what}.${message ? " “" + message + "”" : ""}`, saved.id);
  await refresh(["swaps", "notes"]);
  toast(`Sent to ${firstName(toEmp.name)}. They'll see it when they open the schedule.`, "ok");
}
async function peerRespond(swap, ok) {
  const from = emp(swap.from_employee), to = emp(swap.to_employee);
  if (!ok) {
    await dbUpdate(T.swaps, { id: swap.id }, { status: "declined_peer", peer_at: new Date().toISOString() });
    await notify([swap.from_employee], "swap_peer_no", `${firstName(to.name)} declined your request`, `${to.name} can't do the ${swap.kind === "swap" ? "switch" : "shift"} for ${describeShift(swap.from_snapshot || swap.to_snapshot)}.`, swap.id);
  } else {
    await dbUpdate(T.swaps, { id: swap.id }, { status: "pending_supervisor", peer_at: new Date().toISOString() });
    const sups = supervisors();
    const text = swapText(swap);
    await notify([swap.from_employee], "swap_peer_ok", `${firstName(to.name)} said yes`, `Waiting on the manager's approval. ${text}`, swap.id);
    await notify(sups.map((s) => s.id), "swap_approve_needed", `Approve: ${firstName(from.name)} ↔ ${firstName(to.name)}`, text, swap.id);
    const addr = [state.data.settings.supervisor_email, ...sups.map((s) => s.email)];
    const r = await sendEmail(addr, `Schedule change needs your approval: ${from.name} & ${to.name}`, `${to.name} agreed to a request from ${from.name}.\n\n${text}\n\nApprove or decline it under Requests.`);
    if (r && (r.error || r.skipped)) toast("Accepted. The manager will see it in the app (email not configured yet).", "warn");
    else toast("Accepted. The manager has been emailed for approval.", "ok");
  }
  await refresh(["swaps", "notes"]);
}
function swapText(swap) {
  const from = ename(swap.from_employee), to = ename(swap.to_employee);
  const a = swap.from_snapshot, b = swap.to_snapshot;
  if (a && b) return `${from} gives ${describeShift(a)} and takes ${to}'s ${describeShift(b)}.`;
  if (a) return `${to} covers ${from}'s shift: ${describeShift(a)}.`;
  return `${from} takes ${to}'s shift: ${describeShift(b)}.`;
}
async function supervisorDecide(swap, approve, note) {
  const now = new Date().toISOString();
  if (!approve) {
    await dbUpdate(T.swaps, { id: swap.id }, { status: "declined_supervisor", decided_at: now, decided_by: state.me.id, supervisor_note: note || null });
    await notify([swap.from_employee, swap.to_employee], "swap_declined", "Schedule change declined", `${state.me.name} declined: ${swapText(swap)}${note ? " — “" + note + "”" : ""}`, swap.id);
  } else {
    const a = swap.from_shift_id ? shiftById(swap.from_shift_id) : null;
    const b = swap.to_shift_id ? shiftById(swap.to_shift_id) : null;
    if ((swap.from_shift_id && !a) || (swap.to_shift_id && !b)) { toast("One of those shifts no longer exists. Decline this and ask them to redo it.", "err"); return; }
    if (a) await dbUpdate(T.shifts, { id: a.id }, { employee_id: swap.to_employee, locked: true, source: "swap", note: `Swap approved ${now.slice(0, 10)}`, updated_at: now });
    if (b) await dbUpdate(T.shifts, { id: b.id }, { employee_id: swap.from_employee, locked: true, source: "swap", note: `Swap approved ${now.slice(0, 10)}`, updated_at: now });
    await dbUpdate(T.swaps, { id: swap.id }, { status: "approved", decided_at: now, decided_by: state.me.id, supervisor_note: note || null });
    await notify([swap.from_employee, swap.to_employee], "swap_approved", "Schedule change approved", `${state.me.name} approved: ${swapText(swap)} The schedule is updated.`, swap.id);
    const both = [emp(swap.from_employee), emp(swap.to_employee)].map((e) => e && e.email);
    sendEmail(both, "Your schedule change was approved", swapText(swap) + "\nThe schedule is updated.");
  }
  await refresh(["swaps", "notes", "shifts"]);
  toast(approve ? "Approved. The schedule is updated." : "Declined.", approve ? "ok" : "");
}
async function cancelSwap(swap) {
  await dbUpdate(T.swaps, { id: swap.id }, { status: "cancelled", decided_at: new Date().toISOString() });
  await notify([swap.to_employee], "swap_cancelled", `${firstName(state.me.name)} withdrew a request`, swapText(swap), swap.id);
  await refresh(["swaps", "notes"]);
}
async function markRead() {
  const un = unreadForMe(); if (!un.length) return;
  for (const n of un) await dbUpdate(T.notes, { id: n.id }, { read: true });
  await refresh(["notes"]);
}

// =================================================================== sheet
function openSheet(html) {
  const card = $("#sheet-card"); card.innerHTML = `<button class="close-x" id="sheet-x" aria-label="Close">✕</button>` + html;
  $("#sheet").classList.remove("hidden");
  $("#sheet-x").onclick = closeSheet; $("#sheet-backdrop").onclick = closeSheet;
  return card;
}
function closeSheet() { $("#sheet").classList.add("hidden"); $("#sheet-card").innerHTML = ""; }
function confirmSheet(title, sub, okLabel, onOk, danger) {
  const c = openSheet(`<h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p><div class="actions"><button class="btn" id="c-no">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" id="c-ok">${esc(okLabel)}</button></div>`);
  $("#c-no", c).onclick = closeSheet; $("#c-ok", c).onclick = async () => { closeSheet(); await onOk(); };
}
function shiftBox(s, who) {
  return `<div class="box"><div class="t">${fmtRange(s.start_min, s.end_min)} <span class="pill store s-${esc(s.store)}">${esc(store(s.store).name)}</span></div><div>${esc(fmtDate(s.date, true))}</div>${who ? `<div class="dim">${esc(who)}</div>` : ""}</div>`;
}

// my own shift → ask a colleague to cover or switch
function myShiftSheet(s) {
  const colleagues = emps().filter((e) => e.id !== state.me.id && e.role !== "supervisor" && worksStore(e, s.store));
  let mode = "cover", pickEmp = null, pickShift = null;
  const c = openSheet(`
    <h3>Your shift</h3>
    <p class="sub">${esc(fmtDate(s.date, true))} · ${fmtRange(s.start_min, s.end_min)} at ${esc(store(s.store).name)} · ${fmtHours(shiftLen(s))}${s.locked ? " · <span class='lockmark'>🔒 locked</span>" : ""}</p>
    <div class="tabs"><button class="tab active" data-m="cover">Ask someone to cover it</button><button class="tab" data-m="swap">Switch with someone's shift</button></div>
    <label class="lbl">Who</label>
    <div id="who">${colleagues.map((e) => {
      const busy = shiftsOf(e.id).find((x) => x.date === s.date);
      const off = isOff(e.id, s.date);
      const sub = off ? "Has the day off" : busy ? `Already on ${fmtRange(busy.start_min, busy.end_min)} at ${store(busy.store).name}` : (state.data.availability.some((a) => a.employee_id === e.id && a.dow === dowOf(s.date)) ? "Usually works this day" : "Usually off this day");
      return `<button class="choice" data-e="${esc(e.id)}" ${off ? "disabled" : ""}><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><span><b>${esc(e.name)}</b><small>${esc(sub)}</small></span><span class="mono">${fmtHours(weekMinutes(e.id, s.week_start))} this wk</span></button>`;
    }).join("") || `<div class="empty">Nobody else works at ${esc(store(s.store).name)}.</div>`}</div>
    <div id="their" class="hidden"><label class="lbl">Which of their shifts do you take?</label><div id="their-list"></div></div>
    <label class="lbl">Message (optional)</label>
    <textarea class="field" id="msg" placeholder="e.g. Dentist appointment, happy to take a Saturday in return"></textarea>
    <div class="actions"><button class="btn" id="cancel">Close</button><button class="btn primary" id="send" disabled>Send request</button></div>`);
  const update = () => { $("#send", c).disabled = !pickEmp || (mode === "swap" && !pickShift); };
  $$(".tab", c).forEach((t) => (t.onclick = () => { $$(".tab", c).forEach((x) => x.classList.remove("active")); t.classList.add("active"); mode = t.dataset.m; pickShift = null; renderTheir(); update(); }));
  const renderTheir = () => {
    const box = $("#their", c);
    if (mode !== "swap" || !pickEmp) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const theirs = shiftsOf(pickEmp.id).filter((x) => x.date >= today() && x.id !== s.id).sort(by((x) => x.date + toHHMM(x.start_min)));
    $("#their-list", c).innerHTML = theirs.map((x) => {
      const clash = shiftsOf(state.me.id).some((m) => m.date === x.date && m.id !== s.id);
      return `<button class="choice ${pickShift && pickShift.id === x.id ? "sel" : ""}" data-s="${x.id}"><span><b>${esc(fmtDate(x.date, true))}</b><small>${fmtRange(x.start_min, x.end_min)} at ${esc(store(x.store).name)}${clash ? " · you already work that day" : ""}${x.locked ? " · 🔒" : ""}</small></span><span class="mono">${fmtHours(shiftLen(x))}</span></button>`;
    }).join("") || `<div class="empty small">${esc(firstName(pickEmp.name))} has no upcoming shifts to switch with.</div>`;
    $$("[data-s]", c).forEach((b) => (b.onclick = () => { pickShift = shiftById(b.dataset.s); renderTheir(); update(); }));
  };
  $$("[data-e]", c).forEach((b) => (b.onclick = () => { $$("[data-e]", c).forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); pickEmp = emp(b.dataset.e); pickShift = null; renderTheir(); update(); }));
  $("#cancel", c).onclick = closeSheet;
  $("#send", c).onclick = async () => {
    $("#send", c).disabled = true;
    try { await createSwap({ toEmp: pickEmp, fromShift: s, toShift: mode === "swap" ? pickShift : null, message: $("#msg", c).value.trim() }); closeSheet(); render(); }
    catch (e) { toast("Couldn't send: " + e.message, "err"); $("#send", c).disabled = false; }
  };
}
// someone else's shift → ask to take it, optionally offering one of mine
function theirShiftSheet(s) {
  const them = emp(s.employee_id); let mode = "take", pickShift = null;
  const mine = shiftsOf(state.me.id).filter((x) => x.date >= today()).sort(by((x) => x.date + toHHMM(x.start_min)));
  const clash = shiftsOf(state.me.id).find((x) => x.date === s.date);
  const c = openSheet(`
    <h3>${esc(firstName(them.name))}'s shift</h3>
    <p class="sub">${esc(fmtDate(s.date, true))} · ${fmtRange(s.start_min, s.end_min)} at ${esc(store(s.store).name)}${clash ? ` · <span class="pill warn">you already work ${fmtRange(clash.start_min, clash.end_min)} that day</span>` : ""}</p>
    ${!worksStore(state.me, s.store) ? `<p class="pill bad">You aren't set up to work at ${esc(store(s.store).name)}. The manager can change that under Manage.</p>` : ""}
    <div class="tabs"><button class="tab active" data-m="take">Ask to take this shift</button><button class="tab" data-m="swap">Offer one of mine in exchange</button></div>
    <div id="mine" class="hidden"><label class="lbl">Which of your shifts do you offer?</label><div>${mine.map((x) => `<button class="choice" data-s="${x.id}"><span><b>${esc(fmtDate(x.date, true))}</b><small>${fmtRange(x.start_min, x.end_min)} at ${esc(store(x.store).name)}${x.locked ? " · 🔒" : ""}</small></span><span class="mono">${fmtHours(shiftLen(x))}</span></button>`).join("") || `<div class="empty small">You have no upcoming shifts to offer.</div>`}</div></div>
    <label class="lbl">Message (optional)</label>
    <textarea class="field" id="msg" placeholder="e.g. I could use the hours this week"></textarea>
    <div class="actions"><button class="btn" id="cancel">Close</button><button class="btn primary" id="send">Send request</button></div>`);
  const update = () => { $("#send", c).disabled = mode === "swap" && !pickShift; };
  $$(".tab", c).forEach((t) => (t.onclick = () => { $$(".tab", c).forEach((x) => x.classList.remove("active")); t.classList.add("active"); mode = t.dataset.m; $("#mine", c).classList.toggle("hidden", mode !== "swap"); update(); }));
  $$("[data-s]", c).forEach((b) => (b.onclick = () => { $$("[data-s]", c).forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); pickShift = shiftById(b.dataset.s); update(); }));
  $("#cancel", c).onclick = closeSheet;
  $("#send", c).onclick = async () => {
    $("#send", c).disabled = true;
    try { await createSwap({ toEmp: them, fromShift: mode === "swap" ? pickShift : null, toShift: s, message: $("#msg", c).value.trim() }); closeSheet(); render(); }
    catch (e) { toast("Couldn't send: " + e.message, "err"); $("#send", c).disabled = false; }
  };
}
// supervisor: edit / add a shift directly
function editShiftSheet(s, preset) {
  const isNew = !s; const v = s || { date: preset.date, employee_id: preset.employee_id || "", store: preset.store, start_min: (storeHours(preset.store, preset.date) || [600, 1080])[0], end_min: (storeHours(preset.store, preset.date) || [600, 1080])[1], locked: true, note: "" };
  const c = openSheet(`
    <h3>${isNew ? "Add a shift" : "Edit shift"}</h3>
    <p class="sub">${esc(fmtDate(v.date, true))}${s ? ` · ${esc(s.source)}${s.note ? " · " + esc(s.note) : ""}` : ""}</p>
    <label class="lbl">Who</label>
    <select class="field" id="e">${emps().filter((e) => e.role !== "supervisor" || e.id === v.employee_id).map((e) => `<option value="${esc(e.id)}" ${e.id === v.employee_id ? "selected" : ""}>${esc(e.name)}${worksStore(e, v.store) ? "" : " (not set for " + esc(store(v.store).name) + ")"}</option>`).join("")}</select>
    <div class="field-row">
      <div><label class="lbl">Store</label><select class="field" id="st">${stores().map((x) => `<option value="${esc(x.code)}" ${x.code === v.store ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
      <div><label class="lbl">Date</label><input class="field" id="d" type="date" value="${esc(v.date)}"></div>
      <div><label class="lbl">Start</label><input class="field" id="a" type="time" step="900" value="${toHHMM(v.start_min)}"></div>
      <div><label class="lbl">End</label><input class="field" id="b" type="time" step="900" value="${toHHMM(v.end_min)}"></div>
    </div>
    <label class="check"><input type="checkbox" id="lk" ${v.locked ? "checked" : ""}> Lock it (the solver never moves a locked shift)</label>
    <label class="lbl">Note</label><input class="field" id="n" value="${esc(v.note || "")}" placeholder="optional">
    <div class="actions">${isNew ? "" : `<button class="btn danger" id="del">Delete</button>`}<span class="grow"></span><button class="btn" id="cancel">Cancel</button><button class="btn primary" id="save">Save</button></div>`);
  $("#cancel", c).onclick = closeSheet;
  if (!isNew) $("#del", c).onclick = () => confirmSheet("Delete this shift?", describeShift(s), "Delete", async () => { await dbDelete(T.shifts, { id: s.id }); await refresh(["shifts"]); render(); toast("Deleted."); }, true);
  $("#save", c).onclick = async () => {
    const date = $("#d", c).value, start_min = fromHHMM($("#a", c).value), end_min = fromHHMM($("#b", c).value);
    if (!date || start_min == null || end_min == null || end_min <= start_min) return toast("End must be after start.", "err");
    const patch = { date, week_start: mondayOf(date), employee_id: $("#e", c).value, store: $("#st", c).value, start_min, end_min, locked: $("#lk", c).checked, note: $("#n", c).value.trim() || null, updated_at: new Date().toISOString() };
    try {
      if (isNew) await dbInsert(T.shifts, [{ ...patch, source: "manual" }]);
      else await dbUpdate(T.shifts, { id: s.id }, { ...patch, source: s.source === "template" || s.source === "fill" ? "manual" : s.source });
      await refresh(["shifts"]); closeSheet(); render(); toast("Saved.", "ok");
    } catch (e) { toast("Couldn't save: " + e.message, "err"); }
  };
}
function onShiftClick(s) {
  if (!state.me) return;
  if (isSup()) {
    const c = openSheet(`<h3>${esc(ename(s.employee_id))}</h3><p class="sub">${esc(describeShift(s))}</p>
      <button class="choice" id="ed"><span><b>Edit or move this shift</b><small>Change person, time, store, lock or delete</small></span></button>
      <button class="choice" id="ask"><span><b>Start a swap on their behalf</b><small>Opens the same request a staff member would send</small></span></button>`);
    $("#ed", c).onclick = () => editShiftSheet(s);
    $("#ask", c).onclick = () => { const saved = state.me; state.me = emp(s.employee_id); myShiftSheet(s); const x = $("#sheet-x"); const restore = () => (state.me = saved); x.addEventListener("click", restore, { once: true }); $("#sheet-backdrop").addEventListener("click", restore, { once: true }); $("#send") && $("#send").addEventListener("click", () => setTimeout(restore, 50), { once: true }); };
    return;
  }
  if (s.employee_id === state.me.id) myShiftSheet(s); else theirShiftSheet(s);
}

// ================================================================== render
function go(route) { if (location.hash !== route) location.hash = route; else render(); }
function route() {
  const h = location.hash || "#mine";
  const known = ["#mine", "#week", "#master", "#requests", "#admin"];
  state.route = known.includes(h) ? h : "#mine";
  if (state.route === "#admin" && !isSup()) state.route = "#mine";
  render();
}
function render() {
  if (!state.me) return;
  $$(".rail-btn").forEach((b) => b.classList.toggle("active", b.dataset.route === state.route));
  $$(".admin-only").forEach((b) => (b.hidden = !isSup()));
  const need = swapsNeedingMe().length + unreadForMe().length;
  const rc = $("#req-count"); rc.hidden = !need; rc.textContent = need;
  const ac = $("#admin-count"); const pend = state.data.swaps.filter((s) => s.status === "pending_supervisor").length; ac.hidden = !(isSup() && pend); ac.textContent = pend;
  const main = $("#main");
  const view = { "#mine": renderMine, "#week": renderWeek, "#master": renderMaster, "#requests": renderRequests, "#admin": renderAdmin }[state.route] || renderMine;
  main.innerHTML = view();
  wire(main);
}
function wire(root) {
  $$("[data-shift]", root).forEach((el) => (el.onclick = (ev) => { ev.stopPropagation(); const s = shiftById(el.dataset.shift); if (s) onShiftClick(s); }));
  $$("[data-week]", root).forEach((el) => (el.onclick = () => { state.week = el.dataset.week === "today" ? mondayOf(today()) : addDays(state.week, Number(el.dataset.week)); render(); }));
  $$("[data-mstore]", root).forEach((el) => (el.onclick = () => { state.masterStore = el.dataset.mstore; render(); }));
  $$("[data-go]", root).forEach((el) => (el.onclick = () => go(el.dataset.go)));
  $$("[data-add]", root).forEach((el) => (el.onclick = () => { const [employee_id, date, st] = el.dataset.add.split("|"); editShiftSheet(null, { employee_id, date, store: st }); }));
  $$("[data-swap-act]", root).forEach((el) => (el.onclick = () => swapAction(el.dataset.swapAct, el.dataset.id)));
  $$("[data-reqtab]", root).forEach((el) => (el.onclick = () => { state.reqTab = el.dataset.reqtab; render(); }));
  $$("[data-admintab]", root).forEach((el) => (el.onclick = () => { state.adminTab = el.dataset.admintab; render(); }));
  if (state.route === "#admin") wireAdmin(root);
  if (state.route === "#requests" || state.route === "#mine") setTimeout(markRead, 1500);
}
function weekNav() {
  const cur = state.week === mondayOf(today());
  return `<div class="weeknav"><button class="btn sm" data-week="-7">‹</button><div class="wk">${esc(weekLabel(state.week))}<small>${cur ? "this week" : "week of " + fmtMonthDay(state.week)}</small></div><button class="btn sm" data-week="7">›</button>${cur ? "" : `<button class="btn sm ghost" data-week="today">Today</button>`}</div>`;
}
function chip(s, opts = {}) {
  const mine = state.me && s.employee_id === state.me.id;
  return `<div class="chip ${mine ? "mine" : ""} ${s.locked ? "locked" : ""}" data-shift="${s.id}" title="${esc(s.note || s.source)}"><span class="t">${fmtRange(s.start_min, s.end_min)}${s.locked ? ' <span class="lockmark">🔒</span>' : ""}</span>${opts.name ? `<span class="n">${esc(opts.short ? firstName(ename(s.employee_id)) : ename(s.employee_id))}</span>` : ""}${opts.store ? `<span class="n">${esc(store(s.store).name)}</span>` : ""}</div>`;
}

// ---- Your schedule
function renderMine() {
  const me = state.me, t = today(), ws = mondayOf(t);
  const mine = shiftsOf(me.id).filter((s) => s.date >= t).sort(by((s) => s.date + toHHMM(s.start_min)));
  const next = mine[0];
  const need = swapsNeedingMe(), unread = unreadForMe().filter((n) => !need.some((s) => s.id === n.swap_id));
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Your schedule</div><h1>Hi, <em>${esc(firstName(me.name))}</em>.</h1>
      <p class="panel-sub">${next ? `Next up: ${esc(fmtDate(next.date, true))}, ${fmtRange(next.start_min, next.end_min)} at ${esc(store(next.store).name)}.` : "Nothing scheduled in the next few weeks."} Tap any shift to ask a colleague to cover it or switch.</p></div>
      ${isSup() ? `<button class="btn" data-go="#admin">Manage</button>` : ""}</div>
    <div class="stats">
      <div class="stat"><b>${fmtHours(weekMinutes(me.id, ws))}</b><span>this week</span></div>
      <div class="stat"><b>${fmtHours(weekMinutes(me.id, addDays(ws, 7)))}</b><span>next week</span></div>
      <div class="stat"><b>${mine.filter((s) => s.date < addDays(t, 14)).length}</b><span>shifts · 14 days</span></div>
      <div class="stat"><b>${need.length}</b><span>need your answer</span></div>
    </div>
    ${need.length || unread.length ? `<h2 class="sec">Needs your attention</h2>${need.map(reqCard).join("")}${unread.map((n) => `<div class="card"><div class="row"><span class="pill iris">${esc(n.kind.replace(/_/g, " "))}</span><b>${esc(n.title)}</b><span class="grow"></span><span class="dim mono small">${esc(new Date(n.created_at).toLocaleDateString())}</span></div><p class="small muted" style="margin:6px 0 0">${esc(n.body || "")}</p></div>`).join("")}` : ""}
    <h2 class="sec">Next two weeks</h2>
    <div class="daylist">${days.map((d) => {
      const sh = mine.filter((s) => s.date === d);
      return `<div class="dayrow ${d === t ? "today" : ""}"><div class="d"><b>${parseYmd(d).getDate()}</b>${esc(fmtDate(d).replace(/ \d+$/, ""))}${d === t ? "<i>today</i>" : ""}</div><div>${sh.length ? sh.map((s) => `<div class="shift" data-shift="${s.id}"><span class="pill store s-${esc(s.store)}">${esc(store(s.store).name)}</span><span class="t">${fmtRange(s.start_min, s.end_min)}</span>${s.locked ? '<span class="lockmark">🔒</span>' : ""}<span class="h">${fmtHours(shiftLen(s))}</span></div>`).join("") : `<div class="shift off">Off${isOff(me.id, d) ? " · requested" : ""}</div>`}</div></div>`;
    }).join("")}</div>
  </section>`;
}
// ---- Your week
function renderWeek() {
  const me = state.me, days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
  const mins = weekMinutes(me.id, state.week);
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Your week</div><h1>${fmtHours(mins)} <em>scheduled</em></h1><p class="panel-sub">${weekShifts(state.week).filter((s) => s.employee_id === me.id).length} shifts. Tap one to ask for a cover or a switch.</p></div>${weekNav()}</div>
    <div class="wgrid">${days.map((d) => {
      const sh = weekShifts(state.week).filter((s) => s.employee_id === me.id && s.date === d).sort(by((s) => s.start_min));
      return `<div class="wday ${d === today() ? "today" : ""}"><div class="wd"><span>${esc(dowName(d))}</span><b>${parseYmd(d).getDate()}</b></div>${sh.length ? sh.map((s) => chip(s, { store: true })).join("") : `<div class="chip off">${isOff(me.id, d) ? "Day off" : "Off"}</div>`}</div>`;
    }).join("")}</div>
  </section>`;
}
// ---- Master
function renderMaster() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
  const R = rules(), issues = weekIssues(state.week), shown = stores().filter((s) => state.masterStore === "all" || s.code === state.masterStore);
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Master schedule</div><h1>Everyone, <em>every store</em></h1><p class="panel-sub">Tap your own shift to ask for a cover; tap someone else's to ask to take it. ${isSup() ? "As manager you can edit any cell." : ""}</p></div>${weekNav()}</div>
    <div class="tabs"><button class="tab ${state.masterStore === "all" ? "active" : ""}" data-mstore="all">All stores</button>${stores().map((s) => `<button class="tab ${state.masterStore === s.code ? "active" : ""}" data-mstore="${esc(s.code)}">${esc(s.name)}</button>`).join("")}</div>
    ${issues.length ? `<div class="card attn" style="margin-bottom:22px"><div class="row"><span class="pill warn">${issues.length} flag${issues.length > 1 ? "s" : ""} this week</span><span class="small muted">The solver couldn't fix these with the current rules and roster.</span></div><ul class="small" style="margin:8px 0 0 18px;padding:0">${issues.slice(0, 12).map((i) => `<li>${esc(i.text)}</li>`).join("")}${issues.length > 12 ? `<li class="dim">…and ${issues.length - 12} more</li>` : ""}</ul></div>` : `<div class="row" style="margin-bottom:22px"><span class="pill good">Every open hour is covered this week</span></div>`}
    ${shown.map((st) => {
      const people = emps().filter((e) => worksStore(e, st.code) && e.role !== "supervisor");
      const rows = people.filter((e) => weekShifts(state.week).some((s) => s.employee_id === e.id && s.store === st.code) || (e.home_store === st.code));
      return `<div class="storeblk"><div class="storehead"><span class="pill store s-${esc(st.code)}">${esc(st.code)}</span><h2>${esc(st.name)}</h2><span class="hrs">${esc(hoursSummary(st))}</span></div>
      <div class="mwrap"><table class="master"><thead><tr><th>Team</th>${days.map((d) => `<th class="${d === today() ? "today" : ""}">${esc(dowName(d))} <span class="dim">${parseYmd(d).getDate()}</span></th>`).join("")}<th style="text-align:right">Hours</th></tr></thead><tbody>
      ${rows.map((e) => `<tr><td><div class="emp"><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><span><b>${esc(e.name)}</b><small>${(e.stores || []).join(" · ")}${e.flex ? " · flex" : ""}</small></span></div></td>
        ${days.map((d) => {
          const sh = weekShifts(state.week).filter((s) => s.employee_id === e.id && s.date === d).sort(by((s) => s.start_min));
          const other = sh.filter((s) => s.store !== st.code), here = sh.filter((s) => s.store === st.code);
          return `<td>${here.map((s) => chip(s)).join("")}${other.map((s) => `<div class="chip off" data-shift="${s.id}" style="cursor:pointer">${fmtRange(s.start_min, s.end_min)} @ ${esc(store(s.store).name)}</div>`).join("")}${!sh.length && isOff(e.id, d) ? `<div class="chip off">day off</div>` : ""}${isSup() && storeHours(st.code, d) ? `<button class="addcell" data-add="${esc(e.id)}|${d}|${esc(st.code)}">+</button>` : ""}</td>`;
        }).join("")}<td class="hrs">${fmtHours(weekMinutes(e.id, state.week))}</td></tr>`).join("")}
      <tr class="cov"><td><b class="small">Coverage</b><br><span class="dim small">need ${R.minStaff}+</span></td>${days.map((d) => covCell(st.code, d)).join("")}<td class="hrs">${fmtHours(weekShifts(state.week).filter((s) => s.store === st.code).reduce((a, s) => a + shiftLen(s), 0))}</td></tr>
      </tbody></table></div></div>`;
    }).join("")}
    <div class="legend"><span><i style="background:var(--moss)"></i>covered</span><span><i style="background:var(--vermilion)"></i>nobody on</span><span><i style="background:var(--iris)"></i>your shift</span><span>🔒 locked (approved swap, must-work or pinned by the manager)</span></div>
  </section>`;
}
function covCell(code, d) {
  const hrs = storeHours(code, d);
  if (!hrs) return `<td><span class="dim small">closed</span></td>`;
  const c = coverage(weekShifts(state.week), code, d), R = rules(), span = c.close - c.open;
  const bars = c.segs.map((g) => `<i class="${g.count < R.minStaff ? "gap" : ""}" style="left:${((g.start - c.open) / span) * 100}%;width:${((g.end - g.start) / span) * 100}%;opacity:${g.count >= R.minStaff ? Math.min(1, 0.55 + g.count * 0.2) : 1}"></i>`).join("");
  const gapMin = c.segs.filter((g) => g.count < R.minStaff).reduce((a, g) => a + g.end - g.start, 0);
  return `<td><div class="cov-bar">${bars}</div><div class="cov-lbl"><span>${fmtRange(c.open, c.close)}</span><span class="${gapMin ? "pill bad" : ""}" style="padding:0 6px">${gapMin ? fmtHours(gapMin) + " open" : "ok"}</span></div></td>`;
}
function hoursSummary(st) {
  const parts = []; let run = null;
  for (let d = 1; d <= 7; d++) {
    const h = st.hours[d]; const key = h ? fmtRange(h[0], h[1]) : "closed";
    if (run && run.key === key) run.to = d; else { run = { key, from: d, to: d }; parts.push(run); }
  }
  return parts.map((p) => `${DOW[p.from - 1]}${p.to > p.from ? "–" + DOW[p.to - 1] : ""} ${p.key}`).join(" · ");
}
// ---- Requests
function statusPill(s) {
  const map = { pending_peer: ["warn", "waiting on colleague"], pending_supervisor: ["iris", "waiting on manager"], approved: ["good", "approved"], declined_peer: ["bad", "declined by colleague"], declined_supervisor: ["bad", "declined by manager"], cancelled: ["", "withdrawn"] };
  const [k, t] = map[s.status] || ["", s.status];
  return `<span class="pill ${k}">${t}</span>`;
}
function reqCard(s) {
  const me = state.me, from = emp(s.from_employee), to = emp(s.to_employee);
  const a = s.from_snapshot, b = s.to_snapshot;
  const acts = [];
  if (s.status === "pending_peer" && s.to_employee === me.id) acts.push(`<button class="btn ok" data-swap-act="accept" data-id="${s.id}">Yes, I'll do it</button><button class="btn danger" data-swap-act="decline" data-id="${s.id}">No</button>`);
  if (s.status === "pending_supervisor" && isSup()) acts.push(`<button class="btn primary" data-swap-act="approve" data-id="${s.id}">Approve</button><button class="btn danger" data-swap-act="reject" data-id="${s.id}">Decline</button>`);
  if ((s.status === "pending_peer" || s.status === "pending_supervisor") && s.from_employee === me.id) acts.push(`<button class="btn ghost sm" data-swap-act="cancel" data-id="${s.id}">Withdraw</button>`);
  const step = (on, cls) => `<i class="${on ? cls : ""}"></i>`;
  const st = s.status;
  const tl = `<div class="timeline">${step(true, "done")} sent ${step(st !== "pending_peer", st === "declined_peer" ? "bad" : "done")} ${st === "declined_peer" ? "declined" : "colleague ok"} ${step(["approved", "declined_supervisor"].includes(st), st === "declined_supervisor" ? "bad" : st === "pending_supervisor" ? "now" : "done")} ${st === "declined_supervisor" ? "manager declined" : st === "approved" ? "approved" : "manager"}${st === "cancelled" ? " · withdrawn" : ""}</div>`;
  return `<div class="card ${acts.length ? "attn" : ""}"><div class="req"><div>
    <div class="who"><span class="av" style="--ac:${colorFor(from.name)}">${initials(from.name)}</span><b>${esc(s.from_employee === me.id ? "You" : from.name)}</b><span class="arrow">→</span><span class="av" style="--ac:${colorFor(to.name)}">${initials(to.name)}</span><b>${esc(s.to_employee === me.id ? "You" : to.name)}</b>${statusPill(s)}</div>
    <div class="shifts">${a ? shiftBox(a, `${firstName(from.name)} gives this`) : `<div class="box dim">Nothing given, just covering</div>`}<div class="sw">${a && b ? "⇄" : "→"}</div>${b ? shiftBox(b, `${firstName(from.name)} takes this from ${firstName(to.name)}`) : `<div class="box dim">${esc(firstName(to.name))} takes it over</div>`}</div>
    ${s.message ? `<p class="msg">“${esc(s.message)}”</p>` : ""}${s.supervisor_note ? `<p class="msg">Manager: “${esc(s.supervisor_note)}”</p>` : ""}${tl}
  </div><div class="row" style="flex-direction:column;align-items:stretch">${acts.join("")}<span class="dim mono small" style="text-align:right">${esc(new Date(s.created_at).toLocaleDateString())}</span></div></div></div>`;
}
function renderRequests() {
  const all = mySwaps(), need = swapsNeedingMe();
  const list = state.reqTab === "me" ? need : all;
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Requests</div><h1>Covers &amp; <em>switches</em></h1><p class="panel-sub">A request goes to your colleague first. Once they say yes, the manager approves it and the schedule updates on its own.</p></div></div>
    <div class="tabs"><button class="tab ${state.reqTab === "me" ? "active" : ""}" data-reqtab="me">Needs me${need.length ? ` · ${need.length}` : ""}</button><button class="tab ${state.reqTab === "all" ? "active" : ""}" data-reqtab="all">${isSup() ? "Everything" : "All mine"} · ${all.length}</button></div>
    ${list.length ? list.map(reqCard).join("") : `<div class="empty"><h3>Nothing here</h3>${state.reqTab === "me" ? "Nobody is waiting on you." : "Tap a shift on your schedule to start one."}</div>`}
  </section>`;
}
async function swapAction(act, id) {
  const s = state.data.swaps.find((x) => x.id === id); if (!s) return;
  try {
    if (act === "accept") await peerRespond(s, true);
    else if (act === "decline") await peerRespond(s, false);
    else if (act === "cancel") await cancelSwap(s);
    else if (act === "approve" || act === "reject") {
      const c = openSheet(`<h3>${act === "approve" ? "Approve this change?" : "Decline this change?"}</h3><p class="sub">${esc(swapText(s))}</p>${act === "approve" ? approvalChecks(s) : ""}<label class="lbl">Note to both (optional)</label><input class="field" id="note" placeholder="optional"><div class="actions"><button class="btn" id="no">Back</button><button class="btn ${act === "approve" ? "primary" : "danger"}" id="ok">${act === "approve" ? "Approve & update schedule" : "Decline"}</button></div>`);
      $("#no", c).onclick = closeSheet; $("#ok", c).onclick = async () => { const note = $("#note", c).value.trim(); closeSheet(); await supervisorDecide(s, act === "approve", note); render(); };
      return;
    }
    render();
  } catch (e) { toast("That didn't go through: " + e.message, "err"); }
}
function approvalChecks(s) {
  const R = rules(), warns = [];
  const a = s.from_shift_id ? shiftById(s.from_shift_id) : null, b = s.to_shift_id ? shiftById(s.to_shift_id) : null;
  if (a) {
    const clash = shiftsOf(s.to_employee).find((x) => x.date === a.date && x.id !== (b && b.id)); if (clash) warns.push(`${ename(s.to_employee)} already works ${fmtRange(clash.start_min, clash.end_min)} at ${store(clash.store).name} that day.`);
    if (!worksStore(emp(s.to_employee), a.store)) warns.push(`${ename(s.to_employee)} isn't set up for ${store(a.store).name}.`);
    const m = weekMinutes(s.to_employee, a.week_start) + shiftLen(a) - (b && b.week_start === a.week_start ? shiftLen(b) : 0); if (m > R.maxHoursWeek * 60) warns.push(`${ename(s.to_employee)} would be at ${fmtHours(m)} that week (limit ${R.maxHoursWeek}h).`);
  }
  if (b) {
    const clash = shiftsOf(s.from_employee).find((x) => x.date === b.date && x.id !== (a && a.id)); if (clash) warns.push(`${ename(s.from_employee)} already works ${fmtRange(clash.start_min, clash.end_min)} at ${store(clash.store).name} that day.`);
    if (!worksStore(emp(s.from_employee), b.store)) warns.push(`${ename(s.from_employee)} isn't set up for ${store(b.store).name}.`);
    const m = weekMinutes(s.from_employee, b.week_start) + shiftLen(b) - (a && a.week_start === b.week_start ? shiftLen(a) : 0); if (m > R.maxHoursWeek * 60) warns.push(`${ename(s.from_employee)} would be at ${fmtHours(m)} that week (limit ${R.maxHoursWeek}h).`);
  }
  return warns.length ? `<div class="card attn small"><b>Heads up</b><ul style="margin:6px 0 0 18px;padding:0">${warns.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : `<p class="pill good">No rule conflicts. Hours and days stay within limits.</p>`;
}

// ---- Admin
function renderAdmin() {
  const tabs = [["team", "Team"], ["avail", "Availability"], ["stores", "Stores & hours"], ["rules", "Rules"], ["off", "Time off & must-work"], ["weeks", "Week tools"], ["settings", "Settings"]];
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Manage</div><h1>Rules, roster, <em>rebuilds</em></h1><p class="panel-sub">Everything the solver uses lives here. Change a rule, then rebuild a week under Week tools to see the effect. Locked shifts always survive a rebuild.</p></div>
      <span class="pill ${state.offline ? "warn" : "good"}">${state.offline ? "this device only · cloud tables missing" : "synced · Supabase"}</span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${state.adminTab === k ? "active" : ""}" data-admintab="${k}">${l}</button>`).join("")}</div>
    <div id="admin-body">${({ team: adminTeam, avail: adminAvail, stores: adminStores, rules: adminRules, off: adminOff, weeks: adminWeeks, settings: adminSettings })[state.adminTab]()}</div>
  </section>`;
}
function adminTeam() {
  const rows = state.data.employees.slice().sort(bySort);
  return `<div class="card"><table class="plain"><thead><tr><th>Name</th><th>Stores</th><th>Home</th><th>Role</th><th>Flex</th><th>Active</th><th>Email</th><th></th></tr></thead><tbody>
    ${rows.map((e) => `<tr data-emp="${esc(e.id)}"><td><input class="field" data-f="name" value="${esc(e.name)}"></td>
      <td>${stores().map((s) => `<label class="check" style="display:inline-flex;padding:2px 8px 2px 0"><input type="checkbox" data-store="${esc(s.code)}" ${worksStore(e, s.code) ? "checked" : ""}> ${esc(s.code)}</label>`).join("")}</td>
      <td><select class="field" data-f="home_store"><option value="">—</option>${stores().map((s) => `<option ${e.home_store === s.code ? "selected" : ""}>${esc(s.code)}</option>`).join("")}</select></td>
      <td><select class="field" data-f="role"><option value="staff" ${e.role === "staff" ? "selected" : ""}>staff</option><option value="supervisor" ${e.role === "supervisor" ? "selected" : ""}>supervisor</option></select></td>
      <td><input type="checkbox" data-f="flex" ${e.flex ? "checked" : ""} title="Can be called in on OFF days"></td>
      <td><input type="checkbox" data-f="active" ${e.active !== false ? "checked" : ""}></td>
      <td><input class="field" data-f="email" value="${esc(e.email || "")}" placeholder="for approval emails"></td>
      <td><button class="btn sm" data-save-emp="${esc(e.id)}">Save</button></td></tr>`).join("")}
  </tbody></table>
  <div class="row" style="margin-top:14px"><input class="field" id="new-emp" placeholder="New employee name" style="max-width:280px"><button class="btn" id="add-emp">Add</button><span class="small muted">Flex = the solver may call them in on an OFF day to close a gap. Supervisors approve swaps and get the emails.</span></div></div>`;
}
function adminAvail() {
  const list = emps().filter((e) => e.role !== "supervisor" || state.data.availability.some((a) => a.employee_id === e.id));
  const cur = emp(state.adminEmp) || list[0]; if (!cur) return `<div class="empty">Add employees first.</div>`;
  state.adminEmp = cur.id;
  const av = {}; state.data.availability.filter((a) => a.employee_id === cur.id).forEach((a) => (av[a.dow] = a));
  return `<div class="card"><div class="row" style="margin-bottom:14px"><select class="field" id="av-emp" style="max-width:280px">${list.map((e) => `<option value="${esc(e.id)}" ${e.id === cur.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select><span class="small muted">Weekly template: the shift they normally work each day. Leave a day blank for OFF. The solver clamps to store hours.</span></div>
  <div class="avgrid">${DOW.map((d, i) => { const dow = i + 1, a = av[dow];
    return `<div class="avday" data-dow="${dow}"><div class="wd">${d}</div><label class="check" style="padding:2px 0"><input type="checkbox" class="on" ${a ? "checked" : ""}> works</label><input type="time" class="field a" step="900" value="${a ? toHHMM(a.start_min) : "10:00"}"><input type="time" class="field b" step="900" value="${a ? toHHMM(a.end_min) : "18:00"}"><select class="field st">${(cur.stores || []).map((s) => `<option ${a && a.store === s ? "selected" : ""}>${esc(s)}</option>`).join("") || `<option>${esc(cur.home_store || "PL")}</option>`}</select></div>`; }).join("")}</div>
  <div class="actions"><button class="btn primary" id="save-av">Save availability</button></div>
  <p class="small muted">Saving only changes the template. Use Week tools → Rebuild to apply it to weeks already built.</p></div>`;
}
function adminStores() {
  return `<div class="card"><table class="plain"><thead><tr><th>Store</th><th>Name</th>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
    ${stores().map((s) => `<tr data-store-row="${esc(s.code)}"><td><b>${esc(s.code)}</b></td><td><input class="field" data-f="name" value="${esc(s.name)}" style="min-width:110px"></td>
      ${DOW.map((d, i) => { const h = s.hours[i + 1]; return `<td><label class="check" style="padding:0 0 4px"><input type="checkbox" class="open" data-dow="${i + 1}" ${h ? "checked" : ""}> open</label><input type="time" class="field tm a" step="900" value="${h ? toHHMM(h[0]) : "10:00"}"><input type="time" class="field tm b" step="900" value="${h ? toHHMM(h[1]) : "18:00"}"></td>`; }).join("")}</tr>`).join("")}
  </tbody></table><div class="actions"><button class="btn primary" id="save-stores">Save store hours</button></div></div>`;
}
function adminRules() {
  const R = rules();
  const num = (k, label, help, step = 1) => `<div><label class="lbl">${label}</label><input class="field" type="number" step="${step}" data-rule="${k}" value="${R[k]}"><div class="small muted" style="margin-top:4px">${help}</div></div>`;
  const chk = (k, label, help) => `<label class="check"><input type="checkbox" data-rule="${k}" ${R[k] ? "checked" : ""}> <span><b>${label}</b><br><span class="small muted">${help}</span></span></label>`;
  return `<div class="card"><div class="field-row">
    ${num("minStaff", "Minimum staff on the floor", "Every open minute at every store needs at least this many people. Gaps below it are flagged red.")}
    ${num("maxHoursWeek", "Max hours per week", "Hard ceiling per person. The solver won't extend or add shifts past it, and approvals warn if a swap would break it.")}
    ${num("maxDaysWeek", "Max days per week", "Hard ceiling on days worked.")}
    ${num("restarts", "Solver attempts per week", "How many randomized attempts to make before keeping the best. 200 is instant; 1000 is still under a second.", 10)}
    ${num("minShiftMin", "Shortest call-in shift (minutes)", "A fill-in shift is never shorter than this, even for a small gap.", 15)}
    ${num("maxShiftMin", "Longest shift (minutes)", "A shift is never stretched past this to cover a gap.", 15)}
  </div>
  <div style="margin-top:14px">${chk("clampToStoreHours", "Trim template shifts to store hours", "e.g. a 10–6 template on a day the store closes at 5 becomes 10–5.")}
  ${chk("allowFlexFill", "Flex staff can be called in on OFF days", "Only people with the Flex flag under Team.")}
  ${chk("allowCallInAnyone", "Anyone from that store can be called in on an OFF day", "Off by default. Turn on if you'd rather never leave a gap than respect OFF days.")}</div>
  <div class="actions"><button class="btn primary" id="save-rules">Save rules</button></div>
  <p class="small muted">Rules take effect the next time a week is built or rebuilt. Approved swaps and pinned shifts are never undone by a rule.</p></div>`;
}
function adminOff() {
  const off = state.data.time_off.slice().sort(by((o) => o.date)), must = state.data.must_work.slice().sort(by((m) => m.date));
  const opts = emps().filter((e) => e.role !== "supervisor").map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");
  return `<div class="card"><h2 class="sec">Time off <small>the solver never schedules these days</small></h2>
    <table class="plain"><tbody>${off.map((o) => `<tr><td>${esc(ename(o.employee_id))}</td><td class="mono">${esc(fmtDate(o.date, true))}</td><td class="muted">${esc(o.note || "")}</td><td style="text-align:right"><button class="btn sm danger" data-del-off="${o.id}">Remove</button></td></tr>`).join("") || `<tr><td class="dim">None</td></tr>`}</tbody></table>
    <div class="row" style="margin-top:12px"><select class="field" id="off-emp" style="max-width:220px">${opts}</select><input class="field" id="off-date" type="date" style="max-width:180px"><input class="field" id="off-note" placeholder="note" style="max-width:220px"><button class="btn" id="add-off">Add day off</button></div></div>
  <div class="card"><h2 class="sec">Needs to work <small>pinned into the week as a locked shift</small></h2>
    <table class="plain"><tbody>${must.map((m) => `<tr><td>${esc(ename(m.employee_id))}</td><td class="mono">${esc(fmtDate(m.date, true))} · ${fmtRange(m.start_min, m.end_min)}</td><td><span class="pill store s-${esc(m.store)}">${esc(m.store)}</span></td><td class="muted">${esc(m.note || "")}</td><td style="text-align:right"><button class="btn sm danger" data-del-must="${m.id}">Remove</button></td></tr>`).join("") || `<tr><td class="dim">None</td></tr>`}</tbody></table>
    <div class="row" style="margin-top:12px"><select class="field" id="must-emp" style="max-width:220px">${opts}</select><input class="field" id="must-date" type="date" style="max-width:170px"><input class="field tm" id="must-a" type="time" step="900" value="10:00" style="max-width:120px"><input class="field tm" id="must-b" type="time" step="900" value="14:00" style="max-width:120px"><select class="field" id="must-st" style="max-width:100px">${stores().map((s) => `<option>${esc(s.code)}</option>`).join("")}</select><button class="btn" id="add-must">Add</button></div>
    <p class="small muted">Adding either one rebuilds the affected week automatically (locked shifts stay).</p></div>`;
}
function adminWeeks() {
  const issues = weekIssues(state.week), sh = weekShifts(state.week);
  const totals = emps().filter((e) => e.role !== "supervisor").map((e) => ({ e, m: weekMinutes(e.id, state.week), d: empDays(sh, e.id) })).filter((x) => x.m);
  return `<div class="card"><div class="row" style="justify-content:space-between">${weekNav()}<div class="row"><button class="btn primary" id="rebuild">Rebuild this week</button><button class="btn" id="rebuild-all">Rebuild all ${WEEKS_AHEAD + 1} weeks</button></div></div>
    <p class="small muted" style="margin-top:10px">Rebuild throws out every unlocked shift in the week and re-solves from the templates, time off, must-work and rules. Locked shifts (🔒 approved swaps, must-work, pinned) are kept exactly as they are. ${sh.length} shifts · ${sh.filter((s) => s.locked).length} locked · ${sh.filter((s) => s.source === "fill").length} solver fills.</p></div>
  <div class="card"><h2 class="sec">Flags this week</h2>${issues.length ? `<ul class="small" style="margin:0 0 0 18px;padding:0">${issues.map((i) => `<li>${esc(i.text)}</li>`).join("")}</ul>` : `<span class="pill good">Clean. Every open hour covered, everyone within limits.</span>`}</div>
  <div class="card"><h2 class="sec">Hours this week</h2><table class="plain"><tbody>${totals.sort((a, b) => b.m - a.m).map((x) => `<tr><td>${esc(x.e.name)}</td><td class="mono">${fmtHours(x.m)}</td><td class="mono muted">${x.d} day${x.d === 1 ? "" : "s"}</td><td>${x.m > rules().maxHoursWeek * 60 ? '<span class="pill bad">over</span>' : ""}</td></tr>`).join("")}</tbody></table></div>`;
}
function adminSettings() {
  const S = state.data.settings;
  return `<div class="card"><label class="lbl">Supervisor email (approval requests go here)</label><input class="field" id="sup-email" value="${esc(S.supervisor_email || "")}" placeholder="manager@store.com">
    <label class="lbl">Store code (the PIN everyone types)</label><input class="field" id="pin" value="${esc(S.pin || SEED.pin)}" maxlength="8" style="max-width:160px">
    <div class="actions"><button class="btn primary" id="save-settings">Save</button></div></div>
  <div class="card"><h2 class="sec">Email delivery</h2><p class="small muted">Approval emails are sent through the Supabase Edge Function <span class="mono">${NOTIFY_FN}</span> using Resend. Until it's deployed with a RESEND_API_KEY secret, requests still land in the manager's in-app queue and this badge shows in the rail; only the email is missing. Deploy steps are in the README next to this app.</p>
  <button class="btn" id="test-email">Send a test email</button></div>
  <div class="card"><h2 class="sec">Data</h2><p class="small muted">Cloud: ${state.offline ? `<span class="pill warn">tables missing</span> ${esc(state.cloudError || "")} — run supabase/schema.sql in the Supabase SQL editor, then reload.` : `<span class="pill good">connected</span> ${esc(SUPABASE_URL)}`}</p>
  <p class="small muted">Version ${APP_VERSION}.</p></div>`;
}
function wireAdmin(root) {
  // team
  $$("[data-save-emp]", root).forEach((b) => (b.onclick = async () => {
    const tr = b.closest("tr"), id = b.dataset.saveEmp;
    const patch = { name: $('[data-f="name"]', tr).value.trim(), stores: $$("[data-store]", tr).filter((c) => c.checked).map((c) => c.dataset.store), home_store: $('[data-f="home_store"]', tr).value || null, role: $('[data-f="role"]', tr).value, flex: $('[data-f="flex"]', tr).checked, active: $('[data-f="active"]', tr).checked, email: $('[data-f="email"]', tr).value.trim() || null };
    try { await dbUpdate(T.employees, { id }, patch); await refresh(["employees"]); if (state.me && state.me.id === id) state.me = emp(id); toast("Saved.", "ok"); render(); } catch (e) { toast(e.message, "err"); }
  }));
  const addEmp = $("#add-emp", root); if (addEmp) addEmp.onclick = async () => {
    const name = $("#new-emp", root).value.trim(); if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5);
    try { await dbInsert(T.employees, [{ id, name, stores: [], home_store: null, role: "staff", flex: false, active: true, sort: 500 }]); await refresh(["employees"]); render(); toast("Added. Tick their stores and save.", "ok"); } catch (e) { toast(e.message, "err"); }
  };
  // availability
  const avSel = $("#av-emp", root); if (avSel) avSel.onchange = () => { state.adminEmp = avSel.value; render(); };
  const saveAv = $("#save-av", root); if (saveAv) saveAv.onclick = async () => {
    const id = state.adminEmp; const rows = [];
    $$(".avday", root).forEach((d) => { if (!$(".on", d).checked) return; const a = fromHHMM($(".a", d).value), b = fromHHMM($(".b", d).value); if (a == null || b == null || b <= a) return; rows.push({ employee_id: id, dow: Number(d.dataset.dow), start_min: a, end_min: b, store: $(".st", d).value }); });
    try { await dbDelete(T.availability, { employee_id: id }); if (rows.length) await dbInsert(T.availability, rows); await refresh(["availability"]); toast("Availability saved. Rebuild weeks to apply.", "ok"); render(); } catch (e) { toast(e.message, "err"); }
  };
  // stores
  const saveSt = $("#save-stores", root); if (saveSt) saveSt.onclick = async () => {
    const out = $$("[data-store-row]", root).map((tr) => { const code = tr.dataset.storeRow, hours = {}; $$("td", tr).forEach((td) => { const o = $(".open", td); if (!o) return; hours[o.dataset.dow] = o.checked ? [fromHHMM($(".a", td).value), fromHHMM($(".b", td).value)] : null; }); return { code, name: $('[data-f="name"]', tr).value.trim() || code, hours }; });
    try { await dbUpsert(T.settings, [{ key: "stores", value: out }], "key"); await refresh(["settings"]); toast("Store hours saved.", "ok"); render(); } catch (e) { toast(e.message, "err"); }
  };
  // rules
  const saveR = $("#save-rules", root); if (saveR) saveR.onclick = async () => {
    const R = { ...rules() }; $$("[data-rule]", root).forEach((i) => { R[i.dataset.rule] = i.type === "checkbox" ? i.checked : Number(i.value); });
    try { await dbUpsert(T.settings, [{ key: "rules", value: R }], "key"); await refresh(["settings"]); toast("Rules saved. Rebuild a week to apply them.", "ok"); render(); } catch (e) { toast(e.message, "err"); }
  };
  // time off / must work
  $$("[data-del-off]", root).forEach((b) => (b.onclick = async () => { const o = state.data.time_off.find((x) => String(x.id) === b.dataset.delOff); await dbDelete(T.time_off, { id: o.id }); await refresh(["time_off"]); await rebuildWeek(mondayOf(o.date)); render(); toast("Removed and week rebuilt."); }));
  $$("[data-del-must]", root).forEach((b) => (b.onclick = async () => { const m = state.data.must_work.find((x) => String(x.id) === b.dataset.delMust); await dbDelete(T.must_work, { id: m.id }); const pinned = weekShifts(mondayOf(m.date)).filter((s) => s.employee_id === m.employee_id && s.date === m.date && s.source === "must"); for (const p of pinned) await dbDelete(T.shifts, { id: p.id }); await refresh(["must_work", "shifts"]); await rebuildWeek(mondayOf(m.date)); render(); toast("Removed and week rebuilt."); }));
  const addOff = $("#add-off", root); if (addOff) addOff.onclick = async () => {
    const employee_id = $("#off-emp", root).value, date = $("#off-date", root).value; if (!date) return toast("Pick a date.", "err");
    try { await dbUpsert(T.time_off, [{ employee_id, date, note: $("#off-note", root).value.trim() || null }], "employee_id,date"); await refresh(["time_off"]); if (weekShifts(mondayOf(date)).length) await rebuildWeek(mondayOf(date)); render(); toast("Day off added; week rebuilt.", "ok"); } catch (e) { toast(e.message, "err"); }
  };
  const addMust = $("#add-must", root); if (addMust) addMust.onclick = async () => {
    const employee_id = $("#must-emp", root).value, date = $("#must-date", root).value, a = fromHHMM($("#must-a", root).value), b = fromHHMM($("#must-b", root).value), st = $("#must-st", root).value;
    if (!date || a == null || b == null || b <= a) return toast("Pick a date and a valid time.", "err");
    try { await dbInsert(T.must_work, [{ employee_id, date, start_min: a, end_min: b, store: st, note: null }]); await refresh(["must_work"]); if (weekShifts(mondayOf(date)).length) await rebuildWeek(mondayOf(date)); render(); toast("Pinned; week rebuilt.", "ok"); } catch (e) { toast(e.message, "err"); }
  };
  // weeks
  const rb = $("#rebuild", root); if (rb) rb.onclick = () => confirmSheet("Rebuild this week?", `Unlocked shifts for ${weekLabel(state.week)} are thrown out and re-solved. Locked shifts stay.`, "Rebuild", async () => { rb.disabled = true; const r = await rebuildWeek(state.week); render(); toast(`Rebuilt. ${weekIssues(state.week).length} flag(s).`, "ok"); });
  const rba = $("#rebuild-all", root); if (rba) rba.onclick = () => confirmSheet("Rebuild every week?", `All ${WEEKS_AHEAD + 1} weeks from this Monday are re-solved. Locked shifts stay.`, "Rebuild all", async () => { for (const ws of weeksList()) await rebuildWeek(ws); render(); toast("All weeks rebuilt.", "ok"); });
  // settings
  const ss = $("#save-settings", root); if (ss) ss.onclick = async () => {
    const pin = $("#pin", root).value.trim() || SEED.pin, supervisor_email = $("#sup-email", root).value.trim();
    try { await dbUpsert(T.settings, [{ key: "pin", value: pin }, { key: "supervisor_email", value: supervisor_email }], "key"); await refresh(["settings"]); toast("Saved.", "ok"); } catch (e) { toast(e.message, "err"); }
  };
  const te = $("#test-email", root); if (te) te.onclick = async () => { te.disabled = true; const r = await sendEmail([state.data.settings.supervisor_email], "Le Parfumier schedule: test email", "If you can read this, approval emails are working."); te.disabled = false; if (r.error) toast("Not sent: " + r.error + ". Deploy the lps-notify function first (see README).", "err"); else if (r.skipped) toast("Skipped: " + r.skipped, "warn"); else toast("Sent. Check the inbox.", "ok"); };
}

// ============================================================ lock + picker
function renderPicker() {
  const grid = $("#picker-grid");
  const list = emps();
  grid.innerHTML = list.map((e) => `<button class="pick ${e.role === "supervisor" ? "sup" : ""}" data-pick="${esc(e.id)}"><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><b>${esc(e.name)}</b><small>${e.role === "supervisor" ? "MANAGER" : (e.stores || []).join(" · ") || "—"}</small></button>`).join("") || `<div class="empty">No employees yet.</div>`;
  $$("[data-pick]", grid).forEach((b) => (b.onclick = () => setMe(emp(b.dataset.pick))));
  $("#picker-status").textContent = state.offline ? "This device only · cloud tables not found (see Manage → Settings)" : "";
}
function setMe(e) {
  if (!e) return;
  state.me = e;
  try { sessionStorage.setItem(KEYS.me, e.id); } catch (err) {}
  $("#picker").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#whoami-name").textContent = firstName(e.name);
  const av = $("#whoami-av"); av.textContent = initials(e.name); av.style.setProperty("--ac", colorFor(e.name));
  if (!location.hash || (location.hash === "#admin" && !isSup())) location.hash = "#mine";
  route();
}
function switchPerson() {
  state.me = null; try { sessionStorage.removeItem(KEYS.me); } catch (e) {}
  $("#app").classList.add("hidden"); renderPicker(); $("#picker").classList.remove("hidden");
}
function tryUnlock() {
  const v = $("#lock-input").value.trim(); const pin = String(state.data.settings.pin || SEED.pin);
  if (v === pin) {
    state.unlocked = true; try { localStorage.setItem(KEYS.unlocked, "1"); } catch (e) {}
    $("#lock").classList.add("hidden"); renderPicker(); $("#picker").classList.remove("hidden");
  } else {
    $("#lock-error").textContent = "That's not it. Ask the manager for the store code."; $("#lock-input").value = "";
    const c = $(".lock-card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  }
}

// ================================================================== boot
async function boot() {
  $("#rail-ver").textContent = "v" + APP_VERSION;
  try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { sb = null; }
  try {
    if (!sb) throw new Error("supabase-js failed to load");
    await loadAll();
  } catch (e) {
    console.warn("Cloud unavailable, using this device only:", e);
    state.offline = true; state.cloudError = e.message || String(e);
    await loadAll();
  }
  try { await seedIfEmpty(); } catch (e) { console.error(e); toast("Couldn't seed the roster: " + e.message, "err"); }
  try { await ensureWeeks(); } catch (e) { console.error(e); toast("Couldn't build the weeks: " + e.message, "err"); }
  state.week = mondayOf(today()); state.loaded = true;

  // lock
  $("#lock-btn").onclick = tryUnlock;
  $("#lock-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  $("#whoami").onclick = switchPerson;
  $$(".rail-btn").forEach((b) => (b.onclick = () => go(b.dataset.route)));
  window.addEventListener("hashchange", route);

  let unlocked = false; try { unlocked = localStorage.getItem(KEYS.unlocked) === "1"; } catch (e) {}
  if (unlocked) {
    state.unlocked = true; $("#lock").classList.add("hidden");
    let meId = null; try { meId = sessionStorage.getItem(KEYS.me); } catch (e) {}
    if (meId && emp(meId)) setMe(emp(meId)); else { renderPicker(); $("#picker").classList.remove("hidden"); }
  } else { setTimeout(() => $("#lock-input").focus(), 400); }

  // live updates
  if (!state.offline && sb) {
    let t = null;
    const bump = () => { clearTimeout(t); t = setTimeout(async () => { try { await refresh(["shifts", "swaps", "notes", "employees", "settings"]); if (state.me) { state.me = emp(state.me.id) || state.me; render(); } } catch (e) {} }, 400); };
    sb.channel("lps-live")
      .on("postgres_changes", { event: "*", schema: "public", table: T.shifts }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: T.swaps }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: T.notes }, bump)
      .subscribe();
    // belt and braces: poll every 60s in case realtime isn't enabled on the tables
    setInterval(bump, 60000);
  }
}
boot();
