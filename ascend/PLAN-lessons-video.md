# Ascend — Teaching Before Each Skill: Video vs. Animated Lessons (PLAN)

*Planning doc. Goal: a real "teach it first" moment before each skill — ideally video, or a fun, cool-looking lesson if video isn't practical.*

## What already exists
There's already a **learn-first gate**: the first time a kid hits a new skill, `renderLesson` shows a text lesson (concept + worked example + key words + misconception + why), and if no authored lesson exists it **synthesizes one from a real worked example**. So we're *upgrading* this, not starting from zero.

---

## Part A — Real videos: honest feasibility

**Short answer: hard and expensive at our scale — not because the player is hard, but because of content volume, our offline model, and kid-safety.**

Three ways to get video, and why each is tough:

1. **Produce our own** (record or animate a clip per skill)
   - We have **~1,100+ skills** across Grade 2/3/5/6 math + Grade 5 science. That's 1,100+ scripted, produced, narrated clips. This is a studio-scale effort (months, real budget). **Not feasible for us to author.**

2. **Link to existing free videos** (Khan Academy / YouTube per skill)
   - Low effort *per skill* but still **~1,100 curation decisions**, and it **breaks two things the app relies on**: our **offline/no-CDN model** (the app inlines everything; a strict CSP blocks external embeds) and **kid-safety** (YouTube = ads, autoplay-next, comments, unvetted suggestions).
   - Workable as an **opt-in extra**, not a core requirement (see hybrid below), but not something to hard-require.

3. **AI-generated animated explainers** (text-to-video per skill)
   - Technically possible, but: quality is inconsistent for math notation, each clip needs **teacher review**, and storing 1,100 video files fights our lightweight/offline design. Best as a **future, high-traffic-skills-only** experiment.

**Verdict on video:** don't gate every skill behind a video we can't realistically make or safely host. Reserve video for an **optional per-skill link** teachers/parents can add.

---

## Part B — The recommended path: a fun, animated, *narrated* lesson (feasible now)

This gets ~90% of the "video feel" with ~5% of the cost, works offline, and reuses what we have. A lesson becomes a short, animated, tap-through "story":

1. **Mascot + intro** — a friendly character ("Professor Pi" / a dino for Jackson) says the concept in one sentence, with a bounce-in animation.
2. **Animated worked example** — the example builds **step-by-step on tap** (or auto-advances), each step sliding/fading in, numbers highlighting as they're used. (We already store worked steps; this just animates them.)
3. **"Watch it" visual demo** — for skills that have one, embed a mini **manipulative animation** (we already built base-ten blocks, fraction bars, arrays, clock, coins — reuse them in "demo mode" that animates the answer, then invites "now you try").
4. **Key words + "watch out"** — vocab chips and the classic misconception, styled and animated.
5. **"Why it matters"** — a real-world hook.
6. **Narration (the killer feature): read the lesson ALOUD** using the browser's built-in **Speech Synthesis (Web Speech API)** — tap ▶ to have the lesson spoken, word-by-word highlight optional. This gives a **video-like, audio-guided experience with ZERO video files, no production, and it works offline** on most devices. Kids who don't love reading get a "watch/listen" lesson; nothing to host.

**Why this is the right call:** it's genuinely engaging, costs almost nothing to run, respects the offline/no-CDN model, is 100% kid-safe (no external content), and it upgrades the gate we already have.

---

## Part C — Optional hybrid (best of both)
Add an **optional `videoUrl` per skill**. If a teacher/parent pastes a trusted link (e.g., a specific Khan Academy lesson), the lesson screen shows a **"▶ Watch the video"** button that opens it (in a new tab, or an embed when online). If there's no link, the animated+narrated lesson (Part B) is the default. This means:
- No requirement to source 1,100 videos.
- Families can enrich specific skills over time.
- Offline still works (falls back to the animated lesson).

---

## Part D — The real work: lesson *content*
The engine is easy; the content is the effort. For a great lesson on every skill we need authored `concept / steps / vocab / misconception / why` per skill (~1,100). Plan:
- **AI-draft** all of them (Claude, off the live path) → **teacher-vet** before shipping — same rule as the question generators.
- The **synthesized fallback already covers 100%** of skills today, so nothing is ever blank while authored content is filled in.
- **Phase by traffic**: author the highest-use skills first (early units of each grade), let the rest use the fallback.

---

## Data-model changes
- Extend the per-skill theory record: `concept, steps[], vocab[], misconception, why` (mostly exists) + optional `videoUrl`, `demo` (which manipulative to animate), `narration` (optional custom script; else auto-built from the text).
- No backend needed; lessons ship in the JS bundle like curriculum/theory.

## Effort & phasing
1. **Animated + narrated lesson engine** (Part B) over the existing lesson screen — the big UX win, buildable now. *(Moderate build: animation + Web Speech + demo reuse.)*
2. **Authored lessons** for high-traffic skills; fallback covers the rest. *(Ongoing content, AI-drafted + vetted.)*
3. **Optional per-skill `videoUrl`** hybrid. *(Small.)*
4. **AI-generated animation/video** for flagship skills. *(Later experiment.)*

## Honest caveats
- **Text-to-speech voice quality varies by device** (great on most phones/Chromebooks; robotic on some). It's a nice-to-have layer, not the whole lesson.
- **Authoring ~1,100 good lessons is the real cost** — AI drafts make it tractable, but it needs teacher review to be trustworthy.
- **Real video** stays optional/curated; we should not promise a produced video per skill.
