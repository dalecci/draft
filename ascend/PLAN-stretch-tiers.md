# Ascend — Stretch Tiers: above-grade "Grade 6" questions inside Grade 5 (PLAN)

*Planning doc. Goal: within a grade, mastery becomes two-tiered — **on-grade** and **above-grade (stretch)** — so a skill can be "mastered to Grade 5" (e.g. 28/30) and separately "4/10 toward Grade 6," or fully "mastered to Grade 6 level." The child always KNOWS a stretch question is above grade level.*

## The concept

Today mastery is one number per skill (SmartScore → 100). This adds a **second, clearly-labeled track**: harder "Grade 6" variants of the same skill. Mastery becomes a **tier**:

| Tier | Meaning | How reached |
|------|---------|-------------|
| ⚪ Learning | still building on-grade | on-grade SmartScore < 100 |
| ⭐ Mastered (Grade 5) | solid at grade level | on-grade SmartScore = 100 |
| 🔥 Mastered+ (Grade 6) | above grade level | on-grade mastered **and** stretch track mastered |

And the parent sees the in-between: *"Grade 5: mastered. Grade 6: 4/10."* — exactly your example.

**Why it's worth building:** it rewards depth instead of just completion, keeps advanced kids (like Jayden) challenged instead of bored, gives parents a truer picture ("mastered — and reaching above grade level"), and creates a natural on-ramp to actually moving up a grade.

## Data model

- **Per skill:** an optional `stretchGen` (a harder, Grade-6-level generator variant). Skills with no clean above-grade analog simply have none (no stretch tier offered).
- **Per-skill progress** gains a parallel stretch record:
  ```
  progress[skillId] = {
    score, attempts, correct, masteredAt,          // on-grade (existing)
    stretch: { score, attempts, correct, masteredAt } // above-grade (new)
  }
  ```
- **Tier** is derived: `none → learning → grade5 → grade6`.
- Backward compatible: missing `stretch` defaults to empty (Jayden/Jackson unaffected).

## Mastery rules (matches your 28/30 · 4/10 example)

- **On-grade** stays exactly as now (SmartScore to 100 — the "28/30" consistency bar).
- **Stretch unlocks** only after on-grade mastery (so it reads as a "next level," not a wall for a struggling kid).
- **Stretch progress** shows as a running count toward a target, e.g. **"4/10"**; **Grade 6 mastered** at a high bar (e.g. 8–9 of the last 10, or its own SmartScore to 100). Numbers are tunable.

## Where stretch questions appear (and stay clearly labeled)

1. **A "🔥 Grade 6 Challenge" mode** on any mastered skill — a dedicated set of above-grade questions. Header says **"Grade 6 · above grade level"** so it's unmistakable.
2. **Optional bonus injection:** during normal practice on a mastered skill, occasionally drop in a labeled **"🔥 Bonus — Grade 6"** question worth extra XP. The child sees the label every time.
3. Never silently mixed in — the label is the whole point ("but you have to KNOW it is Grade 6").

## Generators (the content work)

Build harder variants for generator families that have a clean above-grade analog — most do:
- integers → include negatives / larger magnitudes
- multiply → 3-digit × 2-digit; divide → 2-digit divisors with remainders
- fractions → unlike denominators + mixed numbers; multiply/divide fractions
- decimals → more places, multiply/divide decimals
- order of operations → add exponents + nested brackets
- percent / ratio → multi-step
- geometry → compound area, volume with fractions
- data → two-step interpretation

Each stretch item is **stress-tested + answer-verified** exactly like the on-grade generators. Skills without a sensible harder analog (some concept-MC / word problems) get **no stretch tier** in v1 — shown honestly as "no Grade 6 challenge yet," not faked.

## UX

- **Skill rows / progress:** a tier badge — ⭐ for Grade 5 mastered, 🔥 for Grade 6 mastered; mastered skills show a small **"Grade 6: 4/10"** meter.
- **Unlock moment:** finishing on-grade mastery pops a **"⭐→🔥 Grade 6 Challenge unlocked!"** celebration.
- **Mastery heatmap (parent):** grade-6-mastered cells get a **gold ring** on top of the green — you can see at a glance where he's working above level.

## Parent reporting

- Dashboard headline: *"Mastered: 40 at grade level · 6 above grade level (Grade 6)."*
- **Coach's Report** line: *"Jayden has reached Grade 6 level in 6 skills — he's ready to be stretched."*
- **"Ready to move up?"** prompt when above-grade masteries pile up → one-tap to add a **Grade 6 track** (ties directly into the multi-grade system already built) or bump his grade.

## Engagement hooks
- Badges: **"Above & Beyond"** (first Grade 6 mastery), **"Stretch Master"** (10 Grade 6), **"Ahead of the Class"** (25).
- Stretch questions pay **bonus XP/coins** (they're harder), reinforcing the aspiration.

## Phasing
1. **Dual-track mastery + labeled Grade 6 Challenge mode** for the skills with clean stretch generators; tier badges; parent counts + coach line.
2. **Full stretch coverage**, gold-ring heatmap, unlock celebration, bonus-injection, stretch badges.
3. **"Promote to Grade 6"** flow — when stretch mastery is broad, offer to open the real Grade 6 curriculum (built via the same multi-grade engine).

## Honest caveats
- In v1, **"Grade 6" = a modeled above-grade difficulty tier**, not an official B.E.S.T. Grade 6 standards mapping. It becomes a true grade link once we build the real Grade 6 curriculum and connect each skill to its Grade 6 successor (Phase 3).
- Keep stretch **opt-in / post-mastery** so it motivates the strong kid without discouraging one who's still building on-grade.
- Stretch content needs the same **teacher-vetting** pass as everything else.
