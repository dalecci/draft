/* ============================================================================
   Ascend — Engagement layer (streaks, XP/levels, coins, quests, badges, shop)
   Pure helpers that read/mutate stu.games. Rewards are earned from real
   learning (correct answers + mastery), not from idle tapping — engagement
   that reinforces the work, not dark patterns.
   ============================================================================ */

/* -------- levels (basketball-themed ranks) -------- */
const LEVEL_STEP = 250;
const LEVEL_TITLES = ['Rookie', 'Baller', 'Starter', 'Sixth Man', 'All-Star', 'Captain', 'MVP', 'Legend', 'Hall of Famer', 'G.O.A.T.'];
function levelInfo(xp) {
  xp = xp || 0;
  const level = 1 + Math.floor(xp / LEVEL_STEP);
  const into = xp % LEVEL_STEP;
  const title = LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, level - 1)];
  return { level, title, into, span: LEVEL_STEP, pct: Math.round(100 * into / LEVEL_STEP) };
}

/* -------- date helpers -------- */
function dayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }
function _hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/* -------- daily quests -------- */
const QUEST_POOL = [
  { id: 'answer10', type: 'answer', text: 'Answer 10 questions', goal: 10, reward: 5 },
  { id: 'correct8', type: 'correct', text: 'Get 8 correct answers', goal: 8, reward: 6 },
  { id: 'master1', type: 'master', text: 'Master a new skill', goal: 1, reward: 9 },
  { id: 'sprint1', type: 'sprint', text: 'Play a Math Sprint', goal: 1, reward: 5 },
  { id: 'boss1', type: 'boss', text: 'Take on a boss', goal: 1, reward: 7 },
  { id: 'write1', type: 'write', text: 'Write & get feedback', goal: 1, reward: 6 },
  { id: 'correct15', type: 'correct', text: 'Get 15 correct answers', goal: 15, reward: 9 },
];
function dailyQuests(key) {
  const idx = [...QUEST_POOL.keys()]; let seed = _hash(key) || 7; const out = [];
  while (out.length < 3 && idx.length) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const q = QUEST_POOL[idx.splice(seed % idx.length, 1)[0]]; out.push({ id: q.id, type: q.type, text: q.text, goal: q.goal, reward: q.reward, progress: 0, done: false, claimed: false }); }
  return out;
}
function ensureDailies(stu) {
  const today = dayKey(Date.now());
  if (!stu.games.dailies || stu.games.dailies.date !== today) stu.games.dailies = { date: today, quests: dailyQuests(today) };
  return stu.games.dailies;
}
function bumpQuest(stu, type, n) {
  ensureDailies(stu).quests.forEach(q => { if (q.type === type && !q.done) { q.progress = Math.min(q.goal, q.progress + n); if (q.progress >= q.goal) q.done = true; } });
}
function dailyGoalMet(stu) { const d = stu.games.dailies; return !!(d && d.date === dayKey(Date.now()) && d.quests.every(q => q.done)); }

/* -------- streak -------- */
function touchStreak(stu) {
  const today = dayKey(Date.now());
  const s = stu.games.streak || (stu.games.streak = { count: 0, last: null });
  if (s.last === today) return;
  s.count = (s.last === dayKey(Date.now() - 86400000)) ? s.count + 1 : 1;
  s.last = today;
}

/* -------- currency -------- */
function awardXP(stu, n) { stu.games.xp = (stu.games.xp || 0) + n; }
function awardCoins(stu, n, src) {
  if (!n) return;
  stu.games.coins = (stu.games.coins || 0) + n;
  const log = stu.games.coinLog || (stu.games.coinLog = []);
  log.push({ t: Date.now(), n, src: src || 'play', bal: stu.games.coins });
  if (log.length > 80) log.shift();
}

/* -------- stats + badges -------- */
function playerStats(stu) {
  let attempts = 0, correct = 0, mastered = 0, stretchMastered = 0;
  for (const s of ALL_SKILLS) { const p = stu.progress[s.id]; if (p) { attempts += p.attempts; correct += p.correct; if (p.masteredAt) mastered++; if (p.stretch && p.stretch.masteredAt) stretchMastered++; } }
  const unitsCleared = CURRICULUM.units.filter(u => u.skills.every(s => stu.progress[s.id]?.masteredAt)).length;
  return { attempts, correct, mastered, stretchMastered, unitsCleared, acc: attempts ? correct / attempts : 0 };
}
const BADGES = [
  // mastery ladder
  { id: 'first_master', emoji: '🌱', name: 'First Steps', desc: 'Master your first skill', test: (s, st) => st.mastered >= 1 },
  { id: 'five_master', emoji: '🖐️', name: 'High Five', desc: 'Master 5 skills', test: (s, st) => st.mastered >= 5 },
  { id: 'ten_master', emoji: '🔟', name: 'Double Digits', desc: 'Master 10 skills', test: (s, st) => st.mastered >= 10 },
  { id: 'm25', emoji: '⭐', name: 'Rising Star', desc: 'Master 25 skills', test: (s, st) => st.mastered >= 25 },
  { id: 'm50', emoji: '🌟', name: 'Halfway Hero', desc: 'Master 50 skills', test: (s, st) => st.mastered >= 50 },
  { id: 'm100', emoji: '💯', name: 'Century Club', desc: 'Master 100 skills', test: (s, st) => st.mastered >= 100 },
  { id: 'm150', emoji: '🚀', name: 'Launch Speed', desc: 'Master 150 skills', test: (s, st) => st.mastered >= 150 },
  { id: 'm200', emoji: '🏆', name: 'Two Hundred', desc: 'Master 200 skills', test: (s, st) => st.mastered >= 200 },
  { id: 'm300', emoji: '💎', name: 'Diamond Mind', desc: 'Master 300 skills', test: (s, st) => st.mastered >= 300 },
  { id: 'm_all', emoji: '👑', name: 'Grade 5 Champion', desc: `Master all ${ALL_SKILLS.length} skills`, test: (s, st) => st.mastered >= ALL_SKILLS.length },
  // topics cleared
  { id: 'unit_clear', emoji: '🏅', name: 'Topic Cleared', desc: 'Master a whole topic', test: (s, st) => st.unitsCleared >= 1 },
  { id: 'u5', emoji: '🎖️', name: 'Five Topics', desc: 'Clear 5 topics', test: (s, st) => st.unitsCleared >= 5 },
  { id: 'u10', emoji: '🥇', name: 'Ten Topics', desc: 'Clear 10 topics', test: (s, st) => st.unitsCleared >= 10 },
  { id: 'u24', emoji: '🏵️', name: 'Halfway There', desc: 'Clear half the topics', test: (s, st) => st.unitsCleared >= 24 },
  { id: 'all_clear', emoji: '🎓', name: 'Full Sweep', desc: 'Clear every topic', test: (s, st) => st.unitsCleared >= CURRICULUM.units.length },
  // volume
  { id: 'centurion', emoji: '✍️', name: 'Centurion', desc: 'Answer 100 questions', test: (s, st) => st.attempts >= 100 },
  { id: 'q500', emoji: '📚', name: 'Bookworm', desc: 'Answer 500 questions', test: (s, st) => st.attempts >= 500 },
  { id: 'q1000', emoji: '🧠', name: 'Big Brain', desc: 'Answer 1,000 questions', test: (s, st) => st.attempts >= 1000 },
  { id: 'q2500', emoji: '🦉', name: 'Wise Owl', desc: 'Answer 2,500 questions', test: (s, st) => st.attempts >= 2500 },
  // streaks
  { id: 'streak3', emoji: '🔥', name: 'On Fire', desc: '3-day streak', test: (s) => (s.games.streak?.count || 0) >= 3 },
  { id: 'streak7', emoji: '⚡', name: 'Week Warrior', desc: '7-day streak', test: (s) => (s.games.streak?.count || 0) >= 7 },
  { id: 'streak14', emoji: '🌋', name: 'Two Weeks Strong', desc: '14-day streak', test: (s) => (s.games.streak?.count || 0) >= 14 },
  { id: 'streak30', emoji: '🏔️', name: 'Iron Will', desc: '30-day streak', test: (s) => (s.games.streak?.count || 0) >= 30 },
  // sprint
  { id: 'sprint200', emoji: '💨', name: 'Speed Demon', desc: 'Score 200+ in a Sprint', test: (s) => (s.games.sprintBest || 0) >= 200 },
  { id: 'sprint400', emoji: '🌪️', name: 'Whirlwind', desc: 'Score 400+ in a Sprint', test: (s) => (s.games.sprintBest || 0) >= 400 },
  { id: 'sprint700', emoji: '☄️', name: 'Meteor', desc: 'Score 700+ in a Sprint', test: (s) => (s.games.sprintBest || 0) >= 700 },
  // boss
  { id: 'boss1', emoji: '⚔️', name: 'Boss Slayer', desc: 'Defeat a boss', test: (s) => Object.keys(s.games.bossCleared || {}).length >= 1 },
  { id: 'boss5', emoji: '🛡️', name: 'Boss Hunter', desc: 'Defeat 5 bosses', test: (s) => Object.keys(s.games.bossCleared || {}).length >= 5 },
  { id: 'boss15', emoji: '🐲', name: 'Dragon Tamer', desc: 'Defeat 15 bosses', test: (s) => Object.keys(s.games.bossCleared || {}).length >= 15 },
  { id: 'boss_all', emoji: '🏰', name: 'Boss Legend', desc: 'Defeat every boss', test: (s) => Object.keys(s.games.bossCleared || {}).length >= CURRICULUM.units.length },
  // accuracy
  { id: 'sharp', emoji: '🎯', name: 'Sharpshooter', desc: '90%+ accuracy (50+ answers)', test: (s, st) => st.attempts >= 50 && st.acc >= 0.9 },
  { id: 'sniper', emoji: '🏹', name: 'Sniper', desc: '95%+ accuracy (150+ answers)', test: (s, st) => st.attempts >= 150 && st.acc >= 0.95 },
  // levels
  { id: 'level5', emoji: '🥉', name: 'All-Star', desc: 'Reach level 5', test: (s) => levelInfo(s.games.xp).level >= 5 },
  { id: 'level10', emoji: '🥈', name: 'MVP', desc: 'Reach level 10', test: (s) => levelInfo(s.games.xp).level >= 10 },
  { id: 'level20', emoji: '🏆', name: 'Hall of Famer', desc: 'Reach level 20', test: (s) => levelInfo(s.games.xp).level >= 20 },
  // writing
  { id: 'writer', emoji: '📝', name: 'Wordsmith', desc: 'Submit a piece of writing', test: (s) => (s.writing?.length || 0) >= 1 },
  // above grade level (Grade 6 stretch)
  { id: 'stretch1', emoji: '🔥', name: 'Above & Beyond', desc: 'Master a skill above grade level', test: (s, st) => st.stretchMastered >= 1 },
  { id: 'stretch10', emoji: '💎', name: 'Overachiever', desc: '10 skills above grade level', test: (s, st) => st.stretchMastered >= 10 },
  { id: 'stretch25', emoji: '🚀', name: 'Ahead of the Class', desc: '25 skills above grade level', test: (s, st) => st.stretchMastered >= 25 },
];
function refreshBadges(stu) {
  const st = playerStats(stu);
  const owned = stu.games.badges || (stu.games.badges = []);
  const gained = [];
  BADGES.forEach(b => { if (!owned.includes(b.id) && b.test(stu, st)) { owned.push(b.id); gained.push(b); } });
  return gained;
}

/* -------- shop -------- */
const SHOP_AVATARS = [
  { e: '🏀', cost: 0 }, { e: '🎨', cost: 0 }, { e: '🚀', cost: 0 },
  { e: '🦊', cost: 80 }, { e: '🐼', cost: 80 }, { e: '🦄', cost: 120 }, { e: '🐲', cost: 180 },
  { e: '🤖', cost: 180 }, { e: '👾', cost: 220 }, { e: '🦁', cost: 220 }, { e: '🐙', cost: 260 }, { e: '⚡', cost: 320 },
  { e: '🔥', cost: 400 }, { e: '🦖', cost: 500 }, { e: '🌈', cost: 600 }, { e: '👑', cost: 800 },
  // legendary tier — long-term savings goals
  { e: '🧙', cost: 1000 }, { e: '🦅', cost: 1200 }, { e: '🐺', cost: 1500 }, { e: '🛸', cost: 1800 },
  { e: '🐋', cost: 2200 }, { e: '🦈', cost: 2600 }, { e: '🎸', cost: 3000 }, { e: '🏰', cost: 3500 },
  { e: '💎', cost: 4200 }, { e: '🌟', cost: 5000 },
];
// Real-world rewards — bought with coins, honored by the parent
const SHOP_PERKS = [
  { id: 'screen30', e: '📱', name: '30 min extra screen time', cost: 600 },
  { id: 'dinner', e: '🍕', name: 'Pick tonight’s dinner', cost: 900 },
  { id: 'icecream', e: '🍦', name: 'Ice cream trip', cost: 1200 },
  { id: 'movie', e: '🎬', name: 'Family movie night — your pick', cost: 1500 },
  { id: 'staylate', e: '🌙', name: 'Stay up 30 min later', cost: 1800 },
  { id: 'sleepover', e: '🏕️', name: 'Friend sleepover', cost: 2500 },
  { id: 'dayoffhw', e: '🎯', name: 'Day off from practice', cost: 3500 },
  { id: 'dayoff', e: '🏖️', name: 'A full DAY OFF', cost: 5000 },
  { id: 'bigday', e: '🎢', name: 'Big outing (park / arcade / adventure)', cost: 8000 },
];
const SHOP_THEMES = [
  { name: 'Grape', p: '#7048e8', d: '#5a37c9', cost: 0 },
  { name: 'Ocean', p: '#1c7ed6', d: '#1864ab', cost: 80 },
  { name: 'Forest', p: '#2f9e44', d: '#2b8a3e', cost: 80 },
  { name: 'Sunset', p: '#f76707', d: '#e8590c', cost: 120 },
  { name: 'Bubblegum', p: '#e64980', d: '#c2255c', cost: 160 },
  { name: 'Midnight', p: '#5f3dc4', d: '#3b2a86', cost: 260 },
  { name: 'Galaxy', p: '#7950f2', d: '#5f3dc4', cost: 400 },
  { name: 'Gold', p: '#f08c00', d: '#e67700', cost: 550 },
  { name: 'Neon', p: '#0ca678', d: '#087f5b', cost: 900 },
  { name: 'Ruby', p: '#e03131', d: '#c92a2a', cost: 1400 },
  { name: 'Royal', p: '#364fc7', d: '#2b3a94', cost: 2200 },
  { name: 'Blackout', p: '#212529', d: '#101214', cost: 3200 },
];
function applyTheme(stu) {
  const t = stu && stu.games && stu.games.theme;
  const p = t ? t.p : '#7048e8', d = t ? t.d : '#5a37c9';
  document.documentElement.style.setProperty('--primary', p);
  document.documentElement.style.setProperty('--primary-d', d);
}

/* -------- interests: word problems star what THIS kid loves -------- */
const INTEREST_PACKS = {
  dino: { label: 'Dinosaurs', emoji: '🦖', names: ['Rex', 'Dina', 'Spike', 'Tria'], things: ['dino eggs', 'fossils', 'dino stickers', 'T-Rex toys'], places: ['the dino park', 'the fossil dig'] },
  bball: { label: 'Basketball', emoji: '🏀', names: ['Jordan', 'Skye', 'Coach D', 'Lexi'], things: ['basketballs', 'trading cards', 'team jerseys'], places: ['the court', 'the arena'] },
  soccer: { label: 'Soccer', emoji: '⚽', names: ['Leo', 'Mia', 'Ronny', 'Coach Sam'], things: ['soccer balls', 'cleats', 'team stickers'], places: ['the pitch', 'the stadium'] },
  space: { label: 'Space', emoji: '🚀', names: ['Astro Ava', 'Commander Max', 'Luna'], things: ['moon rocks', 'star charts', 'rocket parts'], places: ['the launch pad', 'the space station'] },
  gaming: { label: 'Video games', emoji: '🎮', names: ['PixelPete', 'MaxLevel', 'GlitchGirl'], things: ['power-ups', 'gold coins', 'game cards'], places: ['the arcade', 'level 7'] },
  animals: { label: 'Animals', emoji: '🐾', names: ['Buddy', 'Whiskers', 'Coco'], things: ['puppy treats', 'kitten toys', 'bird seeds'], places: ['the pet shop', 'the zoo'] },
  cars: { label: 'Cars & trucks', emoji: '🏎️', names: ['Turbo Tom', 'Dash', 'Mechanic Mo'], things: ['toy cars', 'race wheels', 'race flags'], places: ['the racetrack', 'the garage'] },
  minecraft: { label: 'Minecraft', emoji: '⛏️', names: ['Steve', 'Alexa the Builder', 'Miner Mia'], things: ['diamond blocks', 'emeralds', 'torches'], places: ['the mine', 'the village'] },
  art: { label: 'Art & crafts', emoji: '🎨', names: ['Piper', 'Vincent', 'Frida'], things: ['paint sets', 'glitter pens', 'sticker sheets'], places: ['the art room', 'the craft fair'] },
  ocean: { label: 'Ocean', emoji: '🌊', names: ['Marina', 'Finn', 'Captain Coral'], things: ['seashells', 'pearls', 'starfish'], places: ['the reef', 'the aquarium'] },
  candy: { label: 'Sweets', emoji: '🍭', names: ['Charlie', 'Lolly', 'Chef Coco'], things: ['gumballs', 'chocolate bars', 'lollipops'], places: ['the candy shop', 'the bakery'] },
  music: { label: 'Music & dance', emoji: '🎵', names: ['Melody', 'DJ Ray', 'Harmony'], things: ['guitar picks', 'concert tickets', 'dance ribbons'], places: ['the stage', 'the studio'] },
};
function flavorFor(stu) {
  const picks = ((stu.games && stu.games.interests) || []).map(k => INTEREST_PACKS[k]).filter(Boolean);
  if (!picks.length) return null;
  const merge = key => picks.flatMap(p => p[key]);
  return { names: merge('names'), things: merge('things'), places: merge('places') };
}

/* -------- confetti (pure DOM, self-cleaning) -------- */
function confetti(emojis) {
  emojis = emojis || ['⭐', '🎉', '🏀', '💜', '✨', '🔥'];
  const c = document.createElement('div'); c.className = 'confetti';
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('span');
    p.textContent = emojis[i % emojis.length];
    p.style.left = (Math.random() * 100) + '%';
    p.style.animationDelay = (Math.random() * 0.35) + 's';
    p.style.fontSize = (14 + Math.random() * 18) + 'px';
    c.append(p);
  }
  document.body.append(c);
  setTimeout(() => c.remove(), 2400);
}

if (typeof module !== 'undefined') { module.exports = { levelInfo, dailyQuests, QUEST_POOL, BADGES, SHOP_AVATARS, SHOP_THEMES, SHOP_PERKS, playerStats }; }
