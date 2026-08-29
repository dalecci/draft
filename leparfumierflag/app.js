// Le Parfumier: FLAG — client app. No build step, no dependencies except the
// vendored SheetJS (public/vendor/xlsx.full.min.js) used for the stock-check upload.
//
// Bump this on every deploy that changes app.js, style.css, or index.html,
// and bump the ?v= query params in index.html's <link>/<script> tags to match
// (see deploy.ps1's cache warning). Shown in the status bar so Jordan can tell
// at a glance whether a browser tab is running the latest build.
const APP_VERSION = 4;

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

function openStockModal() {
  document.getElementById("stock-selected-count").textContent = state.selected.size;
  document.getElementById("stock-results").innerHTML = "";
  document.getElementById("stock-file-input").value = "";
  document.getElementById("stock-modal").classList.remove("hidden");
}

function initStockModal() {
  document.getElementById("stock-modal-close").addEventListener("click", () => document.getElementById("stock-modal").classList.add("hidden"));
  document.getElementById("stock-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleStockFile(file);
  });
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

function handleStockFile(file) {
  const resultsEl = document.getElementById("stock-results");
  resultsEl.innerHTML = `<p class="stock-note">Reading ${escapeHtml(file.name)}...</p>`;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

      const headerIdx = findHeaderRow(rows);
      if (headerIdx === -1) {
        resultsEl.innerHTML = `<p class="stock-note">Could not find a header row in this file (looked for columns like UPC, Item, Description, Qty). Try a different sheet or file.</p>`;
        return;
      }
      const header = rows[headerIdx];
      const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => String(c || "").trim()));

      const upcCol = findColumn(header, ["upc", "barcode", "ean"]);
      const qtyCol = findColumn(header, ["qty", "quantity", "stock", "avail"]);
      const descCol = findColumn(header, ["description", "item description", "name"]);
      const itemCol = findColumn(header, ["item", "sku"]);

      renderStockResults(dataRows, { upcCol, qtyCol, descCol, itemCol }, file.name);
    } catch (err) {
      resultsEl.innerHTML = `<p class="stock-note">Could not read this file (${escapeHtml(err.message || "unknown error")}). Make sure it is a real .xls, .xlsx, or .csv export.</p>`;
    }
  };
  reader.onerror = () => {
    resultsEl.innerHTML = `<p class="stock-note">Could not read this file.</p>`;
  };
  reader.readAsArrayBuffer(file);
}

function renderStockResults(rows, cols, fileName) {
  const resultsEl = document.getElementById("stock-results");
  const selectedFlags = state.flags.filter((f) => state.selected.has(f.id));

  const upcWarning = cols.upcCol === -1
    ? `<p class="stock-note">No UPC/barcode column found in this file, matching by brand and name instead, less reliable, double check anything it finds.</p>`
    : "";

  const rowsHtml = selectedFlags
    .map((f) => {
      const product = findProduct(f.productHandle);
      const barcodes = product ? (product.variants || []).map((v) => digitsOnly(v.barcode)).filter(Boolean) : [];
      const words = significantWords(f.title) .concat(significantWords(f.vendor));

      let match = null;
      let confidence = "";

      if (cols.upcCol !== -1 && barcodes.length) {
        match = rows.find((r) => barcodes.includes(digitsOnly(r[cols.upcCol])));
        if (match) confidence = "exact barcode match";
      }
      if (!match && cols.descCol !== -1) {
        const vendorWord = (f.vendor || "").toLowerCase().split(/\s+/)[0];
        match = rows.find((r) => {
          const desc = String(r[cols.descCol] || "").toLowerCase();
          if (vendorWord && !desc.includes(vendorWord)) return false;
          const hits = words.filter((w) => desc.includes(w)).length;
          return hits >= 2;
        });
        if (match) confidence = "possible match by name, not barcode, verify before ordering";
      }

      let resultHtml;
      if (match) {
        const qty = cols.qtyCol !== -1 ? (match[cols.qtyCol] || "0") : null;
        const label = qty !== null ? `${escapeHtml(qty)} in stock` : "found, no quantity column in this file";
        resultHtml = `<span class="stock-row-result found">${label}<br><span style="font-weight:400;font-size:11px;">${escapeHtml(confidence)}</span></span>`;
      } else {
        resultHtml = `<span class="stock-row-result not-found">Not in this file</span>`;
      }

      return `
        <div class="stock-row">
          <div>
            <div class="stock-row-title">${escapeHtml(f.title)}</div>
            <div class="stock-row-vendor">${escapeHtml(f.vendor || "")}</div>
          </div>
          ${resultHtml}
        </div>
      `;
    })
    .join("");

  resultsEl.innerHTML = `<p class="stock-note">Matched against ${escapeHtml(fileName)}, ${rows.length} rows.</p>` + upcWarning + rowsHtml;
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
