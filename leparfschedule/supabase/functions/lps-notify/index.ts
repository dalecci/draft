// =============================================================================
// Le Parfumier: SCHEDULE — Supabase Edge Function: lps-notify
//
// Two jobs:
//  1. POST (from the app, with the anon apikey header): send an email through Resend.
//     If the body carries `decide: {kind, id}`, the email gets Approve / Decline
//     buttons whose links are signed, so only someone holding the email can act.
//  2. GET  ?act=approve|decline&kind=off|swap&id=…&t=…  (the email buttons): verify
//     the signature, show a one-screen confirm page where the approver picks their
//     name, then apply the decision to the database and notify the staff involved.
//
// Deploy: Edge Functions -> lps-notify -> Code, paste, Deploy. "Verify JWT" must be
// OFF so the email links (plain browser GETs) reach the function; POSTs are guarded
// by the anon apikey check below, GETs by the HMAC token.
//
// Secrets: RESEND_API_KEY (required for email), LPS_FROM_EMAIL (optional).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// =============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("LPS_FROM_EMAIL") || "Le Parfumier Schedule <onboarding@resend.dev>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const APP_URL = "https://draft.j3taviation.com/leparfschedule/";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); const first = Object.values(keys)[0]; if (typeof first === "string") return first; } catch (_) { /* ignore */ }
  return "";
}
const SERVICE = serviceKey();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// ------------------------------------------------------------------ signing
async function sign(kind: string, id: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("lps-decide:" + SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}:${id}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
async function verify(kind: string, id: string, t: string): Promise<boolean> { return !!t && (await sign(kind, id)) === t; }
async function decideLinks(kind: string, id: string, base: string) {
  const t = await sign(kind, id);
  const mk = (act: string) => `${base}?act=${act}&kind=${kind}&id=${encodeURIComponent(id)}&t=${t}`;
  return { approve: mk("approve"), decline: mk("decline") };
}

// A caller is trusted if the key it presents is one of this project's API keys. Checked
// against PostgREST itself, so it works for the legacy anon JWT and the new publishable keys.
async function validProjectKey(k: string): Promise<boolean> {
  if (!k || k.length < 20) return false;
  if (ANON_KEY && k === ANON_KEY) return true;
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/lps_settings?select=key&limit=1`, { headers: { apikey: k, Authorization: `Bearer ${k}` } }); return r.ok; } catch (_) { return false; }
}

// ---------------------------------------------------------------- database
async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
  const text = await r.text(); let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw new Error(`db ${path}: ${r.status} ${text}`);
  return data as any;
}
const one = async (path: string) => { const rows = await db(path); return Array.isArray(rows) ? rows[0] : rows; };
const patch = (table: string, id: string, body: unknown) => db(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
const insert = (table: string, rows: unknown[]) => db(table, { method: "POST", body: JSON.stringify(rows) });

// ---------------------------------------------------------------- formatting
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(s: string) { const [y, m, d] = s.split("-").map(Number); const dt = new Date(y, m - 1, d); return `${DOW[dt.getDay()]} ${MON[m - 1]} ${d}`; }
function fmtT(min: number) { let h = Math.floor(min / 60); const m = min % 60; const ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`; }
const fmtShift = (s: any) => s ? `${fmtDate(s.date)} · ${fmtT(s.start_min)}–${fmtT(s.end_min)} · ${s.store}` : "—";
async function nameOf(id: string) { const e = await one(`lps_employees?id=eq.${encodeURIComponent(id)}&select=name`); return e ? e.name : "Someone"; }
async function supervisorNames(): Promise<string[]> { const s = await one(`lps_settings?key=eq.supervisor_names&select=value`); return s && Array.isArray(s.value) && s.value.length ? s.value : ["Michael", "Katherine", "Anthony", "Carmie", "Tony"]; }

// ------------------------------------------------------------------ pages
function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Le Parfumier</title>
<style>body{margin:0;background:#131019;color:#f1edf5;font:15px/1.5 Archivo,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box}
.card{width:min(460px,100%);background:#1b1724;border:1px solid #322b3e;border-radius:20px;padding:28px 26px}.k{font:10.5px ui-monospace,monospace;letter-spacing:.3em;color:#c68ec3;text-transform:uppercase}
h1{font:400 26px Georgia,serif;margin:6px 0 10px}p{color:#b6adc2;margin:0 0 14px}.box{background:#221c2d;border:1px solid #272134;border-radius:12px;padding:12px 14px;margin:0 0 16px}
label{display:block;font:10.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#978da6;margin:12px 0 6px}select,input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #322b3e;background:#0c0a11;color:#f1edf5;font:inherit;box-sizing:border-box}
.btn{display:inline-block;padding:12px 18px;border-radius:11px;border:1px solid #a86fa5;background:#c68ec3;color:#1a1622;font-weight:700;text-decoration:none;cursor:pointer;font:inherit;font-weight:700;margin-top:18px}.btn.red{background:#e9796b;border-color:#c9584a}.btn.ghost{background:transparent;color:#c68ec3;border-color:#322b3e}
.ok{color:#87be90}.bad{color:#e9796b}</style></head><body><div class="card"><div class="k">Le Parfumier · Schedule</div>${body}</div></body></html>`;
}
function backLink() { return `<a class="btn ghost" href="${APP_URL}#requests">Open the schedule</a>`; }

async function describe(kind: string, row: any): Promise<string> {
  if (kind === "off") return `<b>${esc(await nameOf(row.employee_id))}</b> · ${row.kind === "pto" ? "PTO" : "Block-out"} · ${esc(row.date_from === row.date_to ? fmtDate(row.date_from) : fmtDate(row.date_from) + " – " + fmtDate(row.date_to))}${row.reason ? `<br><i style="color:#b6adc2">“${esc(row.reason)}”</i>` : ""}`;
  const from = await nameOf(row.from_employee), to = await nameOf(row.to_employee);
  const a = row.from_snapshot, b = row.to_snapshot;
  const what = a && b ? `${from} gives ${fmtShift(a)} and takes ${to}'s ${fmtShift(b)}` : a ? `${to} covers ${from}'s shift: ${fmtShift(a)}` : `${from} takes ${to}'s shift: ${fmtShift(b)}`;
  return `<b>${esc(from)} ↔ ${esc(to)}</b><br>${esc(what)}${row.message ? `<br><i style="color:#b6adc2">“${esc(row.message)}”</i>` : ""}`;
}
async function loadRow(kind: string, id: string) {
  return kind === "off" ? one(`lps_off_requests?id=eq.${encodeURIComponent(id)}`) : one(`lps_swap_requests?id=eq.${encodeURIComponent(id)}`);
}
function isPending(kind: string, row: any) { return kind === "off" ? row.status === "pending" : row.status === "pending_supervisor"; }

async function confirmPage(act: string, kind: string, id: string, t: string) {
  const row = await loadRow(kind, id);
  if (!row) return html(page("Not found", `<h1>Request not found</h1><p>It may have been withdrawn.</p>${backLink()}`), 404);
  const desc = await describe(kind, row);
  if (!isPending(kind, row)) return html(page("Already decided", `<h1>Already decided</h1><div class="box">${desc}</div><p>Status: <b>${esc(row.status.replace(/_/g, " "))}</b>${row.decided_by_name ? ` by ${esc(row.decided_by_name)}` : ""}.</p>${backLink()}`));
  const names = await supervisorNames();
  const approve = act === "approve";
  return html(page(approve ? "Approve" : "Decline", `<h1>${approve ? "Approve" : "Decline"} this ${kind === "off" ? "time off" : "schedule change"}?</h1>
    <div class="box">${desc}</div>
    <form method="post" action="?"><input type="hidden" name="act" value="${esc(act)}"><input type="hidden" name="kind" value="${esc(kind)}"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="t" value="${esc(t)}">
    <label>Deciding as</label><select name="name" required><option value="">— pick your name —</option>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select>
    <label>Note to them (optional)</label><input name="note" maxlength="200" placeholder="optional">
    <button class="btn ${approve ? "" : "red"}" type="submit">${approve ? "Approve" : "Decline"}</button> <a class="btn ghost" href="?act=${approve ? "decline" : "approve"}&kind=${esc(kind)}&id=${encodeURIComponent(id)}&t=${esc(t)}">${approve ? "Decline instead" : "Approve instead"}</a></form>`));
}

async function applyDecision(act: string, kind: string, id: string, name: string, note: string) {
  const row = await loadRow(kind, id);
  if (!row) return { ok: false, msg: "Request not found." };
  if (!isPending(kind, row)) return { ok: false, msg: `Already ${row.status.replace(/_/g, " ")}${row.decided_by_name ? " by " + row.decided_by_name : ""}.` };
  const now = new Date().toISOString(), approve = act === "approve";
  const notes: unknown[] = [];
  if (kind === "off") {
    await patch("lps_off_requests", id, { status: approve ? "approved" : "declined", decided_at: now, decided_by: "email", decided_by_name: name, supervisor_note: note || null });
    const what = `${row.kind === "pto" ? "PTO" : "block-out"} ${row.date_from === row.date_to ? fmtDate(row.date_from) : fmtDate(row.date_from) + " – " + fmtDate(row.date_to)}`;
    notes.push({ employee_id: row.employee_id, kind: approve ? "off_approved" : "off_declined", title: `${approve ? "Approved" : "Declined"}: ${what}`, body: `${name} ${approve ? "approved" : "declined"} your ${what}.${note ? " “" + note + "”" : ""}`, off_id: id, read: false });
  } else {
    const from = await nameOf(row.from_employee), to = await nameOf(row.to_employee);
    const a = row.from_snapshot, b = row.to_snapshot;
    const text = a && b ? `${from} gives ${fmtShift(a)} and takes ${to}'s ${fmtShift(b)}.` : a ? `${to} covers ${from}'s shift: ${fmtShift(a)}.` : `${from} takes ${to}'s shift: ${fmtShift(b)}.`;
    if (approve) {
      const sa = row.from_shift_id ? await one(`lps_shifts?id=eq.${row.from_shift_id}`) : null;
      const sb = row.to_shift_id ? await one(`lps_shifts?id=eq.${row.to_shift_id}`) : null;
      if ((row.from_shift_id && !sa) || (row.to_shift_id && !sb)) return { ok: false, msg: "One of those shifts no longer exists. Decline it in the app and ask them to redo it." };
      if (sa) await patch("lps_shifts", sa.id, { employee_id: row.to_employee, locked: true, source: "swap", note: `Swap approved by ${name} ${now.slice(0, 10)}`, updated_at: now });
      if (sb) await patch("lps_shifts", sb.id, { employee_id: row.from_employee, locked: true, source: "swap", note: `Swap approved by ${name} ${now.slice(0, 10)}`, updated_at: now });
    }
    await patch("lps_swap_requests", id, { status: approve ? "approved" : "declined_supervisor", decided_at: now, decided_by: "email", decided_by_name: name, supervisor_note: note || null });
    for (const emp of [row.from_employee, row.to_employee]) notes.push({ employee_id: emp, kind: approve ? "swap_approved" : "swap_declined", title: approve ? "Schedule change approved" : "Schedule change declined", body: `${name} ${approve ? "approved" : "declined"}: ${text}${approve ? " The schedule is updated." : ""}${note ? " “" + note + "”" : ""}`, swap_id: id, read: false });
  }
  if (notes.length) await insert("lps_notifications", notes);
  return { ok: true, msg: approve ? "Approved. The staff involved have been notified." : "Declined. The staff involved have been notified." };
}

// ------------------------------------------------------------------- email
async function sendEmail(to: string[], subject: string, text: string, htmlBody: string) {
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to, subject, html: htmlBody, text }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("resend failed: " + JSON.stringify(data));
  return data;
}
function emailHtml(text: string, links: { approve: string; decline: string } | null, appLink: string) {
  const btn = (href: string, label: string, bg: string) => `<a href="${href}" style="display:inline-block;background:${bg};color:#1a1622;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;margin:0 8px 8px 0">${label}</a>`;
  return `<div style="font-family:Georgia,serif;max-width:560px;color:#1a1622"><p style="letter-spacing:.3em;font-size:11px;color:#a86fa5">LE PARFUMIER · SCHEDULE</p>${text.split("\n").map((l) => `<p style="margin:6px 0;font-family:Arial,sans-serif;font-size:15px">${esc(l)}</p>`).join("")}
  ${links ? `<p style="margin-top:22px">${btn(links.approve, "✓ Approve", "#87be90")}${btn(links.decline, "✕ Decline", "#e9796b")}</p><p style="font-family:Arial,sans-serif;font-size:12px;color:#777">Either button opens a one-tap confirmation where you pick your name.</p>` : ""}
  <p style="margin-top:18px"><a href="${appLink}" style="font-family:Arial,sans-serif;color:#a86fa5">Open the schedule</a></p></div>`;
}

// -------------------------------------------------------------------- serve
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // email buttons: GET shows the confirm page, POST (form) applies the decision
  if (req.method === "GET" || (req.method === "POST" && (req.headers.get("content-type") || "").includes("form"))) {
    let act: string, kind: string, id: string, t: string, name = "", note = "";
    if (req.method === "GET") { act = url.searchParams.get("act") || ""; kind = url.searchParams.get("kind") || ""; id = url.searchParams.get("id") || ""; t = url.searchParams.get("t") || ""; }
    else { const f = await req.formData(); act = String(f.get("act") || ""); kind = String(f.get("kind") || ""); id = String(f.get("id") || ""); t = String(f.get("t") || ""); name = String(f.get("name") || "").trim(); note = String(f.get("note") || "").trim(); }
    if (!["approve", "decline"].includes(act) || !["off", "swap"].includes(kind) || !id) return html(page("Bad link", `<h1>That link isn't complete</h1><p>Open the schedule and decide there instead.</p>${backLink()}`), 400);
    if (!SERVICE) return html(page("Not configured", `<h1>Server key missing</h1><p>The function has no service key. Decide in the app instead.</p>${backLink()}`), 500);
    if (!(await verify(kind, id, t))) return html(page("Invalid link", `<h1>This link isn't valid</h1><p>It may have been altered. Open the schedule and decide there instead.</p>${backLink()}`), 403);
    if (req.method === "GET") return confirmPage(act, kind, id, t);
    if (!name) return html(page("Name needed", `<h1>Pick your name</h1><p>Approvals are signed. Go back and choose who is deciding.</p><a class="btn ghost" href="?act=${act}&kind=${kind}&id=${encodeURIComponent(id)}&t=${t}">Back</a>`), 400);
    try { const r = await applyDecision(act, kind, id, name, note); return html(page(r.ok ? "Done" : "Not applied", `<h1 class="${r.ok ? "ok" : "bad"}">${r.ok ? (act === "approve" ? "Approved" : "Declined") : "Not applied"}</h1><p>${esc(r.msg)}</p>${r.ok && act === "approve" && kind === "off" ? `<p>The schedule rebuilds itself around the absence the next time anyone opens the app.</p>` : ""}${backLink()}`)); }
    catch (e) { return html(page("Error", `<h1 class="bad">Something went wrong</h1><p>${esc(String((e as Error).message || e))}</p>${backLink()}`), 500); }
  }

  // app → email
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!(await validProjectKey(req.headers.get("apikey") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")))) return json({ error: "unauthorized" }, 401);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);
  let payload: { to?: string[]; subject?: string; text?: string; decide?: { kind: string; id: string }; app?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const to = (payload.to || []).filter((x) => typeof x === "string" && x.includes("@"));
  if (!to.length) return json({ error: "no recipients" }, 400);
  const base = `${url.origin}${url.pathname}`;
  const links = payload.decide && SERVICE && ["off", "swap"].includes(payload.decide.kind) && payload.decide.id ? await decideLinks(payload.decide.kind, payload.decide.id, base) : null;
  const appLink = payload.app || APP_URL + "#requests";
  const text = (payload.text || "") + (links ? `\n\nApprove: ${links.approve}\nDecline: ${links.decline}` : "") + `\n\nOpen the schedule: ${appLink}`;
  try { const data = await sendEmail(to, payload.subject || "Le Parfumier schedule", text, emailHtml(payload.text || "", links, appLink)); return json({ ok: true, id: data.id, buttons: !!links }); }
  catch (e) { return json({ error: String((e as Error).message || e) }, 502); }
});
