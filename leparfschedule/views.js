// Le Parfumier: SCHEDULE — staff-facing views, sheets, swap and time-off flows.
"use strict";

// ============================================================ notifications
async function notify(empIds, kind, title, body, swapId, offId) {
  const rows = Array.from(new Set(empIds.filter(Boolean))).map((employee_id) => ({ employee_id, kind, title, body, swap_id: swapId || null, off_id: offId || null, read: false }));
  if (rows.length) await dbInsert(T.notes, rows);
}
// decide = { kind: "off" | "swap", id } adds signed Approve / Decline buttons to the email.
async function sendEmail(to, subject, text, hash = "#requests", decide = null) {
  const recipients = Array.from(new Set(to.filter((x) => x && x.includes("@"))));
  if (!recipients.length) return { skipped: "no address" };
  const link = location.origin + location.pathname + hash;
  if (state.offline || !sb) return { skipped: "offline" };
  try {
    const { data, error } = await sb.functions.invoke(NOTIFY_FN, { body: { to: recipients, subject, text, app: link, decide } });
    if (error) { let detail = ""; try { const body = error.context && error.context.json ? await error.context.json() : null; detail = body && body.error ? String(body.error) : ""; } catch (_) {} throw new Error(detail || error.message || String(error)); }
    return data || { ok: true };
  } catch (e) { console.warn("email not sent", e); return { error: String(e.message || e) }; }
}
const supervisorAddresses = () => [state.data.settings.supervisor_email, ...supervisors().map((s) => s.email)];
function unreadForMe() { return state.me ? state.data.notes.filter((n) => n.employee_id === state.me.id && !n.read) : []; }
function swapsNeedingMe() {
  if (!state.me) return [];
  return state.data.swaps.filter((s) => (s.status === "pending_peer" && s.to_employee === state.me.id) || (s.status === "pending_supervisor" && isSup()));
}
function offNeedingMe() { return isSup() ? state.data.off_requests.filter((o) => o.status === "pending") : []; }
function mySwaps() {
  if (!state.me) return [];
  return state.data.swaps.filter((s) => isSup() || s.from_employee === state.me.id || s.to_employee === state.me.id).sort(by((s) => -new Date(s.created_at).getTime()));
}
async function markRead() {
  const un = unreadForMe(); if (!un.length) return;
  for (const n of un) await dbUpdate(T.notes, { id: n.id }, { read: true });
  await refresh(["notes"]); render();
}

// ============================================================ status dots
// One colour per stage, used on request cards and on the shift chips they touch:
// orange = waiting on the colleague, blue = waiting on the manager, red = declined,
// green = approved, grey = withdrawn.
const DOT = { pending_peer: ["ochre", "waiting on colleague"], pending_supervisor: ["sky", "waiting on manager"], approved: ["moss", "approved"], declined_peer: ["vermilion", "declined by colleague"], declined_supervisor: ["vermilion", "declined by manager"], cancelled: ["grey", "withdrawn"], pending: ["ochre", "waiting on manager"], declined: ["vermilion", "declined"] };
function dot(status, extra = "") { const [c, t] = DOT[status] || ["grey", status]; return `<i class="dot ${c} ${extra}" title="${esc(t)}"></i>`; }
function statusPill(status) { const [c, t] = DOT[status] || ["grey", status]; return `<span class="pill ${c === "sky" ? "sky" : c === "ochre" ? "warn" : c === "moss" ? "good" : c === "vermilion" ? "bad" : ""}">${dot(status)} ${t}</span>`; }
function shiftDot(s) {
  const recent = addDays(today(), -14);
  const sw = state.data.swaps.filter((x) => (x.from_shift_id === s.id || x.to_shift_id === s.id) && (["pending_peer", "pending_supervisor"].includes(x.status) || (x.status.startsWith("declined") && x.created_at.slice(0, 10) >= recent))).sort(by((x) => -new Date(x.created_at).getTime()))[0];
  return sw ? dot(sw.status) : "";
}

// ================================================================ swap flow
async function createSwap({ toEmp, fromShift, toShift, message }) {
  const kind = fromShift && toShift ? "swap" : "cover";
  const row = { from_employee: state.me.id, to_employee: toEmp.id, from_shift_id: fromShift ? fromShift.id : null, to_shift_id: toShift ? toShift.id : null, kind, message: message || null, status: "pending_peer", from_snapshot: fromShift ? clone(fromShift) : null, to_snapshot: toShift ? clone(toShift) : null };
  const [saved] = await dbInsert(T.swaps, [row]);
  const what = fromShift && toShift ? `switch ${describeShift(fromShift)} for your ${describeShift(toShift)}` : fromShift ? `cover their shift ${describeShift(fromShift)}` : `take your shift ${describeShift(toShift)}`;
  await notify([toEmp.id], "swap_ask", `${firstName(state.me.name)} asks you to ${fromShift && toShift ? "switch shifts" : fromShift ? "cover a shift" : "hand over a shift"}`, `${state.me.name} would like to ${what}.${message ? " “" + message + "”" : ""}`, saved.id);
  await refresh(["swaps", "notes"]);
  toast(`Sent to ${firstName(toEmp.name)}. They'll see it when they open the schedule.`, "ok");
}
function swapText(swap) {
  const from = ename(swap.from_employee), to = ename(swap.to_employee), a = swap.from_snapshot, b = swap.to_snapshot;
  if (a && b) return `${from} gives ${describeShift(a)} and takes ${to}'s ${describeShift(b)}.`;
  if (a) return `${to} covers ${from}'s shift: ${describeShift(a)}.`;
  return `${from} takes ${to}'s shift: ${describeShift(b)}.`;
}
async function peerRespond(swap, ok) {
  const from = emp(swap.from_employee), to = emp(swap.to_employee);
  if (!ok) {
    await dbUpdate(T.swaps, { id: swap.id }, { status: "declined_peer", peer_at: new Date().toISOString() });
    await notify([swap.from_employee], "swap_peer_no", `${firstName(to.name)} declined your request`, `${to.name} can't do it: ${swapText(swap)} You can ask someone else from Requests.`, swap.id);
  } else {
    await dbUpdate(T.swaps, { id: swap.id }, { status: "pending_supervisor", peer_at: new Date().toISOString() });
    const text = swapText(swap);
    await notify([swap.from_employee], "swap_peer_ok", `${firstName(to.name)} said yes`, `Waiting on the manager's approval. ${text}`, swap.id);
    await notify(supervisors().map((s) => s.id), "swap_approve_needed", `Approve: ${firstName(from.name)} ↔ ${firstName(to.name)}`, text, swap.id);
    const r = await sendEmail(supervisorAddresses(), `Schedule change needs your approval: ${from.name} & ${to.name}`, `${to.name} agreed to a request from ${from.name}.\n\n${text}`, "#requests", { kind: "swap", id: swap.id });
    toast(r && (r.error || r.skipped) ? "Accepted. The manager will see it in the app (email not configured yet)." : "Accepted. The manager has been emailed for approval.", r && (r.error || r.skipped) ? "warn" : "ok");
  }
  await refresh(["swaps", "notes"]);
}
async function supervisorDecide(swap, approve, note, byName) {
  const now = new Date().toISOString();
  if (!approve) {
    await dbUpdate(T.swaps, { id: swap.id }, { status: "declined_supervisor", decided_at: now, decided_by: state.me.id, decided_by_name: byName, supervisor_note: note || null });
    await notify([swap.from_employee, swap.to_employee], "swap_declined", "Schedule change declined", `${byName} declined: ${swapText(swap)}${note ? " — “" + note + "”" : ""}`, swap.id);
  } else {
    const a = swap.from_shift_id ? shiftById(swap.from_shift_id) : null, b = swap.to_shift_id ? shiftById(swap.to_shift_id) : null;
    if ((swap.from_shift_id && !a) || (swap.to_shift_id && !b)) { toast("One of those shifts no longer exists. Decline this and ask them to redo it.", "err"); return; }
    if (a) await dbUpdate(T.shifts, { id: a.id }, { employee_id: swap.to_employee, locked: true, source: "swap", note: `Swap approved by ${byName} ${now.slice(0, 10)}`, updated_at: now });
    if (b) await dbUpdate(T.shifts, { id: b.id }, { employee_id: swap.from_employee, locked: true, source: "swap", note: `Swap approved by ${byName} ${now.slice(0, 10)}`, updated_at: now });
    await dbUpdate(T.swaps, { id: swap.id }, { status: "approved", decided_at: now, decided_by: state.me.id, decided_by_name: byName, supervisor_note: note || null });
    await notify([swap.from_employee, swap.to_employee], "swap_approved", "Schedule change approved", `${byName} approved: ${swapText(swap)} The schedule is updated.`, swap.id);
    sendEmail([emp(swap.from_employee), emp(swap.to_employee)].map((e) => e && e.email), "Your schedule change was approved", swapText(swap) + "\nThe schedule is updated.");
  }
  await refresh(["swaps", "notes", "shifts"]);
  toast(approve ? "Approved. The schedule is updated." : "Declined.", approve ? "ok" : "");
}
async function cancelSwap(swap) {
  await dbUpdate(T.swaps, { id: swap.id }, { status: "cancelled", decided_at: new Date().toISOString() });
  await notify([swap.to_employee], "swap_cancelled", `${firstName(state.me.name)} withdrew a request`, swapText(swap), swap.id);
  await refresh(["swaps", "notes"]);
}
// after a decline: same shifts, a different colleague
async function reRequest(swap, toEmpId) {
  const toEmp = emp(toEmpId); if (!toEmp) return;
  const fromShift = swap.from_shift_id ? shiftById(swap.from_shift_id) : null, toShift = swap.to_shift_id ? shiftById(swap.to_shift_id) : null;
  if ((swap.from_shift_id && !fromShift) || (swap.to_shift_id && !toShift)) return toast("That shift no longer exists. Start a new request from your schedule.", "err");
  if (toShift && toShift.employee_id !== toEmpId) return toast("Only the person who owns that shift can be asked for it.", "err");
  await createSwap({ toEmp, fromShift, toShift, message: swap.message });
}

// ============================================================ time off flow
async function createOffRequest({ kind, from, to, reason }) {
  const [saved] = await dbInsert(T.off_requests, [{ employee_id: state.me.id, kind, date_from: from, date_to: to, reason: reason || null, status: "pending" }]);
  const what = `${kind === "pto" ? "PTO" : "block-out"} ${fmtRangeDates(from, to)}${reason ? " — “" + reason + "”" : ""}`;
  await notify(supervisors().map((s) => s.id), "off_approve_needed", `${firstName(state.me.name)} asks for ${kind === "pto" ? "PTO" : "a block-out"}`, `${state.me.name}: ${what}`, null, saved.id);
  await sendEmail(supervisorAddresses(), `${kind === "pto" ? "PTO" : "Block-out"} request from ${state.me.name}`, `${state.me.name} asks for ${what}.`, "#requests", { kind: "off", id: saved.id });
  await refresh(["off_requests", "notes"]);
  toast("Sent to the manager for approval.", "ok");
}
async function decideOff(req, approve, byName, note) {
  const now = new Date().toISOString();
  await dbUpdate(T.off_requests, { id: req.id }, { status: approve ? "approved" : "declined", decided_at: now, decided_by: state.me.id, decided_by_name: byName, supervisor_note: note || null });
  await refresh(["off_requests"]);
  const what = `${req.kind === "pto" ? "PTO" : "block-out"} ${fmtRangeDates(req.date_from, req.date_to)}`;
  await notify([req.employee_id], approve ? "off_approved" : "off_declined", `${approve ? "Approved" : "Declined"}: ${what}`, `${byName} ${approve ? "approved" : "declined"} your ${what}.${note ? " “" + note + "”" : ""}`, null, req.id);
  if (approve) {
    // re-solve the weeks it touches so their shifts get re-covered; locked shifts stay and are flagged
    let rebuilt = 0;
    for (let ws = mondayOf(req.date_from); ws <= mondayOf(req.date_to); ws = addDays(ws, 7)) if (weekShifts(ws).length) { await rebuildWeek(ws); rebuilt++; }
    const stuck = state.data.shifts.filter((s) => s.employee_id === req.employee_id && s.locked && inRange(s.date, req.date_from, req.date_to));
    toast(`Approved.${rebuilt ? ` ${rebuilt} week${rebuilt > 1 ? "s" : ""} rebuilt.` : ""}${stuck.length ? ` ${stuck.length} locked shift(s) still need a manual fix.` : ""}`, stuck.length ? "warn" : "ok");
  } else toast("Declined.");
  await refresh(["notes", "shifts"]);
}
async function withdrawOff(req) { await dbUpdate(T.off_requests, { id: req.id }, { status: "cancelled" }); await refresh(["off_requests"]); }

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
// Several people share the Manager login, so every approval records who did it.
function supNameField() {
  const cur = state.supName || "";
  return `<label class="lbl">Approving as</label><select class="field" id="supname"><option value="">— pick your name —</option>${supervisorNames().map((n) => `<option ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
}
function readSupName(card) {
  const v = ($("#supname", card) || {}).value || "";
  if (!v) { toast("Pick your name first so the approval is signed.", "err"); return null; }
  state.supName = v; try { sessionStorage.setItem(KEYS.supName, v); } catch (e) {}
  return v;
}
function shiftBox(s, who) {
  return `<div class="box"><div class="t">${fmtRange(s.start_min, s.end_min)} <span class="pill store s-${esc(s.store)}">${esc(store(s.store).name)}</span></div><div>${esc(fmtDate(s.date, true))}</div>${who ? `<div class="dim">${esc(who)}</div>` : ""}</div>`;
}
function colleagueSub(e, date) {
  const busy = shiftsOf(e.id).find((x) => x.date === date), off = isOff(e.id, date);
  return off ? `Has the day off (${offReason(e.id, date)})` : busy ? `Already on ${fmtRange(busy.start_min, busy.end_min)} at ${store(busy.store).name}` : availFor(e.id, date) ? "Usually works this day" : "Usually off this day";
}

// my own shift → ask a colleague to cover or switch
function myShiftSheet(s) {
  const colleagues = staff().filter((e) => e.id !== state.me.id && worksStore(e, s.store));
  let mode = "cover", pickEmp = null, pickShift = null;
  const c = openSheet(`
    <h3>Your shift</h3>
    <p class="sub">${esc(fmtDate(s.date, true))} · ${fmtRange(s.start_min, s.end_min)} at ${esc(store(s.store).name)} · ${fmtHours(shiftLen(s))}${s.locked ? " · <span class='lockmark'>🔒 locked</span>" : ""}</p>
    <div class="tabs"><button class="tab active" data-m="cover">Ask someone to cover it</button><button class="tab" data-m="swap">Switch with someone's shift</button></div>
    <label class="lbl">Who</label>
    <div id="who">${colleagues.map((e) => `<button class="choice" data-e="${esc(e.id)}" ${isOff(e.id, s.date) ? "disabled" : ""}><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><span><b>${esc(e.name)}</b><small>${esc(colleagueSub(e, s.date))}</small></span><span class="mono">${fmtHours(weekMinutes(e.id, s.week_start))} this wk</span></button>`).join("") || `<div class="empty">Nobody else works at ${esc(store(s.store).name)}.</div>`}</div>
    <div id="their" class="hidden"><label class="lbl">Which of their shifts do you take?</label><div id="their-list"></div></div>
    <label class="lbl">Message (optional)</label>
    <textarea class="field" id="msg" placeholder="e.g. Dentist appointment, happy to take a Saturday in return"></textarea>
    <div class="actions"><button class="btn" id="cancel">Close</button><button class="btn primary" id="send" disabled>Send request</button></div>`);
  const update = () => { $("#send", c).disabled = !pickEmp || (mode === "swap" && !pickShift); };
  const renderTheir = () => {
    const box = $("#their", c);
    if (mode !== "swap" || !pickEmp) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const theirs = shiftsOf(pickEmp.id).filter((x) => x.date >= today() && x.id !== s.id).sort(by((x) => x.date + toHHMM(x.start_min)));
    $("#their-list", c).innerHTML = theirs.map((x) => `<button class="choice ${pickShift && pickShift.id === x.id ? "sel" : ""}" data-s="${x.id}"><span><b>${esc(fmtDate(x.date, true))}</b><small>${fmtRange(x.start_min, x.end_min)} at ${esc(store(x.store).name)}${shiftsOf(state.me.id).some((m) => m.date === x.date && m.id !== s.id) ? " · you already work that day" : ""}${x.locked ? " · 🔒" : ""}</small></span><span class="mono">${fmtHours(shiftLen(x))}</span></button>`).join("") || `<div class="empty small">${esc(firstName(pickEmp.name))} has no upcoming shifts to switch with.</div>`;
    $$("[data-s]", c).forEach((b) => (b.onclick = () => { pickShift = shiftById(b.dataset.s); renderTheir(); update(); }));
  };
  $$(".tab", c).forEach((t) => (t.onclick = () => { $$(".tab", c).forEach((x) => x.classList.remove("active")); t.classList.add("active"); mode = t.dataset.m; pickShift = null; renderTheir(); update(); }));
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
// supervisor: edit / add a shift directly. Edits are marked "manual" so LEARN can pick them up.
function editShiftSheet(s, preset) {
  const isNew = !s;
  const hrs = (code, date) => storeHours(code, date) || [600, 1080];
  const v = s || { date: preset.date, employee_id: preset.employee_id || "", store: preset.store, start_min: hrs(preset.store, preset.date)[0], end_min: hrs(preset.store, preset.date)[1], locked: false, note: "" };
  const c = openSheet(`
    <h3>${isNew ? "Add a shift" : "Edit shift"}</h3>
    <p class="sub">${esc(fmtDate(v.date, true))}${s ? ` · ${esc(s.source)}${s.note ? " · " + esc(s.note) : ""}` : ""}</p>
    <label class="lbl">Who</label>
    <select class="field" id="e">${staff().map((e) => `<option value="${esc(e.id)}" ${e.id === v.employee_id ? "selected" : ""}>${esc(e.name)}${worksStore(e, v.store) ? "" : " (not set for " + esc(store(v.store).name) + ")"}</option>`).join("")}</select>
    <div class="field-row">
      <div><label class="lbl">Store</label><select class="field" id="st">${stores().map((x) => `<option value="${esc(x.code)}" ${x.code === v.store ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
      <div><label class="lbl">Date</label><input class="field" id="d" type="date" value="${esc(v.date)}"></div>
      <div><label class="lbl">Start</label><input class="field" id="a" type="time" step="900" value="${toHHMM(v.start_min)}"></div>
      <div><label class="lbl">End</label><input class="field" id="b" type="time" step="900" value="${toHHMM(v.end_min)}"></div>
    </div>
    <label class="check"><input type="checkbox" id="lk" ${v.locked ? "checked" : ""}> Lock it (a rebuild never moves a locked shift)</label>
    <label class="lbl">Note</label><input class="field" id="n" value="${esc(v.note || "")}" placeholder="optional">
    <p class="small muted">Manual edits are remembered as "manual" so <b>Learn from this week</b> (Week tools) can turn them into the new template.</p>
    <div class="actions">${isNew ? "" : `<button class="btn danger" id="del">Delete</button>`}<span class="grow"></span><button class="btn" id="cancel">Cancel</button><button class="btn primary" id="save">Save</button></div>`);
  $("#cancel", c).onclick = closeSheet;
  if (!isNew) $("#del", c).onclick = () => confirmSheet("Delete this shift?", describeShift(s), "Delete", async () => { await dbDelete(T.shifts, { id: s.id }); await refresh(["shifts"]); render(); toast("Deleted."); }, true);
  $("#save", c).onclick = async () => {
    const date = $("#d", c).value, start_min = fromHHMM($("#a", c).value), end_min = fromHHMM($("#b", c).value);
    if (!date || start_min == null || end_min == null || end_min <= start_min) return toast("End must be after start.", "err");
    const patch = { date, week_start: mondayOf(date), employee_id: $("#e", c).value, store: $("#st", c).value, start_min, end_min, locked: $("#lk", c).checked, note: $("#n", c).value.trim() || null, updated_at: new Date().toISOString() };
    try {
      if (isNew) await dbInsert(T.shifts, [{ ...patch, source: "manual" }]);
      else await dbUpdate(T.shifts, { id: s.id }, { ...patch, source: ["template", "fill", "manual"].includes(s.source) ? "manual" : s.source });
      await refresh(["shifts"]); closeSheet(); render(); toast("Saved.", "ok");
    } catch (e) { toast("Couldn't save: " + e.message, "err"); }
  };
}
function onShiftClick(s) {
  if (!state.me) return;
  if (isSup()) {
    const c = openSheet(`<h3>${esc(ename(s.employee_id))}</h3><p class="sub">${esc(describeShift(s))}${s.note ? " · " + esc(s.note) : ""}</p>
      <button class="choice" id="ed"><span><b>Edit or move this shift</b><small>Change person, time, store, lock or delete</small></span></button>
      <button class="choice" id="ask"><span><b>Start a swap on their behalf</b><small>Opens the same request a staff member would send</small></span></button>`);
    $("#ed", c).onclick = () => editShiftSheet(s);
    $("#ask", c).onclick = () => { const saved = state.me; state.me = emp(s.employee_id); myShiftSheet(s); const restore = () => (state.me = saved); $("#sheet-x").addEventListener("click", restore, { once: true }); $("#sheet-backdrop").addEventListener("click", restore, { once: true }); const send = $("#send"); if (send) send.addEventListener("click", () => setTimeout(restore, 50), { once: true }); const cancel = $("#cancel"); if (cancel) cancel.addEventListener("click", restore, { once: true }); };
    return;
  }
  if (s.employee_id === state.me.id) myShiftSheet(s); else theirShiftSheet(s);
}
function offRequestSheet(date) {
  let kind = "blockout", from = date, to = date, picking = false, view = date.slice(0, 7);
  const c = openSheet(`
    <h3>Ask for time off</h3>
    <p class="sub">Block-outs are days you can't work (appointments, school). PTO is paid time off. Both go to the manager for approval, and the schedule is rebuilt around them once approved.</p>
    <div class="tabs"><button class="tab active" data-k="blockout">Block out</button><button class="tab" data-k="pto">PTO</button></div>
    <label class="lbl">Days · tap the first day, then the last</label>
    <div class="rcal" id="rcal"></div>
    <p class="small muted" id="rsum" style="margin:8px 0 0"></p>
    <label class="lbl">Reason</label><input class="field" id="reason" placeholder="e.g. Family wedding" maxlength="140">
    <div class="actions"><button class="btn" id="cancel">Cancel</button><button class="btn primary" id="send">Send for approval</button></div>`);
  const drawCal = () => {
    const [y, m] = view.split("-").map(Number);
    const first = ymd(new Date(y, m - 1, 1)), last = ymd(new Date(y, m, 0)), t = today();
    const cells = []; for (let d = mondayOf(first); d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) cells.push(d);
    const canBack = view > t.slice(0, 7);
    const dayBtn = (d) => {
      const out = d < first || d > last, past = d < t;
      const cls = [out ? "out" : "", past ? "past" : "", d === from ? "a" : "", d === to ? "b" : "", d > from && d < to ? "in" : "", d === t ? "today" : ""].join(" ");
      return `<button type="button" class="rday ${cls}" data-rd="${d}" ${out || past ? "disabled" : ""}>${out ? "" : parseYmd(d).getDate()}</button>`;
    };
    $("#rcal", c).innerHTML = `<div class="rhead"><button type="button" class="btn sm" data-rm="-1" ${canBack ? "" : "disabled"}>‹</button><b>${MONTHS[m - 1]} ${y}</b><button type="button" class="btn sm" data-rm="1">›</button></div>
      <div class="rgrid">${DOW.map((d) => `<span class="rd">${d[0]}</span>`).join("")}${cells.map(dayBtn).join("")}</div>`;
    const n = daysBetween(from, to) + 1;
    $("#rsum", c).innerHTML = picking ? `From <b>${esc(fmtDate(from, true))}</b> — now tap the <b>last</b> day (tap it again for a single day).` : `<b>${esc(fmtRangeDates(from, to))}</b> · ${n} day${n === 1 ? "" : "s"}. Tap a day to start a new range.`;
    $$("[data-rm]", c).forEach((b) => (b.onclick = () => { const d = new Date(y, m - 1 + Number(b.dataset.rm), 1); view = d.getFullYear() + "-" + pad(d.getMonth() + 1); drawCal(); }));
    $$("[data-rd]", c).forEach((b) => (b.onclick = () => { const d = b.dataset.rd; if (!picking) { from = to = d; picking = true; } else { if (d < from) { to = from; from = d; } else to = d; picking = false; } drawCal(); }));
  };
  drawCal();
  $$(".tab", c).forEach((tb) => (tb.onclick = () => { $$(".tab", c).forEach((x) => x.classList.remove("active")); tb.classList.add("active"); kind = tb.dataset.k; }));
  $("#cancel", c).onclick = closeSheet;
  $("#send", c).onclick = async () => {
    if (picking) { to = from; picking = false; drawCal(); }
    $("#send", c).disabled = true;
    try { await createOffRequest({ kind, from, to, reason: $("#reason", c).value.trim() }); closeSheet(); render(); } catch (e) { toast(e.message, "err"); $("#send", c).disabled = false; }
  };
}

// ================================================================== render
function go(route) { if (location.hash !== route) location.hash = route; else render(); }
function route() {
  const known = ["#mine", "#week", "#master", "#requests", "#timeoff", "#admin"];
  const h = location.hash || "#mine";
  state.route = known.includes(h) ? h : "#mine";
  if (state.route === "#admin" && !isSup()) state.route = "#mine";
  render();
}
function updateBadges() {
  if (!state.me) return;
  $$(".rail-btn").forEach((b) => b.classList.toggle("active", b.dataset.route === state.route));
  $$(".admin-only").forEach((b) => (b.hidden = !isSup()));
  const need = swapsNeedingMe().length + unreadForMe().length;
  const rc = $("#req-count"); rc.hidden = !need; rc.textContent = need;
  const pend = state.data.swaps.filter((s) => s.status === "pending_supervisor").length + offNeedingMe().length;
  const ac = $("#admin-count"); ac.hidden = !(isSup() && pend); ac.textContent = pend;
}
// True while the manager is mid-edit somewhere a re-render would wipe (a form field with
// text, or the AI tab). Live updates only refresh the badges in that case.
function editingNow() {
  const a = document.activeElement;
  if (state.route === "#admin" && state.adminTab === "ai") return true;
  if (!$("#sheet").classList.contains("hidden")) return true;
  return !!(a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName) && a.id !== "lock-input");
}
function render() {
  if (!state.me) return;
  updateBadges();
  const view = { "#mine": renderMine, "#week": renderWeek, "#master": renderMaster, "#requests": renderRequests, "#timeoff": renderTimeOff, "#admin": renderAdmin }[state.route] || renderMine;
  const main = $("#main"); main.innerHTML = view(); wire(main);
}
function wire(root) {
  $$("[data-shift]", root).forEach((el) => (el.onclick = (ev) => { ev.stopPropagation(); const s = shiftById(el.dataset.shift); if (s) onShiftClick(s); }));
  $$("[data-week]", root).forEach((el) => (el.onclick = async () => { state.week = el.dataset.week === "today" ? mondayOf(today()) : addDays(state.week, Number(el.dataset.week)); render(); if (!weekShifts(state.week).length && state.week >= mondayOf(today()) && state.week <= addDays(today(), 400)) { try { if (await ensureRange(state.week, state.week)) render(); } catch (e) { console.warn(e); } } }));
  $$("[data-month]", root).forEach((el) => (el.onclick = () => { const [y, m] = state.month.split("-").map(Number); if (el.dataset.month === "today") state.month = today().slice(0, 7); else { const d = new Date(y, m - 1 + Number(el.dataset.month), 1); state.month = d.getFullYear() + "-" + pad(d.getMonth() + 1); } render(); ensureMonth(); }));
  $$("[data-year]", root).forEach((el) => (el.onclick = () => { const cur = state.toStart || defaultToStart(); if (el.dataset.year === "today") state.toStart = defaultToStart(); else { const [y, m] = cur.split("-").map(Number); const d = new Date(y, m - 1 + Number(el.dataset.year), 1); state.toStart = d.getFullYear() + "-" + pad(d.getMonth() + 1); } render(); }));
  $$("[data-mstore]", root).forEach((el) => (el.onclick = () => { state.masterStore = el.dataset.mstore; render(); }));
  $$("[data-go]", root).forEach((el) => (el.onclick = () => go(el.dataset.go)));
  $$("[data-add]", root).forEach((el) => (el.onclick = () => { const [employee_id, date, st] = el.dataset.add.split("|"); editShiftSheet(null, { employee_id, date, store: st }); }));
  $$("[data-swap-act]", root).forEach((el) => (el.onclick = () => swapAction(el.dataset.swapAct, el.dataset.id)));
  $$("[data-rereq]", root).forEach((el) => (el.onclick = async () => { const sel = $(`select[data-rereq-sel="${el.dataset.rereq}"]`, root); if (!sel || !sel.value) return toast("Pick someone first.", "err"); const s = state.data.swaps.find((x) => x.id === el.dataset.rereq); el.disabled = true; try { await reRequest(s, sel.value); render(); } catch (e) { toast(e.message, "err"); el.disabled = false; } }));
  $$("[data-reqtab]", root).forEach((el) => (el.onclick = () => { state.reqTab = el.dataset.reqtab; render(); }));
  $$("[data-admintab]", root).forEach((el) => (el.onclick = () => { state.adminTab = el.dataset.admintab; render(); }));
  $$("[data-offday]", root).forEach((el) => (el.onclick = () => offRequestSheet(el.dataset.offday)));
  $$("[data-off-act]", root).forEach((el) => (el.onclick = () => offAction(el.dataset.offAct, el.dataset.id)));
  if (state.route === "#admin") wireAdmin(root);
  if (["#requests", "#mine", "#timeoff"].includes(state.route) && unreadForMe().length) setTimeout(markRead, 2500);
}
async function ensureMonth() {
  const [y, m] = state.month.split("-").map(Number);
  const first = ymd(new Date(y, m - 1, 1)), last = ymd(new Date(y, m, 0));
  if (last < today() || first > addDays(today(), 400)) return;
  try { const built = await ensureRange(Math.max(first, mondayOf(today())), last); if (built) render(); } catch (e) { console.warn(e); }
}
function weekNav() {
  const cur = state.week === mondayOf(today());
  return `<div class="weeknav"><button class="btn sm" data-week="-7">‹</button><div class="wk">${esc(weekLabel(state.week))}<small>${cur ? "this week" : "week of " + fmtMonthDay(state.week)}</small></div><button class="btn sm" data-week="7">›</button>${cur ? "" : `<button class="btn sm ghost" data-week="today">Today</button>`}</div>`;
}
function chip(s, opts = {}) {
  const mine = state.me && s.employee_id === state.me.id;
  return `<div class="chip ${mine ? "mine" : ""} ${s.locked ? "locked" : ""} ${s.source === "fill" ? "fill" : ""}" data-shift="${s.id}" title="${esc(s.note || s.source)}"><span class="t">${fmtRange(s.start_min, s.end_min)}${s.locked ? ' <span class="lockmark">🔒</span>' : ""}${shiftDot(s)}</span>${opts.name ? `<span class="n">${esc(opts.short ? firstName(ename(s.employee_id)) : ename(s.employee_id))}</span>` : ""}${opts.store ? `<span class="n">${esc(store(s.store).name)}</span>` : ""}</div>`;
}
function offTag(empId, d) {
  const r = offReason(empId, d); if (r) return `<div class="chip off tag">${esc(r)}</div>`;
  const p = offRequestsFor(empId, d, "pending")[0]; if (p) return `<div class="chip off tag pend">${dot("pending")} ${p.kind === "pto" ? "PTO" : "block-out"} requested</div>`;
  return "";
}

// ---- Your schedule (month)
function renderMine() {
  const me = state.me, t = today();
  if (!state.month) state.month = t.slice(0, 7);
  const [y, m] = state.month.split("-").map(Number);
  const first = ymd(new Date(y, m - 1, 1)), last = ymd(new Date(y, m, 0));
  const gridStart = mondayOf(first), gridEnd = addDays(mondayOf(last), 6);
  const cells = []; for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);
  const mine = shiftsOf(me.id);
  const monthMin = mine.filter((s) => s.date >= first && s.date <= last).reduce((a, s) => a + shiftLen(s), 0);
  const upcoming = mine.filter((s) => s.date >= t).sort(by((s) => s.date + toHHMM(s.start_min)));
  const next = upcoming[0];
  const need = swapsNeedingMe(), offNeed = offNeedingMe(), unread = unreadForMe().filter((n) => !need.some((s) => s.id === n.swap_id) && !offNeed.some((o) => o.id === n.off_id));
  const isThis = state.month === t.slice(0, 7);
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Your schedule</div><h1>Hi, <em>${esc(firstName(me.name))}</em>.</h1>
      <p class="panel-sub">${next ? `Next up: ${esc(fmtDate(next.date, true))}, ${fmtRange(next.start_min, next.end_min)} at ${esc(store(next.store).name)}.` : "Nothing scheduled in the weeks that are built."} Tap any shift to ask a colleague to cover it or switch. Tap an empty day to ask for time off.</p></div>
      ${isSup() ? `<button class="btn" data-go="#admin">Manage</button>` : ""}</div>
    <div class="stats">
      <div class="stat"><b>${fmtHours(weekMinutes(me.id, mondayOf(t)))}</b><span>this week</span></div>
      <div class="stat"><b>${fmtHours(weekMinutes(me.id, addDays(mondayOf(t), 7)))}</b><span>next week</span></div>
      <div class="stat"><b>${fmtHours(monthMin)}</b><span>${esc(MONTHS[m - 1])}</span></div>
      <div class="stat"><b>${need.length + offNeed.length}</b><span>need your answer</span></div>
    </div>
    ${need.length || offNeed.length || unread.length ? `<h2 class="sec">Needs your attention</h2>${need.map(reqCard).join("")}${offNeed.map(offCard).join("")}${unread.map((n) => `<div class="card"><div class="row"><span class="pill iris">${esc(n.kind.replace(/_/g, " "))}</span><b>${esc(n.title)}</b><span class="grow"></span><span class="dim mono small">${esc(new Date(n.created_at).toLocaleDateString())}</span></div><p class="small muted" style="margin:6px 0 0">${esc(n.body || "")}</p></div>`).join("")}` : ""}
    <div class="row" style="justify-content:space-between;margin:26px 0 12px"><h2 class="sec" style="margin:0">${esc(MONTHS[m - 1])} <small>${y}</small></h2>
      <div class="weeknav"><button class="btn sm" data-month="-1">‹</button><button class="btn sm" data-month="1">›</button>${isThis ? "" : `<button class="btn sm ghost" data-month="today">Today</button>`}</div></div>
    <div class="mgrid head">${DOW.map((d) => `<div class="mh">${d}</div>`).join("")}</div>
    <div class="mgrid">${cells.map((d) => {
      const sh = mine.filter((s) => s.date === d).sort(by((s) => s.start_min)); const out = d < first || d > last, past = d < t;
      return `<div class="mday ${d === t ? "today" : ""} ${out ? "out" : ""} ${past ? "past" : ""}" ${!sh.length && !past ? `data-offday="${d}"` : ""}><div class="mn"><b>${parseYmd(d).getDate()}</b>${d === t ? "<i>today</i>" : ""}</div>${sh.map((s) => chip(s, { store: true })).join("")}${offTag(me.id, d)}${!sh.length && !offTag(me.id, d) && !past ? `<div class="mfree">off</div>` : ""}</div>`;
    }).join("")}</div>
    <div class="legend"><span>${dot("pending_peer")} waiting on colleague</span><span>${dot("pending_supervisor")} waiting on manager</span><span>${dot("declined_peer")} declined</span><span>${dot("approved")} approved</span><span>🔒 locked</span></div>
  </section>`;
}
// ---- Your week
function renderWeek() {
  const me = state.me, days = weekDays(state.week), mins = weekMinutes(me.id, state.week);
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Your week</div><h1>${fmtHours(mins)} <em>scheduled</em></h1><p class="panel-sub">${weekShifts(state.week).filter((s) => s.employee_id === me.id).length} shifts. Tap one to ask for a cover or a switch.</p></div>${weekNav()}</div>
    <div class="wgrid">${days.map((d) => {
      const sh = weekShifts(state.week).filter((s) => s.employee_id === me.id && s.date === d).sort(by((s) => s.start_min));
      return `<div class="wday ${d === today() ? "today" : ""}"><div class="wd"><span>${esc(dowName(d))}</span><b>${parseYmd(d).getDate()}</b></div>${sh.length ? sh.map((s) => chip(s, { store: true })).join("") : offTag(me.id, d) || `<div class="chip off" data-offday="${d}" style="cursor:pointer">Off</div>`}</div>`;
    }).join("")}</div>
  </section>`;
}
// ---- Master
function renderMaster() {
  const days = weekDays(state.week), issues = weekIssues(state.week).filter((i) => i.sev !== "info"), shown = stores().filter((s) => state.masterStore === "all" || s.code === state.masterStore);
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Master schedule</div><h1>Everyone, <em>every store</em></h1><p class="panel-sub">Tap your own shift to ask for a cover; tap someone else's to ask to take it. ${isSup() ? "As manager you can edit any cell, then use Week tools → Learn to make the edits permanent." : ""}</p></div>${weekNav()}</div>
    <div class="tabs"><button class="tab ${state.masterStore === "all" ? "active" : ""}" data-mstore="all">All stores</button>${stores().map((s) => `<button class="tab ${state.masterStore === s.code ? "active" : ""}" data-mstore="${esc(s.code)}">${esc(s.name)}</button>`).join("")}</div>
    ${!isSup() ? "" : issues.length ? `<div class="card attn" style="margin-bottom:22px"><div class="row"><span class="pill warn">${issues.length} flag${issues.length > 1 ? "s" : ""} this week</span><span class="small muted">Compromises the solver had to make, or things only a person can decide.</span></div><ul class="small" style="margin:8px 0 0 18px;padding:0">${issues.slice(0, 12).map((i) => `<li>${esc(i.text)}</li>`).join("")}${issues.length > 12 ? `<li class="dim">…and ${issues.length - 12} more</li>` : ""}</ul></div>` : `<div class="row" style="margin-bottom:22px"><span class="pill good">Every open hour is covered and everyone is within limits</span></div>`}
    ${shown.map((st) => {
      const people = staff().filter((e) => worksStore(e, st.code) || weekShifts(state.week).some((s) => s.employee_id === e.id && s.store === st.code));
      const rows = people.filter((e) => weekShifts(state.week).some((s) => s.employee_id === e.id && s.store === st.code) || e.home_store === st.code);
      return `<div class="storeblk"><div class="storehead"><span class="pill store s-${esc(st.code)}">${esc(st.code)}</span><h2>${esc(st.name)}</h2><span class="hrs">${esc(hoursSummary(st))}</span>${days.some((d) => hoursOverrideFor(st.code, d)) ? `<span class="pill warn">temporary hours this week</span>` : ""}</div>
      <div class="mwrap"><table class="master"><thead><tr><th>Team</th>${days.map((d) => `<th class="${d === today() ? "today" : ""}">${esc(dowName(d))} <span class="dim">${parseYmd(d).getDate()}</span>${hoursOverrideFor(st.code, d) ? ' <span title="temporary hours">✦</span>' : ""}</th>`).join("")}<th style="text-align:right">Hours</th></tr></thead><tbody>
      ${rows.map((e) => `<tr><td><div class="emp"><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><span><b>${esc(e.name)}</b><small>${(e.stores || []).join(" · ")}${e.flex ? " · flex" : ""}</small></span></div></td>
        ${days.map((d) => {
          const sh = weekShifts(state.week).filter((s) => s.employee_id === e.id && s.date === d).sort(by((s) => s.start_min));
          const other = sh.filter((s) => s.store !== st.code), here = sh.filter((s) => s.store === st.code);
          return `<td>${here.map((s) => chip(s)).join("")}${other.map((s) => `<div class="chip off" data-shift="${s.id}" style="cursor:pointer">${fmtRange(s.start_min, s.end_min)} @ ${esc(store(s.store).name)}</div>`).join("")}${!sh.length ? offTag(e.id, d) : ""}${isSup() && storeHours(st.code, d) ? `<button class="addcell" data-add="${esc(e.id)}|${d}|${esc(st.code)}">+</button>` : ""}</td>`;
        }).join("")}<td class="hrs">${fmtHours(weekMinutes(e.id, state.week))}</td></tr>`).join("")}
      <tr class="cov"><td><b class="small">Coverage</b><br><span class="dim small">need vs. on</span></td>${days.map((d) => covCell(st.code, d)).join("")}<td class="hrs">${fmtHours(weekShifts(state.week).filter((s) => s.store === st.code).reduce((a, s) => a + shiftLen(s), 0))}</td></tr>
      </tbody></table></div></div>`;
    }).join("")}
    <div class="legend"><span><i style="background:var(--moss)"></i>covered</span><span><i style="background:var(--vermilion)"></i>short</span><span><i style="background:var(--iris)"></i>your shift</span><span><i style="background:var(--ochre)"></i>solver fill / extension</span><span>🔒 locked</span><span>✦ temporary hours</span></div>
  </section>`;
}
function covCell(code, d) {
  const c = coverage(weekShifts(state.week), code, d);
  if (!c) return `<td><span class="dim small">closed</span></td>`;
  const span = c.close - c.open;
  const bars = c.segs.map((g) => `<i class="${g.count < g.need ? "gap" : ""}" style="left:${((g.start - c.open) / span) * 100}%;width:${((g.end - g.start) / span) * 100}%;opacity:${g.count >= g.need ? Math.min(1, 0.5 + g.count * 0.25) : 1}" title="${fmtRange(g.start, g.end)}: ${g.count} on, need ${g.need}"></i>`).join("");
  const gapMin = c.segs.filter((g) => g.count < g.need).reduce((a, g) => a + g.end - g.start, 0);
  return `<td><div class="cov-bar">${bars}</div><div class="cov-lbl"><span>${fmtRange(c.open, c.close)}</span><span class="${gapMin ? "pill bad" : ""}" style="padding:0 6px">${gapMin ? fmtHours(gapMin) + " short" : "ok"}</span></div></td>`;
}
function hoursSummary(st) {
  const parts = []; let run = null;
  for (let d = 1; d <= 7; d++) { const h = st.hours[d]; const key = h ? fmtRange(h[0], h[1]) : "closed"; if (run && run.key === key) run.to = d; else { run = { key, from: d, to: d }; parts.push(run); } }
  return parts.map((p) => `${DOW[p.from - 1]}${p.to > p.from ? "–" + DOW[p.to - 1] : ""} ${p.key}`).join(" · ");
}
// ---- Requests
function reqCard(s) {
  const me = state.me, from = emp(s.from_employee), to = emp(s.to_employee), a = s.from_snapshot, b = s.to_snapshot, acts = [];
  if (s.status === "pending_peer" && s.to_employee === me.id) acts.push(`<button class="btn ok" data-swap-act="accept" data-id="${s.id}">Yes, I'll do it</button><button class="btn danger" data-swap-act="decline" data-id="${s.id}">No</button>`);
  if (s.status === "pending_supervisor" && isSup()) acts.push(`<button class="btn primary" data-swap-act="approve" data-id="${s.id}">Approve</button><button class="btn danger" data-swap-act="reject" data-id="${s.id}">Decline</button>`);
  if (["pending_peer", "pending_supervisor"].includes(s.status) && s.from_employee === me.id) acts.push(`<button class="btn ghost sm" data-swap-act="cancel" data-id="${s.id}">Withdraw</button>`);
  let again = "";
  if (s.status === "declined_peer" && s.from_employee === me.id && s.from_shift_id && !s.to_shift_id) {
    const shift = shiftById(s.from_shift_id);
    const others = shift ? staff().filter((e) => e.id !== me.id && e.id !== s.to_employee && worksStore(e, shift.store) && !isOff(e.id, shift.date)) : [];
    again = shift ? `<div class="row again"><span class="small muted">Ask someone else:</span><select class="field" data-rereq-sel="${s.id}" style="max-width:240px"><option value="">— pick a colleague —</option>${others.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} · ${esc(colleagueSub(e, shift.date))}</option>`).join("")}</select><button class="btn sm primary" data-rereq="${s.id}">Request</button></div>` : "";
  }
  const st = s.status, step = (on, cls) => `<i class="${on ? cls : ""}"></i>`;
  const tl = `<div class="timeline">${step(true, "done")} sent ${step(st !== "pending_peer", st === "declined_peer" ? "bad" : "done")} ${st === "declined_peer" ? "declined" : "colleague ok"} ${step(["approved", "declined_supervisor"].includes(st), st === "declined_supervisor" ? "bad" : st === "pending_supervisor" ? "now" : "done")} ${st === "declined_supervisor" ? "manager declined" : st === "approved" ? "approved" : "manager"}${s.decided_by_name ? ` · ${esc(s.decided_by_name)}` : ""}${st === "cancelled" ? " · withdrawn" : ""}</div>`;
  return `<div class="card ${acts.length ? "attn" : ""}"><div class="req"><div>
    <div class="who"><span class="av" style="--ac:${colorFor(from.name)}">${initials(from.name)}</span><b>${esc(s.from_employee === me.id ? "You" : from.name)}</b><span class="arrow">→</span><span class="av" style="--ac:${colorFor(to.name)}">${initials(to.name)}</span><b>${esc(s.to_employee === me.id ? "You" : to.name)}</b>${statusPill(s.status)}</div>
    <div class="shifts">${a ? shiftBox(a, `${firstName(from.name)} gives this`) : `<div class="box dim">Nothing given, just covering</div>`}<div class="sw">${a && b ? "⇄" : "→"}</div>${b ? shiftBox(b, `${firstName(from.name)} takes this from ${firstName(to.name)}`) : `<div class="box dim">${esc(firstName(to.name))} takes it over</div>`}</div>
    ${s.message ? `<p class="msg">“${esc(s.message)}”</p>` : ""}${s.supervisor_note ? `<p class="msg">Manager: “${esc(s.supervisor_note)}”</p>` : ""}${tl}${again}
  </div><div class="row" style="flex-direction:column;align-items:stretch">${acts.join("")}<span class="dim mono small" style="text-align:right">${esc(new Date(s.created_at).toLocaleDateString())}</span></div></div></div>`;
}
function offCard(o) {
  const e = emp(o.employee_id), mine = state.me && o.employee_id === state.me.id, acts = [];
  if (o.status === "pending" && isSup()) acts.push(`<button class="btn primary" data-off-act="approve" data-id="${o.id}">Approve</button><button class="btn danger" data-off-act="decline" data-id="${o.id}">Decline</button>`);
  if (o.status === "pending" && mine) acts.push(`<button class="btn ghost sm" data-off-act="withdraw" data-id="${o.id}">Withdraw</button>`);
  const affected = state.data.shifts.filter((s) => s.employee_id === o.employee_id && inRange(s.date, o.date_from, o.date_to));
  return `<div class="card ${acts.length ? "attn" : ""}"><div class="req"><div>
    <div class="who"><span class="av" style="--ac:${colorFor(e.name)}">${initials(e.name)}</span><b>${esc(mine ? "You" : e.name)}</b><span class="pill iris">${o.kind === "pto" ? "PTO" : "Block out"}</span>${statusPill(o.status)}</div>
    <div class="box" style="margin:8px 0"><div class="t">${esc(fmtRangeDates(o.date_from, o.date_to))}</div>${o.reason ? `<div class="msg" style="margin-top:4px">“${esc(o.reason)}”</div>` : ""}${affected.length && o.status === "pending" ? `<div class="small warn-text" style="margin-top:6px">${affected.length} scheduled shift${affected.length > 1 ? "s" : ""} in that range: ${affected.map((s) => fmtDate(s.date) + " " + fmtRange(s.start_min, s.end_min)).join(", ")}</div>` : ""}</div>
    ${o.supervisor_note ? `<p class="msg">Manager: “${esc(o.supervisor_note)}”</p>` : ""}${o.decided_by_name ? `<div class="timeline">${esc(o.status)} by ${esc(o.decided_by_name)} · ${esc(new Date(o.decided_at).toLocaleDateString())}</div>` : ""}
  </div><div class="row" style="flex-direction:column;align-items:stretch">${acts.join("")}<span class="dim mono small" style="text-align:right">${esc(new Date(o.created_at).toLocaleDateString())}</span></div></div></div>`;
}
function renderRequests() {
  const all = mySwaps(), need = swapsNeedingMe(), offNeed = offNeedingMe();
  const list = state.reqTab === "me" ? need : all;
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Requests</div><h1>Covers &amp; <em>switches</em></h1><p class="panel-sub">A request goes to your colleague first. Once they say yes, the manager approves it and the schedule updates on its own. If someone says no, ask another colleague right from the card.</p></div></div>
    <div class="tabs"><button class="tab ${state.reqTab === "me" ? "active" : ""}" data-reqtab="me">Needs me${need.length + offNeed.length ? ` · ${need.length + offNeed.length}` : ""}</button><button class="tab ${state.reqTab === "all" ? "active" : ""}" data-reqtab="all">${isSup() ? "Everything" : "All mine"} · ${all.length}</button></div>
    ${state.reqTab === "me" ? offNeed.map(offCard).join("") : ""}
    ${list.length ? list.map(reqCard).join("") : offNeed.length && state.reqTab === "me" ? "" : `<div class="empty"><h3>Nothing here</h3>${state.reqTab === "me" ? "Nobody is waiting on you." : "Tap a shift on your schedule to start one."}</div>`}
    <div class="legend" style="margin-top:20px"><span>${dot("pending_peer")} waiting on colleague</span><span>${dot("pending_supervisor")} waiting on manager</span><span>${dot("declined_peer")} declined</span><span>${dot("approved")} approved</span></div>
  </section>`;
}
async function swapAction(act, id) {
  const s = state.data.swaps.find((x) => x.id === id); if (!s) return;
  try {
    if (act === "accept") await peerRespond(s, true);
    else if (act === "decline") await peerRespond(s, false);
    else if (act === "cancel") await cancelSwap(s);
    else if (act === "approve" || act === "reject") {
      const c = openSheet(`<h3>${act === "approve" ? "Approve this change?" : "Decline this change?"}</h3><p class="sub">${esc(swapText(s))}</p>${act === "approve" ? approvalChecks(s) : ""}${supNameField()}<label class="lbl">Note to both (optional)</label><input class="field" id="note" placeholder="optional"><div class="actions"><button class="btn" id="no">Back</button><button class="btn ${act === "approve" ? "primary" : "danger"}" id="ok">${act === "approve" ? "Approve & update schedule" : "Decline"}</button></div>`);
      $("#no", c).onclick = closeSheet; $("#ok", c).onclick = async () => { const name = readSupName(c); if (!name) return; const note = $("#note", c).value.trim(); closeSheet(); await supervisorDecide(s, act === "approve", note, name); render(); };
      return;
    }
    render();
  } catch (e) { toast("That didn't go through: " + e.message, "err"); }
}
async function offAction(act, id) {
  const o = state.data.off_requests.find((x) => x.id === id); if (!o) return;
  try {
    if (act === "withdraw") { await withdrawOff(o); render(); return; }
    const approve = act === "approve";
    const c = openSheet(`<h3>${approve ? "Approve time off?" : "Decline time off?"}</h3><p class="sub">${esc(ename(o.employee_id))} · ${o.kind === "pto" ? "PTO" : "block-out"} · ${esc(fmtRangeDates(o.date_from, o.date_to))}${o.reason ? " · “" + esc(o.reason) + "”" : ""}</p>${approve ? `<p class="small muted">Weeks already built in that range are re-solved around the absence. Locked shifts (approved swaps, pins) stay and are flagged for you.</p>` : ""}${supNameField()}<label class="lbl">Note (optional)</label><input class="field" id="note" placeholder="optional"><div class="actions"><button class="btn" id="no">Back</button><button class="btn ${approve ? "primary" : "danger"}" id="ok">${approve ? "Approve" : "Decline"}</button></div>`);
    $("#no", c).onclick = closeSheet; $("#ok", c).onclick = async () => { const name = readSupName(c); if (!name) return; const note = $("#note", c).value.trim(); closeSheet(); await decideOff(o, approve, name, note); render(); };
  } catch (e) { toast(e.message, "err"); }
}
function approvalChecks(s) {
  const R = rules(), warns = [];
  const a = s.from_shift_id ? shiftById(s.from_shift_id) : null, b = s.to_shift_id ? shiftById(s.to_shift_id) : null;
  const check = (who, gets, gives) => {
    if (!gets) return; const e = emp(who);
    const clash = shiftsOf(who).find((x) => x.date === gets.date && x.id !== (gives && gives.id)); if (clash) warns.push(`${e.name} already works ${fmtRange(clash.start_min, clash.end_min)} at ${store(clash.store).name} that day.`);
    if (!worksStore(e, gets.store)) warns.push(`${e.name} isn't set up for ${store(gets.store).name}.`);
    if (isOff(who, gets.date)) warns.push(`${e.name} has ${fmtDate(gets.date)} off (${offReason(who, gets.date)}).`);
    if (hardBlocked(e, gets.date, gets.store)) warns.push(`A rule says ${e.name} doesn't work then (see Manage → Rules).`);
    const m = weekMinutes(who, gets.week_start) + shiftLen(gets) - (gives && gives.week_start === gets.week_start ? shiftLen(gives) : 0); if (m > maxHoursFor(e, R)) warns.push(`${e.name} would be at ${fmtHours(m)} that week (limit ${maxHoursFor(e, R) / 60}h).`);
  };
  check(s.to_employee, a, b); check(s.from_employee, b, a);
  return warns.length ? `<div class="card attn small"><b>Heads up</b><ul style="margin:6px 0 0 18px;padding:0">${warns.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : `<p class="pill good">No rule conflicts. Hours and days stay within limits.</p>`;
}

// ---- Time off (year calendar)
function defaultToStart() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
function renderTimeOff() {
  const me = state.me, t = today(); if (!state.toStart) state.toStart = defaultToStart();
  const [sy, sm] = state.toStart.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(sy, sm - 1 + i, 1); return { y: d.getFullYear(), mi: d.getMonth() }; });
  const label = `${MONTHS[months[0].mi].slice(0, 3)} ${months[0].y} – ${MONTHS[months[11].mi].slice(0, 3)} ${months[11].y}`, isDefault = state.toStart === defaultToStart();
  const mineReqs = state.data.off_requests.filter((o) => isSup() || o.employee_id === me.id).sort(by((o) => -new Date(o.created_at).getTime()));
  const statusFor = (d) => {
    if (isSup()) { const all = state.data.off_requests.filter((o) => inRange(d, o.date_from, o.date_to) && ["pending", "approved"].includes(o.status)); return all.length ? { cls: all.some((o) => o.status === "pending") ? "pend" : "ok", n: all.length, names: all.map((o) => firstName(ename(o.employee_id)) + (o.status === "pending" ? " (pending)" : "")).join(", ") } : null; }
    const o = offRequestsFor(me.id, d).filter((x) => x.status !== "cancelled").sort(by((x) => ({ approved: 0, pending: 1, declined: 2 }[x.status] ?? 3)))[0];
    if (o) return { cls: o.status === "approved" ? "ok" : o.status === "pending" ? "pend" : "no", n: 1, names: (o.kind === "pto" ? "PTO" : "Block-out") + " · " + o.status + (o.reason ? " · " + o.reason : "") };
    if (state.data.time_off.some((x) => x.employee_id === me.id && x.date === d)) return { cls: "ok", n: 1, names: "Day off" };
    return null;
  };
  return `<section class="panel">
    <div class="panel-head"><div><div class="kicker">Time off</div><h1>Block-outs &amp; <em>PTO</em></h1><p class="panel-sub">${isSup() ? "Everyone's requests, all year. Pending ones are amber; approve or decline them below or under Manage." : "Tap a day to ask for a block-out (a day you can't work) or PTO. The manager approves it, and the schedule is rebuilt around it."}</p></div>
      <div class="weeknav"><button class="btn sm" data-year="-12">‹</button><div class="wk">${esc(label)}<small>${isDefault ? "last month onward" : ""}</small></div><button class="btn sm" data-year="12">›</button>${isDefault ? "" : `<button class="btn sm ghost" data-year="today">Today</button>`}</div></div>
    <div class="ygrid">${months.map(({ y, mi }) => {
      const mn = MONTHS[mi] + (y !== Number(t.slice(0, 4)) ? " " + y : ""); const first = ymd(new Date(y, mi, 1)), last = ymd(new Date(y, mi + 1, 0)); const start = mondayOf(first); const cells = []; for (let d = start; d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) cells.push(d);
      return `<div class="ymonth"><div class="ym">${mn}</div><div class="yd">${DOW.map((d) => `<span>${d[0]}</span>`).join("")}${cells.map((d) => { const out = d < first || d > last; const st = out ? null : statusFor(d); return `<button class="yday ${out ? "out" : ""} ${d === t ? "today" : ""} ${d < t ? "past" : ""} ${st ? st.cls : ""}" ${out || d < t ? "disabled" : `data-offday="${d}"`} title="${st ? esc(st.names) : esc(d)}">${out ? "" : parseYmd(d).getDate()}${st && isSup() && st.n > 1 ? `<i>${st.n}</i>` : ""}</button>`; }).join("")}</div></div>`;
    }).join("")}</div>
    <div class="legend"><span><i style="background:var(--moss)"></i>approved</span><span><i style="background:var(--ochre)"></i>waiting on manager</span><span><i style="background:var(--vermilion)"></i>declined</span></div>
    <h2 class="sec">${isSup() ? "All requests" : "Your requests"}</h2>
    ${mineReqs.length ? mineReqs.map(offCard).join("") : `<div class="empty"><h3>No requests yet</h3>Tap a day above to make one.</div>`}
  </section>`;
}
