// Le Parfumier: SCHEDULE — admin AI command center.
//
// The model (via the lps-ai edge function) can only call the tools registered here.
// Every tool has a risk class: "read" runs immediately; "write" and "danger" render a
// confirmation preview card and run only after the manager approves. "danger" covers
// anything that sends messages, deletes data or affects many people.
"use strict";
const AI_FN = "lps-ai";
const AI_MAX_ROUNDS = 8;

// ----------------------------------------------------------------- schema doc
const SCHEMA_DOC = `Tables (all prefixed lps_, times are minutes since midnight, dow 1=Mon..7=Sun):
- lps_employees(id text, name, stores text[], home_store, role 'staff'|'supervisor', email, flex bool, active bool, sort, pin)
- lps_availability(employee_id, dow, start_min, end_min, store)  weekly template, one row per person per weekday
- lps_availability_periods(id, employee_id, label, date_from, date_to, pattern jsonb {dow:{start_min,end_min,store}})  dated override of the template
- lps_time_off(employee_id, date, note)  pre-approved days off
- lps_off_requests(id, employee_id, kind 'blockout'|'pto', date_from, date_to, reason, status pending|approved|declined|cancelled, decided_by_name, supervisor_note)
- lps_must_work(employee_id, date, start_min, end_min, store, note)  pinned locked shifts
- lps_shifts(id uuid, week_start, date, employee_id, store, start_min, end_min, locked bool, source template|fill|must|manual|swap, note)
- lps_swap_requests(id uuid, from_employee, to_employee, from_shift_id, to_shift_id, kind swap|cover, message, status pending_peer|pending_supervisor|approved|declined_peer|declined_supervisor|cancelled, from_snapshot, to_snapshot, decided_by_name)
- lps_notifications(id, employee_id, kind, title, body, swap_id, off_id, read)
- lps_snapshots(id, week_start, label, kind auto|saved, shifts jsonb)  week versions for undo
- lps_learned(id, week_start, note, by_name, changes jsonb)
- lps_settings(key, value jsonb): stores (codes, names, weekly hours), rules (minStaff, maxHoursWeek, maxDaysWeek, minShiftMin, maxShiftMin, allowFlexFill, allowCallInAnyone, neverLeaveGap, clampToStoreHours, restarts), custom_rules (array of {id,t,on,...}), store_hour_overrides, supervisor_names, supervisor_email, pin, admin_pin`;

function aiContext() {
  const t = today(), ws = mondayOf(t);
  const R = rules();
  return [
    `Today: ${t} (${fmtDate(t, true)}). Current week starts Monday ${ws}. Weeks built: ${weeksList().filter((w) => weekShifts(w).length).join(", ")}.`,
    `Manager using the app: ${state.me ? state.me.name : "?"}. Supervisor names for signing: ${supervisorNames().join(", ")}.`,
    `Stores: ${stores().map((s) => `${s.code} "${s.name}" ${hoursSummary(s)}`).join(" | ")}`,
    `Base rules: ${JSON.stringify(R)}`,
    `Custom rules: ${customRules().map((r) => `[${r.id}] ${r.on === false ? "(off) " : ""}${ruleText(r)}`).join("; ") || "none"}`,
    `Temporary hours: ${(state.data.settings.store_hour_overrides || []).map((o) => `[${o.id}] ${o.label} ${o.store} ${o.from || ""}${o.to ? "–" + o.to : ""}${o.dates ? " dates:" + Object.keys(o.dates).length : ""}${o.on === false ? " (off)" : ""}`).join("; ") || "none"}`,
    `Employees: ${state.data.employees.map((e) => `${e.id} = ${e.name} (${(e.stores || []).join("/")}${e.home_store ? ", home " + e.home_store : ""}, ${e.role}${e.flex ? ", flex" : ""}${e.active === false ? ", INACTIVE" : ""})`).join("; ")}`,
    `Pending: ${state.data.swaps.filter((s) => s.status === "pending_supervisor").length} swap(s) awaiting manager, ${state.data.swaps.filter((s) => s.status === "pending_peer").length} awaiting colleague, ${state.data.off_requests.filter((o) => o.status === "pending").length} time-off request(s) awaiting manager.`,
    `Schema:\n${SCHEMA_DOC}`,
  ].join("\n");
}

// ------------------------------------------------------------------ helpers
const stripPin = (rows) => rows.map((r) => { if (r && Object.prototype.hasOwnProperty.call(r, "pin")) { const { pin, ...rest } = r; return rest; } return r; });
const empByRef = (ref) => { if (!ref) return null; const r = String(ref).toLowerCase().trim(); return state.data.employees.find((e) => e.id === r) || state.data.employees.find((e) => e.name.toLowerCase() === r) || state.data.employees.find((e) => e.name.toLowerCase().startsWith(r)) || state.data.employees.find((e) => firstName(e.name).toLowerCase() === r) || null; };
const needEmp = (ref) => { const e = empByRef(ref); if (!e) throw new Error(`No employee matches "${ref}". Use get_employee or the employee list in the context.`); return e; };
const needDate = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))) throw new Error(`Date must be YYYY-MM-DD, got "${d}"`); return d; };
const minOf = (v) => { if (typeof v === "number") return v; if (/^\d{1,2}:\d{2}$/.test(String(v))) return fromHHMM(v); const r = parseTimeRange(String(v) + " to " + String(v)); if (r && r !== "OFF") return r.start_min; throw new Error(`Time must be minutes or HH:MM, got "${v}"`); };
const shiftLine = (s) => `${ename(s.employee_id)} · ${fmtDate(s.date)} · ${fmtRange(s.start_min, s.end_min)} · ${store(s.store).name}${s.locked ? " 🔒" : ""}${s.source === "fill" ? " (fill)" : ""}`;
const weekSummary = (ws) => {
  const sh = weekShifts(ws).slice().sort(by((s) => s.date + toHHMM(s.start_min) + s.store));
  return { week_start: ws, shift_count: sh.length, shifts: sh.map((s) => ({ id: s.id, employee_id: s.employee_id, name: ename(s.employee_id), date: s.date, dow: dowName(s.date), store: s.store, time: fmtRange(s.start_min, s.end_min), start_min: s.start_min, end_min: s.end_min, locked: s.locked, source: s.source, note: s.note || undefined })), hours: staff().map((e) => ({ name: e.name, hours: Math.round(weekMinutes(e.id, ws) / 6) / 10 })).filter((x) => x.hours), flags: weekIssues(ws).map((i) => i.text) };
};
const S = (obj, props, required) => ({ type: "object", properties: props, required: required || [], additionalProperties: false, ...(obj || {}) });
const str = (d) => ({ type: "string", description: d });
const num = (d) => ({ type: "number", description: d });
const bool = (d) => ({ type: "boolean", description: d });

// ---------------------------------------------------------------- registry
const AI_TOOLS = [
  // ---------------------------------------------------------------- reads
  { name: "get_schema", risk: "read", description: "Describe the database tables and settings keys.", input_schema: S(null, {}), run: async () => SCHEMA_DOC },
  { name: "query_table", risk: "read", description: "Read rows from one lps_ table with simple filters. Returns up to `limit` rows (max 200). PINs are never returned.", input_schema: S(null, { table: str("Table name, e.g. lps_shifts"), filters: { type: "array", description: "AND filters", items: S(null, { column: str("column"), op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "in"] }, value: { description: "value; array for 'in'" } }, ["column", "op", "value"]) }, order_by: str("column to sort by"), limit: num("max rows, default 100") }, ["table"]),
    run: async ({ table, filters = [], order_by, limit = 100 }) => {
      if (!Object.values(T).includes(table)) throw new Error(`Not an allowed table: ${table}`);
      limit = Math.min(200, Math.max(1, Number(limit) || 100));
      if (state.offline) { let rows = clone(localLoad()[table]); filters.forEach((f) => { rows = rows.filter((r) => f.op === "eq" ? r[f.column] === f.value : f.op === "neq" ? r[f.column] !== f.value : f.op === "in" ? (f.value || []).includes(r[f.column]) : true); }); return stripPin(rows.slice(0, limit)); }
      let q = sb.from(table).select("*").limit(limit);
      filters.forEach((f) => { q = f.op === "in" ? q.in(f.column, f.value) : q[f.op](f.column, f.value); });
      if (order_by) q = q.order(order_by);
      const { data, error } = await q; if (error) throw error; return stripPin(data);
    } },
  { name: "get_week_schedule", risk: "read", description: "All shifts for a week (Monday date), with hours per person and flags.", input_schema: S(null, { week_start: str("Monday of the week, YYYY-MM-DD (any date in the week is accepted)") }, ["week_start"]), run: async ({ week_start }) => { const ws = mondayOf(needDate(week_start)); if (!weekShifts(ws).length) await ensureRange(ws, ws); return weekSummary(ws); } },
  { name: "get_coverage_flags", risk: "read", description: "Coverage gaps and rule flags for a week, per store and day.", input_schema: S(null, { week_start: str("Monday of the week, YYYY-MM-DD") }, ["week_start"]), run: async ({ week_start }) => { const ws = mondayOf(needDate(week_start)); const days = weekDays(ws); return { flags: weekIssues(ws), coverage: stores().map((st) => ({ store: st.code, days: days.map((d) => { const c = coverage(weekShifts(ws), st.code, d); return c ? { date: d, open: fmtT(c.open), close: fmtT(c.close), short_minutes: c.segs.filter((g) => g.count < g.need).reduce((a, g) => a + g.end - g.start, 0) } : { date: d, closed: true }; }) })) }; } },
  { name: "get_employee", risk: "read", description: "Profile, weekly template, special periods, time off and upcoming shifts for one employee (by id or name).", input_schema: S(null, { employee: str("employee id or name") }, ["employee"]), run: async ({ employee }) => { const e = needEmp(employee); const { pin, ...prof } = e; return { ...prof, template: state.data.availability.filter((a) => a.employee_id === e.id).sort(by((a) => a.dow)).map((a) => `${DOW[a.dow - 1]} ${fmtRange(a.start_min, a.end_min)} ${a.store}`), special_periods: state.data.avail_periods.filter((p) => p.employee_id === e.id).map((p) => ({ id: p.id, label: p.label, from: p.date_from, to: p.date_to, pattern: patternSummary(p.pattern || {}) })), time_off: state.data.time_off.filter((o) => o.employee_id === e.id).map((o) => o.date), off_requests: state.data.off_requests.filter((o) => o.employee_id === e.id).map((o) => ({ id: o.id, kind: o.kind, from: o.date_from, to: o.date_to, status: o.status, reason: o.reason })), upcoming_shifts: shiftsOf(e.id).filter((s) => s.date >= today()).sort(by((s) => s.date)).slice(0, 30).map((s) => ({ id: s.id, date: s.date, dow: dowName(s.date), store: s.store, time: fmtRange(s.start_min, s.end_min), locked: s.locked })), hours_this_week: Math.round(weekMinutes(e.id, mondayOf(today())) / 6) / 10 }; } },
  { name: "list_requests", risk: "read", description: "Swap/cover requests and time-off requests, optionally filtered by status.", input_schema: S(null, { kind: { type: "string", enum: ["swaps", "time_off", "all"], description: "which list" }, status: str("optional status filter, e.g. pending_supervisor or pending") }), run: async ({ kind = "all", status }) => ({ swaps: kind === "time_off" ? undefined : state.data.swaps.filter((s) => !status || s.status === status).map((s) => ({ id: s.id, from: ename(s.from_employee), to: ename(s.to_employee), kind: s.kind, status: s.status, gives: s.from_snapshot ? describeShift(s.from_snapshot) : null, takes: s.to_snapshot ? describeShift(s.to_snapshot) : null, message: s.message, created_at: s.created_at })), time_off: kind === "swaps" ? undefined : state.data.off_requests.filter((o) => !status || o.status === status).map((o) => ({ id: o.id, employee: ename(o.employee_id), kind: o.kind, from: o.date_from, to: o.date_to, reason: o.reason, status: o.status })) }) },
  { name: "get_settings", risk: "read", description: "Store hours, base rules, custom rules, temporary hours, supervisor names.", input_schema: S(null, {}), run: async () => ({ stores: stores(), rules: rules(), custom_rules: customRules().map((r) => ({ ...r, text: ruleText(r) })), store_hour_overrides: state.data.settings.store_hour_overrides || [], supervisor_names: supervisorNames(), supervisor_email: state.data.settings.supervisor_email }) },

  // -------------------------------------------------------------- shifts
  { name: "add_shift", risk: "write", description: "Add one shift for one employee (marked manual, locked by default).", input_schema: S(null, { employee: str("id or name"), date: str("YYYY-MM-DD"), store: str("PL, PB or PV"), start: str("HH:MM"), end: str("HH:MM"), locked: bool("default true"), note: str("optional") }, ["employee", "date", "store", "start", "end"]),
    summary: (i) => `Add shift: ${ename((empByRef(i.employee) || {}).id) || i.employee} · ${i.date} · ${i.start}–${i.end} at ${i.store}`,
    run: async (i) => { const e = needEmp(i.employee), date = needDate(i.date), a = minOf(i.start), b = minOf(i.end); if (b <= a) throw new Error("end before start"); const [row] = await dbInsert(T.shifts, [{ week_start: mondayOf(date), date, employee_id: e.id, store: String(i.store).toUpperCase(), start_min: a, end_min: b, locked: i.locked !== false, source: "manual", note: i.note || "Added by AI on manager approval" }]); await refresh(["shifts"]); return { ok: true, shift: shiftLine(row) }; } },
  { name: "edit_shift", risk: "write", description: "Change a shift's employee, store, time, lock or note. Only pass fields to change.", input_schema: S(null, { shift_id: str("shift id"), employee: str("new employee id/name"), store: str("new store"), start: str("HH:MM"), end: str("HH:MM"), locked: bool("lock/unlock"), note: str("note") }, ["shift_id"]),
    summary: (i) => { const s = shiftById(i.shift_id); return `Edit shift ${s ? shiftLine(s) : i.shift_id} → ${Object.entries(i).filter(([k]) => k !== "shift_id").map(([k, v]) => `${k}=${v}`).join(", ")}`; },
    run: async (i) => { const s = shiftById(i.shift_id); if (!s) throw new Error("shift not found"); const p = { source: ["template", "fill", "manual"].includes(s.source) ? "manual" : s.source, updated_at: new Date().toISOString() }; if (i.employee) p.employee_id = needEmp(i.employee).id; if (i.store) p.store = String(i.store).toUpperCase(); if (i.start) p.start_min = minOf(i.start); if (i.end) p.end_min = minOf(i.end); if (typeof i.locked === "boolean") p.locked = i.locked; if (i.note !== undefined) p.note = i.note; if ((p.end_min ?? s.end_min) <= (p.start_min ?? s.start_min)) throw new Error("end before start"); await dbUpdate(T.shifts, { id: s.id }, p); await refresh(["shifts"]); return { ok: true, shift: shiftLine(shiftById(s.id)) }; } },
  { name: "delete_shift", risk: "danger", description: "Delete one shift (the person is no longer scheduled).", input_schema: S(null, { shift_id: str("shift id") }, ["shift_id"]), summary: (i) => { const s = shiftById(i.shift_id); return `DELETE shift ${s ? shiftLine(s) : i.shift_id}`; }, run: async (i) => { const s = shiftById(i.shift_id); if (!s) throw new Error("shift not found"); await dbDelete(T.shifts, { id: s.id }); await refresh(["shifts"]); return { ok: true, deleted: shiftLine(s) }; } },
  { name: "rebuild_week", risk: "danger", description: "Re-solve a whole week from templates, time off, pins and rules. Locked shifts stay. Affects everyone scheduled that week. A snapshot is taken first so it can be undone.", input_schema: S(null, { week_start: str("Monday YYYY-MM-DD") }, ["week_start"]), summary: (i) => `Rebuild week of ${i.week_start} (affects everyone that week; previous version saved)`, run: async (i) => { const ws = mondayOf(needDate(i.week_start)); await rebuildWeek(ws); return { ok: true, ...weekSummary(ws) }; } },
  { name: "restore_week_version", risk: "danger", description: "Restore a saved or automatic snapshot of a week (undo). Use query_table on lps_snapshots to find ids.", input_schema: S(null, { snapshot_id: str("snapshot id") }, ["snapshot_id"]), summary: (i) => { const s = state.data.snapshots.find((x) => x.id === i.snapshot_id); return `Restore week ${s ? s.week_start + ' to "' + s.label + '"' : i.snapshot_id} (replaces every shift that week)`; }, run: async (i) => { const s = state.data.snapshots.find((x) => x.id === i.snapshot_id); if (!s) throw new Error("snapshot not found"); await restoreSnapshot(s); return { ok: true, ...weekSummary(s.week_start) }; } },

  // --------------------------------------------------------------- rules
  { name: "set_base_rule", risk: "danger", description: "Change one base rule (minStaff, maxHoursWeek, maxDaysWeek, minShiftMin, maxShiftMin, allowFlexFill, allowCallInAnyone, neverLeaveGap, clampToStoreHours, restarts). Applies on the next rebuild.", input_schema: S(null, { key: str("rule key"), value: { description: "number or boolean" } }, ["key", "value"]), summary: (i) => `Set base rule ${i.key} = ${JSON.stringify(i.value)} (affects all future rebuilds)`, run: async (i) => { if (!(i.key in SEED.rules)) throw new Error("unknown rule key"); const R = { ...rules(), [i.key]: i.value }; await saveSetting("rules", R); return { ok: true, rules: R }; } },
  { name: "add_custom_rule", risk: "danger", description: `Add a custom rule. Types: ${RULE_TYPES.map((r) => `${r.t} (${r.fields.join(",")})`).join("; ")}. Fields: store = PL/PB/PV/ALL, day = 1..7 or ANY, emp/emp2 = employee id, n = number, minutes = number, from/to = HH:MM, text.`, input_schema: S(null, { t: str("rule type"), store: str("store or ALL"), day: str("1-7 or ANY"), emp: str("employee id"), emp2: str("second employee id"), n: num("count/hours/days"), minutes: num("minutes"), from: str("HH:MM"), to: str("HH:MM"), text: str("note text") }, ["t"]),
    summary: (i) => `Add rule: ${ruleText({ ...i, emp: (empByRef(i.emp) || {}).id || i.emp, emp2: (empByRef(i.emp2) || {}).id || i.emp2 })} (affects all future rebuilds)`,
    run: async (i) => { if (!RULE_TYPES.some((r) => r.t === i.t)) throw new Error("unknown rule type"); const r = { id: uid(), on: true, ...i }; if (i.emp) r.emp = needEmp(i.emp).id; if (i.emp2) r.emp2 = needEmp(i.emp2).id; if (!r.store) r.store = "ALL"; if (!r.day) r.day = "ANY"; await saveSetting("custom_rules", customRules().concat([r])); return { ok: true, rule: { id: r.id, text: ruleText(r) } }; } },
  { name: "toggle_custom_rule", risk: "danger", description: "Switch a custom rule on or off by id.", input_schema: S(null, { rule_id: str("rule id"), on: bool("true = on") }, ["rule_id", "on"]), summary: (i) => { const r = customRules().find((x) => x.id === i.rule_id); return `${i.on ? "Turn ON" : "Turn OFF"} rule: ${r ? ruleText(r) : i.rule_id}`; }, run: async (i) => { if (!customRules().some((r) => r.id === i.rule_id)) throw new Error("rule not found"); await saveSetting("custom_rules", customRules().map((r) => (r.id === i.rule_id ? { ...r, on: !!i.on } : r))); return { ok: true }; } },
  { name: "remove_custom_rule", risk: "danger", description: "Delete a custom rule by id.", input_schema: S(null, { rule_id: str("rule id") }, ["rule_id"]), summary: (i) => { const r = customRules().find((x) => x.id === i.rule_id); return `DELETE rule: ${r ? ruleText(r) : i.rule_id}`; }, run: async (i) => { if (!customRules().some((r) => r.id === i.rule_id)) throw new Error("rule not found"); await saveSetting("custom_rules", customRules().filter((r) => r.id !== i.rule_id)); return { ok: true }; } },

  // -------------------------------------------------------- availability
  { name: "set_weekly_availability", risk: "write", description: "Replace an employee's weekly template. pattern maps dow (1=Mon..7=Sun) to {start,end,store} in HH:MM; omit a day for OFF. Rebuilds the built weeks.", input_schema: S(null, { employee: str("id or name"), pattern: { type: "object", description: "e.g. {\"2\":{\"start\":\"10:00\",\"end\":\"18:00\",\"store\":\"PV\"}}", additionalProperties: S(null, { start: str("HH:MM"), end: str("HH:MM"), store: str("PL/PB/PV") }, ["start", "end", "store"]) } }, ["employee", "pattern"]),
    summary: (i) => `Replace weekly template for ${(empByRef(i.employee) || {}).name || i.employee}: ${Object.entries(i.pattern || {}).map(([d, a]) => `${DOW[d - 1]} ${a.start}–${a.end} ${a.store}`).join(", ") || "all days OFF"} (rebuilds built weeks)`,
    run: async (i) => { const e = needEmp(i.employee); const rows = Object.entries(i.pattern || {}).map(([d, a]) => ({ employee_id: e.id, dow: Number(d), start_min: minOf(a.start), end_min: minOf(a.end), store: String(a.store).toUpperCase() })); await dbDelete(T.availability, { employee_id: e.id }); if (rows.length) await dbInsert(T.availability, rows); await refresh(["availability"]); const n = await rebuildAffected(weeksList()[0], weeksList()[WEEKS_AHEAD]); return { ok: true, weeks_rebuilt: n }; } },
  { name: "add_special_availability", risk: "write", description: "Add a dated availability period for an employee (used instead of the template inside the dates). Rebuilds the affected weeks.", input_schema: S(null, { employee: str("id or name"), label: str("label"), date_from: str("YYYY-MM-DD"), date_to: str("YYYY-MM-DD"), pattern: { type: "object", description: "dow -> {start,end,store}", additionalProperties: S(null, { start: str("HH:MM"), end: str("HH:MM"), store: str("PL/PB/PV") }, ["start", "end", "store"]) } }, ["employee", "date_from", "date_to", "pattern"]),
    summary: (i) => `Special availability for ${(empByRef(i.employee) || {}).name || i.employee} ${i.date_from} → ${i.date_to}: ${Object.entries(i.pattern || {}).map(([d, a]) => `${DOW[d - 1]} ${a.start}–${a.end} ${a.store}`).join(", ")} (rebuilds those weeks)`,
    run: async (i) => { const e = needEmp(i.employee); needDate(i.date_from); needDate(i.date_to); const pattern = {}; Object.entries(i.pattern || {}).forEach(([d, a]) => { pattern[d] = { start_min: minOf(a.start), end_min: minOf(a.end), store: String(a.store).toUpperCase() }; }); await dbInsert(T.avail_periods, [{ employee_id: e.id, label: i.label || "Special period", date_from: i.date_from, date_to: i.date_to, pattern }]); await refresh(["avail_periods"]); const n = await rebuildAffected(i.date_from, i.date_to); return { ok: true, weeks_rebuilt: n }; } },
  { name: "add_time_off", risk: "write", description: "Give an employee one or more pre-approved days off (no request needed). Rebuilds the affected weeks.", input_schema: S(null, { employee: str("id or name"), dates: { type: "array", items: str("YYYY-MM-DD") }, note: str("optional") }, ["employee", "dates"]),
    summary: (i) => `Days off for ${(empByRef(i.employee) || {}).name || i.employee}: ${(i.dates || []).join(", ")} (rebuilds those weeks; anyone covering may be called in)`,
    run: async (i) => { const e = needEmp(i.employee); const ds = (i.dates || []).map(needDate); await dbUpsert(T.time_off, ds.map((date) => ({ employee_id: e.id, date, note: i.note || "Added by AI on manager approval" })), "employee_id,date"); await refresh(["time_off"]); let n = 0; for (const d of ds) n += await rebuildAffected(d, d); return { ok: true, weeks_rebuilt: n }; } },
  { name: "remove_time_off", risk: "write", description: "Remove pre-approved days off. Rebuilds the affected weeks.", input_schema: S(null, { employee: str("id or name"), dates: { type: "array", items: str("YYYY-MM-DD") } }, ["employee", "dates"]), summary: (i) => `Remove days off for ${(empByRef(i.employee) || {}).name || i.employee}: ${(i.dates || []).join(", ")}`, run: async (i) => { const e = needEmp(i.employee); for (const d of (i.dates || []).map(needDate)) await dbDelete(T.time_off, { employee_id: e.id, date: d }); await refresh(["time_off"]); let n = 0; for (const d of i.dates) n += await rebuildAffected(d, d); return { ok: true, weeks_rebuilt: n }; } },
  { name: "add_must_work", risk: "write", description: "Pin a locked shift: this person must work this date/time/store. Rebuilds the week.", input_schema: S(null, { employee: str("id or name"), date: str("YYYY-MM-DD"), start: str("HH:MM"), end: str("HH:MM"), store: str("PL/PB/PV"), note: str("optional") }, ["employee", "date", "start", "end", "store"]), summary: (i) => `Pin ${(empByRef(i.employee) || {}).name || i.employee} on ${i.date} ${i.start}–${i.end} at ${i.store}`, run: async (i) => { const e = needEmp(i.employee); await dbInsert(T.must_work, [{ employee_id: e.id, date: needDate(i.date), start_min: minOf(i.start), end_min: minOf(i.end), store: String(i.store).toUpperCase(), note: i.note || null }]); await refresh(["must_work"]); const n = await rebuildAffected(i.date, i.date); return { ok: true, weeks_rebuilt: n }; } },
  { name: "add_temporary_hours", risk: "danger", description: "Temporary store hours for holidays/seasons. Either give `dates_text` (lines like 'Dec 24 10-3', '25 closed', '26 open til 5') or a date range with a weekly `hours` pattern. Affects everyone scheduled on those dates; rebuilds them.", input_schema: S(null, { label: str("label"), store: str("PL/PB/PV or ALL"), dates_text: str("loose lines, one date per line"), date_from: str("YYYY-MM-DD"), date_to: str("YYYY-MM-DD"), hours: { type: "object", description: "dow -> [openHH:MM, closeHH:MM] or null for closed; omit days that keep regular hours", additionalProperties: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] } } }, ["label"]),
    summary: (i) => `Temporary hours "${i.label}" for ${i.store || "ALL"}: ${i.dates_text ? i.dates_text.replace(/\n/g, "; ") : `${i.date_from} → ${i.date_to}`} (affects everyone on those dates; rebuilds them)`,
    run: async (i) => { const o = { id: uid(), label: i.label, store: (i.store || "ALL").toUpperCase(), on: true }; if (i.dates_text) { const p = parseDatedHours(i.dates_text); if (p.errors.length) throw new Error(p.errors.join("; ")); o.dates = p.dates; } if (i.date_from && i.date_to) { needDate(i.date_from); needDate(i.date_to); o.from = i.date_from; o.to = i.date_to; if (i.hours) { o.hours = {}; Object.entries(i.hours).forEach(([d, v]) => { o.hours[d] = v === null ? null : [minOf(v[0]), minOf(v[1])]; }); } } if (!o.dates && !o.hours) throw new Error("give dates_text or a date range with hours"); await saveSetting("store_hour_overrides", (state.data.settings.store_hour_overrides || []).concat([o])); const ds = Object.keys(o.dates || {}); const a = [o.from, ...ds].filter(Boolean).sort()[0], b = [o.to, ...ds].filter(Boolean).sort().slice(-1)[0]; const n = await rebuildAffected(a, b); return { ok: true, override_id: o.id, weeks_rebuilt: n }; } },

  // ------------------------------------------------------------- people
  { name: "update_employee", risk: "write", description: "Update an employee: name, stores, home_store, role, flex, active, email. (PINs are managed under Team & PINs, not here.)", input_schema: S(null, { employee: str("id or name"), name: str("new name"), stores: { type: "array", items: str("store code") }, home_store: str("store"), role: { type: "string", enum: ["staff", "supervisor"] }, flex: bool("flex"), active: bool("active"), email: str("email") }, ["employee"]),
    summary: (i) => `Update ${(empByRef(i.employee) || {}).name || i.employee}: ${Object.entries(i).filter(([k]) => k !== "employee").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")}${i.active === false ? " (deactivating removes them from the picker and the solver)" : ""}`,
    risker: (i) => (i.active === false || i.role) ? "danger" : "write",
    run: async (i) => { const e = needEmp(i.employee); const p = {}; ["name", "stores", "home_store", "role", "flex", "active", "email"].forEach((k) => { if (i[k] !== undefined) p[k] = i[k]; }); if (p.stores) p.stores = p.stores.map((s) => String(s).toUpperCase()); await dbUpdate(T.employees, { id: e.id }, p); await refresh(["employees"]); return { ok: true, employee: stripPin([emp(e.id)])[0] }; } },
  { name: "add_employee", risk: "write", description: "Add a new employee (gets a random PIN, visible under Team & PINs).", input_schema: S(null, { name: str("full name"), stores: { type: "array", items: str("store code") }, home_store: str("store"), flex: bool("flex") }, ["name", "stores"]), summary: (i) => `Add employee ${i.name} (${(i.stores || []).join("/")})`, run: async (i) => { const id = i.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5); await dbInsert(T.employees, [{ id, name: i.name, stores: (i.stores || []).map((s) => String(s).toUpperCase()), home_store: i.home_store || (i.stores || [])[0] || null, role: "staff", flex: !!i.flex, active: true, sort: 500, pin: randPin() }]); await refresh(["employees"]); return { ok: true, id }; } },

  // ------------------------------------------------------- requests, messages
  { name: "decide_swap_request", risk: "danger", signs: true, description: "Approve or decline a swap/cover request that is waiting on the manager (status pending_supervisor). Notifies both employees.", input_schema: S(null, { request_id: str("swap request id"), approve: bool("true = approve"), note: str("note to both") }, ["request_id", "approve"]), summary: (i) => { const s = state.data.swaps.find((x) => x.id === i.request_id); return `${i.approve ? "APPROVE" : "DECLINE"} swap: ${s ? swapText(s) : i.request_id} (notifies both people)`; }, run: async (i, signer) => { const s = state.data.swaps.find((x) => x.id === i.request_id); if (!s) throw new Error("request not found"); if (s.status !== "pending_supervisor") throw new Error(`request is ${s.status}, not waiting on the manager`); await supervisorDecide(s, !!i.approve, i.note || "", signer); return { ok: true, status: state.data.swaps.find((x) => x.id === i.request_id).status }; } },
  { name: "decide_off_request", risk: "danger", signs: true, description: "Approve or decline a pending block-out/PTO request. Approval rebuilds the affected weeks and notifies the employee.", input_schema: S(null, { request_id: str("off request id"), approve: bool("true = approve"), note: str("note") }, ["request_id", "approve"]), summary: (i) => { const o = state.data.off_requests.find((x) => x.id === i.request_id); return `${i.approve ? "APPROVE" : "DECLINE"} ${o ? `${ename(o.employee_id)} ${o.kind} ${fmtRangeDates(o.date_from, o.date_to)}` : i.request_id} (notifies them${i.approve ? ", rebuilds those weeks" : ""})`; }, run: async (i, signer) => { const o = state.data.off_requests.find((x) => x.id === i.request_id); if (!o) throw new Error("request not found"); if (o.status !== "pending") throw new Error(`request is ${o.status}`); await decideOff(o, !!i.approve, signer, i.note || ""); return { ok: true, status: state.data.off_requests.find((x) => x.id === i.request_id).status }; } },
  { name: "notify_employees", risk: "danger", description: "Send an in-app notification to specific employees or everyone. They see it on Your schedule.", input_schema: S(null, { employees: { type: "array", items: str("id or name"), description: "recipients; use [\"all\"] for everyone" }, title: str("short title"), body: str("message") }, ["employees", "title", "body"]), summary: (i) => `Notify ${(i.employees || []).includes("all") ? "EVERYONE" : (i.employees || []).map((r) => (empByRef(r) || {}).name || r).join(", ")}: "${i.title}" — ${i.body}`, run: async (i) => { const ids = (i.employees || []).includes("all") ? staff().map((e) => e.id) : (i.employees || []).map((r) => needEmp(r).id); await notify(ids, "message", i.title, i.body); await refresh(["notes"]); return { ok: true, recipients: ids.length }; } },
  { name: "send_email", risk: "danger", description: "Send an email through the schedule's mail function (needs the Resend key configured).", input_schema: S(null, { to: { type: "array", items: str("email address") }, subject: str("subject"), text: str("plain text body") }, ["to", "subject", "text"]), summary: (i) => `EMAIL ${(i.to || []).join(", ")}: "${i.subject}"`, run: async (i) => { const r = await sendEmail(i.to || [], i.subject, i.text); if (r.error || r.skipped) throw new Error("email not sent: " + (r.error || r.skipped)); return { ok: true }; } },
];
const aiTool = (name) => AI_TOOLS.find((t) => t.name === name);
const aiToolDefs = () => AI_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
const riskOf = (tool, input) => (tool.risker ? tool.risker(input) : tool.risk);

// ------------------------------------------------------------------- loop
state.ai = state.ai || { messages: [], log: [], busy: false, pending: null };
try { const saved = JSON.parse(sessionStorage.getItem("lps_ai_conv") || "null"); if (saved && Array.isArray(saved.messages)) { state.ai.messages = saved.messages; state.ai.log = (saved.log || []).filter((l) => !["thinking", "running"].includes(l.kind)); } } catch (e) {}
function aiPersist() { try { const s = JSON.stringify({ messages: state.ai.messages, log: state.ai.log }); if (s.length < 1500000) sessionStorage.setItem("lps_ai_conv", s); } catch (e) {} }
function aiLog(entry) { state.ai.log.push({ ...entry, at: Date.now() }); aiPersist(); renderAiLog(); }
async function aiCall() {
  if (state.offline || !sb) throw new Error("The AI needs the cloud connection.");
  const { data, error } = await sb.functions.invoke(AI_FN, { body: { messages: state.ai.messages, tools: aiToolDefs(), context: aiContext() } });
  if (error) { let detail = ""; try { const b = error.context && error.context.json ? await error.context.json() : null; detail = b && b.error ? String(b.error) : ""; } catch (_) {} throw new Error(detail || error.message || String(error)); }
  if (data && data.error) throw new Error(data.error);
  return data;
}
function askConfirm(tool, input) {
  return new Promise((resolve) => { state.ai.pending = { tool, input, resolve }; renderAiLog(); });
}
async function aiSend(text) {
  if (state.ai.busy || !text.trim()) return;
  state.ai.busy = true;
  state.ai.messages.push({ role: "user", content: text });
  aiLog({ kind: "user", text });
  try {
    for (let round = 0; round < AI_MAX_ROUNDS; round++) {
      aiLog({ kind: "thinking" });
      const res = await aiCall();
      state.ai.log = state.ai.log.filter((l) => l.kind !== "thinking");
      const content = res.content || [];
      state.ai.messages.push({ role: "assistant", content });
      content.filter((b) => b.type === "text" && b.text.trim()).forEach((b) => aiLog({ kind: "assistant", text: b.text }));
      if (res.stop_reason === "refusal") { aiLog({ kind: "error", text: "The model declined that request." }); break; }
      const uses = content.filter((b) => b.type === "tool_use");
      if (!uses.length) break;
      const results = [];
      for (const u of uses) {
        const tool = aiTool(u.name);
        if (!tool) { results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: `"${u.name}" is not an approved action.` }); aiLog({ kind: "error", text: `Blocked: ${u.name} is not an approved action.` }); continue; }
        const risk = riskOf(tool, u.input);
        let signer = state.supName || null;
        if (risk !== "read") {
          const decision = await askConfirm(tool, u.input);
          state.ai.pending = null;
          if (!decision.ok) { results.push({ type: "tool_result", tool_use_id: u.id, content: "The manager declined this action. Do not retry it; ask what they would like instead." }); aiLog({ kind: "declined", text: (tool.summary ? tool.summary(u.input) : tool.name) }); continue; }
          signer = decision.signer || signer;
        }
        try {
          aiLog({ kind: "running", text: tool.summary ? tool.summary(u.input) : tool.name });
          const out = await tool.run(u.input, signer);
          state.ai.log = state.ai.log.filter((l) => l.kind !== "running");
          const txt = typeof out === "string" ? out : JSON.stringify(out);
          results.push({ type: "tool_result", tool_use_id: u.id, content: txt.length > 60000 ? txt.slice(0, 60000) + "…(truncated)" : txt });
          aiLog({ kind: "tool", risk, text: tool.summary ? tool.summary(u.input) : tool.name, detail: risk === "read" ? `${tool.name}(${JSON.stringify(u.input)})` : txt.slice(0, 400) });
        } catch (e) {
          state.ai.log = state.ai.log.filter((l) => l.kind !== "running");
          results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: String(e.message || e) });
          aiLog({ kind: "error", text: `${tool.name}: ${e.message || e}` });
        }
      }
      state.ai.messages.push({ role: "user", content: results }); aiPersist();
      if (state.route === "#admin") { /* keep the data views fresh after writes */ }
    }
  } catch (e) {
    state.ai.log = state.ai.log.filter((l) => l.kind !== "thinking" && l.kind !== "running");
    aiLog({ kind: "error", text: e.message || String(e) });
    // drop a dangling user turn so the next message is well-formed
    const last = state.ai.messages[state.ai.messages.length - 1];
    if (last && last.role === "user" && typeof last.content === "string") state.ai.messages.pop();
  } finally {
    state.ai.busy = false; state.ai.pending = null; aiPersist(); renderAiLog();
    if (state.route === "#admin" && state.adminTab !== "ai") render();
  }
}

// --------------------------------------------------------------------- UI
const AI_SUGGESTIONS = ["Who is short on hours next week?", "Show me every coverage gap for the next 4 weeks", "Give Mary next Thursday off and cover PB", "Add a rule: PL needs 2 people on Saturdays", "Approve the pending time-off requests", "What does Elodie's schedule look like this month?", "Set holiday hours: Dec 24 10-3, 25 closed, 26 open til 5"];
const aiPin = () => String(state.data.settings.ai_pin || "1590");
// The code is asked for every time the AI tab is opened; leaving the tab locks it again.
function aiUnlocked() { return state.aiUnlocked === true; }
function adminAi() {
  if (!aiUnlocked()) return `<div class="card" style="max-width:420px;margin:0 auto;text-align:center;padding:30px 26px"><div class="crest">LP</div><h2 class="sec" style="margin:8px 0 4px">AI command center</h2><p class="small muted" style="margin:0 0 16px">Enter the AI code to open it. It's asked every time. Managers can change it under Settings.</p><input class="lock-input" id="ai-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••" aria-label="AI password"><p class="lock-error" id="ai-pin-err"></p><button class="btn primary" id="ai-unlock" style="width:100%">Unlock</button></div>`;
  return `<div class="card ai-wrap">
    <div class="row" style="justify-content:space-between;margin-bottom:10px"><div><h2 class="sec" style="margin:0">AI command center</h2><p class="small muted" style="margin:4px 0 0">Ask in plain English. Reads run on their own; anything that changes the schedule, sends a message or affects many people shows you a preview first. Only the approved actions listed on the right exist.</p></div><button class="btn sm ghost" id="ai-clear" ${state.ai.messages.length ? "" : "disabled"}>New conversation</button></div>
    <div class="ai-grid">
      <div>
        <div class="ai-log" id="ai-log"></div>
        <div class="ai-input"><textarea class="field" id="ai-text" rows="2" placeholder="e.g. Who's covering PB on Saturday? Give Sarah the 22nd off. Approve Michael's swap." ${state.ai.busy ? "disabled" : ""}></textarea><button class="btn primary" id="ai-send" ${state.ai.busy ? "disabled" : ""}>Send</button></div>
        <div class="row" style="margin-top:8px;gap:6px">${AI_SUGGESTIONS.map((s) => `<button class="tab ai-sug">${esc(s)}</button>`).join("")}</div>
      </div>
      <aside class="ai-side"><div class="kicker">Approved actions</div>
        <div class="small muted" style="margin-bottom:8px">${dot("approved")} read · ${dot("pending_peer")} write, previewed · ${dot("declined")} sends / deletes / many people, previewed</div>
        ${AI_TOOLS.map((t) => `<div class="ai-tool">${dot(t.risk === "read" ? "approved" : t.risk === "write" ? "pending_peer" : "declined")} <span class="mono">${esc(t.name)}</span></div>`).join("")}
        <p class="small dim" style="margin-top:10px">Model: Claude Opus 5 via the lps-ai function. No payments exist in this app. PINs are never shown to the AI.</p></aside>
    </div></div>`;
}
function renderAiLog() {
  const box = $("#ai-log"); if (!box) return;
  const p = state.ai.pending;
  box.innerHTML = (state.ai.log.length ? state.ai.log.map((l) => {
    if (l.kind === "user") return `<div class="ai-msg me"><div class="ai-bubble">${esc(l.text)}</div></div>`;
    if (l.kind === "assistant") return `<div class="ai-msg"><div class="ai-bubble">${mdLite(l.text)}</div></div>`;
    if (l.kind === "thinking") return `<div class="ai-msg"><div class="ai-bubble dim">Thinking…</div></div>`;
    if (l.kind === "running") return `<div class="ai-act">${dot("pending_supervisor")} Running: ${esc(l.text)}</div>`;
    if (l.kind === "tool") return `<details class="ai-act"><summary>${dot(l.risk === "read" ? "approved" : "approved")} ${esc(l.text)}</summary><pre>${esc(l.detail || "")}</pre></details>`;
    if (l.kind === "declined") return `<div class="ai-act">${dot("declined")} Declined: ${esc(l.text)}</div>`;
    if (l.kind === "error") return `<div class="ai-act warn-text">⚠ ${esc(l.text)}</div>`;
    return "";
  }).join("") : `<div class="empty"><h3>Ready</h3>Try one of the suggestions below, or type your own.</div>`) +
  (p ? `<div class="card attn ai-confirm"><div class="row"><span class="pill ${riskOf(p.tool, p.input) === "danger" ? "bad" : "warn"}">${riskOf(p.tool, p.input) === "danger" ? "needs your approval · sends, deletes or affects many" : "needs your approval"}</span><span class="mono small muted">${esc(p.tool.name)}</span></div>
      <p style="margin:10px 0 6px"><b>${esc(p.tool.summary ? p.tool.summary(p.input) : p.tool.name)}</b></p>
      <details><summary class="small muted">Exact parameters</summary><pre>${esc(JSON.stringify(p.input, null, 2))}</pre></details>
      ${p.tool.signs ? supNameField() : ""}
      <div class="actions"><button class="btn" id="ai-no">Cancel</button><button class="btn ${riskOf(p.tool, p.input) === "danger" ? "danger" : "primary"}" id="ai-ok">Approve & run</button></div></div>` : "");
  box.scrollTop = box.scrollHeight;
  if (p) {
    $("#ai-no", box).onclick = () => p.resolve({ ok: false });
    $("#ai-ok", box).onclick = () => { let signer = state.supName || null; if (p.tool.signs) { signer = readSupName(box); if (!signer) return; } p.resolve({ ok: true, signer }); };
  }
}
function mdLite(t) {
  const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<span class=\"mono\">$1</span>").split("\n");
  let out = "", inList = false;
  lines.forEach((l) => { const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/); if (li) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${li[1]}</li>`; } else { if (inList) { out += "</ul>"; inList = false; } if (l.trim()) out += `<p>${l}</p>`; } });
  if (inList) out += "</ul>";
  return out;
}
function wireAi(root) {
  const pinIn = $("#ai-pin", root);
  if (pinIn) {
    const tryIt = () => { if (pinIn.value.trim() === aiPin()) { state.aiUnlocked = true; render(); } else { $("#ai-pin-err", root).textContent = "That's not it."; pinIn.value = ""; } };
    $("#ai-unlock", root).onclick = tryIt; pinIn.addEventListener("keydown", (e) => { if (e.key === "Enter") tryIt(); }); setTimeout(() => pinIn.focus(), 0);
    return;
  }
  renderAiLog();
  const send = () => { const ta = $("#ai-text", root); const v = ta.value.trim(); if (!v) return; ta.value = ""; aiSend(v).then(() => { if (state.adminTab === "ai" && state.route === "#admin") { const draft = ($("#ai-text") || {}).value || ""; render(); setTimeout(() => { const t = $("#ai-text"); if (t) { t.value = draft; t.focus(); } }, 0); } }); const draft0 = ""; render(); };
  const b = $("#ai-send", root); if (b) b.onclick = send;
  const ta = $("#ai-text", root); if (ta) { ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }); if (!state.ai.busy) setTimeout(() => ta.focus(), 0); }
  $$(".ai-sug", root).forEach((s) => (s.onclick = () => { const t = $("#ai-text", root); if (t) { t.value = s.textContent; t.focus(); } }));
  const c = $("#ai-clear", root); if (c) c.onclick = () => { state.ai = { messages: [], log: [], busy: false, pending: null }; try { sessionStorage.removeItem("lps_ai_conv"); } catch (e) {} render(); };
}
