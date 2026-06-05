# Building an Alpha-style AI Learning Portal for Sport-Études

*Research-backed build analysis — June 2026. Quebec basketball Sport-Études, French-language, MEQ curriculum / CEGEP pathway, ages ~12-17.*

---

## TL;DR (read this first)

1. **Alpha's "proprietary AI" is mostly repackaged third-party adaptive apps + a dashboard/analytics layer + heavy human motivation coaching.** The genuinely copyable part is the *operating model* (mastery gates, a single percentile scoreboard, daily data, a motivation loop, accountability adults). The "AI tutor" branding is overstated, and **every headline outcome stat is internal and unaudited.**
2. **You can absolutely build the portal** — and for a small school it's *cheaper and more honest* to build a thin custom portal on top of bought adaptive apps than to build "proprietary software." Realistic running cost: **~$30–100/month** infrastructure + adaptive-app seats, plus a one-time build.
3. **The hard constraints are not technical — they're legal and evidentiary.** Quebec **Law 25** governs everything you do with minors' data (parental consent under 14, mandatory privacy-impact assessment, and a documented assessment *before* sending data to any US service — Claude, OpenAI, US ed-tech). And you **cannot honestly guarantee top 2%** — the science supports *moderate* gains, not the 2-sigma/"top 1%" marketing.
4. **Recommended scoreboard:** MAP Growth is fine, but as a French/MEQ school you should seriously weight a French-language assessment and MEQ competency alignment alongside (or instead of) MAP. MAP is English-normed against a mostly-US public-school population.

---

## 1. What Alpha School / 2 Hour Learning / Timeback *actually* is

**Separate the model from the marketing.** Cross-corroborated across WIRED (Oct 2025), 404 Media (Feb 2026), CNN (Jan 2026), NEPC, Dan Meyer, and the company's own sites:

| Component | Reality |
|---|---|
| **"2 Hour Learning"** | The instructional model/operating company. ~2 hrs/day core academics via software; ~4 hrs "life skills" workshops. |
| **"Timeback"** | The proprietary platform (delivery + testing + progress tracking + engagement monitoring). Company calls it a "$100M+ / 10x faster" project — **self-reported, unverified**. Waitlist-only, 2026 launch. |
| **The actual "AI"** | Largely **adaptive ed-tech apps + an analytics/curation layer**, *not* conversational LLM tutors. Independent reviewers (deeplearning.ai, Dan Meyer) say the "AI tutor" framing overstates it. |
| **App stack** | Math migrated **IXL → Math Academy**; reading/writing via proprietary **AlphaRead/AlphaWrite skins that route back to standard third-party engines**; also Khan, Amplify, Membean. *Much of the tech is not proprietary.* |
| **"Guides"** | Not teachers — motivation/mentorship/life-skills coaches. Company claims ~1:5 ratio and $100k min salary. |
| **Tuition / scale** | ~$10k–75k/yr (≈$40k typical, NY ~$65k). 15+ small campuses, PreK–12 "levels." |

### What to copy vs. what to avoid

**Copy (genuinely sound):**
- A **single percentile scoreboard** everyone watches.
- **Mastery gates** (don't advance on time; advance on demonstrated mastery).
- **Daily data** + fast intervention.
- **A motivation loop** ("earn your afternoon" — perfect for Sport-Études).
- **Accountability adults** whose job is effort/focus/morale, not lecturing.

**Avoid / be careful:**
- **The surveillance.** WIRED/404 reported eye-tracking + **at-home webcam monitoring on by default**. This is almost certainly unlawful under Quebec Law 25 without explicit, narrow consent — and a reputational landmine. **Do not copy this.**
- **Outsourced "coaching."** WIRED found 27 of 31 "coaches" were remote workers abroad. Your Sport-Études edge is *real, present* coaches.
- **Unaudited claims.** 404 Media's leaked docs showed Alpha's own staff flagged AI-generated lessons as sometimes doing "more harm than good," and that it scraped other courses without permission. **IXL terminated Alpha's account**, stating its product is "not a replacement for trained, caring teachers."
- **Is Timeback licensable?** It's the stated plan (already white-labeled to "Unbound Academy," which was *approved in AZ but rejected in AR, PA, UT*). But it's pre-launch, **no public pricing**, and tying your school to it imports all the above baggage. **Recommendation: don't wait for or license Timeback — build your own thin layer.**

---

## 2. The honest guarantee (this matters legally and ethically)

You cannot promise "top 2%." The evidence (see §8) supports *moderate* gains, and Alpha's percentile claims have a glaring selection-bias problem (self-selected $40k+ families vs. the general public-school MAP population — flagged by MIT's Justin Reich).

**Guarantee the process, report the outcome:**

> *"We guarantee individualized mastery tracking, weekly progress reporting against each student's personal growth targets, and rapid intervention when a student falls off pace — verified by independent assessment three times a year."*

Not: *"every child will be top 2%."* Set per-student **growth** targets (percentile *movement*), not absolute percentile promises.

---

## 3. Integration reality — what you can actually pull (and what you can't)

This is the single most important practical finding. **There is no magic unified API.** The realistic backbone is **OneRoster identity + per-vendor exports**, with only NWEA offering a real partner API.

| Platform | Integration path | Constraints | Verdict |
|---|---|---|---|
| **NWEA MAP Growth** | ✅ Partner REST **Data API** + scheduled **CSV/Comprehensive Data File** exports; OneRoster/Clever/ClassLink rostering | API requires NWEA partner *qualification* + district authorization ("Manage Data Partners"). CSV export available to any admin under license. | **Best case.** Start with CSV exports; pursue API later. |
| **Lexia Core5** | ✅ **Daily automated CSV exports** (per-activity rows) + OneRoster/Clever | Export-based, district-authorized. No open API. | Good, export-driven. |
| **IXL** | ✅ CSV score/analytics export + Clever/ClassLink/OneRoster SSO | **No public data-pull API.** Aggregation = export + roster matching. | Workable via export. |
| **Khan Academy** | ⚠️ District reporting console + roster sync; built-in NWEA integration | **No public reporting API found.** Manual/scheduled console export only. Districts tier ~$10–15/student, US-districts-only, 250 min. | Limited; consumer Khanmigo $4/mo. |
| **Math Academy** | ❌ **No official API/export/rostering.** Standalone (~$49/mo consumer). | Only "integration" is an unofficial browser extension scraping internal endpoints — fragile, against ToS. | **Treat as non-integrable.** Use its data manually or pick an alternative. |

**Standards reality:**
- **OneRoster (1.1/1.2)** via Clever/ClassLink is your **identity backbone** — one `sourcedId` maps a student across NWEA, IXL, Lexia, Khan. NWEA keys Student ID off OneRoster `UserSourcedID`.
- **LTI 1.3** = SSO/launch + grade passback (good for "click into the app," not bulk data pull).
- **Caliper/xAPI** = the *theoretically ideal* cross-app activity bus, but **none of these five vendors actually expose it** for this use case. Don't design around it.
- **Cost gotcha:** Clever/ClassLink are **free to schools but the app builder pays** (Clever Secure Sync ~$10.8k/yr floor). At your scale, **skip the brokers** and use CSV exports + manual roster mapping until volume justifies it.

**Practical takeaway:** v1 ingests **scheduled CSV exports** (MAP + Lexia + IXL) into your own database, matched by student ID. No partner programs, no broker fees. Pursue the NWEA API and Clever only if you scale.

---

## 4. Recommended architecture (MVP → v2)

You currently host static HTML on GitHub Pages. The portal needs auth + a database + role-based views + an AI layer. Don't overbuild.

### MVP stack (build this)
```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND  (Cloudflare Pages / Netlify — free)               │
│  Student view · Parent view · Guide/coach dashboard          │
│  (plain HTML/JS or a light framework — matches your stack)   │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (user JWT, anon key only)
┌───────────────▼─────────────────────────────────────────────┐
│  SUPABASE  (Postgres + Auth + Row-Level Security)  ~$25/mo   │
│  • students, parents, guides, enrollments                    │
│  • assessments (MAP/Lexia/IXL imports)                       │
│  • mastery_progress, practice_results, interventions         │
│  • RLS: parent sees only their child; guide sees only        │
│    assigned students; student sees only self                 │
└───────────────┬─────────────────────────────────────────────┘
                │ service key (server-only)
┌───────────────▼─────────────────────────────────────────────┐
│  SERVERLESS FUNCTIONS  (Cloudflare Workers / Netlify Fns)    │
│  • CSV import jobs (MAP, Lexia, IXL nightly/weekly)          │
│  • AI proxy: holds Claude API key, enforces per-student      │
│    rate limits, logs usage, strips PII before send           │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (ZDR API key, inference_geo)
┌───────────────▼─────────────────────────────────────────────┐
│  CLAUDE API  (AI tutoring layer — see §5)                   │
└─────────────────────────────────────────────────────────────┘
```

**Why Supabase:** Postgres **Row-Level Security** enforces "parent sees only their child" *at the database layer* — defense-in-depth even if app code has a bug. This is exactly the role-based, privacy-sensitive model you need. Use **Pro ($25/mo)** not free, because free projects **auto-pause after ~1 week idle** (they'd sleep over school holidays). Critical footgun: the `service_role` key bypasses RLS — only server functions may use it; browsers use the anon key + user JWT.

**Build-vs-buy:** For dozens of students, off-the-shelf tools (Google Classroom free, Khanmigo $4/student/mo, MagicSchool, SchoolAI) are **teacher-productivity / generic-LMS tools** — none gives you a *custom per-student portal with parent/guide/student dashboards drawn from your own data*. That custom role-based portal is the one thing worth building. **Hybrid recommendation:** Google Classroom (free) for coursework + bought adaptive apps + **a thin custom Supabase portal** for the cross-app dashboard, mastery gates, and AI tutor.

### v2 additions
- NWEA partner API (replace CSV imports) + Clever/ClassLink rostering once volume justifies the fee.
- AI tutor chat embedded per-lesson with curriculum RAG.
- Automated weekly parent reports (batch-generated).
- "Time-back" gamification tied to the basketball schedule.

---

## 5. The AI tutoring layer (Claude API)

Five jobs: **diagnose gaps → assign next lesson → explain mistakes → generate practice → report progress.** Architecture:

- **Model routing (cost control):** **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`, ~$1/$5 per M in/out) for bulk practice-question generation and quick summaries; **Sonnet 4.6** (`claude-sonnet-4-6`, $3/$15) for explanations; **Opus 4.8** (`claude-opus-4-8`, $5/$25) for hard diagnostic reasoning over assessment data. Rough mix → most calls on Haiku.
- **Tool use:** Define JSON-schema tools the model calls — `fetch_student_assessment`, `get_next_lesson`, `save_practice_result`. Use `strict: true` so tool calls match your schema. The function executes against Supabase and returns a `tool_result`.
- **Curriculum RAG + prompt caching:** Chunk your MEQ-aligned curriculum, retrieve relevant lessons, and **cache the shared curriculum/system prompt** (`cache_control`) — cache reads are ~0.1× input price, ~90% savings on the reused corpus. Use **Citations** so explanations are grounded in *your* curriculum, not the model's general knowledge.
- **Guardrails for minors:** System prompt locks scope to tutoring; **Socratic style (guide, don't hand over answers)**; redirect off-topic; keep student input in `tool_result`/user turns, never in system instructions (prompt-injection hygiene); optional Haiku pre-screen of student input.
- **Privacy:** Anthropic does **not train on API data** by default; request a **Zero-Data-Retention API key** for student data, and use `inference_geo` routing. Send **student IDs, not names**, to the model. (Note: ZDR covers Messages/token-counting API; Batch API has 29-day retention and isn't ZDR-eligible.)
- **Cost control:** prompt caching > batch API (50% off, for nightly report generation) > model routing > streaming (UX only).

> **Important nuance for you:** Your tutor must operate **in French** and align to **MEQ competencies**. Claude handles French well, but your RAG corpus and rubrics must be the official Quebec curriculum — don't let the model default to US Common Core framing.

---

## 6. Tool & cost table (small school, dozens of students)

| Layer | Pick | Cost |
|---|---|---|
| DB + Auth + RLS | **Supabase Pro** | ~$25/mo |
| Hosting + functions | **Cloudflare Pages + Workers** (or Netlify free) | $0–5/mo |
| AI tutor | **Claude API** (Haiku-heavy + caching) | ~$5–50/mo at this scale (usage-driven) |
| Scoreboard | **NWEA MAP** (CSV export tier) | License quote-only; ~3×/yr testing |
| Math | Math Academy (~$49/mo/seat, standalone) **or** IXL | seat-based |
| Reading/ELA | **Lexia Core5** (best evidence) / IXL | quote-only school tier |
| Coursework hub | **Google Classroom** | free (Education Fundamentals) |
| **Custom portal infra subtotal** | | **~$30–80/mo** + adaptive-app seats |
| One-time custom build | freelancer/in-house + BaaS | wide range; BaaS removes the costliest part (auth/permissions) |

*Caveat: NWEA, IXL, Lexia, Khan-Districts institutional pricing are all **quote-only**. Khanmigo consumer ($4/mo) and Math Academy (~$49/mo) are the only firm public per-seat numbers.*

---

## 7. Legal & privacy — the part you cannot skip (Quebec Law 25)

*(Sourced summary, not legal advice — confirm with a Quebec privacy lawyer before launch.)*

**Law 25 (Loi 25) — fully in force since Sept 22, 2024 — governs everything:**
- **Consent for under-14:** You need **parent/guardian consent** to collect/use/disclose a minor's data. (14+: minor or parent.)
- **Mandatory roles/process:** A **privacy officer** (defaults to your top executive), and a **Privacy Impact Assessment (EFVP/PIA)** is required when you build a system handling personal info **and again before transferring data outside Quebec.** Using an AI to infer things about a student (e.g., dropout-risk flags) is itself a *collection* that triggers Law 25 — the CAI already ruled on exactly this for a school board.
- **Cross-border (the crux):** Law 25 is **not data-localization** — it's *assess-before-transfer*. Before sending data to any US service (Claude, OpenAI, AWS, US ed-tech), your PIA must document that the destination gives **adequate protection**, accounting for US government access powers (CLOUD Act, FISA 702), backed by a **written contract**. Anthropic's ZDR + `inference_geo` and AWS/Vertex regions help mitigate but don't fully erase US-parent-company jurisdiction.
- **Minors get heightened protection;** profiling/targeted advertising/"dark patterns" aimed at minors are restricted.
- **Teeth:** administrative penalties up to **CAD $10M or 2% of turnover**; penal fines up to **$25M or 4%**.

**US laws (indirect but real):** FERPA/COPPA bind the *US vendors*, and you inherit those obligations through their terms. The school can consent on students' behalf **only for educational purposes — no commercial use, no ad targeting, no training unrelated products.** The FTC's *IXL* amicus brief warns school consent does **not** bind parents to a vendor's *extraneous* terms (e.g., arbitration). **Anthropic API and OpenAI API do not train on your data by default**; OpenAI requires **ZDR enabled** before processing under-13 data.

**Action items before any student data flows:**
1. Appoint a privacy officer; publish a privacy policy (French).
2. Run a PIA covering the portal **and** each cross-border transfer (Supabase region, Claude, each adaptive app).
3. Get explicit, granular **parental consent** (separate consent for the AI tutor).
4. Prefer **Canadian/EU data regions** where the vendor offers them (Supabase lets you pick region; use a Canadian one).
5. **Send IDs, not names**, to the LLM; sign DPAs/ZDR with Anthropic.

---

## 8. Does the model actually work? (honest evidence base)

- **The "2-sigma / top 1%" story is not credible as a target.** Bloom's 2-sigma is largely non-replicated (replications ~0.5σ). Mastery-learning meta-analyses show a **moderate ~0.5σ** effect. High-quality 1:1 tutoring ≈ **+5 months** (EEF). RAND's rigorous 2017 personalized-learning study found only **modest, highly variable** effects — some schools *negative*.
- **Product evidence (independent, ESSA):** **Lexia Core5 = "Strong"** (best-evidenced of the set). **IXL** = a Johns Hopkins RCT reported at Tier 1 (verify independence) + earlier Tier 2. **Khan** has a solid U-Toronto RCT but leans on correlational SAT data; **Khanmigo (AI tutor) has no independent efficacy evidence yet.** ⚠️ **Name trap:** independent evidence for *"My Math Academy"* (Age of Learning, ESSA-rated) is a **different product** from *"Math Academy"* (mathacademy.com), which has **no independent peer-reviewed studies.**
- **Alpha's "2 hours" claim** is internal/unaudited; NEPC and named experts call the magnitude implausible and note selection bias. PA regulators called the model "untested."

**Bottom line:** The *ingredients* (mastery, more efficient time-on-task, tutoring, fast feedback) have **moderate, real** support. The advertised *magnitude* does not. Build for solid, measurable growth — and let the basketball motivation + present coaches be your genuine differentiator.

---

## 9. Phased build plan

**Phase 0 — Legal foundation (do first, in parallel):** privacy officer, PIA, parental consent forms (French), pick Canadian data regions, vendor DPAs. *Nothing ships before consent exists.*

**Phase 1 — MVP (the scoreboard portal):**
- Supabase schema (students/parents/guides/assessments/mastery) + RLS.
- Role-based dashboards: student, parent, guide.
- **Manual/CSV import** of MAP + one adaptive app (Lexia or IXL).
- Per-student page: current percentile, growth vs. target, weak skills, weekly goal, intervention notes.
- Hosted on Cloudflare/Netlify.

**Phase 2 — Mastery + motivation:**
- Mastery gates (90% rule) and "on-pace / off-pace" flags.
- **"Time-back" mechanic** tied to the afternoon basketball schedule.
- Automated weekly parent report (batch-generated by Claude).

**Phase 3 — AI tutor:**
- Claude tutor with curriculum RAG (MEQ, French), tool use against Supabase, ZDR key, guardrails.
- Diagnose → assign → explain → practice → report loop.

**Phase 4 — Scale integrations:**
- NWEA partner API, Clever/ClassLink rostering, deeper analytics — only when student volume justifies the fees.

---

## 10. Key risks & honest caveats

- **Legal is the gating risk, not code.** A Law-25 misstep with minors' data carries real fines and reputational harm. Treat Phase 0 as non-negotiable.
- **No unified integration API exists** — budget for the unglamorous CSV-import plumbing, and drop Math Academy from any automated pipeline.
- **You cannot guarantee percentile outcomes** — guarantee process + measured growth.
- **Don't copy the surveillance.** It's the part of Alpha most likely to be illegal here and most corrosive to trust.
- **French/MEQ fit:** MAP is English/US-normed; weight a French assessment and align AI + curriculum to MEQ competencies. This is where "copy Alpha exactly" breaks for your school.
- **Research caveats:** several primary sources (Alpha's internal data, vendor RCTs, some Law-25 minor clauses) are self-reported or behind paywalls/403s — figures above are cross-corroborated but verify primaries before publishing claims or signing contracts.

---

*Sources span: alpha.school / 2hourlearning.com / timeback.com (company); WIRED, 404 Media, CNN, NEPC, Dan Meyer, RAND, EEF, Evidence for ESSA (independent); developers.nwea.org, ixl.com, lexialearning.com, khanacademy.org, 1edtech.org, clever.com, classlink.com (vendor docs); cai.gouv.qc.ca, BLG/Osler/Torys, ftc.gov, studentprivacy.ed.gov (legal); platform.claude.com/docs (Claude API).*
