# Le Parfumier: Schedule

**Live: https://draft.j3taviation.com/leparfschedule/** — store code `4545`

Staff scheduling for the three Le Parfumier stores (PL, PB, PV). Static app, no build
step: `index.html`, `style.css`, `app.js`. Data lives in Supabase (same project as the
FLAG pilot). Deploying is a push to `main` in `dalecci/draft`.

## How people use it

1. Type the store code `4545`. The device remembers it.
2. Tap your name. That is the whole login.
3. Left rail (bottom bar on a phone):
   - **Your schedule** — next two weeks, hours this week and next, anything waiting on you.
   - **Your week** — one week at a time, only your shifts.
   - **Master** — everyone at every store for the week, coverage bars per store per day,
     flags for anything the rules couldn't fix.
   - **Requests** — covers and switches, with a timeline for each.
   - **Manage** — only shows for people with the *supervisor* role.

## Covers and switches

Tap any shift.

- **Your own shift** → ask a colleague to *cover it* (they take it, you're off) or
  *switch* (you take one of theirs in return). Only people who work that store are offered;
  someone already scheduled that day or on a day off is shown as such.
- **Someone else's shift** → ask to *take it*, optionally offering one of yours.

Flow: request → colleague sees it under **Your schedule → Needs your attention** and says
yes or no → on yes the manager gets an in-app approval (badge on Manage/Requests) **and an
email** → manager approves or declines → on approve the shifts are reassigned and **locked**
so a later rebuild never undoes them. Both people are notified at every step.

Approval shows rule checks first: double-booking, store eligibility, weekly hour limit.

## The algorithm

Same shape as the Jaguars gym scheduler: hard rules filter what is allowed, a randomized
greedy pass fills the demand, a soft score keeps the best of many restarts, and locked
items are never touched.

For each week:

1. **Fixed** — locked shifts already in the week (approved swaps, manager pins) plus every
   *Needs to work* entry for those dates, inserted as a locked shift.
2. **Template** — each person's weekly availability (the spreadsheet), clamped to the store's
   hours, skipped on days they have off or already have a fixed shift.
3. **Gaps** — every store, every open minute, coverage below *minimum staff* is a gap.
4. **Fill** (repeated `restarts` times with shuffled order, keep the best score):
   - extend a shift already at that store that day, if it stays under *max shift length*
     and *max hours per week*;
   - otherwise call in a **flex** person (Katherine) who is free that day, never shorter
     than *min shift*, never past *max days per week*;
   - if *Anyone can be called in* is on, anyone from that store who is free that day.
5. **Score** — gap minutes weigh most, then hour/day limit breaches, then each call-in.

Anything still open is listed as a flag in Master and Week tools rather than papered over.
Weeks are built on first view (current + 6 ahead). **Manage → Week tools → Rebuild** re-solves
a week after a rule, availability or hours change; locked shifts stay.

### Rules (Manage → Rules)

| Rule | Default |
|---|---|
| Minimum staff on the floor | 1 |
| Max hours per week | 40 |
| Max days per week | 6 |
| Shortest call-in shift | 3h |
| Longest shift | 10h |
| Trim template shifts to store hours | on |
| Flex staff can be called in on OFF days | on |
| Anyone from that store can be called in | off |
| Solver attempts per week | 220 |

Also under Manage: **Team** (stores, home store, role, flex, email, active), **Availability**
(the weekly template per person), **Stores & hours**, **Time off & must-work** (adding either
rebuilds the affected week), **Settings** (supervisor email, store code).

## Supabase — one-time setup

1. Open the project's SQL editor and run `supabase/schema.sql` once. It creates eight
   `lps_` tables, opens them to the anon role (the app is PIN-gated, same convention as
   the other J3 apps) and enables realtime on shifts, swaps and notifications.
2. Reload the app. It seeds the roster, availability, store hours, time off and must-work
   from the spreadsheet on first load (`SEED` in `app.js`) and builds the first 7 weeks.

Until the tables exist the app runs in **this-device-only** mode (localStorage) so it can be
previewed; Manage shows an amber pill and the picker says so.

### Approval emails

Emails go through the Edge Function in `supabase/functions/lps-notify/index.ts` via Resend.

1. resend.com → create an API key (free tier). `onboarding@resend.dev` works as a sender for
   testing; add your own domain for real mail.
2. Supabase → Edge Functions → Deploy a new function → *Via editor* → name `lps-notify`,
   paste the file, turn **off** "Verify JWT".
3. Edge Functions → Secrets: `RESEND_API_KEY`, `LPS_FROM_EMAIL`.
4. Manage → Settings → *Send a test email*.

Without it, every request still lands in the manager's in-app queue; only the email is missing.

## Deploying

```
cd draft-clone
git add leparfschedule
git commit -m "leparfschedule: ..."
git push
```

Bump `APP_VERSION` in `app.js` and the `?v=` on `style.css` / `app.js` in `index.html`
whenever those files change, so phones don't keep the old build.

## Storage rule

Never rename the `lps_` tables or the settings keys. Add new columns and new settings keys;
the app treats missing values as defaults.
