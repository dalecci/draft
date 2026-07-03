/* ============================================================================
   Ascend — Grade 7 Mathematics curriculum (Florida B.E.S.T. aligned)
   One subject, fully polished. Content is organized as:
     subject -> units -> skills -> item TEMPLATES (parameterized generators)
   The LLM is NOT in the serving loop: questions are generated deterministically
   in the browser from these vetted templates. (Demo templates — a real launch
   would have each template teacher-validated.)
   ============================================================================ */

/* ---------- small math helpers (kept correct & simple on purpose) ---------- */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
function reduceFrac(n, d) { const g = gcd(n, d); return [n / g, d / g]; }
function round(x, p = 2) { const f = Math.pow(10, p); return Math.round(x * f) / f; }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// build a multiple-choice item from a correct value + distractor generator
function mc(prompt, correct, distractors, explanation) {
  const opts = shuffle([String(correct), ...distractors.map(String)]);
  return { type: 'mc', prompt, answer: String(correct), choices: opts, explanation };
}

/* ---------- item template generators ----------
   each returns { type, prompt, answer, choices?, explanation }
   'numeric' answers are checked with tolerance; 'mc' by exact string match.      */
const GEN = {
  // NSO — integer operations
  integerOps() {
    const a = randInt(-12, 12), b = randInt(-12, 12), op = pick(['+', '-', '×']);
    const ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { type: 'numeric', prompt: `Evaluate:  (${a}) ${op} (${b})`, answer: ans,
      explanation: `${a} ${op} ${b} = ${ans}. Watch the signs.` };
  },
  // NSO — add/subtract fractions
  fractionAddSub() {
    const d1 = pick([2, 3, 4, 5, 6]), d2 = pick([2, 3, 4, 6, 8]);
    const n1 = randInt(1, d1 - 1), n2 = randInt(1, d2 - 1), op = pick(['+', '-']);
    const lcd = d1 * d2 / gcd(d1, d2);
    let num = op === '+' ? n1 * (lcd / d1) + n2 * (lcd / d2) : n1 * (lcd / d1) - n2 * (lcd / d2);
    const [rn, rd] = reduceFrac(num, lcd);
    return { type: 'text', prompt: `Simplify:  ${n1}/${d1} ${op} ${n2}/${d2}   (write as a/b or a whole number)`,
      answer: rd === 1 ? `${rn}` : `${rn}/${rd}`, alt: [`${num}/${lcd}`],
      explanation: `Common denominator ${lcd}: ${n1 * (lcd / d1)}/${lcd} ${op} ${n2 * (lcd / d2)}/${lcd} = ${num}/${lcd} = ${rd === 1 ? rn : rn + '/' + rd}.` };
  },
  // AR — combine like terms (MC to keep grading clean)
  combineLikeTerms() {
    const a = randInt(2, 6), b = randInt(2, 6), c = randInt(1, 9), d = randInt(1, 9);
    const x = a + b, k = c - d;
    const correct = `${x}x ${k >= 0 ? '+ ' + k : '- ' + Math.abs(k)}`;
    const dist = [`${x}x ${k >= 0 ? '- ' + k : '+ ' + Math.abs(k)}`, `${a * b}x + ${c + d}`, `${x + 1}x ${k >= 0 ? '+ ' + k : '- ' + Math.abs(k)}`];
    return mc(`Simplify:  ${a}x + ${c} + ${b}x - ${d}`, correct, dist,
      `Combine x-terms: ${a}x + ${b}x = ${x}x. Combine constants: ${c} - ${d} = ${k}. → ${correct}`);
  },
  // AR — two-step equations
  twoStepEquation() {
    const a = randInt(2, 9), x = randInt(-6, 9), b = randInt(-9, 9);
    const c = a * x + b;
    return { type: 'numeric', prompt: `Solve for x:   ${a}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)} = ${c}`,
      answer: x, explanation: `Subtract ${b} → ${a}x = ${c - b}. Divide by ${a} → x = ${x}.` };
  },
  // AR — two-step inequalities (MC)
  twoStepInequality() {
    const a = randInt(2, 6), b = randInt(1, 9), c = b + a * randInt(1, 6);
    const sol = (c - b) / a;
    const correct = `x > ${sol}`;
    return mc(`Solve:   ${a}x + ${b} > ${c}`, correct, [`x < ${sol}`, `x > ${sol + 1}`, `x < ${sol - 1}`],
      `Subtract ${b} → ${a}x > ${c - b}. Divide by ${a} → x > ${sol}.`);
  },
  // PR — unit rate
  unitRate() {
    const rate = randInt(3, 15), qty = randInt(2, 9), total = rate * qty;
    const thing = pick(['miles', 'pages', 'dollars', 'liters', 'points']);
    const per = pick(['hour', 'day', 'gallon', 'game', 'minute']);
    return { type: 'numeric', prompt: `A rate is ${total} ${thing} in ${qty} ${per}s. What is the unit rate (${thing} per ${per})?`,
      answer: rate, explanation: `${total} ÷ ${qty} = ${rate} ${thing} per ${per}.` };
  },
  // PR — constant of proportionality
  constantOfProportionality() {
    const k = randInt(2, 12), x = randInt(2, 9), y = k * x;
    return { type: 'numeric', prompt: `y is proportional to x. When x = ${x}, y = ${y}. Find the constant of proportionality k.`,
      answer: k, explanation: `k = y ÷ x = ${y} ÷ ${x} = ${k}.` };
  },
  // PR — percent (tax/tip/discount)
  percentApplication() {
    const base = randInt(20, 80) * 5, p = pick([10, 15, 20, 25, 5, 8]);
    const kind = pick([
      { w: `A $${base} item has a ${p}% discount. What is the sale price? ($)`, a: round(base * (1 - p / 100)) },
      { w: `A $${base} bill gets a ${p}% tip. What is the tip? ($)`, a: round(base * p / 100) },
      { w: `A $${base} item has ${p}% tax. What is the total? ($)`, a: round(base * (1 + p / 100)) },
    ]);
    return { type: 'numeric', prompt: kind.w, answer: kind.a, explanation: `Work in decimals: ${p}% = ${p / 100}. Answer = ${kind.a}.` };
  },
  // GR — circle area / circumference (π ≈ 3.14)
  circle() {
    const r = randInt(2, 12), mode = pick(['area', 'circumference']);
    const a = mode === 'area' ? round(3.14 * r * r) : round(2 * 3.14 * r);
    return { type: 'numeric', tol: 0.5,
      prompt: `A circle has radius ${r}. Find its ${mode} (use π ≈ 3.14).`,
      answer: a, explanation: mode === 'area' ? `A = πr² ≈ 3.14 × ${r}² = ${a}.` : `C = 2πr ≈ 2 × 3.14 × ${r} = ${a}.` };
  },
  // GR — volume of rectangular prism
  prismVolume() {
    const l = randInt(2, 12), w = randInt(2, 10), h = randInt(2, 10);
    return { type: 'numeric', prompt: `Find the volume of a box ${l} × ${w} × ${h}.`,
      answer: l * w * h, explanation: `V = l × w × h = ${l} × ${w} × ${h} = ${l * w * h}.` };
  },
  // GR — angle relationships
  angles() {
    const kind = pick(['complementary', 'supplementary']);
    const total = kind === 'complementary' ? 90 : 180, x = randInt(15, total - 15);
    return { type: 'numeric', prompt: `Two ${kind} angles: one is ${x}°. Find the other.`,
      answer: total - x, explanation: `${kind} angles sum to ${total}°. ${total} − ${x} = ${total - x}°.` };
  },
  // DP — probability of a simple event
  probability() {
    const total = pick([6, 8, 10, 12, 20]), fav = randInt(1, total - 1);
    const [n, d] = reduceFrac(fav, total);
    return { type: 'text', prompt: `A bag has ${total} marbles; ${fav} are red. P(red)? (write as a/b or a decimal)`,
      answer: d === 1 ? `${n}` : `${n}/${d}`, alt: [String(round(fav / total, 3)), `${fav}/${total}`],
      explanation: `P = favorable/total = ${fav}/${total} = ${d === 1 ? n : n + '/' + d} ≈ ${round(fav / total, 3)}.` };
  },
  // DP — mean
  mean() {
    const n = randInt(4, 5), vals = Array.from({ length: n }, () => randInt(2, 20));
    while (vals.reduce((a, b) => a + b, 0) % n !== 0) vals[0] = randInt(2, 20);
    const m = vals.reduce((a, b) => a + b, 0) / n;
    return { type: 'numeric', prompt: `Find the mean of: ${vals.join(', ')}.`, answer: m,
      explanation: `Sum = ${vals.reduce((a, b) => a + b, 0)}, ÷ ${n} = ${m}.` };
  },
};

/* ---------- the curriculum tree (Florida B.E.S.T. M/J Grade 7 Math) ---------- */
const CURRICULUM = {
  subject: 'Grade 7 Mathematics',
  standard: 'Florida B.E.S.T. (M/J Grade 7)',
  units: [
    { id: 'nso', name: 'Number Sense & Operations', color: '#ff6b6b', icon: '🔢', skills: [
      { id: 'nso1', name: 'Add, subtract & multiply integers', gen: 'integerOps' },
      { id: 'nso2', name: 'Add & subtract fractions', gen: 'fractionAddSub' },
    ] },
    { id: 'ar', name: 'Algebraic Reasoning', color: '#4dabf7', icon: '🧩', skills: [
      { id: 'ar1', name: 'Combine like terms', gen: 'combineLikeTerms' },
      { id: 'ar2', name: 'Solve two-step equations', gen: 'twoStepEquation' },
      { id: 'ar3', name: 'Solve two-step inequalities', gen: 'twoStepInequality' },
    ] },
    { id: 'pr', name: 'Proportional Reasoning', color: '#20c997', icon: '⚖️', skills: [
      { id: 'pr1', name: 'Find unit rates', gen: 'unitRate' },
      { id: 'pr2', name: 'Constant of proportionality', gen: 'constantOfProportionality' },
      { id: 'pr3', name: 'Percent: tax, tip & discount', gen: 'percentApplication' },
    ] },
    { id: 'gr', name: 'Geometric Reasoning', color: '#f59f00', icon: '📐', skills: [
      { id: 'gr1', name: 'Area & circumference of circles', gen: 'circle' },
      { id: 'gr2', name: 'Volume of prisms', gen: 'prismVolume' },
      { id: 'gr3', name: 'Angle relationships', gen: 'angles' },
    ] },
    { id: 'dp', name: 'Data & Probability', color: '#b197fc', icon: '🎲', skills: [
      { id: 'dp1', name: 'Probability of simple events', gen: 'probability' },
      { id: 'dp2', name: 'Mean of a data set', gen: 'mean' },
    ] },
  ],
};

// flat list of all skills (used by pacing + progress)
const ALL_SKILLS = CURRICULUM.units.flatMap(u => u.skills.map(s => ({ ...s, unitId: u.id, unitName: u.name, color: u.color })));

function generateItem(genName) { return GEN[genName](); }

if (typeof module !== 'undefined') { module.exports = { CURRICULUM, ALL_SKILLS, GEN, generateItem, gcd, reduceFrac }; }
