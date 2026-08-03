# Turning on live listings in Area IQ

Area IQ already shows **ZIP-level market data** (active listing counts, days on market,
price cuts) from realtor.com's free research data — no permission needed, refreshed monthly.

To show **individual homes for sale as pins on the map**, you need an MLS data feed.
That is a licence Melissa applies for as a member of her MLS. Nobody can supply it for her —
it is tied to her membership. Here is exactly what to ask for.

---

## Step 1 — Ask her MLS for IDX data access

Melissa's MLS is most likely **Royal Palm Coast Realtor Association / Florida Gulf Coast MLS**
(SWFL). Contact their support and say:

> "I'd like to apply for an **IDX data feed** for a private client-presentation website I use.
> Please send me the IDX data licence application and the technical options available
> (RESO Web API preferred)."

They will send a short application. Typical terms:
- Free to low cost (some MLSs charge $20–50/month for the feed itself)
- Requires broker (Tuiso Realty) sign-off — one signature
- Approval usually takes **1–3 weeks**

**Ask specifically for:** RESO Web API access (the modern standard), and whether they
support **MLS Grid**, **Trestle**, **Bridge Interactive**, or **Spark** as the delivery platform.

## Step 2 — Pick a delivery route

| Option | Cost | Setup effort | Notes |
|---|---|---|---|
| **SimplyRETS** | ~$50–100/mo | Easiest — clean JSON API | Handles the MLS connection for you. Best first choice. |
| **MLS Grid** | ~$20–50/mo | Medium | Standardised RESO feed across many MLSs. |
| **Trestle** (CoreLogic) | Varies | Medium | Very wide MLS coverage. |
| **Bridge / Spark** | Often free with approval | Medium | Depends on the MLS. |

Any of these work — the app was built to accept all of them.

## Step 3 — Connect it (about 15 minutes, once credentials arrive)

1. Deploy the proxy so the credentials stay private (they must **never** go in the web page):
   ```bash
   supabase functions deploy mls --no-verify-jwt
   supabase secrets set MLS_URL="https://api.simplyrets.com/properties?limit=500&status=Active" MLS_USER="..." MLS_PASS="..."
   ```
   The function source is `mls-proxy.ts` in this folder.

2. In `index.html`, set the endpoint in the `LISTINGS` config near the top of the script:
   ```js
   const LISTINGS={ endpoint:'https://YOUR-PROJECT.supabase.co/functions/v1/mls', ... };
   ```

3. Redeploy. The **"Homes for sale"** toggle goes live: price-coloured pins, click for
   address/beds/baths/sq ft/days on market, and a true **per-area active count** on every
   scorecard (more accurate than the ZIP figures, because it counts inside the actual zone).

## What's already built and waiting

- Toggle, map pins, colour-by-price-band, click-through popups
- Point-in-polygon counting so each area reports its own live inventory
- Server-side proxy with 30-minute caching, stale-serving if the feed hiccups mid-presentation,
  and a Cape Coral bounding box so only relevant listings are returned
- IDX attribution line on every popup

## IDX display rules to respect

Each MLS sets its own, but almost all require:
- Attribution ("Listing data © [MLS]") — already rendered on every popup
- The listing brokerage name shown for listings that aren't Melissa's own
- No display of listings whose sellers opted out (the feed handles this — do not scrape)
- Data refreshed at least every 12 hours (the proxy refreshes every 30 minutes)

Read the licence when it arrives; if it asks for anything the app doesn't do yet, it's a
small change.

## The SaaS angle

When Area IQ is sold to other agents, **each subscriber brings their own MLS feed** —
they deploy the same proxy with their own credentials. That keeps every tenant compliant
with their own MLS's licence, and means you never handle MLS data licensing centrally.
It is the correct architecture both legally and commercially.
