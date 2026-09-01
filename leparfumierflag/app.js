// Le Parfumier: FLAG, client app. No build step. The only dependencies are the
// vendored SheetJS and jsPDF used for the supplier stock check and the exports.
//
// Bump APP_VERSION on every deploy that changes app.js, style.css or index.html,
// and bump the matching ?v= query params in index.html so browsers that already
// have the page do not keep running the old build for ten minutes.
const APP_VERSION = 11;

const PIN = "4545";
const GH_OWNER = "dalecci";
const GH_DATA_REPO = "leparfumierflag-data";
const TOKEN_KEY = "lpf_token";
const UNLOCK_KEY = "lpf_unlocked";
const THEME_KEY = "lpf_theme";
// { [flagId]: {decision, userConfirmed, orderedQty, orderedDate, note} }, this browser,
// and the source we replay onto the shared store once a token is connected.
const OVERRIDES_KEY = "lpf_overrides";

const DECISIONS = ["review", "buying", "ordered", "passed"];
const DECISION_LABEL = { review: "To review", buying: "Buying", ordered: "Ordered", passed: "Passed" };

const state = {
  products: [],
  flags: [],
  flaggedHandles: new Set(),
  lastScan: null,
  dataSource: "bundled", // bundled | live
  productsLoaded: false,
  tab: "watch",
  page: 0,
  pageSize: 60,
  sort: "priority",
  search: "",
  filterStatus: "",
  filterDecision: "",
  onlyFlagged: false,
  selected: new Set(),
};

// ---------------------------------------------------------------- helpers ---

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
const escapeAttr = escapeHtml;

function money(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  return "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moneyShort(v) {
  const n = Math.round(parseFloat(v) || 0);
  return "$" + n.toLocaleString("en-CA");
}
function el(id) { return document.getElementById(id); }

let toastTimer = null;
function toast(msg, kind) {
  const box = el("toast");
  el("toast-text").textContent = msg;
  box.classList.toggle("warn", kind === "warn");
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 3200);
}

// ------------------------------------------------------------------ theme ---

// Dark is the default, so an unset theme means dark and the toggle only ever has
// to decide whether a light override is currently on.
function initTheme() {
  el("theme-btn").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });
}

// ------------------------------------------------------------------- lock ---

function unlockApp() {
  el("lock").classList.add("hidden");
  el("app").classList.remove("hidden");
  boot();
}

function tryUnlock() {
  if (el("lock-input").value.trim() === PIN) {
    try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (e) {}
    unlockApp();
  } else {
    el("lock-error").textContent = "That code is not right.";
    el("lock-input").value = "";
    el("lock-input").focus();
  }
}

function initLock() {
  let unlocked = false;
  try { unlocked = localStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) {}
  if (unlocked) { unlockApp(); return; }
  el("lock-btn").addEventListener("click", tryUnlock);
  el("lock-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  el("lock-input").focus();
}

// ------------------------------------------------------------------- tabs ---

function initTabs() {
  document.querySelectorAll(".rail-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll(".rail-btn").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
      el("tab-" + state.tab).classList.remove("hidden");
      // The briefing band belongs to the watch view; the other tabs get the room back.
      el("brief").classList.toggle("hidden", state.tab !== "watch");
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  });
}

// --------------------------------------------------------------- settings ---

function initSettings() {
  const modal = el("settings");
  el("settings-btn").addEventListener("click", () => {
    modal.classList.remove("hidden");
    el("token-status").textContent = localStorage.getItem(TOKEN_KEY)
      ? "A token is saved in this browser."
      : "No token saved. Cost stays hidden and your decisions save to this browser only.";
  });
  el("settings-close").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

  el("token-save").addEventListener("click", async () => {
    const val = el("token-input").value.trim();
    if (!val) return;
    localStorage.setItem(TOKEN_KEY, val);
    el("token-input").value = "";
    el("token-status").textContent = "Saved. Loading live data...";
    await loadFlags();
    await loadProducts();
    renderAll();
    scheduleSync(); // push anything decided before a token existed
    el("token-status").textContent = "Saved and connected.";
  });

  el("token-clear").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    el("token-status").textContent = "Token cleared. Decisions save to this browser only from now on.";
  });
}

// ----------------------------------------------------------- data loading ---

async function fetchJsonSafe(url) {
  try {
    // no-store: these files change on every scan, a cached copy would show stale flags.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchGithubRaw(path, token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/${path}`, {
      cache: "no-store",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3.raw" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Same endpoint with the default Accept header, so we also get the blob sha a write needs.
async function fetchGithubMeta(path, token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/${path}`, {
      cache: "no-store",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function decodeBase64Utf8(b64) { return decodeURIComponent(escape(atob(String(b64).replace(/\n/g, "")))); }
function encodeUtf8Base64(str) { return btoa(unescape(encodeURIComponent(str))); }

// Flags are small and are what the page is actually for, so they load first and the
// list paints before the multi megabyte catalog has finished arriving.
async function loadFlags() {
  const bundled = await fetchJsonSafe("data/flags.json");
  if (bundled) {
    state.flags = bundled.flags || [];
    state.lastScan = bundled.lastScan || null;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    const meta = await fetchGithubMeta("flags.json", token);
    if (meta && meta.content) {
      try {
        const parsed = JSON.parse(decodeBase64Utf8(meta.content));
        state.flags = parsed.flags || [];
        state.lastScan = parsed.lastScan || null;
      } catch (e) { /* keep the bundled copy if the live file will not parse */ }
    }
  }
  applyOverrides();
  state.flaggedHandles = new Set(state.flags.map((f) => f.productHandle));
}

async function loadProducts() {
  const bundled = await fetchJsonSafe("data/products.json");
  if (bundled) state.products = bundled;
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    const live = await fetchGithubRaw("products.json", token);
    if (live) { state.products = live; state.dataSource = "live"; }
  }
  indexProducts();
  state.productsLoaded = true;
}

// ------------------------------------------------- decisions and overrides ---

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}"); } catch (e) { return {}; }
}
function saveOverrides(o) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o)); } catch (e) {}
}
function applyOverrides() {
  const o = loadOverrides();
  state.flags.forEach((f) => { if (o[f.id]) Object.assign(f, o[f.id]); });
}

// v8 stored only userConfirmed plus a quantity. Read those forward so nothing a
// previous session recorded is lost when the four state pipeline replaces them.
function decisionOf(f) {
  if (f.decision && DECISIONS.includes(f.decision)) return f.decision;
  if (f.userConfirmed === false) return "passed";
  if (f.orderedQty > 0) return "ordered";
  if (f.userConfirmed === true) return "buying";
  return "review";
}

let syncTimer = null;

function updateFlag(flagId, changes, opts) {
  const flag = state.flags.find((f) => f.id === flagId);
  if (!flag) return;
  Object.assign(flag, changes);

  const o = loadOverrides();
  o[flagId] = Object.assign({}, o[flagId] || {}, changes);
  saveOverrides(o);

  if (!opts || opts.rerender !== false) { renderFiches(); }
  renderBrief();
  scheduleSync();
}

function setDecision(flagId, decision) {
  // userConfirmed is kept in step so the scheduled scan and anything reading the
  // shared store still see the yes or no it already understands.
  const userConfirmed = decision === "passed" ? false : decision === "review" ? null : true;
  const changes = { decision, userConfirmed };
  if (decision === "review" || decision === "passed") {
    changes.orderedQty = null;
    changes.orderedDate = null;
  }
  updateFlag(flagId, changes);
}

function scheduleSync() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { toast("Saved on this device. Connect a token to sync everywhere.", "warn"); return; }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncToGithub(token), 900);
}

async function syncToGithub(token) {
  try {
    const meta = await fetchGithubMeta("flags.json", token);
    if (!meta) throw new Error("cannot read flags.json");
    const current = JSON.parse(decodeBase64Utf8(meta.content));
    const o = loadOverrides();
    (current.flags || []).forEach((f) => { if (o[f.id]) Object.assign(f, o[f.id]); });
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/flags.json`, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Update decisions from the FLAG app",
        content: encodeUtf8Base64(JSON.stringify(current, null, 2)),
        sha: meta.sha,
      }),
    });
    if (!res.ok) throw new Error("write rejected");
    toast("Saved and synced.");
  } catch (e) {
    toast("Saved here. Sync failed, it will retry on your next change.", "warn");
  }
}

// ------------------------------------------------------- product and value ---

// Handle lookups run for every flag on every render, so they go through an index
// instead of scanning 4,825 products each time.
let productIndex = new Map();
let houseCounts = new Map();

function indexProducts() {
  productIndex = new Map();
  houseCounts = new Map();
  state.products.forEach((p) => {
    productIndex.set(p.handle, p);
    const house = p.vendor || "Unattributed";
    houseCounts.set(house, (houseCounts.get(house) || 0) + 1);
  });
}

function findProduct(handle) {
  return productIndex.get(handle);
}

// A gift set or a miniature is not what a buy in gets measured in, so those sizes
// are skipped unless an item has nothing else on file.
const SET_SIZE = /\b(ensemble|coffret|set|gift|duo|trio|collection|miniature|sample|vial|refill|recharge|produits)\b/i;

// The reference unit is the dearest plain bottle of an item. Every money figure on
// the page is built from it, and the size is always printed beside the number so
// nobody has to guess which variant a total refers to.
function referenceVariant(product) {
  if (!product) return null;
  const priced = (product.variants || [])
    .map((v) => ({ price: parseFloat(v.price), size: v.size || "", cost: parseFloat(v.cost) || 0 }))
    .filter((v) => !isNaN(v.price) && v.price > 0);
  if (!priced.length) return null;
  const bottles = priced.filter((v) => !SET_SIZE.test(v.size));
  const pool = bottles.length ? bottles : priced;
  return pool.reduce((best, v) => (!best || v.price > best.price ? v : best), null);
}

function hasClearancePricing(product) {
  return (product && product.variants || []).some((v) => {
    const p = parseFloat(v.price), c = parseFloat(v.compareAtPrice);
    return !isNaN(p) && !isNaN(c) && c > p;
  });
}

function priceRange(product) {
  const prices = (product.variants || []).map((v) => parseFloat(v.price)).filter((n) => !isNaN(n) && n > 0);
  if (!prices.length) return "";
  const lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
  return lo === hi ? money(lo) : money(lo) + " to " + money(hi);
}

// ------------------------------------------------------------------ score ---

const DEMAND_WORDS = [
  "resel", "resale", "secondhand", "second hand", "backup", "back up", "climb",
  "rising", "rise", "premium", "sought", "hard to find", "before it", "snapping up",
];

// Arithmetic, not opinion. Every component is shown to the user under "why this
// rank" so a number on screen can always be traced back to a reason.
//
// Weighting note: with most of the list already confirmed, evidence stops telling
// two items apart and money starts. So certainty is worth 30 and the value of the
// bottle is worth up to 25. A confirmed $400 Creed has to outrank a confirmed $29
// cologne, because a buyer's week is finite and one of those is worth their time.
function scoreFlag(f, product) {
  const parts = [];
  let total = 0;
  const add = (label, points) => { if (points > 0) { parts.push([label, points]); total += points; } };

  if (f.status === "confirmed") add("Confirmed by several sources", 30);
  else if (f.status === "rumored") add("Rumored, early chatter", 12);

  const nSources = (f.sources || []).length;
  add(nSources + " independent source" + (nSources === 1 ? "" : "s"), Math.min(nSources, 4) * 4);

  const kinds = new Set((f.signals || []).map((s) => s.type).filter(Boolean));
  add(kinds.size + " kinds of signal agree", Math.min(Math.max(kinds.size - 1, 0), 2) * 5);

  if (f.marketCheck && f.marketCheck.checked) {
    const note = String(f.marketCheck.note || "").toLowerCase();
    if (DEMAND_WORDS.some((w) => note.includes(w))) add("Resale demand reads as rising", 14);
    else add("Found on the secondary market", 7);
  }

  if (hasClearancePricing(product)) add("Your price already below compare at", 5);

  const ref = referenceVariant(product);
  if (ref) {
    const label = "Bottle worth " + money(ref.price);
    if (ref.price >= 300) add(label, 25);
    else if (ref.price >= 200) add(label, 20);
    else if (ref.price >= 120) add(label, 15);
    else if (ref.price >= 60) add(label, 9);
    else if (ref.price >= 30) add(label, 4);
    else add(label, 1);
  }

  return { total: Math.min(total, 100), parts };
}

function band(score) {
  if (score >= 75) return { key: "act", label: "Act now" };
  if (score >= 55) return { key: "watch", label: "Watch closely" };
  return { key: "hold", label: "Monitor" };
}

// Everything the views and the exports need about one flag, worked out once.
function enrich(f) {
  const product = findProduct(f.productHandle);
  const ref = referenceVariant(product);
  const scored = scoreFlag(f, product);
  const decision = decisionOf(f);
  const qty = parseInt(f.orderedQty, 10) || 0;
  const counts = qty > 0 && decision !== "passed";
  return {
    flag: f,
    product: product,
    image: product && product.image ? product.image : "",
    ref: ref,
    unitPrice: ref ? ref.price : 0,
    unitCost: ref ? ref.cost : 0,
    score: scored.total,
    parts: scored.parts,
    band: band(scored.total),
    decision: decision,
    qty: qty,
    committed: counts ? qty * (ref ? ref.price : 0) : 0,
    committedCost: counts ? qty * (ref ? ref.cost : 0) : 0,
  };
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr + "T00:00:00");
  if (isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
}

function ageLabel(dateStr) {
  const d = daysSince(dateStr);
  if (d === null) return "";
  if (d === 0) return "Flagged today";
  if (d === 1) return "Flagged 1 day ago";
  return "Flagged " + d + " days ago";
}

// ------------------------------------------------------ filtering, sorting ---

function visibleFlags() {
  const q = state.search.trim().toLowerCase();
  let items = state.flags.map(enrich).filter((x) => {
    if (state.filterStatus && x.flag.status !== state.filterStatus) return false;
    if (state.filterDecision && x.decision !== state.filterDecision) return false;
    if (q) {
      const hay = (x.flag.title + " " + (x.flag.vendor || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const by = {
    priority: (a, b) => b.score - a.score || (b.unitPrice - a.unitPrice),
    newest: (a, b) => String(b.flag.flaggedDate || "").localeCompare(String(a.flag.flaggedDate || "")) || b.score - a.score,
    value: (a, b) => b.unitPrice - a.unitPrice,
    house: (a, b) => String(a.flag.vendor || "").localeCompare(String(b.flag.vendor || "")) || b.score - a.score,
    committed: (a, b) => b.committed - a.committed || b.score - a.score,
  };
  items.sort(by[state.sort] || by.priority);
  return items;
}

// -------------------------------------------------------------- rendering ---

function renderMasthead() {
  const houses = new Set(state.products.map((p) => p.vendor).filter(Boolean));
  const scanTxt = state.lastScan
    ? new Date(state.lastScan).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
    : "not yet run";
  const catalogTxt = state.productsLoaded
    ? state.products.length.toLocaleString() + " products, " + houses.size.toLocaleString() + " houses"
    : "loading...";
  const cost = state.dataSource === "live"
    ? '<span class="live">connected</span>'
    : '<span class="off">hidden</span>';
  el("masthead-meta").innerHTML =
    '<div><b>Catalog</b>' + catalogTxt + "</div>" +
    "<div><b>Last scan</b>" + escapeHtml(scanTxt) + "</div>" +
    "<div><b>Wholesale cost</b>" + cost + "</div>";
  el("rail-ver").textContent = "v" + APP_VERSION;
}

function renderBrief() {
  const all = state.flags.map(enrich);
  const open = all.filter((x) => x.flag.status !== "cleared");
  const confirmed = open.filter((x) => x.flag.status === "confirmed");
  const rumored = open.filter((x) => x.flag.status === "rumored");
  const act = open.filter((x) => x.band.key === "act");
  const undecided = act.filter((x) => x.decision === "review").length;
  const houses = new Set(open.map((x) => x.flag.vendor || "").filter(Boolean));

  // Gross margin sitting in the at risk list. Gated on cost actually being present
  // rather than on the token, since the local dev server serves the costed catalog
  // directly and the figure is real either way.
  const costed = open.filter((x) => x.unitCost > 0 && x.unitPrice > 0);
  const costedRetail = costed.reduce((s, x) => s + x.unitPrice, 0);
  const costedCost = costed.reduce((s, x) => s + x.unitCost, 0);
  const marginValue = costedRetail - costedCost;
  const marginPct = costedRetail ? Math.round((marginValue / costedRetail) * 100) : 0;

  const committedItems = all.filter((x) => x.committed > 0);
  const committed = committedItems.reduce((s, x) => s + x.committed, 0);
  const committedCost = committedItems.reduce((s, x) => s + x.committedCost, 0);
  const bottles = committedItems.reduce((s, x) => s + x.qty, 0);

  let committedNote;
  if (!committedItems.length) {
    committedNote = "Mark items Buying or Ordered and add a quantity";
  } else if (committedCost > 0) {
    committedNote =
      bottles.toLocaleString() + " bottles across " + committedItems.length + " item" +
      (committedItems.length === 1 ? "" : "s") + ", " + moneyShort(committed - committedCost) + " margin";
  } else {
    committedNote =
      bottles.toLocaleString() + " bottles across " + committedItems.length + " item" +
      (committedItems.length === 1 ? "" : "s") + " at retail";
  }

  const cards = [
    {
      k: "On watch",
      v: String(open.length),
      n: houses.size ? "Across " + houses.size + " houses" : "Nothing flagged yet",
    },
    {
      k: "Confirmed",
      v: String(confirmed.length),
      n: rumored.length + " more still rumored",
      cls: "risk",
    },
    {
      k: "Act now",
      v: String(act.length),
      n: undecided
        ? "Priority 75 and above, " + undecided + " still undecided"
        : "Priority 75 and above, all decided",
    },
    {
      k: "Gross margin",
      v: costed.length ? moneyShort(marginValue) : "&mdash;",
      n: costed.length
        ? marginPct + " percent, across the " + costed.length + " flagged items with cost on file"
        : state.productsLoaded
          ? "Connect a token in settings to show cost"
          : "Waiting for the catalog",
      cls: "money",
    },
    {
      k: "Committed to buy",
      v: moneyShort(committed),
      n: committedNote,
      cls: "money",
    },
  ];

  el("brief-in").innerHTML = cards
    .map(
      (c) =>
        '<div class="stat ' + (c.cls || "") + '">' +
        '<div class="stat-k">' + escapeHtml(c.k) + "</div>" +
        '<span class="stat-v">' + c.v + "</span>" +
        '<div class="stat-n">' + escapeHtml(c.n) + "</div>" +
        "</div>"
    )
    .join("");

  const count = el("rail-count");
  count.textContent = String(act.length);
  count.classList.toggle("hidden", act.length === 0);
}

function decideButtons(x) {
  return (
    '<div class="decide">' +
    DECISIONS.map(
      (d) =>
        '<button class="dbtn ' + d + (x.decision === d ? " on" : "") + '" data-decision="' + d + '">' +
        DECISION_LABEL[d] +
        "</button>"
    ).join("") +
    "</div>"
  );
}

function whyBlock(x) {
  const rows = x.parts
    .map((p) => "<tr><td>" + escapeHtml(p[0]) + "</td><td>+" + p[1] + "</td></tr>")
    .join("");
  return (
    '<details class="why"><summary>Why this rank</summary>' +
    '<table class="why-table"><tbody>' + rows +
    '<tr class="total"><td>Priority score</td><td>' + x.score + " / 100</td></tr>" +
    "</tbody></table></details>"
  );
}

function renderFiches() {
  const list = el("fiches");
  const empty = el("fiches-empty");

  if (!state.flags.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    empty.innerHTML =
      "<strong>Nothing flagged yet</strong>The scan runs Monday and Thursday. Anything at risk will arrive here.";
    updateSelectBar([]);
    return;
  }

  const items = visibleFlags();
  if (!items.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    empty.innerHTML = "<strong>Nothing matches</strong>Try clearing a filter or the search box.";
    updateSelectBar([]);
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = items
    .map((x, i) => {
      const f = x.flag;
      const ledger = (f.signals || [])
        .map(
          (s) =>
            "<li><span class=\"kind\">" + escapeHtml(s.type || "note") + "</span>" +
            escapeHtml(s.note) + "</li>"
        )
        .join("");

      const market =
        f.marketCheck && f.marketCheck.checked
          ? '<div class="market"><b>Market check</b>' + escapeHtml(f.marketCheck.note) + "</div>"
          : "";

      const sources = (f.sources || [])
        .map(
          (s) =>
            '<a href="' + escapeAttr(s.url) + '" target="_blank" rel="noopener">' +
            escapeHtml(s.label) + "</a>"
        )
        .join("");

      const refLine = x.ref
        ? '<div class="refprice"><div class="k">Unit value<s>' + escapeHtml(x.ref.size) + "</s></div>" +
          '<div class="v">' + money(x.ref.price) + "</div></div>"
        : '<div class="refprice"><div class="k">Unit value<s>' +
          (state.productsLoaded ? "no price on file" : "loading catalog") +
          '</s></div><div class="v">&mdash;</div></div>';

      const showQty = x.decision === "buying" || x.decision === "ordered";
      const qtyRow = showQty
        ? '<div class="qty-row">Quantity' +
          '<input type="number" min="0" step="1" class="qty" value="' + (x.qty || "") + '" placeholder="0" aria-label="Quantity">' +
          '<span class="qty-total">' + (x.committed ? money(x.committed) : "&mdash;") +
          "<small>committed</small></span></div>"
        : "";

      const noteOpen = f.note ? true : false;
      const noteBlock =
        '<button class="note-toggle" data-note-toggle>' +
        (noteOpen ? "Hide note" : f.note ? "Edit note" : "Add a note") +
        "</button>" +
        '<textarea class="note-box' + (noteOpen ? "" : " hidden") +
        '" placeholder="A call with the rep, an allocation, anything the scan cannot know">' +
        escapeHtml(f.note || "") + "</textarea>";

      return (
        '<article class="fiche is-' + escapeAttr(f.status) +
        (x.decision === "passed" ? " is-passed" : "") +
        '" data-flag-id="' + escapeAttr(f.id) + '">' +
          '<div class="fiche-rank">' +
            '<input type="checkbox" class="pick"' + (state.selected.has(f.id) ? " checked" : "") +
            ' aria-label="Select this item">' +
            '<span class="rank-no">' + String(i + 1).padStart(2, "0") + "</span>" +
          "</div>" +
          '<div class="fiche-plate" style="background-image:url(\'' + escapeAttr(x.image) + '\')"></div>' +
          '<div class="fiche-main">' +
            '<p class="fiche-house">' + escapeHtml(f.vendor || "") + "</p>" +
            '<h2 class="fiche-title">' + escapeHtml(f.title) + "</h2>" +
            '<ul class="ledger">' + ledger + "</ul>" +
            market +
            '<div class="sources">' + sources + "</div>" +
            whyBlock(x) +
          "</div>" +
          '<div class="fiche-side">' +
            '<div class="side-top">' +
              '<span class="pill ' + escapeAttr(f.status) + '">' + escapeHtml(f.status) + "</span>" +
              '<span class="age">' + escapeHtml(ageLabel(f.flaggedDate)) + "</span>" +
            "</div>" +
            '<div class="score ' + x.band.key + '">' +
              '<div class="score-row"><span class="score-band">' + x.band.label + "</span>" +
              '<span class="score-val">' + x.score + " / 100</span></div>" +
              '<div class="score-bar"><i style="width:' + x.score + '%"></i></div>' +
            "</div>" +
            refLine +
            decideButtons(x) +
            qtyRow +
            noteBlock +
          "</div>" +
        "</article>"
      );
    })
    .join("");

  updateSelectBar(items);
}

function updateSelectBar(items) {
  const n = state.selected.size;
  el("select-count").textContent = n ? n + " selected" : "";
  el("check-stock").disabled = n === 0;
  const ids = items.map((x) => x.flag.id);
  el("select-all").checked = ids.length > 0 && ids.every((id) => state.selected.has(id));
}

function initFicheEvents() {
  const list = el("fiches");

  list.addEventListener("click", (e) => {
    const card = e.target.closest(".fiche");
    if (!card) return;
    const id = card.dataset.flagId;

    const dbtn = e.target.closest(".dbtn");
    if (dbtn) {
      const next = dbtn.dataset.decision;
      // Clicking the state an item is already in returns it to To review.
      setDecision(id, decisionOf(state.flags.find((f) => f.id === id)) === next ? "review" : next);
      return;
    }

    if (e.target.matches("[data-note-toggle]")) {
      const box = card.querySelector(".note-box");
      const hidden = box.classList.toggle("hidden");
      e.target.textContent = hidden ? (box.value ? "Edit note" : "Add a note") : "Hide note";
      if (!hidden) box.focus();
    }
  });

  list.addEventListener("change", (e) => {
    const card = e.target.closest(".fiche");
    if (!card) return;
    const id = card.dataset.flagId;
    if (e.target.classList.contains("pick")) {
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      updateSelectBar(visibleFlags());
    }
  });

  // Quantity and notes update without re-rendering, so the field keeps focus while
  // the briefing band and the item's own total follow along live.
  let noteTimer = null;
  list.addEventListener("input", (e) => {
    const card = e.target.closest(".fiche");
    if (!card) return;
    const id = card.dataset.flagId;

    if (e.target.classList.contains("qty")) {
      const qty = Math.max(0, parseInt(e.target.value, 10) || 0);
      updateFlag(
        id,
        { orderedQty: qty || null, orderedDate: qty ? new Date().toISOString().slice(0, 10) : null },
        { rerender: false }
      );
      const x = enrich(state.flags.find((f) => f.id === id));
      const totalEl = card.querySelector(".qty-total");
      if (totalEl) totalEl.innerHTML = (x.committed ? money(x.committed) : "&mdash;") + "<small>committed</small>";
      return;
    }

    if (e.target.classList.contains("note-box")) {
      const value = e.target.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => updateFlag(id, { note: value || null }, { rerender: false }), 600);
    }
  });
}

function initWatchControls() {
  el("flag-search").addEventListener("input", (e) => { state.search = e.target.value; renderFiches(); });
  el("flag-sort").addEventListener("change", (e) => { state.sort = e.target.value; renderFiches(); });
  el("filter-status").addEventListener("change", (e) => { state.filterStatus = e.target.value; renderFiches(); });
  el("filter-decision").addEventListener("change", (e) => { state.filterDecision = e.target.value; renderFiches(); });
  el("select-all").addEventListener("change", (e) => {
    const visible = visibleFlags();
    visible.forEach((x) => {
      if (e.target.checked) state.selected.add(x.flag.id);
      else state.selected.delete(x.flag.id);
    });
    renderFiches();
  });
  el("check-stock").addEventListener("click", openStockModal);
  el("export-pdf").addEventListener("click", exportWatchPdf);
  el("export-xls").addEventListener("click", exportWatchExcel);
}

// ----------------------------------------------------------------- houses ---

function houseRows() {
  const map = new Map();
  state.flags.map(enrich).forEach((x) => {
    if (x.flag.status === "cleared") return;
    const key = x.flag.vendor || "Unattributed";
    if (!map.has(key)) map.set(key, { house: key, items: [], confirmed: 0, rumored: 0, value: 0, top: 0 });
    const row = map.get(key);
    row.items.push(x);
    if (x.flag.status === "confirmed") row.confirmed++;
    else row.rumored++;
    row.value += x.unitPrice;
    row.top = Math.max(row.top, x.score);
  });
  const rows = [...map.values()];
  rows.forEach((r) => { r.catalogCount = houseCounts.get(r.house) || 0; });
  rows.sort((a, b) => b.items.length - a.items.length || b.top - a.top);
  return rows;
}

function renderHouses() {
  const rows = houseRows();
  const multi = rows.filter((r) => r.items.length >= 2);

  el("houses-note").innerHTML = rows.length
    ? "<strong>" + multi.length + " house" + (multi.length === 1 ? " has" : "s have") +
      " more than one item flagged.</strong> A single flag is a product decision. Several at the same house is more often a line being pruned, so those are the calls worth making first."
    : "Nothing flagged yet, so there is nothing to group.";

  el("houses-body").innerHTML = rows
    .map((r) => {
      const total = r.confirmed + r.rumored;
      const cPct = total ? (r.confirmed / total) * 100 : 0;
      const b = band(r.top);
      return (
        "<tr>" +
        '<td><span class="house">' + escapeHtml(r.house) + "</span></td>" +
        '<td class="n">' + total + "</td>" +
        '<td><div class="spread"><div class="spread-bar">' +
          '<i class="c" style="width:' + cPct + '%"></i><i class="r" style="width:' + (100 - cPct) + '%"></i>' +
          '</div><span class="spread-key">' + r.confirmed + " / " + r.rumored + "</span></div></td>" +
        '<td class="n">' + r.top + " <span style=\"color:var(--ink-3)\">" + escapeHtml(b.label) + "</span></td>" +
        '<td class="n">' + (state.productsLoaded ? moneyShort(r.value) : "&mdash;") + "</td>" +
        '<td class="n">' + (state.productsLoaded ? r.catalogCount.toLocaleString() : "&mdash;") + "</td>" +
        '<td><button class="linkish" data-house="' + escapeAttr(r.house) + '">See items</button></td>' +
        "</tr>"
      );
    })
    .join("");
}

function initHouseEvents() {
  el("houses-body").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-house]");
    if (!btn) return;
    state.search = btn.dataset.house;
    el("flag-search").value = btn.dataset.house;
    state.filterStatus = "";
    state.filterDecision = "";
    el("filter-status").value = "";
    el("filter-decision").value = "";
    renderFiches();
    document.querySelector('.rail-btn[data-tab="watch"]').click();
  });
}

// ---------------------------------------------------------------- catalog ---

function populateHouseFilter() {
  const sel = el("brand-filter");
  const houses = [...new Set(state.products.map((p) => p.vendor).filter(Boolean))].sort();
  sel.innerHTML =
    '<option value="">All houses</option>' +
    houses.map((b) => '<option value="' + escapeAttr(b) + '">' + escapeHtml(b) + "</option>").join("");
}

function filteredProducts() {
  const q = el("search").value.trim().toLowerCase();
  const house = el("brand-filter").value;
  const status = el("status-filter").value;
  return state.products.filter((p) => {
    if (house && p.vendor !== house) return false;
    if (status && p.status !== status) return false;
    if (state.onlyFlagged && !state.flaggedHandles.has(p.handle)) return false;
    if (q && !((p.title || "").toLowerCase().includes(q) || (p.vendor || "").toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderCatalog() {
  if (!state.productsLoaded) {
    el("catalog-count").textContent = "Loading the catalog...";
    el("catalog-list").innerHTML = "";
    el("page-info").textContent = "";
    return;
  }
  const items = filteredProducts();
  el("catalog-count").textContent =
    items.length.toLocaleString() + " product" + (items.length === 1 ? "" : "s");

  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  if (state.page >= totalPages) state.page = totalPages - 1;
  const start = state.page * state.pageSize;

  el("catalog-list").innerHTML = items
    .slice(start, start + state.pageSize)
    .map(
      (p) =>
        '<div class="card">' +
        '<div class="card-plate" style="background-image:url(\'' + escapeAttr(p.image || "") + '\')"></div>' +
        '<p class="card-house">' + escapeHtml(p.vendor || "") + "</p>" +
        '<p class="card-title">' + escapeHtml(p.title || "(untitled)") + "</p>" +
        '<div class="card-foot"><span class="card-price">' + priceRange(p) + "</span>" +
        '<span class="card-state">' + escapeHtml(p.status || "") + "</span></div>" +
        (state.flaggedHandles.has(p.handle) ? '<span class="card-flagged">Flagged</span>' : "") +
        "</div>"
    )
    .join("");

  el("page-info").textContent = "Page " + (state.page + 1) + " of " + totalPages;
  el("page-prev").disabled = state.page <= 0;
  el("page-next").disabled = state.page >= totalPages - 1;
}

function initCatalogControls() {
  el("search").addEventListener("input", () => { state.page = 0; renderCatalog(); });
  el("brand-filter").addEventListener("change", () => { state.page = 0; renderCatalog(); });
  el("status-filter").addEventListener("change", () => { state.page = 0; renderCatalog(); });
  el("only-flagged").addEventListener("change", (e) => { state.onlyFlagged = e.target.checked; state.page = 0; renderCatalog(); });
  el("page-prev").addEventListener("click", () => { state.page = Math.max(0, state.page - 1); renderCatalog(); window.scrollTo(0, 0); });
  el("page-next").addEventListener("click", () => { state.page += 1; renderCatalog(); window.scrollTo(0, 0); });
}

// ------------------------------------------------------------ buy list out ---

function buyListRows() {
  return visibleFlags().map((x, i) => ({
    rank: i + 1,
    title: x.flag.title,
    house: x.flag.vendor || "",
    status: x.flag.status,
    score: x.score,
    bandLabel: x.band.label,
    decision: DECISION_LABEL[x.decision],
    qty: x.qty || "",
    unit: x.unitPrice ? x.unitPrice.toFixed(2) : "",
    size: x.ref ? x.ref.size : "",
    committed: x.committed ? x.committed.toFixed(2) : "",
    flagged: x.flag.flaggedDate || "",
    note: x.flag.note || "",
  }));
}

function stamp() { return new Date().toISOString().slice(0, 10); }

function exportWatchExcel() {
  const rows = buyListRows();
  if (!rows.length) { toast("Nothing to export with these filters.", "warn"); return; }
  const sheet = rows.map((r) => ({
    Rank: r.rank,
    Item: r.title,
    House: r.house,
    "Scan status": r.status,
    "Priority score": r.score,
    Action: r.bandLabel,
    "Your decision": r.decision,
    Quantity: r.qty,
    "Reference size": r.size,
    "Unit retail": r.unit,
    "Committed retail": r.committed,
    "First flagged": r.flagged,
    Note: r.note,
  }));
  const ws = XLSX.utils.json_to_sheet(sheet);
  ws["!cols"] = [{ wch: 6 }, { wch: 46 }, { wch: 20 }, { wch: 12 }, { wch: 13 }, { wch: 14 },
                 { wch: 13 }, { wch: 10 }, { wch: 22 }, { wch: 11 }, { wch: 16 }, { wch: 12 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buy list");
  XLSX.writeFile(wb, "leparfumier-buy-list-" + stamp() + ".xlsx");
  toast("Excel buy list downloaded.");
}

const INK_RGB = [26, 22, 34];
const IRIS_RGB = [109, 46, 107];
const VERM_RGB = [174, 50, 38];

function pdfMasthead(doc, title, subtitle) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor.apply(doc, INK_RGB);
  doc.rect(0, 0, w, 26, "F");
  doc.setTextColor(239, 234, 244);
  doc.setFont("times", "normal");
  doc.setFontSize(19);
  doc.text("Le Parfumier", 14, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(198, 142, 195);
  doc.text(title.toUpperCase(), 14, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 112, 132);
  doc.text(subtitle, 14, 33);
}

function exportWatchPdf() {
  const rows = buyListRows();
  if (!rows.length) { toast("Nothing to export with these filters.", "warn"); return; }
  const doc = new window.jspdf.jsPDF({ orientation: "landscape" });

  const committed = rows.reduce((s, r) => s + (parseFloat(r.committed) || 0), 0);
  const acting = rows.filter((r) => r.bandLabel === "Act now").length;

  pdfMasthead(
    doc,
    "Discontinuation buy list",
    "Generated " + new Date().toLocaleString("en-CA") + "   |   " + rows.length + " items   |   " +
      acting + " at act now   |   " + moneyShort(committed) + " committed at retail"
  );

  doc.autoTable({
    startY: 39,
    head: [["#", "Item", "House", "Status", "Score", "Action", "Decision", "Qty", "Unit", "Committed"]],
    body: rows.map((r) => [
      r.rank, r.title, r.house, r.status, r.score, r.bandLabel, r.decision,
      r.qty === "" ? "" : String(r.qty),
      r.unit ? "$" + r.unit : "",
      r.committed ? "$" + r.committed : "",
    ]),
    theme: "striped",
    headStyles: { fillColor: INK_RGB, textColor: [245, 240, 248], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 244, 248] },
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 9, halign: "right" },
      1: { cellWidth: 76 },
      2: { cellWidth: 34 },
      3: { cellWidth: 20 },
      4: { cellWidth: 13, halign: "right" },
      5: { cellWidth: 24 },
      6: { cellWidth: 20 },
      7: { cellWidth: 13, halign: "right" },
      8: { cellWidth: 18, halign: "right" },
      9: { cellWidth: 22, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 3 && data.cell.raw === "confirmed") data.cell.styles.textColor = VERM_RGB;
      if (data.column.index === 5 && data.cell.raw === "Act now") {
        data.cell.styles.textColor = VERM_RGB;
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 6 && data.cell.raw === "Ordered") data.cell.styles.textColor = [61, 106, 71];
    },
    didDrawPage: () => {
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(150, 143, 160);
      doc.text(
        "Unit prices are your own retail price for the largest bottle of each item. Reference sizes are in the Excel version.",
        14, h - 8
      );
      doc.text("Page " + doc.internal.getCurrentPageInfo().pageNumber, w - 26, h - 8);
    },
  });

  doc.save("leparfumier-buy-list-" + stamp() + ".pdf");
  toast("PDF buy list downloaded.");
}

// -------------------------------------------------------- supplier stock ---

const HEADER_KEYWORDS = ["upc", "barcode", "ean", "item", "description", "price", "qty", "quantity", "designer", "sku", "stock"];
const STOP_WORDS = new Set(["pour", "de", "eau", "homme", "femme", "et", "the", "for", "men", "women", "toilette", "parfum", "edt", "edp", "ml", "oz"]);

let lastReport = null;

function openStockModal() {
  el("stock-count").textContent = String(state.selected.size);
  el("stock-files").innerHTML = "";
  el("stock-results").innerHTML = "";
  el("stock-file").value = "";
  el("stock-pdf").classList.add("hidden");
  el("stock-xls").classList.add("hidden");
  lastReport = null;
  el("stock-modal").classList.remove("hidden");
}

function initStockModal() {
  const modal = el("stock-modal");
  el("stock-close").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  el("stock-file").addEventListener("change", (e) => {
    const files = [...e.target.files];
    if (files.length) handleStockFiles(files);
  });
  el("stock-pdf").addEventListener("click", exportStockPdf);
  el("stock-xls").addEventListener("click", exportStockExcel);
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const text = (rows[i] || []).map((c) => String(c || "").toLowerCase()).join(" | ");
    if (HEADER_KEYWORDS.filter((kw) => text.includes(kw)).length >= 2) return i;
  }
  return -1;
}

function findColumn(header, matchers) {
  for (let i = 0; i < header.length; i++) {
    const cell = String(header[i] || "").toLowerCase();
    if (matchers.some((m) => cell.includes(m))) return i;
  }
  return -1;
}

function digitsOnly(s) { return String(s || "").replace(/\D/g, ""); }

function significantWords(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Resolves rather than throws, so one unreadable file never stops the rest of a batch.
function parseWorkbookFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
        const headerIdx = findHeaderRow(rows);
        if (headerIdx === -1) {
          resolve({ fileName: file.name, error: "no header row found, looked for UPC, Item, Description, Qty" });
          return;
        }
        const header = rows[headerIdx];
        resolve({
          fileName: file.name,
          rows: rows.slice(headerIdx + 1).filter((r) => r.some((c) => String(c || "").trim())),
          cols: {
            upcCol: findColumn(header, ["upc", "barcode", "ean"]),
            qtyCol: findColumn(header, ["qty", "quantity", "stock", "avail"]),
            descCol: findColumn(header, ["description", "item description", "name"]),
            itemCol: findColumn(header, ["item", "sku"]),
          },
        });
      } catch (err) {
        resolve({ fileName: file.name, error: "could not be read, is this a real .xls, .xlsx or .csv export?" });
      }
    };
    reader.onerror = () => resolve({ fileName: file.name, error: "could not be read" });
    reader.readAsArrayBuffer(file);
  });
}

async function handleStockFiles(files) {
  const filesEl = el("stock-files");
  filesEl.innerHTML = files
    .map((f) => '<div class="file-row" data-file="' + escapeAttr(f.name) + '"><span>' + escapeHtml(f.name) + '</span><span class="st">reading...</span></div>')
    .join("");
  el("stock-results").innerHTML = "";

  const parsed = await Promise.all(files.map(parseWorkbookFile));
  parsed.forEach((p) => {
    const row = filesEl.querySelector('[data-file="' + CSS.escape(p.fileName) + '"] .st');
    if (!row) return;
    if (p.error) { row.textContent = p.error; row.classList.add("err"); }
    else { row.textContent = p.rows.length.toLocaleString() + " rows"; row.classList.add("ok"); }
  });

  renderStockReport(parsed.filter((p) => !p.error));
}

function matchFlagInFile(flag, product, parsed) {
  const barcodes = product ? (product.variants || []).map((v) => digitsOnly(v.barcode)).filter(Boolean) : [];
  const words = significantWords(flag.title).concat(significantWords(flag.vendor));

  let row = null;
  let confidence = "";
  if (parsed.cols.upcCol !== -1 && barcodes.length) {
    row = parsed.rows.find((r) => barcodes.includes(digitsOnly(r[parsed.cols.upcCol])));
    if (row) confidence = "exact barcode match";
  }
  if (!row && parsed.cols.descCol !== -1) {
    const houseWord = String(flag.vendor || "").toLowerCase().split(/\s+/)[0];
    row = parsed.rows.find((r) => {
      const desc = String(r[parsed.cols.descCol] || "").toLowerCase();
      if (houseWord && !desc.includes(houseWord)) return false;
      return words.filter((w) => desc.includes(w)).length >= 2;
    });
    if (row) confidence = "matched on name, not barcode, verify before ordering";
  }
  if (!row) return null;
  const hasQtyColumn = parsed.cols.qtyCol !== -1;
  return {
    fileName: parsed.fileName,
    qty: hasQtyColumn ? cleanQty(row[parsed.cols.qtyCol]) : null,
    hasQtyColumn: hasQtyColumn,
    confidence: confidence,
  };
}

// Some supplier sheets carry a currency number format on their quantity column, so a
// cell reads back as "$7" where Excel shows 7. Strip to the number either way.
function cleanQty(v) {
  const s = String(v == null ? "" : v).replace(/[^0-9.\-]/g, "").trim();
  return s === "" || s === "-" ? null : s;
}

function qtyLabel(m) {
  if (m.qty !== null) return m.qty + " in stock";
  return m.hasQtyColumn ? "found, no quantity on this row" : "found, no quantity column in this file";
}

function renderStockReport(parsedFiles) {
  const out = el("stock-results");
  const pdfBtn = el("stock-pdf");
  const xlsBtn = el("stock-xls");
  const selected = state.flags.filter((f) => state.selected.has(f.id));

  if (!parsedFiles.length) {
    out.innerHTML = '<div class="report-note warn">No file could be read. The status beside each one says why.</div>';
    pdfBtn.classList.add("hidden");
    xlsBtn.classList.add("hidden");
    lastReport = null;
    return;
  }

  lastReport = selected.map((f) => ({
    flag: f,
    matches: parsedFiles.map((p) => matchFlagInFile(f, findProduct(f.productHandle), p)).filter(Boolean),
  }));

  const noUpc = parsedFiles.filter((p) => p.cols.upcCol === -1).map((p) => p.fileName);
  const warning = noUpc.length
    ? '<div class="report-note warn">' + escapeHtml(noUpc.join(", ")) + " " +
      (noUpc.length > 1 ? "have" : "has") +
      " no barcode column, so those were matched on house and name instead. Double check before ordering.</div>"
    : "";

  const totalRows = parsedFiles.reduce((s, p) => s + p.rows.length, 0);
  const found = lastReport.filter((r) => r.matches.length).length;

  out.innerHTML =
    '<div class="report-note">Checked ' + selected.length + " item" + (selected.length === 1 ? "" : "s") +
    " against " + parsedFiles.length + " list" + (parsedFiles.length === 1 ? "" : "s") + ", " +
    totalRows.toLocaleString() + " rows. Found " + found + " of " + selected.length + ".</div>" +
    warning +
    lastReport
      .map((r) => {
        const sources = r.matches.length
          ? '<ul class="report-sources">' +
            r.matches
              .map(
                (m) =>
                  "<li><span><span class=\"f\">" + escapeHtml(m.fileName) + "</span> " +
                  escapeHtml(m.confidence) + '</span><span class="q">' + escapeHtml(qtyLabel(m)) + "</span></li>"
              )
              .join("") +
            "</ul>"
          : "";
        return (
          '<div class="report-block"><div class="report-head"><div>' +
          '<div class="report-title">' + escapeHtml(r.flag.title) + "</div>" +
          '<div class="report-house">' + escapeHtml(r.flag.vendor || "") + "</div></div>" +
          '<span class="report-state ' + (r.matches.length ? "found" : "missing") + '">' +
          (r.matches.length
            ? "In " + r.matches.length + " of " + parsedFiles.length
            : "Not found") +
          "</span></div>" + sources + "</div>"
        );
      })
      .join("");

  pdfBtn.classList.toggle("hidden", !lastReport.length);
  xlsBtn.classList.toggle("hidden", !lastReport.length);
}

// Most quantity wins, since that supplier can actually fill the order. An exact
// barcode match breaks a tie, and "found but no quantity stated" ranks below any
// list that gives a number.
function pickRecommendation(matches) {
  if (!matches.length) return null;
  return matches
    .map((m) => ({ m: m, qty: m.qty !== null ? parseFloat(m.qty) || 0 : -1, exact: m.confidence.indexOf("exact") === 0 ? 1 : 0 }))
    .sort((a, b) => b.qty - a.qty || b.exact - a.exact)[0].m;
}

function stockReportRows() {
  return lastReport.map((r) => {
    const best = pickRecommendation(r.matches);
    return {
      title: r.flag.title,
      house: r.flag.vendor || "",
      status: r.flag.status,
      supplier: best ? best.fileName : "",
      qty: best && best.qty !== null ? best.qty : "",
      confidence: best ? best.confidence : "not found in any uploaded list",
      all: r.matches.map((m) => m.fileName + " (" + (m.qty !== null ? m.qty : "qty n/a") + ")").join("; "),
    };
  });
}

function exportStockExcel() {
  if (!lastReport || !lastReport.length) return;
  const ws = XLSX.utils.json_to_sheet(
    stockReportRows().map((r) => ({
      Item: r.title,
      House: r.house,
      "Scan status": r.status,
      "Best supplier": r.supplier,
      "Available quantity": r.qty,
      "Match confidence": r.confidence,
      "All lists checked": r.all,
    }))
  );
  ws["!cols"] = [{ wch: 44 }, { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 38 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock report");
  XLSX.writeFile(wb, "leparfumier-stock-report-" + stamp() + ".xlsx");
  toast("Excel stock report downloaded.");
}

function exportStockPdf() {
  if (!lastReport || !lastReport.length) return;
  const rows = stockReportRows();
  const doc = new window.jspdf.jsPDF({ orientation: "landscape" });
  const found = rows.filter((r) => r.supplier).length;

  pdfMasthead(
    doc,
    "Supplier stock report",
    "Generated " + new Date().toLocaleString("en-CA") + "   |   " + rows.length + " items checked   |   " +
      found + " found in at least one list"
  );

  doc.autoTable({
    startY: 39,
    head: [["Item", "House", "Status", "Best supplier", "Qty", "Match confidence"]],
    body: rows.map((r) => [r.title, r.house, r.status, r.supplier || "Not found", r.qty !== "" ? String(r.qty) : "-", r.confidence]),
    theme: "striped",
    headStyles: { fillColor: INK_RGB, textColor: [245, 240, 248], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 244, 248] },
    styles: { fontSize: 8.5, cellPadding: 3.5, overflow: "linebreak" },
    columnStyles: { 4: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3 && data.cell.raw === "Not found") {
        data.cell.styles.textColor = VERM_RGB;
      }
    },
    didDrawPage: () => {
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(150, 143, 160);
      doc.text("Page " + doc.internal.getCurrentPageInfo().pageNumber, w - 26, h - 8);
    },
  });

  doc.save("leparfumier-stock-report-" + stamp() + ".pdf");
  toast("PDF stock report downloaded.");
}

// ------------------------------------------------------------------- boot ---

function renderAll() {
  renderMasthead();
  renderBrief();
  renderFiches();
  renderHouses();
  populateHouseFilter();
  renderCatalog();
}

async function boot() {
  initWatchControls();
  initFicheEvents();
  initHouseEvents();
  initCatalogControls();
  initStockModal();

  // Flags are 45 KB and are what the page is for, so paint on those and let the
  // multi megabyte catalog fill in the prices and thumbnails when it lands.
  await loadFlags();
  renderMasthead();
  renderBrief();
  renderFiches();
  renderHouses();
  renderCatalog();

  await loadProducts();
  renderAll();
}

initTheme();
initTabs();
initSettings();
initLock();
