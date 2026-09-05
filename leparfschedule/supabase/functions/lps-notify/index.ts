// =============================================================================
// Le Parfumier: SCHEDULE — Supabase Edge Function: lps-notify
//
// Sends the supervisor an email when a swap has been accepted by the colleague
// and is waiting for approval, and tells both employees when it is decided.
// The app calls this best-effort; if it is not deployed the request still shows
// up in the supervisor's in-app queue, only the email is missing.
//
// Deploy in Supabase: Edge Functions -> Deploy a new function -> Via Editor ->
// name it "lps-notify" and paste this file. "Verify JWT" may stay on: the app
// calls it with the anon key, which satisfies the legacy check.
//
// Required secrets (Edge Functions -> Secrets):
//   RESEND_API_KEY   — from resend.com (free tier is plenty)
//   LPS_FROM_EMAIL   — e.g. "Le Parfumier Schedule <schedule@yourdomain.com>"
//                      (any verified sender in Resend; onboarding@resend.dev works for testing)
// =============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("LPS_FROM_EMAIL") || "Le Parfumier Schedule <onboarding@resend.dev>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  let payload: { to?: string[]; subject?: string; html?: string; text?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const to = (payload.to || []).filter((x) => typeof x === "string" && x.includes("@"));
  if (!to.length) return json({ error: "no recipients" }, 400);

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: payload.subject || "Le Parfumier schedule",
      html: payload.html || `<pre>${payload.text || ""}</pre>`,
      text: payload.text || "",
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: "resend failed", detail: data }, 502);
  return json({ ok: true, id: data.id });
});
