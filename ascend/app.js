/* ============================================================================
   Ascend — app engine (auth, store + double-save, pacing, mastery, UI)
   Vanilla JS, no build step. Runs in DEMO mode out of the box; flips to REAL
   cloud (Supabase auth + sync) automatically when ascend-config.js has keys.
   ============================================================================ */

/* ------------------------------- CONFIG ---------------------------------- */
const CFG = window.ASCEND_CONFIG || {};
const APP_BUILD = 37; // shown on every screen so you can confirm the running version
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
let sb = null;
let AUTHED = false; // cloud: signed in (but may not have picked a profile yet)
if (CLOUD) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
function switchProfile() { STATE.currentUserId = null; saveRoute(); if (CLOUD) go('pick'); else go('login'); }

const LS_KEY = 'ascend_state_v3';
const LS_MIRROR = 'ascend_mirror_v3'; // the "double save" — a second local copy

/* ----------------------------- TIME HELPERS ------------------------------ */
const DAY = 86400000;
function now() { return Date.now(); }
function daysBetween(a, b) { return Math.round((b - a) / DAY); }
function fmtDate(ts) { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
// count weekday-scheduled days between two timestamps given days/week
function scheduledDays(start, end, daysPerWeek) {
  const weeks = Math.max(0, (end - start) / (7 * DAY));
  return Math.max(1, Math.round(weeks * daysPerWeek));
}

/* ------------------------------ STATE MODEL ------------------------------ */
let STATE = null;

function blankStudent(id, name, avatar, grade) {
  return {
    id, name, avatar, role: 'student', grade: grade || 'g5',
    plan: { start: startOfDay(now()), target: startOfDay(now() + 60 * DAY), daysPerWeek: 7, hoursPerDay: 1 },
    progress: {},   // skillId -> {score, attempts, correct, masteredAt}
    log: [],        // {ts, skillId, unitId, correct, seconds}
    writing: [],    // {ts, promptId, text, result}
    misses: [],     // {ts, skillId, unitId, prompt, answer, studentAnswer, explanation, reviewed, assigned}
    assignments: [],// {id, skillId, total, remaining, correct, ts, status}
    games: { sprintBest: 0, xp: 0, coins: 0, streak: { count: 0, last: null }, badges: [], ownedAvatars: [avatar], theme: null, dailies: null, bossCleared: {}, taught: {} },
  };
}

/* ------------------- REAL SETUP: Jayden (G5) + Jackson (G2) --------------- */
function seedDemo() {
  const jayden = blankStudent('stu_jayden', 'Jayden', '🏀', 'g5');
  const jackson = blankStudent('stu_jackson', 'Jackson', '🦖', 'g2');
  const parent = { id: 'par_home', name: 'Parent', avatar: '👤', role: 'parent', childIds: [jayden.id, jackson.id] };
  return { students: { [jayden.id]: jayden, [jackson.id]: jackson }, parents: { [parent.id]: parent }, currentUserId: null };
}

/* ------------------------------- STORE ----------------------------------- */
// Double-save: every write goes to primary (cloud OR local) AND a local mirror.
// PROGRESS-AWARE sync: mastered skills can't vanish by timestamp accident. A copy
// with meaningfully more mastery beats a "newer" copy with less, and nothing may
// overwrite a richer copy unless a parent explicitly restored (_restoredAt).
function masteredTotal(state) {
  let n = 0;
  try { for (const id in (state && state.students) || {}) { const p = state.students[id].progress || {}; for (const k in p) if (p[k] && p[k].masteredAt) n++; } } catch (e) {}
  return n;
}
function pickBestCopy(candidates) {
  const at = s => (s && s._savedAt) || 0;
  const cands = candidates.filter(Boolean);
  if (!cands.length) return null;
  const newest = cands.slice().sort((a, b) => at(b) - at(a))[0];
  const richest = cands.slice().sort((a, b) => masteredTotal(b) - masteredTotal(a))[0];
  if (richest === newest || masteredTotal(richest) <= masteredTotal(newest)) return newest;
  // newest has LESS progress than another copy — only honor it if a parent deliberately restored it
  if ((newest._restoredAt || 0) > at(richest)) return newest;
  console.warn('sync: ignoring a newer copy with less progress — keeping the richer one');
  return richest;
}
const Store = {
  async load() {
    // read ALL sources (both local copies + cloud), then pick the best — never
    // let a stale device's copy silently replace real progress.
    let local = null, mirror = null, cloud = null;
    try { const raw = localStorage.getItem(LS_KEY); if (raw) local = JSON.parse(raw); } catch (e) {}
    try { const raw = localStorage.getItem(LS_MIRROR); if (raw) mirror = JSON.parse(raw); } catch (e) {}
    if (CLOUD && sb) {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (user) { const { data } = await sb.from('ascend_state').select('data').eq('user_id', user.id).maybeSingle(); if (data && data.data) cloud = data.data; }
      } catch (e) { console.warn('cloud load failed', e); }
    }
    const best = pickBestCopy([local, mirror, cloud]);
    if (!best) return seedDemo();
    const at = s => (s && s._savedAt) || 0;
    // converge: if the best copy isn't what the cloud has, push it up so every other device pulls it
    if (CLOUD && sb && best !== cloud && (at(best) > at(cloud) || masteredTotal(best) > masteredTotal(cloud))) {
      setTimeout(() => Store.save(best).catch(() => {}), 0);
    }
    return best;
  },
  async save(state) {
    const prevAt = state._savedAt || 0;         // when this state was last persisted/loaded
    state._savedAt = now();                      // stamp BEFORE serialising so the copy carries its true time
    const json = JSON.stringify(state);
    try { localStorage.setItem(LS_KEY, json); localStorage.setItem(LS_MIRROR, json); } catch (e) {}
    pushSnapshot(state);                          // rolling + daily restore points — survive a bad overwrite
    if (CLOUD && sb) {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const { data } = await sb.from('ascend_state').select('data').eq('user_id', user.id).maybeSingle();
          const cloudState = data && data.data;
          const cloudAt = (cloudState && cloudState._savedAt) || 0;
          const cm = masteredTotal(cloudState), sm = masteredTotal(state);
          const parentRestore = (state._restoredAt || 0) > cloudAt; // an explicit restore outranks the cloud copy it replaces
          if (cm > sm && !parentRestore) {
            console.warn('cloud has more progress — refusing to overwrite it with a poorer copy');
          } else if (cloudAt > prevAt + 1000 && cm >= sm && !parentRestore) {
            console.warn('cloud is newer — skipping overwrite to avoid clobbering progress');
          } else {
            await sb.from('ascend_state').upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() });
          }
        }
      } catch (e) { console.warn('cloud save failed', e); }
    }
    flashSaved();
  },
};
async function persist() { await Store.save(STATE); }

/* --------- rolling snapshot history (local point-in-time restore) --------- */
const HIST_KEY = 'ascend_history_v3';
const DAILY_KEY = 'ascend_daily_v1';
function historyList() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; } }
function dailyRestoreList() { try { return JSON.parse(localStorage.getItem(DAILY_KEY) || '[]'); } catch (e) { return []; } }
function pushSnapshot(state) {
  // one snapshot per DAY, kept ~10 days — "restore from last night" always exists
  try {
    const dl = dailyRestoreList();
    const dk = dayKey(now());
    const entry = { d: dk, t: now(), data: JSON.parse(JSON.stringify(state)) };
    const i = dl.findIndex(x => x.d === dk);
    if (i >= 0) dl[i] = entry; else dl.push(entry);
    while (dl.length > 10) dl.shift();
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(dl)); }
    catch (e) { while (dl.length > 3) dl.shift(); try { localStorage.setItem(DAILY_KEY, JSON.stringify(dl)); } catch (e2) {} }
  } catch (e) {}
  // plus a rolling snapshot every ~20 min for same-day recovery
  try {
    const hist = historyList();
    const last = hist[hist.length - 1];
    if (last && (now() - last.t) < 20 * 60 * 1000) return;
    hist.push({ t: now(), data: JSON.parse(JSON.stringify(state)) });
    while (hist.length > 12) hist.shift();
    try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); }
    catch (e) { while (hist.length > 2) hist.shift(); try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch (e2) {} }
  } catch (e) {}
}
function snapshotSummary(snap) {
  const kids = Object.values((snap.data && snap.data.students) || {});
  const parts = kids.map(s => { const m = ALL_SKILLS_MASTERED_COUNT(s); return `${s.name}: ${m} skills · 🪙${s.games ? s.games.coins || 0 : 0}`; });
  return parts.join('  ·  ') || 'empty';
}
function ALL_SKILLS_MASTERED_COUNT(stu) { let n = 0; for (const k in (stu.progress || {})) if (stu.progress[k] && stu.progress[k].masteredAt) n++; return n; }
function restoreSnapshot(snap) {
  if (!snap || !snap.data || !snap.data.students) { toast('❌ Bad snapshot'); return; }
  STATE = snap.data; Object.values(STATE.students).forEach(ensureStudentShape);
  STATE._restoredAt = now(); // a parent's explicit restore outranks richer/newer copies elsewhere
  persist(); toast('✅ Restored earlier version');
  go(STATE.currentUserId ? (STATE.parents[STATE.currentUserId] ? 'parent-home' : 'student-home') : 'login');
}

/* ------------------------- SYNC STATUS (visible) -------------------------- */
function syncStateSummary(s) {
  if (!s) return 'no copy';
  const kids = Object.values(s.students || {});
  const who = kids.map(k => `${k.name}: ${ALL_SKILLS_MASTERED_COUNT(k)} skills`).join(' · ') || 'empty';
  return `${who}${s._savedAt ? ' · saved ' + new Date(s._savedAt).toLocaleString() : ''}`;
}
async function cloudPeek() {
  if (!(CLOUD && sb)) return { off: true };
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { user: null };
    const { data } = await sb.from('ascend_state').select('data').eq('user_id', user.id).maybeSingle();
    return { user, state: (data && data.data) || null };
  } catch (e) { return { err: true }; }
}
async function paintSyncStatus(box) {
  box.innerHTML = '';
  box.append(el('div', { class: 'restore-head' }, '☁️ Sync status'));
  box.append(el('div', { class: 'muted' }, `This device: ${syncStateSummary(STATE)}`));
  if (!(CLOUD && sb)) { box.append(el('div', { class: 'badge warn' }, '⚠️ Cloud sync is OFF on this device — progress stays local only')); return; }
  const peek = await cloudPeek();
  if (peek.err) { box.append(el('div', { class: 'badge warn' }, '⚠️ Cloud unreachable right now — will retry on next save')); return; }
  if (!peek.user) { box.append(el('div', { class: 'badge warn' }, '⚠️ Not signed in to the cloud on this device — nothing syncs until you log in')); return; }
  box.append(el('div', { class: 'muted' }, `Signed in as: ${peek.user.email || peek.user.id}`));
  box.append(el('div', { class: 'muted' }, `Cloud copy: ${syncStateSummary(peek.state)}`));
  box.append(el('div', { class: 'answer-row' }, [el('button', { class: 'btn primary', onclick: () => syncNow(box) }, '⟳ Sync now')]));
}
async function syncNow(box) {
  toast('⟳ Syncing…');
  const best = await Store.load();
  const better = best && (masteredTotal(best) > masteredTotal(STATE) || (best._savedAt || 0) > (STATE._savedAt || 0));
  if (better) {
    const uid = STATE.currentUserId;
    STATE = best; STATE.currentUserId = uid;
    Object.values(STATE.students || {}).forEach(ensureStudentShape);
    await persist();
    toast('✅ Updated this device from the best copy');
    render(); return;
  }
  await persist(); // push this device's copy up (progress guards protect richer copies)
  toast('✅ This device is the best copy — pushed it to the cloud');
  paintSyncStatus(box);
}

/* ------------------------------ PACING ENGINE ---------------------------- */
function unitStats(stu, unit) {
  const skills = unit.skills;
  const mastered = skills.filter(s => stu.progress[s.id]?.masteredAt).length;
  return { total: skills.length, mastered };
}
function subjectPace(stu) {
  const total = ALL_SKILLS.length;
  const mastered = ALL_SKILLS.filter(s => stu.progress[s.id]?.masteredAt).length;
  const { start, target, daysPerWeek } = stu.plan;
  const totalSched = scheduledDays(start, target, daysPerWeek);
  const elapsedSched = Math.min(totalSched, scheduledDays(start, now(), daysPerWeek));
  const expected = Math.min(total, (elapsedSched / totalSched) * total);
  const perDay = total / totalSched;                 // skills expected per scheduled day
  const daysDelta = perDay > 0 ? (mastered - expected) / perDay : 0; // + ahead, - behind
  const pct = Math.round((mastered / total) * 100);
  return { total, mastered, expected: Math.round(expected * 10) / 10, daysDelta: Math.round(daysDelta), perDay: round(perDay, 2), totalSched, elapsedSched, pct };
}

/* ----------------------------- REPORT ENGINE ----------------------------- */
function periodStart(period) {
  if (period === 'day') return startOfDay(now());
  if (period === 'week') return startOfDay(now() - 6 * DAY);
  return startOfDay(now() - 29 * DAY); // month
}
function reportFor(stu, period) {
  const from = periodStart(period);
  const logs = stu.log.filter(l => l.ts >= from);
  const byUnit = {};
  CURRICULUM.units.forEach(u => byUnit[u.id] = { name: u.name, color: u.color, icon: u.icon, attempts: 0, correct: 0, seconds: 0, mastered: 0 });
  logs.forEach(l => { const b = byUnit[l.unitId]; if (b) { b.attempts++; if (l.correct) b.correct++; b.seconds += l.seconds; } });
  CURRICULUM.units.forEach(u => byUnit[u.id].mastered = u.skills.filter(s => { const m = stu.progress[s.id]?.masteredAt; return m && m >= from; }).length);
  const attempts = logs.length, correct = logs.filter(l => l.correct).length, seconds = logs.reduce((a, l) => a + l.seconds, 0);
  return { attempts, correct, accuracy: attempts ? Math.round(100 * correct / attempts) : 0, minutes: Math.round(seconds / 60), byUnit: Object.values(byUnit), masteredCount: CURRICULUM.units.reduce((a, u) => a + u.skills.filter(s => { const m = stu.progress[s.id]?.masteredAt; return m && m >= from; }).length, 0) };
}

/* ------------------------------ MASTERY ---------------------------------- */
function currentSkill(stu) {
  return ALL_SKILLS.find(s => !stu.progress[s.id]?.masteredAt) || null;
}
function recordAnswer(stu, skill, correct, seconds) {
  const p = stu.progress[skill.id] || (stu.progress[skill.id] = { score: 0, attempts: 0, correct: 0, masteredAt: null });
  p.attempts++; if (correct) p.correct++;
  p.score = Math.max(0, Math.min(100, p.score + (correct ? 14 : -10)));
  let newlyMastered = false;
  if (p.score >= 100 && !p.masteredAt) { p.masteredAt = now(); newlyMastered = true; }
  stu.log.push({ ts: now(), skillId: skill.id, unitId: skill.unitId, correct, seconds });
  return newlyMastered;
}

// above-grade "Grade 6" track — a separate score on the same skill
function recordStretch(stu, skill, correct) {
  const p = stu.progress[skill.id] || (stu.progress[skill.id] = { score: 0, attempts: 0, correct: 0, masteredAt: null });
  const st = p.stretch || (p.stretch = { score: 0, attempts: 0, correct: 0, masteredAt: null });
  st.attempts++; if (correct) st.correct++;
  st.score = Math.max(0, Math.min(100, st.score + (correct ? 14 : -10)));
  let newly = false;
  if (st.score >= 100 && !st.masteredAt) { st.masteredAt = now(); newly = true; }
  return newly;
}
function stretchGenFor(skill) { return skill ? stretchGenName(skill.gen, ACTIVE_GRADE) : null; }
function stLbl() { return stretchLabel(ACTIVE_GRADE); }

// central hook: records the answer AND all engagement (xp, coins, quests, streak, badges)
// `stretch` = the above-grade (Grade 6) track
function handleAnswer(stu, skill, correct, seconds, stretch) {
  const beforeLvl = levelInfo(stu.games.xp).level;
  let mastered = false, stretchMastered = false;
  if (stretch) stretchMastered = recordStretch(stu, skill, correct);
  else mastered = recordAnswer(stu, skill, correct, seconds);
  ensureDailies(stu);
  awardXP(stu, correct ? (stretch ? 14 : 8) : 2);
  // coins drip slowly: 1 coin per 3 correct (per 2 on stretch) — big rewards come from mastery
  if (correct) { const g = stu.games; g.coinTick = ((g.coinTick || 0) + 1) % (stretch ? 2 : 3); if (g.coinTick === 0) awardCoins(stu, 1, 'practice'); }
  bumpQuest(stu, 'answer', 1); if (correct) bumpQuest(stu, 'correct', 1);
  if (mastered) { awardXP(stu, 40); awardCoins(stu, 10, 'mastered a skill'); bumpQuest(stu, 'master', 1); }
  if (stretchMastered) { awardXP(stu, 60); awardCoins(stu, 15, 'above-grade mastery'); }
  touchStreak(stu);
  const newBadges = refreshBadges(stu);
  const leveledUp = levelInfo(stu.games.xp).level > beforeLvl;
  return { mastered, stretchMastered, newBadges, leveledUp };
}

// celebration: confetti + a short toast for level-ups / new badges / mastery
function celebrate(cel) {
  if (!cel) return;
  if (cel.stretchMastered) { confetti(['🔥', '💎', '⭐', '🚀']); toast('🔥 ' + stLbl().toUpperCase() + ' mastered — above grade level!'); return; }
  if (cel.leveledUp) { confetti(); toast(`⬆️ Level up! You're now a ${levelInfo(STATE.students[STATE.currentUserId].games.xp).title}!`); }
  else if (cel.newBadges && cel.newBadges.length) { confetti(); toast(`${cel.newBadges[0].emoji} Badge unlocked: ${cel.newBadges[0].name}!`); }
  else if (cel.mastered) { confetti(['⭐', '🏀', '✨']); toast('⭐ Skill mastered!'); }
}
function toast(msg) { const t = $('#celebrateToast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }

/* --------------------------- ANSWER CHECKING ----------------------------- */
function checkAnswer(item, raw) {
  const val = String(raw).trim();
  if (item.type === 'mc') return val === item.answer;
  if (item.type === 'numeric') { const n = parseFloat(val.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) && Math.abs(n - Number(item.answer)) <= (item.tol || 0.01); }
  // text
  const norm = s => String(s).replace(/\s+/g, '').toLowerCase();
  return norm(val) === norm(item.answer) || (item.alt || []).some(a => norm(a) === norm(val));
}

/* ================================ UI ===================================== */
const $ = sel => document.querySelector(sel);
const el = (tag, props = {}, kids = []) => { const n = document.createElement(tag); Object.entries(props).forEach(([k, v]) => { if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }); (Array.isArray(kids) ? kids : [kids]).forEach(c => c && n.append(c.nodeType ? c : document.createTextNode(c))); return n; };

let VIEW = { name: 'student-home' };
function go(name, opts = {}) { if (typeof stopSpeech === 'function') stopSpeech(); VIEW = { name, ...opts }; saveRoute(); render(); }
function saveRoute() { try { if (STATE && STATE.currentUserId && VIEW.name !== 'login') localStorage.setItem('ascend_route', JSON.stringify({ u: STATE.currentUserId, v: VIEW })); } catch (e) {} }

function flashSaved() { const t = $('#saveToast'); if (!t) return; t.classList.add('show'); clearTimeout(flashSaved._t); flashSaved._t = setTimeout(() => t.classList.remove('show'), 1200); }

/* --------------------------- progress ring ------------------------------ */
function ring(pct, size = 120, color = '#7048e8', label = '') {
  const r = (size - 16) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return el('div', { class: 'ring', html: `
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#eee" stroke-width="12" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="12" fill="none"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="47%" text-anchor="middle" dominant-baseline="middle" class="ring-pct">${pct}%</text>
      <text x="50%" y="64%" text-anchor="middle" dominant-baseline="middle" class="ring-lbl">${label}</text>
    </svg>` });
}

/* ------------------------------- LOGIN ----------------------------------- */
function renderLogin() {
  const wrap = el('div', { class: 'login' });
  wrap.append(el('div', { class: 'logo', html: '⛰️' }));
  wrap.append(el('h1', {}, 'Ascend'));
  wrap.append(el('p', { class: 'tag' }, 'Master it. Earn your afternoon.'));
  wrap.append(el('div', { class: 'build-stamp' }, `${CURRICULUM.subject} · ${ALL_SKILLS.length} skills · build ${APP_BUILD}`));

  if (CLOUD) {
    const email = el('input', { type: 'email', placeholder: 'Email', class: 'inp' });
    const pass = el('input', { type: 'password', placeholder: 'Password (6+ characters)', class: 'inp' });
    const msg = el('div', { class: 'msg' });
    const doAuth = (mode) => async () => {
      const em = email.value.trim(), pw = pass.value;
      if (!em || !pw) { msg.textContent = 'Enter an email and a password.'; return; }
      if (pw.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
      msg.textContent = 'Working…';
      try {
        // call the method ON sb.auth (keeping it bound) — a detached reference throws
        const res = mode === 'in'
          ? await sb.auth.signInWithPassword({ email: em, password: pw })
          : await sb.auth.signUp({ email: em, password: pw });
        if (res.error) { msg.textContent = res.error.message; return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { msg.textContent = 'Account created — confirm via the email link, then Log in.'; return; }
        AUTHED = true;
        // Store.load returns this account's cloud state, or (first login) adopts the
        // existing on-device data — so Jayden's progress migrates up automatically.
        STATE = await Store.load(); if (!STATE || !STATE.students) STATE = seedDemo();
        Object.values(STATE.students).forEach(ensureStudentShape);
        STATE.currentUserId = null; await persist();  // persist uploads to cloud
        go('pick');
      } catch (e) { msg.textContent = 'Error: ' + ((e && e.message) || e); }
    };
    wrap.append(email, pass, el('button', { class: 'btn primary wide', onclick: doAuth('in') }, 'Log in'),
      el('button', { class: 'btn ghost wide', onclick: doAuth('up') }, 'Create family account'), msg);
    wrap.append(el('p', { class: 'demo-note', style: 'margin-top:10px' }, 'One account per family. Everyone in the family shares this login, then picks their profile.'));
  } else {
    wrap.append(el('p', { class: 'demo-note' }, 'Demo mode — pick a profile to explore'));
    wrap.append(profileGrid());
  }
  return wrap;
}
function profileGrid() {
  const grid = el('div', { class: 'profile-grid' });
  Object.values(STATE.students).forEach(s => grid.append(el('button', { class: 'profile', onclick: () => { STATE.currentUserId = s.id; persist(); go('student-home'); } },
    [el('div', { class: 'avatar' }, s.avatar), el('div', {}, s.name), el('div', { class: 'role' }, 'Student')])));
  const par = Object.values(STATE.parents)[0];
  if (par) grid.append(el('button', { class: 'profile parent', onclick: () => { STATE.currentUserId = par.id; persist(); go('parent-home'); } },
    [el('div', { class: 'avatar' }, par.avatar), el('div', {}, par.name || 'Parent'), el('div', { class: 'role' }, 'Family view')]));
  return grid;
}
function renderPickProfile() {
  const wrap = el('div', { class: 'login' });
  wrap.append(el('div', { class: 'logo', html: '⛰️' }));
  wrap.append(el('h1', {}, 'Ascend'));
  wrap.append(el('p', { class: 'tag' }, "Who's using Ascend?"));
  wrap.append(el('div', { class: 'build-stamp' }, `build ${APP_BUILD}`));
  wrap.append(profileGrid());
  wrap.append(el('button', { class: 'btn ghost', style: 'margin-top:18px', onclick: logout }, 'Sign out'));
  return wrap;
}

/* --------------------------- STUDENT: HOME ------------------------------- */
/* ---- daily / weekly goal (are we done for today?) ---- */
function masteredSince(stu, ts) { return ALL_SKILLS.filter(s => { const p = stu.progress[s.id]; return p && p.masteredAt && p.masteredAt >= ts; }).length; }
function goalBar(label, done, goal, color) {
  const pct = goal ? Math.min(100, Math.round(100 * done / goal)) : 0;
  return el('div', { class: 'goal-row' }, [
    el('div', { class: 'goal-top' }, [el('span', {}, label), el('b', { class: done >= goal ? 'goal-hit' : '' }, `${done}/${goal} skills`)]),
    el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: `width:${pct}%;background:${color}` })),
  ]);
}
function goalCard(stu) {
  const pace = subjectPace(stu);
  const dGoal = Math.max(1, Math.ceil(pace.perDay));
  const wGoal = Math.max(dGoal, Math.round(pace.perDay * (stu.plan.daysPerWeek || 7)));
  const dDone = masteredSince(stu, startOfDay(now()));
  const wDone = masteredSince(stu, startOfDay(now() - 6 * DAY));
  const qToday = stu.log.filter(l => l.ts >= startOfDay(now())).length;
  const done = dDone >= dGoal;
  const card = el('div', { class: 'card goal-card' + (done ? ' goal-complete' : '') });
  card.append(el('div', { class: 'goal-head' }, done ? '✅ Done for today — great work!' : '🎯 Today’s goal'));
  card.append(goalBar('Today', dDone, dGoal, '#12b886'));
  card.append(goalBar('This week', wDone, wGoal, '#7048e8'));
  const remain = Math.max(0, dGoal - dDone);
  card.append(el('div', { class: 'muted', style: 'margin-top:8px' }, `${qToday} question${qToday === 1 ? '' : 's'} practiced today${done ? ' 🎉' : ` · ${remain} more skill${remain === 1 ? '' : 's'} to hit today’s target`}`));
  return card;
}
function renderStudentHome() {
  const stu = STATE.students[STATE.currentUserId];
  const pace = subjectPace(stu);
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, false));

  const hero = el('div', { class: 'hero card' });
  hero.append(ring(pace.pct, 140, '#7048e8', 'mastered'));
  const paceBadge = pace.daysDelta >= 0 ? el('span', { class: 'badge good' }, `${pace.daysDelta} days ahead 🎉`) : el('span', { class: 'badge warn' }, `${Math.abs(pace.daysDelta)} days behind`);
  hero.append(el('div', { class: 'hero-txt' }, [
    el('h2', {}, `Hi ${stu.name}! ${stu.avatar}`),
    el('p', {}, `${pace.mastered} of ${pace.total} skills mastered in ${CURRICULUM.subject}.`),
    paceBadge,
    el('div', {}, el('button', { class: 'btn primary big', onclick: () => { const c = currentSkill(stu); c ? startSkill(c.id) : go('practice'); } }, '▶ Start today’s practice')),
  ]));
  wrap.append(hero);
  wrap.append(goalCard(stu));

  // assignments from a parent/coach
  const openAsg = stu.assignments.filter(a => a.status !== 'done');
  if (openAsg.length) {
    const ab = el('div', { class: 'card assign-card' });
    ab.append(el('h3', {}, '🎯 Assigned to you'));
    openAsg.slice(0, 3).forEach(a => { const loc = skillLoc(a.skillId); ab.append(el('div', { class: 'assign-row', onclick: () => startSkill(a.skillId) }, [
      el('div', { class: 'assign-mid' }, [el('div', { class: 'assign-nm' }, loc.skill.name), el('div', { class: 'muted' }, `${a.total - a.remaining}/${a.total} done`)]),
      el('span', { class: 'mini' }, 'Practice ▶'),
    ])); });
    wrap.append(ab);
  }

  // today's mission
  const cur = currentSkill(stu);
  const mission = el('div', { class: 'card' });
  mission.append(el('h3', {}, "🎯 Today's mission"));
  if (cur) mission.append(el('div', { class: 'mission' }, [
    el('span', { class: 'chip', style: `background:${cur.color}22;color:${cur.color}` }, cur.unitName),
    el('div', { class: 'mission-name' }, cur.name),
    el('button', { class: 'btn primary', onclick: () => startSkill(cur.id) }, stu.games.taught[cur.id] ? 'Practice' : '📖 Learn'),
  ]));
  else mission.append(el('p', {}, '🏆 Every skill mastered — amazing!'));
  wrap.append(mission);

  // daily strip
  ensureDailies(stu);
  const done = stu.games.dailies.quests.filter(q => q.done).length;
  if (dailyGoalMet(stu)) wrap.append(el('div', { class: 'card afternoon' }, '🏀 Daily goal complete — afternoon unlocked! Go train.'));
  const strip = el('div', { class: 'card daily-strip', onclick: () => go('profile') });
  strip.append(el('div', { class: 'ds-flame' }, `🔥 ${stu.games.streak?.count || 0}`));
  strip.append(el('div', { class: 'ds-mid' }, [el('div', { class: 'ds-txt' }, `Daily quests ${done}/3`), el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${100 * done / 3}%;background:var(--good)` }))]));
  strip.append(el('div', { class: 'ds-coin' }, `🪙 ${stu.games.coins || 0}`));
  wrap.append(strip);

  // play card
  const play = el('div', { class: 'card play-card', onclick: () => go('play-hub') });
  play.append(el('div', { class: 'play-emoji' }, '🎮'));
  play.append(el('div', {}, [el('div', { class: 'play-title' }, 'Game zone'), el('div', { class: 'play-sub' }, `Sprint · Boss Battle · Lv ${levelInfo(stu.games.xp).level}`)]));
  wrap.append(play);

  // unit map
  const map = el('div', { class: 'card' });
  map.append(el('h3', {}, '🗺️ Your map'));
  CURRICULUM.units.forEach(u => {
    const st = unitStats(stu, u);
    const row = el('div', { class: 'unit-row' });
    row.append(el('div', { class: 'unit-icon', style: `background:${u.color}22` }, u.icon));
    row.append(el('div', { class: 'unit-mid' }, [
      el('div', { class: 'unit-name' }, u.name),
      el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: `width:${100 * st.mastered / st.total}%;background:${u.color}` })),
    ]));
    row.append(el('div', { class: 'unit-count' }, `${st.mastered}/${st.total}`));
    map.append(row);
  });
  wrap.append(map);
  wrap.append(navbar('home'));
  return wrap;
}

/* --------------------------- STUDENT: PRACTICE --------------------------- */
let PRACTICE = null;
function renderPractice() {
  const stu = STATE.students[STATE.currentUserId];
  const skill = (VIEW.skill && ALL_SKILLS.find(s => s.id === VIEW.skill)) || currentSkill(stu);
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));
  if (!skill) { wrap.append(el('div', { class: 'card' }, '🏆 All done!')); wrap.append(navbar('home')); return wrap; }

  const p = stu.progress[skill.id] || { score: 0 };
  const stretchGen = stretchGenFor(skill);
  const canStretch = !!stretchGen && !!p.masteredAt;      // Grade 6 unlocks after on-grade mastery
  const adv = !!VIEW.stretch && canStretch;               // are we in Advanced mode right now?

  if (!PRACTICE || PRACTICE.skillId !== skill.id || PRACTICE.adv !== adv) PRACTICE = { skillId: skill.id, adv, item: generateItem(adv ? stretchGen : skill.gen, skill), start: now(), streak: 0, answered: 0 };
  const sp = p.stretch || { score: 0 };
  const card = el('div', { class: 'card practice' + (adv ? ' advanced' : '') });
  if (adv) card.append(el('div', { class: 'adv-banner' }, '🔥 ' + stLbl().toUpperCase() + ' · Above grade level'));
  card.append(el('div', { class: 'practice-top' }, [
    el('div', { class: 'chip', style: `background:${skill.color}22;color:${skill.color}` }, skill.unitName),
    el('button', { class: 'mini', onclick: () => go('lesson', { skill: skill.id, then: 'practice' }) }, '📖 Learn'),
  ]));
  card.append(el('h2', {}, skill.name));
  if (adv) card.append(el('div', { class: 'smart' }, [el('span', {}, '🔥 ' + stLbl() + ' SmartScore'), el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: `width:${sp.score || 0}%;background:#f76707` })), el('b', {}, `${sp.score || 0}`)]));
  else card.append(el('div', { class: 'smart' }, [el('span', {}, 'SmartScore'), el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: `width:${p.score || 0}%;background:${skill.color}` })), el('b', {}, `${p.score || 0}`)]));

  const item = PRACTICE.item;
  card.append(el('div', { class: 'q', html: item.prompt }));
  const feedback = el('div', { class: 'feedback' });

  const submit = (val) => {
    if (PRACTICE.locked) return;
    PRACTICE.locked = true;
    const secs = Math.max(2, Math.round((now() - PRACTICE.start) / 1000));
    const ok = checkAnswer(item, val);
    if (!ok && !adv) recordMiss(stu, skill, item, val);
    const cel = handleAnswer(stu, skill, ok, secs, adv);
    if (!adv) { const asg = openAssignment(stu, skill.id); if (asg) { asg.remaining = Math.max(0, asg.remaining - 1); if (ok) asg.correct++; if (asg.remaining <= 0) asg.status = 'done'; } }
    persist();
    celebrate(cel);
    feedback.className = 'feedback ' + (ok ? 'ok' : 'no');
    feedback.innerHTML = (ok ? '✅ Correct! ' : '❌ Not quite. ') + `<div class="expl">${item.explanation}</div>`;
    const p2 = stu.progress[skill.id];
    const onGradeMastered = !!p2.masteredAt, stretchMastered = !!(p2.stretch && p2.stretch.masteredAt);
    let goNext, label, secondary = null;
    if (adv) {
      if (stretchMastered) { label = '🎉 ' + stLbl() + ' mastered — next skill'; goNext = () => { PRACTICE = null; go('practice', { skill: undefined }); }; }
      else { label = '🔥 Next (' + stLbl() + ') ▶'; goNext = () => { PRACTICE = null; go('practice', { skill: skill.id, stretch: true }); }; secondary = { t: '← Back to grade level', fn: () => { PRACTICE = null; go('practice', { skill: skill.id }); } }; }
    } else if (onGradeMastered && stretchGen && !stretchMastered) {
      // AUTO-PUSH above grade level: mastering a skill flows straight into the Grade 6 challenge
      label = '🔥 ' + stLbl() + ' bonus →'; goNext = () => { PRACTICE = null; go('practice', { skill: skill.id, stretch: true }); };
      secondary = { t: 'Skip to next skill →', fn: () => { PRACTICE = null; go('practice', { skill: undefined }); } };
    } else if (onGradeMastered) {
      label = '🎉 Skill mastered — continue'; goNext = () => { PRACTICE = null; go('practice', { skill: undefined }); };
    } else {
      label = 'Next question ▶'; goNext = () => { PRACTICE = null; go('practice', { skill: skill.id }); };
    }
    PRACTICE.next = goNext;   // lets the spacebar advance
    feedback.append(el('button', { class: 'btn primary', onclick: goNext }, label + '  ␣'));
    if (secondary) feedback.append(el('button', { class: 'btn ghost', onclick: secondary.fn }, secondary.t));
  };

  if (item.type === 'mc') {
    const opts = el('div', { class: 'options' });
    item.choices.forEach(c => opts.append(el('button', { class: 'option', onclick: () => submit(c) }, c)));
    card.append(opts);
  } else {
    const inp = el('input', { class: 'inp answer', placeholder: 'Your answer', onkeydown: e => { if (e.key === 'Enter') submit(inp.value); } });
    card.append(el('div', { class: 'answer-row' }, [inp, el('button', { class: 'btn primary', onclick: () => submit(inp.value) }, 'Check')]));
    setTimeout(() => inp.focus(), 30);
  }
  card.append(feedback);
  // entry point to Advanced mode (before answering) when the skill is already mastered
  if (canStretch && !adv) card.append(el('button', { class: 'btn stretch-btn wide', onclick: () => { PRACTICE = null; go('practice', { skill: skill.id, stretch: true }); } }, `🔥 ${stLbl()} Challenge  ·  ${sp.masteredAt ? 'mastered ✓' : (sp.score || 0) + '/100'}`));
  if (adv) card.append(el('button', { class: 'btn ghost wide', onclick: () => { PRACTICE = null; go('practice', { skill: skill.id }); } }, '← Back to grade level'));
  wrap.append(card);
  wrap.append(navbar('practice'));
  return wrap;
}

/* --------------------------- STUDENT: PROGRESS --------------------------- */
function renderProgress() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, false));
  const r = reportFor(stu, 'week');
  const cards = el('div', { class: 'stat-row' });
  cards.append(stat('This week', `${r.attempts}`, 'questions'));
  cards.append(stat('Accuracy', `${r.accuracy}%`, 'correct'));
  cards.append(stat('Time', `${r.minutes}m`, 'practiced'));
  cards.append(stat('Mastered', `${r.masteredCount}`, 'new skills'));
  wrap.append(el('div', { class: 'card' }, [el('h3', {}, '📈 This week'), cards]));

  const skills = el('div', { class: 'card' });
  skills.append(el('h3', {}, '🧠 Skill mastery'));
  CURRICULUM.units.forEach(u => {
    skills.append(el('div', { class: 'unit-head', style: `color:${u.color}` }, `${u.icon} ${u.name}`));
    u.skills.forEach(s => {
      const p = stu.progress[s.id] || { score: 0 };
      skills.append(el('div', { class: 'skill-line' }, [
        el('span', { class: 'skill-nm' }, s.name),
        el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${p.score || 0}%;background:${u.color}` })),
        p.stretch?.masteredAt ? el('span', { class: 'star', title: 'mastered above grade level' }, '🔥') : p.masteredAt ? el('span', { class: 'star', title: 'mastered' }, '⭐') : el('button', { class: 'mini', onclick: () => startSkill(s.id) }, stu.games.taught[s.id] ? 'practice' : '📖 learn'),
      ]));
    });
  });
  wrap.append(skills);
  wrap.append(navbar('progress'));
  return wrap;
}

/* --------------------------- STUDENT: WRITING ---------------------------- */
let WRITING = null;
function renderWriting() {
  const stu = STATE.students[STATE.currentUserId];
  const promptId = (WRITING && WRITING.promptId) || WRITING_PROMPTS[0].id;
  const prompt = WRITING_PROMPTS.find(p => p.id === promptId);
  if (!WRITING) WRITING = { promptId, text: '' };
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, false));

  // prompt picker
  const picker = el('div', { class: 'seg wide-seg' });
  WRITING_PROMPTS.forEach(p => picker.append(el('button', { class: 'seg-btn ' + (p.id === promptId ? 'on' : ''), onclick: () => { WRITING = { promptId: p.id, text: '' }; go('writing'); } }, p.title)));

  const card = el('div', { class: 'card' });
  card.append(el('h3', {}, '✍️ Writing'));
  card.append(picker);
  card.append(el('div', { class: 'chip', style: 'background:#efe9fd;color:#5a37c9' }, prompt.mode));
  card.append(el('p', { class: 'wprompt' }, prompt.prompt));
  const ta = el('textarea', { class: 'inp writing-area', placeholder: 'Start writing here…', rows: '10' });
  ta.value = WRITING.text || '';
  ta.addEventListener('input', () => { WRITING.text = ta.value; });
  card.append(ta);

  const result = el('div', { class: 'wresult' });
  const evalBtn = el('button', { class: 'btn primary', onclick: () => {
    const r = evaluateWriting(ta.value);
    stu.writing.push({ ts: now(), promptId, text: ta.value, result: r });
    ensureDailies(stu); bumpQuest(stu, 'write', 1); awardXP(stu, 15 + r.total * 2); awardCoins(stu, 4, 'writing'); touchStreak(stu);
    const cel = { newBadges: refreshBadges(stu) };
    persist(); celebrate(cel);
    result.innerHTML = ''; result.append(scorecard(r));
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } }, '✓ Get feedback');
  card.append(el('div', { class: 'answer-row' }, [evalBtn]));
  card.append(el('div', { class: 'tiny-note' }, 'Rubric-based practice feedback (Florida B.E.S.T. Writing). A teacher can always review and adjust.'));
  card.append(result);
  wrap.append(card);

  // past drafts (revision history — supports the anti-ghostwriting design)
  const drafts = stu.writing.filter(w => w.promptId === promptId).slice().reverse();
  if (drafts.length) {
    const hist = el('div', { class: 'card' });
    hist.append(el('h3', {}, '📝 Your drafts'));
    drafts.forEach(d => hist.append(el('div', { class: 'draft-row' }, [
      el('div', { class: 'draft-mid' }, [el('div', { class: 'draft-date' }, fmtDate(d.ts)), el('div', { class: 'draft-prev' }, (d.text || '').slice(0, 80) + '…')]),
      el('div', { class: 'draft-score', style: `background:${d.result.total >= 10 ? '#e6fcf5' : d.result.total >= 7 ? '#fff9db' : '#fff4e6'}` }, `${d.result.total}/12`),
    ])));
    wrap.append(hist);
  }
  wrap.append(navbar('write'));
  return wrap;
}
function scorecard(r) {
  const box = el('div', { class: 'scorecard' });
  box.append(el('div', { class: 'sc-total' }, [el('div', { class: 'sc-num' }, `${r.total}`), el('div', { class: 'sc-den' }, '/ 12'), el('div', { class: 'sc-ov' }, r.overall)]));
  Object.entries(r.dims).forEach(([k, v]) => {
    const dim = BEST_RUBRIC[k];
    box.append(el('div', { class: 'sc-dim' }, [
      el('div', { class: 'sc-dim-top' }, [el('span', { class: 'sc-dim-nm' }, dim.name), el('span', { class: 'sc-dim-sc' }, `${v.score}/4`)]),
      el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${25 * v.score}%;background:${v.score >= 3 ? '#12b886' : v.score >= 2 ? '#f59f00' : '#f76707'}` })),
      ...(v.notes.length ? [el('ul', { class: 'sc-notes' }, v.notes.map(n => el('li', {}, n)))] : [el('div', { class: 'sc-good' }, '✓ Looking strong here!')]),
    ]));
  });
  return box;
}

/* ---------------------------- MATH SPRINT (game) ------------------------- */
const SPRINT_SECONDS = 60;
let SPRINT = { phase: 'ready' };
let SPRINT_TIMER = null;
function stopSprintTimer() { if (SPRINT_TIMER) { clearInterval(SPRINT_TIMER); SPRINT_TIMER = null; } }

// turn any generated item into a fast tap-to-answer multiple-choice item
function gameItem(pool) {
  pool = pool || ALL_SKILLS;
  let skill, it, guard = 0;
  do { skill = pick(pool); it = generateItem(skill.gen, skill); guard++; }
  while (it.type === 'text' && guard < 12); // avoid free-text (fractions) in the arcade
  let choices;
  if (it.type === 'mc') { choices = it.choices; }
  else {
    const ans = Number(it.answer), set = new Set([String(it.answer)]);
    let t = 0;
    while (set.size < 4 && t < 30) { const off = pick([-3, -2, -1, 1, 2, 3, 5, -5, 10, -10]); const d = Number.isInteger(ans) ? ans + off : round(ans + off, 2); if (String(d) !== String(it.answer)) set.add(String(d)); t++; }
    while (set.size < 4) set.add(String(round(ans + set.size + 1, 2)));
    choices = shuffle([...set]);
  }
  return { skill, prompt: it.prompt, answer: String(it.answer), choices, explanation: it.explanation };
}
function startSprint() {
  SPRINT = { phase: 'playing', timeLeft: SPRINT_SECONDS, score: 0, streak: 0, best: 0, answered: 0, correct: 0, item: gameItem() };
  go('sprint');
}
function sprintTick() {
  SPRINT.timeLeft--;
  if (SPRINT.dom) SPRINT.dom.timer.textContent = SPRINT.timeLeft;
  if (SPRINT.dom && SPRINT.timeLeft <= 10) SPRINT.dom.timer.parentElement.classList.add('low');
  if (SPRINT.timeLeft <= 0) endSprint();
}
function sprintAnswer(choice, btn) {
  if (SPRINT.locked) return; SPRINT.locked = true;
  const stu = STATE.students[STATE.currentUserId];
  const ok = choice === SPRINT.item.answer;
  SPRINT.answered++; if (ok) SPRINT.correct++;
  if (!ok) recordMiss(stu, SPRINT.item.skill, SPRINT.item, choice);
  const cel = handleAnswer(stu, SPRINT.item.skill, ok, 3); // counts toward mastery, xp, quests, reports
  if (cel.newBadges && cel.newBadges.length) SPRINT.newBadges = (SPRINT.newBadges || []).concat(cel.newBadges);
  if (ok) { SPRINT.streak++; const mult = 1 + Math.floor(SPRINT.streak / 3); SPRINT.score += 10 * mult; if (btn) btn.classList.add('right'); }
  else { SPRINT.streak = 0; if (btn) btn.classList.add('wrong'); }
  if (SPRINT.dom) { SPRINT.dom.score.textContent = SPRINT.score; SPRINT.dom.streak.textContent = '🔥' + SPRINT.streak; }
  setTimeout(() => { SPRINT.locked = false; SPRINT.item = gameItem(); paintSprintQuestion(); }, ok ? 220 : 650);
}
function paintSprintQuestion() {
  if (!SPRINT.dom) return;
  const box = SPRINT.dom.qbox; box.innerHTML = '';
  box.append(el('div', { class: 'chip', style: `background:${SPRINT.item.skill.color}22;color:${SPRINT.item.skill.color}` }, SPRINT.item.skill.unitName));
  box.append(el('div', { class: 'q game-q', html: SPRINT.item.prompt }));
  const opts = el('div', { class: 'options game-opts' });
  SPRINT.item.choices.forEach(c => opts.append(el('button', { class: 'option', onclick: (e) => sprintAnswer(c, e.currentTarget) }, c)));
  box.append(opts);
}
function endSprint() {
  stopSprintTimer();
  const stu = STATE.students[STATE.currentUserId];
  SPRINT.best = Math.max(stu.games.sprintBest || 0, SPRINT.score);
  SPRINT.isRecord = SPRINT.score > (stu.games.sprintBest || 0);
  stu.games.sprintBest = SPRINT.best;
  ensureDailies(stu); bumpQuest(stu, 'sprint', 1); awardCoins(stu, 4 + Math.floor(SPRINT.score / 80), 'Math Sprint');
  SPRINT.newBadges = (SPRINT.newBadges || []).concat(refreshBadges(stu));
  SPRINT.phase = 'over';
  persist();
  if (SPRINT.isRecord || (SPRINT.newBadges && SPRINT.newBadges.length)) setTimeout(confetti, 200);
  go('sprint');
}
function renderSprint() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));

  if (SPRINT.phase === 'ready') {
    wrap.append(el('div', { class: 'card game-splash' }, [
      el('div', { class: 'game-logo' }, '⚡'),
      el('h2', {}, 'Math Sprint'),
      el('p', { class: 'muted' }, `How many can you nail in ${SPRINT_SECONDS} seconds? Build a streak for bonus points!`),
      el('div', { class: 'game-best' }, `🏆 Your best: ${stu.games.sprintBest || 0} · ⭐ ${stu.games.xp || 0} XP`),
      el('button', { class: 'btn primary big', onclick: startSprint }, '▶ Start'),
    ]));
    wrap.append(navbar('play'));
    return wrap;
  }
  if (SPRINT.phase === 'over') {
    const acc = SPRINT.answered ? Math.round(100 * SPRINT.correct / SPRINT.answered) : 0;
    wrap.append(el('div', { class: 'card game-splash' }, [
      el('div', { class: 'game-logo' }, SPRINT.isRecord ? '🏆' : '🎉'),
      el('h2', {}, SPRINT.isRecord ? 'New personal best!' : 'Time!'),
      el('div', { class: 'game-score' }, SPRINT.score),
      el('div', { class: 'muted' }, `${SPRINT.correct}/${SPRINT.answered} correct · ${acc}%`),
      (SPRINT.newBadges && SPRINT.newBadges.length) ? el('div', { class: 'game-best' }, SPRINT.newBadges.map(b => `${b.emoji} ${b.name}`).join('  ')) : el('div', { class: 'muted', style: 'margin-top:6px' }, '🪙 coins earned!'),
      el('div', { class: 'answer-row', style: 'justify-content:center;margin-top:12px' }, [
        el('button', { class: 'btn primary', onclick: startSprint }, '↻ Play again'),
        el('button', { class: 'btn ghost', onclick: () => { SPRINT = { phase: 'ready' }; go('student-home'); } }, 'Done'),
      ]),
    ]));
    wrap.append(navbar('play'));
    return wrap;
  }

  // playing
  const hud = el('div', { class: 'game-hud' }, [
    el('div', { class: 'hud-timer' }, [el('b', {}, String(SPRINT.timeLeft)), el('span', {}, 's')]),
    el('div', { class: 'hud-score' }, [el('span', {}, 'score'), el('b', {}, String(SPRINT.score))]),
    el('div', { class: 'hud-streak' }, '🔥' + SPRINT.streak),
  ]);
  const qbox = el('div', { class: 'card game-card' });
  SPRINT.dom = { timer: hud.querySelector('.hud-timer b'), score: hud.querySelector('.hud-score b'), streak: hud.querySelector('.hud-streak'), qbox };
  wrap.append(hud, qbox);
  paintSprintQuestion();
  stopSprintTimer();
  SPRINT_TIMER = setInterval(sprintTick, 1000);
  return wrap;
}

/* --------------------------- BOSS CHALLENGE (game) ---------------------- */
let BOSS = { phase: 'lobby' };
let BOSS_TIMER = null;
const BOSS_EMOJI = { nso: '🐉', ar: '👹', pr: '🦑', gr: '🗿', dp: '👻' };
const BOSS_TARGET = 7, BOSS_LIVES = 3;
function unitSkills(unitId) { return ALL_SKILLS.filter(s => s.unitId === unitId); }
function bossStopTimer() { if (BOSS_TIMER) { clearInterval(BOSS_TIMER); BOSS_TIMER = null; } }
function bossQuestionMs() { return Math.max(5, 12 - (BOSS.streak || 0)) * 1000; } // clock speeds up as streak climbs
function bossStartTimer() { bossStopTimer(); BOSS.qStart = now(); BOSS.qDur = bossQuestionMs(); BOSS_TIMER = setInterval(bossTick, 100); }
function bossTick() {
  if (!BOSS.dom) return;
  const rem = BOSS.qDur - (now() - BOSS.qStart);
  BOSS.dom.timebar.style.width = Math.max(0, rem / BOSS.qDur * 100) + '%';
  BOSS.dom.timenum.textContent = Math.max(0, Math.ceil(rem / 1000));
  if (rem <= 3000) BOSS.dom.timebar.classList.add('danger');
  if (rem <= 0) bossResolve('timeout', null);
}
function startBoss(unit) {
  const stu = STATE.students[STATE.currentUserId];
  BOSS = { phase: 'active', unitId: unit.id, target: BOSS_TARGET, streak: 0, lives: BOSS_LIVES, item: gameItem(unitSkills(unit.id)), asked: 0, correct: 0, newBadges: [] };
  ensureDailies(stu); bumpQuest(stu, 'boss', 1); persist();
  go('boss');
}
function bossResolve(result, btn) {
  if (BOSS.locked) return; BOSS.locked = true;
  bossStopTimer();
  const stu = STATE.students[STATE.currentUserId];
  const answered = result !== 'timeout';
  const ok = result === true;
  if (answered) { BOSS.asked++; if (ok) BOSS.correct++; if (!ok) recordMiss(stu, BOSS.item.skill, BOSS.item, 'boss'); const cel = handleAnswer(stu, BOSS.item.skill, ok, 3); if (cel.newBadges && cel.newBadges.length) BOSS.newBadges = BOSS.newBadges.concat(cel.newBadges); }
  if (ok) { BOSS.streak++; if (btn) btn.classList.add('right'); }
  else { BOSS.lives = Math.max(0, BOSS.lives - 1); BOSS.streak = 0; if (btn) btn.classList.add('wrong'); }
  persist();
  setTimeout(() => {
    BOSS.locked = false;
    if (BOSS.streak >= BOSS.target) { winBoss(); return; }
    if (BOSS.lives <= 0) { BOSS.phase = 'lose'; go('boss'); return; }
    BOSS.item = gameItem(unitSkills(BOSS.unitId)); go('boss');
  }, ok ? 320 : 680);
}
function answerBoss(choice, btn) { bossResolve(choice === BOSS.item.answer, btn); }
function winBoss() {
  const stu = STATE.students[STATE.currentUserId];
  const firstTime = !stu.games.bossCleared[BOSS.unitId];
  BOSS.flawless = BOSS.lives === BOSS_LIVES;
  stu.games.bossCleared[BOSS.unitId] = true;
  awardXP(stu, 55); awardCoins(stu, (firstTime ? 12 : 4) + (BOSS.flawless ? 6 : 0), 'Boss Challenge');
  BOSS.newBadges = BOSS.newBadges.concat(refreshBadges(stu));
  BOSS.phase = 'win'; persist(); setTimeout(() => confetti(['🏆', '💥', '⭐', '🔥']), 150); go('boss');
}
function renderBoss() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));

  if (BOSS.phase === 'lobby') {
    wrap.append(el('div', { class: 'card' }, [el('h2', {}, '⚔️ Boss Challenge'),
      el('p', { class: 'muted' }, `Get a streak of ${BOSS_TARGET} correct in a row to defeat the boss. You have ${BOSS_LIVES} lives, the clock speeds up as you climb, and a wrong answer wipes your streak — so don't guess!`)]));
    const grid = el('div', { class: 'boss-grid' });
    CURRICULUM.units.forEach(u => {
      const cleared = stu.games.bossCleared[u.id];
      grid.append(el('button', { class: 'card boss-pick', style: `border:2px solid ${u.color}`, onclick: () => startBoss(u) }, [
        el('div', { class: 'boss-face' }, BOSS_EMOJI[u.id] || '👾'),
        el('div', { class: 'boss-nm' }, u.name),
        cleared ? el('span', { class: 'badge good' }, '⭐ Cleared') : el('span', { class: 'chip', style: `background:${u.color}22;color:${u.color}` }, 'Take on'),
      ]));
    });
    wrap.append(grid);
    wrap.append(navbar('play'));
    return wrap;
  }
  if (BOSS.phase === 'win' || BOSS.phase === 'lose') {
    const win = BOSS.phase === 'win';
    wrap.append(el('div', { class: 'card game-splash' }, [
      el('div', { class: 'game-logo' }, win ? '🏆' : '💔'),
      el('h2', {}, win ? (BOSS.flawless ? 'Flawless victory!' : 'Boss defeated!') : 'Out of lives!'),
      el('div', { class: 'muted' }, win ? `${BOSS.correct}/${BOSS.asked} correct · streak of ${BOSS.target}! ${BOSS.flawless ? '+bonus coins' : ''}` : 'Your streak broke one too many times — take another run!'),
      (win && BOSS.newBadges && BOSS.newBadges.length) ? el('div', { class: 'game-best' }, BOSS.newBadges.map(b => `${b.emoji} ${b.name}`).join('  ')) : null,
      el('div', { class: 'answer-row', style: 'justify-content:center;margin-top:12px' }, [
        el('button', { class: 'btn primary', onclick: () => { const u = CURRICULUM.units.find(x => x.id === BOSS.unitId); startBoss(u); } }, win ? '⚔️ Challenge again' : '↻ Try again'),
        el('button', { class: 'btn ghost', onclick: () => { BOSS = { phase: 'lobby' }; go('boss'); } }, 'Back'),
      ]),
    ]));
    wrap.append(navbar('play'));
    return wrap;
  }

  // active challenge
  const unit = CURRICULUM.units.find(u => u.id === BOSS.unitId);
  const meter = el('div', { class: 'streak-meter' });
  for (let i = 0; i < BOSS.target; i++) meter.append(el('div', { class: 'streak-seg' + (i < BOSS.streak ? ' lit' : ''), style: i < BOSS.streak ? `background:${unit.color}` : '' }));
  const timebar = el('div', { class: 'boss-timebar-fill' });
  const timenum = el('b', {}, String(Math.ceil(bossQuestionMs() / 1000)));
  wrap.append(el('div', { class: 'card boss-arena' }, [
    el('div', { class: 'boss-hpwrap' }, [
      el('div', { class: 'boss-face big' }, BOSS_EMOJI[unit.id] || '👾'),
      el('div', { class: 'boss-mid' }, [
        el('div', { class: 'boss-title' }, `${unit.name} Boss`),
        el('div', { class: 'boss-sub' }, [el('span', { class: 'hearts' }, '❤️'.repeat(BOSS.lives) + '🤍'.repeat(BOSS_LIVES - BOSS.lives)), el('span', { class: 'streak-count' }, `🔥 ${BOSS.streak}/${BOSS.target}`)]),
        meter,
      ]),
    ]),
    el('div', { class: 'boss-timebar' }, [timebar]),
    el('div', { class: 'boss-timelabel' }, ['⏱ ', timenum, 's — answer fast!']),
  ]));
  const q = el('div', { class: 'card game-card' });
  q.append(el('div', { class: 'q game-q', html: BOSS.item.prompt }));
  const opts = el('div', { class: 'options game-opts' });
  BOSS.item.choices.forEach(c => opts.append(el('button', { class: 'option', onclick: (e) => answerBoss(c, e.currentTarget) }, c)));
  q.append(opts);
  wrap.append(q);
  wrap.append(navbar('play'));
  BOSS.dom = { timebar, timenum };
  bossStartTimer();
  return wrap;
}

/* ------------------------------ PLAY HUB --------------------------------- */
function renderPlayHub() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, false));
  const lv = levelInfo(stu.games.xp);
  wrap.append(el('div', { class: 'card hubbar' }, [
    el('div', { class: 'hub-lv' }, [el('b', {}, 'Lv ' + lv.level), el('span', {}, lv.title)]),
    el('div', { class: 'hub-coin' }, '🪙 ' + (stu.games.coins || 0)),
    el('div', { class: 'hub-streak' }, '🔥 ' + (stu.games.streak?.count || 0)),
  ]));
  wrap.append(el('h2', { class: 'ph' }, '🎮 Game zone'));
  const modes = el('div', { class: 'mode-grid' });
  modes.append(el('div', { class: 'card mode-card', style: 'background:linear-gradient(135deg,#7048e8,#f76707)', onclick: () => { SPRINT = { phase: 'ready' }; go('sprint'); } },
    [el('div', { class: 'mode-emoji' }, '⚡'), el('div', { class: 'mode-nm' }, 'Math Sprint'), el('div', { class: 'mode-sub' }, `60-second combo rush · best ${stu.games.sprintBest || 0}`)]));
  modes.append(el('div', { class: 'card mode-card', style: 'background:linear-gradient(135deg,#e64980,#7048e8)', onclick: () => { BOSS = { phase: 'lobby' }; go('boss'); } },
    [el('div', { class: 'mode-emoji' }, '⚔️'), el('div', { class: 'mode-nm' }, 'Boss Challenge'), el('div', { class: 'mode-sub' }, `Streak-to-win under the clock · ${Object.keys(stu.games.bossCleared || {}).length}/${CURRICULUM.units.length} cleared`)]));
  modes.append(el('div', { class: 'card mode-card', style: 'background:linear-gradient(135deg,#1c7ed6,#20c997)', onclick: () => { FAST = null; go('fast'); } },
    [el('div', { class: 'mode-emoji' }, '📋'), el('div', { class: 'mode-nm' }, 'FAST Practice Test'), el('div', { class: 'mode-sub' }, 'A 10-question Florida FAST-style mock')]));
  modes.append(el('div', { class: 'card mode-card', style: 'background:linear-gradient(135deg,#f59f00,#e64980)', onclick: () => { BUILD = null; go('build'); } },
    [el('div', { class: 'mode-emoji' }, '🧩'), el('div', { class: 'mode-nm' }, 'Build It! (interactive)'), el('div', { class: 'mode-sub' }, 'Tap & place — base-ten blocks, fraction shapes')]));
  modes.append(el('div', { class: 'card mode-card', style: 'background:linear-gradient(135deg,#20c997,#1c7ed6)', onclick: () => { RUNNER = { phase: 'ready' }; go('runner'); } },
    [el('div', { class: 'mode-emoji' }, '🏃'), el('div', { class: 'mode-nm' }, 'Number Runner'), el('div', { class: 'mode-sub' }, `Steer into the right answer · best ${stu.games.runnerBest || 0}`)]));
  modes.append(el('div', { class: 'card mode-card locked' },
    [el('div', { class: 'mode-emoji' }, '🤺'), el('div', { class: 'mode-nm' }, 'Duel (vs friends)'), el('div', { class: 'mode-sub' }, 'Real-time head-to-head — coming soon')]));
  wrap.append(modes);
  wrap.append(navbar('play'));
  return wrap;
}

/* ===================== INTERACTIVE MANIPULATIVES ('Build It') ============= */
let BUILD = null;
const BUILD_KINDS = {
  baseten: { emoji: '🔢', name: 'Base-Ten Blocks', sub: 'Build the number by tapping blocks' },
  fraction: { emoji: '🍕', name: 'Fraction Shapes', sub: 'Tap parts to shade the fraction' },
  clock: { emoji: '🕐', name: 'Set the Clock', sub: 'Move the hands to the right time' },
  coins: { emoji: '🪙', name: 'Coin Counter', sub: 'Tap coins to make the amount' },
  array: { emoji: '🟦', name: 'Array Builder', sub: 'Build the rows and columns' },
};
function setupBuild() {
  if (BUILD.kind === 'baseten') { BUILD.target = randInt(11, 999); BUILD.h = 0; BUILD.t = 0; BUILD.o = 0; }
  else if (BUILD.kind === 'fraction') { BUILD.den = pick([2, 3, 4, 6, 8]); BUILD.num = randInt(1, BUILD.den - 1); BUILD.shaded = new Set(); }
  else if (BUILD.kind === 'clock') { BUILD.thr = randInt(1, 12); BUILD.tmin = pick([0, 15, 30, 45]); BUILD.hr = 12; BUILD.min = 0; }
  else if (BUILD.kind === 'coins') { BUILD.target = randInt(6, 99); BUILD.coins = []; }
  else if (BUILD.kind === 'array') { BUILD.trows = randInt(2, 5); BUILD.tcols = randInt(2, 5); BUILD.rows = 1; BUILD.cols = 1; }
  BUILD.solved = false;
}
function startBuild(kind) { BUILD = { kind, i: 0, n: 6, correct: 0 }; setupBuild(); go('build'); }
function refreshBuild() { const root = $('#app'); root.innerHTML = ''; root.append(renderBuild()); }
function checkBuild(ok) {
  if (BUILD.solved) return;
  const stu = STATE.students[STATE.currentUserId];
  if (ok) {
    BUILD.solved = true; BUILD.correct++;
    awardXP(stu, 8); awardCoins(stu, 1, 'Build It'); touchStreak(stu); refreshBadges(stu); persist();
    confetti(['⭐', '🎉']); toast('✅ Correct!');
    setTimeout(() => { BUILD.i++; if (BUILD.i >= BUILD.n) BUILD.done = true; else setupBuild(); refreshBuild(); }, 800);
  } else { toast('Not quite — take another look!'); }
  refreshBuild();
}
function renderBuild() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));

  if (!BUILD) { // menu
    wrap.append(el('div', { class: 'card' }, [el('h2', {}, '🧩 Build It!'), el('p', { class: 'muted' }, 'Learn by doing — tap and place to build the answer.')]));
    const grid = el('div', { class: 'mode-grid' });
    Object.entries(BUILD_KINDS).forEach(([k, m]) => grid.append(el('div', { class: 'card mode-card', style: 'background:linear-gradient(135deg,#7048e8,#20c997)', onclick: () => startBuild(k) },
      [el('div', { class: 'mode-emoji' }, m.emoji), el('div', { class: 'mode-nm' }, m.name), el('div', { class: 'mode-sub' }, m.sub)])));
    wrap.append(grid); wrap.append(navbar('play')); return wrap;
  }
  if (BUILD.done) {
    wrap.append(el('div', { class: 'card game-splash' }, [el('div', { class: 'game-logo' }, '🎉'), el('h2', {}, `${BUILD.correct}/${BUILD.n} built!`),
      el('div', { class: 'muted' }, 'Nice building! +XP & coins earned.'),
      el('div', { class: 'answer-row', style: 'justify-content:center;margin-top:12px' }, [
        el('button', { class: 'btn primary', onclick: () => startBuild(BUILD.kind) }, '↻ Again'),
        el('button', { class: 'btn ghost', onclick: () => { BUILD = null; go('build'); } }, 'Menu'),
      ])]));
    wrap.append(navbar('play')); return wrap;
  }

  wrap.append(el('div', { class: 'card fast-prog' }, [el('b', {}, `${BUILD_KINDS[BUILD.kind].name} · ${BUILD.i + 1} of ${BUILD.n}`),
    el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${100 * BUILD.i / BUILD.n}%;background:var(--primary)` }))]));
  const area = el('div', { class: 'card build-area' });
  const status = el('div', { class: 'build-status' });
  ({ baseten: buildBaseTen, fraction: buildFraction, clock: buildClock, coins: buildCoins, array: buildArray }[BUILD.kind])(area, status);
  wrap.append(area);
  wrap.append(navbar('play'));
  return wrap;
}
function buildBaseTen(area, status) {
  const target = BUILD.target;
  area.append(el('div', { class: 'build-prompt' }, ['Build the number ', el('b', {}, String(target))]));
  const mat = el('div', { class: 'tenmat' });
  const cols = [['Hundreds', 'h', 100, 9], ['Tens', 't', 10, 18], ['Ones', 'o', 1, 18]];
  const draw = () => {
    mat.innerHTML = '';
    cols.forEach(([label, key, val, cap]) => {
      const col = el('div', { class: 'ten-col' });
      const blocks = el('div', { class: 'ten-blocks' });
      for (let i = 0; i < BUILD[key]; i++) blocks.append(el('div', { class: 'blk blk-' + key, title: 'tap to remove', onclick: () => { BUILD[key]--; draw(); } }));
      col.append(blocks);
      col.append(el('button', { class: 'ten-add', onclick: () => { if (BUILD[key] < cap) { BUILD[key]++; draw(); } } }, '＋'));
      col.append(el('div', { class: 'ten-lbl' }, `${label} (${BUILD[key]})`));
      mat.append(col);
    });
    const cur = BUILD.h * 100 + BUILD.t * 10 + BUILD.o;
    status.innerHTML = `You built: <b>${cur}</b>`;
    status.className = 'build-status' + (BUILD.solved ? ' ok' : '');
  };
  area.append(mat); area.append(status);
  area.append(el('div', { class: 'answer-row', style: 'margin-top:10px' }, [
    el('button', { class: 'btn ghost', onclick: () => { BUILD.h = BUILD.t = BUILD.o = 0; refreshBuild(); } }, '↺ Clear'),
    el('button', { class: 'btn primary grow', onclick: () => checkBuild(BUILD.h * 100 + BUILD.t * 10 + BUILD.o === target) }, 'Check ✓'),
  ]));
  draw();
}
function buildFraction(area, status) {
  const { den, num } = BUILD;
  area.append(el('div', { class: 'build-prompt' }, ['Shade ', el('b', {}, `${num}/${den}`), ' of the shape']));
  const bar = el('div', { class: 'frac-bar' });
  const draw = () => {
    bar.innerHTML = '';
    for (let i = 0; i < den; i++) bar.append(el('div', { class: 'frac-seg' + (BUILD.shaded.has(i) ? ' on' : ''), onclick: () => { BUILD.shaded.has(i) ? BUILD.shaded.delete(i) : BUILD.shaded.add(i); draw(); } }));
    status.innerHTML = `Shaded: <b>${BUILD.shaded.size}/${den}</b>`;
    status.className = 'build-status' + (BUILD.solved ? ' ok' : '');
  };
  area.append(bar); area.append(status);
  area.append(el('div', { class: 'answer-row', style: 'margin-top:10px' }, [
    el('button', { class: 'btn ghost', onclick: () => { BUILD.shaded = new Set(); refreshBuild(); } }, '↺ Clear'),
    el('button', { class: 'btn primary grow', onclick: () => checkBuild(BUILD.shaded.size === num) }, 'Check ✓'),
  ]));
  draw();
}
function stepper(label, onDown, onUp) {
  return el('div', { class: 'stepper' }, [
    el('button', { class: 'step-btn', onclick: onDown }, '−'),
    el('div', { class: 'step-lbl' }, label),
    el('button', { class: 'step-btn', onclick: onUp }, '＋'),
  ]);
}
function clockSVG(hAng, mAng) {
  const P = Math.PI / 180;
  let ticks = '';
  for (let i = 0; i < 12; i++) { const a = i * 30 * P; ticks += `<line x1="${50 + 38 * Math.sin(a)}" y1="${50 - 38 * Math.cos(a)}" x2="${50 + 44 * Math.sin(a)}" y2="${50 - 44 * Math.cos(a)}" stroke="#adb5bd" stroke-width="1.5"/>`; }
  const hr = `<line x1="50" y1="50" x2="${50 + 24 * Math.sin(hAng * P)}" y2="${50 - 24 * Math.cos(hAng * P)}" stroke="#241c3b" stroke-width="4.5" stroke-linecap="round"/>`;
  const mn = `<line x1="50" y1="50" x2="${50 + 34 * Math.sin(mAng * P)}" y2="${50 - 34 * Math.cos(mAng * P)}" stroke="#7048e8" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 100" width="190" height="190"><circle cx="50" cy="50" r="47" fill="#fff" stroke="#241c3b" stroke-width="3"/>${ticks}${hr}${mn}<circle cx="50" cy="50" r="3" fill="#241c3b"/></svg>`;
}
function buildClock(area, status) {
  const two = n => String(n).padStart(2, '0');
  area.append(el('div', { class: 'build-prompt' }, ['Set the clock to ', el('b', {}, `${BUILD.thr}:${two(BUILD.tmin)}`)]));
  const face = el('div', { class: 'clock-face' });
  const draw = () => {
    face.innerHTML = clockSVG((BUILD.hr % 12) * 30 + BUILD.min * 0.5, BUILD.min * 6);
    status.innerHTML = BUILD.solved ? '✅ Nice!' : 'Move the hands, then tap Check'; // no digital readout — he must read the clock
    status.className = 'build-status' + (BUILD.solved ? ' ok' : '');
  };
  area.append(face); area.append(status);
  area.append(el('div', { class: 'clock-steppers' }, [
    stepper('Hour', () => { BUILD.hr = BUILD.hr === 1 ? 12 : BUILD.hr - 1; draw(); }, () => { BUILD.hr = BUILD.hr === 12 ? 1 : BUILD.hr + 1; draw(); }),
    stepper('Minute', () => { BUILD.min = (BUILD.min + 55) % 60; draw(); }, () => { BUILD.min = (BUILD.min + 5) % 60; draw(); }),
  ]));
  area.append(el('button', { class: 'btn primary wide', onclick: () => checkBuild(BUILD.hr === BUILD.thr && BUILD.min === BUILD.tmin) }, 'Check ✓'));
  draw();
}
function buildCoins(area, status) {
  const target = BUILD.target;
  const COINS = [['penny', 1, '#c97b4a'], ['nickel', 5, '#9aa0a6'], ['dime', 10, '#868e96'], ['quarter', 25, '#adb5bd']];
  area.append(el('div', { class: 'build-prompt' }, ['Make ', el('b', {}, `${target}¢`)]));
  const jar = el('div', { class: 'coin-jar' });
  const draw = () => {
    jar.innerHTML = '';
    BUILD.coins.forEach((v, idx) => { const c = COINS.find(x => x[1] === v); jar.append(el('div', { class: 'coin', style: `background:${c[2]}`, title: 'tap to remove', onclick: () => { BUILD.coins.splice(idx, 1); draw(); } }, v + '¢')); });
    const sum = BUILD.coins.reduce((a, b) => a + b, 0);
    status.innerHTML = `Total: <b>${sum}¢</b>`;
    status.className = 'build-status' + (BUILD.solved ? ' ok' : '');
  };
  area.append(jar); area.append(status);
  const pal = el('div', { class: 'coin-palette' });
  COINS.forEach(c => pal.append(el('button', { class: 'coin-pick', style: `background:${c[2]}`, onclick: () => { BUILD.coins.push(c[1]); draw(); } }, [el('div', {}, c[1] + '¢'), el('small', {}, c[0])])));
  area.append(pal);
  area.append(el('div', { class: 'answer-row', style: 'margin-top:10px' }, [
    el('button', { class: 'btn ghost', onclick: () => { BUILD.coins = []; refreshBuild(); } }, '↺ Clear'),
    el('button', { class: 'btn primary grow', onclick: () => checkBuild(BUILD.coins.reduce((a, b) => a + b, 0) === target) }, 'Check ✓'),
  ]));
  draw();
}
function buildArray(area, status) {
  area.append(el('div', { class: 'build-prompt' }, ['Build ', el('b', {}, `${BUILD.trows} rows of ${BUILD.tcols}`)]));
  const box = el('div', { class: 'array-box' });
  const draw = () => {
    box.innerHTML = '';
    for (let r = 0; r < BUILD.rows; r++) { const row = el('div', { class: 'array-row' }); for (let c = 0; c < BUILD.cols; c++) row.append(el('div', { class: 'array-dot' })); box.append(row); }
    status.innerHTML = `You built: <b>${BUILD.rows} × ${BUILD.cols} = ${BUILD.rows * BUILD.cols}</b>`;
    status.className = 'build-status' + (BUILD.solved ? ' ok' : '');
  };
  area.append(box); area.append(status);
  area.append(el('div', { class: 'clock-steppers' }, [
    stepper('Rows', () => { if (BUILD.rows > 1) { BUILD.rows--; draw(); } }, () => { if (BUILD.rows < 8) { BUILD.rows++; draw(); } }),
    stepper('Columns', () => { if (BUILD.cols > 1) { BUILD.cols--; draw(); } }, () => { if (BUILD.cols < 8) { BUILD.cols++; draw(); } }),
  ]));
  area.append(el('button', { class: 'btn primary wide', onclick: () => checkBuild(BUILD.rows === BUILD.trows && BUILD.cols === BUILD.tcols) }, 'Check ✓'));
  draw();
}

/* =========================== ARCADE: NUMBER RUNNER ======================= */
let RUNNER = { phase: 'ready' };
let RUNNER_RAF = null;
const RUN_FIELD_H = 340;
function stopRunner() { if (RUNNER_RAF) { cancelAnimationFrame(RUNNER_RAF); RUNNER_RAF = null; } }
function runnerItem() {
  const it = gameItem(); const correct = String(it.answer);
  const distract = it.choices.filter(c => c !== correct).slice(0, 2);
  const three = shuffle([correct, ...distract]);
  return { skill: it.skill, prompt: it.prompt, correct, choices: three, correctLane: three.indexOf(correct) };
}
const RUN_TRAVEL = RUN_FIELD_H - 70;
// how many ms the gate takes to reach the runner — starts SLOW (14s), ramps to ~5s over ~40 questions
function runnerCrossMs(score) { return Math.max(5000, 14000 - score * 230); }
function runnerSpeed(score) { return RUN_TRAVEL / runnerCrossMs(score); }
function startRunner() { RUNNER = Object.assign({ phase: 'run', lane: 1, hearts: 3, score: 0, gy: 0, last: 0, resolving: false }, runnerItem()); RUNNER.speed = runnerSpeed(0); go('runner'); }
function moveRunner(d) { if (RUNNER.phase !== 'run') return; RUNNER.lane = Math.max(0, Math.min(2, RUNNER.lane + d)); if (RUNNER.dom) RUNNER.dom.guy.style.left = (RUNNER.lane * 33.333 + 16.666) + '%'; }
function dropRunner() { if (RUNNER.phase === 'run') runnerResolve(); } // commit early once you know the answer
function runnerResolve() {
  if (RUNNER.resolving) return; RUNNER.resolving = true;
  const stu = STATE.students[STATE.currentUserId];
  const ok = RUNNER.lane === RUNNER.correctLane;
  handleAnswer(stu, RUNNER.skill, ok, 2);   // counts toward mastery/xp like the other games
  if (ok) { RUNNER.score++; }
  else { RUNNER.hearts--; if (RUNNER.dom) { RUNNER.dom.field.classList.add('shake'); setTimeout(() => RUNNER.dom && RUNNER.dom.field.classList.remove('shake'), 300); } }
  persist();
  if (RUNNER.hearts <= 0) { endRunner(); return; }
  Object.assign(RUNNER, runnerItem()); RUNNER.gy = 0; RUNNER.speed = runnerSpeed(RUNNER.score); RUNNER.resolving = false;
  paintRunner();
}
function endRunner() {
  stopRunner();
  const stu = STATE.students[STATE.currentUserId];
  RUNNER.isRecord = RUNNER.score > (stu.games.runnerBest || 0);
  stu.games.runnerBest = Math.max(stu.games.runnerBest || 0, RUNNER.score);
  awardCoins(stu, 2 + Math.floor(RUNNER.score / 2), 'Number Runner'); RUNNER.newBadges = refreshBadges(stu);
  RUNNER.phase = 'over'; persist();
  if (RUNNER.isRecord) setTimeout(() => confetti(['🏃', '⭐', '💨']), 150);
  go('runner');
}
function paintRunner() {
  if (!RUNNER.dom) return;
  RUNNER.dom.prompt.innerHTML = RUNNER.prompt;
  RUNNER.dom.doors.forEach((d, i) => { d.textContent = RUNNER.choices[i]; });
  RUNNER.dom.hearts.textContent = '❤️'.repeat(RUNNER.hearts) + '🤍'.repeat(3 - RUNNER.hearts);
  RUNNER.dom.score.textContent = RUNNER.score;
  RUNNER.dom.gate.style.transform = 'translateY(0px)';
}
function runnerTick(ts) {
  if (RUNNER.phase !== 'run' || !RUNNER.dom) return;
  if (!RUNNER.last) RUNNER.last = ts;
  const dt = Math.min(48, ts - RUNNER.last); RUNNER.last = ts;
  RUNNER.gy += RUNNER.speed * dt;
  if (RUNNER.gy >= RUN_TRAVEL) { RUNNER.gy = 0; RUNNER.last = ts; runnerResolve(); }
  else { RUNNER.dom.gate.style.transform = `translateY(${RUNNER.gy}px)`; }
  RUNNER_RAF = (RUNNER.phase === 'run') ? requestAnimationFrame(runnerTick) : null;
}
function renderRunner() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));
  if (RUNNER.phase === 'ready') {
    wrap.append(el('div', { class: 'card game-splash' }, [el('div', { class: 'game-logo' }, '🏃'), el('h2', {}, 'Number Runner'),
      el('p', { class: 'muted' }, 'Steer into the door with the RIGHT answer with ◀ ▶ (or arrow keys). It starts slow and speeds up. Know it early? Press ⬇ GO (or Space / ↓) to lock it in. 3 lives.'),
      el('div', { class: 'game-best' }, `🏆 Best: ${stu.games.runnerBest || 0}`),
      el('button', { class: 'btn primary big', onclick: startRunner }, '▶ Run!')]));
    wrap.append(navbar('play')); return wrap;
  }
  if (RUNNER.phase === 'over') {
    wrap.append(el('div', { class: 'card game-splash' }, [el('div', { class: 'game-logo' }, RUNNER.isRecord ? '🏆' : '🏁'), el('h2', {}, RUNNER.isRecord ? 'New best!' : 'Nice run!'),
      el('div', { class: 'game-score' }, RUNNER.score), el('div', { class: 'muted' }, `${RUNNER.score} correct doors`),
      (RUNNER.newBadges && RUNNER.newBadges.length) ? el('div', { class: 'game-best' }, RUNNER.newBadges.map(b => `${b.emoji} ${b.name}`).join('  ')) : null,
      el('div', { class: 'answer-row', style: 'justify-content:center;margin-top:12px' }, [
        el('button', { class: 'btn primary', onclick: startRunner }, '↻ Run again'),
        el('button', { class: 'btn ghost', onclick: () => { RUNNER = { phase: 'ready' }; go('play-hub'); } }, 'Done')])]));
    wrap.append(navbar('play')); return wrap;
  }
  // run
  const hud = el('div', { class: 'game-hud' }, [
    el('div', { class: 'hud-streak' }, '❤️❤️❤️'),
    el('div', { class: 'runner-prompt' }, RUNNER.prompt),
    el('div', { class: 'hud-score' }, [el('span', {}, 'score'), el('b', {}, '0')]),
  ]);
  const field = el('div', { class: 'runner-field', style: `height:${RUN_FIELD_H}px` });
  const gate = el('div', { class: 'runner-gate' });
  const doors = RUNNER.choices.map((c, i) => el('div', { class: 'runner-door', style: `left:${i * 33.333}%`, onclick: () => moveRunner(i - RUNNER.lane) }, c));
  doors.forEach(d => gate.append(d));
  const guy = el('div', { class: 'runner-guy', style: `left:${RUNNER.lane * 33.333 + 16.666}%` }, stu.avatar || '🏃');
  field.append(gate, guy);
  wrap.append(hud); wrap.append(field);
  wrap.append(el('div', { class: 'runner-controls' }, [
    el('button', { class: 'btn primary run-btn', onclick: () => moveRunner(-1) }, '◀'),
    el('button', { class: 'btn run-drop', onclick: () => dropRunner() }, '⬇ GO'),
    el('button', { class: 'btn primary run-btn', onclick: () => moveRunner(1) }, '▶'),
  ]));
  wrap.append(navbar('play'));
  RUNNER.dom = { field, gate, doors, guy, prompt: hud.querySelector('.runner-prompt'), hearts: hud.querySelector('.hud-streak'), score: hud.querySelector('.hud-score b') };
  paintRunner();
  RUNNER.last = 0; stopRunner(); RUNNER_RAF = requestAnimationFrame(runnerTick);
  return wrap;
}

/* ------------------------------- PROFILE --------------------------------- */
function renderProfile() {
  const stu = STATE.students[STATE.currentUserId];
  ensureDailies(stu);
  const lv = levelInfo(stu.games.xp);
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));

  wrap.append(el('div', { class: 'card profile-hero' }, [
    el('div', { class: 'profile-av' }, stu.avatar),
    el('div', { class: 'profile-mid' }, [
      el('div', { class: 'profile-nm' }, stu.name),
      el('div', { class: 'profile-title' }, `Lv ${lv.level} · ${lv.title}`),
      el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: `width:${lv.pct}%;background:var(--primary)` })),
      el('div', { class: 'muted' }, `${lv.into}/${lv.span} XP to next level`),
    ]),
  ]));
  const chips = el('div', { class: 'stat-row' });
  chips.append(stat('Streak', `🔥${stu.games.streak?.count || 0}`, 'days'));
  chips.append(stat('Coins', `🪙${stu.games.coins || 0}`, 'to spend'));
  chips.append(stat('Badges', `${(stu.games.badges || []).length}`, `of ${BADGES.length}`));
  chips.append(stat('XP', `${stu.games.xp || 0}`, 'total'));
  wrap.append(el('div', { class: 'card' }, [chips, el('div', { class: 'answer-row', style: 'margin-top:12px' }, [
    el('button', { class: 'btn primary', onclick: () => go('shop') }, '🛍️ Shop'),
    el('button', { class: 'btn ghost', onclick: () => go('leaderboard') }, '🏆 Leaderboard'),
  ])]));

  // daily quests
  const dq = el('div', { class: 'card' });
  dq.append(el('h3', {}, `📅 Daily quests ${dailyGoalMet(stu) ? '✅' : ''}`));
  stu.games.dailies.quests.forEach(q => {
    const claimable = q.done && !q.claimed;
    dq.append(el('div', { class: 'quest-row' }, [
      el('div', { class: 'quest-mid' }, [
        el('div', { class: 'quest-txt' }, `${q.text} ${q.claimed ? '✓' : ''}`),
        el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${100 * q.progress / q.goal}%;background:var(--good)` })),
      ]),
      claimable
        ? el('button', { class: 'mini claim', onclick: () => { awardCoins(stu, q.reward, 'daily quest'); q.claimed = true; persist(); confetti(['🪙']); toast(`🪙 +${q.reward} coins!`); go('profile'); } }, `🪙${q.reward}`)
        : el('span', { class: 'quest-r' }, q.claimed ? '🪙✓' : `🪙${q.reward}`),
    ]));
  });
  wrap.append(dq);

  // badges
  const bg = el('div', { class: 'card' });
  bg.append(el('h3', {}, '🏅 Badges'));
  const grid = el('div', { class: 'badge-grid' });
  BADGES.forEach(b => {
    const owned = (stu.games.badges || []).includes(b.id);
    grid.append(el('div', { class: 'badge-cell ' + (owned ? 'have' : 'locked'), title: b.desc }, [
      el('div', { class: 'badge-em' }, owned ? b.emoji : '🔒'),
      el('div', { class: 'badge-nm' }, b.name),
    ]));
  });
  bg.append(grid);
  wrap.append(bg);
  wrap.append(navbar('home'));
  return wrap;
}

/* --------------------------------- SHOP ---------------------------------- */
function renderShop() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));
  wrap.append(el('div', { class: 'card shopbar' }, [el('h2', {}, '🛍️ Shop'), el('div', { class: 'hub-coin big' }, '🪙 ' + (stu.games.coins || 0))]));

  const av = el('div', { class: 'card' });
  av.append(el('h3', {}, '😎 Avatars'));
  const ag = el('div', { class: 'shop-grid' });
  SHOP_AVATARS.forEach(item => {
    const owned = (stu.games.ownedAvatars || []).includes(item.e);
    const equipped = stu.avatar === item.e;
    ag.append(el('button', { class: 'shop-cell ' + (equipped ? 'equipped' : ''), onclick: () => {
      if (owned) { stu.avatar = item.e; }
      else if ((stu.games.coins || 0) >= item.cost) { stu.games.coins -= item.cost; stu.games.ownedAvatars.push(item.e); stu.avatar = item.e; confetti(['🎉']); }
      else { toast('Not enough coins yet!'); return; }
      persist(); go('shop');
    } }, [
      el('div', { class: 'shop-em' }, item.e),
      el('div', { class: 'shop-tag' }, equipped ? 'Equipped' : owned ? 'Wear' : `🪙${item.cost}`),
    ]));
  });
  av.append(ag);
  wrap.append(av);

  const th = el('div', { class: 'card' });
  th.append(el('h3', {}, '🎨 Themes'));
  const tg = el('div', { class: 'shop-grid' });
  SHOP_THEMES.forEach(t => {
    const owned = t.cost === 0 || (stu.games.ownedThemes || []).includes(t.name);
    const equipped = (stu.games.theme && stu.games.theme.p === t.p) || (!stu.games.theme && t.cost === 0);
    tg.append(el('button', { class: 'shop-cell ' + (equipped ? 'equipped' : ''), onclick: () => {
      if (owned) { stu.games.theme = { p: t.p, d: t.d }; }
      else if ((stu.games.coins || 0) >= t.cost) { stu.games.coins -= t.cost; (stu.games.ownedThemes || (stu.games.ownedThemes = [])).push(t.name); stu.games.theme = { p: t.p, d: t.d }; confetti(['🎨']); }
      else { toast('Not enough coins yet!'); return; }
      applyTheme(stu); persist(); go('shop');
    } }, [
      el('div', { class: 'theme-swatch', style: `background:${t.p}` }),
      el('div', { class: 'shop-tag' }, equipped ? 'On' : owned ? 'Use' : `🪙${t.cost}`),
      el('div', { class: 'theme-nm' }, t.name),
    ]));
  });
  th.append(tg);
  wrap.append(th);

  // real-world rewards — parent honors these
  const pk = el('div', { class: 'card' });
  pk.append(el('h3', {}, '🎟 Real rewards'));
  pk.append(el('p', { class: 'muted' }, 'Trade coins for real-life prizes. When you buy one, it goes to your parent to make it happen!'));
  SHOP_PERKS.forEach(perk => {
    const afford = (stu.games.coins || 0) >= perk.cost;
    pk.append(el('div', { class: 'perk-row' }, [
      el('div', { class: 'perk-e' }, perk.e),
      el('div', { class: 'perk-mid' }, [el('div', { class: 'perk-nm' }, perk.name), el('div', { class: 'muted' }, `🪙 ${perk.cost.toLocaleString()}`)]),
      el('button', { class: 'mini' + (afford ? ' claim' : ''), onclick: () => {
        if (!afford) { toast(`Keep earning — ${(perk.cost - (stu.games.coins || 0)).toLocaleString()} coins to go!`); return; }
        if (!window.confirm(`Spend ${perk.cost.toLocaleString()} coins on "${perk.name}"?`)) return;
        stu.games.coins -= perk.cost; (stu.games.coinLog = stu.games.coinLog || []).push({ t: now(), n: -perk.cost, src: `spent: ${perk.name}`, bal: stu.games.coins });
        (stu.games.perks = stu.games.perks || []).push({ id: perk.id, e: perk.e, name: perk.name, cost: perk.cost, ts: now(), honored: false });
        persist(); confetti(['🎟', '🎉', perk.e]); toast(`${perk.e} Bought! Ask your parent to make it happen!`); go('shop');
      } }, afford ? 'Buy' : '🔒'),
    ]));
  });
  wrap.append(pk);

  wrap.append(el('button', { class: 'btn ghost wide', onclick: () => go('profile') }, '← Back'));
  return wrap;
}

/* ----------------------------- LEADERBOARD ------------------------------- */
function renderLeaderboard() {
  const me = STATE.currentUserId;
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(STATE.students[me], true));
  wrap.append(el('div', { class: 'card' }, [el('h2', {}, '🏆 Class leaderboard'), el('p', { class: 'muted' }, 'This week, by XP')]));
  const rows = Object.values(STATE.students).slice().sort((a, b) => (b.games.xp || 0) - (a.games.xp || 0));
  const board = el('div', { class: 'card' });
  rows.forEach((s, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
    board.append(el('div', { class: 'lb-row ' + (s.id === me ? 'me' : '') }, [
      el('div', { class: 'lb-rank' }, medal),
      el('div', { class: 'lb-av' }, s.avatar),
      el('div', { class: 'lb-nm' }, s.name + (s.id === me ? ' (you)' : '')),
      el('div', { class: 'lb-xp' }, `${s.games.xp || 0} XP`),
    ]));
  });
  wrap.append(board);
  wrap.append(el('button', { class: 'btn ghost wide', onclick: () => go('profile') }, '← Back'));
  return wrap;
}

/* =========================== v2: TEACH · REVIEW · FAST ==================== */
function skillLoc(skillId) {
  for (let ci = 0; ci < CURRICULUM.units.length; ci++) {
    const u = CURRICULUM.units[ci]; const si = u.skills.findIndex(s => s.id === skillId);
    if (si >= 0) return { ch: ci + 1, sec: si + 1, unit: u, skill: u.skills[si] };
  }
  return null;
}
function sectionRef(skillId) { const l = skillLoc(skillId); return l ? `§${l.ch}.${l.sec}` : ''; }
function recordMiss(stu, skill, item, studentAns) {
  stu.misses.unshift({ ts: now(), skillId: skill.id, unitId: skill.unitId, prompt: item.prompt, answer: String(item.answer), studentAnswer: String(studentAns), explanation: item.explanation || '', reviewed: false, assigned: false });
  if (stu.misses.length > 120) stu.misses.length = 120;
}
function assignLikeThis(stu, skillId, count) { stu.assignments.unshift({ id: 'a' + now() + '_' + Math.floor(Math.random() * 9999), skillId, total: count, remaining: count, correct: 0, ts: now(), status: 'assigned' }); }
function openAssignment(stu, skillId) { return stu.assignments.find(a => a.skillId === skillId && a.status !== 'done'); }

// FAST readiness + recency/decay (a modeled estimate, not a promised score)
function lastPracticed(stu, skillId) { let t = 0; for (const l of stu.log) if (l.skillId === skillId && l.ts > t) t = l.ts; return t; }
function skillStrength(stu, skillId) {
  const p = stu.progress[skillId]; if (!p || !p.attempts) return 0;
  if (p.masteredAt) { const lp = lastPracticed(stu, skillId) || p.masteredAt; const days = (now() - lp) / DAY; return Math.max(0.35, Math.min(1, 1 - days / 56)); }
  return Math.min(0.85, (p.score || 0) / 100);
}
function overallReadiness(stu) { const a = ALL_SKILLS.map(s => skillStrength(stu, s.id)); return a.reduce((x, y) => x + y, 0) / a.length; }
function unitReadiness(stu, unit) { const a = unit.skills.map(s => skillStrength(stu, s.id)); return a.reduce((x, y) => x + y, 0) / a.length; }
function projectedBand(stu) { const r = overallReadiness(stu); return { band: Math.max(1, Math.min(5, 1 + Math.round(r * 4))), r }; }
function fadedSkills(stu) { return ALL_SKILLS.filter(s => stu.progress[s.id]?.masteredAt && skillStrength(stu, s.id) < 0.6); }
function suggestions(stu, n) { return ALL_SKILLS.map(s => ({ s, str: skillStrength(stu, s.id) })).sort((a, b) => a.str - b.str).slice(0, n || 3); }
function startSkill(skillId) {
  const stu = STATE.students[STATE.currentUserId];
  if (!stu.games.taught[skillId]) go('lesson', { skill: skillId, then: 'practice' });
  else { PRACTICE = null; go('practice', { skill: skillId }); }
}

/* --------------------- LESSON (animated + narrated) ---------------------- */
const LESSON_MASCOT = { g2: '🦖', g3: '🦕', g5: '🦉', g6: '🦉', sci5: '🧪' };
let VOICE_ON = true; // session preference for read-aloud
function speakLesson(text) {
  try {
    if (!window.speechSynthesis) return;
    const clean = String(text)
      .replace(/[✅✋🏆⚖️🎬📖🔑⚠️💡🦖🦕🦉🧪🐜🍕🎲🚀🐱🐶▶←→]/g, ' ')
      .replace(/−/g, ' minus ').replace(/\+/g, ' plus ').replace(/×/g, ' times ').replace(/÷/g, ' divided by ')
      .replace(/=/g, ' equals ').replace(/≈/g, ' is about ')
      .replace(/(\d)\/(\d)/g, '$1 out of $2').replace(/¢/g, ' cents').replace(/\$(\d)/g, '$1 dollars ');
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.92; u.pitch = 1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { /* device without speech support */ }
}
function stopSpeech() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} }
function lessonContent(skillId, loc) {
  const th = THEORY[skillId]; // authored per-skill lesson (if one exists)
  if (th && th.concept) return { concept: th.concept, steps: th.worked || [], vocab: th.vocab || [], misconception: th.misconception, why: th.why, canRegen: false };
  if (typeof buildLesson === 'function') { // authored per-generator explained lesson (covers all of Grade 2)
    const L = buildLesson(loc.skill);
    if (L && L.steps.length) return { ...L, canRegen: true };
  }
  const ex = generateItem(loc.skill.gen, loc.skill); // fallback: synthesize from a worked example
  return { concept: `In this section you'll practice: ${loc.skill.name}. Watch the example, then try it yourself.`,
    steps: [`Example — ${ex.prompt}`, ex.explanation || `The answer is ${ex.answer}.`],
    vocab: [], misconception: 'Work one step at a time and check your answer before moving on.',
    why: `This builds toward the rest of ${loc.unit.name}.`, canRegen: true };
}
function renderLesson() {
  const skillId = VIEW.skill; const loc = skillLoc(skillId);
  const lesson = lessonContent(skillId, loc);
  const isParent = !!STATE.parents[STATE.currentUserId];
  const stu = isParent ? STATE.students[VIEW.child] : STATE.students[STATE.currentUserId];
  const u = loc.unit;
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(isParent ? STATE.parents[STATE.currentUserId] : stu, true, isParent));
  const card = el('div', { class: 'card lesson' });
  card.append(el('div', { class: 'chip', style: `background:${u.color}22;color:${u.color}` }, `${sectionRef(skillId)} · ${u.name}`));
  card.append(el('h2', {}, '📖 ' + loc.skill.name));

  // the mascot teaches the idea first
  card.append(el('div', { class: 'mascot-row' }, [
    el('div', { class: 'mascot' }, LESSON_MASCOT[ACTIVE_GRADE] || '🦉'),
    el('div', { class: 'bubble' }, lesson.concept || ''),
  ]));
  if (window.speechSynthesis) {
    const vt = el('button', { class: 'mini' }, VOICE_ON ? '🔊 Voice on' : '🔇 Voice off');
    vt.onclick = () => { VOICE_ON = !VOICE_ON; vt.textContent = VOICE_ON ? '🔊 Voice on' : '🔇 Voice off'; if (!VOICE_ON) stopSpeech(); };
    card.append(el('div', { class: 'voice-row' }, [
      el('button', { class: 'mini', onclick: () => speakLesson(lesson.concept) }, '▶ Read it to me'),
      vt,
    ]));
  }

  // animated step-by-step worked example — steps appear one tap at a time
  const box = el('div', { class: 'lesson-box' });
  box.append(el('h4', {}, '🎬 Watch how it works'));
  const stepsWrap = el('div', {});
  const ctl = el('div', { class: 'answer-row lesson-ctl' });
  box.append(stepsWrap, ctl);
  card.append(box);

  let steps = (lesson.steps || []).slice(), idx = 0, finished = false;
  const nextBtn = el('button', { class: 'btn primary' }, '▶ Show me');
  const againBtn = el('button', { class: 'btn ghost' }, '🔁 Another example');
  let startBtn = null;
  const finish = () => {
    finished = true;
    if (startBtn) { startBtn.disabled = false; startBtn.classList.add('pulse'); startBtn.textContent = 'Got it — start practice ▶'; }
  };
  const reveal = () => {
    if (idx >= steps.length) return;
    const s = steps[idx];
    stepsWrap.querySelectorAll('.wstep').forEach(r => r.classList.remove('now'));
    stepsWrap.append(el('div', { class: 'wstep reveal now' }, [el('span', { class: 'wnum' }, String(idx + 1)), el('span', {}, s)]));
    if (VOICE_ON) speakLesson(s);
    idx++;
    if (idx >= steps.length) {
      nextBtn.remove();
      if (lesson.canRegen && !ctl.contains(againBtn)) ctl.prepend(againBtn);
      finish();
    } else {
      nextBtn.textContent = `Next step ▶  (${idx}/${steps.length})`;
    }
  };
  nextBtn.onclick = reveal;
  againBtn.onclick = () => {
    stopSpeech();
    const fresh = lessonContent(skillId, loc);
    steps = fresh.steps.slice(); idx = 0;
    stepsWrap.innerHTML = ''; againBtn.remove();
    nextBtn.textContent = '▶ Show me'; ctl.append(nextBtn);
  };
  ctl.append(nextBtn);

  if (lesson.vocab && lesson.vocab.length) {
    const v = el('div', { class: 'lesson-box' }); v.append(el('h4', {}, '🔑 Key words'));
    lesson.vocab.forEach(x => v.append(el('div', { class: 'vrow' }, [el('b', {}, x.t + ': '), el('span', {}, x.d)])));
    card.append(v);
  }
  card.append(el('div', { class: 'lesson-warn' }, [el('b', {}, '⚠️ Watch out: '), lesson.misconception || '']));
  card.append(el('div', { class: 'lesson-why' }, [el('b', {}, '💡 Why it matters: '), lesson.why || '']));

  if (!isParent && VIEW.then === 'practice') {
    startBtn = el('button', { class: 'btn primary big wide', disabled: '' }, '👀 Watch the steps first');
    startBtn.onclick = () => { if (!finished) return; stopSpeech(); stu.games.taught[skillId] = now(); persist(); PRACTICE = null; go('practice', { skill: skillId }); };
    card.append(startBtn);
    if (!steps.length) finish();
  } else {
    card.append(el('button', { class: 'btn ghost wide', onclick: () => { stopSpeech(); go(isParent ? 'parent-review' : 'student-home', isParent ? { child: stu.id } : {}); } }, '← Back'));
  }
  wrap.append(card);
  if (!isParent) wrap.append(navbar('practice'));
  return wrap;
}

/* ----------------------- PARENT: NEEDS-REVIEW FEED ----------------------- */
function renderParentReview() {
  const stu = STATE.students[VIEW.child];
  const wrap = el('div', { class: 'page parent-view' });
  wrap.append(topbar(STATE.parents[STATE.currentUserId], true, true));
  wrap.append(el('div', { class: 'card' }, [el('h2', {}, `📌 ${stu.name} — Needs review`), el('p', { class: 'muted' }, 'The exact questions missed. Review the concept together, then send 5 more like it.')]));
  const groups = {}; stu.misses.forEach(m => { (groups[m.skillId] = groups[m.skillId] || []).push(m); });
  const keys = Object.keys(groups);
  if (!keys.length) { wrap.append(el('div', { class: 'card' }, '🎉 Nothing to review — no recent misses!')); wrap.append(navbar('home', true)); return wrap; }
  keys.forEach(sid => {
    const loc = skillLoc(sid); const ms = groups[sid];
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'rev-head' }, [el('span', { class: 'chip', style: `background:${loc.unit.color}22;color:${loc.unit.color}` }, `${sectionRef(sid)} · ${loc.unit.name}`), el('b', {}, loc.skill.name), el('span', { class: 'muted' }, `${ms.length} missed`)]));
    ms.slice(0, 3).forEach(m => card.append(el('div', { class: 'miss' }, [
      el('div', { class: 'miss-q', html: m.prompt }),
      el('div', { class: 'miss-a' }, [el('span', { class: 'wrongtag' }, `answered: ${m.studentAnswer}`), el('span', { class: 'righttag' }, `correct: ${m.answer}`)]),
      m.explanation ? el('div', { class: 'miss-ex' }, m.explanation) : null,
    ])));
    const asg = openAssignment(stu, sid); const done = stu.assignments.find(a => a.skillId === sid && a.status === 'done');
    card.append(el('div', { class: 'answer-row' }, [
      el('button', { class: 'btn ghost', onclick: () => go('lesson', { skill: sid, child: stu.id }) }, '📖 Review concept'),
      asg ? el('span', { class: 'badge warn' }, `assigned · ${asg.total - asg.remaining}/${asg.total}`)
        : el('button', { class: 'btn primary', onclick: () => { assignLikeThis(stu, sid, 5); ms.forEach(m => m.assigned = true); persist(); toast('✅ 5 questions sent to ' + stu.name); go('parent-review', { child: stu.id }); } }, '🔁 Assign 5 like this'),
    ]));
    if (done) card.append(el('div', { class: 'badge good', style: 'margin-top:8px' }, `✓ practiced ${done.correct}/${done.total} correct`));
    wrap.append(card);
  });
  wrap.append(navbar('home', true));
  return wrap;
}

/* --------------------------- FAST PRACTICE TEST -------------------------- */
let FAST = null;
function startFast() { FAST = { i: 0, n: 10, correct: 0, item: gameItem(), answers: [] }; go('fast'); }
function fastAnswer(choice, btn) {
  if (FAST.locked) return; FAST.locked = true;
  const stu = STATE.students[STATE.currentUserId];
  const ok = choice === FAST.item.answer;
  if (ok) { FAST.correct++; if (btn) btn.classList.add('right'); } else { recordMiss(stu, FAST.item.skill, FAST.item, choice); if (btn) btn.classList.add('wrong'); }
  handleAnswer(stu, FAST.item.skill, ok, 5); persist();
  setTimeout(() => { FAST.locked = false; FAST.i++; if (FAST.i >= FAST.n) { FAST.done = true; } else { FAST.item = gameItem(); } go('fast'); }, ok ? 250 : 550);
}
function renderFast() {
  const stu = STATE.students[STATE.currentUserId];
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(stu, true));
  if (!FAST) {
    wrap.append(el('div', { class: 'card game-splash' }, [el('div', { class: 'game-logo' }, '📋'), el('h2', {}, 'FAST Practice Test'),
      el('p', { class: 'muted' }, '10 mixed questions, just like the Florida FAST. Do your best — misses go to your review list.'),
      el('button', { class: 'btn primary big', onclick: startFast }, '▶ Start test')]));
    wrap.append(navbar('play')); return wrap;
  }
  if (FAST.done) {
    const pct = Math.round(100 * FAST.correct / FAST.n); const band = pct >= 95 ? 5 : pct >= 80 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : 1;
    FAST = null;
    wrap.append(el('div', { class: 'card game-splash' }, [el('div', { class: 'game-logo' }, pct >= 70 ? '🎉' : '💪'), el('h2', {}, `You scored ${pct}%`),
      el('div', { class: 'fast-band' }, `Projected FAST level: ${band} / 5`),
      el('p', { class: 'muted' }, 'Estimate only. Missed questions were added to your review list to practice.'),
      el('div', { class: 'answer-row', style: 'justify-content:center' }, [el('button', { class: 'btn primary', onclick: startFast }, '↻ Again'), el('button', { class: 'btn ghost', onclick: () => go('play-hub') }, 'Done')])]));
    wrap.append(navbar('play')); return wrap;
  }
  wrap.append(el('div', { class: 'card fast-prog' }, [el('b', {}, `Question ${FAST.i + 1} of ${FAST.n}`), el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${100 * FAST.i / FAST.n}%;background:var(--primary)` }))]));
  const q = el('div', { class: 'card game-card' });
  q.append(el('div', { class: 'q game-q', html: FAST.item.prompt }));
  const opts = el('div', { class: 'options game-opts' });
  FAST.item.choices.forEach(c => opts.append(el('button', { class: 'option', onclick: (e) => fastAnswer(c, e.currentTarget) }, c)));
  q.append(opts); wrap.append(q);
  wrap.append(navbar('play'));
  return wrap;
}
function heatmap(stu) {
  const grid = el('div', { class: 'heatmap' });
  ALL_SKILLS.forEach(s => { const st = skillStrength(stu, s.id); const cls = st >= 0.8 ? 'h4' : st >= 0.55 ? 'h3' : st >= 0.3 ? 'h2' : st > 0 ? 'h1' : 'h0'; const faded = stu.progress[s.id]?.masteredAt && st < 0.6; grid.append(el('div', { class: 'hcell ' + cls + (faded ? ' faded' : ''), title: `${s.name} · ${Math.round(st * 100)}%` })); });
  return grid;
}

/* --------------------- COACH'S REPORT (parent analysis) ------------------ */
function coachReport(stu) {
  const pace = subjectPace(stu);
  const wk = reportFor(stu, 'week');
  const elapsed = Math.max(1, daysBetween(stu.plan.start, now()));
  const rate = pace.mastered / elapsed;                 // actual skills/day
  const remaining = pace.total - pace.mastered;
  const toTarget = Math.max(0, daysBetween(now(), stu.plan.target));
  const lines = [];
  let headline;

  if (pace.mastered === 0) {
    headline = `Jayden is just getting started — 0 of ${pace.total} skills so far.`;
    lines.push(`🎯 First goal: master a few skills in ${CURRICULUM.units[0].name} this week to build momentum. To finish on time he needs about ${pace.perDay} skills/day.`);
  } else {
    const projDays = rate > 0 ? Math.round(remaining / rate) : null;
    headline = pace.daysDelta >= 0 ? `On track — about ${pace.daysDelta} day(s) ahead of the finish target. 🎉` : `Behind pace by about ${Math.abs(pace.daysDelta)} day(s).`;
    if (projDays != null) lines.push(`📈 At his current rate (${round(rate, 1)} skills/day) he'd finish the whole department in ~${projDays} days${projDays <= toTarget ? ' — beating the 2-month goal!' : ' — a little past the 2-month goal.'}`);
  }
  if (wk.attempts > 0) lines.push(`⚡ This week: ${wk.attempts} questions, ${wk.accuracy}% correct, ${wk.masteredCount} new skill(s) mastered.`);

  // strongest / weakest touched units
  const touched = CURRICULUM.units.map(u => ({ u, s: unitReadiness(stu, u), att: u.skills.reduce((a, sk) => a + (stu.progress[sk.id]?.attempts || 0), 0) })).filter(x => x.att > 0);
  if (touched.length) {
    const best = touched.slice().sort((a, b) => b.s - a.s)[0];
    const worst = touched.slice().sort((a, b) => a.s - b.s)[0];
    lines.push(`💪 Strongest so far: ${best.u.name}.`);
    if (worst.u.id !== best.u.id && worst.s < 0.65) lines.push(`🔧 Needs the most work: ${worst.u.name}.`);
  }
  // most-missed skill
  if (stu.misses.length) {
    const g = {}; stu.misses.forEach(m => g[m.skillId] = (g[m.skillId] || 0) + 1);
    const top = Object.entries(g).sort((a, b) => b[1] - a[1])[0];
    const loc = skillLoc(top[0]);
    if (loc) lines.push(`❌ Most-missed: “${loc.skill.name}” (${top[1]}×) — worth reviewing the concept and re-practicing.`);
  }
  const stretchN = ALL_SKILLS.filter(s => stu.progress[s.id]?.stretch?.masteredAt).length;
  if (stretchN) lines.push(`🔥 Reached ${stLbl()} (above grade level) in ${stretchN} skill${stretchN > 1 ? 's' : ''} — ready to be stretched further.`);
  const faded = fadedSkills(stu);
  if (faded.length) lines.push(`⏳ ${faded.length} mastered topic(s) are starting to fade — a quick refresh keeps them sharp for the FAST test.`);
  const streak = stu.games.streak?.count || 0;
  lines.push(streak >= 2 ? `🔥 ${streak}-day streak — consistency is the #1 driver of speed. Keep it going.` : `📅 Build a daily streak — even one focused hour a day compounds fast.`);

  const sug = suggestions(stu, 3).filter(x => x.str < 0.9);
  return { headline, lines, sug };
}
/* ------------------------- "Ready to move up" flow ----------------------- */
function nextGrade(g) { return { g2: 'g3', g5: 'g6' }[g] || null; }
function gradeLabel(id) { const g = GRADES.find(x => x.id === id); return g ? g.label : id; }
function readyToMoveUp(stu) {
  if (!nextGrade(stu.grade)) return false;
  const st = playerStats(stu);
  return st.stretchMastered >= 12 || (ALL_SKILLS.length && st.mastered / ALL_SKILLS.length >= 0.6 && st.stretchMastered >= 5);
}
function moveUp(stu) {
  const ng = nextGrade(stu.grade); if (!ng) return;
  stu.grade = ng;
  stu.plan = { start: startOfDay(now()), target: startOfDay(now() + 60 * DAY), daysPerWeek: stu.plan.daysPerWeek || 7, hoursPerDay: stu.plan.hoursPerDay || 1 };
  PRACTICE = null; persist();
  confetti(['🎓', '🚀', '🌟', '🔥']); toast(`🎓 ${stu.name} moved up to ${gradeLabel(ng)}!`);
  go('parent-child', { child: stu.id });
}
function renderPerkCard(stu) {
  const pending = (stu.games.perks || []).filter(p => !p.honored);
  if (!pending.length) return null;
  const card = el('div', { class: 'card perk-honor-card' });
  card.append(el('h3', {}, `🎟 Rewards to honor (${pending.length})`));
  card.append(el('p', { class: 'muted' }, `${stu.name} spent hard-earned coins on these real-life rewards:`));
  pending.forEach(p => card.append(el('div', { class: 'perk-row' }, [
    el('div', { class: 'perk-e' }, p.e),
    el('div', { class: 'perk-mid' }, [el('div', { class: 'perk-nm' }, p.name), el('div', { class: 'muted' }, `bought ${new Date(p.ts).toLocaleDateString()} · 🪙${p.cost.toLocaleString()}`)]),
    el('button', { class: 'mini claim', onclick: () => { p.honored = true; persist(); toast('✅ Honored!'); go('parent-child', { child: stu.id }); } }, '✓ Done'),
  ])));
  return card;
}
function renderRewardCard(stu) {
  const card = el('div', { class: 'card reward-card' });
  const give = (n, set) => {
    const label = set ? `Set ${stu.name}'s coins to ${n.toLocaleString()}?` : `Give ${stu.name} ${n.toLocaleString()} bonus coins?`;
    if (!window.confirm(label)) return;                       // confirm every bonus so it can't be spam-tapped
    const before = stu.games.coins || 0; const delta = set ? (n - before) : n;
    stu.games.coins = set ? n : before + n;
    awardCoins(stu, 0); (stu.games.coinLog = stu.games.coinLog || []).push({ t: now(), n: delta, src: '🎁 parent bonus', bal: stu.games.coins });
    persist(); confetti(['🪙', '🎉', '⭐']); toast(`🪙 ${stu.name} now has ${stu.games.coins.toLocaleString()} coins!`); go('parent-child', { child: stu.id });
  };
  card.append(el('div', { class: 'reward-top' }, [el('h3', {}, '🎁 Give a bonus'), el('div', { class: 'reward-coins' }, `🪙 ${(stu.games.coins || 0).toLocaleString()}`)]));
  card.append(el('p', { class: 'muted' }, `Reward ${stu.name} for working hard. (Each tap asks you to confirm.)`));
  card.append(el('div', { class: 'reward-btns' }, [
    el('button', { class: 'mini', onclick: () => give(100) }, '+100'),
    el('button', { class: 'mini', onclick: () => give(500) }, '+500'),
    el('button', { class: 'btn stretch-btn', onclick: () => give(1000, true) }, '🎁 Set to 1,000'),
    el('button', { class: 'btn ghost', onclick: () => give(0, true) }, '↺ Reset to 0'),
  ]));
  // coin history — see exactly where coins came from
  const log = (stu.games.coinLog || []).slice().reverse();
  if (log.length) {
    const totals = {}; (stu.games.coinLog || []).forEach(e => { if (e.n > 0) totals[e.src] = (totals[e.src] || 0) + e.n; });
    card.append(el('div', { class: 'restore-head' }, '🪙 Where coins came from (recent)'));
    Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([src, tot]) => card.append(el('div', { class: 'coinlog-sum' }, [el('span', {}, src), el('b', {}, '+' + tot.toLocaleString())])));
    card.append(el('div', { class: 'muted', style: 'margin-top:8px;font-size:11px' }, `Log started tracking from build 34 on — earlier coins aren't itemised. Last ${Math.min(log.length, 6)} changes:`));
    log.slice(0, 6).forEach(e => card.append(el('div', { class: 'coinlog-row' }, `${new Date(e.t).toLocaleString()} · ${e.n > 0 ? '+' : ''}${e.n} · ${e.src}`)));
  }
  return card;
}
function renderMoveUpCard(stu) {
  const st = playerStats(stu); const ng = nextGrade(stu.grade);
  const card = el('div', { class: 'card moveup-card' });
  card.append(el('div', { class: 'moveup-emoji' }, '🎓'));
  card.append(el('h3', {}, `${stu.name} is ready to move up!`));
  card.append(el('p', {}, `He's reached Grade 6 level in ${st.stretchMastered} skill${st.stretchMastered === 1 ? '' : 's'} and mastered most of ${gradeLabel(stu.grade)}. Ready to start the real ${gradeLabel(ng)} curriculum?`));
  let armed = false;
  const btn = el('button', { class: 'btn primary big wide', onclick: () => {
    if (!armed) { armed = true; btn.textContent = `✓ Yes — move ${stu.name} up to ${gradeLabel(ng)}`; return; }
    moveUp(stu);
  } }, `🚀 Move up to ${gradeLabel(ng)}`);
  card.append(btn);
  card.append(el('p', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `His ${gradeLabel(stu.grade)} progress is saved — you can switch him back anytime in Edit plan.`));
  return card;
}
function renderCoachCard(stu) {
  const r = coachReport(stu);
  const card = el('div', { class: 'card coach-card' });
  card.append(el('div', { class: 'coach-head' }, [el('span', { class: 'coach-ic' }, '🧭'), el('h3', {}, "Coach's Report"), el('span', { class: 'coach-live' }, 'live')]));
  card.append(el('div', { class: 'coach-headline' }, r.headline));
  const box = el('div', { class: 'coach-lines' });
  r.lines.forEach(l => box.append(el('div', { class: 'coach-line' }, l)));
  card.append(box);
  if (r.sug.length) {
    card.append(el('div', { class: 'sug-head' }, '👉 Recommended this week:'));
    r.sug.forEach(x => { const loc = skillLoc(x.s.id); card.append(el('div', { class: 'sug-row' }, [
      el('span', { class: 'chip', style: `background:${loc.unit.color}22;color:${loc.unit.color}` }, sectionRef(x.s.id)),
      el('span', { class: 'sug-nm' }, x.s.name),
      el('button', { class: 'mini', onclick: () => { assignLikeThis(stu, x.s.id, 5); persist(); toast('✅ Sent to ' + stu.name); go('parent-child', { child: stu.id }); } }, 'Assign 5'),
    ])); });
  }
  return card;
}

/* ------------------------------ dark mode -------------------------------- */
function isDark() { try { return localStorage.getItem('ascend_dark') === '1'; } catch (e) { return false; } }
function applyDark() { document.documentElement.dataset.theme = isDark() ? 'dark' : 'light'; }
function toggleDark() { try { localStorage.setItem('ascend_dark', isDark() ? '0' : '1'); } catch (e) {} applyDark(); render(); }

/* --------------------------- PARENT: PLAN EDITOR ------------------------- */
function renderPlanEditor() {
  const stu = STATE.students[VIEW.child];
  const wrap = el('div', { class: 'page parent-view' });
  wrap.append(topbar(STATE.parents[STATE.currentUserId], true, true));
  const p = stu.plan;
  const card = el('div', { class: 'card' });
  card.append(el('h2', {}, `⚙️ ${stu.name}'s plan`));
  card.append(el('p', { class: 'muted' }, 'Set the finish target and weekly schedule. Pace (ahead/behind) recalculates from this.'));
  const targetInp = el('input', { class: 'inp', type: 'date', value: new Date(p.target).toISOString().slice(0, 10) });
  const dpwInp = el('input', { class: 'inp', type: 'number', min: '1', max: '7', value: String(p.daysPerWeek) });
  const hpdInp = el('input', { class: 'inp', type: 'number', min: '0.5', max: '8', step: '0.5', value: String(p.hoursPerDay) });
  // grade selector
  card.append(el('label', { class: 'flabel' }, 'Grade level'));
  let grade = stu.grade;
  const grRow = el('div', { class: 'av-row' });
  const drawGr = () => { grRow.innerHTML = ''; GRADES.forEach(g => grRow.append(el('button', { class: 'grade-pick' + (g.id === grade ? ' on' : ''), onclick: () => { grade = g.id; drawGr(); } }, g.label))); };
  drawGr(); card.append(grRow);
  card.append(el('label', { class: 'flabel' }, 'Target finish date'), targetInp);
  card.append(el('label', { class: 'flabel' }, 'Days per week'), dpwInp);
  card.append(el('label', { class: 'flabel' }, 'Hours per day'), hpdInp);
  card.append(el('div', { class: 'answer-row' }, [
    el('button', { class: 'btn primary wide', onclick: () => {
      p.target = startOfDay(new Date(targetInp.value + 'T00:00:00').getTime());
      p.daysPerWeek = Math.max(1, Math.min(7, Number(dpwInp.value) || 5));
      p.hoursPerDay = Math.max(0.5, Number(hpdInp.value) || 1);
      if (grade !== stu.grade) { stu.grade = grade; PRACTICE = null; }
      persist(); go('parent-child', { child: stu.id });
    } }, 'Save plan'),
  ]));
  card.append(el('button', { class: 'btn ghost wide', onclick: () => go('parent-child', { child: stu.id }) }, 'Cancel'));
  wrap.append(card);
  return wrap;
}

/* ----------------------------- PARENT PORTAL ----------------------------- */
function paceStatus(stu, pace) {
  if (pace.mastered === 0) return { text: '🚀 Ready to start', cls: 'good' };
  if (pace.daysDelta >= 1) return { text: `🔥 ${pace.daysDelta} days ahead`, cls: 'good' };
  if (pace.daysDelta <= -1) return { text: `⏳ ${Math.abs(pace.daysDelta)} days behind`, cls: 'warn' };
  return { text: '✅ Right on pace', cls: 'good' };
}
function renderParentHome() {
  const par = STATE.parents[STATE.currentUserId];
  const wrap = el('div', { class: 'page parent-view' });
  wrap.append(topbar(par, false, true));
  wrap.append(el('div', { class: 'family-head' }, [el('h2', {}, '👨‍👩‍👧 Family dashboard'), el('p', { class: 'muted' }, 'Tap your child to see progress, pace, and the coach report.')]));
  const grid = el('div', { class: 'child-grid2' });
  par.childIds.forEach(id => {
    const stu = STATE.students[id]; if (!stu) return;
    // compute this child's pace IN THEIR OWN grade
    const { pace, subject } = withGrade(stu, () => ({ pace: subjectPace(stu), subject: CURRICULUM.subject }));
    const lv = levelInfo(stu.games.xp); const st = paceStatus(stu, pace);
    const tile = el('button', { class: 'child-tile', onclick: () => go('parent-child', { child: id }) });
    tile.append(el('div', { class: 'tile-top' }, [
      el('div', { class: 'tile-av' }, stu.avatar),
      el('div', { class: 'tile-id' }, [el('div', { class: 'tile-name' }, stu.name), el('div', { class: 'tile-sub' }, `${subject} · Lv ${lv.level}`)]),
    ]));
    tile.append(ring(pace.pct, 116, '#7048e8', 'mastered'));
    tile.append(el('span', { class: 'badge ' + st.cls, style: 'font-size:14px;padding:7px 16px' }, st.text));
    tile.append(el('div', { class: 'tile-stats' }, [
      el('div', { class: 'tile-stat' }, [el('b', {}, `${pace.mastered}/${pace.total}`), el('span', {}, 'skills mastered')]),
      el('div', { class: 'tile-stat' }, [el('b', {}, `🔥 ${stu.games.streak?.count || 0}`), el('span', {}, 'day streak')]),
    ]));
    tile.append(el('div', { class: 'tile-cta' }, `View ${stu.name}'s dashboard →`));
    grid.append(tile);
  });
  wrap.append(grid);
  wrap.append(el('button', { class: 'btn ghost wide', onclick: () => go('parent-add') }, '➕ Add a child'));

  // data & backup
  const data = el('div', { class: 'card data-card' });
  data.append(el('h3', {}, '💾 Data & backup'));
  data.append(el('p', { class: 'muted' }, 'Progress auto-saves (two local copies + cloud), and the app keeps recent restore points below. For extra safety, download a backup after a good session.'));
  const fileInp = el('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: (e) => { if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]); } });
  data.append(el('div', { class: 'answer-row' }, [
    el('button', { class: 'btn primary', onclick: exportBackup }, '⬇ Download backup'),
    el('button', { class: 'btn ghost', onclick: () => fileInp.click() }, '⬆ Restore backup'),
  ]));
  data.append(fileInp);
  // sync status: make cloud state visible instead of failing silently
  const syncBox = el('div', { class: 'sync-box' });
  data.append(syncBox);
  paintSyncStatus(syncBox);

  // restore points: recent (rolling ~20 min) + one per day for ~10 days
  const addRows = (list, title) => {
    if (!list.length) return;
    data.append(el('div', { class: 'restore-head' }, title));
    list.forEach(snap => {
      const when = new Date(snap.t).toLocaleString();
      data.append(el('div', { class: 'restore-row' }, [
        el('div', { class: 'restore-mid' }, [el('div', { class: 'restore-when' }, when), el('div', { class: 'muted' }, snapshotSummary(snap))]),
        el('button', { class: 'mini', onclick: () => { if (window.confirm('Restore this version? It replaces the current progress everywhere once this device syncs.')) restoreSnapshot(snap); } }, 'Restore'),
      ]));
    });
  };
  addRows(historyList().slice().reverse(), '⏱ Restore an earlier version (today)');
  const todayK = dayKey(now());
  addRows(dailyRestoreList().slice().reverse().filter(d => d.d !== todayK), '📅 End-of-day restore points');
  wrap.append(data);

  wrap.append(navbar('home', true));
  return wrap;
}

function renderAddChild() {
  const par = STATE.parents[STATE.currentUserId];
  const wrap = el('div', { class: 'page parent-view' });
  wrap.append(topbar(par, true, true));
  wrap.append(el('div', { class: 'card' }, [el('h2', {}, '➕ Add a child'), el('p', { class: 'muted' }, 'Each child gets their own grade, progress, games, and dashboard — all under this one family login.')]));
  const card = el('div', { class: 'card' });
  const name = el('input', { class: 'inp', placeholder: "Child's name" });
  card.append(el('label', { class: 'field-lbl' }, 'Name'));
  card.append(name);
  card.append(el('label', { class: 'field-lbl' }, 'Avatar'));
  let avatar = '🦖';
  const avs = ['🦖', '🦊', '🐼', '🚀', '🦄', '🐲', '🤖', '🦁', '🎨', '⚽'];
  const avRow = el('div', { class: 'av-row' });
  const drawAv = () => { avRow.innerHTML = ''; avs.forEach(a => avRow.append(el('button', { class: 'av-pick' + (a === avatar ? ' on' : ''), onclick: () => { avatar = a; drawAv(); } }, a))); };
  drawAv(); card.append(avRow);
  card.append(el('label', { class: 'field-lbl' }, 'Grade'));
  let grade = 'g2';
  const grRow = el('div', { class: 'av-row' });
  const drawGr = () => { grRow.innerHTML = ''; GRADES.forEach(g => grRow.append(el('button', { class: 'grade-pick' + (g.id === grade ? ' on' : ''), onclick: () => { grade = g.id; drawGr(); } }, g.label))); };
  drawGr(); card.append(grRow);
  const msg = el('div', { class: 'msg' });
  card.append(msg);
  card.append(el('button', { class: 'btn primary wide', onclick: () => {
    const nm = name.value.trim();
    if (!nm) { msg.textContent = 'Please enter a name.'; return; }
    const id = 'stu_' + Math.random().toString(36).slice(2, 9);
    STATE.students[id] = blankStudent(id, nm, avatar, grade); par.childIds.push(id);
    persist(); toast(`✅ ${nm} added!`); go('parent-child', { child: id });
  } }, '✓ Add child'));
  wrap.append(card);
  wrap.append(navbar('home', true));
  return wrap;
}

function renderParentChild() {
  const stu = STATE.students[VIEW.child];
  const period = VIEW.period || 'week';
  const pace = subjectPace(stu);
  const r = reportFor(stu, period);
  const wrap = el('div', { class: 'page parent-view' });
  wrap.append(topbar(STATE.parents[STATE.currentUserId], true, true));
  wrap.append(el('div', { class: 'card' }, [
    el('h2', {}, `${stu.avatar} ${stu.name} — ${CURRICULUM.subject}`),
    el('div', { class: 'muted' }, CURRICULUM.standard),
    el('div', { class: 'pace-line' }, [
      pace.daysDelta >= 0 ? el('span', { class: 'badge good' }, `${pace.daysDelta} days ahead of schedule` ) : el('span', { class: 'badge warn' }, `${Math.abs(pace.daysDelta)} days behind schedule`),
      el('span', { class: 'muted' }, `Target: finish by ${fmtDate(stu.plan.target)} · ${stu.plan.daysPerWeek} days/wk · ${stu.plan.hoursPerDay}h/day`),
    ]),
    el('div', { class: 'pace-track' }, [
      el('div', { class: 'pace-fill', style: `width:${pace.pct}%` }),
      el('div', { class: 'pace-expected', style: `left:${Math.round(100 * pace.expected / pace.total)}%`, title: 'expected today' }),
    ]),
    el('div', { class: 'legend' }, [el('span', {}, `● actual ${pace.mastered}`), el('span', { class: 'muted' }, `▮ expected ${pace.expected}`)]),
  ]));

  // Coach's Report — written analysis + recommendations
  wrap.append(renderCoachCard(stu));
  const perkCard = renderPerkCard(stu); if (perkCard) wrap.append(perkCard);
  if (readyToMoveUp(stu)) wrap.append(renderMoveUpCard(stu));
  wrap.append(goalCard(stu));
  wrap.append(renderRewardCard(stu));

  // quick actions
  const nReview = stu.misses.length;
  wrap.append(el('div', { class: 'card action-row' }, [
    el('button', { class: 'btn primary', onclick: () => go('parent-review', { child: stu.id }) }, `📌 Needs review${nReview ? ' (' + nReview + ')' : ''}`),
    el('button', { class: 'btn ghost', onclick: () => go('parent-plan', { child: stu.id }) }, '⚙️ Edit plan'),
  ]));

  // FAST readiness
  const pb = projectedBand(stu); const faded = fadedSkills(stu); const sug = suggestions(stu, 3);
  const fastCard = el('div', { class: 'card' });
  fastCard.append(el('div', { class: 'fast-head' }, [el('h3', {}, '📋 FAST readiness'), el('span', { class: 'fast-band' }, `Projected level ${pb.band}/5`)]));
  fastCard.append(el('div', { class: 'muted', style: 'margin:-4px 0 8px' }, 'Modeled estimate from mastery + how recently each topic was practiced.'));
  fastCard.append(heatmap(stu));
  if (faded.length) fastCard.append(el('div', { class: 'fade-alert' }, `⏳ ${faded.length} topic${faded.length > 1 ? 's are' : ' is'} fading — a quick review would refresh ${faded.length > 1 ? 'them' : 'it'}.`));
  fastCard.append(el('div', { class: 'muted', style: 'margin-top:8px;font-size:12px' }, 'Each square is a skill: green = strong, yellow = shaky, grey = not started, striped = fading.'));
  wrap.append(fastCard);

  // period toggle
  const tog = el('div', { class: 'seg' });
  ['day', 'week', 'month'].forEach(pd => tog.append(el('button', { class: 'seg-btn ' + (pd === period ? 'on' : ''), onclick: () => go('parent-child', { child: stu.id, period: pd }) }, pd[0].toUpperCase() + pd.slice(1))));
  const stats = el('div', { class: 'stat-row' });
  stats.append(stat('Questions', `${r.attempts}`, period));
  stats.append(stat('Accuracy', `${r.accuracy}%`, 'correct'));
  stats.append(stat('Time', `${r.minutes}m`, 'on task'));
  stats.append(stat('Mastered', `${r.masteredCount}`, 'skills'));
  wrap.append(el('div', { class: 'card' }, [el('h3', {}, '📋 Report'), tog, stats]));

  // per-unit breakdown
  const bd = el('div', { class: 'card' });
  bd.append(el('h3', {}, '📚 By topic'));
  r.byUnit.forEach(u => {
    bd.append(el('div', { class: 'unit-report' }, [
      el('div', { class: 'ur-top' }, [el('span', {}, `${u.icon} ${u.name}`), el('span', { class: 'muted' }, `${u.correct}/${u.attempts} correct · ${Math.round(u.seconds / 60)}m · +${u.mastered} mastered`)]),
      el('div', { class: 'bar sm' }, el('div', { class: 'bar-fill', style: `width:${u.attempts ? 100 * u.correct / u.attempts : 0}%;background:${u.color}` })),
    ]));
  });
  wrap.append(bd);
  wrap.append(el('button', { class: 'btn ghost wide', onclick: () => go('parent-home') }, '← All children'));
  wrap.append(navbar('home', true));
  return wrap;
}

/* ------------------------------ SHARED UI -------------------------------- */
function stat(label, big, sub) { return el('div', { class: 'stat' }, [el('div', { class: 'stat-big' }, big), el('div', { class: 'stat-lbl' }, label), el('div', { class: 'stat-sub' }, sub)]); }
function topbar(user, back, parent) {
  return el('div', { class: 'topbar' }, [
    back ? el('button', { class: 'icon-btn', onclick: () => go(parent ? 'parent-home' : 'student-home') }, '←') : el('span', { class: 'brand' }, '⛰️ Ascend'),
    (!parent && user && user.games) ? el('button', { class: 'me-chip', onclick: () => go('profile') }, [el('span', { class: 'me-av' }, user.avatar), el('b', {}, 'Lv ' + levelInfo(user.games.xp).level), el('span', { class: 'me-coin' }, '🪙' + (user.games.coins || 0))]) : null,
    el('div', { class: 'grow' }),
    el('span', { class: 'build-tag', title: 'app version' }, 'v' + APP_BUILD),
    el('button', { class: 'chip-btn', onclick: toggleDark, title: 'Toggle dark mode' }, isDark() ? '☀️' : '🌙'),
    el('button', { class: 'chip-btn', onclick: exportBackup, title: 'Download a backup copy' }, '⬇'),
    el('button', { class: 'chip-btn', onclick: switchProfile, title: 'Switch profile' }, 'Switch'),
  ]);
}
function navbar(active, parent) {
  const items = parent ? [['home', '🏠', 'Family']] : [['home', '🏠', 'Home'], ['practice', '✏️', 'Practice'], ['play', '🎮', 'Play'], ['write', '✍️', 'Write'], ['progress', '📈', 'Progress']];
  const map = { home: parent ? 'parent-home' : 'student-home', practice: 'practice', play: 'play-hub', write: 'writing', progress: 'progress' };
  return el('div', { class: 'navbar' }, items.map(([k, ic, lb]) => el('button', { class: 'nav-item ' + (active === k ? 'on' : ''), onclick: () => { if (k === 'practice' && !parent) { const c = currentSkill(STATE.students[STATE.currentUserId]); return c ? startSkill(c.id) : go('practice'); } go(map[k]); } }, [el('div', { class: 'nav-ic' }, ic), el('div', {}, lb)])));
}

/* ------------------------------- ACTIONS --------------------------------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `ascend-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  toast('⬇ Backup downloaded');
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || !data.students) throw new Error('not an Ascend backup');
      STATE = data; Object.values(STATE.students).forEach(ensureStudentShape);
      persist();
      toast('✅ Backup restored');
      go(STATE.currentUserId ? (STATE.parents[STATE.currentUserId] ? 'parent-home' : 'student-home') : 'login');
    } catch (e) { toast('❌ That file is not a valid Ascend backup'); }
  };
  r.readAsText(file);
}
async function logout() { if (CLOUD && sb) await sb.auth.signOut(); AUTHED = false; STATE.currentUserId = null; try { localStorage.removeItem('ascend_route'); } catch (e) {} go('login'); }

/* -------------------------------- ROUTER --------------------------------- */
function render() {
  stopSprintTimer(); bossStopTimer(); stopRunner();
  const root = $('#app'); root.innerHTML = '';
  if (!STATE.currentUserId) return void root.append((CLOUD && AUTHED) ? renderPickProfile() : renderLogin());
  const isParent = !!STATE.parents[STATE.currentUserId];
  // bind the active curriculum to whichever student is in context (student self, or the parent's current child)
  const ctxStu = isParent ? STATE.students[VIEW.child] : STATE.students[STATE.currentUserId];
  setActiveGrade((ctxStu && ctxStu.grade) || 'g5');
  if (!isParent) applyTheme(STATE.students[STATE.currentUserId]); else applyTheme(null);
  const views = {
    'login': renderLogin, 'student-home': renderStudentHome, 'practice': renderPractice,
    'progress': renderProgress, 'writing': renderWriting, 'sprint': renderSprint, 'boss': renderBoss,
    'play-hub': renderPlayHub, 'profile': renderProfile, 'shop': renderShop, 'leaderboard': renderLeaderboard,
    'build': renderBuild, 'runner': renderRunner, 'lesson': renderLesson, 'fast': renderFast, 'parent-review': renderParentReview,
    'parent-home': renderParentHome, 'parent-child': renderParentChild, 'parent-plan': renderPlanEditor, 'parent-add': renderAddChild,
  };
  const studentOnly = ['student-home', 'practice', 'progress', 'writing', 'sprint', 'boss', 'play-hub', 'profile', 'shop', 'leaderboard', 'fast', 'build', 'runner'];
  let name = VIEW.name;
  if (isParent && studentOnly.includes(name)) name = 'parent-home';
  if (!isParent && name.startsWith('parent')) name = 'student-home';
  try {
    root.append((views[name] || renderStudentHome)());
  } catch (e) {
    console.error('render error on', name, e);
    root.append(el('div', { class: 'card', style: 'margin-top:40px' }, [
      el('h3', {}, '😵 This screen hit a snag'),
      el('p', { class: 'muted' }, 'screen: ' + name + ' — ' + String((e && e.message) || e)),
      el('button', { class: 'btn primary', onclick: () => go(isParent ? 'parent-home' : 'student-home') }, '← Back home'),
    ]));
  }
}

/* -------------------------------- BOOT ----------------------------------- */
function withGrade(stu, fn) { const prev = ACTIVE_GRADE; setActiveGrade((stu && stu.grade) || 'g5'); try { return fn(); } finally { setActiveGrade(prev); } }
function ensureStudentShape(stu) {
  stu.grade = CURRICULA[stu.grade] ? stu.grade : 'g5';
  stu.writing = stu.writing || []; stu.misses = stu.misses || []; stu.assignments = stu.assignments || [];
  const g = stu.games = stu.games || {};
  g.sprintBest = g.sprintBest || 0; g.xp = g.xp || 0; g.coins = g.coins || 0;
  g.streak = g.streak || { count: 0, last: null };
  g.badges = g.badges || []; g.ownedAvatars = g.ownedAvatars || [stu.avatar];
  g.bossCleared = g.bossCleared || {}; g.taught = g.taught || {}; g.runnerBest = g.runnerBest || 0; g.perks = g.perks || []; g.coinLog = g.coinLog || []; g.coinTick = g.coinTick || 0; if (!('theme' in g)) g.theme = null; if (!('dailies' in g)) g.dailies = null;
}

// keyboard: Enter submits (per-input); Space advances to the next question once answered
window.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.code === 'Space') && VIEW.name === 'practice' && PRACTICE && PRACTICE.locked && typeof PRACTICE.next === 'function') {
    e.preventDefault();
    PRACTICE.next();
  }
});

(async function boot() {
  applyDark();
  STATE = await Store.load();
  if (!STATE || !STATE.students) STATE = seedDemo();
  Object.values(STATE.students || {}).forEach(ensureStudentShape);
  if (CLOUD && sb) { const { data: { user } } = await sb.auth.getUser(); if (user) { AUTHED = true; } else { STATE.currentUserId = null; } }
  // "Continue where you were": restore the last route for this user
  let restored = null;
  try { const r = JSON.parse(localStorage.getItem('ascend_route') || 'null'); if (r && r.u === STATE.currentUserId && r.v && r.v.name && r.v.name !== 'login') restored = r.v; } catch (e) {}
  VIEW = STATE.currentUserId ? (restored || { name: STATE.parents[STATE.currentUserId] ? 'parent-home' : 'student-home' }) : { name: 'login' };
  render();
})();
