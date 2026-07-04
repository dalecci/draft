# Ascend v2 Plan: Teaching, Parent Command Center, and FAST Prep

*Planning doc — not yet built. The vision for turning Ascend from a practice app into the thing a parent switches to.*

## The core insight (our unfair advantage)

Because every question is generated from a **vetted template**, we can do something IXL/Khan can't hand a parent cleanly: **take the exact question a child missed and instantly produce unlimited fresh variants of that same type.** That closes a loop nobody else closes for parents:

> **miss → see the concept → practice the same type → prove it's fixed.**

Everything below is built around making that loop effortless, and around fixing the current gap: **there is no teaching — kids see numbers, never the concept first.**

---

## Part A — Teaching layer (theory before numbers)

Right now a student jumps straight into practice. We add a **mini-textbook** so a concept is taught before it's drilled.

**Content model — add a `theory` block to every skill:**
- `concept` — plain-language explanation ("what this is / how to do it")
- `worked` — one fully worked example, revealed step-by-step
- `vocab` — 2–4 key terms defined
- `misconception` — the classic mistake + how to avoid it ("watch the sign when…")
- `why` — one line on why it matters / where it shows up
- `sectionRef` — a stable "textbook" address, e.g. **§3.2**, so the parent portal can deep-link to the exact page

**Structure it like a book:** each **unit = chapter**, each **skill = section** (§1.1, §1.2…). This gives every question a home in the "theory book," which is exactly what the parent review flow links to.

**How teaching shows up:**
1. **Learn-first gate** — starting a new skill opens a **Lesson card** (concept + worked example) before the first question. Quick, skimmable, not a wall of text.
2. **Reteach anytime** — a "📖 Learn this" button on every practice/skill screen re-opens the lesson.
3. **Auto-surface on struggle** — after 2–3 misses on a skill, the lesson pops back with "Let's review the idea."
4. **Later:** short explainer animations/video per section; an AI "explain it another way" button (Claude, authoring-side, vetted).

*(Content is AI-drafted → teacher-vetted, same rule as the item templates.)*

---

## Part B — The missed-question review loop (the killer parent feature)

**Capture misses in full.** Today we log correct/incorrect by skill. We start logging the **actual missed item**: `{ ts, skillId, unitId, prompt, studentAnswer, correctAnswer, explanation }`.

**Parent portal → "Needs review" feed:**
- Grouped by skill, newest first.
- Each entry shows: the **subject/unit**, the **exact question missed**, what the child answered vs. the right answer, and the **worked explanation** (we already generate it).
- A **"📖 Review the concept"** button → deep-links to the theory section (§) for that skill — *"the specific part of the theory book"* you described.
- A **"🔁 Practice 5 like this"** button → generates 5 fresh variants of that exact template and **assigns them to the child** (or lets the parent sit and do them together).
- When the child completes the assigned set, the parent sees **"fixed ✓" or "still shaky"** — the loop closes and reports back.

**Why this wins transfers:** a parent's #1 frustration is *"I can see a red X but I don't know what to do about it."* We turn every red X into: here's the idea, here's the page, here are 5 more to practice, here's proof it's fixed.

---

## Part C — FAST prep (Florida's test is the scoreboard parents care about)

**FAST Readiness score.** Roll per-skill mastery up to a **per-standard readiness**, then to a **projected FAST band** (clearly labeled a *modeled estimate*, not a promise). Parents see "On track for Level 3–4, weakest in Geometry."

**Recency / decay model (spaced repetition).** Track `lastPracticedAt` per skill. Mastery **fades over time** — a skill aced 6 weeks ago is a review risk. A suggestion engine ranks what to do next by:
`low mastery  ×  high FAST weight  ×  long time since practiced`
→ "You mastered circles 6 weeks ago — likely faded. Quick review recommended."

**FAST Prep Plan.** Auto-build a schedule of *review-the-faded* + *fix-the-weak* + *learn-the-new*, timed to the next **PM1/PM2/PM3** date. One tap: **"Build me a 20-minute prep session."**

**Mock FAST test.** A timed, mixed, B.E.S.T.-aligned practice test that mimics the real adaptive format, scored to a projected band, with a per-standard breakdown afterward (which feeds the review loop in Part B).

---

## Part D — Parent tools that actually drive the switch

The parent portal becomes a **command center**, not a report:
- **Needs-review feed** (Part B) — the anchor feature.
- **Projected FAST band + trend** (Part C).
- **Recency alerts** — "3 topics are fading, tap to refresh."
- **Weekly digest** — auto-written summary (Claude, off-path): what improved, what's stuck, a recommended 20-min plan. (Email once cloud is on.)
- **"What my kid is learning this week"** — the theory sections, so a parent can actually help at the table.
- **Assign practice / set goals / adjust pace** (pace editor exists) + **nudge the student**.
- **Mastery heatmap** — every B.E.S.T. standard as a colored grid: green mastered, yellow shaky, grey not-yet, faded = striped. One glance = the whole picture.
- **Compliance copilot** (the PEP wedge) — help build the Student Learning Plan and track the annual norm-referenced test.
- **Multi-child dashboard** (exists) — polished.

---

## Part E — Look, feel, and overall experience

**Design system pass:**
- Consistent type scale, spacing, and a unified card system; calmer parent side, playful student side.
- **Dark mode**, better empty states, loading/skeleton states, and micro-interactions.
- **Charts** for parents: sparklines, a trend line, the mastery heatmap.
- **Onboarding** — a first-run flow (pick avatar, set the goal/target date, quick tour).
- **PWA** — installable to the home screen, works offline, feels like an app (big for daily-habit retention).
- Accessibility + mobile polish throughout.

---

## Data-model changes required
- **curriculum.js**: add `theory` per skill (`concept/worked/vocab/misconception/why/sectionRef`); add chapter numbers per unit.
- **student**: add `misses[]` (full missed items), `lastPracticedAt` per skill, an `assignments[]` queue, `taught{}` (which lessons seen).
- **FAST weights** per skill/standard.
- (No backend required for Phases 1–2; assignments/digest email need cloud later.)

---

## Phasing (highest value first)

**Phase 1 — Teaching + the review loop (no backend, biggest impact)**
- `theory` content for all Grade-7 math skills; Learn-first gate + Reteach.
- Capture full misses → **parent "Needs review" feed** with theory deep-link + **"Practice 5 like this"** assignment + fixed/shaky report-back.

**Phase 2 — FAST prep + spaced review**
- Recency/decay model + suggestion engine; per-standard readiness + projected band.
- FAST Prep Plan builder + Mock FAST test.

**Phase 3 — Command-center polish + design**
- Mastery heatmap, weekly digest (on-device first), onboarding, PWA, dark mode, charts.

**Phase 4 — Cloud-powered**
- Real accounts, emailed digests, teacher view, multiplayer Duel.

---

## Where AI (Claude) fits — always off the live path, human-vetted
- **Authoring** the theory sections and worked examples (drafted, teacher-checked).
- **"Explain my kid's specific mistake"** for parents, and the **weekly digest** (generated async, reviewed).
- **Never** grades or teaches a child live unsupervised — same guardrail as the rest of the product.

## Honest caveats
- **Theory content must be teacher-vetted** before it ships — it's the trust layer.
- **FAST projection is a modeled estimate**, labeled as such — never a guaranteed score.
- Phase 1–2 run fully on-device; digests-by-email and cross-device sync need the Supabase step.
