// Le Parfumier: SCHEDULE — Manage views, import, lock screen, name picker, boot.
"use strict";

async function rebuildAffected(from, to) {
  let n = 0;
  for (let ws = mondayOf(from); ws <= mondayOf(to); ws = addDays(ws, 7)) if (weekShifts(ws).length) { await rebuildWeek(ws); n++; }
  return n;
}

// =================================================================== admin
function renderAdmin() {
  const tabs = [["team", "Team & PINs"], ["avail", "Availability"], ["stores", "Stores & hours"], ["rules", "Rules"], ["off", "Time off & must-work"], ["weeks", "Week tools"], ["import", "Import text"], ["ai", "AI"], ["settings", "Settings"]];
  const pend = offNeedingMe().length;
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Manage</div><h1>Rules, roster, <em>rebuilds</em></h1><p class="panel-sub">Everything the solver uses lives here. Change a rule, then rebuild a week under Week tools to see the effect. Locked shifts always survive a rebuild, and every rebuild can be undone.</p></div>
      <span class="pill ${state.offline ? "warn" : "good"}">${state.offline ? "this device only · cloud tables missing" : "synced · Supabase"}</span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${state.adminTab === k ? "active" : ""}" data-admintab="${k}">${l}${k === "off" && pend ? ` <span class="pill bad" style="padding:0 6px">${pend}</span>` : ""}</button>`).join("")}</div>
    <div id="admin-body">${({ team: adminTeam, avail: adminAvail, stores: adminStores, rules: adminRules, off: adminOff, weeks: adminWeeks, import: adminImport, ai: adminAi, settings: adminSettings })[state.adminTab]()}</div>
  </section>`;
}
function adminTeam() {
  const rows = state.data.employees.slice().sort(bySort);
  return `<div class="card"><div class="mwrap" style="border:0"><table class="plain"><thead><tr><th>Name</th><th>PIN</th><th>Stores</th><th>Home</th><th>Role</th><th>Flex</th><th>Active</th><th>Email</th><th></th></tr></thead><tbody>
    ${rows.map((e) => `<tr data-emp="${esc(e.id)}"><td><input class="field" data-f="name" value="${esc(e.name)}" style="min-width:150px"></td>
      <td><input class="field tm" data-f="pin" value="${esc(e.pin || "")}" maxlength="4" inputmode="numeric" style="width:70px"></td>
      <td style="white-space:nowrap">${stores().map((s) => `<label class="check" style="display:inline-flex;padding:2px 8px 2px 0"><input type="checkbox" data-store="${esc(s.code)}" ${worksStore(e, s.code) ? "checked" : ""}> ${esc(s.code)}</label>`).join("")}</td>
      <td><select class="field" data-f="home_store"><option value="">—</option>${stores().map((s) => `<option ${e.home_store === s.code ? "selected" : ""}>${esc(s.code)}</option>`).join("")}</select></td>
      <td><select class="field" data-f="role"><option value="staff" ${e.role === "staff" ? "selected" : ""}>staff</option><option value="supervisor" ${e.role === "supervisor" ? "selected" : ""}>supervisor</option></select></td>
      <td><input type="checkbox" data-f="flex" ${e.flex ? "checked" : ""} title="Can be called in on OFF days"></td>
      <td><input type="checkbox" data-f="active" ${e.active !== false ? "checked" : ""}></td>
      <td><input class="field" data-f="email" value="${esc(e.email || "")}" placeholder="for emails" style="min-width:160px"></td>
      <td><button class="btn sm" data-save-emp="${esc(e.id)}">Save</button></td></tr>`).join("")}
  </tbody></table></div>
  <div class="row" style="margin-top:14px"><input class="field" id="new-emp" placeholder="New employee name" style="max-width:280px"><button class="btn" id="add-emp">Add</button></div>
  <p class="small muted" style="margin-top:10px">Everyone types the store code, taps their name, then their own 4-digit PIN. The admin PIN <b>${esc(state.data.settings.admin_pin || "1212")}</b> opens any name (change it under Settings). Flex = the solver may call them in on an OFF day. Supervisors see Manage, approve requests and get the emails.</p></div>`;
}
function avGrid(pattern, storesFor, prefix) {
  return `<div class="avgrid">${DOW.map((d, i) => { const dow = i + 1, a = pattern[dow];
    return `<div class="avday" data-dow="${dow}"><div class="wd">${d}</div><label class="check" style="padding:2px 0"><input type="checkbox" class="on" ${a ? "checked" : ""}> works</label><input type="time" class="field a" step="900" value="${a ? toHHMM(a.start_min) : "10:00"}"><input type="time" class="field b" step="900" value="${a ? toHHMM(a.end_min) : "18:00"}"><select class="field st">${storesFor.map((s) => `<option ${a && a.store === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`; }).join("")}</div>`;
}
function readAvGrid(root) {
  const out = {};
  $$(".avday", root).forEach((d) => { if (!$(".on", d).checked) return; const a = fromHHMM($(".a", d).value), b = fromHHMM($(".b", d).value); if (a == null || b == null || b <= a) return; out[Number(d.dataset.dow)] = { start_min: a, end_min: b, store: $(".st", d).value }; });
  return out;
}
function patternSummary(p) { return DOW.map((d, i) => { const a = p[i + 1]; return a ? `${d} ${fmtRange(a.start_min, a.end_min)} ${a.store}` : null; }).filter(Boolean).join(" · ") || "no days"; }
function adminAvail() {
  const list = staff(); const cur = emp(state.adminEmp) || list[0]; if (!cur) return `<div class="empty">Add employees first.</div>`;
  state.adminEmp = cur.id;
  const av = {}; state.data.availability.filter((a) => a.employee_id === cur.id).forEach((a) => (av[a.dow] = a));
  const storesFor = (cur.stores || []).length ? cur.stores : [cur.home_store || "PL"];
  const periods = state.data.avail_periods.filter((p) => p.employee_id === cur.id).sort(by((p) => p.date_from));
  return `<div class="card"><div class="row" style="margin-bottom:14px"><select class="field" id="av-emp" style="max-width:280px">${list.map((e) => `<option value="${esc(e.id)}" ${e.id === cur.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select><span class="small muted">Weekly template: the shift they normally work each day. Leave a day unticked for OFF.</span></div>
  <div id="av-week">${avGrid(av, storesFor)}</div>
  <div class="actions"><button class="btn primary" id="save-av">Save weekly template</button></div>
  <p class="small muted">Saving rebuilds the weeks that are already built (locked shifts stay). Tip: instead of retyping, edit shifts on the Master schedule and use Week tools → Learn.</p></div>
  <div class="card"><h2 class="sec">Special availability <small>a different pattern for a few weeks</small></h2>
    <p class="small muted">Use this when someone's availability changes for a season or a month ("Thursdays instead of Wednesdays until Oct 30"). Inside the dates the solver uses this pattern instead of the weekly template. Block-outs and PTO still apply on top.</p>
    ${periods.length ? `<table class="plain"><tbody>${periods.map((p) => `<tr><td><b>${esc(p.label || "Special period")}</b><br><span class="small muted">${esc(fmtRangeDates(p.date_from, p.date_to))}</span></td><td class="small">${esc(patternSummary(p.pattern || {}))}</td><td style="text-align:right"><button class="btn sm danger" data-del-period="${p.id}">Remove</button></td></tr>`).join("")}</tbody></table>` : `<p class="dim small">None yet for ${esc(firstName(cur.name))}.</p>`}
    <div class="field-row" style="margin-top:12px"><div><label class="lbl">Label</label><input class="field" id="per-label" placeholder="e.g. School term"></div><div class="field-row"><div><label class="lbl">From</label><input class="field" id="per-from" type="date"></div><div><label class="lbl">To</label><input class="field" id="per-to" type="date"></div></div></div>
    <label class="lbl">Pattern during those dates</label>
    <div id="per-grid">${avGrid(av, storesFor)}</div>
    <div class="actions"><button class="btn" id="save-period">Add special period</button></div></div>`;
}
function hoursGrid(hours, allowDefault, cls) {
  return DOW.map((d, i) => { const h = hours[i + 1], def = allowDefault && h === undefined; return `<td class="${cls || ""}"><label class="check" style="padding:0 0 4px"><input type="checkbox" class="open" data-dow="${i + 1}" ${h ? "checked" : ""} ${def ? "disabled" : ""}> open</label>${allowDefault ? `<label class="check" style="padding:0 0 4px"><input type="checkbox" class="def" data-dow="${i + 1}" ${def ? "checked" : ""}> as usual</label>` : ""}<input type="time" class="field tm a" step="900" value="${h ? toHHMM(h[0]) : "10:00"}" ${def ? "disabled" : ""}><input type="time" class="field tm b" step="900" value="${h ? toHHMM(h[1]) : "18:00"}" ${def ? "disabled" : ""}></td>`; }).join("");
}
function readHoursGrid(tr, allowDefault) {
  const hours = {};
  $$("td", tr).forEach((td) => { const o = $(".open", td); if (!o) return; const def = allowDefault && $(".def", td) && $(".def", td).checked; if (def) return; hours[o.dataset.dow] = o.checked ? [fromHHMM($(".a", td).value), fromHHMM($(".b", td).value)] : null; });
  return hours;
}
function adminStores() {
  const ov = (state.data.settings.store_hour_overrides || []).slice().sort(by((o) => o.from || Object.keys(o.dates || {})[0] || ""));
  return `<div class="card"><h2 class="sec">Regular hours</h2><div class="mwrap" style="border:0"><table class="plain"><thead><tr><th>Store</th><th>Name</th>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
    ${stores().map((s) => `<tr data-store-row="${esc(s.code)}"><td><b>${esc(s.code)}</b></td><td><input class="field" data-f="name" value="${esc(s.name)}" style="min-width:110px"></td>${hoursGrid(s.hours, false)}</tr>`).join("")}
  </tbody></table></div><div class="actions"><button class="btn primary" id="save-stores">Save regular hours</button></div>
  <p class="small muted">Opening and closing buffers ("someone starts 15 min before opening") are rules, not hours: see Rules. That keeps the posted hours honest and still gets the opener in early.</p></div>
  <div class="card"><h2 class="sec">Temporary hours <small>holidays, seasons, special dates</small></h2>
    <p class="small muted">A temporary block wins over the regular hours for its dates. Give it a date range and a weekly pattern (tick "as usual" for days that don't change), or type specific dates below. The solver builds those weeks to the temporary hours and everything else to the regular ones.</p>
    ${ov.length ? `<table class="plain"><tbody>${ov.map((o) => `<tr><td><label class="check"><input type="checkbox" data-ov-on="${esc(o.id)}" ${o.on === false ? "" : "checked"}> <b>${esc(o.label || "Temporary hours")}</b></label></td><td class="small">${o.store === "ALL" ? "every store" : esc(store(o.store).name)}</td><td class="small mono">${o.from ? esc(fmtRangeDates(o.from, o.to)) : ""}${o.dates && Object.keys(o.dates).length ? ` · ${Object.keys(o.dates).length} specific date${Object.keys(o.dates).length > 1 ? "s" : ""}` : ""}</td><td class="small muted">${o.hours ? esc(Object.entries(o.hours).map(([d, h]) => DOW[d - 1] + " " + (h ? fmtRange(h[0], h[1]) : "closed")).join(" · ")) : ""}${o.dates ? esc(Object.entries(o.dates).sort().map(([d, h]) => fmtMonthDay(d) + " " + fmtHoursVal(h)).join(" · ")) : ""}</td><td style="text-align:right"><button class="btn sm danger" data-del-ov="${esc(o.id)}">Remove</button></td></tr>`).join("")}</tbody></table>` : `<p class="dim small">None yet.</p>`}
    <div class="field-row" style="margin-top:14px"><div><label class="lbl">Label</label><input class="field" id="ov-label" placeholder="e.g. Christmas week"></div><div><label class="lbl">Store</label><select class="field" id="ov-store"><option value="ALL">Every store</option>${stores().map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join("")}</select></div>
      <div><label class="lbl">From</label><input class="field" id="ov-from" type="date"></div><div><label class="lbl">To</label><input class="field" id="ov-to" type="date"></div></div>
    <label class="lbl">Weekly pattern inside those dates</label>
    <div class="mwrap" style="border:0"><table class="plain"><thead><tr>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody><tr id="ov-grid">${hoursGrid({}, true)}</tr></tbody></table></div>
    <label class="lbl">Or type specific dates (one per line, the month carries over)</label>
    <textarea class="field" id="ov-text" placeholder="Dec 24 10-3&#10;25 closed&#10;26 open til 5&#10;Dec 28 - Jan 2: 12 to 5"></textarea>
    <div class="actions"><button class="btn primary" id="save-ov">Add temporary hours</button></div></div>`;
}
function ruleFieldsHtml(t, r = {}) {
  const def = RULE_TYPES.find((x) => x.t === t); if (!def) return "";
  const storeSel = `<select class="field" data-rf="store"><option value="ALL">every store</option>${stores().map((s) => `<option value="${esc(s.code)}" ${r.store === s.code ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
  const daySel = `<select class="field" data-rf="day"><option value="ANY">any day</option>${DOW_LONG.map((d, i) => `<option value="${i + 1}" ${String(r.day) === String(i + 1) ? "selected" : ""}>${d}s</option>`).join("")}</select>`;
  const empSel = (k) => `<select class="field" data-rf="${k}">${staff().map((e) => `<option value="${esc(e.id)}" ${r[k] === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select>`;
  return def.fields.map((f) => {
    if (f === "store") return `<div><label class="lbl">Store</label>${storeSel}</div>`;
    if (f === "day") return `<div><label class="lbl">Day</label>${daySel}</div>`;
    if (f === "emp") return `<div><label class="lbl">Employee</label>${empSel("emp")}</div>`;
    if (f === "emp2") return `<div><label class="lbl">And</label>${empSel("emp2")}</div>`;
    if (f === "n") return `<div><label class="lbl">N</label><input class="field" type="number" min="0" data-rf="n" value="${esc(r.n ?? (t.includes("Hours") ? 30 : t === "maxConsecutive" ? 5 : 2))}"></div>`;
    if (f === "minutes") return `<div><label class="lbl">Minutes</label><input class="field" type="number" min="0" step="5" data-rf="minutes" value="${esc(r.minutes ?? 15)}"></div>`;
    if (f === "from") return `<div><label class="lbl">From</label><input class="field" type="time" step="900" data-rf="from" value="${esc(r.from || "12:00")}"></div>`;
    if (f === "to") return `<div><label class="lbl">To</label><input class="field" type="time" step="900" data-rf="to" value="${esc(r.to || "17:00")}"></div>`;
    if (f === "text") return `<div style="grid-column:1/-1"><label class="lbl">Note</label><input class="field" data-rf="text" value="${esc(r.text || "")}"></div>`;
    return "";
  }).join("");
}
function adminRules() {
  const R = rules(), broken = new Set(weekIssues(state.week || mondayOf(today())).filter((i) => i.rule).map((i) => i.rule));
  const num = (k, label, help, step = 1) => `<div><label class="lbl">${label}</label><input class="field" type="number" step="${step}" data-rule="${k}" value="${R[k]}"><div class="small muted" style="margin-top:4px">${help}</div></div>`;
  const chk = (k, label, help) => `<label class="check"><input type="checkbox" data-rule="${k}" ${R[k] ? "checked" : ""}> <span><b>${label}</b><br><span class="small muted">${help}</span></span></label>`;
  return `<div class="card"><h2 class="sec">Our rules <small>${customRules().length} · dropdowns, like the gym scheduler</small></h2>
    ${customRules().length ? `<table class="plain"><tbody>${customRules().map((r) => `<tr class="${r.on === false ? "dim" : ""}"><td style="width:34px"><input type="checkbox" data-rule-on="${esc(r.id)}" ${r.on === false ? "" : "checked"} title="on / off"></td><td>${esc(ruleText(r))}${broken.has(r.id) ? ` <span class="pill bad">broken this week</span>` : ""}${r.t === "note" ? ` <span class="pill">note</span>` : ""}</td><td style="text-align:right"><button class="btn sm danger" data-del-rule="${esc(r.id)}">Remove</button></td></tr>`).join("")}</tbody></table>` : `<p class="dim small">No custom rules yet.</p>`}
    <div style="margin-top:14px"><label class="lbl">Add a rule</label><select class="field" id="rule-type"><option value="">— pick a rule —</option>${RULE_TYPES.map((x) => `<option value="${x.t}">${esc(x.label)}</option>`).join("")}</select>
    <div class="field-row" id="rule-fields" style="margin-top:8px"></div>
    <div class="actions"><button class="btn primary" id="add-rule" disabled>Add rule</button></div></div>
    <p class="small muted">Buffers and minimum-staff rules change what the solver has to cover. Employee rules are hard (never / can't) or soft (always / should, scored). Rules apply on the next rebuild; anything already broken is flagged on the Master schedule.</p></div>
  <div class="card"><h2 class="sec">Base rules</h2><div class="field-row">
    ${num("minStaff", "Minimum staff on the floor", "Every open minute at every store needs at least this many people.")}
    ${num("maxHoursWeek", "Max hours per week", "Ceiling per person. Only broken as a last resort to avoid an empty store, and flagged when it is.")}
    ${num("maxDaysWeek", "Max days per week", "Ceiling on days worked.")}
    ${num("restarts", "Solver attempts per week", "How many randomized attempts to make before keeping the best. 260 is instant.", 10)}
    ${num("minShiftMin", "Shortest call-in shift (minutes)", "A fill-in shift is never shorter than this, even for a small gap.", 15)}
    ${num("maxShiftMin", "Longest shift (minutes)", "A shift is only stretched past this when nothing else covers.", 15)}
  </div>
  <div style="margin-top:14px">${chk("neverLeaveGap", "Never leave a gap open", "Escalate: break hour limits, call in anyone from the store, then anyone from another store, before leaving nobody on. Every compromise is flagged.")}
  ${chk("clampToStoreHours", "Trim template shifts to store hours", "e.g. a 10–6 template on a day the store closes at 5 becomes 10–5 (buffers included).")}
  ${chk("allowFlexFill", "Flex staff can be called in on OFF days", "Only people with the Flex flag under Team.")}
  ${chk("allowCallInAnyone", "Anyone from that store can be called in on an OFF day at first try", "Off by default; with it off, others are only called in as an escalation.")}</div>
  <div class="actions"><button class="btn primary" id="save-rules">Save base rules</button></div></div>`;
}
function adminOff() {
  const pend = state.data.off_requests.filter((o) => o.status === "pending").sort(by((o) => o.date_from));
  const hist = state.data.off_requests.filter((o) => o.status !== "pending").sort(by((o) => -new Date(o.created_at).getTime())).slice(0, 30);
  const off = state.data.time_off.slice().sort(by((o) => o.date)), must = state.data.must_work.slice().sort(by((m) => m.date));
  const opts = staff().map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");
  return `<div class="card"><h2 class="sec">Waiting for approval <small>${pend.length}</small></h2>${pend.length ? pend.map(offCard).join("") : `<p class="dim small">Nothing pending.</p>`}</div>
  <div class="card"><h2 class="sec">Time off <small>pre-approved days the solver never schedules</small></h2>
    <table class="plain"><tbody>${off.map((o) => `<tr><td>${esc(ename(o.employee_id))}</td><td class="mono">${esc(fmtDate(o.date, true))}</td><td class="muted">${esc(o.note || "")}</td><td style="text-align:right"><button class="btn sm danger" data-del-off="${o.id}">Remove</button></td></tr>`).join("") || `<tr><td class="dim">None</td></tr>`}</tbody></table>
    <div class="row" style="margin-top:12px"><select class="field" id="off-emp" style="max-width:220px">${opts}</select><input class="field" id="off-date" type="date" style="max-width:180px"><input class="field" id="off-note" placeholder="note" style="max-width:220px"><button class="btn" id="add-off">Add day off</button></div></div>
  <div class="card"><h2 class="sec">Needs to work <small>pinned into the week as a locked shift</small></h2>
    <table class="plain"><tbody>${must.map((m) => `<tr><td>${esc(ename(m.employee_id))}</td><td class="mono">${esc(fmtDate(m.date, true))} · ${fmtRange(m.start_min, m.end_min)}</td><td><span class="pill store s-${esc(m.store)}">${esc(m.store)}</span></td><td class="muted">${esc(m.note || "")}</td><td style="text-align:right"><button class="btn sm danger" data-del-must="${m.id}">Remove</button></td></tr>`).join("") || `<tr><td class="dim">None</td></tr>`}</tbody></table>
    <div class="row" style="margin-top:12px"><select class="field" id="must-emp" style="max-width:220px">${opts}</select><input class="field" id="must-date" type="date" style="max-width:170px"><input class="field tm" id="must-a" type="time" step="900" value="10:00" style="max-width:120px"><input class="field tm" id="must-b" type="time" step="900" value="14:00" style="max-width:120px"><select class="field" id="must-st" style="max-width:100px">${stores().map((s) => `<option>${esc(s.code)}</option>`).join("")}</select><button class="btn" id="add-must">Add</button></div>
    <p class="small muted">Adding either one rebuilds the affected week automatically (locked shifts stay).</p></div>
  ${hist.length ? `<div class="card"><h2 class="sec">Decided requests</h2>${hist.map(offCard).join("")}</div>` : ""}`;
}
function adminWeeks() {
  const ws = state.week, issues = weekIssues(ws), sh = weekShifts(ws);
  const totals = staff().map((e) => ({ e, m: weekMinutes(e.id, ws), d: empDays(sh, e.id) })).filter((x) => x.m);
  const snaps = state.data.snapshots.filter((s) => s.week_start === ws).sort(by((s) => -new Date(s.created_at).getTime()));
  const autos = snaps.filter((s) => s.kind === "auto"), saved = snaps.filter((s) => s.kind === "saved");
  const manual = sh.filter((s) => s.source === "manual").length;
  return `<div class="card"><div class="row" style="justify-content:space-between">${weekNav()}<div class="row"><button class="btn primary" id="rebuild">Rebuild · choose a version</button><button class="btn" id="goback" ${autos.length ? "" : "disabled"} title="${autos.length ? esc("Back to: " + autos[0].label + " · " + new Date(autos[0].created_at).toLocaleString()) : "Nothing to go back to yet"}">↶ Go back</button><button class="btn" id="save-ver">Save this version</button></div></div>
    <p class="small muted" style="margin-top:10px">Rebuild re-solves the week from templates, time off, must-work and rules and shows you two arrangements to pick from. Locked shifts (🔒) are kept exactly as they are. Every rebuild saves the previous version first, so <b>Go back</b> restores it. ${sh.length} shifts · ${sh.filter((s) => s.locked).length} locked · ${sh.filter((s) => s.source === "fill").length} solver fills · ${manual} manual edit${manual === 1 ? "" : "s"}.</p>
    ${saved.length ? `<label class="lbl">Saved versions</label><table class="plain"><tbody>${saved.map((s) => `<tr><td><b>${esc(s.label)}</b> <span class="dim small mono">${esc(new Date(s.created_at).toLocaleString())}</span></td><td class="small muted">${(s.shifts || []).length} shifts</td><td style="text-align:right"><button class="btn sm" data-load-snap="${s.id}">Load</button> <button class="btn sm danger" data-del-snap="${s.id}">Delete</button></td></tr>`).join("")}</tbody></table>` : ""}
    ${autos.length > 1 ? `<details style="margin-top:10px"><summary class="small muted">Earlier automatic versions (${autos.length})</summary><table class="plain"><tbody>${autos.map((s) => `<tr><td class="small">${esc(s.label)} <span class="dim mono">${esc(new Date(s.created_at).toLocaleString())}</span></td><td style="text-align:right"><button class="btn sm" data-load-snap="${s.id}">Restore</button></td></tr>`).join("")}</tbody></table></details>` : ""}</div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 class="sec" style="margin:0">Learn from this week</h2><button class="btn ${manual ? "primary" : ""}" id="learn" ${manual ? "" : "disabled"}>LEARN</button></div>
    <p class="small muted" style="margin-top:8px">Edit shifts on the Master schedule (move, retime, add, delete), then press LEARN. The solver compares your edits with the weekly template and proposes template changes, one per edit, which you tick or untick before applying. A note is optional: the learning comes from the edits themselves, the note is just kept in the log so you remember why. ${manual ? "" : "Make a manual edit on the Master schedule first."}</p></div>
  <div class="card"><h2 class="sec">Flags this week</h2>${issues.length ? `<ul class="small" style="margin:0 0 0 18px;padding:0">${issues.map((i) => `<li>${i.sev === "bad" ? dot("declined") : i.sev === "warn" ? dot("pending") : dot("cancelled")} ${esc(i.text)}</li>`).join("")}</ul>` : `<span class="pill good">Clean. Every open hour covered, everyone within limits.</span>`}</div>
  <div class="card"><h2 class="sec">Hours this week</h2><table class="plain"><tbody>${totals.sort((a, b) => b.m - a.m).map((x) => `<tr><td>${esc(x.e.name)}</td><td class="mono">${fmtHours(x.m)}</td><td class="mono muted">${x.d} day${x.d === 1 ? "" : "s"}</td><td>${x.m > maxHoursFor(x.e, rules()) ? '<span class="pill bad">over</span>' : ""}</td></tr>`).join("")}</tbody></table></div>`;
}
function adminImport() {
  return `<div class="card"><h2 class="sec">Paste a schedule as text</h2>
    <p class="small muted">Paste the spreadsheet rows (name, store, Mon…Sun, time off, needs to work) straight from Excel, or type lines like <span class="mono">Maria (PV): Mon 10 to 6, Thu 10-3, Sat 10 to 5</span>. "OFF" or a blank means off. Times read the retail way: "3 to 9" is 3pm–9pm. Preview first, then choose what to do with it.</p>
    <textarea class="field" id="imp-text" style="min-height:160px;font-family:var(--mono);font-size:12.5px" placeholder="Employee Name	Store	Monday	Tuesday	...&#10;Elodie Bourque	PV	OFF	10 TO 6	..."></textarea>
    <div class="actions" style="justify-content:flex-start"><button class="btn" id="imp-preview">Preview</button></div>
    <div id="imp-result"></div></div>`;
}
function adminSettings() {
  const S = state.data.settings, log = state.data.learned.slice().sort(by((l) => -new Date(l.created_at).getTime())).slice(0, 20);
  return `<div class="card"><label class="lbl">Supervisor email (approval requests go here)</label><input class="field" id="sup-email" value="${esc(S.supervisor_email || "")}" placeholder="manager@store.com">
    <label class="lbl">Supervisor names (who can sign an approval, one per line)</label><textarea class="field" id="sup-names">${esc(supervisorNames().join("\n"))}</textarea>
    <div class="field-row"><div><label class="lbl">Store code (the first PIN everyone types)</label><input class="field" id="pin" value="${esc(S.pin || SEED.pin)}" maxlength="8" style="max-width:160px"></div>
    <div><label class="lbl">Admin PIN (opens any name)</label><input class="field" id="admin-pin" value="${esc(S.admin_pin || "1212")}" maxlength="4" style="max-width:160px"></div>
    <div><label class="lbl">AI password (locks the AI tab)</label><input class="field" id="ai-pin-set" value="${esc(S.ai_pin || "1590")}" maxlength="8" style="max-width:160px"></div></div>
    <div class="actions"><button class="btn primary" id="save-settings">Save</button></div></div>
  <div class="card"><h2 class="sec">Email delivery</h2><p class="small muted">Emails go through the deployed Edge Function <span class="mono">${NOTIFY_FN}</span> using Resend, with Approve / Decline buttons built in. They start flowing once the <b>RESEND_API_KEY</b> secret exists in Supabase (Edge Functions → Secrets). Until then requests still land in the in-app queue; only the email is missing.</p><button class="btn" id="test-email">Send a test email</button></div>
  <div class="card"><h2 class="sec">What the solver has learned</h2>${log.length ? `<table class="plain"><tbody>${log.map((l) => `<tr><td class="small"><b>Week of ${esc(fmtMonthDay(l.week_start))}</b> · ${esc(new Date(l.created_at).toLocaleDateString())}${l.by_name ? " · " + esc(l.by_name) : ""}${l.note ? `<br><i class="muted">“${esc(l.note)}”</i>` : ""}<ul style="margin:4px 0 0 16px;padding:0">${(l.changes || []).map((c) => `<li>${esc(c.text)}</li>`).join("")}</ul></td></tr>`).join("")}</tbody></table>` : `<p class="dim small">Nothing yet. Edit a week on the Master schedule and press LEARN under Week tools.</p>`}</div>
  <div class="card"><h2 class="sec">Data</h2><p class="small muted">Cloud: ${state.offline ? `<span class="pill warn">tables missing</span> ${esc(state.cloudError || "")} — run supabase/schema.sql in the Supabase SQL editor, then reload.` : `<span class="pill good">connected</span> ${esc(SUPABASE_URL)}`}</p><p class="small muted">Version ${APP_VERSION}.</p></div>`;
}

// ------------------------------------------------------------ admin wiring
function wireAdmin(root) {
  if (state.adminTab === "ai") { wireAi(root); return; }
  const on = (sel, fn) => { const el = $(sel, root); if (el) el.onclick = fn; };
  const guard = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg, "ok"); } catch (e) { console.error(e); toast(e.message || String(e), "err"); } };
  // team
  $$("[data-save-emp]", root).forEach((b) => (b.onclick = () => guard(async () => {
    const tr = b.closest("tr"), id = b.dataset.saveEmp, pin = $('[data-f="pin"]', tr).value.trim();
    if (pin && !/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits.");
    const patch = { name: $('[data-f="name"]', tr).value.trim(), pin: pin || null, stores: $$("[data-store]", tr).filter((c) => c.checked).map((c) => c.dataset.store), home_store: $('[data-f="home_store"]', tr).value || null, role: $('[data-f="role"]', tr).value, flex: $('[data-f="flex"]', tr).checked, active: $('[data-f="active"]', tr).checked, email: $('[data-f="email"]', tr).value.trim() || null };
    await dbUpdate(T.employees, { id }, patch); await refresh(["employees"]); if (state.me && state.me.id === id) state.me = emp(id); render();
  }, "Saved.")));
  on("#add-emp", () => guard(async () => {
    const name = $("#new-emp", root).value.trim(); if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5);
    await dbInsert(T.employees, [{ id, name, stores: [], home_store: null, role: "staff", flex: false, active: true, sort: 500, pin: randPin() }]); await refresh(["employees"]); render();
  }, "Added. Tick their stores and save."));
  // availability
  const avSel = $("#av-emp", root); if (avSel) avSel.onchange = () => { state.adminEmp = avSel.value; render(); };
  on("#save-av", () => guard(async () => {
    const id = state.adminEmp, p = readAvGrid($("#av-week", root));
    await dbDelete(T.availability, { employee_id: id });
    const rows = Object.entries(p).map(([dow, a]) => ({ employee_id: id, dow: Number(dow), ...a }));
    if (rows.length) await dbInsert(T.availability, rows);
    await refresh(["availability"]); const n = await rebuildAffected(weeksList()[0], weeksList()[WEEKS_AHEAD]); render(); toast(`Template saved. ${n} week(s) rebuilt.`, "ok");
  }));
  on("#save-period", () => guard(async () => {
    const from = $("#per-from", root).value, to = $("#per-to", root).value; if (!from || !to || to < from) throw new Error("Pick a from and to date.");
    const pattern = readAvGrid($("#per-grid", root));
    await dbInsert(T.avail_periods, [{ employee_id: state.adminEmp, label: $("#per-label", root).value.trim() || "Special period", date_from: from, date_to: to, pattern }]);
    await refresh(["avail_periods"]); const n = await rebuildAffected(from, to); render(); toast(`Special period added. ${n} week(s) rebuilt.`, "ok");
  }));
  $$("[data-del-period]", root).forEach((b) => (b.onclick = () => guard(async () => { const p = state.data.avail_periods.find((x) => x.id === b.dataset.delPeriod); await dbDelete(T.avail_periods, { id: p.id }); await refresh(["avail_periods"]); await rebuildAffected(p.date_from, p.date_to); render(); }, "Removed and weeks rebuilt.")));
  // stores
  on("#save-stores", () => guard(async () => {
    const out = $$("[data-store-row]", root).map((tr) => ({ code: tr.dataset.storeRow, name: $('[data-f="name"]', tr).value.trim() || tr.dataset.storeRow, hours: readHoursGrid(tr, false) }));
    await saveSetting("stores", out); const n = await rebuildAffected(weeksList()[0], weeksList()[WEEKS_AHEAD]); render(); toast(`Store hours saved. ${n} week(s) rebuilt.`, "ok");
  }));
  $$(".def", root).forEach((c) => (c.onchange = () => { const td = c.closest("td"); [".open", ".a", ".b"].forEach((s) => ($(s, td).disabled = c.checked)); }));
  on("#save-ov", () => guard(async () => {
    const label = $("#ov-label", root).value.trim() || "Temporary hours", st = $("#ov-store", root).value, from = $("#ov-from", root).value, to = $("#ov-to", root).value, txt = $("#ov-text", root).value.trim();
    const o = { id: uid(), label, store: st, on: true };
    if (from && to) { if (to < from) throw new Error("To is before from."); o.from = from; o.to = to; o.hours = readHoursGrid($("#ov-grid", root), true); }
    if (txt) { const p = parseDatedHours(txt); if (p.errors.length) throw new Error(p.errors[0]); o.dates = p.dates; }
    if (!o.hours && !o.dates) throw new Error("Give it a date range with a pattern, or type specific dates.");
    const list = (state.data.settings.store_hour_overrides || []).concat([o]); await saveSetting("store_hour_overrides", list);
    const ds = Object.keys(o.dates || {}); const a = [o.from, ...ds].filter(Boolean).sort()[0], b = [o.to, ...ds].filter(Boolean).sort().slice(-1)[0];
    const n = await rebuildAffected(a, b); render(); toast(`Temporary hours added. ${n} week(s) rebuilt.`, "ok");
  }));
  $$("[data-ov-on]", root).forEach((c) => (c.onchange = () => guard(async () => { const list = (state.data.settings.store_hour_overrides || []).map((o) => (o.id === c.dataset.ovOn ? { ...o, on: c.checked } : o)); await saveSetting("store_hour_overrides", list); const o = list.find((x) => x.id === c.dataset.ovOn); const ds = Object.keys(o.dates || {}); await rebuildAffected([o.from, ...ds].filter(Boolean).sort()[0], [o.to, ...ds].filter(Boolean).sort().slice(-1)[0]); render(); }, "Updated and weeks rebuilt.")));
  $$("[data-del-ov]", root).forEach((b) => (b.onclick = () => guard(async () => { const o = (state.data.settings.store_hour_overrides || []).find((x) => x.id === b.dataset.delOv); await saveSetting("store_hour_overrides", (state.data.settings.store_hour_overrides || []).filter((x) => x.id !== b.dataset.delOv)); const ds = Object.keys(o.dates || {}); await rebuildAffected([o.from, ...ds].filter(Boolean).sort()[0], [o.to, ...ds].filter(Boolean).sort().slice(-1)[0]); render(); }, "Removed and weeks rebuilt.")));
  // rules
  const rt = $("#rule-type", root); if (rt) rt.onchange = () => { $("#rule-fields", root).innerHTML = ruleFieldsHtml(rt.value); $("#add-rule", root).disabled = !rt.value; };
  on("#add-rule", () => guard(async () => {
    const r = { id: uid(), t: rt.value, on: true }; $$("[data-rf]", root).forEach((i) => { r[i.dataset.rf] = i.type === "number" ? Number(i.value) : i.value; });
    if ((r.t === "notTogether" || r.t === "together") && r.emp === r.emp2) throw new Error("Pick two different people.");
    await saveSetting("custom_rules", customRules().concat([r])); render();
  }, "Rule added. Rebuild a week to apply it."));
  $$("[data-rule-on]", root).forEach((c) => (c.onchange = () => guard(async () => { await saveSetting("custom_rules", customRules().map((r) => (r.id === c.dataset.ruleOn ? { ...r, on: c.checked } : r))); render(); })));
  $$("[data-del-rule]", root).forEach((b) => (b.onclick = () => guard(async () => { await saveSetting("custom_rules", customRules().filter((r) => r.id !== b.dataset.delRule)); render(); }, "Rule removed.")));
  on("#save-rules", () => guard(async () => { const R = { ...rules() }; $$("[data-rule]", root).forEach((i) => { R[i.dataset.rule] = i.type === "checkbox" ? i.checked : Number(i.value); }); await saveSetting("rules", R); render(); }, "Base rules saved. Rebuild a week to apply them."));
  // time off / must work
  $$("[data-del-off]", root).forEach((b) => (b.onclick = () => guard(async () => { const o = state.data.time_off.find((x) => String(x.id) === b.dataset.delOff); await dbDelete(T.time_off, { id: o.id }); await refresh(["time_off"]); await rebuildAffected(o.date, o.date); render(); }, "Removed and week rebuilt.")));
  $$("[data-del-must]", root).forEach((b) => (b.onclick = () => guard(async () => { const m = state.data.must_work.find((x) => String(x.id) === b.dataset.delMust); await dbDelete(T.must_work, { id: m.id }); const pinned = weekShifts(mondayOf(m.date)).filter((s) => s.employee_id === m.employee_id && s.date === m.date && s.source === "must"); await dbDeleteIn(T.shifts, "id", pinned.map((p) => p.id)); await refresh(["must_work", "shifts"]); await rebuildAffected(m.date, m.date); render(); }, "Removed and week rebuilt.")));
  on("#add-off", () => guard(async () => { const employee_id = $("#off-emp", root).value, date = $("#off-date", root).value; if (!date) throw new Error("Pick a date."); await dbUpsert(T.time_off, [{ employee_id, date, note: $("#off-note", root).value.trim() || null }], "employee_id,date"); await refresh(["time_off"]); await rebuildAffected(date, date); render(); }, "Day off added; week rebuilt."));
  on("#add-must", () => guard(async () => { const employee_id = $("#must-emp", root).value, date = $("#must-date", root).value, a = fromHHMM($("#must-a", root).value), b = fromHHMM($("#must-b", root).value), st = $("#must-st", root).value; if (!date || a == null || b == null || b <= a) throw new Error("Pick a date and a valid time."); await dbInsert(T.must_work, [{ employee_id, date, start_min: a, end_min: b, store: st, note: null }]); await refresh(["must_work"]); await rebuildAffected(date, date); render(); }, "Pinned; week rebuilt."));
  // week tools
  on("#rebuild", () => rebuildSheet(state.week));
  on("#goback", () => guard(async () => { const snap = state.data.snapshots.filter((s) => s.week_start === state.week && s.kind === "auto").sort(by((s) => -new Date(s.created_at).getTime()))[0]; if (!snap) return; await restoreSnapshot(snap); render(); }, "Restored the previous version."));
  on("#save-ver", () => { const c = openSheet(`<h3>Save this version</h3><p class="sub">Snapshots the week exactly as it is, so you can load it back later.</p><label class="lbl">Name</label><input class="field" id="vname" placeholder="e.g. Approved by Michael"><div class="actions"><button class="btn" id="no">Cancel</button><button class="btn primary" id="ok">Save</button></div>`); $("#no", c).onclick = closeSheet; $("#ok", c).onclick = () => guard(async () => { const name = $("#vname", c).value.trim() || "Saved version"; closeSheet(); await takeSnapshot(state.week, name, "saved"); render(); }, "Saved."); });
  $$("[data-load-snap]", root).forEach((b) => (b.onclick = () => { const s = state.data.snapshots.find((x) => x.id === b.dataset.loadSnap); confirmSheet("Load this version?", `The week is replaced with "${s.label}" (${(s.shifts || []).length} shifts). The current version is saved first so you can go back.`, "Load", () => guard(async () => { await restoreSnapshot(s); render(); }, "Loaded.")); }));
  $$("[data-del-snap]", root).forEach((b) => (b.onclick = () => guard(async () => { await dbDelete(T.snapshots, { id: b.dataset.delSnap }); await refresh(["snapshots"]); render(); }, "Deleted.")));
  on("#learn", () => learnSheet(state.week));
  // import
  on("#imp-preview", () => importPreview(root));
  // settings
  on("#save-settings", () => guard(async () => {
    const pin = $("#pin", root).value.trim() || SEED.pin, supervisor_email = $("#sup-email", root).value.trim(), names = $("#sup-names", root).value.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    const admin_pin = $("#admin-pin", root).value.trim(); if (!/^d{4}$/.test(admin_pin)) throw new Error("Admin PIN must be 4 digits.");
    const ai_pin = $("#ai-pin-set", root).value.trim(); if (!/^d{4,8}$/.test(ai_pin)) throw new Error("AI password must be 4 to 8 digits.");
    await saveSetting("pin", pin); await saveSetting("admin_pin", admin_pin); await saveSetting("ai_pin", ai_pin); await saveSetting("supervisor_email", supervisor_email); await saveSetting("supervisor_names", names.length ? names : SEED.supervisor_names); render();
  }, "Saved."));
  on("#test-email", async () => { const te = $("#test-email", root); te.disabled = true; const r = await sendEmail([state.data.settings.supervisor_email], "Le Parfumier schedule: test email", "If you can read this, approval emails are working."); te.disabled = false; if (r.error) toast("Not sent: " + r.error + (/RESEND_API_KEY/.test(r.error) ? ". Add the RESEND_API_KEY secret in Supabase → Edge Functions → Secrets." : ""), "err"); else if (r.skipped) toast("Skipped: " + r.skipped, "warn"); else toast("Sent. Check the inbox.", "ok"); });
}

// ------------------------------------------------------------ rebuild sheet
function rebuildSheet(ws) {
  const locked = weekShifts(ws).filter((s) => s.locked);
  const res = solveWeek(ws, locked);
  if (!res.options.length) return toast("Nothing could be built for that week.", "err");
  const opts = res.options.slice(0, 2);
  const cards = opts.map((o, i) => {
    const sm = optionSummary(o, ws), diff = i ? optionDiff(opts[0], o) : [];
    return `<button class="choice opt" data-opt="${i}"><span style="flex:1"><b>Option ${i + 1}${i === 0 ? " · best score" : ""}</b><small>${sm.gaps ? `${sm.gaps} gap${sm.gaps > 1 ? "s" : ""} (${fmtHours(sm.gapMin)} uncovered)` : "every hour covered"} · ${sm.fills} solver fill${sm.fills === 1 ? "" : "s"} · ${sm.flags} compromise${sm.flags === 1 ? "" : "s"} · hours spread ${fmtHours(sm.spread)}</small>${i ? `<small style="margin-top:6px">Differs from Option 1:<br>${diff.slice(0, 8).map(esc).join("<br>") || "identical arrangement"}${diff.length > 8 ? `<br>…and ${diff.length - 8} more` : ""}</small>` : ""}</span><span class="mono">score ${Math.round(o.score)}</span></button>`;
  }).join("");
  const c = openSheet(`<h3>Rebuild ${esc(weekLabel(ws))}</h3><p class="sub">${locked.length} locked shift${locked.length === 1 ? "" : "s"} kept. ${opts.length > 1 ? "Two arrangements fit; pick one." : "Only one arrangement fits the rules."} The current version is saved first, so you can go back.</p>${cards}<div class="actions"><button class="btn" id="no">Cancel</button></div>`);
  $("#no", c).onclick = closeSheet;
  $$("[data-opt]", c).forEach((b) => (b.onclick = async () => { const o = opts[Number(b.dataset.opt)]; closeSheet(); try { await applyWeek(ws, o.shifts, `Before rebuild (chose option ${Number(b.dataset.opt) + 1})`); render(); toast(`Rebuilt with option ${Number(b.dataset.opt) + 1}. ${weekIssues(ws).length} flag(s).`, "ok"); } catch (e) { toast(e.message, "err"); } }));
}
// -------------------------------------------------------------- learn sheet
function learnSheet(ws) {
  const changes = learnDiff(ws);
  const real = changes.filter((c) => c.type !== "skip");
  if (!changes.length) return toast("No manual edits differ from the template this week.", "warn");
  const c = openSheet(`<h3>Learn from ${esc(weekLabel(ws))}</h3><p class="sub">Each ticked line becomes part of the weekly template. Untick one-offs (someone covering just this once). Swaps and must-work pins are never learned.</p>
    ${changes.map((ch, i) => `<label class="check"><input type="checkbox" data-ch="${i}" ${ch.type === "skip" ? "disabled" : "checked"}> <span class="${ch.type === "skip" ? "dim" : ""}">${esc(ch.text)}</span></label>`).join("")}
    <label class="lbl">Why (optional, kept in the log)</label><input class="field" id="lnote" placeholder="e.g. Mary prefers Tuesdays off from now on">
    ${supNameField()}
    <label class="check" style="margin-top:8px"><input type="checkbox" id="lrebuild" checked> Rebuild the following weeks with the new template (locked shifts stay)</label>
    <div class="actions"><button class="btn" id="no">Cancel</button><button class="btn primary" id="ok" ${real.length ? "" : "disabled"}>Learn ${real.length} change${real.length === 1 ? "" : "s"}</button></div>`);
  $("#no", c).onclick = closeSheet;
  $("#ok", c).onclick = async () => {
    const name = readSupName(c); if (!name) return;
    const picked = $$("[data-ch]:checked", c).map((i) => changes[Number(i.dataset.ch)]).filter((ch) => ch.type !== "skip");
    const note = $("#lnote", c).value.trim(), rebuild = $("#lrebuild", c).checked; closeSheet();
    try {
      await applyLearn(ws, picked, note);
      // the edited shifts are now the template: mark them so they no longer count as manual
      const manual = weekShifts(ws).filter((s) => s.source === "manual"); for (const s of manual) await dbUpdate(T.shifts, { id: s.id }, { source: "template" });
      await refresh(["shifts"]);
      let n = 0; if (rebuild) n = await rebuildAffected(addDays(ws, 7), weeksList()[WEEKS_AHEAD]);
      render(); toast(`Learned ${picked.length} change(s).${n ? ` ${n} following week(s) rebuilt.` : ""}`, "ok");
    } catch (e) { toast(e.message, "err"); }
  };
}
// ------------------------------------------------------------- import flow
function importPreview(root) {
  const text = $("#imp-text", root).value; if (!text.trim()) return;
  const res = parseSheet(text), box = $("#imp-result", root);
  const known = (name) => state.data.employees.find((e) => e.name.toLowerCase() === name.toLowerCase());
  box.innerHTML = `
    ${res.errors.length ? `<div class="card attn small" style="margin-top:12px"><b>Couldn't read everything</b><ul style="margin:6px 0 0 18px;padding:0">${res.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    ${res.people.length ? `<div class="mwrap" style="margin-top:12px"><table class="plain"><thead><tr><th>Name</th><th>Stores</th>${DOW.map((d) => `<th>${d}</th>`).join("")}<th>Time off</th><th>Needs to work</th></tr></thead><tbody>${res.people.map((p) => `<tr><td><b>${esc(p.name)}</b>${known(p.name) ? "" : ' <span class="pill iris">new</span>'}</td><td class="mono small">${p.stores.join(" ") || "—"}</td>${DOW.map((d, i) => { const a = p.days[i + 1]; return `<td class="small mono">${a ? fmtRange(a.start_min, a.end_min) + (a.store ? " " + a.store : "") : '<span class="dim">off</span>'}</td>`; }).join("")}<td class="small">${p.time_off.map(fmtMonthDay).join(", ")}</td><td class="small">${p.must_work.map((m) => fmtMonthDay(m.date) + " " + fmtRange(m.start_min, m.end_min)).join(", ")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="dim small" style="margin-top:12px">No people found.</p>`}
    ${res.storeHours.length ? `<p class="small muted" style="margin-top:8px">Store hours found for: ${res.storeHours.map((s) => s.code).join(", ")}</p>` : ""}
    ${res.people.length ? `<div class="card" style="margin-top:12px"><label class="lbl">Use this as</label>
      <label class="check"><input type="radio" name="imp-mode" value="template" checked> <span><b>The weekly template</b><br><span class="small muted">Replaces the weekly availability of the people listed. New names are added to the team.</span></span></label>
      <label class="check"><input type="radio" name="imp-mode" value="period"> <span><b>Special availability for a date range</b><br><span class="small muted">Keeps the template; inside the dates the solver uses this instead.</span></span></label>
      <div class="field-row" id="imp-dates" style="display:none"><div><label class="lbl">From</label><input class="field" id="imp-from" type="date"></div><div><label class="lbl">To</label><input class="field" id="imp-to" type="date"></div></div>
      <label class="check"><input type="checkbox" id="imp-off" checked> Also add the time-off dates</label>
      <label class="check"><input type="checkbox" id="imp-must" checked> Also add the needs-to-work shifts</label>
      ${res.storeHours.length ? `<label class="check"><input type="checkbox" id="imp-hours"> Also replace the regular store hours</label>` : ""}
      <div class="actions"><button class="btn primary" id="imp-apply">Apply and rebuild</button></div></div>` : ""}`;
  $$('input[name="imp-mode"]', box).forEach((r) => (r.onchange = () => { $("#imp-dates", box).style.display = r.value === "period" && r.checked ? "grid" : "none"; }));
  const apply = $("#imp-apply", box); if (apply) apply.onclick = async () => {
    apply.disabled = true;
    try {
      const mode = $('input[name="imp-mode"]:checked', box).value, from = ($("#imp-from", box) || {}).value, to = ($("#imp-to", box) || {}).value;
      if (mode === "period" && (!from || !to || to < from)) throw new Error("Pick the from and to dates for the special period.");
      let minD = mode === "period" ? from : weeksList()[0], maxD = mode === "period" ? to : weeksList()[WEEKS_AHEAD];
      for (const p of res.people) {
        let e = known(p.name);
        if (!e) { const id = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); [e] = await dbInsert(T.employees, [{ id, name: p.name, stores: p.stores, home_store: p.stores[0] || null, role: "staff", flex: !Object.keys(p.days).length, active: true, sort: 500, pin: randPin() }]); }
        else if (p.stores.length && p.stores.some((s) => !worksStore(e, s))) await dbUpdate(T.employees, { id: e.id }, { stores: Array.from(new Set([...(e.stores || []), ...p.stores])) });
        const pattern = {}; Object.entries(p.days).forEach(([d, a]) => { pattern[d] = { start_min: a.start_min, end_min: a.end_min, store: a.store || p.stores[0] || e.home_store || "PL" }; });
        if (mode === "template") { await dbDelete(T.availability, { employee_id: e.id }); const rows = Object.entries(pattern).map(([dow, a]) => ({ employee_id: e.id, dow: Number(dow), ...a })); if (rows.length) await dbInsert(T.availability, rows); }
        else await dbInsert(T.avail_periods, [{ employee_id: e.id, label: "Imported " + fmtRangeDates(from, to), date_from: from, date_to: to, pattern }]);
        if ($("#imp-off", box).checked) for (const d of p.time_off) { await dbUpsert(T.time_off, [{ employee_id: e.id, date: d, note: "Imported" }], "employee_id,date"); minD = Math.min(minD, d) ? (d < minD ? d : minD) : minD; if (d > maxD) maxD = d; }
        if ($("#imp-must", box).checked) for (const m of p.must_work) { if (!state.data.must_work.some((x) => x.employee_id === e.id && x.date === m.date)) await dbInsert(T.must_work, [{ employee_id: e.id, date: m.date, start_min: m.start_min, end_min: m.end_min, store: m.store, note: "Imported" }]); if (m.date < minD) minD = m.date; if (m.date > maxD) maxD = m.date; }
      }
      const ih = $("#imp-hours", box); if (ih && ih.checked) { const cur = stores().map((s) => { const f = res.storeHours.find((x) => x.code === s.code); return f ? { ...s, hours: f.hours } : s; }); await saveSetting("stores", cur); }
      await refresh(["employees", "availability", "avail_periods", "time_off", "must_work"]);
      const n = await rebuildAffected(minD, maxD); render(); toast(`Imported ${res.people.length} people. ${n} week(s) rebuilt.`, "ok");
    } catch (e) { toast(e.message, "err"); apply.disabled = false; }
  };
}

// ============================================================ lock + picker
function renderPicker() {
  const grid = $("#picker-grid"), list = emps();
  grid.innerHTML = list.map((e) => `<button class="pick ${e.role === "supervisor" ? "sup" : ""}" data-pick="${esc(e.id)}"><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><b>${esc(e.name)}</b><small>${e.role === "supervisor" ? "MANAGER" : (e.stores || []).join(" · ") || "—"}</small></button>`).join("") || `<div class="empty">No employees yet.</div>`;
  $$("[data-pick]", grid).forEach((b) => (b.onclick = () => pinSheet(emp(b.dataset.pick))));
  $("#picker-status").textContent = state.offline ? "This device only · cloud tables not found (see Manage → Settings)" : "";
}
function pinSheet(e) {
  if (!e) return;
  const adminPin = String(state.data.settings.admin_pin || "1212");
  const c = openSheet(`<h3>${esc(firstName(e.name))}, your PIN</h3><p class="sub">${e.role === "supervisor" ? "The manager PIN." : "Your own 4-digit code. Ask the manager if you don't know it. The admin PIN opens any name."}</p><input class="lock-input" id="pin-in" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" aria-label="PIN"><p class="lock-error" id="pin-err"></p><div class="actions"><button class="btn" id="no">Back</button><button class="btn primary" id="ok">Open</button></div>`);
  const tryIt = () => { const v = $("#pin-in", c).value.trim(); if ((e.pin && v === String(e.pin)) || v === adminPin) { closeSheet(); setMe(e); } else { $("#pin-err", c).textContent = "That's not it."; $("#pin-in", c).value = ""; c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); } };
  $("#no", c).onclick = closeSheet; $("#ok", c).onclick = tryIt;
  $("#pin-in", c).addEventListener("keydown", (ev) => { if (ev.key === "Enter") tryIt(); });
  $("#pin-in", c).addEventListener("input", () => { if ($("#pin-in", c).value.length === 4) tryIt(); });
  setTimeout(() => $("#pin-in", c).focus(), 50);
}
function setMe(e) {
  if (!e) return;
  state.me = e;
  try { sessionStorage.setItem(KEYS.me, e.id); } catch (err) {}
  $("#picker").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#whoami-name").textContent = firstName(e.name);
  const av = $("#whoami-av"); av.textContent = initials(e.name); av.style.setProperty("--ac", colorFor(e.name));
  if (!location.hash || (location.hash === "#admin" && !isSup())) location.hash = "#mine";
  state.month = today().slice(0, 7); state.year = Number(today().slice(0, 4));
  route();
}
function switchPerson() {
  state.me = null; try { sessionStorage.removeItem(KEYS.me); } catch (e) {}
  $("#app").classList.add("hidden"); renderPicker(); $("#picker").classList.remove("hidden");
}
function tryUnlock() {
  const v = $("#lock-input").value.trim(), pin = String(state.data.settings.pin || SEED.pin);
  if (v === pin) { state.unlocked = true; try { localStorage.setItem(KEYS.unlocked, "1"); } catch (e) {} $("#lock").classList.add("hidden"); renderPicker(); $("#picker").classList.remove("hidden"); }
  else { $("#lock-error").textContent = "That's not it. Ask the manager for the store code."; $("#lock-input").value = ""; const c = $(".lock-card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); }
}

// ================================================================== boot
async function boot() {
  $("#rail-ver").textContent = "v" + APP_VERSION;
  try { state.supName = sessionStorage.getItem(KEYS.supName) || null; } catch (e) {}
  try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { sb = null; }
  try { if (!sb) throw new Error("supabase-js failed to load"); await loadAll(); }
  catch (e) { console.warn("Cloud unavailable, using this device only:", e); state.offline = true; state.cloudError = e.message || String(e); await loadAll(); }
  try { await seedIfEmpty(); await migrate(); } catch (e) { console.error(e); toast("Couldn't seed: " + e.message, "err"); }
  try { await ensureWeeks(); await reconcileOffApprovals(); } catch (e) { console.error(e); toast("Couldn't build the weeks: " + e.message, "err"); }
  state.week = mondayOf(today()); state.month = today().slice(0, 7); state.year = Number(today().slice(0, 4)); state.loaded = true;

  $("#lock-btn").onclick = tryUnlock;
  $("#lock-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  $("#whoami").onclick = switchPerson;
  $("#theme-btn").onclick = () => { const light = document.documentElement.getAttribute("data-theme") === "light"; if (light) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", "light"); try { localStorage.setItem(KEYS.theme, light ? "dark" : "light"); } catch (e) {} };
  $$(".rail-btn").forEach((b) => (b.onclick = () => go(b.dataset.route)));
  window.addEventListener("hashchange", route);

  let unlocked = false; try { unlocked = localStorage.getItem(KEYS.unlocked) === "1"; } catch (e) {}
  if (unlocked) {
    state.unlocked = true; $("#lock").classList.add("hidden");
    let meId = null; try { meId = sessionStorage.getItem(KEYS.me); } catch (e) {}
    if (meId && emp(meId)) setMe(emp(meId)); else { renderPicker(); $("#picker").classList.remove("hidden"); }
  } else setTimeout(() => $("#lock-input").focus(), 400);

  if (!state.offline && sb) {
    let t = null;
    const bump = () => { clearTimeout(t); t = setTimeout(async () => { try { await refresh(["shifts", "swaps", "notes", "off_requests", "employees", "settings", "snapshots"]); if (await reconcileOffApprovals()) await refresh(["shifts", "snapshots"]); if (state.me) { state.me = emp(state.me.id) || state.me; if (!$("#sheet").classList.contains("hidden")) return; render(); } } catch (e) {} }, 400); };
    const ch = sb.channel("lps-live");
    [T.shifts, T.swaps, T.notes, T.off_requests].forEach((table) => ch.on("postgres_changes", { event: "*", schema: "public", table }, bump));
    ch.subscribe();
    setInterval(bump, 60000); // belt and braces if realtime isn't enabled on a table
  }
}
boot();
