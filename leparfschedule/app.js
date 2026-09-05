// Le Parfumier: SCHEDULE — core: config, seed, state, helpers, data layer, text parser.
// Loaded first; solver.js, views.js and admin.js build on the globals defined here.
//
// Bump APP_VERSION on every deploy that changes any js/css/html file, and bump the
// matching ?v= query params in index.html.
"use strict";
const APP_VERSION = 7;

// Same Supabase project as the FLAG pilot and the other J3 apps. The anon key is
// public by design; the app is PIN-gated and row level security lets anon write.
const SUPABASE_URL = "https://ikypiznimyzidmyzzoys.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreXBpem5pbXl6aWRteXp6b3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzUzODIsImV4cCI6MjA5MzMxMTM4Mn0.Ee0FWPHjLBSOIFXWmdPSjG8oT3QmKyKG14BF8oPGgjk";
const NOTIFY_FN = "lps-notify";

const T = {
  employees: "lps_employees", availability: "lps_availability", avail_periods: "lps_availability_periods",
  time_off: "lps_time_off", must_work: "lps_must_work", off_requests: "lps_off_requests",
  shifts: "lps_shifts", swaps: "lps_swap_requests", notes: "lps_notifications",
  settings: "lps_settings", snapshots: "lps_snapshots", learned: "lps_learned",
};
const TABLE_NAMES = Object.keys(T);
const KEYS = { unlocked: "lps_unlocked", me: "lps_me", local: "lps_local_db", supName: "lps_sup_name", theme: "lps_theme" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKS_AHEAD = 6;

// ============================================================ seed (the sheet)
// Times are minutes since midnight. "10 TO 6" is 600..1080. dow 1 = Monday.
const SEED = {
  pin: "4545",
  supervisor_email: "dfrancispro@gmail.com",
  supervisor_names: ["Michael", "Katherine", "Anthony", "Carmie", "Tony"],
  stores: [
    { code: "PL", name: "PL", hours: { 1: [600, 1080], 2: [600, 1080], 3: [600, 1080], 4: [600, 1080], 5: [600, 1080], 6: [600, 1020], 7: null } },
    { code: "PB", name: "PB", hours: { 1: [600, 1080], 2: [600, 1080], 3: [600, 1080], 4: [600, 1140], 5: [600, 1140], 6: [600, 1020], 7: [600, 1020] } },
    { code: "PV", name: "PV", hours: { 1: [600, 1080], 2: [600, 1080], 3: [600, 1080], 4: [600, 1260], 5: [600, 1260], 6: [600, 1020], 7: [600, 1020] } },
  ],
  // The base rules. Every one is editable under Manage -> Rules; custom rules stack on top.
  rules: {
    minStaff: 1,              // people on the floor at every open minute
    maxHoursWeek: 40,         // ceiling per person per week (the solver breaks it only as a last resort, and flags it)
    maxDaysWeek: 6,           // ceiling on days worked per week
    minShiftMin: 180,         // a call-in shift is never shorter than 3h
    maxShiftMin: 600,         // a shift is never stretched past 10h unless nothing else closes a gap
    allowFlexFill: true,      // people marked "flex" can be called in on OFF days
    allowCallInAnyone: false, // anyone from that store with no shift that day can be called in at tier one
    neverLeaveGap: true,      // escalate: break hour limits, call in anyone, cross stores, rather than leave nobody on
    clampToStoreHours: true,  // trim template shifts to the store's opening hours (plus any buffer rules)
    restarts: 260,            // randomized attempts per week
  },
  custom_rules: [
    { id: "r-open", t: "openBuffer", on: true, store: "ALL", minutes: 15 },
    { id: "r-close", t: "closeBuffer", on: true, store: "ALL", minutes: 15 },
  ],
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
    { id: "manager",           name: "Manager",           stores: ["PL", "PB", "PV"], home_store: null, sort: 900, role: "supervisor", pin: "1212", email: "dfrancispro@gmail.com" },
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
  unlocked: false, me: null, route: "#mine", week: null, month: null, year: null, masterStore: "all",
  adminTab: "team", adminEmp: null, reqTab: "me", offline: false, cloudError: null, loaded: false,
  data: Object.fromEntries(TABLE_NAMES.map((n) => [n, n === "settings" ? {} : []])),
};

// ================================================================ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const by = (f) => (a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);
const pad = (n) => String(n).padStart(2, "0");
const randPin = () => String(1000 + Math.floor(Math.random() * 9000));

function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function today() { return ymd(new Date()); }
function mondayOf(s) { const d = parseYmd(s); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return ymd(d); }
function dowOf(s) { return ((parseYmd(s).getDay() + 6) % 7) + 1; } // 1..7
function dowName(s) { return DOW[dowOf(s) - 1]; }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function inRange(date, from, to) { return (!from || date >= from) && (!to || date <= to); }
function fmtDate(s, long) {
  const d = parseYmd(s); const m = d.toLocaleDateString("en-US", { month: "short" });
  return long ? `${DOW_LONG[dowOf(s) - 1]}, ${m} ${d.getDate()}` : `${DOW[dowOf(s) - 1]} ${m} ${d.getDate()}`;
}
function fmtMonthDay(s) { const d = parseYmd(s); return d.toLocaleDateString("en-US", { month: "short" }) + " " + d.getDate(); }
function fmtRangeDates(a, b) { return a === b ? fmtDate(a, true) : `${fmtMonthDay(a)} – ${fmtMonthDay(b)}`; }
function weekLabel(ws) { return `${fmtMonthDay(ws)} – ${fmtMonthDay(addDays(ws, 6))}`; }
function fmtT(min) {
  let h = Math.floor(min / 60), m = min % 60; const ap = h >= 12 && h < 24 ? "p" : "a"; h = h % 12 || 12;
  return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
}
function fmtRange(s, e) { return `${fmtT(s)}–${fmtT(e)}`; }
function fmtHours(min) { return (Math.round((min / 60) * 10) / 10) + "h"; }
function toHHMM(min) { return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
function fromHHMM(s) { if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); }
function colorFor(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 48%)`; }
function initials(name) { return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }
function firstName(name) { return name.split(/\s+/)[0]; }
function toast(msg, kind = "") {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show " + kind;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = "toast"), 3400);
}

// ================================================================ data layer
// Thin layer so the same code runs against Supabase or, when the tables are not
// there yet, against this browser's localStorage.
const local = { tables: null, counter: 0 };
function localLoad() {
  if (local.tables) return local.tables;
  try { local.tables = JSON.parse(localStorage.getItem(KEYS.local) || "null"); } catch (e) { local.tables = null; }
  if (!local.tables) local.tables = {};
  Object.values(T).forEach((t) => { if (!Array.isArray(local.tables[t])) local.tables[t] = []; });
  return local.tables;
}
function localSave() { try { localStorage.setItem(KEYS.local, JSON.stringify(local.tables)); } catch (e) {} }
function matches(row, match) { return Object.keys(match).every((k) => row[k] === match[k]); }
const UUID_TABLES = new Set([T.shifts, T.swaps, T.notes, T.off_requests, T.snapshots, T.learned, T.avail_periods]);

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
    const out = rows.map((r) => ({ ...r, id: r.id ?? (UUID_TABLES.has(table) ? uid() : ++local.counter + Date.now()), created_at: r.created_at || new Date().toISOString() }));
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
  if (state.offline) { const t = localLoad()[table]; t.forEach((r, i) => { if (matches(r, match)) t[i] = { ...r, ...patch }; }); localSave(); return; }
  const { error } = await sb.from(table).update(patch).match(match);
  if (error) throw error;
}
async function dbDelete(table, match) {
  if (state.offline) { const t = localLoad()[table]; local.tables[table] = t.filter((r) => !matches(r, match)); localSave(); return; }
  const { error } = await sb.from(table).delete().match(match);
  if (error) throw error;
}
async function dbDeleteIn(table, col, values) {
  if (!values.length) return;
  if (state.offline) { const set = new Set(values); const t = localLoad()[table]; local.tables[table] = t.filter((r) => !set.has(r[col])); localSave(); return; }
  const { error } = await sb.from(table).delete().in(col, values);
  if (error) throw error;
}

async function loadAll() { await refresh(TABLE_NAMES); }
async function refresh(names) {
  const rows = await Promise.all(names.map((n) => dbSelect(T[n])));
  names.forEach((n, i) => { state.data[n] = n === "settings" ? Object.fromEntries(rows[i].map((r) => [r.key, r.value])) : rows[i]; });
}
async function saveSetting(key, value) { await dbUpsert(T.settings, [{ key, value }], "key"); state.data.settings[key] = value; }

async function seedIfEmpty() {
  if (state.data.employees.length) return false;
  await dbInsert(T.employees, SEED.employees.map((e) => ({ id: e.id, name: e.name, stores: e.stores, home_store: e.home_store, role: e.role || "staff", email: e.email || null, flex: !!e.flex, active: true, sort: e.sort, pin: e.pin || randPin() })));
  await dbInsert(T.availability, SEED.availability.map(([employee_id, dow, start_min, end_min, store]) => ({ employee_id, dow, start_min, end_min, store })));
  await dbInsert(T.time_off, SEED.time_off);
  await dbInsert(T.must_work, SEED.must_work);
  await dbUpsert(T.settings, [
    { key: "stores", value: SEED.stores }, { key: "rules", value: SEED.rules }, { key: "custom_rules", value: SEED.custom_rules },
    { key: "pin", value: SEED.pin }, { key: "supervisor_email", value: SEED.supervisor_email }, { key: "supervisor_names", value: SEED.supervisor_names },
    { key: "store_hour_overrides", value: [] },
  ], "key");
  await loadAll();
  return true;
}
// Fill in anything a newer version added without touching what is already there.
async function migrate() {
  const S = state.data.settings; let touched = false;
  if (!S.custom_rules) { await saveSetting("custom_rules", SEED.custom_rules); touched = true; }
  if (!S.supervisor_names) { await saveSetting("supervisor_names", SEED.supervisor_names); touched = true; }
  if (!S.store_hour_overrides) { await saveSetting("store_hour_overrides", []); touched = true; }
  for (const e of state.data.employees) {
    if (!e.pin) { const pin = e.role === "supervisor" ? "1212" : randPin(); try { await dbUpdate(T.employees, { id: e.id }, { pin }); e.pin = pin; touched = true; } catch (err) { console.warn("pin column missing? run schema.sql", err); break; } }
  }
  return touched;
}

// ============================================================== accessors
const bySort = (a, b) => ((a.sort ?? 100) - (b.sort ?? 100)) || String(a.name).localeCompare(String(b.name));
const emps = () => state.data.employees.filter((e) => e.active !== false).sort(bySort);
const staff = () => emps().filter((e) => e.role !== "supervisor" || state.data.availability.some((a) => a.employee_id === e.id));
const emp = (id) => state.data.employees.find((e) => e.id === id);
const ename = (id) => (emp(id) || {}).name || "Someone";
const stores = () => state.data.settings.stores || SEED.stores;
const store = (code) => stores().find((s) => s.code === code) || { code, name: code, hours: {} };
const rules = () => ({ ...SEED.rules, ...(state.data.settings.rules || {}) });
const customRules = () => state.data.settings.custom_rules || [];
const supervisorNames = () => state.data.settings.supervisor_names || SEED.supervisor_names;
const supervisors = () => state.data.employees.filter((e) => e.role === "supervisor" && e.active !== false);
const isSup = () => !!(state.me && state.me.role === "supervisor");
const shiftsOf = (empId) => state.data.shifts.filter((s) => s.employee_id === empId);
const weekShifts = (ws) => state.data.shifts.filter((s) => s.week_start === ws);
const worksStore = (e, code) => (e.stores || []).includes(code);
const shiftLen = (s) => s.end_min - s.start_min;
const weekMinutes = (empId, ws) => weekShifts(ws).filter((s) => s.employee_id === empId).reduce((a, s) => a + shiftLen(s), 0);
const weeksList = () => { const start = mondayOf(today()); return Array.from({ length: WEEKS_AHEAD + 1 }, (_, i) => addDays(start, 7 * i)); };
const weekDays = (ws) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
function shiftById(id) { return state.data.shifts.find((s) => s.id === id); }
function describeShift(s) { return s ? `${fmtDate(s.date)} · ${fmtRange(s.start_min, s.end_min)} · ${store(s.store).name}` : "—"; }

// approved block-outs and PTO count as time off; plain time_off rows are pre-approved
function offRequestsFor(empId, date, status) {
  return state.data.off_requests.filter((o) => o.employee_id === empId && (!status || o.status === status) && inRange(date, o.date_from, o.date_to));
}
function isOff(empId, date) { return state.data.time_off.some((o) => o.employee_id === empId && o.date === date) || offRequestsFor(empId, date, "approved").length > 0; }
function offReason(empId, date) {
  const t = state.data.time_off.find((o) => o.employee_id === empId && o.date === date); if (t) return t.note || "Day off";
  const r = offRequestsFor(empId, date, "approved")[0]; return r ? (r.kind === "pto" ? "PTO" : "Blocked out") : null;
}

// Store hours for a date: temporary overrides (holiday hours, seasons) win over the weekly default.
function storeHours(code, date) {
  const ov = state.data.settings.store_hour_overrides || [];
  for (const o of ov) {
    if (o.on === false) continue;
    if (o.store !== "ALL" && o.store !== code) continue;
    const reg = (store(code).hours || {})[dowOf(date)];
    if (o.dates && Object.prototype.hasOwnProperty.call(o.dates, date)) return resolveHoursVal(o.dates[date], reg);
    if (o.from && o.to && inRange(date, o.from, o.to) && o.hours) { const v = o.hours[dowOf(date)]; if (v !== undefined) return resolveHoursVal(v, reg); }
  }
  const h = store(code).hours || {}; const v = h[dowOf(date)];
  return v && v.length === 2 ? v : null;
}
function hoursOverrideFor(code, date) {
  return (state.data.settings.store_hour_overrides || []).find((o) => o.on !== false && (o.store === "ALL" || o.store === code) && ((o.dates && Object.prototype.hasOwnProperty.call(o.dates, date)) || (o.from && o.to && inRange(date, o.from, o.to) && o.hours && o.hours[dowOf(date)] !== undefined)));
}

// Availability for one person on one date: a dated special period wins over the weekly template.
function availFor(empId, date) {
  const dow = dowOf(date);
  const p = state.data.avail_periods.find((x) => x.employee_id === empId && inRange(date, x.date_from, x.date_to));
  if (p) { const v = (p.pattern || {})[dow]; return v ? { start_min: v.start_min, end_min: v.end_min, store: v.store, period: p } : null; }
  return state.data.availability.find((a) => a.employee_id === empId && a.dow === dow) || null;
}

// ============================================================ text parser
// Understands the spreadsheet paste ("Elodie Bourque\tPV\tOFF\t10 TO 6 ...") and loose
// lines ("Maria: Mon 10 to 6, Tue off, Sat 10-5 PV"). Returns { people, errors, storeHours }.
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:to|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?![a-z])/i;
function parseHour(h, m, ap, isEnd) {
  h = Number(h); m = Number(m || 0);
  if (ap) { ap = ap.toLowerCase()[0]; if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0; }
  else if (isEnd ? h <= 9 : h < 9) h += 12; // retail hours: "3 to 9" is 3pm–9pm, "10 to 6" is 10am–6pm
  return h * 60 + m;
}
function parseTimeRange(txt) {
  if (!txt) return null;
  if (!TIME_RE.test(txt) && /\b(off|closed|x)\b|^\s*[-—]\s*$/i.test(txt.trim())) return "OFF";
  const m = txt.match(TIME_RE); if (!m) return null;
  const start = parseHour(m[1], m[2], m[3], false), end = parseHour(m[4], m[5], m[6], true);
  if (end <= start) return null;
  const storeM = txt.replace(TIME_RE, "").match(/\b(PL|PB|PV)\b/i);
  return { start_min: start, end_min: end, store: storeM ? storeM[1].toUpperCase() : null };
}
const DAY_TOKENS = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };
const MONTH_TOKENS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
// "October 15th and December 10th", "September 10th AND 17th", "Dec 24-26", "2026-12-25"
function parseDates(txt, refYear) {
  const out = []; if (!txt) return out;
  const year0 = refYear || new Date().getFullYear();
  const iso = txt.match(/\d{4}-\d{2}-\d{2}/g); if (iso) iso.forEach((d) => out.push(d));
  let month = null;
  const re = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:-|–|to)\s*(\d{1,2})(?:st|nd|rd|th)?)?\b|\b(\d{1,2})(?:st|nd|rd|th)\b/g;
  let m;
  while ((m = re.exec(txt))) {
    let mon = null, d1 = null, d2 = null;
    if (m[1]) { const k = m[1].toLowerCase(); if (k in MONTH_TOKENS) { mon = MONTH_TOKENS[k]; month = mon; } else if (month !== null && /(st|nd|rd|th)\b/.test(m[0])) mon = month; else continue; d1 = Number(m[2]); d2 = m[3] ? Number(m[3]) : null; }
    else { if (month === null) continue; mon = month; d1 = Number(m[4]); }
    const mk = (d) => { let y = year0; if (ymd(new Date(y, mon, d)) < addDays(today(), -60)) y++; return ymd(new Date(y, mon, d)); };
    if (d2 && d2 >= d1) for (let d = d1; d <= d2; d++) out.push(mk(d)); else out.push(mk(d1));
  }
  return Array.from(new Set(out)).sort();
}
function parseSheet(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " ")).filter((l) => l.trim());
  const people = [], errors = [], storeHoursOut = [];
  let cols = null;
  for (const raw of lines) {
    const cells = raw.includes("\t") ? raw.split("\t").map((c) => c.trim()) : null;
    if (cells && /employee|name/i.test(cells[0]) && cells.some((c) => /mon/i.test(c))) { cols = cells.map((c) => c.toLowerCase()); continue; }
    if (cells && (/store hours/i.test(cells[0] || "") || (!cells[0] && /^(PL|PB|PV)$/i.test(cells[1] || "")))) {
      const code = (cells[1] || "").toUpperCase(); if (!/^(PL|PB|PV)$/.test(code)) continue;
      const hours = {}; for (let d = 1; d <= 7; d++) { const r = parseTimeRange(cells[1 + d] || ""); hours[d] = r === "OFF" || r === null ? null : [r.start_min, r.end_min]; }
      storeHoursOut.push({ code, hours }); continue;
    }
    if (cells && cells.length >= 4) {
      const name = cells[0]; if (!name) continue;
      const p = { name, stores: (cells[1] || "").toUpperCase().split(/[^A-Z]+/).filter((x) => /^(PL|PB|PV)$/.test(x)), days: {}, time_off: [], must_work: [] };
      const dayStart = cols ? cols.findIndex((c) => /^mon/.test(c)) : 2;
      for (let d = 1; d <= 7; d++) {
        const cell = cells[dayStart + d - 1]; if (cell === undefined) continue;
        const r = parseTimeRange(cell);
        if (r && r !== "OFF") p.days[d] = { ...r, store: r.store || p.stores[0] || null };
        else if (cell && r === null && cell.trim()) errors.push(`${name}: couldn't read "${cell}" for ${DOW[d - 1]}`);
      }
      const offCol = cols ? cols.findIndex((c) => /time off/.test(c)) : dayStart + 7, mustCol = cols ? cols.findIndex((c) => /needs to work|must/.test(c)) : dayStart + 8;
      const offTxt = offCol >= 0 ? cells[offCol] : "", mustTxt = mustCol >= 0 ? cells[mustCol] : "";
      if (offTxt) p.time_off = parseDates(offTxt);
      if (mustTxt) { const r = parseTimeRange(mustTxt); parseDates(mustTxt).forEach((date) => p.must_work.push({ date, start_min: r && r !== "OFF" ? r.start_min : 600, end_min: r && r !== "OFF" ? r.end_min : 1080, store: (r && r.store) || p.stores[0] || "PL" })); }
      people.push(p); continue;
    }
    // loose: "Name (PL): Mon 10 to 6, Tue off, Sat 10-5 PB"  or  "Name — Mon-Fri 10 to 6"
    const m = raw.match(/^\s*([A-Za-z][A-Za-z .'-]+?)\s*(?:\(([^)]*)\))?\s*[:—-]\s*(.+)$/);
    if (!m) { errors.push(`Couldn't read: "${raw.trim()}"`); continue; }
    const p = { name: m[1].trim(), stores: (m[2] || "").toUpperCase().split(/[^A-Z]+/).filter((x) => /^(PL|PB|PV)$/.test(x)), days: {}, time_off: [], must_work: [] };
    m[3].split(/[,;]/).forEach((part) => {
      const dm = part.match(/\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b(?:\s*(?:-|–|to)\s*(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b)?/i);
      if (!dm) return;
      const d1 = DAY_TOKENS[dm[1].toLowerCase()], d2 = dm[2] ? DAY_TOKENS[dm[2].toLowerCase()] : d1;
      const rest = part.replace(dm[0], ""); const r = parseTimeRange(rest);
      for (let d = d1; d <= d2; d++) { if (r && r !== "OFF") p.days[d] = { ...r, store: r.store || p.stores[0] || null }; else if (r === null && rest.trim()) errors.push(`${p.name}: couldn't read "${part.trim()}"`); }
    });
    people.push(p);
  }
  return { people, errors, storeHours: storeHoursOut };
}
// Temporary hours typed loosely, one date per line. The month carries over between lines:
//   Dec 24 10-3          → 10a–3p
//   25 closed            → closed
//   26 open til 5        → regular opening time, closes 5p   ({ close })
//   27 open at 12        → opens 12p, regular closing time   ({ open })
//   Dec 28 - Jan 2: 12 to 5
// Returns { dates: { 'YYYY-MM-DD': [o,c] | null | {open?,close?} }, errors }.
function parseHoursPhrase(txt) {
  const t = (txt || "").trim();
  if (!t) return { err: "no hours" };
  if (/\b(closed|close|off|shut)\b/i.test(t) && !/\d/.test(t)) return { v: null };
  const r = parseTimeRange(t);
  if (r && r !== "OFF") return { v: [r.start_min, r.end_min] };
  let m = t.match(/(?:til{1,2}|until|to|close[sd]?(?:\s*at)?|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?![a-z])/i);
  if (m) return { v: { close: parseHour(m[1], m[2], m[3], true) } };
  m = t.match(/(?:open(?:s|ing)?(?:\s*at)?|from|start(?:s)?(?:\s*at)?|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?![a-z])/i);
  if (m) return { v: { open: parseHour(m[1], m[2], m[3], false) } };
  return { err: `couldn't read "${t}"` };
}
function parseDatedHours(text) {
  const out = {}, errors = []; let month = null;
  const year0 = new Date().getFullYear();
  const mk = (mon, d) => { let y = year0; if (ymd(new Date(y, mon, d)) < addDays(today(), -60)) y++; return ymd(new Date(y, mon, d)); };
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    let rest = line;
    const mm = rest.match(/^([A-Za-z]{3,9})\.?\s+(?=\d)/);
    let mon = month;
    if (mm && MONTH_TOKENS[mm[1].toLowerCase()] !== undefined) { mon = MONTH_TOKENS[mm[1].toLowerCase()]; month = mon; rest = rest.slice(mm[0].length); }
    const dm = rest.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:-|–|to|through|thru)\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?)?\s*[:,=]?\s*/);
    if (!dm || mon === null) { errors.push(`No date in "${line}" (start with a month, e.g. "Dec 24 10-3")`); return; }
    rest = rest.slice(dm[0].length);
    const d1 = Number(dm[1]); let mon2 = mon, d2 = dm[3] ? Number(dm[3]) : d1;
    if (dm[2] && MONTH_TOKENS[dm[2].toLowerCase()] !== undefined) { mon2 = MONTH_TOKENS[dm[2].toLowerCase()]; month = mon2; }
    const from = mk(mon, d1), to = mk(mon2, d2);
    if (to < from) { errors.push(`Range runs backwards in "${line}"`); return; }
    const h = parseHoursPhrase(rest);
    if (h.err) { errors.push(`${h.err} in "${line}"`); return; }
    for (let d = from; d <= to; d = addDays(d, 1)) out[d] = h.v;
  });
  return { dates: out, errors };
}
// A stored hours value may be [open, close], null (closed) or a partial { open?, close? }
// that overrides only one end of the regular hours.
function resolveHoursVal(v, regular) {
  if (v === null) return null;
  if (Array.isArray(v)) return v.length === 2 ? v : null;
  if (v && typeof v === "object") { const base = regular && regular.length === 2 ? regular : [600, 1080]; return [v.open ?? base[0], v.close ?? base[1]]; }
  return regular && regular.length === 2 ? regular : null;
}
function fmtHoursVal(v) {
  if (v === null) return "closed";
  if (Array.isArray(v)) return fmtRange(v[0], v[1]);
  if (v && typeof v === "object") return (v.open != null ? "opens " + fmtT(v.open) : "") + (v.open != null && v.close != null ? ", " : "") + (v.close != null ? "closes " + fmtT(v.close) : "");
  return "";
}
