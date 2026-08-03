// Area IQ — MLS/IDX feed proxy (Supabase Edge Function)
// Deploy:  supabase functions deploy mls --no-verify-jwt
// Secrets: supabase secrets set MLS_URL=... MLS_USER=... MLS_PASS=...
//
// WHY THIS EXISTS: MLS credentials must never ship in the public HTML.
// This function holds them server-side, fetches the feed, normalises it to the
// shape Area IQ expects, caches it, and returns only what the map needs.
//
// Works with SimplyRETS out of the box (Basic auth). For a direct RESO Web API
// feed (MLS Grid, Trestle, Bridge, Spark), swap the auth header for the bearer
// token and adjust FIELD_MAP — the rest is identical.

const MLS_URL = Deno.env.get('MLS_URL')!;      // e.g. https://api.simplyrets.com/properties?limit=500&status=Active
const MLS_USER = Deno.env.get('MLS_USER')!;
const MLS_PASS = Deno.env.get('MLS_PASS')!;
const BEARER = Deno.env.get('MLS_BEARER') || '';   // set this instead of user/pass for RESO feeds

// Cape Coral bounding box — never return more than the map covers
const BOX = { s: 26.50, n: 26.76, w: -82.12, e: -81.87 };

const CACHE_MS = 30 * 60 * 1000;
let cache: { at: number; body: string } | null = null;

const CORS = {
  'Access-Control-Allow-Origin': '*',            // lock to your domain in production
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

// SimplyRETS / RESO field mapping → Area IQ listing shape
function normalise(raw: any): any | null {
  const lat = raw.geo?.lat ?? raw.Latitude ?? null;
  const lng = raw.geo?.lng ?? raw.Longitude ?? null;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < BOX.s || lat > BOX.n || lng < BOX.w || lng > BOX.e) return null;
  const addr = raw.address?.full ?? [raw.StreetNumber, raw.StreetName, raw.StreetSuffix].filter(Boolean).join(' ');
  return {
    id: raw.mlsId ?? raw.ListingId ?? raw.ListingKey,
    lat, lng,
    price: raw.listPrice ?? raw.ListPrice ?? null,
    beds: raw.property?.bedrooms ?? raw.BedroomsTotal ?? null,
    baths: raw.property?.bathsFull ?? raw.BathroomsFull ?? null,
    sqft: raw.property?.area ?? raw.LivingArea ?? null,
    dom: raw.mls?.daysOnMarket ?? raw.DaysOnMarket ?? null,
    addr,
    status: raw.mls?.status ?? raw.StandardStatus ?? 'Active',
    url: raw.listingUrl ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return new Response(cache.body, { headers: { ...CORS, 'X-Cache': 'hit' } });
  }
  try {
    const auth = BEARER
      ? { Authorization: `Bearer ${BEARER}` }
      : { Authorization: 'Basic ' + btoa(`${MLS_USER}:${MLS_PASS}`) };

    const res = await fetch(MLS_URL, { headers: { ...auth, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.value ?? data.listings ?? []);

    const listings = rows.map(normalise).filter(Boolean);
    const body = JSON.stringify({ listings, count: listings.length, fetchedAt: new Date().toISOString() });
    cache = { at: Date.now(), body };
    return new Response(body, { headers: { ...CORS, 'X-Cache': 'miss' } });
  } catch (e) {
    // serve stale rather than breaking a live client presentation
    if (cache) return new Response(cache.body, { headers: { ...CORS, 'X-Cache': 'stale' } });
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: CORS });
  }
});
