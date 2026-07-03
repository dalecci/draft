# Ascend — Grade 7 Math learning app (prototype)

A playful, kid-friendly student app + parent portal for a single fully-built
subject (**Grade 7 Mathematics, Florida B.E.S.T. aligned**). Built as a working
prototype: real mastery engine, real pacing/on-track math, real reports.

**Live (demo mode):** `https://draft.j3taviation.com/ascend/`

## What works right now (demo mode, no setup)
- **Student app** — home with progress ring + pace badge, "today's mission", a
  unit map, adaptive **Practice** (questions generated live from vetted templates,
  SmartScore-style mastery), and a **Progress** screen.
- **Parent portal** — family dashboard across demo children, and a per-child
  **report** with day / week / month toggle: questions, accuracy, time-on-task,
  skills mastered, per-topic breakdown, and **days ahead / behind schedule**
  against a target finish date + days/week + hours/day.
- **Pacing engine** — expected-vs-actual progress → "N days ahead/behind".
- **Double save** — every change is written to the device, mirrored to a second
  local copy, and (cloud mode) synced to Supabase; plus a one-tap **⬇ Backup**
  that downloads a JSON copy. Import/restore is the same JSON.
- **3 demo students** (ahead / on-pace / behind) with 4 weeks of seeded history.

The AI is **not** in the question-serving path: problems are generated
deterministically in the browser from parameterized templates (the safe design
we discussed). AI belongs in *authoring* templates and *diagnosing* patterns.

## Turn on REAL cloud (login + sync) — ~5 minutes
1. Create a free project at **supabase.com**.
2. Open the project's **SQL Editor**, paste **`supabase-schema.sql`**, Run.
3. **Authentication → Providers**: keep Email enabled (turn off "confirm email"
   for quick testing).
4. **Project Settings → API**: copy the **Project URL** and the **anon/public key**.
5. Copy `ascend-config.example.js` → **`ascend-config.js`** and paste those two
   values. Commit it (the anon key is public-safe; RLS protects the data).
6. Reload — the app now shows real email login and syncs per user.

> Send me the two values and I can wire `ascend-config.js` for you.

## Files
| File | Purpose |
|---|---|
| `index.html` | shell; loads Supabase (CDN), curriculum, app |
| `styles.css` | playful UI, mobile-first |
| `curriculum.js` | Grade 7 Math tree + question **templates** (generators) |
| `app.js` | auth, store + double-save, pacing, mastery, all views |
| `supabase-schema.sql` | table + Row-Level Security for cloud mode |
| `ascend-config.example.js` | template for your Supabase keys |

## Honest limits (prototype)
- Question templates are **demo content**, not teacher-validated — a real launch
  needs each template checked (the content-vetting work).
- One subject only (Grade 7 Math). The engine is subject-agnostic; more subjects
  are "just more template banks".
- Cloud auth/sync needs your Supabase keys (step above); demo mode is on-device.
