# Build Memo: AI Learning Platform for Florida ESA Families & Microschools

*Working draft for technical/project review — June 2026. ~2–3 pages.*

## The idea in one paragraph

Build the **operating system for an ESA-funded homeschool family or microschool in Florida** — software that aggregates each student's progress, runs mastery-based tracking, wraps a *safe* AI tutor/coach around vetted curriculum, and helps parents stay compliant with Florida's scholarship rules. It is modeled on Alpha School's *operating model* (mastery gates, one percentile scoreboard, daily data, motivation loop, accountability adults) — but **not** on Alpha's marketing (auto-AI-teaching, surveillance, guaranteed top-percentile outcomes), which is unproven and legally exposed. Florida is the right launchpad because the state barely regulates private schools and **pays for this category** via ESA dollars (PEP ~$8k/student; FES-UA ~$10k), spent through a pre-approved marketplace (MyScholarShop/EMA).

## What it is vs. what it is NOT

| It IS | It is NOT |
|---|---|
| An orchestration + tracking + coaching layer on top of vetted content | An AI that replaces the teacher / auto-generates the whole curriculum |
| A safe AI *assistant* with a human (parent/coach) in the loop | An unsupervised LLM left alone with thousands of kids |
| A measurement + reporting + compliance tool | A guarantee of "top 2%" or "2x faster" (false-advertising risk) |
| Original content aligned to public **Florida B.E.S.T.** standards | A reskin of IXL/Khan/Math Academy data (license violation; got Alpha terminated) |

## The product — three layers

1. **Tracking & dashboards (the core, lowest-risk).** Per-student record: current level, growth vs. a *personal* target, weak skills, mastery status (advance on demonstrated mastery, not time), intervention notes. Role-based views: student, parent, coach/guide. Automated weekly parent reports.
2. **AI coach (the differentiator, highest-risk).** A Socratic tutor that diagnoses gaps, recommends the next lesson, explains *why* an answer was wrong, and generates practice — grounded in our own curriculum (RAG), never handing over answers, scope-locked to tutoring. Human stays in the loop.
3. **Compliance copilot (the wedge, most underrated).** Helps PEP parents build the required **Student Learning Plan**, choose approved curriculum, track toward the mandatory **norm-referenced test**, and spend ESA funds correctly. This is a real, recurring, fundable pain point that incumbents ignore.

## Content: the real moat (and the AI shortcut)

IXL's advantage is **not** its tech — it's ~25 years of vetted, standards-aligned, difficulty-calibrated items plus efficacy evidence. We **cannot copy their content** (illegal + kill-switch risk), but skills, sequence, and public standards are free to align to. **AI compresses the slow part:** we can generate B.E.S.T.-aligned items with explanations in months, not decades. The catch — and the actual product quality — is the **vetting/verification pipeline** on top of AI generation (AI item banks have wrong keys, ambiguous wording, mis-leveled difficulty). Calibration improves only with real student response data over time.

## Technology (intentionally boring)

- **Frontend:** lightweight web app (the school already ships static HTML; no heavy framework needed at first).
- **Backend:** a Backend-as-a-Service — **Supabase** (Postgres + Auth + Row-Level Security) so "a parent sees only their child" is enforced at the database layer. ~$25/mo.
- **Hosting + serverless functions:** Cloudflare/Netlify (free–$5/mo). Functions hold API keys, proxy AI calls, run import jobs.
- **AI:** **Claude API** with model routing (cheap model for bulk practice generation, stronger model for hard diagnosis), prompt caching to cut cost on the reused curriculum, and a **Zero-Data-Retention** key for children's data. The model is a commodity layer — *not* the moat.
- **Data integration reality:** there is **no unified ed-tech API**. Plan for CSV/export plumbing and a OneRoster-style student-ID backbone. Drop Math Academy (no integration path).

**Running cost is low** (~$30–100/mo infra at small scale + content + AI usage). The cost and risk are in **content vetting, trust/safety, and support** — not infrastructure.

## Distribution & business model

- **Channel:** get listed as an approved vendor in **MyScholarShop/EMA** (Step Up For Students vets vendors). That unlocks ESA spending — families pay with scholarship dollars, not out of pocket.
- **Customers:** (a) PEP homeschool families, (b) FES-UA families, (c) microschools/co-ops wanting a turnkey operating system.
- **Pricing:** per-student SaaS, comfortably inside the ESA budget. B2B tier for microschools.

## Phased plan to "success"

**Phase 0 — Foundation & legal (do first).** COPPA compliance (we become a data "operator": verifiable parental consent, notices, data minimization, deletion), privacy policy, vendor/DPA terms, Florida private-school registration if operating a school. **Nothing touches student data before consent exists.**

**Phase 1 — MVP (tracking portal, ~weeks).** Supabase schema + RLS; student/parent/coach dashboards; manual/CSV import of one assessment; mastery gates; weekly parent report. Pilot with **one** real microschool or a handful of homeschool families.

**Phase 2 — Content + AI coach.** Build the AI item-generation **and verification** pipeline against B.E.S.T. standards; ship the Socratic tutor with guardrails and human-in-loop; add the "earn your afternoon" motivation loop.

**Phase 3 — Compliance copilot + marketplace.** Learning-plan builder, norm-referenced-test tracking, ESA-spend helper; pursue MyScholarShop approval.

**Phase 4 — Scale.** More integrations, calibration from real response data, efficacy study (an RCT is the credibility unlock), then consider beyond Florida (where 50 different homeschool/privacy regimes await).

## Red zone — what's scary and what kills it

1. **AI as the teacher.** Auto-generated instruction at scale is unproven; Alpha's own leaked docs called it "more harm than good." Keep AI an *assistant*.
2. **Unsupervised LLM + minors.** Hallucinated facts, inappropriate content, a child in crisis mishandled. One bad screenshot is existential. Treat safety as safety-critical: guardrails, logging, human-in-loop, content moderation.
3. **Outcome guarantees.** "Top 2% / 2x faster" = FTC exposure. The science supports *moderate* gains. Promise process + measurement, never a percentile.
4. **Content rights.** Reselling another vendor's engine is the IXL-termination trap. Own/license/generate-and-vet your own.
5. **Data custody at scale.** A breach of thousands of children's records is catastrophic. Security is non-negotiable.
6. **Special-needs (FES-UA) promises.** Highest budget, highest liability — be especially careful.

## The two questions that decide viability

1. **Can a human (parent/coach) stay meaningfully in the loop**, so AI is an assistant not the teacher? If the economics only work when AI *is* the teacher, it's in the red zone.
2. **Can we own/clean-license our content** rather than quietly reselling someone else's? If not, there's a kill-switch waiting.

## Specific questions for the experienced reviewer

- Build the custom portal on a BaaS (Supabase) vs. extend an existing LMS? Where's the right build/buy line?
- Is the AI item-generation + verification pipeline a realistic small-team build, or the part that secretly eats the whole budget?
- Realistic team, timeline, and burn to a credible Phase-1 pilot?
- What's the cheapest experiment that would falsify the core bet *before* heavy investment?
- Biggest technical risk you see that this memo underweights?

---
*Honest caveat: independent evidence supports the model's ingredients (mastery, fast feedback, time-on-task efficiency) at moderate effect sizes — not the transformational magnitudes Alpha advertises. The defensible win here is a trustworthy operating system for ESA families, with measured growth and present human coaching as the real differentiators.*
