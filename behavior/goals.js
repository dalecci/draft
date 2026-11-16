// ============ GOALS (🏆 tab + kid portal cards) ============
// Depends on goals-engine.js (GoalEngine) and, at call time, app.js globals:
// supa, state, toast, escapeHtml, escapeAttr, ymd, openModal, closeModal, getKid.
const GE = window.GoalEngine;
const GOAL_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16'];
const GOAL_EMOJIS = ['🏆', '🎮', '🍕', '🍦', '🎳', '🎟️', '🏀', '🎬', '🎢', '🛍️', '🏖️', '🍩'];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-first, like the whiteboard
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEIGHT_CYCLE = [1, 0.5, 0, 2];
const LOG_TABLE = 'behavior_challenge_log';
const GOAL_TABLE = 'behavior_challenges';

const gs = {
  goals: [], idx: {}, ready: false, error: '',
  view: 'board', calMonth: null, hiddenOnCal: {}, collapsed: {}, draft: null, drag: null, gridScroll: {},
};

// ---------- data ----------
async function fetchAllRows(table, orderCol) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const r = await supa.from(table).select('*').order(orderCol || 'id').order('id').range(from, from + PAGE - 1);
    if (r.error) throw r.error;
    out.push.apply(out, r.data || []);
    if (!r.data || r.data.length < PAGE) break;
  }
  return out;
}

function normGoal(g) {
  g.items = Array.isArray(g.items) ? g.items : [];
  g.day_weights = g.day_weights && typeof g.day_weights === 'object' ? g.day_weights : {};
  g.day_overrides = g.day_overrides && typeof g.day_overrides === 'object' ? g.day_overrides : {};
  g.kid_ids = Array.isArray(g.kid_ids) ? g.kid_ids : [];
  g.target = Number(g.target) || 0;
  g.streak_min_pct = g.streak_min_pct == null ? 100 : Number(g.streak_min_pct);
  return g;
}

async function loadGoals() {
  try {
    const both = await Promise.all([fetchAllRows(GOAL_TABLE, 'start_date'), fetchAllRows(LOG_TABLE, 'log_date')]);
    gs.goals = both[0].map(normGoal);
    gs.idx = {};
    both[1].forEach(function (l) {
      (gs.idx[l.challenge_id] = gs.idx[l.challenge_id] || new Map()).set(l.kid_id + '|' + l.item_key + '|' + l.log_date, l.status);
    });
    gs.ready = true;
    gs.error = '';
  } catch (e) {
    console.warn('goals load failed', e);
    gs.ready = false;
    gs.error = e.message || String(e);
  }
}

function getGoal(id) { return gs.goals.find(function (g) { return g.id === id; }); }
function goalIdx(id) { return gs.idx[id] || (gs.idx[id] = new Map()); }
function evalGoal(g, today) { return GE.evaluate(g, goalIdx(g.id), today); }
function todayStr() { return ymd(new Date()); }

// active → scoring now; finished → scoring over, reward still coming; history → done.
function goalPhase(g, today) {
  if (g.archived) return 'history';
  if (!g.end_date || g.end_date >= today) return 'active';
  if (g.reward_date) return g.reward_date >= today ? 'finished' : 'history';
  return GE.diffDays(g.end_date, today) <= 7 ? 'finished' : 'history';
}

// ---------- formatting ----------
function fmtN(n) {
  const r = Math.round((Number(n) || 0) * 10) / 10;
  const whole = Math.trunc(r);
  const frac = Math.abs(r - whole);
  if (frac < 0.05) return String(whole);
  if (Math.abs(frac - 0.5) < 0.05) return (whole === 0 ? (r < 0 ? '-' : '') : String(whole)) + '½';
  return r.toFixed(1);
}
function fmtW(w) { return w === 0.5 ? '½' : w === 0 ? 'off' : w === 1 ? '1×' : fmtN(w) + '×'; }
function fmtDay(ds, withWeekday) {
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (withWeekday !== false) opts.weekday = 'short';
  return new Date(GE.parse(ds)).toLocaleDateString('en-US', opts);
}
function untilText(ds, today) {
  const n = GE.diffDays(today, ds);
  if (n === 0) return 'today!';
  if (n === 1) return 'tomorrow';
  if (n > 1) return 'in ' + n + ' days';
  return n === -1 ? 'yesterday' : Math.abs(n) + ' days ago';
}
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
function newKey() { return 'i' + Math.random().toString(36).slice(2, 8); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function kidsOf(g) { return (g.kid_ids || []).map(getKid).filter(Boolean); }

// ---------- writes ----------
async function setGoalCells(gid, cells) {
  const idx = goalIdx(gid);
  const prev = cells.map(function (c) { return idx.get(c.kid + '|' + c.key + '|' + c.d) || null; });
  cells.forEach(function (c) {
    const k = c.kid + '|' + c.key + '|' + c.d;
    if (c.status) idx.set(k, c.status); else idx.delete(k);
  });
  refreshGoalsUI();
  try {
    const ups = cells.filter(function (c) { return c.status; }).map(function (c) {
      return { challenge_id: gid, kid_id: c.kid, item_key: c.key, log_date: c.d, status: c.status, updated_at: new Date().toISOString() };
    });
    if (ups.length) {
      const r = await supa.from(LOG_TABLE).upsert(ups, { onConflict: 'challenge_id,kid_id,item_key,log_date' });
      if (r.error) throw r.error;
    }
    for (const c of cells.filter(function (x) { return !x.status; })) {
      const r = await supa.from(LOG_TABLE).delete().match({ challenge_id: gid, kid_id: c.kid, item_key: c.key, log_date: c.d });
      if (r.error) throw r.error;
    }
  } catch (e) {
    cells.forEach(function (c, i) {
      const k = c.kid + '|' + c.key + '|' + c.d;
      if (prev[i]) idx.set(k, prev[i]); else idx.delete(k);
    });
    refreshGoalsUI();
    toast('Not saved: ' + (e.message || e), 'error');
  }
}

function cycleGoalCell(gid, kid, key, d) {
  const cur = goalIdx(gid).get(kid + '|' + key + '|' + d) || null;
  const next = cur === null ? 'done' : cur === 'done' ? 'missed' : null;
  setGoalCells(gid, [{ kid: kid, key: key, d: d, status: next }]);
}

function markKidDay(gid, kid, d) {
  const g = getGoal(gid);
  if (!g) return;
  const items = g.items.filter(function (it) { return GE.cellValue(g, it, d) > 0; });
  const idx = goalIdx(gid);
  const allDone = items.every(function (it) { return idx.get(kid + '|' + it.key + '|' + d) === 'done'; });
  setGoalCells(gid, items.map(function (it) { return { kid: kid, key: it.key, d: d, status: allDone ? null : 'done' }; }));
}

async function saveGoalPatch(gid, patch, okMsg) {
  const g = getGoal(gid);
  if (!g) return;
  const before = {};
  Object.keys(patch).forEach(function (k) { before[k] = g[k]; g[k] = patch[k]; });
  refreshGoalsUI();
  const r = await supa.from(GOAL_TABLE).update(Object.assign({}, patch, { updated_at: new Date().toISOString() })).eq('id', gid);
  if (r.error) {
    Object.assign(g, before);
    refreshGoalsUI();
    toast('Not saved: ' + r.error.message, 'error');
    return false;
  }
  if (okMsg) toast(okMsg, 'success');
  return true;
}

function refreshGoalsUI() {
  const admin = document.getElementById('adminScreen');
  if (admin && !admin.classList.contains('hidden') && state.currentTab === 'goals') renderGoalsTab();
  const kidEl = document.getElementById('kidScreen');
  if (kidEl && !kidEl.classList.contains('hidden')) {
    const kid = getKid(state.currentKidId);
    if (kid) renderKidGoals(kid);
  }
}

// ---------- admin tab ----------
function goalsSetView(v) { gs.view = v; renderGoalsTab(); }

function renderGoalsTab() {
  const el = document.getElementById('goalsTab');
  if (!el) return;
  // keep each tally grid's horizontal scroll position across re-renders
  el.querySelectorAll('.g-grid-wrap').forEach(function (w) { gs.gridScroll[w.dataset.goal] = w.scrollLeft; });
  if (!gs.ready) {
    el.innerHTML = '<div class="card"><h3>Goals</h3><div class="empty">Goals database not reachable: ' + escapeHtml(gs.error) + '</div></div>';
    return;
  }
  const today = todayStr();
  const nav = [['board', 'Scoreboard'], ['calendar', 'Calendar'], ['history', 'History']].map(function (v) {
    return '<button class="' + (gs.view === v[0] ? 'active' : '') + '" onclick="goalsSetView(\'' + v[0] + '\')">' + v[1] + '</button>';
  }).join('');
  let body = '';
  if (gs.view === 'calendar') body = calendarHtml(today);
  else if (gs.view === 'history') body = historyHtml(today);
  else body = boardHtml(today);
  el.innerHTML =
    '<div class="g-subnav"><div class="g-pills">' + nav + '</div>' +
    '<button class="btn-primary g-new" onclick="openGoalEditor()">+ New goal</button></div>' + body;

  el.querySelectorAll('.g-grid-wrap').forEach(function (w) {
    const saved = gs.gridScroll[w.dataset.goal];
    if (saved != null) { w.scrollLeft = saved; return; }
    const t = w.querySelector('.g-dh.today');
    if (t) w.scrollLeft = Math.max(0, t.offsetLeft - 150);
  });
  const grid = document.getElementById('gcalGrid');
  if (grid) {
    grid.onpointerdown = gcalDown;
    grid.onpointermove = gcalMove;
    grid.onpointerup = gcalUp;
    grid.onpointercancel = gcalCancel;
  }
}

function boardHtml(today) {
  const list = gs.goals.filter(function (g) { return goalPhase(g, today) !== 'history'; })
    .sort(function (a, b) {
      const pa = goalPhase(a, today) === 'active' ? 0 : 1, pb = goalPhase(b, today) === 'active' ? 0 : 1;
      return pa - pb || a.start_date.localeCompare(b.start_date);
    });
  if (!list.length) {
    return '<div class="card g-empty"><div class="g-empty-emoji">🏆</div>' +
      '<div class="g-empty-title">No goals running</div>' +
      '<div class="muted">Set a target, pick the reward, and the app does the math every day.</div>' +
      '<button class="btn-primary" onclick="openGoalEditor()">+ Create a goal</button></div>';
  }
  return list.map(function (g) { return goalCardHtml(g, today); }).join('');
}

function goalCardHtml(g, today) {
  const ev = evalGoal(g, today);
  const phase = goalPhase(g, today);
  const kids = kidsOf(g);
  const span = g.end_date ? fmtDay(g.start_date, false) + ' → ' + fmtDay(g.end_date, false) : 'From ' + fmtDay(g.start_date, false) + ' · no end';
  const rewardChip = g.reward_date
    ? '<span class="g-chip g-chip-reward">🎉 ' + fmtDay(g.reward_date) + ' · ' + untilText(g.reward_date, today) + '</span>'
    : '<span class="g-chip g-chip-warn" onclick="openGoalEditor(\'' + g.id + '\')">Set reward day</span>';
  const head =
    '<div class="g-head">' +
      '<div class="g-emoji">' + escapeHtml(g.reward_emoji || '🏆') + '</div>' +
      '<div class="g-titles">' +
        '<div class="g-title">' + escapeHtml(g.title) + (phase === 'finished' ? ' <span class="g-chip g-chip-final">Final</span>' : '') + '</div>' +
        (g.reward ? '<div class="g-reward">Reward: <b>' + escapeHtml(g.reward) + '</b></div>' : '') +
        '<div class="g-chips">' +
          '<span class="g-chip">' + (g.scope === 'team' ? '👥 Team' : '👤 Each kid') + '</span>' +
          '<span class="g-chip">' + (g.mode === 'streak' ? '🔥 ' + plural(Math.round(g.target), 'day') + ' in a row' : '🎯 ' + fmtN(g.target) + ' pts') + '</span>' +
          '<span class="g-chip">📅 ' + span + '</span>' + rewardChip +
        '</div>' +
      '</div>' +
      '<div class="g-actions">' +
        '<button class="btn-secondary g-sm" onclick="openGoalEditor(\'' + g.id + '\')">Edit</button>' +
        '<button class="btn-secondary g-sm" onclick="repeatGoal(\'' + g.id + '\')" title="Copy this goal to the next week">↻ Repeat</button>' +
        (phase === 'finished' ? '<button class="btn-secondary g-sm" onclick="archiveGoal(\'' + g.id + '\', true)">Archive</button>' : '') +
      '</div>' +
    '</div>';

  let status = '';
  if (g.scope === 'team') status = teamStatusHtml(g, ev, kids);
  else status = kids.map(function (k) { return kidStatusRowHtml(g, ev.kids[k.id], k); }).join('');

  const open = !gs.collapsed[g.id];
  const grid =
    '<button class="g-toggle" onclick="gs.collapsed[\'' + g.id + '\']=' + (open ? 'true' : 'false') + ';renderGoalsTab()">' +
      (open ? '▾ Hide score sheet' : '▸ Show score sheet') + '</button>' +
    (open ? tallyGridHtml(g, today) : '');

  return '<div class="card g-card" style="--gc:' + g.color + '">' + head + '<div class="g-status">' + status + '</div>' + grid + '</div>';
}

function pill(kind, text) { return '<span class="g-pill g-pill-' + kind + '">' + text + '</span>'; }

function statusPillHtml(g, r) {
  if (!r) return '';
  if (r.state === 'made') return pill('ok', g.mode === 'streak' && r.wins > 1 ? '✅ Made it ×' + r.wins : '✅ Made it');
  if (g.mode === 'streak') {
    if (r.state === 'out') return pill('bad', '❌ Out: needs ' + r.needed + ', ' + plural(r.daysLeft, 'day') + ' left');
    if (!g.end_date) return pill('mid', plural(r.needed, 'more day') + ' in a row');
    return pill(r.state === 'perfect' ? 'warn' : 'mid', 'Needs ' + r.needed + ' in a row · ' + plural(r.daysLeft, 'day') + ' left');
  }
  if (r.state === 'out') return pill('bad', '❌ Out: needs ' + fmtN(r.needed) + ', only ' + fmtN(r.remaining) + ' left');
  if (r.state === 'perfect') return pill('warn', '⚠️ Perfect needed: ' + fmtN(r.needed) + ' of ' + fmtN(r.remaining));
  return pill('mid', 'Needs ' + fmtN(r.needed) + ' of ' + fmtN(r.remaining) + ' left') +
    (r.elapsedMax > 0 ? pill(r.onPace ? 'ok-soft' : 'warn-soft', r.onPace ? 'on pace' : 'behind pace') : '');
}

function unscoredHtml(n) { return n ? '<span class="g-unscored">⚠ ' + plural(n, 'unscored box') + '</span>' : ''; }

function kidStatusRowHtml(g, r, kid) {
  if (!r) return '';
  let meter, nums;
  if (g.mode === 'streak') {
    const N = Math.max(1, Math.round(g.target));
    const filled = r.wins > 0 ? N : Math.min(r.current, N);
    meter = '<div class="g-flames">' + Array.from({ length: N }, function (_, i) {
      return '<span class="' + (i < filled ? 'on' : '') + '">' + (i < filled ? '🔥' : '') + '</span>';
    }).join('') + '</div>';
    nums = '<b>' + r.current + '</b> in a row · best ' + r.best;
  } else {
    const pct = g.target > 0 ? Math.min(100, (r.earned / g.target) * 100) : 0;
    meter = '<div class="g-bar"><div style="width:' + pct + '%;background:' + kid.color + '"></div>' +
      '<i style="left:' + Math.min(100, g.target > 0 ? (r.expected / g.target) * 100 : 0) + '%" title="where they should be by now"></i></div>';
    const shoot = r.attempted > 0
      ? '🎯 ' + fmtN(r.earned) + '/' + fmtN(r.attempted) + ' · ' + Math.round((r.earned / r.attempted) * 100) + '%'
      : '🎯 —';
    nums = '<b>' + fmtN(r.earned) + '</b> / ' + fmtN(g.target) + ' <span class="g-shoot">' + shoot + '</span>';
  }
  return '<div class="g-krow">' +
    '<div class="g-kname" style="color:' + kid.color + '">' + escapeHtml(kid.name) + '</div>' +
    '<div class="g-kmeter">' + meter + '<div class="g-knums">' + nums + '</div></div>' +
    '<div class="g-kpill">' + (g.scope === 'team' ? '' : statusPillHtml(g, r)) + unscoredHtml(r.pendingPast) + '</div>' +
  '</div>';
}

function teamStatusHtml(g, ev, kids) {
  const t = ev.team;
  if (!t) return '';
  let top;
  if (g.mode === 'streak') {
    const N = Math.max(1, Math.round(g.target));
    const filled = t.wins > 0 ? N : Math.min(t.current, N);
    top = '<div class="g-flames g-flames-lg">' + Array.from({ length: N }, function (_, i) {
      return '<span class="' + (i < filled ? 'on' : '') + '">' + (i < filled ? '🔥' : '') + '</span>';
    }).join('') + '</div><div class="g-knums"><b>Team: ' + t.current + '</b> in a row · best ' + t.best + ' (a day counts only if everyone hits it)</div>';
  } else {
    const segs = kids.map(function (k) {
      const w = g.target > 0 ? Math.min(100, (ev.kids[k.id].earned / g.target) * 100) : 0;
      return '<div style="width:' + w + '%;background:' + k.color + '"></div>';
    }).join('');
    top = '<div class="g-bar g-bar-team">' + segs + '</div>' +
      '<div class="g-knums"><b>Team: ' + fmtN(t.earned) + '</b> / ' + fmtN(g.target) + '  · ' +
      kids.map(function (k) { return '<span style="color:' + k.color + '">' + escapeHtml(k.name) + ' ' + fmtN(ev.kids[k.id].earned) + '</span>'; }).join(' · ') + '</div>';
  }
  return '<div class="g-team">' + top + '<div class="g-kpill">' + statusPillHtml(g, t) + unscoredHtml(t.pendingPast || t.unscored) + '</div></div>' +
    (g.mode === 'streak' ? kids.map(function (k) { return kidStatusRowHtml(g, ev.kids[k.id], k); }).join('') : '');
}

function gridDates(g, today) {
  let start = g.start_date;
  let end = g.end_date || GE.addDays(today, 6);
  if (end < start) end = start;
  const MAXD = 62;
  if (GE.diffDays(start, end) + 1 > MAXD) {
    const t6 = GE.addDays(today, 6);
    if (end > t6 && t6 >= start) end = t6;
    const s2 = GE.addDays(end, -(MAXD - 1));
    if (s2 > start) start = s2;
  }
  return GE.eachDate(start, end);
}

function tallyGridHtml(g, today) {
  const dates = gridDates(g, today);
  const idx = goalIdx(g.id);
  const kids = kidsOf(g);
  let h = '<div class="g-grid-wrap" data-goal="' + g.id + '"><table class="g-grid"><thead><tr><th class="g-sticky g-corner">Tap: ✓ → ✗ → blank</th>';
  dates.forEach(function (d) {
    const w = GE.dayWeight(g, d);
    const dw = GE.dow(d);
    const cls = 'g-dh' + (d === today ? ' today' : '') + (d > today ? ' future' : '') + (dw === 0 || dw === 6 ? ' wkend' : '') +
      (Object.prototype.hasOwnProperty.call(g.day_overrides, d) ? ' override' : '');
    h += '<th class="' + cls + '" onclick="openDayWeight(\'' + g.id + '\',\'' + d + '\')" title="Tap to change what this day is worth">' +
      '<div>' + DOW_SHORT[dw] + '</div><div class="g-dn">' + Number(d.slice(8)) + '</div>' +
      '<div class="g-w">' + (w === 1 ? '&nbsp;' : fmtW(w)) + '</div></th>';
  });
  h += '</tr></thead><tbody>';
  kids.forEach(function (k) {
    const inToday = today >= g.start_date && (!g.end_date || today <= g.end_date);
    h += '<tr class="g-kidrow"><th class="g-sticky"><span style="color:' + k.color + '">' + escapeHtml(k.name) + '</span>' +
      (inToday ? '<button class="g-allbtn" onclick="markKidDay(\'' + g.id + '\',\'' + k.id + '\',\'' + today + '\')" title="All done today">✓ today</button>' : '') +
      '</th>';
    dates.forEach(function (d) {
      let avail = 0, earned = 0;
      g.items.forEach(function (it) {
        const v = GE.cellValue(g, it, d);
        if (v <= 0) return;
        avail += v;
        if (idx.get(k.id + '|' + it.key + '|' + d) === 'done') earned += v;
      });
      h += '<td class="g-daytot' + (d === today ? ' today' : '') + '">' + (!avail ? '' : (d > today && !earned) ? '<span>' + fmtN(avail) + '</span>' : fmtN(earned) + '<span>/' + fmtN(avail) + '</span>') + '</td>';
    });
    h += '</tr>';
    g.items.forEach(function (it) {
      h += '<tr><th class="g-sticky g-item">' + escapeHtml(it.name) + ' <span>' + fmtN(it.points) + '</span></th>';
      dates.forEach(function (d) {
        const v = GE.cellValue(g, it, d);
        if (v <= 0) { h += '<td class="g-cell"><span class="g-c na">–</span></td>'; return; }
        const st = idx.get(k.id + '|' + it.key + '|' + d) || '';
        h += '<td class="g-cell' + (d === today ? ' today' : '') + '"><button class="g-c ' + st + (d > today ? ' future' : '') + '" ' +
          'onclick="cycleGoalCell(\'' + g.id + '\',\'' + k.id + '\',\'' + it.key + '\',\'' + d + '\')">' +
          (st === 'done' ? '✓' : st === 'missed' ? '✗' : '') + '</button></td>';
      });
      h += '</tr>';
    });
  });
  return h + '</tbody></table></div>';
}

function openDayWeight(gid, d) {
  const g = getGoal(gid);
  if (!g) return;
  const def = g.day_weights[String(GE.dow(d))];
  const defW = def == null ? 1 : Number(def);
  const has = Object.prototype.hasOwnProperty.call(g.day_overrides, d);
  const cur = has ? Number(g.day_overrides[d]) : null;
  const opt = function (val, label, sub) {
    const active = val === null ? !has : (has && cur === val);
    return '<button class="g-wopt' + (active ? ' active' : '') + '" onclick="setDayWeight(\'' + gid + '\',\'' + d + '\',' + (val === null ? 'null' : val) + ')">' +
      '<b>' + label + '</b><span>' + sub + '</span></button>';
  };
  openModal(
    '<h2>' + fmtDay(d) + '</h2>' +
    '<p class="muted" style="margin-bottom:12px">What is this day worth in "' + escapeHtml(g.title) + '"? Every box that day is multiplied by this.</p>' +
    '<div class="g-wopts">' +
      opt(null, 'Usual', 'normal ' + DOW_SHORT[GE.dow(d)] + ' value (' + fmtW(defW) + ')') +
      opt(1, 'Full', 'every box worth its points') +
      opt(0.5, 'Half', 'like a weekend') +
      opt(0, 'Off', 'no points this day (holiday, sick, travel)') +
      opt(2, 'Double', 'bonus day') +
    '</div>' +
    '<div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Close</button></div>'
  );
}

async function setDayWeight(gid, d, val) {
  const g = getGoal(gid);
  if (!g) return;
  const ov = Object.assign({}, g.day_overrides);
  if (val === null) delete ov[d]; else ov[d] = val;
  closeModal();
  await saveGoalPatch(gid, { day_overrides: ov }, fmtDay(d) + ': ' + (val === null ? 'usual value' : fmtW(val)));
}

async function archiveGoal(gid, on) {
  await saveGoalPatch(gid, { archived: !!on }, on ? 'Moved to history' : 'Back on the scoreboard');
}

// ---------- calendar (drag & drop) ----------
function calMonthStart(today) { return (gs.calMonth || today.slice(0, 7)) + '-01'; }
function calNavGoals(dir) {
  const today = todayStr();
  if (dir === 0) { gs.calMonth = null; renderGoalsTab(); return; }
  const p = calMonthStart(today).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1 + dir, 1));
  gs.calMonth = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  renderGoalsTab();
}
function calRange(today) {
  const first = calMonthStart(today);
  const start = GE.addDays(first, -((GE.dow(first) + 6) % 7)); // back to Monday
  return { first: first, start: start, end: GE.addDays(start, 41) };
}
function goalDatesForCal(g) {
  const dr = gs.drag;
  if (dr && dr.gid === g.id && dr.prev) return { s: dr.prev.s, e: dr.prev.e, r: dr.prev.r };
  return { s: g.start_date, e: g.end_date, r: g.reward_date };
}
function calGoals(today) {
  const rg = calRange(today);
  return gs.goals.filter(function (g) {
    const d = goalDatesForCal(g);
    const end = d.e || rg.end;
    const overlaps = d.s <= rg.end && end >= rg.start;
    const rewardIn = d.r && d.r >= rg.start && d.r <= rg.end;
    return (overlaps || rewardIn) && (goalPhase(g, today) !== 'history' || overlaps);
  }).sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
}

function calendarHtml(today) {
  const rg = calRange(today);
  const goals = calGoals(today);
  const p = rg.first.split('-').map(Number);
  const monthName = new Date(Date.UTC(p[0], p[1] - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const legend = goals.length
    ? goals.map(function (g) {
        const off = gs.hiddenOnCal[g.id];
        return '<button class="g-leg' + (off ? ' off' : '') + '" style="--gc:' + g.color + '" onclick="gs.hiddenOnCal[\'' + g.id + '\']=' + (off ? 'false' : 'true') + ';renderGoalsTab()">' +
          '<i></i>' + escapeHtml(g.reward_emoji || '🏆') + ' ' + escapeHtml(g.title) + '</button>';
      }).join('')
    : '<span class="muted">No goals this month: tap “+ New goal”.</span>';
  return '<div class="card">' +
    '<div class="calendar-header"><div class="cal-month">' + monthName + '</div>' +
      '<div class="cal-nav"><button onclick="calNavGoals(-1)">‹</button><button onclick="calNavGoals(0)" style="width:auto;padding:0 10px;font-size:13px">Today</button><button onclick="calNavGoals(1)">›</button></div></div>' +
    '<div class="g-legend">' + legend + '</div>' +
    '<div class="gcal-dow">' + DOW_ORDER.map(function (d) { return '<div>' + DOW_SHORT[d] + '</div>'; }).join('') + '</div>' +
    '<div class="gcal-grid" id="gcalGrid">' + calCellsHtml(today) + '</div>' +
    '<div class="g-hint" id="gcalHint">Drag a bar to move the scoring dates · drag its ◂ ▸ ends to change start or end · drag the reward icon to set the reward day · tap a bar to edit</div>' +
  '</div>';
}

function calCellsHtml(today) {
  const rg = calRange(today);
  const goals = calGoals(today).filter(function (g) { return !gs.hiddenOnCal[g.id]; });
  let h = '';
  GE.eachDate(rg.start, rg.end).forEach(function (d, i) {
    const col = i % 7;
    const cls = 'gcal-day' + (d.slice(0, 7) !== rg.first.slice(0, 7) ? ' other' : '') + (d === today ? ' today' : '');
    h += '<div class="' + cls + '" data-date="' + d + '"><div class="gcal-num">' + Number(d.slice(8)) + '</div>';
    goals.forEach(function (g) {
      const gd = goalDatesForCal(g);
      const locked = goalPhase(g, today) === 'history';
      const end = gd.e || rg.end;
      const inWin = d >= gd.s && d <= end;
      let lane = '';
      if (inWin) {
        const isS = d === gd.s, isE = gd.e && d === gd.e;
        lane += '<div class="gcal-seg' + (isS ? ' s' : '') + (isE ? ' e' : '') + (!gd.e && d === rg.end ? ' open' : '') + (locked ? ' locked' : '') + '" ' +
          'data-goal="' + g.id + '" data-role="move" style="background:' + g.color + '">' +
          (isS && !locked ? '<span class="gcal-h l" data-goal="' + g.id + '" data-role="start"></span>' : '') +
          ((isS || col === 0) ? '<span class="gcal-lbl">' + escapeHtml(g.title) + '</span>' : '') +
          (isE && !locked ? '<span class="gcal-h r" data-goal="' + g.id + '" data-role="end"></span>' : '') +
        '</div>';
      }
      if (gd.r === d) {
        lane += '<span class="gcal-trophy' + (locked ? ' locked' : '') + '" data-goal="' + g.id + '" data-role="reward" style="--gc:' + g.color + '" title="Reward day: ' + escapeAttr(g.reward || g.title) + '">' + escapeHtml(g.reward_emoji || '🏆') + '</span>';
      }
      h += '<div class="gcal-lane">' + lane + '</div>';
    });
    h += '</div>';
  });
  return h;
}

function renderCalGrid() {
  const grid = document.getElementById('gcalGrid');
  if (grid) grid.innerHTML = calCellsHtml(todayStr());
}

function dateAtPoint(rects, x, y) {
  for (const c of rects) if (x >= c.r.left && x <= c.r.right && y >= c.r.top && y <= c.r.bottom) return c.d;
  return null;
}

function gcalDown(e) {
  const t = e.target.closest('[data-role]');
  if (!t || t.classList.contains('locked')) return;
  const g = getGoal(t.dataset.goal);
  const cell = t.closest('.gcal-day');
  if (!g || !cell) return;
  e.preventDefault();
  const grid = e.currentTarget;
  try { grid.setPointerCapture(e.pointerId); } catch (_) { /* older Safari */ }
  gs.drag = {
    gid: g.id, role: t.dataset.role, anchor: cell.dataset.date, sx: e.clientX, sy: e.clientY, moved: false, prev: null, key: '',
    orig: { s: g.start_date, e: g.end_date, r: g.reward_date },
    rects: Array.from(grid.querySelectorAll('.gcal-day')).map(function (c) { return { d: c.dataset.date, r: c.getBoundingClientRect() }; }),
  };
}

function gcalMove(e) {
  const dr = gs.drag;
  if (!dr) return;
  if (!dr.moved && Math.abs(e.clientX - dr.sx) + Math.abs(e.clientY - dr.sy) < 8) return;
  dr.moved = true;
  const over = dateAtPoint(dr.rects, e.clientX, e.clientY);
  if (!over) return;
  const delta = GE.diffDays(dr.anchor, over);
  const o = dr.orig;
  let s = o.s, en = o.e, r = o.r;
  if (dr.role === 'move') { s = GE.addDays(o.s, delta); en = o.e ? GE.addDays(o.e, delta) : null; }
  else if (dr.role === 'start') { s = GE.addDays(o.s, delta); if (en && s > en) s = en; }
  else if (dr.role === 'end') { en = GE.addDays(o.e, delta); if (en < s) en = s; }
  else if (dr.role === 'reward') { r = over; }
  const key = s + '|' + en + '|' + r;
  if (key === dr.key) return;
  dr.key = key;
  dr.prev = { s: s, e: en, r: r };
  renderCalGrid();
  const hint = document.getElementById('gcalHint');
  if (hint) {
    hint.classList.add('live');
    hint.textContent = dr.role === 'reward'
      ? 'Reward day → ' + fmtDay(r)
      : 'Scoring → ' + fmtDay(s) + (en ? ' to ' + fmtDay(en) : ' (no end)');
  }
}

async function gcalUp() {
  const dr = gs.drag;
  if (!dr) return;
  gs.drag = null;
  if (!dr.moved) { openGoalEditor(dr.gid); return; }
  if (!dr.prev) { renderCalGrid(); return; }
  const patch = {};
  if (dr.prev.s !== dr.orig.s) patch.start_date = dr.prev.s;
  if (dr.prev.e !== dr.orig.e) patch.end_date = dr.prev.e;
  if (dr.prev.r !== dr.orig.r) patch.reward_date = dr.prev.r;
  if (!Object.keys(patch).length) { renderGoalsTab(); return; }
  await saveGoalPatch(dr.gid, patch, patch.reward_date ? 'Reward day: ' + fmtDay(patch.reward_date) : 'Scoring dates updated');
}

function gcalCancel() { gs.drag = null; renderCalGrid(); }

// ---------- history ----------
function kidGoalStats(kidId, today) {
  const s = { entered: 0, won: 0, pctSum: 0, closest: null, bestStreak: 0, entries: [] };
  gs.goals.forEach(function (g) {
    if ((g.kid_ids || []).indexOf(kidId) === -1) return;
    const ev = evalGoal(g, today);
    const r = ev.kids[kidId];
    const tr = g.scope === 'team' ? ev.team : r;
    if (!r || !tr) return;
    if (g.mode === 'streak') s.bestStreak = Math.max(s.bestStreak, r.best);
    const ended = g.archived || (g.end_date && g.end_date < today);
    if (!ended && r.outcome === 'pending') return; // still in play
    const won = r.outcome === 'won';
    const pct = Math.min(1, tr.pct || 0);
    s.entered++;
    if (won) s.won++;
    s.pctSum += pct;
    if (!won && (!s.closest || pct > s.closest.pct)) s.closest = { pct: pct, g: g, tr: tr };
    s.entries.push({ g: g, won: won, pct: pct, tr: tr });
  });
  return s;
}

function shortBy(g, tr) {
  if (g.mode === 'streak') return Math.max(0, Math.round(g.target) - tr.best) + ' day(s) short';
  return fmtN(Math.max(0, g.target - tr.earned)) + ' pts short';
}

function historyHtml(today) {
  const kids = state.kids;
  const cards = kids.map(function (k) {
    const s = kidGoalStats(k.id, today);
    const rate = s.entered ? Math.round((s.won / s.entered) * 100) : 0;
    return '<div class="g-hstat" style="--gc:' + k.color + '">' +
      '<div class="g-hname">' + escapeHtml(k.name) + '</div>' +
      '<div class="g-hbig">' + s.won + '<span>/' + s.entered + '</span></div>' +
      '<div class="g-hsub">goals won' + (s.entered ? ' · ' + rate + '%' : '') + '</div>' +
      (s.entered ? '<div class="g-hsub">avg ' + Math.round((s.pctSum / s.entered) * 100) + '% of target</div>' : '') +
      (s.closest ? '<div class="g-hsub">closest miss: ' + Math.round(s.closest.pct * 100) + '% (' + escapeHtml(s.closest.g.title) + ')</div>' : '') +
      (s.bestStreak ? '<div class="g-hsub">best streak: 🔥 ' + s.bestStreak + '</div>' : '') +
    '</div>';
  }).join('');

  const done = gs.goals.filter(function (g) { return goalPhase(g, today) !== 'active'; })
    .sort(function (a, b) { return (b.end_date || b.start_date).localeCompare(a.end_date || a.start_date); });

  // same-title goals = one series ("D&B week" ×5) → won X of Y per kid
  const series = {};
  done.forEach(function (g) {
    const key = g.title.trim().toLowerCase();
    const s = series[key] = series[key] || { title: g.title, emoji: g.reward_emoji, n: 0, wins: {} };
    s.n++;
    const ev = evalGoal(g, today);
    (g.kid_ids || []).forEach(function (kid) { if (ev.kids[kid] && ev.kids[kid].outcome === 'won') s.wins[kid] = (s.wins[kid] || 0) + 1; });
  });
  const seriesRows = Object.keys(series).map(function (key) {
    const s = series[key];
    return '<tr><td>' + escapeHtml(s.emoji || '🏆') + ' ' + escapeHtml(s.title) + ' <span class="muted">×' + s.n + '</span></td>' +
      kids.map(function (k) { return '<td style="color:' + k.color + '"><b>' + (s.wins[k.id] || 0) + '</b>/' + s.n + '</td>'; }).join('') + '</tr>';
  }).join('');

  const list = done.map(function (g) {
    const ev = evalGoal(g, today);
    const chips = kidsOf(g).map(function (k) {
      const r = ev.kids[k.id];
      const tr = g.scope === 'team' ? ev.team : r;
      const won = r.outcome === 'won';
      const score = g.mode === 'streak' ? 'best ' + tr.best + '/' + Math.round(g.target) : fmtN(tr.earned) + '/' + fmtN(g.target);
      return '<span class="g-hchip ' + (won ? 'won' : r.outcome === 'lost' ? 'lost' : 'pend') + '">' +
        escapeHtml(k.name) + ' ' + (won ? '✅' : r.outcome === 'lost' ? '❌' : '…') + ' ' + score +
        (!won ? ' <i>' + shortBy(g, tr) + '</i>' : '') + '</span>';
    }).join('');
    return '<div class="g-hrow" style="--gc:' + g.color + '">' +
      '<div class="g-hrow-top"><div><b>' + escapeHtml(g.reward_emoji || '🏆') + ' ' + escapeHtml(g.title) + '</b>' +
        (g.scope === 'team' ? ' <span class="g-chip">👥 Team</span>' : '') +
        '<div class="muted">' + fmtDay(g.start_date, false) + (g.end_date ? ' → ' + fmtDay(g.end_date, false) : ' →') +
        (g.reward ? ' · ' + escapeHtml(g.reward) : '') + '</div></div>' +
        '<div class="g-actions">' +
          '<button class="btn-secondary g-sm" onclick="repeatGoal(\'' + g.id + '\')">↻ Run again</button>' +
          '<button class="btn-secondary g-sm" onclick="gs.view=\'board\';' + (g.archived ? 'archiveGoal(\'' + g.id + '\', false)' : 'openGoalEditor(\'' + g.id + '\')') + '">' + (g.archived ? 'Unarchive' : 'Edit') + '</button>' +
        '</div></div>' +
      '<div class="g-hchips">' + chips + '</div></div>';
  }).join('');

  return '<div class="g-hstats">' + cards + '</div>' +
    (seriesRows ? '<div class="card"><h3>By goal</h3><table class="g-series"><thead><tr><th></th>' +
      kids.map(function (k) { return '<th style="color:' + k.color + '">' + escapeHtml(k.name) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + seriesRows + '</tbody></table></div>' : '') +
    '<div class="card"><h3>Past goals</h3>' + (list || '<div class="empty">Finished goals land here with every kid’s score.</div>') + '</div>';
}

// ---------- editor ----------
function defaultWeights() { return { 0: 0.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0.5 }; }

function newGoalDraft() {
  const today = todayStr();
  const end = GE.addDays(today, 6);
  const used = gs.goals.filter(function (g) { return !g.archived; }).map(function (g) { return g.color; });
  const color = GOAL_COLORS.find(function (c) { return used.indexOf(c) === -1; }) || GOAL_COLORS[gs.goals.length % GOAL_COLORS.length];
  const all = [0, 1, 2, 3, 4, 5, 6];
  const d = {
    id: null, title: '', reward: '', reward_emoji: '🏆', reward_date: end, mode: 'total', scope: 'individual',
    start_date: today, end_date: end, target: 0, streak_min_pct: 100,
    items: [{ key: newKey(), name: 'School', points: 1, days: all.slice() }, { key: newKey(), name: 'Bedtime', points: 1, days: all.slice() }],
    day_weights: defaultWeights(), day_overrides: {}, kid_ids: state.kids.map(function (k) { return k.id; }),
    color: color, notes: '', _autoTarget: true,
  };
  d.target = autoTarget(d);
  return d;
}

function autoTarget(d) {
  if (d.mode === 'streak') return 5;
  const max = GE.maxPerKid(d, todayStr()) * (d.scope === 'team' ? Math.max(1, d.kid_ids.length) : 1);
  return Math.max(1, Math.round(max * 0.9));
}

function openGoalEditor(gid, draft) {
  if (draft) gs.draft = draft;
  else if (gid) { const g = getGoal(gid); if (!g) return; gs.draft = clone(g); gs.draft._autoTarget = false; }
  else gs.draft = newGoalDraft();
  renderGoalEditor();
}

function repeatGoal(gid) {
  const g = getGoal(gid);
  if (!g) return;
  const today = todayStr();
  let shift = 7;
  if (g.end_date) shift = Math.max(7, Math.ceil((GE.diffDays(g.start_date, g.end_date) + 1) / 7) * 7);
  while (GE.addDays(g.end_date || g.start_date, shift) < today) shift += 7;
  const d = clone(g);
  d.id = null;
  d.archived = false;
  d.start_date = GE.addDays(g.start_date, shift);
  d.end_date = g.end_date ? GE.addDays(g.end_date, shift) : null;
  d.reward_date = g.reward_date ? GE.addDays(g.reward_date, shift) : null;
  d.day_overrides = {}; // holidays belong to the old week
  d._autoTarget = false;
  d._repeatOf = g.title;
  openGoalEditor(null, d);
}

function gd(field, val) { gs.draft[field] = val; updateGoalHelper(); }
function gdSet(field, val) {
  gs.draft[field] = val;
  if (field === 'mode' || field === 'scope') { if (gs.draft._autoTarget || field === 'mode') gs.draft.target = autoTarget(gs.draft); }
  renderGoalEditor();
}
function gdDates(field, val) {
  gs.draft[field] = val || null;
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
}
function gdTarget(val) { gs.draft.target = Number(val) || 0; gs.draft._autoTarget = false; updateGoalHelper(); }
function gdToggleKid(id) {
  const k = gs.draft.kid_ids;
  const i = k.indexOf(id);
  if (i === -1) k.push(id); else k.splice(i, 1);
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
}
function gdItem(i, field, val) {
  const it = gs.draft.items[i];
  it[field] = field === 'points' ? (Number(val) || 0) : val;
  if (field === 'points' && gs.draft._autoTarget) { gs.draft.target = autoTarget(gs.draft); const t = document.getElementById('geTarget'); if (t) t.value = gs.draft.target; }
  updateGoalHelper();
}
function gdItemDay(i, dw) {
  const days = gs.draft.items[i].days || [0, 1, 2, 3, 4, 5, 6];
  const j = days.indexOf(dw);
  if (j === -1) days.push(dw); else if (days.length > 1) days.splice(j, 1);
  gs.draft.items[i].days = days;
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
}
function gdAddItem() {
  gs.draft.items.push({ key: newKey(), name: '', points: 1, days: [0, 1, 2, 3, 4, 5, 6] });
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
  const ins = document.querySelectorAll('.ge-item-name');
  if (ins.length) ins[ins.length - 1].focus();
}
function gdDelItem(i) {
  if (gs.draft.items.length <= 1) { toast('A goal needs at least one thing to score', 'error'); return; }
  gs.draft.items.splice(i, 1);
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
}
function gdWeight(dw) {
  const cur = gs.draft.day_weights[dw] == null ? 1 : Number(gs.draft.day_weights[dw]);
  const i = WEIGHT_CYCLE.indexOf(cur);
  gs.draft.day_weights[dw] = WEIGHT_CYCLE[(i + 1) % WEIGHT_CYCLE.length];
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
}
function gdWeightPreset(p) {
  const w = p === 'half' ? defaultWeights() : p === 'weekdays' ? { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0 } : { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
  gs.draft.day_weights = w;
  if (gs.draft._autoTarget) gs.draft.target = autoTarget(gs.draft);
  renderGoalEditor();
}
function gdOpenEnded(on) {
  gs.draft.end_date = on ? null : GE.addDays(gs.draft.start_date, 6);
  renderGoalEditor();
}

function updateGoalHelper() {
  const el = document.getElementById('geHelper');
  if (!el) return;
  const d = gs.draft;
  if (d.mode === 'streak') {
    el.innerHTML = plural(Math.round(d.target) || 0, 'day') + ' in a row' + (d.scope === 'team' ? ', and a day only counts if <b>every</b> kid hits it' : ' for each kid') +
      (d.end_date ? ' by ' + fmtDay(d.end_date) : ', no deadline') + '.';
    return;
  }
  const per = GE.maxPerKid(d, todayStr());
  const n = Math.max(1, d.kid_ids.length);
  const max = d.scope === 'team' ? per * n : per;
  const pct = max > 0 ? Math.round((d.target / max) * 100) : 0;
  el.innerHTML = 'Max possible: <b>' + fmtN(max) + '</b>' + (d.scope === 'team' ? ' for the team (' + fmtN(per) + ' each × ' + n + ')' : ' per kid') +
    ' · target ' + fmtN(d.target) + ' = <b>' + pct + '%</b>' +
    (d.target > max ? ' <span class="g-bad">More than is possible!</span>' : pct >= 100 ? ' (perfect needed)' : '') +
    ' <button class="g-link" onclick="gs.draft.target=' + max + ';gs.draft._autoTarget=false;renderGoalEditor()">use max</button>';
}

function renderGoalEditor() {
  const d = gs.draft;
  if (!d) return;
  const prevModal = document.querySelector('#modalBg .modal');
  const scrollTop = prevModal ? prevModal.scrollTop : 0;
  const seg = function (field, val, label) {
    return '<button class="' + (d[field] === val ? 'active' : '') + '" onclick="gdSet(\'' + field + '\',\'' + val + '\')">' + label + '</button>';
  };
  const emojis = GOAL_EMOJIS.map(function (e) {
    return '<button class="ge-emoji' + (d.reward_emoji === e ? ' active' : '') + '" onclick="gs.draft.reward_emoji=\'' + e + '\';renderGoalEditor()">' + e + '</button>';
  }).join('');
  const kidChips = state.kids.map(function (k) {
    const on = d.kid_ids.indexOf(k.id) !== -1;
    return '<button class="ge-kid' + (on ? ' on' : '') + '" style="--kc:' + k.color + '" onclick="gdToggleKid(\'' + k.id + '\')">' + (on ? '✓ ' : '') + escapeHtml(k.name) + '</button>';
  }).join('');
  const items = d.items.map(function (it, i) {
    const days = Array.isArray(it.days) ? it.days : [0, 1, 2, 3, 4, 5, 6];
    return '<div class="ge-item">' +
      '<input class="ge-item-name" placeholder="e.g. School, Bedtime, Reading" value="' + escapeAttr(it.name) + '" oninput="gdItem(' + i + ',\'name\',this.value)">' +
      '<label class="ge-pts">pts<input type="number" step="0.5" min="0" value="' + it.points + '" oninput="gdItem(' + i + ',\'points\',this.value)"></label>' +
      '<div class="ge-days">' + DOW_ORDER.map(function (dw) {
        return '<button class="' + (days.indexOf(dw) !== -1 ? 'on' : '') + '" onclick="gdItemDay(' + i + ',' + dw + ')" title="' + DOW_SHORT[dw] + '">' + DOW_LETTER[dw] + '</button>';
      }).join('') + '</div>' +
      '<button class="ge-x" onclick="gdDelItem(' + i + ')" title="Remove">✕</button>' +
    '</div>';
  }).join('');
  const weights = DOW_ORDER.map(function (dw) {
    const w = d.day_weights[dw] == null ? 1 : Number(d.day_weights[dw]);
    return '<button class="ge-w w' + String(w).replace('.', '') + '" onclick="gdWeight(' + dw + ')"><span>' + DOW_SHORT[dw] + '</span><b>' + fmtW(w) + '</b></button>';
  }).join('');
  const isStreak = d.mode === 'streak';

  openModal(
    '<h2>' + (d.id ? 'Edit goal' : d._repeatOf ? 'Next round: ' + escapeHtml(d._repeatOf) : 'New goal') + '</h2>' +

    '<div class="ge-sec"><div class="ge-h">1 · The reward</div>' +
      '<div class="ge-emojis">' + emojis + '</div>' +
      '<div class="field"><span class="label">Goal name</span><input id="geTitle" placeholder="e.g. D&B Week" value="' + escapeAttr(d.title) + '" oninput="gd(\'title\',this.value)"></div>' +
      '<div class="row" style="margin-bottom:4px">' +
        '<div><span class="label">Reward</span><input placeholder="e.g. Dave & Buster’s" value="' + escapeAttr(d.reward) + '" oninput="gd(\'reward\',this.value)"></div>' +
        '<div><span class="label">Reward day</span><input type="date" value="' + (d.reward_date || '') + '" onchange="gd(\'reward_date\',this.value||null)"></div>' +
      '</div>' +
    '</div>' +

    '<div class="ge-sec"><div class="ge-h">2 · How it’s won</div>' +
      '<div class="ge-seg">' + seg('mode', 'total', '🎯 Points total') + seg('mode', 'streak', '🔥 Days in a row') + '</div>' +
      '<div class="ge-seg">' + seg('scope', 'individual', '👤 Each kid on his own') + seg('scope', 'team', '👥 Team effort') + '</div>' +
      '<div class="ge-kids">' + kidChips + '</div>' +
    '</div>' +

    '<div class="ge-sec"><div class="ge-h">3 · Scoring dates</div>' +
      '<div class="row">' +
        '<div><span class="label">Start</span><input type="date" value="' + d.start_date + '" onchange="gdDates(\'start_date\',this.value)"></div>' +
        '<div><span class="label">End</span>' + (d.end_date
          ? '<input type="date" value="' + d.end_date + '" onchange="gdDates(\'end_date\',this.value)">'
          : '<div class="ge-noend">No end date</div>') + '</div>' +
      '</div>' +
      (isStreak ? '<label class="ge-check"><input type="checkbox" ' + (d.end_date ? '' : 'checked') + ' onchange="gdOpenEnded(this.checked)"> No end date (runs until they get it)</label>' : '') +
    '</div>' +

    '<div class="ge-sec"><div class="ge-h">4 · What earns points</div>' + items +
      '<button class="btn-secondary g-sm" onclick="gdAddItem()">+ Add item</button>' +
    '</div>' +

    '<div class="ge-sec"><div class="ge-h">5 · What each day is worth</div>' +
      '<div class="ge-weights">' + weights + '</div>' +
      '<div class="ge-presets"><button onclick="gdWeightPreset(\'half\')">Weekends ½</button><button onclick="gdWeightPreset(\'weekdays\')">Weekdays only</button><button onclick="gdWeightPreset(\'full\')">Every day full</button></div>' +
      '<div class="muted ge-tip">Tap a day to cycle 1× → ½ → off → 2×. Single dates (holiday, sick day) can be changed later by tapping that day on the score sheet.</div>' +
    '</div>' +

    '<div class="ge-sec"><div class="ge-h">6 · Target</div>' +
      '<div class="row">' +
        '<div><span class="label">' + (isStreak ? 'Days in a row' : (d.scope === 'team' ? 'Points the team needs' : 'Points each kid needs')) + '</span>' +
          '<input id="geTarget" type="number" step="' + (isStreak ? 1 : 0.5) + '" min="1" value="' + d.target + '" oninput="gdTarget(this.value)"></div>' +
        (isStreak
          ? '<div><span class="label">A day counts when</span><select onchange="gs.draft.streak_min_pct=Number(this.value)">' +
              [[100, 'Every box ✓'], [75, '75%+ done'], [50, 'Half or more']].map(function (o) {
                return '<option value="' + o[0] + '"' + (Number(d.streak_min_pct) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('') + '</select></div>'
          : '<div></div>') +
      '</div>' +
      '<div class="ge-helper" id="geHelper"></div>' +
    '</div>' +

    '<div class="modal-actions ge-foot">' +
      (d.id ? '<button class="btn-danger" onclick="deleteGoal(\'' + d.id + '\')">Delete</button>' : '') +
      (d.id ? '<button class="btn-secondary" onclick="closeModal();archiveGoal(\'' + d.id + '\',' + (!d.archived) + ')">' + (d.archived ? 'Unarchive' : 'Archive') + '</button>' : '') +
      '<button class="btn-secondary" onclick="gs.draft=null;closeModal()">Cancel</button>' +
      '<button class="btn-primary" onclick="saveGoalDraft()">Save</button>' +
    '</div>'
  );
  updateGoalHelper();
  const m = document.querySelector('#modalBg .modal');
  if (m) { m.classList.add('ge-modal'); m.scrollTop = scrollTop; }
}

async function saveGoalDraft() {
  const d = gs.draft;
  if (!d) return;
  const items = d.items.map(function (it) {
    return { key: it.key || newKey(), name: String(it.name || '').trim(), points: Number(it.points) || 0, days: Array.isArray(it.days) ? it.days.slice().sort() : [0, 1, 2, 3, 4, 5, 6] };
  }).filter(function (it) { return it.name; });
  if (!d.title.trim()) { toast('Give the goal a name', 'error'); return; }
  if (!d.kid_ids.length) { toast('Pick at least one kid', 'error'); return; }
  if (!items.length || !items.some(function (it) { return it.points > 0; })) { toast('Add at least one item worth points', 'error'); return; }
  if (!d.start_date) { toast('Pick a start date', 'error'); return; }
  if (d.end_date && d.end_date < d.start_date) { toast('End date is before the start', 'error'); return; }
  if (!(Number(d.target) > 0)) { toast('Set a target', 'error'); return; }
  const row = {
    title: d.title.trim(), reward: (d.reward || '').trim(), reward_emoji: d.reward_emoji || '🏆', reward_date: d.reward_date || null,
    mode: d.mode, scope: d.scope, start_date: d.start_date, end_date: d.mode === 'streak' ? (d.end_date || null) : (d.end_date || GE.addDays(d.start_date, 6)),
    target: Number(d.target), streak_min_pct: Number(d.streak_min_pct) || 100, items: items,
    day_weights: d.day_weights, day_overrides: d.day_overrides || {}, kid_ids: d.kid_ids, color: d.color,
    notes: d.notes || null, updated_at: new Date().toISOString(),
  };
  const q = d.id
    ? supa.from(GOAL_TABLE).update(row).eq('id', d.id).select().single()
    : supa.from(GOAL_TABLE).insert(row).select().single();
  const r = await q;
  if (r.error) { toast('Not saved: ' + r.error.message, 'error'); return; }
  const saved = normGoal(r.data);
  const i = gs.goals.findIndex(function (g) { return g.id === saved.id; });
  if (i === -1) gs.goals.push(saved); else gs.goals[i] = saved;
  gs.draft = null;
  closeModal();
  gs.view = 'board';
  refreshGoalsUI();
  toast(d.id ? 'Goal updated' : 'Goal created: ' + saved.title, 'success');
}

async function deleteGoal(gid) {
  const g = getGoal(gid);
  if (!g) return;
  if (!confirm('Delete "' + g.title + '" and every score in it? This cannot be undone. (Archive keeps it in history instead.)')) return;
  const r = await supa.from(GOAL_TABLE).delete().eq('id', gid);
  if (r.error) { toast('Not deleted: ' + r.error.message, 'error'); return; }
  gs.goals = gs.goals.filter(function (x) { return x.id !== gid; });
  delete gs.idx[gid];
  gs.draft = null;
  closeModal();
  refreshGoalsUI();
  toast('Goal deleted', 'success');
}

// ---------- kid portal ----------
function renderKidGoals(kid) {
  const wrap = document.getElementById('kidGoals');
  if (!wrap) return;
  if (!gs.ready) { wrap.innerHTML = ''; return; }
  const today = todayStr();
  const mine = gs.goals.filter(function (g) { return g.kid_ids.indexOf(kid.id) !== -1 && goalPhase(g, today) !== 'history'; })
    .sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
  const stats = kidGoalStats(kid.id, today);
  if (!mine.length && !stats.entered) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div class="card"><h3>My goals' + (stats.entered ? ' · won ' + stats.won + ' of ' + stats.entered : '') + '</h3>' +
    (mine.length ? mine.map(function (g) { return kidGoalCardHtml(g, kid, today); }).join('') : '<div class="empty">No goal right now: a new one is coming!</div>') +
    '</div>';
}

function kidGoalCardHtml(g, kid, today) {
  const ev = evalGoal(g, today);
  const r = ev.kids[kid.id];
  const team = g.scope === 'team';
  const tr = team ? ev.team : r;
  if (!r || !tr) return '';
  const phase = goalPhase(g, today);
  const rewardLine = (g.reward ? escapeHtml(g.reward) : 'Reward') + ' · ' +
    (g.reward_date ? fmtDay(g.reward_date) + ' (' + untilText(g.reward_date, today) + ')' : 'day coming soon');

  let big, meter, msg;
  if (g.mode === 'streak') {
    const N = Math.max(1, Math.round(g.target));
    const filled = tr.wins > 0 ? N : Math.min(tr.current, N);
    big = '<div class="kg-big">🔥 ' + tr.current + '<span> / ' + N + ' days in a row</span></div>';
    meter = '<div class="g-flames g-flames-lg">' + Array.from({ length: N }, function (_, i) {
      return '<span class="' + (i < filled ? 'on' : '') + '">' + (i < filled ? '🔥' : '') + '</span>';
    }).join('') + '</div>';
    if (tr.state === 'made') msg = '🎉 You did it' + (team ? ', team' : '') + '! ' + (g.reward ? 'You earned ' + escapeHtml(g.reward) + '!' : '');
    else if (tr.state === 'out') msg = 'Not this time. The next streak starts with today 💪';
    else msg = (team ? 'Team needs ' : 'You need ') + plural(tr.needed, 'more day') + ' in a row' + (g.end_date ? ' (' + plural(tr.daysLeft, 'day') + ' left)' : '') + '. Keep it going!';
  } else {
    const pct = g.target > 0 ? Math.min(100, (tr.earned / g.target) * 100) : 0;
    big = '<div class="kg-big">' + fmtN(tr.earned) + '<span> / ' + fmtN(g.target) + ' points' + (team ? ' (team)' : '') + '</span></div>';
    meter = team
      ? '<div class="g-bar g-bar-lg g-bar-team">' + kidsOf(g).map(function (k) {
          const w = g.target > 0 ? Math.min(100, (ev.kids[k.id].earned / g.target) * 100) : 0;
          return '<div style="width:' + w + '%;background:' + k.color + '" title="' + escapeAttr(k.name) + '"></div>';
        }).join('') + '</div>'
      : '<div class="g-bar g-bar-lg"><div style="width:' + pct + '%;background:' + kid.color + '"></div></div>';
    if (tr.state === 'made') msg = '🎉 ' + (phase === 'finished' ? 'You made it! ' : 'Goal reached! ') + (g.reward ? 'You’re going to ' + escapeHtml(g.reward) + '!' : 'You earned it!');
    else if (tr.state === 'out') msg = phase === 'finished' || ev.ended
      ? 'You got ' + fmtN(tr.earned) + ' of ' + fmtN(g.target) + '. Not this time, but the next one is yours 💪'
      : 'Can’t reach ' + fmtN(g.target) + ' this time. Finish strong for your score 💪';
    else if (tr.state === 'perfect') msg = '⚠️ Every point counts: ' + (team ? 'the team needs ' : 'you need ') + 'all ' + fmtN(tr.needed) + ' that are left!';
    else msg = (team ? 'Team needs ' : 'You need ') + '<b>' + fmtN(tr.needed) + ' more</b>, and ' + fmtN(tr.remaining) + ' are still up for grabs. ' +
      (tr.elapsedMax > 0 ? (tr.onPace ? 'You’re on pace 👍' : 'You’re behind pace. Time to pick it up!') : 'You got this!');
  }
  const shoot = g.mode !== 'streak' && r.attempted > 0
    ? '<div class="kg-shoot">🎯 ' + (team ? 'Your shots: ' : '') + fmtN(r.earned) + ' of ' + fmtN(r.attempted) + ' (' + Math.round((r.earned / r.attempted) * 100) + '%)</div>'
    : (team && g.mode !== 'streak' ? '<div class="kg-shoot">Your points: ' + fmtN(r.earned) + '</div>' : '');

  const dots = r.days.filter(function (d) { return d.date <= (g.end_date || today); }).slice(-14).map(function (d) {
    let c;
    if (d.avail <= 0) c = 'off';
    else if (d.date > today) c = 'future';
    else if (d.earned >= d.avail - 1e-9) c = 'full';
    else if (d.earned > 0) c = 'part';
    else if (d.unlogged > 0) c = 'pend';
    else c = 'miss';
    return '<div class="kg-dot ' + c + '" title="' + fmtDay(d.date) + ': ' + fmtN(d.earned) + '/' + fmtN(d.avail) + '"><i></i><span>' + DOW_LETTER[GE.dow(d.date)] + '</span></div>';
  }).join('');

  return '<div class="kg-card ' + (tr.state === 'made' ? 'won' : tr.state === 'out' ? 'lost' : '') + '" style="--gc:' + g.color + '">' +
    '<div class="kg-top"><div class="kg-emoji">' + escapeHtml(g.reward_emoji || '🏆') + '</div>' +
      '<div><div class="kg-title">' + escapeHtml(g.title) + (team ? ' <span class="g-chip">👥 Team</span>' : '') + '</div>' +
      '<div class="kg-reward">' + rewardLine + '</div></div></div>' +
    big + meter + '<div class="kg-msg">' + msg + '</div>' + shoot +
    '<div class="kg-dots">' + dots + '</div>' +
  '</div>';
}
