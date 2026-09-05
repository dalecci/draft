// =============================================================================
// Le Parfumier: SCHEDULE — Supabase Edge Function: lps-ai
//
// Proxy between the admin "AI command center" in the app and Claude. The browser
// never sees the Anthropic key. The function:
//   - checks the caller presents one of this project's API keys (like lps-notify)
//   - keeps a fixed allowlist of tool names; any tool the client sends that is not
//     on the list is dropped before Claude sees it (only approved actions exist)
//   - calls Claude with a frozen system prompt (cached) plus the live context the
//     app sends (schema, roster, rules, dates) and returns the raw content blocks
//
// The app executes the tools itself: reads run immediately, writes show a
// confirmation preview first. This function never touches the database.
//
// Deploy: Edge Functions -> Deploy a new function -> "lps-ai", paste, Deploy;
// Settings -> "Verify JWT" OFF (the apikey check below guards it).
// Secrets: ANTHROPIC_API_KEY (already present in this project).
// =============================================================================

import Anthropic from "npm:@anthropic-ai/sdk";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const MODEL = "claude-opus-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function validProjectKey(k: string): Promise<boolean> {
  if (!k || k.length < 20) return false;
  if (ANON_KEY && k === ANON_KEY) return true;
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/lps_settings?select=key&limit=1`, { headers: { apikey: k, Authorization: `Bearer ${k}` } }); return r.ok; } catch (_) { return false; }
}

// The only actions Claude may call. Must match the registry in ai.js.
const ALLOWED_TOOLS = new Set([
  // read
  "get_schema", "query_table", "get_week_schedule", "get_coverage_flags", "get_employee", "list_requests", "get_settings",
  // write (the app previews these before running)
  "add_shift", "edit_shift", "delete_shift", "rebuild_week", "restore_week_version",
  "set_base_rule", "add_custom_rule", "toggle_custom_rule", "remove_custom_rule",
  "set_weekly_availability", "add_special_availability", "add_time_off", "remove_time_off", "add_must_work",
  "add_temporary_hours", "update_employee", "add_employee",
  "decide_swap_request", "decide_off_request", "notify_employees", "send_email",
]);

const SYSTEM = `You are the AI command center for "Le Parfumier: Schedule", a staff scheduling app for three perfume stores (PL, PB, PV). You are talking to a manager (admin). You help them run the schedule through natural language.

How you work
- You can only act through the tools you are given. There is no other way to change anything. Never claim something was done unless a tool result confirms it.
- Read before you write: look up the schedule, employee or request first so your change is grounded in real ids and current data. Never invent employee ids, shift ids or request ids; get them from tool results.
- Write actions are shown to the manager as a confirmation preview before they run. A tool result saying the manager declined means exactly that; do not retry it, ask what they would like instead.
- Some actions send messages (notifications, emails, approving or declining requests), delete data, or affect many people (rebuilding a week, changing rules or store hours, notifying everyone). Say so plainly in one sentence before calling them, so the preview is no surprise.
- There are no payments in this system. If asked about pay, payroll or money, say the app does not handle it.
- If a request is ambiguous (which week, which person, which store), ask one short clarifying question instead of guessing. If a name is close to one employee, use that employee.
- Dates: the context tells you today's date and the current week's Monday. Weeks start on Monday. Times in the database are minutes since midnight (600 = 10:00, 1080 = 18:00). Speak in normal clock times to the manager.
- The scheduler is rule-based: a weekly template per person, time off, "needs to work" pins, store hours (with temporary overrides), base rules and custom rules feed a solver that fills coverage and flags compromises. Changing a template, rule or hours takes effect on rebuild; several tools rebuild the affected weeks for you and say so in their result.
- Be concise. Lead with the answer or the plan. Use short lists for multiple items. No filler.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!(await validProjectKey(req.headers.get("apikey") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")))) return json({ error: "unauthorized" }, 401);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { messages?: unknown[]; tools?: Array<{ name: string; description?: string; input_schema?: unknown }>; context?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return json({ error: "no messages" }, 400);
  if (messages.length > 80) return json({ error: "conversation too long, start a new one" }, 400);

  const tools = (body.tools || []).filter((t) => t && ALLOWED_TOOLS.has(t.name) && t.input_schema && typeof t.input_schema === "object").map((t) => ({ name: t.name, description: String(t.description || "").slice(0, 1200), input_schema: t.input_schema }));
  const context = String(body.context || "").slice(0, 60000);

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: "Live context from the app:\n" + context },
      ],
      tools: tools as any,
      messages: messages as any,
    } as any);
    return json({ content: res.content, stop_reason: res.stop_reason, stop_details: (res as any).stop_details || null, model: res.model, usage: res.usage });
  } catch (e) {
    const err = e as any;
    return json({ error: String(err?.message || err), status: err?.status || null }, 502);
  }
});
