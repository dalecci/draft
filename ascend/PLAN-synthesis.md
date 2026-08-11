# What Synthesis Tutor brings that Ascend should steal (PLAN ONLY)

*Source: G5_Math_Tutor_Claude_Code_Spec.md (a Synthesis-method-inspired build spec from Chat).
This plan maps its ideas onto Ascend — adopt the pedagogy, not the rewrite.*

## The one-line take
Alpha School gave Ascend its **engine and fuel** (mastery gates, 2-hour compression, motivation
economy). Synthesis brings what neither had: **the learning science of the WRONG answer** —
diagnosing misconceptions instead of marking ❌, evidence-grade mastery, and calm repair.
They're complementary, not competing.

## What we already have (spec-compliant today)
- Deterministic math everywhere; no LLM judging answers (spec §1.1) ✓
- Learn-first lessons with worked examples, narration (partial CRA ladder) ✓
- Mastery gates before advancing; decay model (skillStrength) exists ✓
- Local-first storage + cloud sync; no third-party tracking; no chat ✓
- Parent Coach's Report ✓ (but it reports scores, not evidence — see S5)

## The six things worth adopting, ranked

### S1 — Misconception engine (the big one)
Spec: "Diagnose, don't merely mark wrong… a red X followed by the answer is prohibited."
Today Ascend shows the explanation after a miss. Synthesis maps each wrong answer to a
NAMED misconception and routes to a 1–3 screen repair.
Build on Ascend:
- `MISCONCEPTIONS`: per generator-family detectors run on the kid's actual wrong answer:
  - gave a+b when asked a−b (operation swap) · off by 10/100 (forgot the carry/borrow)
  - digit-wise |a−b| (subtracted the smaller digit "upward" — the classic borrowing bug)
  - fractions: n1+n2/d1+d2 (added the labels) · "1/8 > 1/4 because 8 > 4"
  - money: counted coins as 1¢ each · rounding: truncated instead of rounded
- On detection (2nd occurrence): auto-launch a REPAIR mini-lesson (the animated + narrated
  lesson engine already exists — author ~15 repair sequences) then 1 reduced + 1 varied check.
- Log misconceptionIds on misses; surface "recurring misconception" to the parent.

### S2 — Daily Warm-up: spaced retrieval queue
Spec: review at ~1/3/7/14/30 days as a 60–90s warm-up, never a surprise test.
Build: ReviewQueue per skill after first mastery; a "🔥 Warm-up (3 quick ones)" card gates
the day's first practice; passing feeds streak/quests. FRAGILE state when a review is missed
→ requeue + parent note. (We already have decay + fadedSkills; this formalizes it.)

### S3 — No false mastery
Spec: "Correctness with heavy hints is not mastery… SECURE requires separate sessions."
Build: mastery requires success across ≥2 days + first retrieval pass; answers given right
after re-opening the lesson or after seeing the explanation count as "assisted" (they help
SmartScore but can't complete the final mastery step).

### S4 — CRA ladder per skill (concrete → symbolic)
Spec: "Action before notation."
Build: for model-friendly skills (money, place value, fractions, arrays, clock), the learn
path becomes lesson → 1–2 Build It construct tasks (engines exist) → numeric practice.

### S5 — Parent report v2: evidence + a 5-minute real-world action
Spec's example: "She still sometimes treats a larger denominator as a larger piece.
Next: cut two equal sandwiches into 4 and 8 pieces and ask which piece is bigger."
Build: report per unit = state (Emerging/Developing/Secure/Fragile) + recurring
misconception in plain English + one authored real-world activity. Never one "math score."

### S6 — Accessibility pack (cheap wins)
Read-aloud button on practice questions (speech engine exists), reduced-motion toggle,
larger-text option, keyboard-friendly answer entry; number-pad entry for Grade 2 on tablets.

## What NOT to adopt (and why)
- **The whole Next.js/TypeScript/Supabase-RLS rebuild** (spec §10): the value is pedagogy,
  not framework. Ascend's vanilla stack ships daily and is testable headlessly. Revisit only
  if the app outgrows itself.
- **Removing gamification** (spec bans streaks/leaderboards/time pressure): our Alpha-style
  economy is deliberate and working. Adopt the spirit where it's right: no time pressure in
  practice (already true), calm feedback wording, one goal per screen.
- Think-aloud recordings, PWA install, CI accessibility audits — later, if ever.

## Suggested order
S1 (misconception engine) → S2 (warm-up queue) → S5 (parent report v2) →
S3 (mastery hardening) → S4 (CRA paths) → S6 (accessibility pack).
S1+S2+S5 together ≈ one build cycle each; S3 touches recordAnswer so it ships alone.
