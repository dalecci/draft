// Le Parfumier: FLAG — client app. No build step, no dependencies.

const PIN = "4545";
const GH_OWNER = "dalecci";
const GH_DATA_REPO = "leparfumierflag-data";
const TOKEN_KEY = "lpf_token";
const UNLOCK_KEY = "lpf_unlocked";

const state = {
  products: [],
  flags: [],
  lastScan: null,
  dataSource: "bundled", // bundled | live
  page: 0,
  pageSize: 60,
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
      : "No token saved. The Flagged page will use the bundled snapshot only.";
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
    document.getElementById("token-status").textContent = "Saved and connected.";
  });
  document.getElementById("token-clear").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    document.getElementById("token-status").textContent = "Token cleared.";
  });
}

// ---------- Data loading ----------

async function fetchJsonSafe(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadData() {
  // Baseline: the snapshot bundled alongside the deployed site.
  const [bundledProducts, bundledFlags] = await Promise.all([
    fetchJsonSafe("data/products.json"),
    fetchJsonSafe("data/flags.json"),
  ]);
  if (bundledProducts) state.products = bundledProducts;
  if (bundledFlags) {
    state.flags = bundledFlags.flags || [];
    state.lastScan = bundledFlags.lastScan || null;
  }

  // Live overlay: if a token is saved, pull fresher flags from the private data repo.
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    const liveFlags = await fetchGithubJson("flags.json", token);
    if (liveFlags) {
      state.flags = liveFlags.flags || [];
      state.lastScan = liveFlags.lastScan || null;
      state.dataSource = "live";
    }
    const liveProducts = await fetchGithubJson("products.json", token);
    if (liveProducts) state.products = liveProducts;
  }
}

async function fetchGithubJson(path, token) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_DATA_REPO}/contents/${path}`,
      { headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3.raw" } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
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
    <span>Data: ${state.dataSource === "live" ? "live connection" : "bundled snapshot, connect in settings for live updates"}</span>
  `;
}

function findProduct(handle) {
  return state.products.find((p) => p.handle === handle);
}

function renderFlagged() {
  const list = document.getElementById("flagged-list");
  const empty = document.getElementById("flagged-empty");
  if (!state.flags.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const sorted = [...state.flags].sort((a, b) => (b.flaggedDate || "").localeCompare(a.flaggedDate || ""));

  list.innerHTML = sorted
    .map((f) => {
      const product = findProduct(f.productHandle);
      const img = product && product.image ? product.image : "";
      const signals = (f.signals || [])
        .map((s) => `<li>${escapeHtml(s.note)}</li>`)
        .join("");
      const market = f.marketCheck && f.marketCheck.checked
        ? `<div class="flag-market"><strong>Market check:</strong> ${escapeHtml(f.marketCheck.note)}</div>`
        : "";
      const sources = (f.sources || [])
        .map((s) => `<a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`)
        .join("");
      return `
        <article class="flag-card">
          <div class="flag-thumb" style="background-image:url('${escapeAttr(img)}')"></div>
          <div class="flag-body">
            <p class="flag-title">${escapeHtml(f.title)}</p>
            <p class="flag-vendor">${escapeHtml(f.vendor || "")}</p>
            <ul class="flag-signals">${signals}</ul>
            ${market}
            <div class="flag-sources">${sources}</div>
          </div>
          <div class="flag-side">
            <span class="status-pill ${f.status}">${f.status}</span>
            <span class="flag-date">Flagged ${f.flaggedDate || ""}</span>
          </div>
        </article>
      `;
    })
    .join("");
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

// ---------- Boot ----------

async function boot() {
  initInventoryControls();
  await loadData();
  renderAll();
}

initLock();
initTabs();
initSettings();
