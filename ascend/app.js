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

function blankStudent(id, name, avatar) {
  return {
    id, name, avatar, role: 'student',
    plan: { start: startOfDay(now() - 28 * DAY), target: startOfDay(now() + 84 * DAY), daysPerWeek: 5, hoursPerDay: 1 },
    progress: {},   // skillId -> {score, attempts, correct, masteredAt}
    log: [],        // {ts, skillId, unitId, correct, seconds}
    writing: [],    // {ts, promptId, text, result}
    misses: [],     // {ts, skillId, unitId, prompt, answer, studentAnswer, explanation, reviewed, assigned}
    assignments: [],// {id, skillId, total, remaining, correct, ts, status}
    games: { sprintBest: 0, xp: 0, coins: 0, streak: { count: 0, last: null }, badges: [], ownedAvatars: [avatar], theme: null, dailies: null, bossCleared: {}, taught: {} },
  };
}

/* ------------------- REAL SETUP: Jayden, Grade 5, from zero --------------- */
function seedDemo() {
  const jayden = blankStudent('stu_jayden', 'Jayden', '🏀');
  // real trial: start today, finish the whole Grade 5 department in ~2 months, 1 hr/day, every day
  jayden.plan = { start: startOfDay(now()), target: startOfDay(now() + 60 * DAY), daysPerWeek: 7, hoursPerDay: 1 };
  const parent = { id: 'par_home', name: 'Parent', avatar: '👤', role: 'parent', childIds: [jayden.id] };
  return { students: { [jayden.id]: jayden }, parents: { [parent.id]: parent }, currentUserId: null };
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
  let newlyMastered = false;
  if (p.score >= 100 && !p.masteredAt) { p.masteredAt = now(); newlyMastered = true; }
  stu.log.push({ ts: now(), skillId: skill.id, unitId: skill.unitId, correct, seconds });
  return newlyMastered;
}

// central hook: records the answer AND all engagement (xp, coins, quests, streak, badges)
function handleAnswer(stu, skill, correct, seconds) {
  const beforeLvl = levelInfo(stu.games.xp).level;
  const mastered = recordAnswer(stu, skill, correct, seconds);
  ensureDailies(stu);
  awardXP(stu, correct ? 10 : 2); awardCoins(stu, correct ? 2 : 0);
  bumpQuest(stu, 'answer', 1); if (correct) bumpQuest(stu, 'correct', 1);
  if (mastered) { awardXP(stu, 50); awardCoins(stu, 25); bumpQuest(stu, 'master', 1); }
  touchStreak(stu);
  const newBadges = refreshBadges(stu);
  const leveledUp = levelInfo(stu.games.xp).level > beforeLvl;
  return { mastered, newBadges, leveledUp };
}

// celebration: confetti + a short toast for level-ups / new badges / mastery
function celebrate(cel) {
  if (!cel) return;
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
  wrap.append(el('div', { class: 'build-stamp' }, `${CURRICULUM.subject} · ${ALL_SKILLS.length} skills · build 9`));

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
    el('div', {}, el('button', { class: 'btn primary big', onclick: () => { const c = currentSkill(stu); c ? startSkill(c.id) : go('practice'); } }, '▶ Start today’s practice')),
  ]));
  wrap.append(hero);

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

  if (!PRACTICE || PRACTICE.skillId !== skill.id) PRACTICE = { skillId: skill.id, item: generateItem(skill.gen), start: now(), streak: 0, answered: 0 };
  const p = stu.progress[skill.id] || { score: 0 };
  const card = el('div', { class: 'card practice' });
  card.append(el('div', { class: 'practice-top' }, [
    el('div', { class: 'chip', style: `background:${skill.color}22;color:${skill.color}` }, skill.unitName),
    el('button', { class: 'mini', onclick: () => go('lesson', { skill: skill.id, then: 'practice' }) }, '📖 Learn'),
  ]));
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
    if (!ok) recordMiss(stu, skill, item, val);
    const cel = handleAnswer(stu, skill, ok, secs);
    const asg = openAssignment(stu, skill.id);
    if (asg) { asg.remaining = Math.max(0, asg.remaining - 1); if (ok) asg.correct++; if (asg.remaining <= 0) asg.status = 'done'; }
    persist();
    celebrate(cel);
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
        p.masteredAt ? el('span', { class: 'star' }, '⭐') : el('button', { class: 'mini', onclick: () => startSkill(s.id) }, stu.games.taught[s.id] ? 'practice' : '📖 learn'),
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
    ensureDailies(stu); bumpQuest(stu, 'write', 1); awardXP(stu, 20 + r.total * 3); awardCoins(stu, 10); touchStreak(stu);
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
  do { skill = pick(pool); it = generateItem(skill.gen); guard++; }
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
  ensureDailies(stu); bumpQuest(stu, 'sprint', 1); awardCoins(stu, 15 + Math.floor(SPRINT.score / 20));
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
  awardXP(stu, 70); awardCoins(stu, (firstTime ? 50 : 20) + (BOSS.flawless ? 20 : 0));
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
  modes.append(el('div', { class: 'card mode-card locked' },
    [el('div', { class: 'mode-emoji' }, '🤺'), el('div', { class: 'mode-nm' }, 'Duel (vs friends)'), el('div', { class: 'mode-sub' }, 'Unlocks with cloud sync — coming soon')]));
  wrap.append(modes);
  wrap.append(navbar('play'));
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
        ? el('button', { class: 'mini claim', onclick: () => { awardCoins(stu, q.reward); q.claimed = true; persist(); confetti(['🪙']); toast(`🪙 +${q.reward} coins!`); go('profile'); } }, `🪙${q.reward}`)
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

/* --------------------------- LESSON (theory) ----------------------------- */
function renderLesson() {
  const skillId = VIEW.skill; const loc = skillLoc(skillId);
  let th = THEORY[skillId];
  if (!th || !th.concept) { // synthesize a real lesson from a generated worked example
    const ex = generateItem(loc.skill.gen);
    th = { concept: `In this section you'll practice: ${loc.skill.name}. Study the worked example, then try it yourself.`,
      worked: [`Example — ${ex.prompt}`, ex.explanation || `The answer is ${ex.answer}.`],
      vocab: [], misconception: 'Work one step at a time and check your answer before moving on.',
      why: `This builds toward the rest of ${loc.unit.name}.` };
  }
  const isParent = !!STATE.parents[STATE.currentUserId];
  const stu = isParent ? STATE.students[VIEW.child] : STATE.students[STATE.currentUserId];
  const u = loc.unit;
  const wrap = el('div', { class: 'page' });
  wrap.append(topbar(isParent ? STATE.parents[STATE.currentUserId] : stu, true, isParent));
  const card = el('div', { class: 'card lesson' });
  card.append(el('div', { class: 'chip', style: `background:${u.color}22;color:${u.color}` }, `${sectionRef(skillId)} · ${u.name}`));
  card.append(el('h2', {}, '📖 ' + loc.skill.name));
  card.append(el('div', { class: 'lesson-concept' }, th.concept || ''));
  const w = el('div', { class: 'lesson-box' }); w.append(el('h4', {}, '📝 Worked example'));
  (th.worked || []).forEach((s, i) => w.append(el('div', { class: 'wstep' }, [el('span', { class: 'wnum' }, String(i + 1)), el('span', {}, s)])));
  card.append(w);
  const v = el('div', { class: 'lesson-box' }); v.append(el('h4', {}, '🔑 Key words'));
  (th.vocab || []).forEach(x => v.append(el('div', { class: 'vrow' }, [el('b', {}, x.t + ': '), el('span', {}, x.d)])));
  card.append(v);
  card.append(el('div', { class: 'lesson-warn' }, [el('b', {}, '⚠️ Watch out: '), th.misconception || '']));
  card.append(el('div', { class: 'lesson-why' }, [el('b', {}, '💡 Why it matters: '), th.why || '']));
  if (!isParent && VIEW.then === 'practice') {
    card.append(el('button', { class: 'btn primary big wide', onclick: () => { stu.games.taught[skillId] = now(); persist(); PRACTICE = null; go('practice', { skill: skillId }); } }, 'Got it — start practice ▶'));
  } else {
    card.append(el('button', { class: 'btn ghost wide', onclick: () => go(isParent ? 'parent-review' : 'student-home', isParent ? { child: stu.id } : {}) }, '← Back'));
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
    const pct = Math.round(100 * FAST.correct / FAST.n); const band = Math.max(1, Math.min(5, 1 + Math.round(pct / 100 * 4)));
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
  const faded = fadedSkills(stu);
  if (faded.length) lines.push(`⏳ ${faded.length} mastered topic(s) are starting to fade — a quick refresh keeps them sharp for the FAST test.`);
  const streak = stu.games.streak?.count || 0;
  lines.push(streak >= 2 ? `🔥 ${streak}-day streak — consistency is the #1 driver of speed. Keep it going.` : `📅 Build a daily streak — even one focused hour a day compounds fast.`);

  const sug = suggestions(stu, 3).filter(x => x.str < 0.9);
  return { headline, lines, sug };
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
  card.append(el('label', { class: 'flabel' }, 'Target finish date'), targetInp);
  card.append(el('label', { class: 'flabel' }, 'Days per week'), dpwInp);
  card.append(el('label', { class: 'flabel' }, 'Hours per day'), hpdInp);
  card.append(el('div', { class: 'answer-row' }, [
    el('button', { class: 'btn primary wide', onclick: () => {
      p.target = startOfDay(new Date(targetInp.value + 'T00:00:00').getTime());
      p.daysPerWeek = Math.max(1, Math.min(7, Number(dpwInp.value) || 5));
      p.hoursPerDay = Math.max(0.5, Number(hpdInp.value) || 1);
      persist(); go('parent-child', { child: stu.id });
    } }, 'Save plan'),
  ]));
  card.append(el('button', { class: 'btn ghost wide', onclick: () => go('parent-child', { child: stu.id }) }, 'Cancel'));
  wrap.append(card);
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

  // Coach's Report — written analysis + recommendations
  wrap.append(renderCoachCard(stu));

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
    el('button', { class: 'chip-btn', onclick: toggleDark, title: 'Toggle dark mode' }, isDark() ? '☀️' : '🌙'),
    el('button', { class: 'chip-btn', onclick: exportBackup, title: 'Download a backup copy' }, '⬇'),
    el('button', { class: 'chip-btn', onclick: logout }, 'Switch'),
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
}
async function logout() { if (CLOUD && sb) await sb.auth.signOut(); STATE.currentUserId = null; await persist(); go('login'); }

/* -------------------------------- ROUTER --------------------------------- */
function render() {
  stopSprintTimer(); bossStopTimer();
  const root = $('#app'); root.innerHTML = '';
  if (!STATE.currentUserId) return void root.append(renderLogin());
  const isParent = !!STATE.parents[STATE.currentUserId];
  if (!isParent) applyTheme(STATE.students[STATE.currentUserId]); else applyTheme(null);
  const views = {
    'login': renderLogin, 'student-home': renderStudentHome, 'practice': renderPractice,
    'progress': renderProgress, 'writing': renderWriting, 'sprint': renderSprint, 'boss': renderBoss,
    'play-hub': renderPlayHub, 'profile': renderProfile, 'shop': renderShop, 'leaderboard': renderLeaderboard,
    'lesson': renderLesson, 'fast': renderFast, 'parent-review': renderParentReview,
    'parent-home': renderParentHome, 'parent-child': renderParentChild, 'parent-plan': renderPlanEditor,
  };
  const studentOnly = ['student-home', 'practice', 'progress', 'writing', 'sprint', 'boss', 'play-hub', 'profile', 'shop', 'leaderboard', 'fast'];
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
function ensureStudentShape(stu) {
  stu.writing = stu.writing || []; stu.misses = stu.misses || []; stu.assignments = stu.assignments || [];
  const g = stu.games = stu.games || {};
  g.sprintBest = g.sprintBest || 0; g.xp = g.xp || 0; g.coins = g.coins || 0;
  g.streak = g.streak || { count: 0, last: null };
  g.badges = g.badges || []; g.ownedAvatars = g.ownedAvatars || [stu.avatar];
  g.bossCleared = g.bossCleared || {}; g.taught = g.taught || {}; if (!('theme' in g)) g.theme = null; if (!('dailies' in g)) g.dailies = null;
}

(async function boot() {
  applyDark();
  STATE = await Store.load();
  if (!STATE || !STATE.students) STATE = seedDemo();
  Object.values(STATE.students || {}).forEach(ensureStudentShape);
  if (CLOUD && sb) { const { data: { user } } = await sb.auth.getUser(); if (!user) STATE.currentUserId = null; }
  VIEW = { name: STATE.currentUserId ? (STATE.parents[STATE.currentUserId] ? 'parent-home' : 'student-home') : 'login' };
  render();
})();
