// Vibrant Resonance — AI Brain (conversation mode)
// Talks to Claude (claude-opus-5) directly from the browser using the
// anthropic-dangerous-direct-browser-access CORS opt-in. The API key is
// entered once in Admin → Backup & Settings and stored in app settings.
// The system prompt carries the full knowledge base + everything the
// Brain has been trained on, so the AI builds on YOUR data first.
'use strict';

const BrainAI = (() => {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-opus-5';

  // Structured output: every reply is {reply, protocol|null} — no parsing surprises.
  const OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      protocol: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: {
              name: { type: 'string' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hz: { type: 'number' },
                    seconds: { type: 'integer' },
                    sweepToHz: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  },
                  required: ['hz', 'seconds', 'sweepToHz'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'steps'],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ['reply', 'protocol'],
    additionalProperties: false,
  };

  function apiKey() { return (Store.setting('anthropic_key', '') || '').trim(); }
  function hasKey() { return apiKey().startsWith('sk-ant-'); }

  function kbDigest() {
    return Brain.all().map((e) => {
      if (e.noReliableListing) {
        return `- ${e.condition} [${e.category}]: NO reliable CAFL listing — do not invent numbers; nearest option is the Mold & Fungus General core (728/784/880/464).`;
      }
      return `- ${e.condition} [${e.category}] (${e.source}): ${e.frequencies.join(', ')} Hz — default dwell ${e.dwell || 180}s`;
    }).join('\n');
  }

  function trainingDigest() {
    const lines = [];
    for (const t of Brain.allTraining()) {
      const ref = Brain.get(t.ref_id);
      const name = ref ? ref.condition : t.ref_id;
      if (t.kind === 'tuned-protocol' && t.payload.steps) {
        lines.push(`- Tuned protocol for ${name}: ${t.payload.steps.map((s) => `${s.hz}Hz×${s.seconds}s`).join(', ')}`);
      } else if (t.kind === 'rating') {
        lines.push(`- Session rating for ${name}: ${t.payload.rating}/5${t.payload.notes ? ` — "${t.payload.notes}"` : ''}`);
      }
    }
    return lines.length ? lines.join('\n') : '(no training yet)';
  }

  function systemPrompt() {
    return `You are The Brain — the AI protocol designer inside Vibrant Resonance, a pure sine wave frequency studio used by Vibrant Complete Health, a wellness practice. You converse with the practitioner running the app and design Rife/CAFL-style frequency protocols they can run immediately on this device.

How to build protocols:
- Draw on the clinic's knowledge base and training below FIRST (their own research and tuned protocols take priority), then your broader knowledge of published Rife/CAFL frequency listings.
- Default dwell is 180 seconds per frequency. For "extra strength" / "aggressive" / "maximum" requests: extend dwells on the primary frequencies (300–420s), add closely related documented frequencies from the same organism family, finish with the core cleanup cluster 728 / 784 / 880 / 465, and consider a second pass of the primary frequencies. Keep total time practical (under ~90 minutes unless asked for more).
- The device plays pure sine tones from 0.1 to 100,000 Hz. A step may optionally sweep from hz to sweepToHz over its duration (set sweepToHz to null for a fixed tone).
- Use frequencies from documented Rife/CAFL listings or the knowledge base and say which source a set comes from. Never invent precise frequencies and present them as documented.

Honesty rules (strict but brief):
- These are historical practitioner listings, not clinically validated treatments. Never promise eradication, cures, or same-day kills. If asked for "gone today / dead today", build the strongest reasonable protocol AND include one plain sentence that no frequency protocol is proven to do that — prescription antiparasitics from a doctor are the proven kill, and frequency work is complementary. One sentence, not a lecture, then deliver.

Reply style: warm, expert, concise — a knowledgeable colleague, not a disclaimer machine. Explain your frequency choices briefly.

Output JSON: "reply" = your conversational message (plain text, short paragraphs). "protocol" = the runnable protocol when you are proposing one, else null. Steps: hz (number), seconds (integer), sweepToHz (number or null).

=== KNOWLEDGE BASE (this clinic's Brain) ===
${kbDigest()}

=== TRAINING (what the practitioners have taught the Brain — honor these) ===
${trainingDigest()}`;
  }

  // history: [{role:'user'|'assistant', content:string}]
  async function ask(history) {
    const key = apiKey();
    if (!key) return { error: 'no_key' };

    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
          messages: history.slice(-12),
          output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        }),
      });
    } catch (e) {
      return { error: 'network', detail: 'Could not reach the AI service — check the internet connection.' };
    }

    if (!res.ok) {
      let detail = 'HTTP ' + res.status;
      try { detail = (await res.json()).error?.message || detail; } catch {}
      if (res.status === 401) detail = 'The API key was rejected — re-check it in Admin → Backup & Settings.';
      if (res.status === 429) detail = 'Rate limited — wait a moment and try again.';
      if (res.status === 529) detail = 'The AI service is briefly overloaded — try again in a minute.';
      return { error: 'api', detail };
    }

    const body = await res.json();
    if (body.stop_reason === 'refusal') {
      return { error: 'refusal', detail: 'The AI declined that request — try rephrasing.' };
    }
    const text = (body.content || []).find((b) => b.type === 'text')?.text;
    if (!text) return { error: 'empty', detail: 'The AI returned an empty response — try again.' };
    try {
      const parsed = JSON.parse(text);
      // Normalize protocol steps
      if (parsed.protocol?.steps) {
        parsed.protocol.steps = parsed.protocol.steps
          .filter((s) => s.hz > 0 && s.seconds > 0)
          .map((s) => {
            const step = { hz: Math.min(100000, s.hz), seconds: Math.round(s.seconds) };
            if (s.sweepToHz) step.sweepToHz = Math.min(100000, s.sweepToHz);
            return step;
          });
        if (!parsed.protocol.steps.length) parsed.protocol = null;
      }
      return parsed;
    } catch {
      return { error: 'parse', detail: 'Could not read the AI response — try again.' };
    }
  }

  return { ask, hasKey };
})();
