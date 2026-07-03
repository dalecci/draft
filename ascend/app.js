/* ============================================================================
   Ascend — app engine (auth, store + double-save, pacing, mastery, UI)
   Vanilla JS, no build step. Runs in DEMO mode out of the box; flips to REAL
   cloud (Supabase auth + sync) automatically when ascend-config.js has keys.
   ============================================================================ */

/* ------------------------------- CONFIG ---------------------------------- */
const CFG = window.ASCEND_CONFIG || {};
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
let sb = null;
if (CLOUD) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const LS_KEY = 'ascend_state_v1';
const LS_MIRROR = 'ascend_mirror_v1'; // the "double save" — a second local copy

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

function blankStudent(id, name, avatar) {
  return {
    id, name, avatar, role: 'student',
    plan: { start: startOfDay(now() - 28 * DAY), target: startOfDay(now() + 84 * DAY), daysPerWeek: 5, hoursPerDay: 1 },
    progress: {},   // skillId -> {score, attempts, correct, masteredAt}
    log: [],        // {ts, skillId, unitId, correct, seconds}
  };
}

/* ---------------- DEMO SEED (fake students, realistic history) ------------ */
function seedDemo() {
  const students = [
    blankStudent('stu_jayden', 'Jayden', '🏀'),
    blankStudent('stu_maya', 'Maya', '🎨'),
    blankStudent('stu_theo', 'Theo', '🚀'),
  ];
  // give each a different pace: Jayden ahead, Maya on pace, Theo behind
  const profiles = { stu_jayden: 0.72, stu_maya: 0.55, stu_theo: 0.33 };
  students.forEach(stu => {
    const frac = profiles[stu.id];
    const nMastered = Math.round(ALL_SKILLS.length * frac);
    // backfill activity across the last 28 days
    ALL_SKILLS.forEach((sk, i) => {
      const mastered = i < nMastered;
      const attempts = mastered ? randInt(10, 22) : (i === nMastered ? randInt(3, 8) : 0);
      const correct = mastered ? Math.round(attempts * (0.8 + Math.random() * 0.15)) : Math.round(attempts * 0.5);
      stu.progress[sk.id] = { score: mastered ? 100 : (attempts ? randInt(30, 75) : 0), attempts, correct, masteredAt: mastered ? startOfDay(now() - randInt(1, 26) * DAY) : null };
      for (let k = 0; k < attempts; k++) {
        stu.log.push({ ts: startOfDay(now() - randInt(0, 27) * DAY) + randInt(0, DAY - 1), skillId: sk.id, unitId: sk.unitId, correct: k < correct, seconds: randInt(25, 120) });
      }
    });
    stu.log.sort((a, b) => a.ts - b.ts);
  });
  const parent = { id: 'par_alex', name: 'Alex (Parent)', avatar: '👤', role: 'parent', childIds: students.map(s => s.id) };
  return { students: Object.fromEntries(students.map(s => [s.id, s])), parents: { par_alex: parent }, currentUserId: null };
}

/* ------------------------------- STORE ----------------------------------- */
// Double-save: every write goes to primary (cloud OR local) AND a local mirror.
const Store = {
  async load() {
    if (CLOUD && sb) {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data } = await sb.from('app_state').select('data').eq('user_id', user.id).maybeSingle();
        if (data && data.data) return data.data;
      }
    }
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return seedDemo();
  },
  async save(state) {
    const json = JSON.stringify(state);
    localStorage.setItem(LS_KEY, json);        // primary local
    localStorage.setItem(LS_MIRROR, json);     // second copy (the "double save")
    state._savedAt = now();
    if (CLOUD && sb) {
      const { data: { user } } = await sb.auth.getUser();
      if (user) await sb.from('app_state').upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() });
    }
    flashSaved();
  },
};
async function persist() { await Store.save(STATE); }

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
  if (p.score >= 100 && !p.masteredAt) p.masteredAt = now();
  stu.log.push({ ts: now(), skillId: skill.id, unitId: skill.unitId, correct, seconds });
}

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
function go(name, opts = {}) { VIEW = { name, ...opts }; render(); }

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

  if (CLOUD) {
    const email = el('input', { type: 'email', placeholder: 'Email', class: 'inp' });
    const pass = el('input', { type: 'password', placeholder: 'Password', class: 'inp' });
    const msg = el('div', { class: 'msg' });
    const doAuth = (mode) => async () => {
      msg.textContent = '…';
      const fn = mode === 'in' ? sb.auth.signInWithPassword : sb.auth.signUp;
      const { error } = await fn({ email: email.value, password: pass.value });
      if (error) { msg.textContent = error.message; return; }
      STATE = await Store.load(); if (!STATE.students) STATE = seedDemo();
      const stu = Object.values(STATE.students)[0]; STATE.currentUserId = stu.id; await persist(); go('student-home');
    };
    wrap.append(email, pass, el('button', { class: 'btn primary', onclick: doAuth('in') }, 'Log in'),
      el('button', { class: 'btn ghost', onclick: doAuth('up') }, 'Create account'), msg);
  } else {
    wrap.append(el('p', { class: 'demo-note' }, 'Demo mode — pick a profile to explore'));
    const grid = el('div', { class: 'profile-grid' });
    Object.values(STATE.students).forEach(s => grid.append(el('button', { class: 'profile', onclick: () => { STATE.currentUserId = s.id; persist(); go('student-home'); } },
      [el('div', { class: 'avatar' }, s.avatar), el('div', {}, s.name), el('div', { class: 'role' }, 'Student')])));
    const par = Object.values(STATE.parents)[0];
    grid.append(el('button', { class: 'profile parent', onclick: () => { STATE.currentUserId = par.id; persist(); go('parent-home'); } },
      [el('div', { class: 'avatar' }, par.avatar), el('div', {}, 'Parent'), el('div', { class: 'role' }, 'Family view')]));
    wrap.append(grid);
  }
  return wrap;
}

/* --------------------------- STUDENT: HOME ------------------------------- */
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
    el('div', {}, el('button', { class: 'btn primary big', onclick: () => go('practice') }, '▶ Start today’s practice')),
  ]));
  wrap.append(hero);

  // today's mission
  const cur = currentSkill(stu);
  const mission = el('div', { class: 'card' });
  mission.append(el('h3', {}, "🎯 Today's mission"));
  if (cur) mission.append(el('div', { class: 'mission' }, [
    el('span', { class: 'chip', style: `background:${cur.color}22;color:${cur.color}` }, cur.unitName),
    el('div', { class: 'mission-name' }, cur.name),
    el('button', { class: 'btn primary', onclick: () => go('practice') }, 'Practice'),
  ]));
  else mission.append(el('p', {}, '🏆 Every skill mastered — amazing!'));
  wrap.append(mission);

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

  if (!PRACTICE || PRACTICE.skillId !== skill.id) PRACTICE = { skillId: skill.id, item: generateItem(skill.gen), start: now(), streak: 0, answered: 0 };
  const p = stu.progress[skill.id] || { score: 0 };
  const card = el('div', { class: 'card practice' });
  card.append(el('div', { class: 'chip', style: `background:${skill.color}22;color:${skill.color}` }, skill.unitName));
  card.append(el('h2', {}, skill.name));
  card.append(el('div', { class: 'smart' }, [el('span', {}, 'SmartScore'), el('div', { class: 'bar' }, el('div', { class: 'bar-fill', style: `width:${p.score || 0}%;background:${skill.color}` })), el('b', {}, `${p.score || 0}`)]));

  const item = PRACTICE.item;
  card.append(el('div', { class: 'q', html: item.prompt }));
  const feedback = el('div', { class: 'feedback' });

  const submit = (val) => {
    if (PRACTICE.locked) return;
    PRACTICE.locked = true;
    const secs = Math.max(2, Math.round((now() - PRACTICE.start) / 1000));
    const ok = checkAnswer(item, val);
    recordAnswer(stu, skill, ok, secs);
    persist();
    feedback.className = 'feedback ' + (ok ? 'ok' : 'no');
    feedback.innerHTML = (ok ? '✅ Correct! ' : '❌ Not quite. ') + `<div class="expl">${item.explanation}</div>`;
    const next = el('button', { class: 'btn primary', onclick: () => { PRACTICE = null; go('practice', { skill: stu.progress[skill.id].masteredAt ? undefined : skill.id }); } }, stu.progress[skill.id]?.masteredAt ? '🎉 Skill mastered — continue' : 'Next question ▶');
    feedback.append(next);
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
        p.masteredAt ? el('span', { class: 'star' }, '⭐') : el('button', { class: 'mini', onclick: () => { PRACTICE = null; go('practice', { skill: s.id }); } }, 'practice'),
      ]));
    });
  });
  wrap.append(skills);
  wrap.append(navbar('progress'));
  return wrap;
}

/* ----------------------------- PARENT PORTAL ----------------------------- */
function renderParentHome() {
  const par = STATE.parents[STATE.currentUserId];
  const wrap = el('div', { class: 'page parent-view' });
  wrap.append(topbar(par, false, true));
  wrap.append(el('h2', { class: 'ph' }, '👨‍👩‍👧 Family dashboard'));
  const grid = el('div', { class: 'child-grid' });
  par.childIds.forEach(id => {
    const stu = STATE.students[id]; const pace = subjectPace(stu);
    const c = el('div', { class: 'card child-card', onclick: () => go('parent-child', { child: id }) });
    c.append(ring(pace.pct, 90, '#7048e8', ''));
    c.append(el('div', {}, [
      el('div', { class: 'child-name' }, `${stu.avatar} ${stu.name}`),
      pace.daysDelta >= 0 ? el('span', { class: 'badge good' }, `${pace.daysDelta}d ahead`) : el('span', { class: 'badge warn' }, `${Math.abs(pace.daysDelta)}d behind`),
      el('div', { class: 'sub' }, `${pace.mastered}/${pace.total} skills`),
    ]));
    grid.append(c);
  });
  wrap.append(grid);
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
    back ? el('button', { class: 'icon-btn', onclick: () => history.length && go(parent ? 'parent-home' : 'student-home') }, '←') : el('span', { class: 'brand' }, '⛰️ Ascend'),
    el('div', { class: 'grow' }),
    el('button', { class: 'chip-btn', onclick: exportBackup, title: 'Download a backup copy' }, '⬇ Backup'),
    el('button', { class: 'chip-btn', onclick: logout }, 'Switch'),
  ]);
}
function navbar(active, parent) {
  const items = parent ? [['home', '🏠', 'Family']] : [['home', '🏠', 'Home'], ['practice', '✏️', 'Practice'], ['progress', '📈', 'Progress']];
  const map = { home: parent ? 'parent-home' : 'student-home', practice: 'practice', progress: 'progress' };
  return el('div', { class: 'navbar' }, items.map(([k, ic, lb]) => el('button', { class: 'nav-item ' + (active === k ? 'on' : ''), onclick: () => go(map[k]) }, [el('div', { class: 'nav-ic' }, ic), el('div', {}, lb)])));
}

/* ------------------------------- ACTIONS --------------------------------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `ascend-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}
async function logout() { if (CLOUD && sb) await sb.auth.signOut(); STATE.currentUserId = null; await persist(); go('login'); }

/* -------------------------------- ROUTER --------------------------------- */
function render() {
  const root = $('#app'); root.innerHTML = '';
  if (!STATE.currentUserId) return void root.append(renderLogin());
  const isParent = !!STATE.parents[STATE.currentUserId];
  const views = {
    'login': renderLogin, 'student-home': renderStudentHome, 'practice': renderPractice,
    'progress': renderProgress, 'parent-home': renderParentHome, 'parent-child': renderParentChild,
  };
  let name = VIEW.name;
  if (isParent && (name === 'student-home' || name === 'practice' || name === 'progress')) name = 'parent-home';
  if (!isParent && name.startsWith('parent')) name = 'student-home';
  root.append((views[name] || renderStudentHome)());
}

/* -------------------------------- BOOT ----------------------------------- */
(async function boot() {
  STATE = await Store.load();
  if (!STATE || !STATE.students) STATE = seedDemo();
  if (CLOUD && sb) { const { data: { user } } = await sb.auth.getUser(); if (!user) STATE.currentUserId = null; }
  VIEW = { name: STATE.currentUserId ? (STATE.parents[STATE.currentUserId] ? 'parent-home' : 'student-home') : 'login' };
  render();
})();
