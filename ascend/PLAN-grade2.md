# Ascend — Grade 2 Math + Multi-Grade Architecture (PLAN)

*Planning doc. Grade 2 IXL scope: 39 topics (A–MM), ~354 skills. The build makes Ascend multi-grade so a family can have kids at different levels.*

## The real scope

Grade 2 is not just a second data file. Today the app hardwires **one** curriculum through the globals `CURRICULUM` and `ALL_SKILLS`, and every engine (pacing, mastery, heatmap, coach report, Sprint/Boss, lessons) reads those globals. Adding Grade 2 means:

1. Turn the single curriculum into a **registry of grades**.
2. Give every **student a `grade`**, and make the active curriculum follow whoever is being viewed.
3. Build the **Grade 2 question generators** + skill→generator mapping.
4. Let a parent **add a child and pick their grade** (Grade 2 for a younger sibling, Grade 5 for Jayden).

Jayden's Grade 5 experience must be untouched.

---

## Part A — Multi-grade architecture (the core change)

**Curriculum registry.** Replace the single `CURRICULUM` with:
```
CURRICULA = { g2: {subject:'Grade 2 Mathematics', units:[...]}, g5: {…existing…} }
ALL_SKILLS_BY_GRADE = { g2: [...flattened...], g5: [...] }
```
Each grade is built exactly like today (units → skills → `pickGen`).

**Per-student grade.** Add `student.grade` (`'g2'` | `'g5'`). `ensureStudentShape` defaults missing grade to `'g5'` so Jayden keeps working.

**Active-curriculum binding (low-risk approach).** The app always renders one student at a time. So at the top of `render()` (and when computing a specific child in the parent views), set the globals to that student's grade:
```
CURRICULUM   = CURRICULA[stu.grade]
ALL_SKILLS   = ALL_SKILLS_BY_GRADE[stu.grade]
```
Because every existing function reads those globals, they all "just work" for the active child — **no rewrite of pacing/heatmap/coach/games needed.** A helper `withGrade(stu, fn)` temporarily binds a child's curriculum to compute their pace on the family dashboard (which lists multiple children), then restores.

**Why not thread `grade` through every function?** That touches 40+ call sites and risks regressions. Rebinding the active curriculum is a few lines and keeps the blast radius tiny. (If we later want two grades on screen simultaneously, we refactor to explicit params — not needed now.)

---

## Part B — Grade 2 content tree (39 topics, ~354 skills)

Transcribe all A–MM units + skills verbatim (same structure as Grade 5's `UNITS` array). Topic groups:

- **Number & counting:** Counting (hundred chart, number lines), Comparing/ordering, Skip-counting & patterns, Names of numbers, Even/odd
- **Add/Subtract:** 1-digit strategies + facts, 2-digit (with/without regrouping), 3-digit, mixed operations, word problems, properties, fact families
- **Place value:** tens/ones → hundreds → thousands, regrouping, expanded form
- **Repeated addition & arrays** (pre-multiplication)
- **Estimation & rounding** (to nearest ten/hundred)
- **Money:** coins, counting to \$1 / \$100, making change, add/subtract money
- **Time & calendars:** clocks (analog/digital), A.M./P.M., months, reading calendars
- **Data & graphs:** tally, picture graphs, bar graphs, line plots, tables
- **Measurement:** customary + metric length
- **Geometry:** 2-D shapes (sides/vertices, polygons), 3-D shapes (faces/edges/vertices), area & perimeter (tiling)
- **Fractions:** identify/make halves, thirds, fourths, eighths
- **Financial literacy:** spending/saving, deposits/withdrawals, producers/consumers

Each unit gets a color + icon; each skill an id (`A1`, `B3`, …) and a generator via a Grade-2 `pickGen`.

---

## Part C — Grade 2 generators (correct, auto-verified)

Reuse where the math is identical (parameterized): `addSub`, `placeValue` (tens/ones), `roman` (I/V/X only), `money`, `area`, `perimeter`, `polygon`, `classQuad`, `pattern`, round-to-ten.

**New Grade-2 generators to write:**
- `skipCount` (by 2/5/10/100, forward & backward), `countForward`
- `compareNum` (up to 100 / 1,000), `orderNum`
- `evenOdd`, `beforeAfterEvenOdd`
- `doubles`, `nearDoubles`, `makeTen`, `countOn`, `addThreeOneDigit`, `addFourPlus`
- `subCountBack`, `useTenToSubtract`
- `regroupTensOnes`, `expandedFormHundreds`, `digitValue` (tens/ones/hundreds)
- `repeatedAddition` / `arrays` (equal groups, sums to 25)
- `factFamily`, `relatedFacts`, `addInAnyOrder`
- `roundTen`, `roundTenHundred`, `estimateSum/Diff` (2-digit)
- `countCoins`, `coinValue`, `makeADollar`, `makeChange`, `enoughMoney`
- `clockTime` (hour/half-hour → to 5 min), `amPm`, `relateTimeUnits`
- `calendarMonths`, `daysInMonth`, `readCalendar`
- `readTally`, `readPictograph`, `readBarGraph`, `readLinePlot`
- `measureLength` (customary/metric, which-unit)
- `sidesVertices`, `name2DShape`, `faces3D` (vertices/edges/faces), `name3DShape`
- `tileArea`, `countSquares`
- `identifyFraction` (halves/thirds/fourths/eighths), `makeFraction`, `countFractionParts`
- `financialLiteracy` (spend/save, deposit/withdraw, producer/consumer — MC concept)

Every generator returns the same `{type, prompt, answer, choices?, explanation}` shape and gets **stress-tested + answer-verified** exactly like Grade 5 (156k-item sweep, independent answer re-derivation). Same honesty caveat: visual/model/word-problem skills (clocks to draw, shapes to trace, "use models", tally-from-picture) practice the underlying math via the closest computational/MC generator; true visual interactions are a later specialization.

---

## Part D — Parent: add a child & pick a grade

- Family dashboard gets **"➕ Add a child"** → name, avatar, **grade (2 or 5)**, target finish date, days/week, hours/day.
- Each **child tile shows a grade chip** ("Grade 2" / "Grade 5").
- Parent can **change a child's grade** in the plan editor (with a warning that progress is per-grade).
- New child starts from zero in their grade; pacing/coach/heatmap all reflect that grade automatically (Part A binding).

This directly supports the likely use case: **Jayden (Grade 5) + a younger sibling (Grade 2)** under one family cloud account, each with their own dashboard, pace, and games.

---

## Part E — What already works for free (thanks to generic engines)

Once Part A + B + C land, these need **zero** extra work because they read the active curriculum:
- Pacing (skills/day, days ahead/behind, projected finish)
- Mastery / SmartScore, daily & weekly goals
- Coach's Report, mastery heatmap, projected FAST-style band
- Math Sprint, Boss Challenge (per Grade-2 unit), FAST Practice mock
- Lessons (synthesized worked example per skill), Needs-review loop, assignments
- Badges (mastery/topic thresholds scale to each grade's counts)
- Cloud sync (state already carries each student + grade)

---

## Data-model changes
- `student.grade` (default `'g5'` via migration).
- `CURRICULA` registry + `ALL_SKILLS_BY_GRADE`; `blankStudent(name, avatar, grade)`.
- Parent add-child + grade selector; grade shown on tiles + editable in plan.
- No Supabase schema change (state blob already holds it).

## Phasing
1. **Multi-grade core + Grade 2 tree + generators + add-child/grade UI.** Verified end-to-end; Jayden unaffected. *(This is the bulk.)*
2. **Authored theory** for Grade 2 key skills; specialize high-value generators (show regrouping, real arrays, clock faces).
3. **Polish:** grade-appropriate visuals, richer visual/word-problem items, per-grade avatars/themes.

## Honest caveats
- Grade 2 leans **visual** (clocks, shapes, tallies, base-ten models). The computational core will be real and answer-verified; pixel-accurate visual interactions come in Phase 2–3.
- Content is generated + should get a **teacher-vetting pass** before real classroom use, same rule as Grade 5.
- Decision to confirm: is Grade 2 for a **new (younger) child** or for Jayden? The plan assumes **multiple children at different grades** (the general, most useful answer) — a sibling on Grade 2 alongside Jayden on Grade 5.
