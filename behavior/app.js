// ============ CONFIG ============
const SUPABASE_URL = 'https://ikypiznimyzidmyzzoys.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreXBpem5pbXl6aWRteXp6b3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzUzODIsImV4cCI6MjA5MzMxMTM4Mn0.Ee0FWPHjLBSOIFXWmdPSjG8oT3QmKyKG14BF8oPGgjk';
const GATE_PIN = '4545';
const ADMIN_PIN = '1212';

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  kids: [],
  points: [],
  consequences: [],
  templates: [],
  rewards: [],
  currentKidId: null,
  isAdmin: false,
  currentTab: 'overview',
  calDate: new Date(),
};

function toast(msg, type) {
  type = type || '';
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.className = 'toast ' + type; }, 2500);
}

let pinBuffer = '';
let pinTarget = GATE_PIN;
let pinCallback = null;
function renderPinPad() {
  const pad = document.getElementById('pinPad');
  pad.innerHTML = '';
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  keys.forEach(function (k) {
    const b = document.createElement('button');
    b.className = 'pin-btn';
    b.textContent = k;
    if (k === '') { b.style.visibility = 'hidden'; }
    else if (k === '⌫') { b.onclick = function () { pinBuffer = pinBuffer.slice(0, -1); updatePinDisplay(); }; }
    else { b.onclick = function () { if (pinBuffer.length < 4) { pinBuffer += k; updatePinDisplay(); } }; }
    pad.appendChild(b);
  });
}
function updatePinDisplay() {
  const dots = document.querySelectorAll('#pinDisplay .pin-dot');
  dots.forEach(function (d, i) { d.classList.toggle('filled', i < pinBuffer.length); });
  if (pinBuffer.length === 4) { setTimeout(checkPin, 120); }
}
function checkPin() {
  if (pinBuffer === pinTarget) {
    pinBuffer = '';
    updatePinDisplay();
    document.getElementById('gateErr').textContent = '';
    if (pinCallback) { const cb = pinCallback; pinCallback = null; cb(); }
  } else {
    pinBuffer = '';
    updatePinDisplay();
    const card = document.getElementById('gateCard');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    document.getElementById('gateErr').textContent = 'Wrong code';
  }
}
function askPin(target, label, cb) {
  pinTarget = target;
  pinCallback = cb;
  document.getElementById('gateTitle').textContent = label || 'Enter code';
  document.getElementById('gateSub').textContent = '';
  document.getElementById('gateErr').textContent = '';
  showScreen('gateScreen');
}

function showScreen(id) {
  ['gateScreen', 'loginScreen', 'kidScreen', 'adminScreen'].forEach(function (s) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}
function logout() {
  state.isAdmin = false;
  state.currentKidId = null;
  sessionStorage.removeItem('isAdmin');
  showScreen('loginScreen');
  renderLogin();
}

async function loadAll() {
  try {
    const results = await Promise.all([
      supa.from('behavior_kids').select('*').eq('active', true).order('sort_order'),
      supa.from('behavior_points').select('*').order('recorded_at', { ascending: false }),
      supa.from('behavior_consequences').select('*').order('start_date', { ascending: false }),
      supa.from('behavior_templates').select('*').order('description'),
      supa.from('behavior_rewards').select('*').order('points_required'),
    ]);
    const kids = results[0], points = results[1], consequences = results[2], templates = results[3], rewards = results[4];
    for (const r of [kids, points, consequences, templates, rewards]) {
      if (r.error) throw r.error;
    }
    state.kids = kids.data || [];
    state.points = points.data || [];
    state.consequences = consequences.data || [];
    state.templates = templates.data || [];
    state.rewards = rewards.data || [];
  } catch (e) {
    console.error('loadAll failed', e);
    toast('Sync error: ' + (e.message || e), 'error');
    throw e;
  }
}

function renderLogin() {
  const grid = document.getElementById('tileGrid');
  grid.innerHTML = '';
  state.kids.forEach(function (kid) {
    const tile = document.createElement('button');
    tile.className = 'kid-tile';
    tile.style.background = kid.color;
    tile.innerHTML = '<div class="avatar">' + escapeHtml(kid.name[0]) + '</div><div>' + escapeHtml(kid.name) + '</div>';
    tile.onclick = function () { enterKid(kid.id); };
    grid.appendChild(tile);
  });
  const admin = document.createElement('button');
  admin.className = 'kid-tile admin';
  admin.innerHTML = '<div class="avatar">⚙️</div><div>Admin</div>';
  admin.onclick = function () {
    askPin(ADMIN_PIN, 'Admin code', function () {
      state.isAdmin = true;
      sessionStorage.setItem('isAdmin', '1');
      state.currentKidId = (state.kids[0] && state.kids[0].id) || null;
      showScreen('adminScreen');
      renderAdmin();
    });
  };
  grid.appendChild(admin);
}

function enterKid(kidId) {
  state.currentKidId = kidId;
  state.isAdmin = false;
  showScreen('kidScreen');
  renderKid();
}
function getKid(id) { return state.kids.find(function (k) { return k.id === id; }); }
function kidPoints(kidId) {
  const kp = state.points.filter(function (p) { return p.kid_id === kidId; });
  const green = kp.filter(function (p) { return p.amount > 0; }).reduce(function (s, p) { return s + p.amount; }, 0);
  const red = kp.filter(function (p) { return p.amount < 0; }).reduce(function (s, p) { return s + Math.abs(p.amount); }, 0);
  return { green: green, red: red, net: green - red, all: kp };
}
function activeConsequences(kidId, today) {
  today = today || new Date();
  const t = ymd(today);
  return state.consequences.filter(function (c) {
    return c.kid_id === kidId && c.start_date <= t && c.end_date >= t;
  }).sort(function (a, b) { return a.end_date.localeCompare(b.end_date); });
}
function upcomingConsequences(kidId, today) {
  today = today || new Date();
  const t = ymd(today);
  return state.consequences.filter(function (c) {
    return c.kid_id === kidId && c.start_date > t;
  }).sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
}

function renderKid() {
  const kid = getKid(state.currentKidId);
  if (!kid) { logout(); return; }
  document.getElementById('kidTitle').textContent = kid.name;
  document.getElementById('kidName').textContent = 'Hi ' + kid.name + '!';
  document.getElementById('kidHeader').style.background = 'linear-gradient(135deg, ' + kid.color + ', ' + shade(kid.color, -25) + ')';
  const p = kidPoints(kid.id);
  const netEl = document.getElementById('kidNet');
  netEl.textContent = p.net;
  netEl.classList.toggle('negative', p.net < 0);
  document.getElementById('kidGreen').textContent = p.green;
  document.getElementById('kidRed').textContent = p.red;

  const conqWrap = document.getElementById('kidConsequences');
  const active = activeConsequences(kid.id);
  const upcoming = upcomingConsequences(kid.id);
  if (active.length === 0 && upcoming.length === 0) {
    conqWrap.innerHTML = '<div class="empty">None — keep it up! 🎉</div>';
  } else {
    conqWrap.innerHTML = '';
    active.forEach(function (c) { conqWrap.appendChild(renderConseqRow(c, 'active')); });
    upcoming.forEach(function (c) { conqWrap.appendChild(renderConseqRow(c, 'upcoming')); });
  }

  const rewardsWrap = document.getElementById('kidRewards');
  const rewards = state.rewards.filter(function (r) {
    return (r.kid_id === kid.id || r.kid_id === null) && !r.claimed_at;
  }).sort(function (a, b) { return a.points_required - b.points_required; });
  if (rewards.length === 0) {
    rewardsWrap.innerHTML = '<div class="empty">No rewards set yet</div>';
  } else {
    rewardsWrap.innerHTML = '';
    rewards.forEach(function (r) {
      const row = document.createElement('div');
      row.className = 'reward-row';
      const pct = Math.max(0, Math.min(100, (p.net / r.points_required) * 100));
      const cls = p.net >= r.points_required ? 'over' : (p.net < 0 ? 'short' : '');
      const remaining = r.points_required - p.net;
      const statusText = p.net >= r.points_required
        ? '🎉 Earned! Ask mom/dad'
        : remaining + ' more to go';
      row.innerHTML =
        '<div class="reward-top">' +
          '<span class="reward-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="reward-points">' + p.net + '/' + r.points_required + '</span>' +
        '</div>' +
        '<div class="progress"><div class="progress-bar ' + cls + '" style="width: ' + pct + '%; background: ' + (pct >= 100 ? kid.color : '') + '"></div></div>' +
        '<div style="font-size: 12px; color: var(--muted); margin-top: 4px;">' + statusText + '</div>';
      rewardsWrap.appendChild(row);
    });
  }

  const actWrap = document.getElementById('kidActivity');
  const recent = p.all.slice(0, 10);
  if (recent.length === 0) {
    actWrap.innerHTML = '<div class="empty">No activity yet</div>';
  } else {
    actWrap.innerHTML = '';
    recent.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'activity-item';
      row.innerHTML =
        '<span class="activity-amount ' + (item.amount > 0 ? 'pos' : 'neg') + '">' +
          (item.amount > 0 ? '+' : '') + item.amount + '</span>' +
        '<span class="activity-reason">' + escapeHtml(item.reason || '—') + '</span>' +
        '<span class="activity-time">' + relTime(item.recorded_at) + '</span>';
      actWrap.appendChild(row);
    });
  }
}
function renderConseqRow(c, mode) {
  const div = document.createElement('div');
  div.className = 'conseq-item';
  const today = new Date(); today.setHours(0,0,0,0);
  const end = parseYmd(c.end_date);
  const start = parseYmd(c.start_date);
  let endLabel;
  if (mode === 'upcoming') {
    endLabel = 'Starts ' + formatShort(start);
  } else {
    const days = Math.ceil((end - today) / 86400000);
    endLabel = days <= 0 ? 'Ends today' : (days === 1 ? 'Ends tomorrow' : 'Ends in ' + days + ' days');
  }
  div.innerHTML =
    '<div>' +
      '<div class="conseq-desc">' + escapeHtml(c.description) + '</div>' +
      '<div class="conseq-meta">' + formatShort(start) + ' → ' + formatShort(end) + '</div>' +
    '</div>' +
    '<div class="conseq-end">' + endLabel + '</div>';
  return div;
}

function renderAdmin() {
  const sw = document.getElementById('kidSwitcher');
  sw.innerHTML = '';
  state.kids.forEach(function (kid) {
    const btn = document.createElement('button');
    btn.textContent = kid.name;
    btn.className = state.currentKidId === kid.id ? 'active' : '';
    btn.style.background = state.currentKidId === kid.id ? kid.color : 'transparent';
    btn.onclick = function () { state.currentKidId = kid.id; renderAdmin(); };
    sw.appendChild(btn);
  });

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === state.currentTab);
    b.onclick = function () { switchTab(b.dataset.tab); };
  });
  document.querySelectorAll('.tab-content').forEach(function (c) {
    c.classList.toggle('hidden', c.dataset.tab !== state.currentTab);
  });

  if (state.currentTab === 'overview') renderAdminOverview();
  if (state.currentTab === 'points') renderAdminPoints();
  if (state.currentTab === 'consequences') renderAdminConsequences();
  if (state.currentTab === 'rewards') renderAdminRewards();
  if (state.currentTab === 'calendar') renderAdminCalendar();
  if (state.currentTab === 'settings') renderAdminSettings();
}

function renderAdminOverview() {
  const wrap = document.getElementById('overviewCharts');
  if (!wrap) return;

  // Per-kid summary cards
  const cardsWrap = document.getElementById('overviewCards');
  cardsWrap.innerHTML = '';
  state.kids.forEach(function (kid) {
    const p = kidPoints(kid.id);
    const card = document.createElement('div');
    card.className = 'overview-card';
    card.style.borderTop = '4px solid ' + kid.color;
    card.innerHTML =
      '<div class="overview-name" style="color: ' + kid.color + '">' + escapeHtml(kid.name) + '</div>' +
      '<div class="overview-net">' + p.net + '</div>' +
      '<div class="overview-split">' +
        '<span style="color: var(--green)">+' + p.green + '</span>' +
        ' · ' +
        '<span style="color: var(--red)">−' + p.red + '</span>' +
      '</div>';
    cardsWrap.appendChild(card);
  });

  // Bar chart — green vs red per kid
  drawBarChart();
  // Line chart — net over last 30 days per kid
  drawLineChart();
}

let _barChart = null;
function drawBarChart() {
  const canvas = document.getElementById('barChart');
  if (!canvas || !window.Chart) return;
  if (_barChart) { _barChart.destroy(); _barChart = null; }
  const labels = state.kids.map(function (k) { return k.name; });
  const greens = state.kids.map(function (k) { return kidPoints(k.id).green; });
  const reds = state.kids.map(function (k) { return kidPoints(k.id).red; });
  const nets = state.kids.map(function (k) { return kidPoints(k.id).net; });
  _barChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Green', data: greens, backgroundColor: '#10b981', borderRadius: 6 },
        { label: 'Red', data: reds, backgroundColor: '#ef4444', borderRadius: 6 },
        { label: 'Net', data: nets, backgroundColor: '#6366f1', borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#f1f5f9' } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { ticks: { color: '#f1f5f9' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
      },
    },
  });
}

let _lineChart = null;
function drawLineChart() {
  const canvas = document.getElementById('lineChart');
  if (!canvas || !window.Chart) return;
  if (_lineChart) { _lineChart.destroy(); _lineChart = null; }
  const DAYS = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const labels = [];
  const dayKeys = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayKeys.push(ymd(d));
    labels.push(d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }));
  }
  const datasets = state.kids.map(function (kid) {
    // Build cumulative net per day from oldest point ever, then sample on dayKeys
    const kp = state.points.filter(function (p) { return p.kid_id === kid.id; })
      .slice().sort(function (a, b) { return new Date(a.recorded_at) - new Date(b.recorded_at); });
    const data = dayKeys.map(function (dk) {
      const end = new Date(dk + 'T23:59:59');
      let sum = 0;
      for (const p of kp) {
        if (new Date(p.recorded_at) <= end) sum += p.amount;
        else break;
      }
      return sum;
    });
    return {
      label: kid.name,
      data: data,
      borderColor: kid.color,
      backgroundColor: kid.color + '33',
      tension: 0.25,
      pointRadius: 2,
      borderWidth: 2,
      fill: false,
    };
  });
  _lineChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#f1f5f9' } } },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  });
}
function switchTab(t) { state.currentTab = t; renderAdmin(); }

function renderAdminPoints() {
  const p = kidPoints(state.currentKidId);
  document.getElementById('adminScore').textContent = p.net;
  document.getElementById('adminGreen').textContent = p.green;
  document.getElementById('adminRed').textContent = p.red;
  const wrap = document.getElementById('adminActivity');
  const recent = p.all.slice(0, 20);
  if (recent.length === 0) {
    wrap.innerHTML = '<div class="empty">No activity yet</div>';
    return;
  }
  wrap.innerHTML = '';
  recent.forEach(function (item) {
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML =
      '<span class="activity-amount ' + (item.amount > 0 ? 'pos' : 'neg') + '">' +
        (item.amount > 0 ? '+' : '') + item.amount + '</span>' +
      '<span class="activity-reason">' + escapeHtml(item.reason || '—') + '</span>' +
      '<span class="activity-time">' + relTime(item.recorded_at) + '</span>' +
      '<button class="btn-danger" style="margin-left: 8px;" onclick="deletePoint(\'' + item.id + '\')">✕</button>';
    wrap.appendChild(row);
  });
}

async function addPoints(amount) {
  const reason = amount > 0 ? 'Green' : 'Red';
  await insertPoints(amount, reason);
}
function openCustomPoints() {
  openModal(
    '<h2>Add custom points</h2>' +
    '<div class="field">' +
      '<span class="label">Amount (positive = green, negative = red)</span>' +
      '<input type="number" id="mAmount" placeholder="e.g. 2 or -1" />' +
    '</div>' +
    '<div class="field">' +
      '<span class="label">Reason</span>' +
      '<input id="mReason" placeholder="What happened?" />' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn-secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="btn-primary" onclick="submitCustomPoints()">Save</button>' +
    '</div>'
  );
  setTimeout(function () { document.getElementById('mAmount').focus(); }, 50);
}
async function submitCustomPoints() {
  const amt = parseInt(document.getElementById('mAmount').value, 10);
  const reason = document.getElementById('mReason').value.trim();
  if (!amt || isNaN(amt)) { toast('Enter an amount', 'error'); return; }
  await insertPoints(amt, reason || (amt > 0 ? 'Green' : 'Red'));
  closeModal();
}
async function insertPoints(amount, reason) {
  const res = await supa.from('behavior_points').insert({
    kid_id: state.currentKidId, amount: amount, reason: reason,
  });
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  toast(amount > 0 ? '+' + amount + ' added' : amount + ' added', 'success');
  await loadAll();
  renderAdmin();
}
async function deletePoint(id) {
  if (!confirm('Delete this point entry?')) return;
  const res = await supa.from('behavior_points').delete().eq('id', id);
  if (res.error) { toast('Delete failed: ' + res.error.message, 'error'); return; }
  await loadAll();
  renderAdmin();
}

function renderAdminConsequences() {
  const sel = document.getElementById('conseqTemplate');
  sel.innerHTML = '<option value="">— Write custom —</option>';
  state.templates.forEach(function (t) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.description + ' (' + t.default_days + 'd)';
    sel.appendChild(o);
  });
  const ds = document.getElementById('conseqStart');
  const de = document.getElementById('conseqEnd');
  if (!ds.value) { ds.value = ymd(new Date()); }
  if (!de.value) { de.value = ymd(new Date()); }

  const today = ymd(new Date());
  const all = state.consequences.filter(function (c) { return c.kid_id === state.currentKidId; });
  const active = all.filter(function (c) { return c.end_date >= today; }).sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
  const past = all.filter(function (c) { return c.end_date < today; }).sort(function (a, b) { return b.end_date.localeCompare(a.end_date); }).slice(0, 20);

  function renderList(wrap, items) {
    wrap.innerHTML = '';
    if (items.length === 0) { wrap.innerHTML = '<div class="empty">None</div>'; return; }
    items.forEach(function (c) {
      const row = document.createElement('div');
      row.className = 'admin-conseq-item';
      row.innerHTML =
        '<div class="grow">' +
          '<div style="font-weight: 600;">' + escapeHtml(c.description) + '</div>' +
          '<div style="font-size: 13px; color: var(--muted); margin-top: 2px;">' + formatShort(parseYmd(c.start_date)) + ' → ' + formatShort(parseYmd(c.end_date)) + '</div>' +
        '</div>' +
        '<div class="admin-row-actions">' +
          '<button class="btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="editConsequence(\'' + c.id + '\')">Edit</button>' +
          '<button class="btn-danger" onclick="deleteConsequence(\'' + c.id + '\')">Delete</button>' +
        '</div>';
      wrap.appendChild(row);
    });
  }
  renderList(document.getElementById('adminConsequencesActive'), active);
  renderList(document.getElementById('adminConsequencesPast'), past);
}
function applyTemplate() {
  const sel = document.getElementById('conseqTemplate');
  const id = sel.value;
  if (!id) return;
  const t = state.templates.find(function (x) { return x.id === id; });
  if (!t) return;
  document.getElementById('conseqDesc').value = t.description;
  const start = document.getElementById('conseqStart').value || ymd(new Date());
  document.getElementById('conseqStart').value = start;
  const startDate = parseYmd(start);
  const end = new Date(startDate);
  end.setDate(end.getDate() + (t.default_days - 1));
  document.getElementById('conseqEnd').value = ymd(end);
}
async function saveConsequence() {
  const desc = document.getElementById('conseqDesc').value.trim();
  const start = document.getElementById('conseqStart').value;
  const end = document.getElementById('conseqEnd').value;
  if (!desc) { toast('Description required', 'error'); return; }
  if (!start || !end) { toast('Pick dates', 'error'); return; }
  if (end < start) { toast('End must be on/after start', 'error'); return; }
  const res = await supa.from('behavior_consequences').insert({
    kid_id: state.currentKidId,
    description: desc,
    start_date: start,
    end_date: end,
  });
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  toast('Consequence added', 'success');
  document.getElementById('conseqDesc').value = '';
  document.getElementById('conseqTemplate').value = '';
  await loadAll();
  renderAdmin();
}
function editConsequence(id) {
  const c = state.consequences.find(function (x) { return x.id === id; });
  if (!c) return;
  openModal(
    '<h2>Edit consequence</h2>' +
    '<div class="field"><span class="label">Description</span><input id="eDesc" value="' + escapeAttr(c.description) + '" /></div>' +
    '<div class="row" style="margin-bottom: 12px;">' +
      '<div><span class="label">Start</span><input type="date" id="eStart" value="' + c.start_date + '" /></div>' +
      '<div><span class="label">End</span><input type="date" id="eEnd" value="' + c.end_date + '" /></div>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn-secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="btn-primary" onclick="submitEditConsequence(\'' + id + '\')">Save</button>' +
    '</div>'
  );
}
async function submitEditConsequence(id) {
  const desc = document.getElementById('eDesc').value.trim();
  const start = document.getElementById('eStart').value;
  const end = document.getElementById('eEnd').value;
  if (!desc || !start || !end || end < start) { toast('Check inputs', 'error'); return; }
  const res = await supa.from('behavior_consequences').update({
    description: desc, start_date: start, end_date: end,
  }).eq('id', id);
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  closeModal();
  await loadAll();
  renderAdmin();
  toast('Updated', 'success');
}
async function deleteConsequence(id) {
  if (!confirm('Delete this consequence?')) return;
  const res = await supa.from('behavior_consequences').delete().eq('id', id);
  if (res.error) { toast('Delete failed: ' + res.error.message, 'error'); return; }
  await loadAll();
  renderAdmin();
}

function renderAdminRewards() {
  const wrap = document.getElementById('adminRewards');
  const kid = getKid(state.currentKidId);
  const items = state.rewards.filter(function (r) {
    return r.kid_id === state.currentKidId || r.kid_id === null;
  }).sort(function (a, b) { return a.points_required - b.points_required; });
  if (items.length === 0) {
    wrap.innerHTML = '<div class="empty">No rewards yet</div>';
    return;
  }
  const p = kidPoints(state.currentKidId);
  wrap.innerHTML = '';
  items.forEach(function (r) {
    const row = document.createElement('div');
    row.className = 'reward-item';
    const earned = p.net >= r.points_required;
    const scope = r.kid_id === null ? 'All kids' : (kid ? kid.name : '');
    const claimText = r.claimed_at ? ' · claimed ' + formatShort(new Date(r.claimed_at)) : '';
    const claimBtn = !r.claimed_at && earned
      ? '<button class="btn-primary" style="padding: 6px 10px; font-size: 12px;" onclick="claimReward(\'' + r.id + '\')">Claim</button>'
      : '';
    row.innerHTML =
      '<div class="grow">' +
        '<div>' + escapeHtml(r.name) + (earned ? ' 🎉' : '') + '</div>' +
        '<div class="meta">' + r.points_required + ' pts · ' + scope + claimText + '</div>' +
      '</div>' +
      claimBtn +
      '<button class="btn-danger" onclick="deleteReward(\'' + r.id + '\')">✕</button>';
    wrap.appendChild(row);
  });
}
async function saveReward() {
  const name = document.getElementById('rewardName').value.trim();
  const pts = parseInt(document.getElementById('rewardPoints').value, 10);
  const scope = document.getElementById('rewardScope').value;
  if (!name || !pts || isNaN(pts)) { toast('Fill name + points', 'error'); return; }
  const res = await supa.from('behavior_rewards').insert({
    kid_id: scope === 'all' ? null : state.currentKidId,
    name: name, points_required: pts,
  });
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  document.getElementById('rewardName').value = '';
  document.getElementById('rewardPoints').value = '';
  await loadAll();
  renderAdmin();
  toast('Reward added', 'success');
}
async function claimReward(id) {
  if (!confirm('Mark this reward as claimed?')) return;
  const res = await supa.from('behavior_rewards').update({ claimed_at: new Date().toISOString() }).eq('id', id);
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  await loadAll();
  renderAdmin();
  toast('Reward claimed 🎉', 'success');
}
async function deleteReward(id) {
  if (!confirm('Delete this reward?')) return;
  const res = await supa.from('behavior_rewards').delete().eq('id', id);
  if (res.error) { toast('Delete failed: ' + res.error.message, 'error'); return; }
  await loadAll();
  renderAdmin();
}

function calNav(dir) {
  if (dir === 0) { state.calDate = new Date(); }
  else { state.calDate.setMonth(state.calDate.getMonth() + dir); state.calDate = new Date(state.calDate); }
  renderAdmin();
}
function renderAdminCalendar() {
  const d = state.calDate;
  document.getElementById('calMonth').textContent = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function (dow) {
    const el = document.createElement('div'); el.className = 'cal-dow'; el.textContent = dow; grid.appendChild(el);
  });
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const todayStr = ymd(new Date());
  const kid = getKid(state.currentKidId);
  for (let i = 0; i < 42; i++) {
    const cell = new Date(start); cell.setDate(start.getDate() + i);
    const cellStr = ymd(cell);
    const day = document.createElement('div');
    day.className = 'cal-day';
    if (cell.getMonth() !== d.getMonth()) day.classList.add('other-month');
    if (cellStr === todayStr) day.classList.add('today');
    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = cell.getDate();
    day.appendChild(num);
    const bars = document.createElement('div');
    bars.className = 'cal-bars';
    const dayConseqs = state.consequences.filter(function (c) {
      return c.kid_id === state.currentKidId && c.start_date <= cellStr && c.end_date >= cellStr;
    });
    dayConseqs.slice(0, 3).forEach(function () {
      const bar = document.createElement('div');
      bar.className = 'cal-bar';
      bar.style.background = kid ? kid.color : '#6366f1';
      bars.appendChild(bar);
    });
    if (dayConseqs.length > 3) {
      const more = document.createElement('div');
      more.style.fontSize = '9px';
      more.style.color = 'var(--muted)';
      more.textContent = '+' + (dayConseqs.length - 3);
      bars.appendChild(more);
    }
    day.appendChild(bars);
    if (dayConseqs.length > 0) {
      day.style.cursor = 'pointer';
      day.title = dayConseqs.map(function (c) { return c.description; }).join(', ');
    }
    grid.appendChild(day);
  }
  const legend = document.getElementById('calLegend');
  const kidName = kid ? kid.name : '';
  const kidColor = kid ? kid.color : '#6366f1';
  legend.innerHTML = '<span><span style="display:inline-block; width: 10px; height: 10px; background: ' + kidColor + '; border-radius: 2px; margin-right: 4px;"></span>' + escapeHtml(kidName) + '’s consequences</span>';
}

function renderAdminSettings() {
  const tWrap = document.getElementById('adminTemplates');
  if (state.templates.length === 0) {
    tWrap.innerHTML = '<div class="empty">No templates yet</div>';
  } else {
    tWrap.innerHTML = '';
    state.templates.forEach(function (t) {
      const row = document.createElement('div');
      row.className = 'template-item';
      row.innerHTML =
        '<div class="grow">' + escapeHtml(t.description) + '</div>' +
        '<span class="meta">' + t.default_days + 'd</span>' +
        '<button class="btn-danger" onclick="deleteTemplate(\'' + t.id + '\')">✕</button>';
      tWrap.appendChild(row);
    });
  }
  const kWrap = document.getElementById('adminKids');
  kWrap.innerHTML = '';
  state.kids.forEach(function (kid) {
    const row = document.createElement('div');
    row.className = 'template-item';
    row.innerHTML =
      '<div style="width: 16px; height: 16px; border-radius: 50%; background: ' + kid.color + '; margin-right: 6px;"></div>' +
      '<div class="grow">' + escapeHtml(kid.name) + '</div>' +
      '<input type="color" value="' + kid.color + '" style="width: 40px; padding: 0; height: 28px;" onchange="updateKidColor(\'' + kid.id + '\', this.value)" />';
    kWrap.appendChild(row);
  });
}
async function saveTemplate() {
  const desc = document.getElementById('newTemplateDesc').value.trim();
  const days = parseInt(document.getElementById('newTemplateDays').value, 10) || 1;
  if (!desc) { toast('Description required', 'error'); return; }
  const res = await supa.from('behavior_templates').insert({ description: desc, default_days: days });
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  document.getElementById('newTemplateDesc').value = '';
  document.getElementById('newTemplateDays').value = '1';
  await loadAll();
  renderAdmin();
}
async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  const res = await supa.from('behavior_templates').delete().eq('id', id);
  if (res.error) { toast('Delete failed: ' + res.error.message, 'error'); return; }
  await loadAll();
  renderAdmin();
}
async function updateKidColor(id, color) {
  const res = await supa.from('behavior_kids').update({ color: color }).eq('id', id);
  if (res.error) { toast('Save failed: ' + res.error.message, 'error'); return; }
  await loadAll();
  renderAdmin();
}

function openModal(html) {
  let bg = document.getElementById('modalBg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'modalBg';
    bg.className = 'modal-bg';
    document.body.appendChild(bg);
  }
  bg.innerHTML = '<div class="modal">' + html + '</div>';
  bg.classList.remove('hidden');
}
function closeModal() {
  const bg = document.getElementById('modalBg');
  if (bg) bg.remove();
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + da;
}
function parseYmd(s) {
  const parts = s.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function formatShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function relTime(iso) {
  const t = new Date(iso);
  const now = new Date();
  const diff = (now - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff/86400) + 'd ago';
  return formatShort(t);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
function shade(hex, percent) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0,2), 16);
  const g = parseInt(hex.slice(2,4), 16);
  const b = parseInt(hex.slice(4,6), 16);
  function adj(c) { return Math.max(0, Math.min(255, Math.round(c * (100 + percent) / 100))); }
  return 'rgb(' + adj(r) + ', ' + adj(g) + ', ' + adj(b) + ')';
}

async function boot() {
  renderPinPad();
  try {
    await loadAll();
  } catch (e) {
    return;
  }
  if (sessionStorage.getItem('gateUnlocked') === '1') {
    showScreen('loginScreen');
    renderLogin();
  } else {
    askPin(GATE_PIN, 'Family Behavior', function () {
      sessionStorage.setItem('gateUnlocked', '1');
      document.getElementById('gateSub').textContent = 'Enter the code to continue';
      showScreen('loginScreen');
      renderLogin();
    });
  }
  setInterval(async function () {
    if (document.hidden) return;
    try {
      await loadAll();
      if (!document.getElementById('kidScreen').classList.contains('hidden')) renderKid();
      else if (!document.getElementById('adminScreen').classList.contains('hidden')) renderAdmin();
    } catch (e) {}
  }, 30000);
}
boot();
