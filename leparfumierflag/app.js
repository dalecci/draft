// Le Parfumier: FLAG — client app. No build step, no dependencies except the
// vendored SheetJS (public/vendor/xlsx.full.min.js) used for the stock-check upload.
//
// Bump this on every deploy that changes app.js, style.css, or index.html,
// and bump the ?v= query params in index.html's <link>/<script> tags to match
// (see deploy.ps1's cache warning). Shown in the status bar so Jordan can tell
// at a glance whether a browser tab is running the latest build.
const APP_VERSION = 5;

const PIN = "4545";
const GH_OWNER = "dalecci";
const GH_DATA_REPO = "leparfumierflag-data";
const TOKEN_KEY = "lpf_token";
const UNLOCK_KEY = "lpf_unlocked";
const OVERRIDES_KEY = "lpf_overrides"; // { [flagId]: {userConfirmed, orderedQty, orderedDate} }, per-browser
// fallback + sync source of truth once a token is connected.

const state = {
  products: [],
  flags: [],
  lastScan: null,
  dataSource: "bundled", // bundled | live
  flagsSha: null, // GitHub blob sha for flags.json, needed to write updates back
  page: 0,
  pageSize: 60,
  sort: "newest",
  filterAiStatus: "",
  filterReview: "",
  filterOrder: "",
  selected: new Set(), // flag ids selected via checkbox, for the stock-check upload
};

// ---------- Lock screen ----------

function tryUnlock() {
  const val = document.getElementById("lock-input").value.trim();
  const err = document.getElementById("lock-error");
  if (val === PIN) {
    localStorage.setItem(UNLOCK_KEY, "1");
    document.getElementById("lock").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    boot();
  } else {
    err.textContent = "That code is not right.";
  }
}

function initLock() {
  if (localStorage.getItem(UNLOCK_KEY) === "1") {
    document.getElementById("lock").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    boot();
    return;
  }
  document.getElementById("lock-btn").addEventListener("click", tryUnlock);
  document.getElementById("lock-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });
  document.getElementById("lock-input").focus();
}

// ---------- Tabs ----------

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
      document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    });
  });
}

// ---------- Settings / token ----------

function initSettings() {
  const modal = document.getElementById("settings");
  document.getElementById("settings-btn").addEventListener("click", () => {
    modal.classList.remove("hidden");
    const saved = localStorage.getItem(TOKEN_KEY);
    document.getElementById("token-status").textContent = saved
      ? "A token is currently saved in this browser."
      : "No token saved. Cost data stays hidden, and review/order changes save to this browser only.";
  });
  document.getElementById("settings-close").addEventListener("click", () => modal.classList.add("hidden"));
  document.getElementById("token-save").addEventListener("click", async () => {
    const val = document.getElementById("token-input").value.trim();
    if (!val) return;
    localStorage.setItem(TOKEN_KEY, val);
    document.getElementById("token-input").value = "";
    document.getElementById("token-status").textContent = "Saved. Reloading live data...";
    await loadData();
    renderAll();
    // Push anything saved locally before a token existed, so it's not stranded on this device.
    scheduleGithubSync();
    document.getElementById("token-status").textContent = "Saved and connected.";
  });
  document.getElementById("token-clear").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    document.getElementById("token-status").textContent = "Token cleared. Review/order changes will save to this browser only from now on.";
  });
}

// ---------- Data loading ----------

async function fetchJsonSafe(url, opts) {
  try {
    // no-store: these files change on every scan/redeploy, a cached copy would show
    // stale flags. Small files, fetched once at boot, the cost of skipping cache is negligible.
    const res = await fetch(url, { cache: "no-store", ...opts });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadData() {
  // Baseline: the snapshot bundled alongside the deployed site (updated by the scheduled
  // scan directly, see README — not gated behind a token, a flag list carries no cost data).
  const [bundledProducts, bundledFlags] = await Promise.all([
    fetchJsonSafe("data/products.json"),
    fetchJsonSafe("data/flags.json"),
  ]);
  if (bundledProducts) state.products = bundledProducts;
  if (bundledFlags) {
    state.flags = bundledFlags.flags || [];
    state.lastScan = bundledFlags.lastScan || null;
  }

  // Live overlay: if a token is saved, pull the full product list (this one DOES carry
  // wholesale cost) and the authoritative flags.json (with its sha, so we can write updates
  // back) from the private data repo instead of the redacted/possibly-a-few-days-old bundle.
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    const [liveProducts, liveFlagsMeta] = await Promise.all([
      fetchGithubJson("products.json", token),
      fetchGithubFileMeta("flags.json", token),
    ]);
    if (liveProducts) {
      state.products = liveProducts;
      state.dataSource = "live";
    }
    if (liveFlagsMeta) {
      try {
        const parsed = JSON.parse(decodeBase64Utf8(liveFlagsMeta.content));
        state.flags = parsed.flags || [];
        state.lastScan = parsed.lastScan || null;
        state.flagsSha = liveFlagsMeta.sha;
      } catch {
        /* leave bundled flags in place if the live file is somehow unparseable */
      }
    }
  }

  applyLocalOverrides();
}

async function fetchGithubJson(path, token) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/${path}`,
      { cache: "no-store", headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3.raw" } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Same endpoint, default (non-raw) Accept header: returns {sha, content (base64), ...} so we
// have the blob sha a follow-up write needs.
async function fetchGithubFileMeta(path, token) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/${path}`,
      { cache: "no-store", headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function decodeBase64Utf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}
function encodeUtf8Base64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// ---------- Review / order tracking, with local + GitHub persistence ----------

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveOverrides(overrides) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}
function applyLocalOverrides() {
  const overrides = loadOverrides();
  state.flags.forEach((f) => {
    if (overrides[f.id]) Object.assign(f, overrides[f.id]);
  });
}

let syncTimer = null;

// Updates one flag's review/order fields: instant local update + localStorage (always works,
// this browser only), then a debounced push to the private data repo if a token is connected
// (syncs across every device). Jordan asked for this to answer "where are we", it needs to
// survive a refresh at minimum, and ideally be shared, hence the two tiers.
function updateFlagField(flagId, changes) {
  const flag = state.flags.find((f) => f.id === flagId);
  if (!flag) return;
  Object.assign(flag, changes);

  const overrides = loadOverrides();
  overrides[flagId] = { ...(overrides[flagId] || {}), ...changes };
  saveOverrides(overrides);

  renderFlagged();
  scheduleGithubSync();
}

function scheduleGithubSync() {
  const token = localStorage.getItem(TOKEN_KEY);
  const statusEl = document.getElementById("sync-status");
  if (!token) {
    if (statusEl) { statusEl.textContent = "Saved on this device. Connect a token in settings to sync everywhere."; statusEl.classList.add("show"); }
    return;
  }
  if (statusEl) { statusEl.textContent = "Saving..."; statusEl.classList.add("show"); }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncOverridesToGithub(token), 1000);
}

async function syncOverridesToGithub(token) {
  const statusEl = document.getElementById("sync-status");
  try {
    const meta = await fetchGithubFileMeta("flags.json", token);
    if (!meta) throw new Error("could not read current flags.json");
    const current = JSON.parse(decodeBase64Utf8(meta.content));
    const overrides = loadOverrides();
    (current.flags || []).forEach((f) => {
      if (overrides[f.id]) Object.assign(f, overrides[f.id]);
    });
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/flags.json`,
      {
        method: "PUT",
        headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Update review/order status from the FLAG app",
          content: encodeUtf8Base64(JSON.stringify(current, null, 2)),
          sha: meta.sha,
        }),
      }
    );
    if (!res.ok) throw new Error("write rejected");
    state.flagsSha = (await res.json()).content.sha;
    if (statusEl) statusEl.textContent = "Saved and synced.";
  } catch {
    if (statusEl) statusEl.textContent = "Saved on this device, sync failed, will retry on your next change.";
  }
}

// ---------- Rendering ----------

function money(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  return "$" + n.toFixed(2);
}

function priceRange(product) {
  const prices = (product.variants || [])
    .map((v) => parseFloat(v.price))
    .filter((n) => !isNaN(n));
  if (!prices.length) return "";
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? money(lo) : `${money(lo)} to ${money(hi)}`;
}

function renderStatbar() {
  const brands = new Set(state.products.map((p) => p.vendor).filter(Boolean));
  const flaggedOpen = state.flags.filter((f) => f.status !== "cleared").length;
  const scanTxt = state.lastScan ? new Date(state.lastScan).toLocaleString() : "not yet run";
  document.getElementById("statbar").innerHTML = `
    <span><strong>${state.products.length.toLocaleString()}</strong> products</span>
    <span><strong>${brands.size.toLocaleString()}</strong> brands</span>
    <span class="${flaggedOpen ? "warn" : ""}"><strong>${flaggedOpen}</strong> currently flagged</span>
    <span>Last scan: ${scanTxt}</span>
    <span>Cost data: ${state.dataSource === "live" ? "connected" : "hidden, connect in settings"}</span>
    <span id="sync-status" class="save-tick"></span>
    <span class="version-tag" title="Bump the ?v= in index.html and APP_VERSION in app.js on every deploy">Site v${APP_VERSION}</span>
  `;
}

function findProduct(handle) {
  return state.products.find((p) => p.handle === handle);
}

function getFilteredSortedFlags() {
  let items = state.flags.filter((f) => {
    if (state.filterAiStatus && f.status !== state.filterAiStatus) return false;
    if (state.filterReview === "unreviewed" && (f.userConfirmed === true || f.userConfirmed === false)) return false;
    if (state.filterReview === "confirmed" && f.userConfirmed !== true) return false;
    if (state.filterReview === "rejected" && f.userConfirmed !== false) return false;
    if (state.filterOrder === "ordered" && !(f.orderedQty > 0)) return false;
    if (state.filterOrder === "not-ordered" && f.orderedQty > 0) return false;
    return true;
  });

  const statusRank = { confirmed: 0, rumored: 1, cleared: 2 };
  items = [...items];
  if (state.sort === "status") {
    items.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9));
  } else if (state.sort === "brand") {
    items.sort((a, b) => (a.vendor || "").localeCompare(b.vendor || ""));
  } else if (state.sort === "ordered") {
    items.sort((a, b) => (b.orderedQty || 0) - (a.orderedQty || 0));
  } else {
    items.sort((a, b) => (b.flaggedDate || "").localeCompare(a.flaggedDate || ""));
  }
  return items;
}

function renderFlagged() {
  const list = document.getElementById("flagged-list");
  const empty = document.getElementById("flagged-empty");
  if (!state.flags.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    empty.querySelector("p").textContent = "Nothing flagged yet. Once the first scan runs, anything at risk will show up here.";
    updateSelectBar([]);
    return;
  }

  const items = getFilteredSortedFlags();
  if (!items.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    empty.querySelector("p").textContent = "Nothing matches these filters.";
    updateSelectBar(items);
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = items
    .map((f) => {
      const product = findProduct(f.productHandle);
      const img = product && product.image ? product.image : "";
      const signals = (f.signals || []).map((s) => `<li>${escapeHtml(s.note)}</li>`).join("");
      const market = f.marketCheck && f.marketCheck.checked
        ? `<div class="flag-market"><strong>Market check:</strong> ${escapeHtml(f.marketCheck.note)}</div>`
        : "";
      const sources = (f.sources || [])
        .map((s) => `<a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`)
        .join("");
      const checked = state.selected.has(f.id) ? "checked" : "";
      const confirmActive = f.userConfirmed === true ? "active" : "";
      const rejectActive = f.userConfirmed === false ? "active" : "";
      const rejectedClass = f.userConfirmed === false ? "rejected" : "";
      const qty = f.orderedQty || "";
      return `
        <article class="flag-card ${rejectedClass}" data-flag-id="${escapeAttr(f.id)}">
          <input type="checkbox" class="flag-select" ${checked}>
          <div class="flag-thumb" style="background-image:url('${escapeAttr(img)}')"></div>
          <div class="flag-body">
            <p class="flag-title">${escapeHtml(f.title)}</p>
            <p class="flag-vendor">${escapeHtml(f.vendor || "")}</p>
            <ul class="flag-signals">${signals}</ul>
            ${market}
            <div class="flag-sources">${sources}</div>
            <div class="flag-actions">
              <button class="review-btn confirm ${confirmActive}" data-action="confirm">✓ Confirm</button>
              <button class="review-btn reject ${rejectActive}" data-action="reject">✗ Reject</button>
              <label class="flag-order">Ordered
                <input type="number" min="0" step="1" class="order-qty" value="${escapeAttr(qty)}" placeholder="0">
              </label>
            </div>
          </div>
          <div class="flag-side">
            <span class="status-pill ${f.status}">${f.status}</span>
            <span class="flag-date">Flagged ${f.flaggedDate || ""}</span>
          </div>
        </article>
      `;
    })
    .join("");

  updateSelectBar(items);
}

function updateSelectBar(visibleItems) {
  const count = state.selected.size;
  document.getElementById("select-count").textContent = count ? `${count} selected` : "";
  document.getElementById("check-stock-btn").disabled = count === 0;
  const selectAll = document.getElementById("select-all-flags");
  const visibleIds = visibleItems.map((f) => f.id);
  selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
}

// Event delegation on the list container: cards are re-rendered wholesale on every change,
// so listeners are attached once here rather than re-bound per card.
function initFlaggedList() {
  const list = document.getElementById("flagged-list");

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".review-btn");
    if (!btn) return;
    const card = e.target.closest(".flag-card");
    const flagId = card.dataset.flagId;
    const action = btn.dataset.action;
    const flag = state.flags.find((f) => f.id === flagId);
    const next = action === "confirm"
      ? (flag.userConfirmed === true ? null : true)
      : (flag.userConfirmed === false ? null : false);
    updateFlagField(flagId, { userConfirmed: next });
  });

  list.addEventListener("change", (e) => {
    const card = e.target.closest(".flag-card");
    if (!card) return;
    const flagId = card.dataset.flagId;
    if (e.target.classList.contains("flag-select")) {
      if (e.target.checked) state.selected.add(flagId);
      else state.selected.delete(flagId);
      updateSelectBar(getFilteredSortedFlags());
      return;
    }
    if (e.target.classList.contains("order-qty")) {
      const qty = Math.max(0, parseInt(e.target.value, 10) || 0);
      updateFlagField(flagId, { orderedQty: qty || null, orderedDate: qty ? new Date().toISOString().slice(0, 10) : null });
    }
  });
}

function initFlaggedControls() {
  document.getElementById("flag-sort").addEventListener("change", (e) => { state.sort = e.target.value; renderFlagged(); });
  document.getElementById("filter-ai-status").addEventListener("change", (e) => { state.filterAiStatus = e.target.value; renderFlagged(); });
  document.getElementById("filter-review").addEventListener("change", (e) => { state.filterReview = e.target.value; renderFlagged(); });
  document.getElementById("filter-order").addEventListener("change", (e) => { state.filterOrder = e.target.value; renderFlagged(); });
  document.getElementById("select-all-flags").addEventListener("change", (e) => {
    const visible = getFilteredSortedFlags();
    if (e.target.checked) visible.forEach((f) => state.selected.add(f.id));
    else visible.forEach((f) => state.selected.delete(f.id));
    renderFlagged();
  });
  document.getElementById("check-stock-btn").addEventListener("click", openStockModal);
}

function populateBrandFilter() {
  const sel = document.getElementById("brand-filter");
  const brands = [...new Set(state.products.map((p) => p.vendor).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All brands</option>` + brands.map((b) => `<option value="${escapeAttr(b)}">${escapeHtml(b)}</option>`).join("");
}

function filteredProducts() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const brand = document.getElementById("brand-filter").value;
  const status = document.getElementById("status-filter").value;
  return state.products.filter((p) => {
    if (brand && p.vendor !== brand) return false;
    if (status && p.status !== status) return false;
    if (q && !((p.title || "").toLowerCase().includes(q) || (p.vendor || "").toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderInventory() {
  const items = filteredProducts();
  document.getElementById("inventory-count").textContent = `${items.length.toLocaleString()} product${items.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  if (state.page >= totalPages) state.page = totalPages - 1;
  const start = state.page * state.pageSize;
  const pageItems = items.slice(start, start + state.pageSize);

  document.getElementById("inventory-list").innerHTML = pageItems
    .map((p) => `
      <div class="product-card">
        <div class="product-thumb" style="background-image:url('${escapeAttr(p.image || "")}')"></div>
        <p class="product-title">${escapeHtml(p.title || "(untitled)")}</p>
        <p class="product-vendor">${escapeHtml(p.vendor || "")}</p>
        <p class="product-price">${priceRange(p)}</p>
        <p class="product-status">${escapeHtml(p.status || "")}</p>
      </div>
    `)
    .join("");

  document.getElementById("page-info").textContent = `Page ${state.page + 1} of ${totalPages}`;
  document.getElementById("page-prev").disabled = state.page <= 0;
  document.getElementById("page-next").disabled = state.page >= totalPages - 1;
}

function renderAll() {
  renderStatbar();
  renderFlagged();
  populateBrandFilter();
  renderInventory();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ---------- Inventory controls ----------

function initInventoryControls() {
  document.getElementById("search").addEventListener("input", () => { state.page = 0; renderInventory(); });
  document.getElementById("brand-filter").addEventListener("change", () => { state.page = 0; renderInventory(); });
  document.getElementById("status-filter").addEventListener("change", () => { state.page = 0; renderInventory(); });
  document.getElementById("page-prev").addEventListener("click", () => { state.page = Math.max(0, state.page - 1); renderInventory(); window.scrollTo(0, 0); });
  document.getElementById("page-next").addEventListener("click", () => { state.page += 1; renderInventory(); window.scrollTo(0, 0); });
}

// ---------- Stock check (Excel upload) ----------

const STOCK_HEADER_KEYWORDS = ["upc", "barcode", "ean", "item", "description", "price", "qty", "quantity", "designer", "sku", "stock"];
const STOP_WORDS = new Set(["pour", "de", "eau", "homme", "femme", "et", "the", "for", "men", "women", "toilette", "parfum", "edt", "edp", "ml", "oz"]);

let lastReport = null; // [{flag, matches: [{fileName, qty, confidence}]}], kept for CSV export

function openStockModal() {
  document.getElementById("stock-selected-count").textContent = state.selected.size;
  document.getElementById("stock-file-list").innerHTML = "";
  document.getElementById("stock-results").innerHTML = "";
  document.getElementById("stock-file-input").value = "";
  document.getElementById("stock-export-btn").classList.add("hidden");
  lastReport = null;
  document.getElementById("stock-modal").classList.remove("hidden");
}

function initStockModal() {
  document.getElementById("stock-modal-close").addEventListener("click", () => document.getElementById("stock-modal").classList.add("hidden"));
  document.getElementById("stock-file-input").addEventListener("change", (e) => {
    const files = [...e.target.files];
    if (files.length) handleStockFiles(files);
  });
  document.getElementById("stock-export-btn").addEventListener("click", exportReportCsv);
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const rowText = (rows[i] || []).map((c) => String(c || "").toLowerCase()).join(" | ");
    const hits = STOCK_HEADER_KEYWORDS.filter((kw) => rowText.includes(kw)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

function findColumn(headerRow, matchers) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] || "").toLowerCase();
    if (matchers.some((m) => cell.includes(m))) return i;
  }
  return -1;
}

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function significantWords(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Reads and parses one uploaded file. Never throws — resolves with an `error` field
// instead, so one bad file in a multi-file batch doesn't stop the others.
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
          resolve({ fileName: file.name, error: "no recognizable header row (looked for UPC, Item, Description, Qty, ...)" });
          return;
        }
        const header = rows[headerIdx];
        const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => String(c || "").trim()));
        const cols = {
          upcCol: findColumn(header, ["upc", "barcode", "ean"]),
          qtyCol: findColumn(header, ["qty", "quantity", "stock", "avail"]),
          descCol: findColumn(header, ["description", "item description", "name"]),
          itemCol: findColumn(header, ["item", "sku"]),
        };
        resolve({ fileName: file.name, rows: dataRows, cols });
      } catch (err) {
        resolve({ fileName: file.name, error: err.message || "could not be read, is this a real .xls, .xlsx, or .csv export?" });
      }
    };
    reader.onerror = () => resolve({ fileName: file.name, error: "could not be read" });
    reader.readAsArrayBuffer(file);
  });
}

async function handleStockFiles(files) {
  const fileListEl = document.getElementById("stock-file-list");
  const resultsEl = document.getElementById("stock-results");
  fileListEl.innerHTML = files
    .map((f) => `<div class="stock-file-row" data-file="${escapeAttr(f.name)}"><span>${escapeHtml(f.name)}</span><span class="file-status">reading...</span></div>`)
    .join("");
  resultsEl.innerHTML = "";

  const parsed = await Promise.all(files.map(parseWorkbookFile));

  parsed.forEach((p) => {
    const row = fileListEl.querySelector(`[data-file="${CSS.escape(p.fileName)}"] .file-status`);
    if (!row) return;
    if (p.error) { row.textContent = p.error; row.classList.add("err"); }
    else { row.textContent = `${p.rows.length} rows`; row.classList.add("ok"); }
  });

  renderStockReport(parsed.filter((p) => !p.error));
}

// One flag matched against one already-parsed file: barcode first, brand+name fallback.
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
    const vendorWord = (flag.vendor || "").toLowerCase().split(/\s+/)[0];
    row = parsed.rows.find((r) => {
      const desc = String(r[parsed.cols.descCol] || "").toLowerCase();
      if (vendorWord && !desc.includes(vendorWord)) return false;
      return words.filter((w) => desc.includes(w)).length >= 2;
    });
    if (row) confidence = "possible match by name, not barcode, verify before ordering";
  }
  if (!row) return null;
  const qty = parsed.cols.qtyCol !== -1 ? (row[parsed.cols.qtyCol] || "0") : null;
  return { fileName: parsed.fileName, qty, confidence };
}

function renderStockReport(parsedFiles) {
  const resultsEl = document.getElementById("stock-results");
  const exportBtn = document.getElementById("stock-export-btn");
  const selectedFlags = state.flags.filter((f) => state.selected.has(f.id));

  if (!parsedFiles.length) {
    resultsEl.innerHTML = `<p class="stock-note">No file could be read, see the status above each one.</p>`;
    exportBtn.classList.add("hidden");
    lastReport = null;
    return;
  }

  const noUpcFiles = parsedFiles.filter((p) => p.cols.upcCol === -1).map((p) => p.fileName);
  const upcWarning = noUpcFiles.length
    ? `<p class="stock-note">${escapeHtml(noUpcFiles.join(", "))} ${noUpcFiles.length > 1 ? "have" : "has"} no UPC/barcode column, matched by brand and name instead, less reliable, double check before ordering.</p>`
    : "";

  lastReport = selectedFlags.map((f) => {
    const product = findProduct(f.productHandle);
    const matches = parsedFiles
      .map((p) => matchFlagInFile(f, product, p))
      .filter(Boolean);
    return { flag: f, matches };
  });

  const blocksHtml = lastReport
    .map(({ flag: f, matches }) => {
      const sourcesHtml = matches.length
        ? `<ul class="stock-source-list">${matches
            .map((m) => `
              <li class="stock-source-row">
                <span><span class="stock-source-file">${escapeHtml(m.fileName)}</span> — <span class="stock-source-note">${escapeHtml(m.confidence)}</span></span>
                <span class="stock-source-qty">${m.qty !== null ? escapeHtml(m.qty) + " in stock" : "found, no qty column"}</span>
              </li>
            `)
            .join("")}</ul>`
        : "";
      return `
        <div class="stock-item-block">
          <div class="stock-item-head">
            <div>
              <div class="stock-row-title">${escapeHtml(f.title)}</div>
              <div class="stock-row-vendor">${escapeHtml(f.vendor || "")}</div>
            </div>
            <span class="stock-item-status ${matches.length ? "found" : "not-found"}">${matches.length ? `In ${matches.length} of ${parsedFiles.length} list${parsedFiles.length === 1 ? "" : "s"}` : "Not found in any uploaded list"}</span>
          </div>
          ${sourcesHtml}
        </div>
      `;
    })
    .join("");

  const totalRows = parsedFiles.reduce((sum, p) => sum + p.rows.length, 0);
  resultsEl.innerHTML =
    `<p class="stock-note">Report across ${parsedFiles.length} list${parsedFiles.length === 1 ? "" : "s"} (${totalRows.toLocaleString()} rows total) for ${selectedFlags.length} selected item${selectedFlags.length === 1 ? "" : "s"}.</p>` +
    upcWarning + blocksHtml;

  exportBtn.classList.toggle("hidden", !lastReport.length);
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportReportCsv() {
  if (!lastReport) return;
  const rows = [["Item", "Brand", "Supplier list", "Match type", "Quantity"]];
  lastReport.forEach(({ flag: f, matches }) => {
    if (!matches.length) {
      rows.push([f.title, f.vendor || "", "", "not found in any uploaded list", ""]);
    } else {
      matches.forEach((m) => rows.push([f.title, f.vendor || "", m.fileName, m.confidence, m.qty !== null ? m.qty : ""]));
    }
  });
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leparfumier-stock-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Boot ----------

async function boot() {
  initInventoryControls();
  initFlaggedControls();
  initFlaggedList();
  initStockModal();
  await loadData();
  renderAll();
}

initLock();
initTabs();
initSettings();
