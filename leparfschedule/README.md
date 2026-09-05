# Le Parfumier: Schedule

**Live: https://draft.j3taviation.com/leparfschedule/** — store code `4545`, then your name, then your PIN (Manager PIN `1212`).

Staff scheduling for the three Le Parfumier stores (PL, PB, PV). Static app, no build
step: `index.html`, `style.css`, `app.js` (core + text parser), `solver.js` (algorithm,
rules, snapshots, learning), `views.js` (staff views, swaps, time off), `admin.js` (Manage,
import, login). Data lives in Supabase (same project as the FLAG pilot). Deploying is a push
to `main` in `dalecci/draft`.

## How people use it

1. Type the store code `4545` (remembered on the device).
2. Tap your name, type your 4-digit PIN. PINs are listed under Manage → Team & PINs.
3. Left rail (bottom bar on a phone):
   - **Your schedule** — a month at a time, today outlined, your shifts as chips with a
     status dot when a request touches them. Tap an empty day to ask for time off.
   - **Your week** — one week, only your shifts.
   - **Master** — everyone at every store, coverage bars per store per day (buffers
     included), flags for every compromise the solver had to make.
   - **Requests** — covers and switches with a timeline. After a decline, pick another
     colleague from the dropdown on the card and re-send.
   - **Time off** — a year calendar for block-outs and PTO.
   - **Manage** — supervisors only.

### Status dots

| Dot | Meaning |
|---|---|
| amber | waiting on the colleague |
| blue | waiting on the manager |
| red | declined |
| green | approved |

### Covers and switches

Tap a shift. Your own → ask a colleague to *cover* or *switch*. Someone else's → ask to
*take it*, optionally offering one of yours. Colleague says yes → manager gets an in-app
approval and an email → manager approves (signing with their name; several people share the
Manager login) → shifts are reassigned and **locked** so a rebuild never undoes them.

### Block-outs and PTO

Tap a day under **Time off**, pick block-out or PTO, dates and a reason. The manager approves
or declines (signed with a name). On approval the weeks in that range are re-solved around
the absence; any locked shift of that person in the range is flagged for a manual fix.

## The algorithm

Same shape as the Jaguars gym scheduler: hard rules filter what is allowed, a randomized
greedy pass fills demand, a soft score keeps the best of many restarts, locked items are
never touched.

For each week:

1. **Demand** — per store per day: opening hours × minimum staff, plus custom rules
   (someone 15 min before open / after close, at least N on Saturdays, N between 12 and 5…).
   Temporary hours (holidays, seasons) replace the regular hours for their dates.
2. **Fixed** — locked shifts (approved swaps, pins) and *needs to work* entries.
3. **Template** — each person's weekly availability, or their *special availability* if the
   date falls in one, trimmed to the demand window, skipped on time off / approved block-outs
   / PTO / "never works Mondays" rules.
4. **Gaps** — every minute where the count on the floor is below what is needed.
5. **Fill**, escalating until the gap is closed (`neverLeaveGap` rule):
   - tier 0: extend a shift already there that day, or call in a *flex* person, all within limits;
   - tier 1: allow going over weekly hours / days, call in anyone from that store;
   - tier 2: allow a long shift, call in from another store.
   Small extensions (buffers) stay part of the template shift; anything more is a "fill".
6. **Score** — uncovered minutes weigh most, then limit breaches, then soft rules (always
   works Tuesdays, at least 30h, never more than 5 days in a row, two people together / never
   together), then each compromise.
7. Up to three distinct arrangements are kept. **Rebuild** shows Option 1 and Option 2 with
   the differences between them; pick one.

Every compromise is written on the shift ("Extended to cover 9:45a–10a (over hours)") and
listed as a flag on Master and Week tools. Weeks are built on first view (current + 6, and
whatever month you scroll to).

### Undo and saved versions

Every rebuild, restore or approval-triggered rebuild snapshots the week first. **Go back**
restores the previous version; **Save this version** keeps a named copy to load later.

### LEARN

Edit shifts on Master (move, retime, add, delete; edits are marked *manual*). Press **LEARN**
under Week tools: the solver diffs the week against the template and proposes one template
change per edit, which you tick or untick. Swaps and pins are never learned. The note is
optional, it only goes in the log (Manage → Settings). The following weeks can be rebuilt
with the new template in the same step.

### Rules (Manage → Rules)

Base rules: minimum staff, max hours/week, max days/week, shortest call-in, longest shift,
trim to store hours, flex call-ins, anyone call-ins, never leave a gap, solver attempts.

Custom rules (dropdowns): open buffer, close buffer, min staff on a day, min staff in a
window, employee never works a day, always works a day (soft), can't work at a store, max
hours, min hours (soft), max consecutive days, two people never together, always together
(soft), prefer someone for call-ins, note. Each can be switched off without deleting it, and
shows "broken this week" when the current week violates it.

### Other Manage tabs

- **Team & PINs** — stores, home store, role, flex, active, email, PIN.
- **Availability** — weekly template per person, plus *special availability* periods.
- **Stores & hours** — regular hours, plus *temporary hours* by date range (with "as usual"
  per day) or typed dates: `Dec 24: 10 to 3`, `Dec 25: closed`, `Dec 26 - Dec 31: 12 to 5`.
- **Time off & must-work** — pending block-out/PTO approvals, pre-approved days off, pins.
- **Week tools** — rebuild with options, go back, saved versions, LEARN, flags, hours.
- **Import text** — paste the spreadsheet (or `Maria (PV): Mon 10 to 6, Sat 10-5`) → preview
  → apply as the weekly template or as special availability for a date range; time off and
  needs-to-work columns come along.
- **AI** — natural-language command center (see below).
- **Settings** — supervisor email, supervisor names, store code, admin PIN, test email, learn log.

### AI command center (Manage → AI)

A chat for managers. It runs through the `lps-ai` Edge Function, which holds the Anthropic key, sends a frozen system prompt plus live context (schema, roster, rules, dates) and only passes through tool names on its allowlist. The tools themselves live in `ai.js` and are executed by the app:

- **read** (green): schema, table queries (PINs stripped), week schedule, coverage flags, employee profile, requests, settings. Run immediately.
- **write** (amber): add/edit shifts, templates, special availability, time off, pins, employee fields. Shown as a preview card first; run only after Approve.
- **danger** (red): delete shift, rebuild/restore a week, rules, temporary hours, approve/decline requests, notify people, send email. Same preview, labelled as sending / deleting / affecting many people; approvals of requests ask for the supervisor name.

There are no payments in the app; the model is told so. Model: Claude Opus 5 with server-side refusal fallbacks. "Verify JWT" can stay on for `lps-ai` (the app calls it with the anon key).

### Day / night

The moon/sun button at the bottom of the rail switches themes; the choice is remembered per device.

## Supabase — one-time setup

1. SQL editor → run `supabase/schema.sql` once. Safe to re-run; it also upgrades a V1 install
   (adds PIN and signature columns, the four V2 tables).
2. Reload the app. It seeds the roster, availability, hours, rules, time off and must-work
   from the spreadsheet on first load and builds the first 7 weeks. Existing installs get
   PINs and new settings filled in automatically.

Until the tables exist the app runs in **this-device-only** mode (localStorage) so it can be
previewed; Manage shows an amber pill and the picker says so.

### Approval emails

`supabase/functions/lps-notify/index.ts` is deployed with "Verify JWT" **off** (the email buttons are plain links; POSTs from the app are checked against the project API key, links against an HMAC signature). Emails carry **Approve / Decline** buttons: either opens a one-screen confirm page where the approver picks their name, then the decision is applied server-side and the staff are notified; the next open client re-solves the affected weeks. To turn emails on: Edge Functions → Secrets → add `RESEND_API_KEY` (resend.com → API Keys) and optionally `LPS_FROM_EMAIL` (defaults to Resend's test sender `onboarding@resend.dev`, which only delivers to the Resend account's own address until a domain is verified). Then Manage → Settings → *Send a test email*. Without the key everything still works in-app; only the email is missing.

## Deploying

```
cd draft-clone
git add leparfschedule
git commit -m "leparfschedule: ..."
git push
```

Bump `APP_VERSION` in `app.js` and the `?v=` on every script/style tag in `index.html`.

## Storage rule

Never rename the `lps_` tables or the settings keys. Add columns and keys; the app treats
missing values as defaults (`migrate()` in `app.js`).
