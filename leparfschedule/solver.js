// Le Parfumier: SCHEDULE — solver, rules engine, snapshots, learning.
//
// The Jaguars pattern: hard rules filter what is allowed, a randomized greedy pass
// fills demand, a soft score keeps the best of many restarts, and anything locked
// (approved swaps, "needs to work", manager pins) is never touched.
//
// V2 additions: coverage demand is built from store hours PLUS custom rules (open /
// close buffers, minimum staff per day or window). Gap filling escalates through
// tiers, so a gap is only ever left open when literally nobody can legally work it;
// every compromise (over hours, cross-store, called in on an OFF day) is flagged.
"use strict";

// ============================================================ custom rules
// Each rule type lists the fields its editor shows. Values are stored on the rule.
const RULE_TYPES = [
  { t: "openBuffer",     label: "Someone starts N minutes before a store opens",          fields: ["store", "minutes"] },
  { t: "closeBuffer",    label: "Someone stays N minutes after a store closes",            fields: ["store", "minutes"] },
  { t: "minStaffDay",    label: "A store needs at least N people on a day",                fields: ["store", "n", "day"] },
  { t: "minStaffWindow", label: "A store needs at least N people between two times",       fields: ["store", "n", "day", "from", "to"] },
  { t: "noDay",          label: "An employee never works a day",                          fields: ["emp", "day"] },
  { t: "mustDay",        label: "An employee always works a day (soft)",                  fields: ["emp", "day"] },
  { t: "noStore",        label: "An employee can't work at a store",                      fields: ["emp", "store"] },
  { t: "maxHoursEmp",    label: "An employee works at most N hours a week",               fields: ["emp", "n"] },
  { t: "minHoursEmp",    label: "An employee should get at least N hours a week (soft)",  fields: ["emp", "n"] },
  { t: "maxConsecutive", label: "An employee never works more than N days in a row",      fields: ["emp", "n"] },
  { t: "notTogether",    label: "Two employees are never on together at the same store",  fields: ["emp", "emp2"] },
  { t: "together",       label: "Two employees are always scheduled together (soft)",     fields: ["emp", "emp2"] },
  { t: "preferFill",     label: "Prefer an employee for call-ins at a store",             fields: ["emp", "store"] },
  { t: "note",           label: "Note to ourselves (not enforced)",                       fields: ["text"] },
];
const activeRules = () => customRules().filter((r) => r.on !== false);
function ruleText(r) {
  const st = (c) => (!c || c === "ALL" ? "every store" : store(c).name), dy = (d) => (!d || d === "ANY" ? "any day" : DOW_LONG[Number(d) - 1] + "s");
  switch (r.t) {
    case "openBuffer": return `At ${st(r.store)}, someone starts ${r.minutes} min before opening`;
    case "closeBuffer": return `At ${st(r.store)}, someone stays ${r.minutes} min after closing`;
    case "minStaffDay": return `${st(r.store)} needs at least ${r.n} on ${dy(r.day)}`;
    case "minStaffWindow": return `${st(r.store)} needs at least ${r.n} between ${fmtT(fromHHMM(r.from))} and ${fmtT(fromHHMM(r.to))} on ${dy(r.day)}`;
    case "noDay": return `${ename(r.emp)} never works ${dy(r.day)}`;
    case "mustDay": return `${ename(r.emp)} always works ${dy(r.day)}`;
    case "noStore": return `${ename(r.emp)} can't work at ${st(r.store)}`;
    case "maxHoursEmp": return `${ename(r.emp)} works at most ${r.n}h a week`;
    case "minHoursEmp": return `${ename(r.emp)} should get at least ${r.n}h a week`;
    case "maxConsecutive": return `${ename(r.emp)} never works more than ${r.n} days in a row`;
    case "notTogether": return `${ename(r.emp)} and ${ename(r.emp2)} are never on together`;
    case "together": return `${ename(r.emp)} and ${ename(r.emp2)} are always scheduled together`;
    case "preferFill": return `Prefer ${ename(r.emp)} for call-ins at ${st(r.store)}`;
    case "note": return r.text || "Note";
    default: return r.t;
  }
}
const ruleStoreOk = (r, code) => !r.store || r.store === "ALL" || r.store === code;
const ruleDayOk = (r, date) => !r.day || r.day === "ANY" || Number(r.day) === dowOf(date);
function hardBlocked(e, date, code) {
  return activeRules().some((r) => (r.t === "noDay" && r.emp === e.id && ruleDayOk(r, date)) || (r.t === "noStore" && r.emp === e.id && r.store === code));
}
function maxHoursFor(e, R) {
  const r = activeRules().find((x) => x.t === "maxHoursEmp" && x.emp === e.id);
  return (r ? Math.min(Number(r.n), R.maxHoursWeek) : R.maxHoursWeek) * 60;
}

// ============================================================ requirements
// What a store needs on a date: base staffing over opening hours, buffers before and
// after, plus any minimum-staff rules. Returns null when the store is closed.
function requirements(code, date) {
  const hrs = storeHours(code, date); if (!hrs) return null;
  const R = rules();
  const segs = [{ start: hrs[0], end: hrs[1], need: R.minStaff }];
  activeRules().forEach((r) => {
    if (!ruleStoreOk(r, code)) return;
    if (r.t === "openBuffer" && r.minutes > 0) segs.push({ start: hrs[0] - Number(r.minutes), end: hrs[0], need: 1 });
    if (r.t === "closeBuffer" && r.minutes > 0) segs.push({ start: hrs[1], end: hrs[1] + Number(r.minutes), need: 1 });
    if (r.t === "minStaffDay" && ruleDayOk(r, date)) segs.push({ start: hrs[0], end: hrs[1], need: Number(r.n) });
    if (r.t === "minStaffWindow" && ruleDayOk(r, date)) { const s = Math.max(hrs[0], fromHHMM(r.from) ?? hrs[0]), e = Math.min(hrs[1], fromHHMM(r.to) ?? hrs[1]); if (e > s) segs.push({ start: s, end: e, need: Number(r.n) }); }
  });
  return { hrs, open: Math.min(...segs.map((s) => s.start)), close: Math.max(...segs.map((s) => s.end)), segs };
}
function needAt(req, t) { let n = 0; req.segs.forEach((s) => { if (s.start <= t && t < s.end) n = Math.max(n, s.need); }); return n; }

function coverage(shifts, code, date) {
  const req = requirements(code, date); if (!req) return null;
  const rel = shifts.filter((s) => s.store === code && s.date === date);
  const pts = new Set([req.open, req.close]);
  req.segs.forEach((s) => { pts.add(s.start); pts.add(s.end); });
  rel.forEach((s) => { pts.add(Math.max(req.open, Math.min(req.close, s.start_min))); pts.add(Math.max(req.open, Math.min(req.close, s.end_min))); });
  const cuts = Array.from(pts).sort((a, b) => a - b), segs = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b <= a) continue;
    segs.push({ start: a, end: b, count: rel.filter((s) => s.start_min < b && s.end_min > a).length, need: needAt(req, a) });
  }
  return { open: req.open, close: req.close, hrs: req.hrs, segs };
}
function gapsFor(shifts, code, date) {
  const c = coverage(shifts, code, date); if (!c) return [];
  const gaps = [];
  c.segs.forEach((g) => {
    if (g.count >= g.need) return;
    const last = gaps[gaps.length - 1];
    if (last && last.end === g.start && last.count === g.count && last.need === g.need) last.end = g.end;
    else gaps.push({ store: code, date, start: g.start, end: g.end, count: g.count, need: g.need });
  });
  return gaps;
}
function allGaps(shifts, days) { const out = []; stores().forEach((st) => days.forEach((d) => out.push(...gapsFor(shifts, st.code, d)))); return out; }

// ================================================================ template
function templateShifts(ws, days, c, fixed) {
  const out = [];
  c.staff.forEach((e) => {
    days.forEach((date) => {
      const a = availFor(e.id, date); if (!a) return;
      if (isOff(e.id, date)) return;
      if (fixed.some((f) => f.employee_id === e.id && f.date === date)) return;
      if (hardBlocked(e, date, a.store)) return;
      const req = requirements(a.store, date); if (!req) return; // store closed that day
      let s = a.start_min, en = a.end_min;
      if (c.R.clampToStoreHours) { s = Math.max(s, req.open); en = Math.min(en, req.close); }
      if (en - s < 60) return;
      out.push({ week_start: ws, date, employee_id: e.id, store: a.store, start_min: s, end_min: en, locked: false, source: "template" });
    });
  });
  return out;
}
const empMinutes = (shifts, id) => shifts.filter((s) => s.employee_id === id).reduce((a, s) => a + shiftLen(s), 0);
const empDays = (shifts, id) => new Set(shifts.filter((s) => s.employee_id === id).map((s) => s.date)).size;
function maxRun(dates) {
  const ds = Array.from(new Set(dates)).sort(); let best = 0, run = 0;
  for (let i = 0; i < ds.length; i++) { run = i && daysBetween(ds[i - 1], ds[i]) === 1 ? run + 1 : 1; best = Math.max(best, run); }
  return best;
}

// ============================================================== candidates
// tier 0: within every limit. tier 1: may break weekly hours / days, call in anyone from
// that store. tier 2: may stretch a shift past the max length, call in from another store.
function candidates(gap, shifts, c, tier) {
  const R = c.R, out = [], req = requirements(gap.store, gap.date);
  c.staff.forEach((e) => {
    if (isOff(e.id, gap.date) || hardBlocked(e, gap.date, gap.store)) return;
    const mins = empMinutes(shifts, e.id), maxH = maxHoursFor(e, R);
    const same = shifts.filter((s) => s.employee_id === e.id && s.date === gap.date);
    const here = same.find((s) => s.store === gap.store && !s.locked && s.start_min <= gap.end && s.end_min >= gap.start);
    if (here) {
      const ns = Math.min(here.start_min, gap.start), ne = Math.max(here.end_min, gap.end), extra = ne - ns - shiftLen(here);
      const overLen = ne - ns > R.maxShiftMin, overHrs = mins + extra > maxH;
      if (overLen && tier < 2) return; if (overHrs && tier < 1) return;
      out.push({ kind: "extend", emp: e, shift: here, ns, ne, extra, cost: 1 + (Math.max(0, extra - (gap.end - gap.start)) / 30) + (mins / 60) * 0.15 + (overHrs ? 25 : 0) + (overLen ? 20 : 0), flags: [overHrs && "over hours", overLen && "long shift"].filter(Boolean) });
      return;
    }
    if (same.length) return; // already somewhere else that day
    const inStore = worksStore(e, gap.store), flex = !!e.flex && R.allowFlexFill;
    let base;
    if (inStore && flex) base = 6;
    else if (inStore && R.allowCallInAnyone) base = 12;
    else if (inStore && tier >= 1 && R.neverLeaveGap) base = 20;
    else if (!inStore && tier >= 2 && R.neverLeaveGap) base = 40;
    else return;
    const days = empDays(shifts, e.id), overDays = days >= R.maxDaysWeek;
    if (overDays && tier < 1) return;
    let ns = gap.start, ne = gap.end;
    if (ne - ns < R.minShiftMin) { ne = Math.min(req.close, ns + R.minShiftMin); ns = Math.max(req.open, ne - R.minShiftMin); }
    if (ne - ns > R.maxShiftMin) ne = ns + R.maxShiftMin;
    const overHrs = mins + (ne - ns) > maxH; if (overHrs && tier < 1) return;
    const prefer = activeRules().some((r) => r.t === "preferFill" && r.emp === e.id && ruleStoreOk(r, gap.store));
    out.push({ kind: "new", emp: e, ns, ne, cost: base + ((ne - ns - (gap.end - gap.start)) / 30) + (mins / 60) * 0.15 + (e.home_store === gap.store ? 0 : 2) + (overHrs ? 25 : 0) + (overDays ? 15 : 0) - (prefer ? 8 : 0), flags: [!inStore && "other store", overHrs && "over hours", overDays && "extra day", !flex && inStore && "called in on a day off"].filter(Boolean) });
  });
  return out;
}

// =================================================================== score
function scoreWeek(shifts, days, c) {
  const R = c.R; let s = 0;
  allGaps(shifts, days).forEach((g) => { s += ((g.end - g.start) / 30) * 5 * (g.need - g.count); });
  c.staff.forEach((e) => {
    const m = empMinutes(shifts, e.id), maxH = maxHoursFor(e, R);
    if (m > maxH) s += 40 + ((m - maxH) / 60) * 4;
    if (empDays(shifts, e.id) > R.maxDaysWeek) s += 40;
  });
  shifts.forEach((sh) => {
    if (sh.source === "fill") s += 2;
    const e = emp(sh.employee_id); if (e && !worksStore(e, sh.store)) s += 6;
    if (shiftLen(sh) < R.minShiftMin && !sh.locked) s += 3;
  });
  activeRules().forEach((r) => {
    const mine = (id) => shifts.filter((x) => x.employee_id === id);
    if (r.t === "mustDay" && r.emp) { const has = days.some((d) => ruleDayOk(r, d) && mine(r.emp).some((x) => x.date === d)); if (!has) s += 25; }
    if (r.t === "minHoursEmp" && r.emp && empMinutes(shifts, r.emp) < Number(r.n) * 60) s += 15;
    if (r.t === "maxConsecutive" && r.emp && maxRun(mine(r.emp).map((x) => x.date)) > Number(r.n)) s += 30;
    if (r.t === "notTogether" && r.emp && r.emp2) days.forEach((d) => { const a = mine(r.emp).filter((x) => x.date === d), b = mine(r.emp2).filter((x) => x.date === d); if (a.some((x) => b.some((y) => x.store === y.store && x.start_min < y.end_min && y.start_min < x.end_min))) s += 30; });
    if (r.t === "together" && r.emp && r.emp2) days.forEach((d) => { if (mine(r.emp).some((x) => x.date === d) !== mine(r.emp2).some((x) => x.date === d)) s += 20; });
  });
  return s;
}

// =================================================================== solve
function solverCtx() { return { R: rules(), staff: staff() }; }
function sig(shifts) { return shifts.map((s) => `${s.employee_id}|${s.date}|${s.store}|${s.start_min}|${s.end_min}`).sort().join(";"); }
// Returns up to 3 distinct arrangements, best first. Each option lists only the NEW
// rows (fixed rows already exist in the database) plus `all` for previews.
function solveWeek(ws, fixedRows) {
  const c = solverCtx(), R = c.R, days = weekDays(ws);
  const fixed = clone(fixedRows);
  state.data.must_work.filter((m) => days.includes(m.date)).forEach((m) => {
    if (fixed.some((f) => f.employee_id === m.employee_id && f.date === m.date)) return;
    fixed.push({ week_start: ws, date: m.date, employee_id: m.employee_id, store: m.store, start_min: m.start_min, end_min: m.end_min, locked: true, source: "must", note: m.note || "Needs to work" });
  });
  const base = templateShifts(ws, days, c, fixed);
  const maxTier = R.neverLeaveGap ? 2 : 0;
  const options = new Map();
  for (let run = 0; run < Math.max(1, R.restarts | 0); run++) {
    const shifts = clone(fixed.concat(base));
    const gaps = shuffle(allGaps(shifts, days));
    for (const g0 of gaps) {
      const still = gapsFor(shifts, g0.store, g0.date).filter((g) => g.start < g0.end && g.end > g0.start);
      for (const g of still) {
        for (let need = g.need - g.count; need > 0; need--) {
          let cands = [];
          for (let tier = 0; tier <= maxTier && !cands.length; tier++) cands = candidates(g, shifts, c, tier);
          if (!cands.length) break;
          cands.sort((a, b) => a.cost - b.cost + (Math.random() - 0.5) * 3);
          const pick = cands[0], fl = pick.flags.length ? ` (${pick.flags.join(", ")})` : "";
          if (pick.kind === "extend") { pick.shift.start_min = pick.ns; pick.shift.end_min = pick.ne; if (pick.shift.source === "template" && pick.extra > 30) pick.shift.source = "fill"; pick.shift.note = (pick.extra > 30 ? "Extended to cover " : "Covers ") + fmtRange(g.start, g.end) + fl; }
          else shifts.push({ week_start: ws, date: g.date, employee_id: pick.emp.id, store: g.store, start_min: pick.ns, end_min: pick.ne, locked: false, source: "fill", note: "Called in to cover " + fmtRange(g.start, g.end) + fl });
        }
      }
    }
    const sc = scoreWeek(shifts, days, c), k = sig(shifts);
    if (!options.has(k)) options.set(k, { all: shifts, score: sc, sig: k });
    if (options.size >= 12 && sc === 0) break;
  }
  const list = Array.from(options.values()).sort((a, b) => a.score - b.score).slice(0, 3);
  list.forEach((o) => { o.shifts = o.all.filter((s) => !s.id); });
  return { options: list, days };
}
function optionSummary(o, ws) {
  const days = weekDays(ws), fills = o.all.filter((s) => s.source === "fill").length, gaps = allGaps(o.all, days);
  const hrs = staff().map((e) => empMinutes(o.all, e.id)).filter(Boolean);
  return { fills, gaps: gaps.length, gapMin: gaps.reduce((a, g) => a + g.end - g.start, 0), spread: hrs.length ? Math.max(...hrs) - Math.min(...hrs) : 0, flags: o.all.filter((s) => /\(/.test(s.note || "")).length };
}
function optionDiff(a, b) {
  const key = (s) => `${s.employee_id}|${s.date}|${s.store}`;
  const ma = new Map(a.all.map((s) => [key(s), s])), mb = new Map(b.all.map((s) => [key(s), s])), out = [];
  mb.forEach((s, k) => { const x = ma.get(k); if (!x) out.push(`+ ${ename(s.employee_id)} ${fmtDate(s.date)} ${fmtRange(s.start_min, s.end_min)} at ${store(s.store).name}`); else if (x.start_min !== s.start_min || x.end_min !== s.end_min) out.push(`~ ${ename(s.employee_id)} ${fmtDate(s.date)} ${fmtRange(x.start_min, x.end_min)} → ${fmtRange(s.start_min, s.end_min)}`); });
  ma.forEach((s, k) => { if (!mb.has(k)) out.push(`− ${ename(s.employee_id)} ${fmtDate(s.date)} ${fmtRange(s.start_min, s.end_min)} at ${store(s.store).name}`); });
  return out;
}

// =================================================================== flags
function weekIssues(ws) {
  const R = rules(), shifts = weekShifts(ws), days = weekDays(ws), issues = [];
  const add = (kind, sev, text, extra) => issues.push({ kind, sev, text, ...(extra || {}) });
  allGaps(shifts, days).forEach((g) => add("gap", "bad", `${store(g.store).name} · ${fmtDate(g.date)} · ${fmtRange(g.start, g.end)} has ${g.count ? g.count + " on" : "nobody on"} (needs ${g.need})`, { store: g.store, date: g.date }));
  staff().forEach((e) => {
    const mine = shifts.filter((s) => s.employee_id === e.id), m = empMinutes(shifts, e.id), d = empDays(shifts, e.id), maxH = maxHoursFor(e, R);
    if (m > maxH) add("hours", "warn", `${e.name} is at ${fmtHours(m)} (limit ${maxH / 60}h)`);
    if (d > R.maxDaysWeek) add("days", "warn", `${e.name} works ${d} days (limit ${R.maxDaysWeek})`);
    const byDate = {}; mine.forEach((s) => (byDate[s.date] ||= []).push(s));
    Object.entries(byDate).forEach(([date, arr]) => { for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (arr[i].start_min < arr[j].end_min && arr[j].start_min < arr[i].end_min) add("overlap", "bad", `${e.name} is double-booked on ${fmtDate(date)}`); });
    mine.forEach((s) => {
      if (isOff(e.id, s.date)) add("off", "bad", `${e.name} is scheduled ${fmtDate(s.date)} but has that day off (${offReason(e.id, s.date)})`);
      const pend = offRequestsFor(e.id, s.date, "pending")[0]; if (pend) add("pending", "warn", `${e.name} has a pending ${pend.kind === "pto" ? "PTO" : "block-out"} request for ${fmtDate(s.date)} and is scheduled — decide it under Manage`);
      if (!worksStore(e, s.store)) add("cross", "info", `${e.name} covers at ${store(s.store).name} on ${fmtDate(s.date)} (not one of their stores)`);
    });
  });
  activeRules().forEach((r) => { const t = ruleBroken(r, shifts, days); if (t) add("rule", "warn", t, { rule: r.id }); });
  return issues;
}
function ruleBroken(r, shifts, days) {
  const mine = (id) => shifts.filter((x) => x.employee_id === id);
  switch (r.t) {
    case "noDay": { const x = mine(r.emp).find((s) => ruleDayOk(r, s.date)); return x ? `${ename(r.emp)} is scheduled ${fmtDate(x.date)} (never works ${DOW_LONG[Number(r.day) - 1]}s)` : null; }
    case "mustDay": return days.some((d) => ruleDayOk(r, d) && storesOpenOn(d) && mine(r.emp).some((s) => s.date === d)) ? null : `${ename(r.emp)} has nothing on ${r.day === "ANY" ? "any day" : DOW_LONG[Number(r.day) - 1]}`;
    case "noStore": { const x = mine(r.emp).find((s) => s.store === r.store); return x ? `${ename(r.emp)} is at ${store(r.store).name} on ${fmtDate(x.date)} (not allowed)` : null; }
    case "maxHoursEmp": { const m = empMinutes(shifts, r.emp); return m > Number(r.n) * 60 ? `${ename(r.emp)} is at ${fmtHours(m)} (their limit is ${r.n}h)` : null; }
    case "minHoursEmp": { const m = empMinutes(shifts, r.emp); return m < Number(r.n) * 60 ? `${ename(r.emp)} only has ${fmtHours(m)} (wants at least ${r.n}h)` : null; }
    case "maxConsecutive": { const run = maxRun(mine(r.emp).map((s) => s.date)); return run > Number(r.n) ? `${ename(r.emp)} works ${run} days in a row (limit ${r.n})` : null; }
    case "notTogether": { for (const d of days) { const a = mine(r.emp).filter((x) => x.date === d), b = mine(r.emp2).filter((x) => x.date === d); if (a.some((x) => b.some((y) => x.store === y.store && x.start_min < y.end_min && y.start_min < x.end_min))) return `${ename(r.emp)} and ${ename(r.emp2)} are on together ${fmtDate(d)}`; } return null; }
    case "together": { for (const d of days) if (mine(r.emp).some((x) => x.date === d) !== mine(r.emp2).some((x) => x.date === d)) return `${ename(r.emp)} and ${ename(r.emp2)} aren't both on ${fmtDate(d)}`; return null; }
    default: return null;
  }
}
const storesOpenOn = (d) => stores().some((s) => storeHours(s.code, d));

// ============================================================ build / rebuild
async function ensureWeeks() { return ensureRange(weeksList()[0], weeksList()[WEEKS_AHEAD]); }
async function ensureRange(from, to) {
  let built = 0;
  for (let ws = mondayOf(from); ws <= mondayOf(to); ws = addDays(ws, 7)) {
    if (weekShifts(ws).length) continue;
    const res = solveWeek(ws, []);
    if (res.options[0] && res.options[0].shifts.length) { await dbInsert(T.shifts, res.options[0].shifts); built++; }
  }
  if (built) await refresh(["shifts"]);
  return built;
}
async function takeSnapshot(ws, label, kind = "auto") {
  const shifts = weekShifts(ws); if (!shifts.length) return null;
  const [row] = await dbInsert(T.snapshots, [{ week_start: ws, label, kind, shifts }]);
  const autos = state.data.snapshots.concat(row ? [row] : []).filter((s) => s.week_start === ws && s.kind === "auto").sort(by((s) => s.created_at));
  if (autos.length > 6) await dbDeleteIn(T.snapshots, "id", autos.slice(0, autos.length - 6).map((s) => s.id));
  await refresh(["snapshots"]);
  return row;
}
// Replaces the unlocked shifts of a week. A shift that survives the rebuild for the same
// person / date / store keeps its id, so requests pointing at it stay valid; a shift a
// pending request points at is kept (and locked) even if the solver dropped it.
async function applyWeek(ws, newRows, label) {
  await takeSnapshot(ws, label || "Before rebuild", "auto");
  const pendingIds = new Set(state.data.swaps.filter((x) => ["pending_peer", "pending_supervisor"].includes(x.status)).flatMap((x) => [x.from_shift_id, x.to_shift_id]).filter(Boolean));
  const loose = weekShifts(ws).filter((s) => !s.locked);
  const key = (s) => `${s.employee_id}|${s.date}|${s.store}`;
  const oldByKey = new Map(loose.map((s) => [key(s), s]));
  const rows = newRows.map((s) => { const { id, ...rest } = s; const o = oldByKey.get(key(s)); if (o) { rest.id = o.id; oldByKey.delete(key(s)); } return rest; });
  const keep = Array.from(oldByKey.values()).filter((s) => pendingIds.has(s.id));
  await dbDeleteIn(T.shifts, "id", loose.filter((s) => !keep.some((k) => k.id === s.id)).map((s) => s.id));
  if (rows.length) await dbInsert(T.shifts, rows);
  for (const k of keep) await dbUpdate(T.shifts, { id: k.id }, { locked: true, note: "Kept for a pending swap request" });
  await refresh(["shifts"]);
}
async function rebuildWeek(ws) {
  const locked = weekShifts(ws).filter((s) => s.locked);
  const res = solveWeek(ws, locked);
  await applyWeek(ws, res.options[0] ? res.options[0].shifts : [], "Before rebuild");
  return res;
}
async function restoreSnapshot(snap) {
  const ws = snap.week_start;
  await takeSnapshot(ws, "Before going back", "auto");
  await dbDeleteIn(T.shifts, "id", weekShifts(ws).map((s) => s.id));
  const rows = (snap.shifts || []).map((s) => ({ ...s, updated_at: new Date().toISOString() }));
  if (rows.length) await dbInsert(T.shifts, rows);
  await refresh(["shifts"]);
}

// An approval made from the email (decided_by = "email") changes the database but no
// browser ran the solver. Any client that notices re-solves the touched weeks.
async function reconcileOffApprovals() {
  const todo = new Set();
  state.data.off_requests.filter((o) => o.status === "approved").forEach((o) => {
    const clash = state.data.shifts.some((s) => s.employee_id === o.employee_id && !s.locked && inRange(s.date, o.date_from, o.date_to));
    if (clash) for (let ws = mondayOf(o.date_from); ws <= mondayOf(o.date_to); ws = addDays(ws, 7)) if (weekShifts(ws).length) todo.add(ws);
  });
  for (const ws of todo) await rebuildWeek(ws);
  return todo.size;
}

// ================================================================== learn
// Compare the week as it stands (after the manager's manual edits) with what the
// weekly template would have produced, and turn the differences into template changes.
function learnDiff(ws) {
  const c = solverCtx(), days = weekDays(ws);
  const tpl = templateShifts(ws, days, c, []);
  const key = (s) => `${s.employee_id}|${s.date}`;
  const tm = new Map(tpl.map((s) => [key(s), s]));
  const cur = weekShifts(ws).filter((s) => !["must", "swap"].includes(s.source));
  const changes = [];
  const seen = new Set();
  cur.forEach((s) => {
    const k = key(s); seen.add(k); const t = tm.get(k); const dow = dowOf(s.date);
    if (s.source !== "manual") return; // solver output isn't something to learn from
    const a = availFor(s.employee_id, s.date);
    if (a && a.period) { changes.push({ type: "skip", emp: s.employee_id, dow, text: `${ename(s.employee_id)} ${DOW_LONG[dow - 1]}: inside a special availability period, not learned` }); return; }
    if (!t) changes.push({ type: "add", emp: s.employee_id, dow, start_min: s.start_min, end_min: s.end_min, store: s.store, text: `${ename(s.employee_id)} now works ${DOW_LONG[dow - 1]}s ${fmtRange(s.start_min, s.end_min)} at ${store(s.store).name}` });
    else if (t.start_min !== s.start_min || t.end_min !== s.end_min || t.store !== s.store) changes.push({ type: "change", emp: s.employee_id, dow, start_min: s.start_min, end_min: s.end_min, store: s.store, text: `${ename(s.employee_id)} ${DOW_LONG[dow - 1]}s: ${fmtRange(t.start_min, t.end_min)} ${store(t.store).name} → ${fmtRange(s.start_min, s.end_min)} ${store(s.store).name}` });
  });
  tpl.forEach((t) => {
    const k = key(t); if (seen.has(k)) return;
    if (weekShifts(ws).some((s) => key(s) === k)) return; // swapped away or must-work: not a template change
    const dow = dowOf(t.date);
    changes.push({ type: "remove", emp: t.employee_id, dow, text: `${ename(t.employee_id)} no longer works ${DOW_LONG[dow - 1]}s (shift was removed)` });
  });
  return changes;
}
async function applyLearn(ws, changes, note) {
  for (const ch of changes) {
    if (ch.type === "add" || ch.type === "change") await dbUpsert(T.availability, [{ employee_id: ch.emp, dow: ch.dow, start_min: ch.start_min, end_min: ch.end_min, store: ch.store }], "employee_id,dow");
    if (ch.type === "remove") await dbDelete(T.availability, { employee_id: ch.emp, dow: ch.dow });
  }
  await dbInsert(T.learned, [{ week_start: ws, note: note || null, changes, by_name: state.supName || null }]);
  await refresh(["availability", "learned"]);
}
