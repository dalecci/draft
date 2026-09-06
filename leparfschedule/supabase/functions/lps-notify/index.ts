// =============================================================================
// Le Parfumier: SCHEDULE — Supabase Edge Function: lps-notify
//
// Jobs:
//  1. POST (from the app, apikey header): send an email through Resend. If the body
//     carries `decide: {kind, id}` the email gets Approve / Decline buttons whose links
//     are signed (HMAC), so only someone holding the email can act.
//  2. GET  ?act=&kind=&id=&t=            : redirect to the confirm page in the app
//     GET  ...&json=1                     : JSON describing the request (for that page)
//     POST {decision: {act,kind,id,t,name,note}} : verify the signature, apply the
//     decision, notify the staff. The token is the credential; no apikey needed.
//
// The gateway serves every function response as text/plain with a sandbox CSP, so
// no HTML is rendered here; the confirm page lives at APP_URL + "decide.html".
//
// Deploy: Edge Functions -> lps-notify -> Code, paste, Deploy. "Verify JWT" OFF.
// Secrets: RESEND_API_KEY (required), LPS_FROM_EMAIL (optional).
// =============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("LPS_FROM_EMAIL") || "Le Parfumier Schedule <schedule@j3taviation.com>"; // j3taviation.com is verified in Resend
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const APP_URL = "https://draft.j3taviation.com/leparfschedule/";
const DECIDE_URL = APP_URL + "decide.html";

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
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// ------------------------------------------------------------------ signing
async function sign(kind: string, id: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("lps-decide:" + SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}:${id}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
async function verify(kind: string, id: string, t: string): Promise<boolean> { return !!t && (await sign(kind, id)) === t; }
async function decideLinks(kind: string, id: string) {
  const t = await sign(kind, id);
  const mk = (act: string) => `${DECIDE_URL}?act=${act}&kind=${kind}&id=${encodeURIComponent(id)}&t=${t}`;
  return { approve: mk("approve"), decline: mk("decline") };
}

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
const fmtRangeDates = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
async function nameOf(id: string) { const e = await one(`lps_employees?id=eq.${encodeURIComponent(id)}&select=name`); return e ? e.name : "Someone"; }
async function supervisorNames(): Promise<string[]> { const s = await one(`lps_settings?key=eq.supervisor_names&select=value`); return s && Array.isArray(s.value) && s.value.length ? s.value : ["Michael", "Katherine", "Anthony", "Carmie", "Tony"]; }

async function loadRow(kind: string, id: string) {
  return kind === "off" ? one(`lps_off_requests?id=eq.${encodeURIComponent(id)}`) : one(`lps_swap_requests?id=eq.${encodeURIComponent(id)}`);
}
function isPending(kind: string, row: any) { return kind === "off" ? row.status === "pending" : row.status === "pending_supervisor"; }
async function describe(kind: string, row: any) {
  if (kind === "off") return { title: `${await nameOf(row.employee_id)} · ${row.kind === "pto" ? "PTO" : "Block-out"}`, detail: fmtRangeDates(row.date_from, row.date_to), quote: row.reason || "" };
  const from = await nameOf(row.from_employee), to = await nameOf(row.to_employee), a = row.from_snapshot, b = row.to_snapshot;
  const what = a && b ? `${from} gives ${fmtShift(a)} and takes ${to}'s ${fmtShift(b)}` : a ? `${to} covers ${from}'s shift: ${fmtShift(a)}` : `${from} takes ${to}'s shift: ${fmtShift(b)}`;
  return { title: `${from} ↔ ${to}`, detail: what, quote: row.message || "" };
}

async function applyDecision(act: string, kind: string, id: string, name: string, note: string) {
  const row = await loadRow(kind, id);
  if (!row) return { ok: false, msg: "Request not found. It may have been withdrawn." };
  if (!isPending(kind, row)) return { ok: false, msg: `Already ${row.status.replace(/_/g, " ")}${row.decided_by_name ? " by " + row.decided_by_name : ""}.` };
  const now = new Date().toISOString(), approve = act === "approve";
  const notes: unknown[] = [];
  if (kind === "off") {
    await patch("lps_off_requests", id, { status: approve ? "approved" : "declined", decided_at: now, decided_by: "email", decided_by_name: name, supervisor_note: note || null });
    const what = `${row.kind === "pto" ? "PTO" : "block-out"} ${fmtRangeDates(row.date_from, row.date_to)}`;
    notes.push({ employee_id: row.employee_id, kind: approve ? "off_approved" : "off_declined", title: `${approve ? "Approved" : "Declined"}: ${what}`, body: `${name} ${approve ? "approved" : "declined"} your ${what}.${note ? " “" + note + "”" : ""}`, off_id: id, read: false });
  } else {
    const from = await nameOf(row.from_employee), to = await nameOf(row.to_employee), a = row.from_snapshot, b = row.to_snapshot;
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
// Gmail folds any block that repeats an earlier message in the thread behind "…", so the
// buttons sit right under the first line and every mail carries a unique footer.
function emailHtml(text: string, links: { approve: string; decline: string } | null, appLink: string, ref: string) {
  const btn = (href: string, label: string, bg: string) => `<a href="${href}" style="display:inline-block;background:${bg};color:#1a1622;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;margin:0 8px 8px 0">${label}</a>`;
  const lines = text.split("\n").filter((l) => l.trim());
  const first = lines.shift() || "";
  const p = (l: string) => `<p style="margin:6px 0;font-family:Arial,sans-serif;font-size:15px">${esc(l)}</p>`;
  return `<div style="font-family:Georgia,serif;max-width:560px;color:#1a1622"><p style="letter-spacing:.3em;font-size:11px;color:#a86fa5">LE PARFUMIER · SCHEDULE</p>${p(first)}
  ${links ? `<p style="margin:16px 0 4px">${btn(links.approve, "✓ Approve", "#87be90")}${btn(links.decline, "✕ Decline", "#e9796b")}</p><p style="font-family:Arial,sans-serif;font-size:12px;color:#777;margin:0 0 14px">Tap a button, pick your name, done. Ref ${esc(ref)}</p>` : ""}
  ${lines.map(p).join("")}
  <p style="margin-top:18px;font-family:Arial,sans-serif;font-size:12px"><a href="${appLink}" style="color:#a86fa5">Open the schedule</a> · ${esc(ref)}</p></div>`;
}

// -------------------------------------------------------------------- serve
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (url.searchParams.get("diag")) return json({ resendKeySet: !!RESEND_API_KEY, serviceKeySet: !!SERVICE, envNames: Object.keys(Deno.env.toObject()).filter((k) => !/^(SB_|DENO|SUPABASE_(DB|SECRET|PUBLISHABLE|ANON|SERVICE|JWKS))/.test(k)) });

  // ---- email buttons (GET): old links land here; send them to the confirm page in the app
  if (req.method === "GET") {
    const act = url.searchParams.get("act") || "", kind = url.searchParams.get("kind") || "", id = url.searchParams.get("id") || "", t = url.searchParams.get("t") || "";
    if (!["approve", "decline"].includes(act) || !["off", "swap"].includes(kind) || !id) return json({ error: "incomplete link" }, 400);
    if (!url.searchParams.get("json")) return Response.redirect(`${DECIDE_URL}?act=${act}&kind=${kind}&id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`, 302);
    if (!SERVICE) return json({ error: "server key missing" }, 500);
    if (!(await verify(kind, id, t))) return json({ error: "invalid link" }, 403);
    const row = await loadRow(kind, id);
    if (!row) return json({ error: "not found" }, 404);
    const d = await describe(kind, row);
    return json({ ok: true, act, kind, id, pending: isPending(kind, row), status: row.status, decided_by_name: row.decided_by_name || null, ...d, names: await supervisorNames() });
  }

  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // ---- decision from the confirm page (token is the credential)
  if (payload && payload.decision) {
    const { act, kind, id, t, name, note } = payload.decision;
    if (!["approve", "decline"].includes(act) || !["off", "swap"].includes(kind) || !id) return json({ error: "incomplete" }, 400);
    if (!SERVICE) return json({ error: "server key missing" }, 500);
    if (!(await verify(kind, id, String(t || "")))) return json({ error: "invalid link" }, 403);
    if (!String(name || "").trim()) return json({ error: "pick your name" }, 400);
    try { const r = await applyDecision(act, kind, id, String(name).trim(), String(note || "").trim()); return json(r, r.ok ? 200 : 409); }
    catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
  }

  // ---- app → email
  if (!(await validProjectKey(req.headers.get("apikey") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")))) return json({ error: "unauthorized" }, 401);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);
  const to = (payload.to || []).filter((x: unknown) => typeof x === "string" && (x as string).includes("@"));
  if (!to.length) return json({ error: "no recipients" }, 400);
  const links = payload.decide && SERVICE && ["off", "swap"].includes(payload.decide.kind) && payload.decide.id ? await decideLinks(payload.decide.kind, payload.decide.id) : null;
  const appLink = payload.app || APP_URL + "#requests";
  const ref = (payload.decide && payload.decide.id ? String(payload.decide.id).slice(0, 8) : Math.random().toString(36).slice(2, 8)) + " · " + new Date().toISOString().slice(0, 16).replace("T", " ");
  const text = (payload.text || "") + (links ? `\n\nApprove: ${links.approve}\nDecline: ${links.decline}` : "") + `\n\nOpen the schedule: ${appLink}\nRef ${ref}`;
  try { const data = await sendEmail(to, payload.subject || "Le Parfumier schedule", text, emailHtml(payload.text || "", links, appLink, ref)); return json({ ok: true, id: data.id, buttons: !!links }); }
  catch (e) { return json({ error: String((e as Error).message || e) }, 502); }
});
