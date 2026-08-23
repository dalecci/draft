"use strict";
const BrainAI = /* @__PURE__ */ (() => {
  const API_URL = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-5";
  const OUTPUT_SCHEMA = {
    type: "object",
    properties: {
      reply: { type: "string" },
      protocol: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            properties: {
              name: { type: "string" },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    hz: { type: "number" },
                    seconds: { type: "integer" },
                    sweepToHz: { anyOf: [{ type: "number" }, { type: "null" }] },
                    pulseHz: { anyOf: [{ type: "number" }, { type: "null" }] }
                  },
                  required: ["hz", "seconds", "sweepToHz", "pulseHz"],
                  additionalProperties: false
                }
              }
            },
            required: ["name", "steps"],
            additionalProperties: false
          }
        ]
      }
    },
    required: ["reply", "protocol"],
    additionalProperties: false
  };
  function apiKey() {
    return (Store.setting("anthropic_key", "") || "").trim();
  }
  function hasKey() {
    return apiKey().startsWith("sk-ant-");
  }
  function kbDigest() {
    return Brain.all().map((e) => {
      if (e.noReliableListing) {
        return "- ".concat(e.condition, " [").concat(e.category, "]: NO reliable CAFL listing \u2014 do not invent numbers; nearest option is the Mold & Fungus General core (728/784/880/464).");
      }
      return "- ".concat(e.condition, " [").concat(e.category, "] (").concat(e.source, "): ").concat(e.frequencies.join(", "), " Hz \u2014 default dwell ").concat(e.dwell || 180, "s");
    }).join("\n");
  }
  function trainingDigest() {
    const lines = [];
    for (const t of Brain.allTraining()) {
      const ref = Brain.get(t.ref_id);
      const name = ref ? ref.condition : t.ref_id;
      if (t.kind === "tuned-protocol" && t.payload.steps) {
        lines.push("- Tuned protocol for ".concat(name, ": ").concat(t.payload.steps.map((s) => "".concat(s.hz, "Hz\xD7").concat(s.seconds, "s")).join(", ")));
      } else if (t.kind === "rating") {
        lines.push("- Session rating for ".concat(name, ": ").concat(t.payload.rating, "/5").concat(t.payload.notes ? ' \u2014 "'.concat(t.payload.notes, '"') : ""));
      }
    }
    return lines.length ? lines.join("\n") : "(no training yet)";
  }
  function systemPrompt() {
    return 'You are The Brain \u2014 the AI protocol designer inside Vibrant Resonance, a pure sine wave frequency studio used by Vibrant Complete Health, a wellness practice. You converse with the practitioner running the app and design Rife/CAFL-style frequency protocols they can run immediately on this device.\n\nHow to build protocols:\n- Draw on the clinic\'s knowledge base and training below FIRST (their own research and tuned protocols take priority), then your broader knowledge of published Rife/CAFL frequency listings.\n- Default dwell is 180 seconds per frequency. For "extra strength" / "aggressive" / "maximum" requests: extend dwells on the primary frequencies (300\u2013420s), add closely related documented frequencies from the same organism family, finish with the core cleanup cluster 728 / 784 / 880 / 465, and consider a second pass of the primary frequencies. Keep total time practical (under ~90 minutes unless asked for more).\n- The device plays pure sine tones from 0.1 to 100,000 Hz. A step may optionally sweep from hz to sweepToHz over its duration (set sweepToHz to null for a fixed tone). A step may also set pulseHz to amplitude-pulse the tone at that rate (else null) \u2014 pulseHz: 40 on a comfortable carrier (~700 Hz) is the research-backed gamma-entrainment mode (MIT GENUS: 1 hour daily for cognition/dementia support).\n- Use frequencies from documented Rife/CAFL listings or the knowledge base and say which source a set comes from. Never invent precise frequencies and present them as documented.\n\nHonesty rules (strict but brief):\n- These are historical practitioner listings, not clinically validated treatments. Never promise eradication, cures, or same-day kills. If asked for "gone today / dead today", build the strongest reasonable protocol AND include one plain sentence that no frequency protocol is proven to do that \u2014 prescription antiparasitics from a doctor are the proven kill, and frequency work is complementary. One sentence, not a lecture, then deliver.\n\n'.concat(typeof AudioEngine !== "undefined" && AudioEngine.vm15 ? "DEVICE MODE: VM15 vibration-plate mode is ON (".concat(AudioEngine.vm15Mode.toUpperCase(), "). This device drives a Sonic Life SW-VM15 whole-body vibration platform (3\u201370 Hz mechanical band, intensity dial 0\u201399) through its Audio-In. ").concat(AudioEngine.vm15Mode === "dual" ? "DUAL mode: each frequency above 68 Hz plays as TWO simultaneous real tones \u2014 the original (top) plus its octave-folded sub-tone (bottom) mixed together, so there is true signal energy at both frequencies and the plate physically moves on the bottom tone." : "FOLD mode: frequencies above 68 Hz are replaced by their octave-folded values inside the plate band (bottom tone only).", " When designing protocols here, frequencies at or below 68 Hz are native to the plate; mention plate intensity and stance when useful; the evidence-tier band (40 Hz gamma, 7.83 Schumann, 10 Hz alpha, 25\u201350 Hz muscle work) needs no folding.\n") : "", 'Reply style: warm, expert, concise \u2014 a knowledgeable colleague, not a disclaimer machine. Explain your frequency choices briefly.\n\nOutput JSON: "reply" = your conversational message (plain text, short paragraphs). "protocol" = the runnable protocol when you are proposing one, else null. Steps: hz (number), seconds (integer), sweepToHz (number or null).\n\n=== KNOWLEDGE BASE (this clinic\'s Brain) ===\n').concat(kbDigest(), "\n\n=== TRAINING (what the practitioners have taught the Brain \u2014 honor these) ===\n").concat(trainingDigest());
  }
  async function ask(history) {
    var _a, _b, _c;
    const key = apiKey();
    if (!key) return { error: "no_key" };
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
          messages: history.slice(-12),
          output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } }
        })
      });
    } catch (e) {
      return { error: "network", detail: "Could not reach the AI service \u2014 check the internet connection." };
    }
    if (!res.ok) {
      let detail = "HTTP " + res.status;
      try {
        detail = ((_a = (await res.json()).error) == null ? void 0 : _a.message) || detail;
      } catch (e) {
      }
      if (res.status === 401) detail = "The API key was rejected \u2014 re-check it in Admin \u2192 Backup & Settings.";
      if (res.status === 429) detail = "Rate limited \u2014 wait a moment and try again.";
      if (res.status === 529) detail = "The AI service is briefly overloaded \u2014 try again in a minute.";
      return { error: "api", detail };
    }
    const body = await res.json();
    if (body.stop_reason === "refusal") {
      return { error: "refusal", detail: "The AI declined that request \u2014 try rephrasing." };
    }
    const text = (_b = (body.content || []).find((b) => b.type === "text")) == null ? void 0 : _b.text;
    if (!text) return { error: "empty", detail: "The AI returned an empty response \u2014 try again." };
    try {
      const parsed = JSON.parse(text);
      if ((_c = parsed.protocol) == null ? void 0 : _c.steps) {
        parsed.protocol.steps = parsed.protocol.steps.filter((s) => s.hz > 0 && s.seconds > 0).map((s) => {
          const step = { hz: Math.min(1e5, s.hz), seconds: Math.round(s.seconds) };
          if (s.sweepToHz) step.sweepToHz = Math.min(1e5, s.sweepToHz);
          if (s.pulseHz) step.pulseHz = Math.min(200, s.pulseHz);
          return step;
        });
        if (!parsed.protocol.steps.length) parsed.protocol = null;
      }
      return parsed;
    } catch (e) {
      return { error: "parse", detail: "Could not read the AI response \u2014 try again." };
    }
  }
  return { ask, hasKey };
})();
