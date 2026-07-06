/* ============================================================================
   Ascend — Grade 5 Mathematics (full IXL-style scope: ~390 skills, 48 topics)
   The skill TREE is complete (every topic + skill), so the parent portal shows
   the whole department and paces against it. Questions are generated from a
   library of CORRECT generators; each skill is mapped to the best-fit generator
   by topic + keyword. Computational skills get exact practice; visual/model and
   word-problem variants reuse the same underlying math (real numbers, real
   answers — not fake), which a teacher-authored pass would later specialize.
   ============================================================================ */

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }
function reduceFrac(n, d) { const g = gcd(n, d); return [n / g, d / g]; }
function round(x, p = 2) { const f = Math.pow(10, p); return Math.round(x * f) / f; }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function distinctChoices(correct, makeDistractor, n = 4) {
  const set = new Set([String(correct)]); let guard = 0;
  while (set.size < n && guard < 60) { set.add(String(makeDistractor())); guard++; }
  let bump = 1; while (set.size < n) { set.add(String(correct) + ' '.repeat(bump++)); }
  return shuffle([...set]);
}
function mc(prompt, correct, distractors, explanation) {
  const ca = String(correct); const seen = new Set([ca]); const uniq = [];
  for (const d of distractors) { const s = String(d); if (!seen.has(s)) { seen.add(s); uniq.push(s); } } // drop any decoy equal to the answer or to another decoy
  return { type: 'mc', prompt, answer: ca, choices: shuffle([ca, ...uniq]), explanation };
}
function numItem(prompt, answer, explanation, tol) { return { type: 'numeric', prompt, answer, explanation, tol: tol || 0.001 }; }
function fracStr(n, d) { const [a, b] = reduceFrac(n, d); return b === 1 ? String(a) : `${a}/${b}`; }
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words3(n) { // 0..999
  let s = '';
  if (n >= 100) { s += ONES[Math.floor(n / 100)] + ' hundred'; n %= 100; if (n) s += ' '; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += '-' + ONES[n % 10]; }
  else if (n > 0) s += ONES[n];
  return s || 'zero';
}
function numToWords(n) {
  if (n < 1000) return words3(n);
  const th = Math.floor(n / 1000), rest = n % 1000;
  let s = words3(th) + ' thousand';
  if (rest) s += ' ' + words3(rest);
  return s;
}
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n) { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; }
function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
function primeFactors(n) { const f = []; let d = 2; while (n > 1) { while (n % d === 0) { f.push(d); n /= d; } d++; } return f; }
function factorsOf(n) { const f = []; for (let i = 1; i <= n; i++) if (n % i === 0) f.push(i); return f; }

/* ------------------------------ GENERATORS ------------------------------- */
const GEN = {
  placeValue() { const digits = [randInt(1, 9), randInt(0, 9), randInt(0, 9), randInt(0, 9), randInt(0, 9)]; const num = +digits.join(''); const pos = randInt(0, 4); const places = ['ten thousands', 'thousands', 'hundreds', 'tens', 'ones']; const val = digits[pos] * Math.pow(10, 4 - pos); return numItem(`In ${num.toLocaleString()}, what is the value of the digit ${digits[pos]} (in the ${places[pos]} place)?`, val, `${digits[pos]} in the ${places[pos]} place = ${val.toLocaleString()}.`); },
  expanded() { const n = randInt(1000, 99999); const parts = String(n).split('').reverse().map((d, i) => +d * Math.pow(10, i)).filter(x => x).reverse(); return mc(`Which is ${n.toLocaleString()} in expanded form?`, parts.join(' + '), [parts.map(x => x + 1).join(' + '), parts.slice(1).join(' + ') || '0', String(n)], `Break each digit into its place value: ${parts.join(' + ')}.`); },
  wordName() { const n = randInt(100, 9999); const w = numToWords(n); return mc(`Which number is "${w}"?`, n, [n + randInt(1, 9), n + 100, n - 10].map(x => x.toLocaleString ? x.toLocaleString() : x), `${w} = ${n.toLocaleString()}.`).type ? mc(`Write in numerals: "${w}"`, n, [n + randInt(1, 9), n + 100, Math.max(0, n - 90)], `${w} = ${n}.`) : null; },
  roman() { const n = randInt(1, 39); const set = new Set(); let k = 1; while (set.size < 3 && k < 15) { [n + k, n - k].forEach(m => { if (m >= 1 && m !== n) set.add(toRoman(m)); }); k++; } return mc(`Write ${n} as a Roman numeral.`, toRoman(n), [...set].slice(0, 3), `${n} = ${toRoman(n)}.`); },
  estimateSum() { const a = randInt(120, 8900), b = randInt(120, 8900); const ra = Math.round(a / 100) * 100, rb = Math.round(b / 100) * 100; const op = pick(['+', '-']); const est = op === '+' ? ra + rb : ra - rb; return numItem(`Estimate by rounding each number to the nearest hundred:  ${a} ${op} ${b}`, est, `${a}≈${ra}, ${b}≈${rb}. ${ra} ${op} ${rb} = ${est}.`); },
  addSub() { const a = randInt(1000, 90000), b = randInt(100, a); const op = pick(['+', '-']); const ans = op === '+' ? a + b : a - b; return numItem(`Calculate:  ${a} ${op} ${b}`, ans, `${a} ${op} ${b} = ${ans}.`); },
  propAdd() { const a = randInt(2, 20), b = randInt(2, 20); return mc(`Which property is shown?   ${a} + ${b} = ${b} + ${a}`, 'Commutative', ['Associative', 'Distributive', 'Identity'], 'Swapping the order of addends is the commutative property.'); },
  powTen() { const e = randInt(1, 6); return numItem(`Evaluate:  10^${e}`, Math.pow(10, e), `10^${e} = 1 followed by ${e} zeros = ${Math.pow(10, e).toLocaleString()}.`); },
  powTenExp() { const e = randInt(2, 6); const v = Math.pow(10, e); return mc(`Write ${v.toLocaleString()} as a power of ten.`, `10^${e}`, [`10^${e + 1}`, `10^${e - 1}`, `${e}^10`], `${v.toLocaleString()} has ${e} zeros → 10^${e}.`); },
  multiply() { const a = randInt(12, 99), b = randInt(11, 99); return numItem(`Multiply:  ${a} × ${b}`, a * b, `${a} × ${b} = ${a * b}.`); },
  multBig() { const a = randInt(100, 999), b = randInt(11, 99); return numItem(`Multiply:  ${a} × ${b}`, a * b, `${a} × ${b} = ${a * b}.`); },
  multPowTen() { const a = randInt(2, 99), e = randInt(1, 4); return numItem(`Multiply:  ${a} × 10^${e}`, a * Math.pow(10, e), `${a} × 10^${e} = ${a} with ${e} zeros = ${(a * Math.pow(10, e)).toLocaleString()}.`); },
  multZeros() { const a = randInt(2, 9) * Math.pow(10, randInt(1, 3)), b = randInt(2, 9) * Math.pow(10, randInt(1, 2)); return numItem(`Multiply:  ${a} × ${b}`, a * b, `Multiply the non-zero parts, then add the zeros: ${a * b}.`); },
  estProduct() { const a = randInt(21, 89), b = randInt(21, 89); const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10; return numItem(`Estimate by rounding to the nearest ten:  ${a} × ${b}`, ra * rb, `${a}≈${ra}, ${b}≈${rb}. ${ra} × ${rb} = ${ra * rb}.`); },
  cmpProduct() { const a = randInt(10, 40), b = randInt(10, 40), c = randInt(10, 40), d = randInt(10, 40); const l = a * b, r = c * d; return mc(`Compare:  ${a}×${b}  ?  ${c}×${d}`, l > r ? '>' : l < r ? '<' : '=', l > r ? ['<', '='] : l < r ? ['>', '='] : ['>', '<'], `${l} vs ${r}.`); },
  divide() { const b = randInt(2, 12), q = randInt(11, 99); return numItem(`Divide:  ${b * q} ÷ ${b}`, q, `${b * q} ÷ ${b} = ${q}.`); },
  divBig() { const b = randInt(11, 40), q = randInt(11, 99); return numItem(`Divide:  ${b * q} ÷ ${b}`, q, `${b * q} ÷ ${b} = ${q}.`); },
  divRem() { const b = randInt(3, 12), q = randInt(11, 40), r = randInt(1, b - 1); return numItem(`Divide and give the remainder:  ${b * q + r} ÷ ${b}. (Enter the remainder.)`, r, `${b * q + r} ÷ ${b} = ${q} remainder ${r}.`); },
  divZeros() { const b = randInt(2, 9), q = randInt(2, 9) * Math.pow(10, randInt(1, 2)); return numItem(`Divide:  ${b * q} ÷ ${b}`, q, `${b * q} ÷ ${b} = ${q}.`); },
  estQuotient() { const b = randInt(11, 40), q = randInt(11, 40); const a = b * q + randInt(0, b - 1); return numItem(`Estimate the quotient (round to friendly numbers):  ${a} ÷ ${b}`, Math.round(a / b), `${a} ÷ ${b} ≈ ${Math.round(a / b)}.`, 1.5); },
  factors() { const n = randInt(12, 40); const f = factorsOf(n); const notF = []; for (let i = 2; i < n; i++) if (n % i !== 0) notF.push(i); return mc(`Which number is a factor of ${n}?`, pick(f.filter(x => x > 1 && x < n)) || 1, shuffle(notF).slice(0, 3), `A factor divides ${n} evenly. Factors: ${f.join(', ')}.`); },
  multiples() { const n = randInt(3, 12), k = randInt(2, 9); return mc(`Which is a multiple of ${n}?`, n * k, [n * k + 1, n * k - 1, n * k + 2].filter(x => x % n !== 0).concat([n * k + 3]), `${n} × ${k} = ${n * k}.`); },
  primeComp() { const n = randInt(4, 40); return mc(`Is ${n} prime or composite?`, isPrime(n) ? 'Prime' : 'Composite', isPrime(n) ? ['Composite', 'Neither'] : ['Prime', 'Neither'], isPrime(n) ? `${n} has only 1 and itself as factors → prime.` : `${n} has more than two factors → composite.`); },
  primeFact() { const n = pick([12, 18, 20, 24, 28, 30, 36, 40, 45, 48, 50]); const pf = primeFactors(n); const correct = pf.join(' × '); const bump = pf.slice(0, -1).concat(pf[pf.length - 1] + 1).join(' × '); return mc(`What is the prime factorization of ${n}?`, correct, [primeFactors(n + 2).join(' × '), primeFactors(n + 1).join(' × '), bump], `${n} = ${correct}.`); },
  divis() { const d = pick([2, 3, 4, 5, 6, 9, 10]); const yes = Math.random() < 0.5; let n = randInt(20, 400); if (yes) n = n - (n % d); else if (n % d === 0) n += 1; return mc(`Is ${n} divisible by ${d}?`, n % d === 0 ? 'Yes' : 'No', ['Yes', 'No'].filter(x => x !== (n % d === 0 ? 'Yes' : 'No')).concat(['Only sometimes']), `${n} ÷ ${d} ${n % d === 0 ? 'is exact' : 'leaves remainder ' + (n % d)}.`); },
  lcmGen() { const a = randInt(2, 9), b = randInt(2, 9); return numItem(`Find the least common multiple (LCM) of ${a} and ${b}.`, lcm(a, b), `LCM(${a}, ${b}) = ${lcm(a, b)}.`); },
  gcfGen() { const g = randInt(2, 8), a = g * randInt(2, 6), b = g * randInt(2, 6); return numItem(`Find the greatest common factor (GCF) of ${a} and ${b}.`, gcd(a, b), `GCF(${a}, ${b}) = ${gcd(a, b)}.`); },
  orderOps() { const a = randInt(2, 9), b = randInt(2, 9), c = randInt(2, 6); const withParen = Math.random() < 0.5; if (withParen) { const ans = (a + b) * c; return numItem(`Evaluate:  (${a} + ${b}) × ${c}`, ans, `Parentheses first: ${a}+${b}=${a + b}, then ×${c} = ${ans}.`); } const ans = a + b * c; return numItem(`Evaluate:  ${a} + ${b} × ${c}`, ans, `Multiply first: ${b}×${c}=${b * c}, then +${a} = ${ans}.`); },
  writeExpr() { let a = randInt(2, 12), b = randInt(2, 12); if (a === b) b = a + 1; return mc(`Which expression means "${a} more than the product of ${b} and a number n"?`, `${b}n + ${a}`, [`${b}(n + ${a})`, `${a}n + ${b}`, `${b}n - ${a}`], `"product of ${b} and n" = ${b}n, "${a} more" = + ${a}.`); },
  equivFrac() { const n = randInt(1, 5), d = randInt(n + 1, 9), k = randInt(2, 5); return mc(`Which fraction is equivalent to ${n}/${d}?`, `${n * k}/${d * k}`, [`${n * k}/${d}`, `${n}/${d * k}`, `${n + k}/${d + k}`], `Multiply top and bottom by ${k}: ${n * k}/${d * k}.`); },
  simplify() { const g = randInt(2, 6), n = randInt(1, 5) * g, d = randInt(6, 11) * g; return { type: 'text', prompt: `Write in lowest terms:  ${n}/${d}`, answer: fracStr(n, d), explanation: `Divide top and bottom by ${gcd(n, d)}: ${fracStr(n, d)}.` }; },
  impropMixed() { const w = randInt(1, 4), d = randInt(2, 6), r = randInt(1, d - 1); const imp = w * d + r; return { type: 'text', prompt: `Write as a mixed number:  ${imp}/${d}  (use the form  a b/c )`, answer: `${w} ${r}/${d}`, alt: [`${w} ${fracStr(r, d)}`], explanation: `${imp} ÷ ${d} = ${w} remainder ${r} → ${w} ${r}/${d}.` }; },
  lcdGen() { const d1 = randInt(2, 8), d2 = randInt(2, 9); return numItem(`What is the least common denominator of  1/${d1}  and  1/${d2}?`, lcm(d1, d2), `LCD = LCM(${d1}, ${d2}) = ${lcm(d1, d2)}.`); },
  cmpFrac() { const n1 = randInt(1, 5), d1 = randInt(n1 + 1, 8), n2 = randInt(1, 5), d2 = randInt(n2 + 1, 8); const l = n1 / d1, r = n2 / d2; return mc(`Compare:  ${n1}/${d1}  ?  ${n2}/${d2}`, l > r ? '>' : l < r ? '<' : '=', l > r ? ['<', '='] : l < r ? ['>', '='] : ['<', '>'], `${n1}/${d1} ≈ ${round(l, 2)}, ${n2}/${d2} ≈ ${round(r, 2)}.`); },
  addFrac() { const d1 = pick([2, 3, 4, 5, 6]), d2 = pick([2, 3, 4, 6, 8]); const n1 = randInt(1, d1 - 1), n2 = randInt(1, d2 - 1); const op = pick(['+', '-']); const L = lcm(d1, d2); let num = op === '+' ? n1 * (L / d1) + n2 * (L / d2) : n1 * (L / d1) - n2 * (L / d2); if (num < 0) { num = -num; } return { type: 'text', prompt: `Simplify:  ${n1}/${d1} ${op} ${n2}/${d2}  (write a/b or a whole number)`, answer: fracStr(num, L), explanation: `Common denominator ${L}: ${n1 * (L / d1)}/${L} ${op} ${n2 * (L / d2)}/${L} = ${fracStr(num, L)}.` }; },
  addMixed() { const w1 = randInt(1, 4), w2 = randInt(1, 4), d = pick([2, 3, 4, 6]); const n1 = randInt(1, d - 1), n2 = randInt(1, d - 1); const total = (w1 * d + n1) + (w2 * d + n2); const W = Math.floor(total / d), R = total % d; return { type: 'text', prompt: `Add:  ${w1} ${n1}/${d} + ${w2} ${n2}/${d}  (write as  a b/c  or a whole number)`, answer: R === 0 ? `${W}` : `${W} ${fracStr(R, d)}`, explanation: `Add wholes and fractions: total = ${fracStr(total, d)} = ${R === 0 ? W : W + ' ' + fracStr(R, d)}.` }; },
  multFrac() { const n1 = randInt(1, 5), d1 = randInt(n1 + 1, 7), n2 = randInt(1, 5), d2 = randInt(n2 + 1, 7); return { type: 'text', prompt: `Multiply:  ${n1}/${d1} × ${n2}/${d2}  (write in lowest terms)`, answer: fracStr(n1 * n2, d1 * d2), explanation: `Multiply tops and bottoms: ${n1 * n2}/${d1 * d2} = ${fracStr(n1 * n2, d1 * d2)}.` }; },
  multFracWhole() { const n = randInt(1, 5), d = randInt(n + 1, 8), w = randInt(2, 9); return { type: 'text', prompt: `Multiply:  ${w} × ${n}/${d}  (write a/b or a whole number)`, answer: fracStr(w * n, d), explanation: `${w} × ${n}/${d} = ${w * n}/${d} = ${fracStr(w * n, d)}.` }; },
  fracOfNum() { const d = pick([2, 3, 4, 5]), n = randInt(1, d - 1), k = d * randInt(2, 8); return numItem(`What is ${n}/${d} of ${k}?`, n * k / d, `${k} ÷ ${d} = ${k / d}, × ${n} = ${n * k / d}.`); },
  divFrac() { const whole = randInt(2, 8); const d = pick([2, 3, 4, 5]); if (Math.random() < 0.5) return numItem(`Divide:  ${whole} ÷ 1/${d}`, whole * d, `Dividing by 1/${d} means × ${d}: ${whole} × ${d} = ${whole * d}.`); return { type: 'text', prompt: `Divide:  1/${d} ÷ ${whole}  (write a/b)`, answer: fracStr(1, d * whole), explanation: `1/${d} ÷ ${whole} = 1/${d * whole}.` }; },
  reciprocal() { const n = randInt(2, 7), d = randInt(2, 9); return { type: 'text', prompt: `What is the reciprocal of ${n}/${d}?  (write a/b)`, answer: fracStr(d, n), explanation: `Flip it: ${d}/${n}.` }; },
  roundMixed() { const w = randInt(1, 8), d = pick([2, 3, 4, 5, 6]), r = randInt(1, d - 1); const ans = (r / d >= 0.5) ? w + 1 : w; return numItem(`Round ${w} ${r}/${d} to the nearest whole number.`, ans, `${r}/${d} ≈ ${round(r / d, 2)} → rounds ${r / d >= 0.5 ? 'up' : 'down'} to ${ans}.`); },
  decPV() { const v = (randInt(0, 99) + randInt(1, 99) / 100).toFixed(2); const correct = v.split('.')[1][1]; const wrong = new Set(); while (wrong.size < 3) { const d = String(randInt(0, 9)); if (d !== correct) wrong.add(d); } return mc(`In ${v}, which digit is in the hundredths place?`, correct, [...wrong], `The 2nd digit after the decimal point is the hundredths place → ${correct}.`); },
  cmpDec() { const a = +(randInt(1, 900) / 100).toFixed(2), b = +(randInt(1, 900) / 100).toFixed(2); return mc(`Compare:  ${a}  ?  ${b}`, a > b ? '>' : a < b ? '<' : '=', a > b ? ['<', '='] : a < b ? ['>', '='] : ['>', '<'], `${a} vs ${b}.`); },
  roundDec() { const v = +(randInt(100, 9999) / 100).toFixed(2); return numItem(`Round ${v} to the nearest whole number.`, Math.round(v), `${v} rounds to ${Math.round(v)}.`); },
  addDec() { const a = +(randInt(10, 9999) / 100).toFixed(2), b = +(randInt(10, 9999) / 100).toFixed(2); const op = pick(['+', '-']); const ans = +(op === '+' ? a + b : a - b).toFixed(2); return numItem(`Calculate:  ${a} ${op} ${b}`, ans, `Line up the decimal points: ${ans}.`, 0.005); },
  multDec() { const a = +(randInt(11, 99) / 10).toFixed(1), b = +(randInt(11, 99) / 10).toFixed(1); const ans = +(a * b).toFixed(2); return numItem(`Multiply:  ${a} × ${b}`, ans, `${a} × ${b} = ${ans}.`, 0.02); },
  multDecPow() { const a = +(randInt(10, 999) / 100).toFixed(2), e = randInt(1, 3); const ans = +(a * Math.pow(10, e)).toFixed(2); return numItem(`Multiply:  ${a} × 10^${e}`, ans, `Move the decimal point ${e} place(s) right: ${ans}.`, 0.005); },
  divDec() { const b = randInt(2, 9), q = +(randInt(11, 99) / 10).toFixed(1); const a = +(b * q).toFixed(1); return numItem(`Divide:  ${a} ÷ ${b}`, q, `${a} ÷ ${b} = ${q}.`, 0.02); },
  divDecPow() { const a = +(randInt(100, 9999) / 10).toFixed(1), e = randInt(1, 3); const ans = +(a / Math.pow(10, e)).toFixed(3); return numItem(`Divide:  ${a} ÷ 10^${e}`, ans, `Move the decimal point ${e} place(s) left: ${ans}.`, 0.0005); },
  convFracDec() { const d = pick([2, 4, 5, 10, 20, 25]), n = randInt(1, d - 1); const ans = +(n / d).toFixed(3); return numItem(`Convert ${n}/${d} to a decimal.`, ans, `${n} ÷ ${d} = ${ans}.`, 0.0005); },
  money() { const a = +(randInt(50, 5000) / 100).toFixed(2), b = +(randInt(50, 5000) / 100).toFixed(2); const op = pick(['+', '-']); const ans = +(op === '+' ? a + b : Math.abs(a - b)).toFixed(2); return numItem(`Calculate:  $${a} ${op} $${b}   (enter dollars, e.g. 12.50)`, ans, `$${a} ${op} $${b} = $${ans}.`, 0.005); },
  timeConv() { const kind = pick([{ w: 'How many minutes are in {n} hours?', f: 60, n: randInt(2, 9) }, { w: 'How many seconds are in {n} minutes?', f: 60, n: randInt(2, 9) }, { w: 'How many hours are in {n} days?', f: 24, n: randInt(2, 7) }]); return numItem(kind.w.replace('{n}', kind.n), kind.n * kind.f, `${kind.n} × ${kind.f} = ${kind.n * kind.f}.`); },
  custConv() { const kind = pick([{ w: 'How many inches are in {n} feet?', f: 12 }, { w: 'How many feet are in {n} yards?', f: 3 }, { w: 'How many ounces are in {n} pounds?', f: 16 }, { w: 'How many cups are in {n} pints?', f: 2 }]); const n = randInt(2, 9); return numItem(kind.w.replace('{n}', n), n * kind.f, `${n} × ${kind.f} = ${n * kind.f}.`); },
  metricConv() { const kind = pick([{ w: 'How many centimeters are in {n} meters?', f: 100 }, { w: 'How many meters are in {n} kilometers?', f: 1000 }, { w: 'How many grams are in {n} kilograms?', f: 1000 }, { w: 'How many milliliters are in {n} liters?', f: 1000 }]); const n = randInt(2, 9); return numItem(kind.w.replace('{n}', n), n * kind.f, `${n} × ${kind.f} = ${n * kind.f}.`); },
  pattern() { const start = randInt(1, 9), step = randInt(2, 9); const seq = [start, start + step, start + 2 * step, start + 3 * step]; return numItem(`What comes next?   ${seq.join(', ')}, ___`, start + 4 * step, `The pattern adds ${step} each time → ${start + 4 * step}.`); },
  coord() { const x = randInt(0, 9), y = randInt(0, 9); return mc(`A point is at (${x}, ${y}). How far right (x) from the origin is it?`, x, [y, x + 1, Math.max(0, x - 1)].filter((v, i, a) => a.indexOf(v) === i), `The first number in (x, y) is the horizontal distance: ${x}.`); },
  evalVar() { const a = randInt(2, 9), b = randInt(1, 9), x = randInt(2, 9); return numItem(`Evaluate  ${a}x + ${b}  when x = ${x}.`, a * x + b, `${a}×${x} + ${b} = ${a * x + b}.`); },
  mean() { const n = randInt(4, 5); let vals; do { vals = Array.from({ length: n }, () => randInt(2, 20)); } while (vals.reduce((a, b) => a + b, 0) % n !== 0); return numItem(`Find the mean (average) of:  ${vals.join(', ')}`, vals.reduce((a, b) => a + b, 0) / n, `Sum = ${vals.reduce((a, b) => a + b)}, ÷ ${n} = ${vals.reduce((a, b) => a + b) / n}.`); },
  median() { const vals = shuffle(Array.from({ length: 5 }, () => randInt(1, 30))); const s = vals.slice().sort((a, b) => a - b); return numItem(`Find the median of:  ${vals.join(', ')}`, s[2], `Sorted: ${s.join(', ')}. Middle value = ${s[2]}.`); },
  mode() { const base = randInt(2, 15); const vals = shuffle([base, base, randInt(16, 30), randInt(16, 30), randInt(16, 30)]); return numItem(`Find the mode of:  ${vals.join(', ')}`, base, `${base} appears most often.`); },
  range() { const vals = Array.from({ length: 5 }, () => randInt(1, 40)); const r = Math.max(...vals) - Math.min(...vals); return numItem(`Find the range of:  ${vals.join(', ')}`, r, `Range = max − min = ${Math.max(...vals)} − ${Math.min(...vals)} = ${r}.`); },
  classTri() { const kind = pick([['a triangle with all sides equal', 'Equilateral', ['Isosceles', 'Scalene']], ['a triangle with exactly two equal sides', 'Isosceles', ['Equilateral', 'Scalene']], ['a triangle with no equal sides', 'Scalene', ['Equilateral', 'Isosceles']], ['a triangle with a 90° angle', 'Right', ['Acute', 'Obtuse']]]); return mc(`What do you call ${kind[0]}?`, kind[1], kind[2], `${kind[1]} triangle.`); },
  classQuad() { const kind = pick([['4 equal sides and 4 right angles', 'Square', ['Rectangle', 'Rhombus']], ['opposite sides equal and 4 right angles', 'Rectangle', ['Square', 'Trapezoid']], ['exactly one pair of parallel sides', 'Trapezoid', ['Parallelogram', 'Rhombus']], ['4 equal sides (no right angles required)', 'Rhombus', ['Rectangle', 'Trapezoid']]]); return mc(`Which quadrilateral has ${kind[0]}?`, kind[1], kind[2], `That's a ${kind[1]}.`); },
  polygon() { const sides = randInt(3, 8); const names = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' }; return mc(`A polygon with ${sides} sides is called a...`, names[sides], Object.values(names).filter(x => x !== names[sides]).slice(0, 3), `${sides} sides → ${names[sides]}.`); },
  perimeter() { const l = randInt(3, 20), w = randInt(3, 20); return numItem(`Find the perimeter of a rectangle ${l} by ${w}.`, 2 * (l + w), `P = 2(l + w) = 2(${l} + ${w}) = ${2 * (l + w)}.`); },
  area() { const l = randInt(3, 20), w = randInt(3, 20); return numItem(`Find the area of a rectangle ${l} by ${w}.`, l * w, `A = l × w = ${l} × ${w} = ${l * w}.`); },
  volume() { const l = randInt(2, 12), w = randInt(2, 10), h = randInt(2, 10); return numItem(`Find the volume of a box ${l} × ${w} × ${h}.`, l * w * h, `V = l × w × h = ${l * w * h}.`); },
  financial() { const gross = randInt(20, 80) * 100, tax = randInt(5, 25); const net = Math.round(gross * (1 - tax / 100)); return numItem(`Gross pay is $${gross} and ${tax}% is taken for taxes. What is the net (take-home) pay? ($)`, net, `$${gross} × (1 − ${tax}%) = $${net}.`, 0.5); },

  /* ---------------------- GRADE 2 generators ---------------------- */
  countNext() { const n = randInt(1, 998); return numItem(`What number comes right after ${n}?`, n + 1, `After ${n} comes ${n + 1}.`); },
  countBefore() { const n = randInt(2, 999); return numItem(`What number comes right before ${n}?`, n - 1, `Before ${n} comes ${n - 1}.`); },
  skipCount() { const k = pick([2, 5, 10, 100]); const start = k * randInt(1, 6); const seq = [start, start + k, start + 2 * k, start + 3 * k]; return numItem(`Skip-count by ${k}:  ${seq.join(', ')}, ___`, start + 4 * k, `Keep adding ${k}: ${start + 4 * k}.`); },
  skipBack() { const k = pick([2, 5, 10]); const start = k * randInt(6, 12); const seq = [start, start - k, start - 2 * k, start - 3 * k]; return numItem(`Count backward by ${k}:  ${seq.join(', ')}, ___`, start - 4 * k, `Keep subtracting ${k}: ${start - 4 * k}.`); },
  compare2() { const max = pick([100, 1000]); const a = randInt(1, max), b = randInt(1, max); return mc(`Compare:  ${a}  ?  ${b}`, a > b ? '>' : a < b ? '<' : '=', a > b ? ['<', '='] : a < b ? ['>', '='] : ['>', '<'], `${a} ${a > b ? 'is greater than' : a < b ? 'is less than' : 'equals'} ${b}.`); },
  greatest() { const s = new Set(); while (s.size < 4) s.add(randInt(10, 999)); const arr = [...s], mx = Math.max(...arr); return mc(`Which number is the greatest?`, mx, arr.filter(x => x !== mx), `${mx} is the greatest.`); },
  least() { const s = new Set(); while (s.size < 4) s.add(randInt(10, 999)); const arr = [...s], mn = Math.min(...arr); return mc(`Which number is the least?`, mn, arr.filter(x => x !== mn), `${mn} is the least.`); },
  evenOdd() { const n = randInt(1, 100); return mc(`Is ${n} even or odd?`, n % 2 === 0 ? 'Even' : 'Odd', [n % 2 === 0 ? 'Odd' : 'Even'], `${n} is ${n % 2 === 0 ? 'even' : 'odd'} (${n % 2 === 0 ? 'ends in 0,2,4,6,8' : 'ends in 1,3,5,7,9'}).`); },
  doubles() { const n = randInt(1, 12); return numItem(`Double ${n}  (${n} + ${n})`, n + n, `${n} + ${n} = ${n + n}.`); },
  makeTen() { const a = randInt(1, 9); return numItem(`${a} + ___ = 10`, 10 - a, `${a} + ${10 - a} = 10.`); },
  addSmall() { const a = randInt(1, 9), b = randInt(1, 9); return numItem(`${a} + ${b}`, a + b, `${a} + ${b} = ${a + b}.`); },
  addThree() { const a = randInt(1, 9), b = randInt(1, 9), c = randInt(1, 9); return numItem(`${a} + ${b} + ${c}`, a + b + c, `${a} + ${b} + ${c} = ${a + b + c}.`); },
  subSmall() { const a = randInt(5, 20), b = randInt(1, a); return numItem(`${a} − ${b}`, a - b, `${a} − ${b} = ${a - b}.`); },
  addTwoDigit() { const a = randInt(10, 89), b = randInt(10, 99 - a > 0 ? 99 - a : 10); return numItem(`${a} + ${b}`, a + b, `${a} + ${b} = ${a + b}.`); },
  subTwoDigit() { const a = randInt(20, 99), b = randInt(1, a); return numItem(`${a} − ${b}`, a - b, `${a} − ${b} = ${a - b}.`); },
  addThreeDigit() { const a = randInt(100, 800), b = randInt(10, 199); return numItem(`${a} + ${b}`, a + b, `${a} + ${b} = ${a + b}.`); },
  subThreeDigit() { const a = randInt(200, 999), b = randInt(10, a - 100); return numItem(`${a} − ${b}`, a - b, `${a} − ${b} = ${a - b}.`); },
  add10or100() { const a = randInt(100, 800); const k = pick([10, 100]); return numItem(`${a} + ${k}`, a + k, `Add ${k}: ${a + k}.`); },
  placeTensOnes() { const t = randInt(1, 9), o = randInt(0, 9); return numItem(`${t} tens and ${o} ones make what number?`, t * 10 + o, `${t} tens = ${t * 10}, plus ${o} ones = ${t * 10 + o}.`); },
  digitValue2() { const digits = [randInt(1, 9), randInt(0, 9), randInt(0, 9)]; const num = +digits.join(''); const pos = randInt(0, 2); const places = ['hundreds', 'tens', 'ones']; const val = digits[pos] * Math.pow(10, 2 - pos); return numItem(`In ${num}, what is the value of the ${digits[pos]} (in the ${places[pos]} place)?`, val, `${digits[pos]} in the ${places[pos]} place = ${val}.`); },
  expand2() { const h = randInt(1, 9), t = randInt(1, 9), o = randInt(1, 9); const n = h * 100 + t * 10 + o; const correct = `${h * 100} + ${t * 10} + ${o}`; return mc(`Which is ${n} in expanded form?`, correct, [`${h * 100} + ${t * 10 + 10} + ${o}`, `${h * 100 + 100} + ${t * 10} + ${o}`, `${h * 10} + ${t * 10} + ${o}`], `${n} = ${correct}.`); },
  regroup() { const t = randInt(1, 9), o = randInt(10, 19); const total = t * 10 + o; return numItem(`${t} tens and ${o} ones is the same as what number?`, total, `${t * 10} + ${o} = ${total} (regroup 10 ones into a ten).`); },
  repeatedAdd() { const g = randInt(2, 5), s = randInt(2, 5); return numItem(`${g} groups of ${s}:  ${Array(g).fill(s).join(' + ')}`, g * s, `${g} groups of ${s} = ${g * s}.`); },
  arrays() { const r = randInt(2, 5), c = randInt(2, 5); return numItem(`An array has ${r} rows of ${c}. How many in all?`, r * c, `${r} × ${c} = ${r * c}.`); },
  factFamily() { const a = randInt(2, 9), b = randInt(2, 9); const s = a + b; return mc(`Which is in the fact family for ${a}, ${b}, and ${s}?`, `${s} − ${a} = ${b}`, [`${a} + ${s} = ${b}`, `${s} + ${a} = ${b}`, `${a} − ${b} = ${s}`], `Fact family: ${a}+${b}=${s}, ${b}+${a}=${s}, ${s}−${a}=${b}, ${s}−${b}=${a}.`); },
  roundTen() { const n = randInt(11, 99); return numItem(`Round ${n} to the nearest ten.`, Math.round(n / 10) * 10, `${n} rounds to ${Math.round(n / 10) * 10}.`); },
  roundTenHundred() { const n = randInt(101, 989); const k = pick([10, 100]); return numItem(`Round ${n} to the nearest ${k === 10 ? 'ten' : 'hundred'}.`, Math.round(n / k) * k, `${n} rounds to ${Math.round(n / k) * k}.`); },
  estSum2() { const a = randInt(11, 89), b = randInt(11, 89); const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10; return numItem(`Estimate ${a} + ${b} by rounding to the nearest ten.`, ra + rb, `${a}≈${ra}, ${b}≈${rb}. ${ra} + ${rb} = ${ra + rb}.`); },
  estDiff2() { const a = randInt(40, 99), b = randInt(11, a); const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10; return numItem(`Estimate ${a} − ${b} by rounding to the nearest ten.`, ra - rb, `${a}≈${ra}, ${b}≈${rb}. ${ra} − ${rb} = ${ra - rb}.`); },
  coinValue() { const c = pick([['penny', 1], ['nickel', 5], ['dime', 10], ['quarter', 25]]); return mc(`How many cents is a ${c[0]} worth?`, c[1] + '¢', [1, 5, 10, 25].filter(x => x !== c[1]).slice(0, 3).map(x => x + '¢'), `A ${c[0]} = ${c[1]}¢.`); },
  countCoins() { const p = randInt(0, 5), n = randInt(0, 4), d = randInt(0, 5); const total = p * 1 + n * 5 + d * 10; return numItem(`How many cents:  ${d} dimes, ${n} nickels, ${p} pennies?`, total, `${d}×10 + ${n}×5 + ${p}×1 = ${total}¢.`); },
  makeDollar() { const c = randInt(5, 95); return numItem(`You have ${c}¢. How many more cents make $1 (100¢)?`, 100 - c, `100 − ${c} = ${100 - c}¢.`); },
  makeChange() { const cost = randInt(10, 90), paid = 100; return numItem(`A toy costs ${cost}¢. You pay with $1 (100¢). How much change?`, paid - cost, `100 − ${cost} = ${paid - cost}¢.`); },
  addMoney() { const a = randInt(10, 80), b = randInt(5, 100 - 10); return numItem(`${a}¢ + ${b}¢`, a + b, `${a} + ${b} = ${a + b}¢.`); },
  timeAfter() { const h = randInt(1, 11), m = pick([15, 30, 45]); const tot = m; return { type: 'text', prompt: `What time is ${m} minutes after ${h}:00?  (write like ${h}:30)`, answer: `${h}:${String(m).padStart(2, '0')}`, explanation: `${m} minutes after ${h}:00 is ${h}:${String(m).padStart(2, '0')}.` }; },
  relateTime() { const q = pick([['minutes are in an hour', 60], ['hours are in a day', 24], ['days are in a week', 7]]); return numItem(`How many ${q[0]}?`, q[1], `There are ${q[1]} ${q[0].split(' ')[0]}.`); },
  amPm() { const q = pick([['eating breakfast at 8:00', 'A.M.'], ['going to bed at 9:00', 'P.M.'], ['the sun rising at 6:00', 'A.M.'], ['eating dinner at 7:00', 'P.M.']]); return mc(`Is ${q[0]} A.M. or P.M.?`, q[1], [q[1] === 'A.M.' ? 'P.M.' : 'A.M.'], `${q[0]} happens in the ${q[1] === 'A.M.' ? 'morning (A.M.)' : 'evening (P.M.)'}.`); },
  months() { const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; const i = randInt(0, 10); return mc(`Which month comes right after ${MO[i]}?`, MO[i + 1], [MO[(i + 2) % 12], MO[(i + 11) % 12], MO[(i + 3) % 12]], `After ${MO[i]} comes ${MO[i + 1]}.`); },
  readData() { const a = randInt(3, 9), b = randInt(1, a - 1); return numItem(`A chart shows 🐱 cats: ${a} and 🐶 dogs: ${b}. How many more cats than dogs?`, a - b, `${a} − ${b} = ${a - b}.`); },
  measureUnit() { const q = pick([['a pencil', 'inches', 'feet'], ['a car', 'feet', 'inches'], ['a book', 'inches', 'yards'], ['a playground', 'yards', 'inches']]); return mc(`Which unit best measures the length of ${q[0]}?`, q[1], [q[2]], `${q[0]} is best measured in ${q[1]}.`); },
  sides() { const shapes = [['triangle', 3], ['square', 4], ['rectangle', 4], ['pentagon', 5], ['hexagon', 6]]; const s = pick(shapes); return numItem(`How many sides does a ${s[0]} have?`, s[1], `A ${s[0]} has ${s[1]} sides.`); },
  name2D() { const shapes = [[3, 'triangle'], [4, 'quadrilateral'], [5, 'pentagon'], [6, 'hexagon']]; const s = pick(shapes); return mc(`What is a shape with ${s[0]} sides called?`, s[1], shapes.filter(x => x[1] !== s[1]).map(x => x[1]), `${s[0]} sides → ${s[1]}.`); },
  solid3D() { const solids = [['cube', 6, 12, 8], ['rectangular prism', 6, 12, 8], ['square pyramid', 5, 8, 5]]; const s = pick(solids); const kind = pick([['faces', 1], ['edges', 2], ['vertices', 3]]); const val = s[kind[1]]; return numItem(`How many ${kind[0]} does a ${s[0]} have?`, val, `A ${s[0]} has ${val} ${kind[0]}.`); },
  name3D() { const q = pick([['a ball', 'sphere'], ['a can of soup', 'cylinder'], ['a dice', 'cube'], ['an ice cream cone', 'cone']]); return mc(`Which solid shape is like ${q[0]}?`, q[1], ['sphere', 'cylinder', 'cube', 'cone'].filter(x => x !== q[1]).slice(0, 3), `${q[0]} is shaped like a ${q[1]}.`); },
  tileArea() { const r = randInt(2, 6), c = randInt(2, 6); return numItem(`A rectangle is ${r} squares tall and ${c} squares wide. How many squares cover it (the area)?`, r * c, `${r} × ${c} = ${r * c} squares.`); },
  identFrac() { const d = pick([2, 3, 4, 8]), n = randInt(1, d); return { type: 'text', prompt: `A shape has ${d} equal parts. ${n} ${n === 1 ? 'part is' : 'parts are'} shaded. What fraction is shaded?  (write like 1/${d})`, answer: `${n}/${d}`, explanation: `${n} out of ${d} parts = ${n}/${d}.` }; },
  fracParts() { const d = pick([2, 3, 4, 8]); const names = { 2: 'halves', 3: 'thirds', 4: 'fourths', 8: 'eighths' }; return numItem(`How many ${names[d]} make one whole?`, d, `It takes ${d} ${names[d]} to make a whole.`); },
  producerConsumer() { const q = pick([['bakes bread to sell', 'Producer'], ['buys a toy at the store', 'Consumer'], ['grows vegetables to sell', 'Producer'], ['eats at a restaurant', 'Consumer']]); return mc(`A person who ${q[0]} is a...`, q[1], [q[1] === 'Producer' ? 'Consumer' : 'Producer'], `Someone who ${q[0]} is a ${q[1].toLowerCase()}.`); },
  spendSave() { const q = pick([['putting money in a piggy bank', 'Saving'], ['buying candy', 'Spending'], ['keeping money for later', 'Saving'], ['paying for a movie ticket', 'Spending']]); return mc(`Is ${q[0]} spending or saving?`, q[1], [q[1] === 'Saving' ? 'Spending' : 'Saving'], `${q[0]} is ${q[1].toLowerCase()}.`); },

  /* ---------------- GRADE 6 "stretch" generators (above grade level) ------- */
  st_integers() { const a = randInt(-25, 25), b = randInt(-25, 25); const op = pick(['+', '−', '×']); const ans = op === '+' ? a + b : op === '−' ? a - b : a * b; return numItem(`${a < 0 ? '(' + a + ')' : a} ${op} ${b < 0 ? '(' + b + ')' : b}`, ans, `Mind the signs → ${ans}.`); },
  st_multiply() { const a = randInt(100, 999), b = randInt(11, 99); return numItem(`${a} × ${b}`, a * b, `${a} × ${b} = ${a * b}.`); },
  st_divide() { const d = randInt(12, 40), q = randInt(11, 99); return numItem(`${d * q} ÷ ${d}`, q, `${d * q} ÷ ${d} = ${q}.`); },
  st_orderOps() { const a = randInt(2, 6), b = randInt(2, 5), c = randInt(2, 6), d = randInt(2, 5); const ans = a * (b + c) - d * d; return numItem(`${a} × (${b} + ${c}) − ${d}²`, ans, `(${b}+${c})=${b + c}; ×${a}=${a * (b + c)}; ${d}²=${d * d}; = ${ans}.`); },
  st_fracMultDiv() { const n1 = randInt(1, 5), d1 = randInt(2, 6), n2 = randInt(1, 5), d2 = randInt(2, 6); if (Math.random() < 0.5) return { type: 'text', prompt: `Multiply (lowest terms):  ${n1}/${d1} × ${n2}/${d2}`, answer: fracStr(n1 * n2, d1 * d2), explanation: `${n1 * n2}/${d1 * d2} = ${fracStr(n1 * n2, d1 * d2)}.` }; return { type: 'text', prompt: `Divide (lowest terms):  ${n1}/${d1} ÷ ${n2}/${d2}`, answer: fracStr(n1 * d2, d1 * n2), explanation: `× reciprocal: ${n1}/${d1} × ${d2}/${n2} = ${fracStr(n1 * d2, d1 * n2)}.` }; },
  st_decimals() { const a = +(randInt(11, 99) / 10).toFixed(1), b = +(randInt(11, 99) / 10).toFixed(1); const ans = +(a * b).toFixed(2); return numItem(`${a} × ${b}`, ans, `${a} × ${b} = ${ans}.`, 0.02); },
  st_placeValue() { const digits = Array.from({ length: 7 }, (_, i) => i === 0 ? randInt(1, 9) : randInt(0, 9)); const num = +digits.join(''); const pos = randInt(0, 6); const val = digits[pos] * Math.pow(10, 6 - pos); const places = ['millions', 'hundred thousands', 'ten thousands', 'thousands', 'hundreds', 'tens', 'ones']; return numItem(`In ${num.toLocaleString()}, what is the value of the ${digits[pos]} in the ${places[pos]} place?`, val, `${digits[pos]} × ${Math.pow(10, 6 - pos).toLocaleString()} = ${val.toLocaleString()}.`); },
  st_area() { const a = randInt(2, 10), b = randInt(2, 10), c = randInt(2, 10), d = randInt(2, 10); return numItem(`A compound shape is a ${a}×${b} rectangle joined to a ${c}×${d} rectangle. Total area?`, a * b + c * d, `${a}×${b} + ${c}×${d} = ${a * b} + ${c * d} = ${a * b + c * d}.`); },
  st_stats() { const n = 4; const vals = Array.from({ length: n - 1 }, () => randInt(2, 20)); const meanTarget = randInt(6, 14); const missing = meanTarget * n - vals.reduce((a, b) => a + b, 0); if (missing < 0 || missing > 40) return GEN.mean(); return numItem(`The mean of ${n} numbers is ${meanTarget}. Three of them are ${vals.join(', ')}. Find the 4th.`, missing, `Total must be ${meanTarget}×${n}=${meanTarget * n}; − ${vals.reduce((a, b) => a + b)} = ${missing}.`); },
  st_lcmgcf() { const a = randInt(2, 9), b = randInt(2, 9), c = randInt(2, 9); return numItem(`Find the LCM of ${a}, ${b}, and ${c}.`, lcm(lcm(a, b), c), `LCM(${a},${b},${c}) = ${lcm(lcm(a, b), c)}.`); },

  /* ------------------------- GRADE 6 generators --------------------------- */
  g6_unitRate() { const per = randInt(2, 12), q = randInt(2, 9); const total = per * q; return numItem(`A car travels ${total} miles in ${q} hours. What is the speed in miles per hour?`, per, `${total} ÷ ${q} = ${per} mph.`); },
  g6_ratioTable() { const a = randInt(1, 6), b = randInt(1, 6), k = randInt(2, 6); return numItem(`The ratio ${a} : ${b} is equal to ${a * k} : ___`, b * k, `Multiply both parts by ${k}: ${b} × ${k} = ${b * k}.`); },
  g6_percentOf() { const p = pick([10, 20, 25, 50, 5, 75]), n = pick([20, 40, 60, 80, 100, 200, 24, 48]); return numItem(`What is ${p}% of ${n}?`, +(p * n / 100).toFixed(2), `${p}% = ${p / 100}; × ${n} = ${p * n / 100}.`); },
  g6_taxTip() { const price = randInt(10, 60), p = pick([10, 15, 20, 25]); const total = +(price * (1 + p / 100)).toFixed(2); return numItem(`A $${price} meal with a ${p}% tip. What is the total? ($)`, total, `$${price} + ${p}% = $${total}.`, 0.01); },
  g6_exponent() { const kind = pick([[2, randInt(2, 8)], [3, randInt(2, 4)], [5, randInt(2, 3)], [randInt(2, 9), 2]]); return numItem(`Evaluate:  ${kind[0]}^${kind[1]}`, Math.pow(kind[0], kind[1]), `${kind[0]}^${kind[1]} = ${Math.pow(kind[0], kind[1])}.`); },
  g6_absValue() { const n = randInt(1, 40) * pick([-1, -1, 1]); return numItem(`Evaluate:  |${n}|`, Math.abs(n), `Absolute value is distance from 0: |${n}| = ${Math.abs(n)}.`); },
  g6_oneStep() { const kind = Math.random() < 0.5; if (kind) { const a = randInt(2, 20), x = randInt(1, 20); return numItem(`Solve:  x + ${a} = ${x + a}`, x, `Subtract ${a}: x = ${x}.`); } const a = randInt(2, 9), x = randInt(2, 12); return numItem(`Solve:  ${a}x = ${a * x}`, x, `Divide by ${a}: x = ${x}.`); },
  g6_inequality() { const a = randInt(2, 12), b = randInt(13, 40); return numItem(`Solve for the smallest whole number:  x + ${a} > ${b}`, (b - a) + 1, `x > ${b - a}, so the smallest whole number is ${b - a + 1}.`); },
  g6_combineLike() { const a = randInt(2, 9), c = randInt(2, 9); return { type: 'text', prompt: `Combine like terms:  ${a}x + ${c}x  (write like 5x)`, answer: `${a + c}x`, explanation: `${a} + ${c} = ${a + c}, so ${a + c}x.` }; },
  g6_distribute() { const a = randInt(2, 6), b = randInt(2, 9), c = randInt(2, 9); return numItem(`Use the distributive property:  ${a} × (${b} + ${c})`, a * (b + c), `${a}×${b} + ${a}×${c} = ${a * b} + ${a * c} = ${a * (b + c)}.`); },
  g6_triangleArea() { const b = randInt(2, 20), h = randInt(2, 20); return numItem(`Area of a triangle with base ${b} and height ${h}?`, +(b * h / 2).toFixed(1), `A = ½ × b × h = ½ × ${b} × ${h} = ${b * h / 2}.`, 0.01); },
  g6_surfaceArea() { const s = randInt(2, 12); return numItem(`Surface area of a cube with side ${s}?`, 6 * s * s, `6 faces × ${s}² = 6 × ${s * s} = ${6 * s * s}.`); },
  g6_quadrant() { const x = randInt(-9, 9) || 3, y = randInt(-9, 9) || 4; const q = x > 0 && y > 0 ? 'I' : x < 0 && y > 0 ? 'II' : x < 0 && y < 0 ? 'III' : 'IV'; return mc(`Which quadrant is the point (${x}, ${y}) in?`, q, ['I', 'II', 'III', 'IV'].filter(z => z !== q), `x ${x > 0 ? '+' : '−'}, y ${y > 0 ? '+' : '−'} → Quadrant ${q}.`); },
};

// which base (Grade 5) generator gets an above-grade "Grade 6" stretch variant
const STRETCH_MAP = {
  addSub: 'st_integers', estimateSum: 'st_integers',
  multiply: 'st_multiply', multBig: 'st_multiply', multZeros: 'st_multiply', multPowTen: 'st_multiply',
  divide: 'st_divide', divBig: 'st_divide', divRem: 'st_divide', divZeros: 'st_divide',
  orderOps: 'st_orderOps', evalVar: 'st_orderOps', writeExpr: 'st_orderOps',
  equivFrac: 'st_fracMultDiv', simplify: 'st_fracMultDiv', addFrac: 'st_fracMultDiv', addMixed: 'st_fracMultDiv', multFrac: 'st_fracMultDiv', multFracWhole: 'st_fracMultDiv', fracOfNum: 'st_fracMultDiv', divFrac: 'st_fracMultDiv', cmpFrac: 'st_fracMultDiv', impropMixed: 'st_fracMultDiv', reciprocal: 'st_fracMultDiv',
  addDec: 'st_decimals', multDec: 'st_decimals', divDec: 'st_decimals', multDecPow: 'st_decimals', divDecPow: 'st_decimals', roundDec: 'st_decimals', cmpDec: 'st_decimals', convFracDec: 'st_decimals',
  placeValue: 'st_placeValue', expanded: 'st_placeValue', powTen: 'st_placeValue', powTenExp: 'st_placeValue',
  perimeter: 'st_area', area: 'st_area', volume: 'st_area',
  mean: 'st_stats', median: 'st_stats', mode: 'st_stats', range: 'st_stats',
  lcmGen: 'st_lcmgcf', gcfGen: 'st_lcmgcf', factors: 'st_lcmgcf', multiples: 'st_lcmgcf', primeFact: 'st_lcmgcf',
};
function stretchGenName(baseGen) { return STRETCH_MAP[baseGen] || null; }

/* --------------------- map every skill to a generator -------------------- */
function pickGen(unitId, name) {
  const s = name.toLowerCase();
  const has = (...w) => w.some(x => s.includes(x));
  if (has('roman numeral')) return 'roman';
  if (has('expanded form')) return 'expanded';
  if (has('word', 'spell') && !has('problem')) return 'wordName';
  if (has('place value', 'illustrated', 'decompose', 'compose')) return unitId.startsWith('W') || has('decimal') ? 'decPV' : 'placeValue';
  if (has('estimate') && has('product')) return 'estProduct';
  if (has('estimate') && has('quotient')) return 'estQuotient';
  if (has('estimate') && has('decimal')) return 'roundDec';
  if (has('estimate')) return 'estimateSum';
  if (has('power of ten', 'powers of ten') && has('exponent')) return 'powTenExp';
  if (has('power of ten', 'powers of ten') && has('multiply')) return 'multPowTen';
  if (has('power of ten', 'powers of ten') && has('divide')) return 'divDecPow';
  if (has('power of ten', 'powers of ten')) return 'powTen';
  if (has('prime factorization')) return 'primeFact';
  if (has('prime and composite', 'prime or composite')) return 'primeComp';
  if (has('divisibility')) return 'divis';
  if (has('least common multiple')) return 'lcmGen';
  if (has('greatest common factor')) return 'gcfGen';
  if (has('least common denominator')) return 'lcdGen';
  if (has('factor pair', 'identify factor', 'factors')) return 'factors';
  if (has('multiple')) return 'multiples';
  if (has('order of operations', 'parentheses', 'brackets', 'evaluate numerical', 'pemdas')) return 'orderOps';
  if (has('write numerical', 'write variable', 'write expression')) return 'writeExpr';
  if (has('evaluate variable', 'variable expression', 'two-variable', 'value using')) return 'evalVar';
  // fractions
  if (has('reciprocal')) return 'reciprocal';
  if (has('lowest terms', 'simplest form')) return 'simplify';
  if (has('improper', 'mixed number') && has('convert')) return 'impropMixed';
  if (has('round mixed', 'round') && has('mixed')) return 'roundMixed';
  if (has('equivalent fraction')) return 'equivFrac';
  if (has('compare fraction', 'order') && has('fraction') && !has('decimal')) return 'cmpFrac';
  if (has('fraction') && has('area')) return 'area';
  if (has('multiply') && has('mixed')) return 'addMixed';
  if (has('multiply') && has('fraction') && has('whole')) return 'multFracWhole';
  if (has('multiply') && has('fraction')) return 'multFrac';
  if (has('fractions of a number', 'fraction of a number')) return 'fracOfNum';
  if (has('divide') && has('fraction')) return 'divFrac';
  if (has('scaling')) return 'multFracWhole';
  if (has('add', 'subtract') && has('mixed')) return 'addMixed';
  if (has('add', 'subtract') && has('fraction')) return 'addFrac';
  // decimals
  if (has('convert') && has('decimal') && has('fraction')) return 'convFracDec';
  if (has('compare', 'order') && has('decimal')) return 'cmpDec';
  if (has('round') && has('decimal')) return 'roundDec';
  if (has('multiply') && has('decimal') && has('power')) return 'multDecPow';
  if (has('multiply') && has('decimal')) return 'multDec';
  if (has('divide') && has('decimal')) return 'divDec';
  if (has('add', 'subtract') && has('decimal')) return 'addDec';
  if (has('decimal')) return 'addDec';
  // money / time / units
  if (has('money', 'price', 'coin', 'income', 'budget', 'tax', 'financial', 'pay')) return has('income', 'tax', 'budget', 'pay', 'gross', 'net') ? 'financial' : 'money';
  if (has('time', 'convert time')) return 'timeConv';
  if (has('customary')) return 'custConv';
  if (has('metric')) return 'metricConv';
  // patterns / coordinate / data / geo
  if (has('pattern')) return 'pattern';
  if (has('coordinate', 'graph point', 'plane')) return 'coord';
  if (has('mode')) return 'mode';
  if (has('median')) return 'median';
  if (has('range')) return 'range';
  if (has('mean')) return 'mean';
  if (has('line plot', 'bar graph', 'line graph', 'frequency', 'stem', 'scatter', 'interpret')) return 'mean';
  if (has('triangle')) return 'classTri';
  if (has('quadrilateral', 'parallelogram', 'trapezoid', 'rectangle', 'rhombus', 'square')) return 'classQuad';
  if (has('polygon')) return 'polygon';
  if (has('perimeter')) return 'perimeter';
  if (has('area')) return 'area';
  if (has('volume')) return 'volume';
  // core operations by unit fallback
  if (has('add', 'subtract') && has('whole')) return 'addSub';
  if (has('add', 'subtract')) return 'addSub';
  if (has('multiply') && has('3-digit', '2-digit', 'larger', 'multi-digit')) return 'multBig';
  if (has('multiply')) return 'multiply';
  if (has('divide') && has('4-digit', '3-digit', '2-digit', 'multi-digit')) return 'divBig';
  if (has('divide') && has('remainder')) return 'divRem';
  if (has('divide')) return 'divide';
  if (has('properties of addition', 'properties')) return 'propAdd';
  // unit-level defaults
  const byUnit = { A: 'placeValue', B: 'addSub', C: 'powTen', D: 'multiply', E: 'divide', F: 'factors', G: 'addSub', H: 'orderOps', I: 'orderOps', J: 'simplify', K: 'cmpFrac', L: 'addFrac', M: 'addMixed', N: 'multFrac', O: 'multFracWhole', P: 'multFrac', Q: 'addMixed', R: 'addMixed', S: 'multFracWhole', T: 'divFrac', U: 'divFrac', V: 'addFrac', W: 'decPV', X: 'cmpDec', Y: 'convFracDec', Z: 'cmpDec', AA: 'addDec', BB: 'multDecPow', CC: 'multDec', DD: 'multDec', EE: 'divDecPow', FF: 'divDec', GG: 'addDec', HH: 'money', II: 'custConv', JJ: 'metricConv', KK: 'pattern', LL: 'coord', MM: 'evalVar', NN: 'mean', OO: 'mean', PP: 'classTri', QQ: 'classQuad', RR: 'polygon', SS: 'perimeter', TT: 'area', UU: 'volume', VV: 'financial' };
  return byUnit[unitId] || 'addSub';
}

/* ------------------------------- THE TREE -------------------------------- */
const PALETTE = ['#ff6b6b', '#4dabf7', '#20c997', '#f59f00', '#b197fc', '#ff922b', '#22b8cf', '#e64980', '#7048e8', '#94d82d'];
const ICONS = ['🔢', '➕', '🔟', '✖️', '➗', '🧮', '🟰', '📝', '🧩', '🍕', '⚖️', '➖', '🔺', '🟦', '📐', '📊', '💰', '⏱️', '📏', '🌡️', '🔁', '🗺️', '🔤', '📈', '📉', '🔻', '⬛', '🟩', '🧊', '🏦'];

// [unitId, unitName, [skill names...]]
const UNITS5 = [
  ['A', 'Whole numbers and place value', ['Convert between standard and expanded form', 'Place value', 'Relationship between place values', 'Write numbers in words', 'Spell word names for numbers up to one million', 'Roman numerals I, V, X, L, C, D, M']],
  ['B', 'Addition and subtraction', ['Estimate sums and differences of whole numbers', 'Estimate sums and differences: word problems', 'Add and subtract whole numbers', 'Add and subtract whole numbers: word problems', 'Complete addition and subtraction sentences', 'Properties of addition', 'Add using properties']],
  ['C', 'Powers of ten', ['Understanding powers of ten', 'Evaluate powers of ten', 'Write powers of ten with exponents']],
  ['D', 'Multiplication', ['Multiplication patterns over increasing place values', 'Multiply numbers ending in zeros', 'Multiply numbers ending in zeros: word problems', 'Multiply a whole number by a power of ten', 'Estimate products', 'Estimate products: word problems', 'Multiply by 1-digit numbers', 'Multiply by 1-digit numbers: word problems', 'Multiply by 2-digit numbers: complete the missing steps', 'Multiply 2-digit numbers by 2-digit numbers', 'Multiply 2-digit numbers by 3-digit numbers', 'Multiply 2-digit numbers by larger numbers', 'Multiply by 2-digit numbers: word problems', 'Multiply by 3-digit numbers', 'Properties of multiplication', 'Multiply using properties', 'Choose numbers with a particular product', 'Compare products of whole numbers']],
  ['E', 'Division', ['Division patterns over increasing place values', 'Divide numbers ending in zeros', 'Divide numbers ending in zeros: word problems', 'Estimate quotients: 2-digit divisors', 'Estimate quotients', 'Divide multi-digit numbers by 1-digit numbers', 'Divide by 1-digit numbers: interpret remainders', 'Divide multi-digit numbers by 1-digit numbers: word problems', 'Divide by 2-digit numbers: estimate and adjust', 'Divide by 2-digit numbers using models', 'Divide by 2-digit numbers using partial quotients', 'Divide 2-digit and 3-digit numbers by 2-digit numbers', 'Divide 2-digit and 3-digit numbers by 2-digit numbers: word problems', 'Divide 4-digit numbers by 2-digit numbers', 'Divide 4-digit numbers by 2-digit numbers: word problems', 'Adjust quotients', 'Relate multiplication and division', 'Complete the division sentence: 2-digit divisors', 'Choose numbers with a particular quotient']],
  ['F', 'Factors, multiples, and divisibility', ['Identify factors', 'Identify multiples', 'Prime and composite numbers', 'Prime factorization', 'Divisibility rules', 'Divisibility rules: word problems', 'Find all the factor pairs of a number', 'Least common multiple']],
  ['G', 'Mixed operations: whole numbers', ['Add, subtract, multiply, and divide whole numbers', 'Add, subtract, multiply, and divide whole numbers: word problems']],
  ['H', 'Numerical expressions', ['Write numerical expressions: one operation', 'Write numerical expressions: two operations', 'Evaluate numerical expressions', 'Evaluate numerical expressions with parentheses', 'Evaluate numerical expressions with parentheses and brackets', 'Identify mistakes involving the order of operations', 'Evaluate numerical expressions with parentheses in different places', 'Evaluate numerical expressions with fractions', 'Numerical operations: find the missing sign', 'Comparison statements with numerical expressions', 'Make the largest possible quotient']],
  ['I', 'Multi-step word problems', ['Write numerical expressions for word problems', 'Use numerical expressions to solve multi-step word problems', 'Represent multi-step problems using equations', 'Use equations with unknown numbers to solve multi-step word problems', 'Multi-step word problems', 'Multi-step word problems involving remainders', 'Multi-step word problems: identify reasonable answers', 'Multi-step word problems: multiplicative comparison']],
  ['J', 'Fractions and mixed numbers', ['Fractions review', 'Equivalent fractions', 'Write fractions in lowest terms', 'Convert between improper fractions and mixed numbers', 'Least common denominator', 'Round mixed numbers', 'Reciprocals']],
  ['K', 'Compare fractions', ['Graph and compare fractions on number lines', 'Compare fractions using benchmarks', 'Compare fractions and mixed numbers', 'Put fractions in order']],
  ['L', 'Add and subtract fractions', ['Estimate sums and differences of fractions using benchmarks', 'Add fractions with unlike denominators using models', 'Add fractions with unlike denominators', 'Subtract fractions with unlike denominators using models', 'Subtract fractions with unlike denominators', 'Add and subtract fractions with unlike denominators', 'Add and subtract fractions with unlike denominators: word problems', 'Add 3 or more fractions with unlike denominators', 'Add 3 or more fractions: word problems', 'Complete addition and subtraction sentences with fractions', 'Compare sums and differences of fractions']],
  ['M', 'Add and subtract mixed numbers', ['Estimate sums and differences of mixed numbers', 'Add and subtract mixed numbers with unlike denominators: without regrouping', 'Add mixed numbers with unlike denominators', 'Subtract mixed numbers with unlike denominators', 'Add and subtract mixed numbers', 'Add and subtract mixed numbers: word problems', 'Add and subtract fractions and mixed numbers in recipes', 'Add and subtract fractions and mixed numbers: multi-step word problems', 'Complete addition and subtraction sentences with mixed numbers', 'Compare sums and differences of mixed numbers']],
  ['N', 'Understand fraction multiplication', ['Multiply fractions by whole numbers: choose the model', 'Multiply fractions by whole numbers using models: complete the equation', 'Multiply fractions by whole numbers using number lines', 'Multiples of fractions: find the missing numbers', 'Multiply fractions by whole numbers using arrays', 'Fractions of a number: model and multiply', 'Multiply two unit fractions using models', 'Multiply two fractions using models', 'Multiply fractions greater than one using models']],
  ['O', 'Multiply fractions and whole numbers', ['Multiply fractions by whole numbers I', 'Multiply fractions by whole numbers II', 'Multiply fractions by whole numbers: word problems', 'Multiply fractions and whole numbers: sorting', 'Fractions of a number I', 'Fractions of a number: word problems', 'Fractions of a number II']],
  ['P', 'Multiply fractions', ['Multiply two fractions', 'Multiply two fractions: word problems', 'Multiply three fractions and whole numbers', 'Complete the fraction multiplication sentence I', 'Complete the fraction multiplication sentence II', 'Understand fraction multiplication and area', 'Multiply fractions to find area']],
  ['Q', 'Understand multiplication with mixed numbers', ['Multiply a mixed number by a whole number using a model I', 'Multiply a mixed number by a whole number using a model II', 'Multiply with mixed numbers using area models']],
  ['R', 'Multiply mixed numbers', ['Estimate products of mixed numbers', 'Multiply a mixed number by a whole number', 'Multiply a mixed number by a fraction', 'Multiply two mixed numbers', 'Multiply mixed numbers, fractions, and whole numbers', 'Multiply three mixed numbers, fractions, and whole numbers', 'Multiplication with mixed numbers: word problems', 'Multiply fractions and mixed numbers in recipes', 'Multiply fractions and mixed numbers: multi-step word problems']],
  ['S', 'Scaling by fractions', ['Scaling whole numbers by fractions: justify your answer', 'Scaling whole numbers by fractions', 'Scaling fractions by fractions', 'Scaling mixed numbers by fractions', 'Scaling by fractions and mixed numbers']],
  ['T', 'Understand fraction division', ['Relate division and fractions', 'Understand fractions as division: word problems', 'Divide unit fractions by whole numbers using models', 'Divide unit fractions by whole numbers using area models', 'Divide whole numbers by unit fractions using models', 'Divide whole numbers by unit fractions using area models', 'Divide unit fractions and whole numbers using area models', 'Divide unit fractions and whole numbers using number lines']],
  ['U', 'Divide unit fractions and whole numbers', ['Divide unit fractions by whole numbers', 'Divide whole numbers by unit fractions', 'Divide unit fractions and whole numbers', 'Divide unit fractions and whole numbers: word problems']],
  ['V', 'Mixed operations: fractions', ['Add, subtract, multiply, and divide fractions and mixed numbers', 'Add, subtract, multiply, and divide fractions and mixed numbers: word problems', 'Multi-step word problems with fractions and mixed numbers']],
  ['W', 'Decimal place value', ['What decimal number is illustrated?', 'Place value models for decimal numbers', 'Understanding decimals expressed in words', 'Place values in decimal numbers', 'Relationship between decimal place values', 'Convert decimals between standard and expanded form', 'Convert decimals between standard and expanded form using fractions', 'Compose and decompose decimals in multiple ways', 'Round decimals', 'Decimal number lines']],
  ['X', 'Compare decimals', ['Equivalent decimals', 'Compare decimals using grids', 'Compare decimals on number lines', 'Compare decimal numbers', 'Put decimal numbers in order using number lines', 'Put decimal numbers in order', 'Compare, order, and round decimals: word problems']],
  ['Y', 'Convert between decimals and fractions', ['Model decimals and fractions', 'Convert fractions to decimals', 'Convert mixed numbers to decimals', 'Convert decimals to fractions', 'Convert decimals to mixed numbers']],
  ['Z', 'Compare decimals and fractions', ['Compare decimals and fractions on number lines', 'Compare decimals and fractions', 'Put a mix of decimals and fractions in order', 'Put a mix of decimals, fractions, and mixed numbers in order']],
  ['AA', 'Add and subtract decimals', ['Add decimal numbers using blocks', 'Add decimal numbers', 'Use properties to add three decimals', 'Subtract decimal numbers using blocks', 'Subtract decimal numbers', 'Add and subtract decimal numbers', 'Use compensation to add and subtract decimals', 'Add and subtract decimals: word problems', 'Choose decimals with a particular sum or difference', 'Complete the decimal addition or subtraction sentence', 'Compare sums and differences of decimals', 'Number sequences involving decimals', 'Estimate sums and differences of decimals using rounding', 'Estimate sums and differences of decimals using benchmarks']],
  ['BB', 'Multiply decimals by powers of ten', ['Multiply a decimal by a power of ten', 'Multiply a decimal by a power of ten: with exponents', 'Multiply by 0.1 or 0.01', 'Multiply by a power of ten with decimals: find the missing number']],
  ['CC', 'Multiply decimals by whole numbers', ['Estimate products of whole numbers and decimals', 'Multiply a decimal by a one-digit whole number: tenths or hundredths', 'Multiply a decimal by a one-digit whole number using blocks', 'Multiply a decimal by a one-digit whole number using the distributive property', 'Multiply a decimal by a one-digit whole number', 'Multiply a decimal by a two-digit whole number using area models', 'Multiply a decimal by a multi-digit whole number', 'Multiply decimals and whole numbers: word problems', 'Multiply three or more numbers, one of which is a decimal']],
  ['DD', 'Multiply decimals', ['Estimate products of decimals', 'Multiply decimals less than one using grids', 'Multiply decimals using grids', 'Multiply two decimals: where does the decimal point go?', 'Multiply decimals using area models', 'Multiply two decimals: products up to hundredths', 'Multiply two decimals: products up to thousandths', 'Decimal multiplication: compare products up to hundredths', 'Decimal multiplication: compare products up to thousandths']],
  ['EE', 'Divide decimals by powers of ten', ['Divide by powers of ten', 'Decimal division patterns over increasing place values', 'Divide by a power of ten: with exponents', 'Multiply and divide by a power of ten: with exponents', 'Divide by a power of ten with decimals: find the missing number', 'Divide by 0.1 or 0.01']],
  ['FF', 'Divide decimals', ['Estimate decimal quotients', 'Divide decimals using blocks: complete the equation', 'Divide decimals using area models: complete the equation', 'Divide decimals by whole numbers using place value', 'Divide decimals by whole numbers without adding zeros', 'Division with decimal quotients', 'Division with decimal quotients and rounding', 'Division with decimal quotients: word problems', 'Divide by decimals using place value', 'Divide by decimals without adding zeros', 'Divide by decimals']],
  ['GG', 'Mixed operations: decimals', ['Add, subtract, multiply, and divide decimals', 'Add, subtract, multiply, and divide decimals: word problems', 'Add, subtract, multiply, and divide decimals: multi-step word problems', 'Equations with mixed operations: true or false']],
  ['HH', 'Money and time', ['Add and subtract money amounts', 'Add and subtract money: word problems', 'Add and subtract money: multi-step word problems', 'Multiply money amounts', 'Multiply money amounts: word problems', 'Multiply money amounts: multi-step word problems', 'Divide money amounts', 'Divide money amounts: word problems', 'Price lists', 'Unit prices', 'Find the number of each type of coin', 'Convert time units']],
  ['II', 'Customary units of measurement', ['Compare and convert customary units of length', 'Compare and convert customary units of weight', 'Compare and convert customary units of volume', 'Compare and convert customary units', 'Conversion tables - customary units', 'Compare customary units by multiplying', 'Convert customary units involving fractions', 'Convert mixed customary units', 'Add and subtract mixed customary units', 'Multi-step problems with customary unit conversions']],
  ['JJ', 'Metric units of measurement', ['Compare and convert metric units of length', 'Compare and convert metric units of mass', 'Compare and convert metric units of volume', 'Compare and convert metric units', 'Conversion tables - metric units', 'Convert metric mixed units', 'Add and subtract metric mixed units', 'Multi-step problems with metric unit conversions', 'Multi-step problems with customary or metric unit conversions']],
  ['KK', 'Number patterns', ['Use a rule to complete a number pattern', 'Compare patterns', 'Complete an increasing number pattern', 'Complete a multiplication number pattern', 'Number patterns: word problems', 'Number patterns: mixed review']],
  ['LL', 'Coordinate plane', ['Describe the coordinate plane', 'Objects on a coordinate plane', 'Graph points on a coordinate plane', 'Graph triangles and quadrilaterals', 'Graph points from a table', 'Use a rule to complete a table and a graph', 'Analyze graphed relationships', 'Coordinate planes as maps', 'Follow directions on a coordinate plane']],
  ['MM', 'Variable expressions', ['Write variable expressions', 'Write variable expressions: word problems', 'Evaluate variable expressions', 'Write variable equations: word problems', 'Find a value using two-variable equations', 'Complete a table for a two-variable relationship', 'Complete a table from a graph', 'Graph patterns using rules', 'Graph a two-variable relationship', 'Write a two-variable equation']],
  ['NN', 'Data and graphs', ['Interpret line plots with whole numbers', 'Create line plots with decimals', 'Create line plots with fractions', 'Create and interpret line plots with fractions', 'Interpret line plots with fractions: multi-step problems', 'Create line graphs', 'Interpret line graphs', 'Create bar graphs', 'Interpret bar graphs', 'Interpret bar graphs: multi-step problems', 'Create frequency tables', 'Interpret frequency tables: one-step problems', 'Interpret frequency tables: multi-step problems', 'Create stem-and-leaf plots', 'Interpret stem-and-leaf plots', 'Create scatter plots', 'Interpret scatter plots', 'Predictions and trends in scatter plots']],
  ['OO', 'Statistics', ['Find the mode', 'Find the mean', 'Find the median', 'Find the range', 'Mean: find the missing number', 'Median: find the missing number', 'Range: find the missing number', 'Interpret charts and graphs to find the mode', 'Interpret charts and graphs to find the mean', 'Interpret charts and graphs to find the median', 'Interpret charts and graphs to find the range']],
  ['PP', 'Triangles', ['Acute, obtuse, and right triangles', 'Scalene, isosceles, and equilateral triangles', 'Classify triangles']],
  ['QQ', 'Quadrilaterals', ['Parallel sides in quadrilaterals', 'Identify parallelograms', 'Identify trapezoids', 'Identify rectangles', 'Identify rhombuses', 'Classify quadrilaterals', 'Pick all the names for a quadrilateral', 'Draw quadrilaterals', 'Identify the relationships between quadrilaterals', 'Describe relationships among quadrilaterals']],
  ['RR', 'Polygons', ['Is it a polygon?', 'Number of sides in polygons', 'Regular and irregular polygons', 'Sort polygons into Venn diagrams', 'Properties of polygons']],
  ['SS', 'Perimeter', ['Perimeter with whole number side lengths', 'Perimeter with decimal side lengths', 'Perimeter with fractional side lengths', 'Perimeter of figures on grids']],
  ['TT', 'Area', ['Area of squares and rectangles', 'Area of rectangles with fractions', 'Area of rectangles with fractions and mixed numbers', 'Area of compound figures', 'Area between two rectangles', 'Area of figures on grids', 'Area and perimeter: word problems', 'Area and perimeter of rectangles with fractions', 'Area and perimeter of rectangles with decimals', 'Area and perimeter: multi-step word problems with unit conversions']],
  ['UU', 'Volume', ['Volume of irregular figures made of unit cubes', 'Volume of rectangular prisms made of unit cubes: expressions', 'Volume of rectangular prisms made of unit cubes', 'Volume of rectangular prisms made of unit cubes: word problems', 'Volume of cubes and rectangular prisms', 'Volume of cubes and rectangular prisms: word problems', 'Compare volumes and dimensions of rectangular prisms: word problems', 'Volume of cubes and rectangular prisms: multi-step word problems', 'Volume of compound figures', 'Volume of cubes and rectangular prisms with decimal side lengths', 'Compare and apply cubic units']],
  ['VV', 'Financial literacy', ['Income and payroll taxes: understanding pay stubs', 'Income and payroll taxes: word problems', 'Sales and property taxes: word problems', 'Identify types of taxes', 'Understand gross and net income', 'Calculate gross and net income', 'Identify advantages and disadvantages of payment methods', 'Evaluate payment methods', 'Reading financial records', 'Keeping financial records', 'Balance a budget', 'Adjust a budget']],
];

/* ---------------------- Grade 2 skill → generator map -------------------- */
function pickGen2(unitId, name) {
  const s = name.toLowerCase();
  const has = (...w) => w.some(x => s.includes(x));
  if (has('roman numeral')) return 'roman';
  if (has('skip-count', 'skip count') && has('back')) return 'skipBack';
  if (has('skip-count', 'skip count', 'count forward', 'count backward')) return 'skipCount';
  if (has('hundred chart', 'number line', 'count forward')) return 'countNext';
  if (has('greatest')) return 'greatest';
  if (has('least')) return 'least';
  if (has('comparing', 'compare')) return 'compare2';
  if (has('order')) return 'greatest';
  if (has('spell', 'word names', 'in words', 'writing numbers')) return 'wordName';
  if (has('even') || has('odd')) return 'evenOdd';
  if (has('double')) return 'doubles';
  if (has('make ten', 'make 10')) return 'makeTen';
  if (has('fact famil', 'related')) return 'factFamily';
  if (has('add in any order', 'properties', 'terms')) return 'factFamily';
  if (has('repeated addition', 'equal groups')) return 'repeatedAdd';
  if (has('array')) return 'arrays';
  if (has('round') && has('hundred')) return 'roundTenHundred';
  if (has('round')) return 'roundTen';
  if (has('estimate') && has('sum')) return 'estSum2';
  if (has('estimate') && has('difference')) return 'estDiff2';
  if (has('estimate')) return 'roundTen';
  // place value
  if (has('regroup')) return 'regroup';
  if (has('value of a digit', 'identify a digit', 'place value')) return 'digitValue2';
  if (has('expanded form')) return 'expand2';
  if (has('convert') && has('number')) return 'placeTensOnes';
  // money
  if (has('names and values', 'value') && has('coin')) return 'coinValue';
  if (has('change')) return 'makeChange';
  if (has('make a dollar', 'more to make')) return 'makeDollar';
  if (has('add') && has('money')) return 'addMoney';
  if (has('subtract') && has('money')) return 'addMoney';
  if (has('count money', 'enough money', 'exchanging', 'least number of coins', 'money')) return 'countCoins';
  // time / calendar
  if (has('a.m.', 'p.m.')) return 'amPm';
  if (has('relate time', 'time units')) return 'relateTime';
  if (has('clock', 'write times', 'read clocks')) return 'timeAfter';
  if (has('month', 'calendar', 'days in')) return 'months';
  // data
  if (has('tally', 'picture graph', 'bar graph', 'line plot', 'table', 'data', 'graph')) return 'readData';
  // measurement
  if (has('measure', 'length', 'inch', 'centimeter', 'metric', 'customary', 'unit')) return 'measureUnit';
  // geometry
  if (has('vertices', 'edges', 'faces') && has('three-dimensional', '3-d', 'solid', 'cube')) return 'solid3D';
  if (has('three-dimensional', '3-d') && has('real world', 'real-world', 'name')) return 'name3D';
  if (has('three-dimensional', 'cube', 'select three')) return 'solid3D';
  if (has('count sides', 'sides and vertices')) return 'sides';
  if (has('quadrilateral', 'pentagon', 'polygon', 'name polygons', 'classify polygons', 'two-dimensional')) return 'name2D';
  if (has('area')) return 'tileArea';
  if (has('perimeter')) return 'perimeter';
  // fractions
  if (has('make halves', 'make thirds', 'make fourths', 'make eighths', 'equal parts', 'make')) return 'fracParts';
  if (has('identify') && (has('half', 'third', 'fourth', 'eighth'))) return 'identFrac';
  if (has('count halves', 'count fourths', 'count')) return 'fracParts';
  if (has('fraction', 'halves', 'thirds', 'fourths', 'eighths')) return 'identFrac';
  // financial
  if (has('producer', 'consumer', 'cost to produce')) return 'producerConsumer';
  if (has('spend', 'saving', 'deposit', 'withdraw', 'borrow', 'lend')) return 'spendSave';
  // add/subtract by digit
  if (has('add') && has('three-digit', '3-digit', 'up to 1,000', 'up to three')) return 'add10or100';
  if (has('subtract') && has('three-digit', '3-digit', 'across zeros', 'up to three')) return 'subThreeDigit';
  if (has('add') && has('three') && has('digit')) return 'addThreeDigit';
  if (has('add') && (has('two-digit', 'two digit', 'up to two', 'multiple of 10'))) return 'addTwoDigit';
  if (has('subtract') && (has('two-digit', 'two digit', 'up to two'))) return 'subTwoDigit';
  if (has('add three', 'add four', 'three one-digit', 'four')) return 'addThree';
  if (has('add') && has('sums to 10')) return 'addSmall';
  if (has('add')) return 'addSmall';
  if (has('subtract')) return 'subSmall';
  if (has('addition and subtraction', 'mixed', 'which sign', 'balance', 'true', 'ways to make', 'inequal')) return 'addTwoDigit';
  // unit fallback
  const byUnit = { A: 'countNext', B: 'compare2', C: 'skipCount', D: 'wordName', E: 'evenOdd', F: 'addSmall', G: 'addSmall', H: 'subSmall', I: 'subSmall', J: 'addSmall', K: 'addSmall', L: 'placeTensOnes', M: 'addTwoDigit', N: 'addTwoDigit', O: 'subTwoDigit', P: 'subTwoDigit', Q: 'addTwoDigit', R: 'addTwoDigit', S: 'addThreeDigit', T: 'addThreeDigit', U: 'subThreeDigit', V: 'subThreeDigit', W: 'add10or100', X: 'repeatedAdd', Y: 'factFamily', Z: 'roundTen', AA: 'countCoins', BB: 'addMoney', CC: 'countCoins', DD: 'timeAfter', EE: 'months', FF: 'readData', GG: 'measureUnit', HH: 'measureUnit', II: 'name2D', JJ: 'solid3D', KK: 'tileArea', LL: 'identFrac', MM: 'spendSave' };
  return byUnit[unitId] || 'addSmall';
}

// Grade 2 tree — [unitId, unitName, [skill names...]]
const UNITS2 = [
  ['A', 'Counting', ['Hundred chart', 'Number lines - up to 100', 'Number lines - up to 1,000', 'Place numbers on number lines - up to 1,000', 'Count forward - up to 1,000']],
  ['B', 'Comparing and ordering', ['Comparing numbers up to 100', 'Put numbers up to 100 in order', 'Compare numbers up to 1,000 using number lines', 'Comparing numbers up to 1,000', 'Compare and order numbers up to 1,000 using number lines', 'Put numbers up to 1,000 in order', 'Greatest and least - word problems - up to 100', 'Greatest and least - word problems - up to 1,000']],
  ['C', 'Skip-counting and number patterns', ['Skip-count by twos', 'Skip-count by fives', 'Skip-count by tens', 'Skip-count by fives and tens', 'Skip-count by twos, fives, and tens', 'Skip-counting stories', 'Skip-counting sequences', 'Count forward and backward by fives and tens', 'Count forward and backward by twos, fives, and tens', 'Skip-counting puzzles', 'Count forward by tens - up to 1,000', 'Count forward by fives, tens, and hundreds', 'Count forward and backward by fives, tens, and hundreds', 'Count forward and backward by twos, fives, tens, and hundreds']],
  ['D', 'Names of numbers', ['Spell word names for numbers up to 20', 'Writing numbers up to 100 in words - convert words to digits', 'Writing numbers up to 100 in words - convert digits to words', 'Writing numbers up to 1,000 in words - convert words to digits', 'Writing numbers up to 1,000 in words - convert digits to words', 'Writing numbers up to 1,000 in words', 'Roman numerals I, V, X']],
  ['E', 'Even and odd', ['Even or odd number of shapes - up to 20', 'Identify even and odd numbers - up to 20', 'Addition sentences for even and odd numbers', 'Identify even and odd numbers - up to 40', 'Even or odd numbers on number lines', 'Identify even and odd numbers - up to 100', 'Select even and odd numbers - up to 100', 'Which even or odd number comes before or after?']],
  ['F', 'Addition strategies: one digit', ['Add doubles using models', 'Add doubles', 'Add doubles - complete the sentence', 'Add near doubles', 'Addition sentences using number lines - sums to 20', 'Add by counting on - sums to 20', 'Make ten to add', 'Add zero']],
  ['G', 'Addition: one digit', ['Add one-digit numbers - sums to 10', 'Add one-digit numbers - sums to 20', 'Sort addition facts - sums to 20', 'Addition word problems - sums to 20', 'Addition sentences for word problems - sums to 20', 'Complete the addition sentence - sums to 20', 'Balance addition equations - sums to 20', 'Which addition sentence is true? - sums to 20', 'Add three one-digit numbers', 'Addition word problems - three one-digit numbers', 'Add four or more one-digit numbers', 'Addition word problems - four or more one-digit numbers']],
  ['H', 'Subtraction strategies: one digit', ['Subtract doubles', 'Subtraction sentences using number lines - up to 20', 'Subtract by counting back - up to 20', 'Use ten to subtract', 'Subtract by counting on - up to 20', 'Count on and use ten to subtract - up to 20', 'Subtract zero or all']],
  ['I', 'Subtraction: one digit', ['Subtract one-digit numbers - up to 10', 'Subtract a one-digit number from a two-digit number up to 20', 'Subtraction word problems - up to 20', 'Subtraction sentences for word problems - up to 20', 'Complete the subtraction sentence - up to 20', 'Balance subtraction equations - up to 20', 'Which subtraction sentence is true? - up to 20']],
  ['J', 'Mixed operations: one digit', ['Addition and subtraction sentences using number lines - up to 20', 'Addition and subtraction - up to 20', 'Ways to make a number using addition and subtraction - up to 20', 'Balance addition and subtraction equations - up to 20', 'Which addition or subtraction sentence is true? - up to 20', 'Write the addition or subtraction rule for an input/output table - up to 20']],
  ['K', 'Mixed operations word problems: one digit', ['Comparison word problems - up to 20', 'Use models to solve addition and subtraction word problems - up to 20', 'Addition and subtraction word problems - up to 20', 'Write number sentences for word problems - up to 20', 'Match word problems to addition and subtraction sentences - up to 20', 'Two-step addition and subtraction word problems - up to 20', 'Solve word problems using guess-and-check - up to 20']],
  ['L', 'Place value', ['Place value models - tens and ones', 'Place value models - up to hundreds', 'Place value models - up to thousands', 'Identify a digit up to the hundreds place', 'Value of a digit - tens and ones', 'Value of a digit - up to hundreds', 'Value of a digit - up to thousands', 'Convert to/from a number - tens and ones', 'Regroup tens and ones - ways to make a number', 'Regroup tens and ones', 'Convert to/from a number - up to hundreds', 'Convert between place values - ones and hundreds', 'Convert between place values - ones, tens, and hundreds', 'Convert from expanded form - up to hundreds', 'Convert between standard and expanded form', 'Regroup hundreds, tens, and ones - ways to make a number', 'Guess the number']],
  ['M', 'Addition strategies: two digits', ['Break apart a one-digit number to add', 'Use models to add a two-digit and a one-digit number - without regrouping', 'Use models to add a two-digit and a one-digit number - with regrouping', 'Use number lines to add two-digit numbers', 'Break apart a two-digit number to add - sums to 100', 'Use compensation to add on a number line - up to two digits', 'Use compensation to add - up to two digits', 'Use models to add two-digit numbers - without regrouping', 'Use models to add two-digit numbers - with regrouping', 'Use place value to add two-digit numbers - without regrouping', 'Use place value to add two-digit numbers - with regrouping']],
  ['N', 'Addition: two digits', ['Add a two-digit and a one-digit number - without regrouping', 'Add a two-digit and a one-digit number - with regrouping', 'Add a multiple of 10 to a two-digit number', 'Add two-digit numbers without regrouping - sums to 100', 'Add two-digit numbers with regrouping - sums to 100', 'Add two-digit numbers - sums to 100', 'Add two-digit numbers vertically - sums to 100', 'Addition word problems - up to two digits', 'Ways to make a number using addition', 'Complete the addition sentence - up to two digits', 'Write the addition sentence - up to two digits', 'Balance addition equations - up to two digits', 'Add two-digit numbers - sums to 200', 'Add two-digit numbers vertically - sums to 200', 'Add three numbers up to two digits each', 'Addition word problems - three numbers up to two digits each', 'Add four numbers up to two digits each', 'Add three or four numbers vertically - up to two digits each', 'Addition word problems - four numbers up to two digits each']],
  ['O', 'Subtraction strategies: two digits', ['Break apart a one-digit number to subtract', 'Use models to subtract a one-digit number from a two-digit number - without regrouping', 'Use models to subtract a one-digit number from a two-digit number - with regrouping', 'Use number lines to subtract two-digit numbers', 'Break apart a two-digit number to subtract', 'Use compensation to subtract on a number line - up to two digits', 'Use compensation to subtract - up to two digits', 'Count on to subtract two-digit numbers', 'Use models to subtract two-digit numbers - without regrouping', 'Use models to subtract two-digit numbers - with regrouping', 'Use place value to subtract two-digit numbers - without regrouping', 'Use place value to subtract two-digit numbers - with regrouping']],
  ['P', 'Subtraction: two digits', ['Subtract a one-digit number from a two-digit number - without regrouping', 'Subtract a one-digit number from a two-digit number - with regrouping', 'Subtract a one-digit number from a two-digit number', 'Subtract a multiple of 10 from a two-digit number', 'Subtract two-digit numbers - without regrouping', 'Subtract two-digit numbers - with regrouping', 'Subtract two-digit numbers', 'Subtract two-digit numbers vertically', 'Ways to make a number using subtraction', 'Subtraction word problems - up to two digits', 'Complete the subtraction sentence - up to two digits', 'Write the subtraction sentence - up to two digits', 'Balance subtraction equations - up to two digits']],
  ['Q', 'Mixed operations: two digits', ['Add and subtract numbers - up to 100', 'Add and subtract with two-digit numbers vertically', 'Which sign (+ or -) makes the number sentence true? - up to 100', 'Ways to make a number using addition and subtraction - up to 100', 'Relate addition and subtraction sentences - up to two digits', 'Complete the addition or subtraction sentence - up to 100', 'Balance addition and subtraction equations - up to 100', 'Which addition or subtraction equation is true? - up to 100', 'Write addition and subtraction sentences', 'Inequalities with addition and subtraction - up to 100']],
  ['R', 'Mixed operations word problems: two digits', ['Use models to solve addition and subtraction word problems - up to 100', 'Addition and subtraction word problems - up to 100', 'Match addition and subtraction word problems to equations - up to 100', 'Two-step addition and subtraction word problems - up to 100']],
  ['S', 'Addition strategies: three digits', ['Use number lines to add three-digit numbers', 'Break apart a three-digit number to add', 'Use compensation to add - up to three digits', 'Use models to add three-digit numbers - without regrouping', 'Use models to add three-digit numbers - with regrouping', 'Use expanded form to add three-digit numbers - without regrouping', 'Use expanded form to add three-digit numbers - with regrouping', 'Use expanded form to add three-digit numbers']],
  ['T', 'Addition: three digits', ['Add 10 or 100 to a three-digit number', 'Add a multiple of 100 to a three-digit number', 'Add a multiple of 10 or 100 to a three-digit number', 'Addition with three-digit numbers - without regrouping', 'Addition with three-digit numbers - with regrouping', 'Addition with three-digit numbers', 'Add three-digit numbers vertically', 'Addition word problems - up to three digits', 'Complete the addition sentence - up to three digits', 'Write the addition sentence - up to three digits', 'Addition up to three digits - fill in the missing digits', 'Balance addition equations - up to three digits']],
  ['U', 'Subtraction strategies: three digits', ['Use number lines to subtract three-digit numbers', 'Break apart a three-digit number to subtract', 'Use compensation to subtract - up to three digits', 'Use models to subtract from three-digit numbers - without regrouping', 'Use models to subtract from three-digit numbers - with regrouping', 'Use expanded form to subtract three-digit numbers - without regrouping', 'Use expanded form to subtract three-digit numbers - with regrouping', 'Use expanded form to subtract three-digit numbers']],
  ['V', 'Subtraction: three digits', ['Subtract 10 or 100 from a three-digit number', 'Subtract a multiple of 100 from a three-digit number', 'Subtract a multiple of 10 or 100 from a three-digit number', 'Subtract across zeros', 'Subtract from three-digit numbers - without regrouping', 'Subtract from three-digit numbers - with regrouping', 'Subtract from three-digit numbers', 'Subtract from three-digit numbers vertically', 'Subtraction word problems - up to three digits', 'Complete the subtraction sentence - up to three digits', 'Write the subtraction sentence - up to three digits', 'Balance subtraction equations - up to three digits']],
  ['W', 'Mixed operations: three digits', ['Break apart a three-digit number to add or subtract', 'Use compensation to add or subtract - up to 1,000', 'Add and subtract numbers up to 1,000', 'Add and subtract with three-digit numbers vertically', 'Addition and subtraction word problems - up to 1,000', 'Solve inequalities using addition and subtraction shortcuts']],
  ['X', 'Repeated addition', ['Count equal groups', 'Identify repeated addition for equal groups - sums to 25', 'Write addition sentences for equal groups - sums to 25', 'Identify repeated addition for arrays - sums to 25', 'Write addition sentences for arrays - sums to 25', 'Solve word problems using repeated addition - sums to 25', 'Write stories involving repeated addition - sums to 25']],
  ['Y', 'Properties', ['Add in any order', 'Related addition facts', 'Related subtraction facts', 'Fact families', 'Addition and subtraction terms']],
  ['Z', 'Estimation and rounding', ['Estimate to the nearest ten', 'Round to the nearest ten', 'Round to the nearest ten or hundred', 'Estimate sums', 'Estimate differences']],
  ['AA', 'Money up to $1', ['Names and values of common coins', 'Names and values of all coins', 'Count money - groups of like coins', 'Count money - pennies, nickels, and dimes only', 'Count money up to $1', 'Equivalent amounts of money up to $1', 'Exchanging money - with pictures', 'Exchanging money', 'Exchanging money II', 'Least number of coins', 'Do you have enough money? - up to $1', 'How much more to make a dollar?', 'Correct amount of change', 'Making change']],
  ['BB', 'Add and subtract money up to $1', ['Add money up to $1', 'Add money up to $1: word problems', 'Subtract money up to $1', 'Subtract money up to $1: word problems', 'Add and subtract money up to $1', 'Add and subtract money up to $1: word problems']],
  ['CC', 'Money up to $100', ['Count money up to $5', 'Do you have enough money? - up to $5', 'Which picture shows more? - up to $5', 'Count money up to $100 - bills', 'Count money up to $100']],
  ['DD', 'Time', ['Match digital clocks and times', 'Match analog clocks and times', 'Match analog and digital clocks', 'Read clocks and write times: hour and half hour', 'Read clocks and write times', 'A.M. or P.M.', 'Compare clocks', 'Relate time units']],
  ['EE', 'Calendars', ['Months of the year', 'Read a calendar I', 'Read a calendar II', 'Number of days in each month']],
  ['FF', 'Data and graphs', ['Which tally chart is correct?', 'Interpret tally charts', 'Create picture graphs', 'Interpret picture graphs', 'Record data in tables', 'Interpret data in tables', 'Create bar graphs', 'Interpret bar graphs I', 'Interpret bar graphs II', 'Which bar graph is correct?', 'Create line plots', 'Interpret line plots']],
  ['GG', 'Customary units of length', ['Measure length with inch cubes', 'Measure using an inch ruler', 'Measure to compare length in inches', 'Estimate lengths with inches and feet', 'Estimate lengths with inches, feet, and yards', 'Measure with different customary units: inches, feet, and yards', 'Which customary unit of length is appropriate: inches or feet?', 'Which customary unit of length is appropriate: inches, feet, or yards?', 'Choose the best measuring tool: customary units of length', 'Compare lengths: customary units', 'Customary units of length: word problems']],
  ['HH', 'Metric units of length', ['Measure using a centimeter ruler', 'Measure to compare length in centimeters', 'Estimate lengths with centimeters and meters', 'Measure with different metric units', 'Which metric unit of length is appropriate?', 'Choose the best measuring tool: metric units of length', 'Compare lengths: metric units', 'Metric units of length: word problems']],
  ['II', 'Two-dimensional shapes', ['Count sides and vertices', 'Identify quadrilaterals', 'Identify pentagons', 'Name polygons: up to 6 sides', 'Classify polygons: up to 6 sides', 'Name polygons: up to 12 sides', 'Classify polygons: up to 12 sides', 'Sort two-dimensional shapes', 'Draw polygons', 'Compose two-dimensional shapes']],
  ['JJ', 'Three-dimensional shapes', ['Cubes', 'Select three-dimensional shapes', 'Name the three-dimensional shape', 'Count vertices, edges, and faces', 'Compare vertices, edges, and faces', 'Identify faces of three-dimensional shapes', 'Identify shapes traced from solids', 'Sort three-dimensional shapes', 'Three-dimensional shapes in the real world I', 'Three-dimensional shapes in the real world II', 'Three-dimensional shapes in real-world objects']],
  ['KK', 'Area and perimeter', ['Tile a rectangle with squares', 'Count the number of squares in a rectangle', 'Area', 'Find the perimeter of a rectangle using centimeter cubes']],
  ['LL', 'Fractions', ['Equal parts', 'Identify halves', 'Identify thirds', 'Identify fourths', 'Identify eighths', 'Identify halves, thirds, and fourths', 'Identify halves, fourths, and eighths', 'Make halves', 'Make thirds', 'Make fourths', 'Make eighths', 'Make halves, thirds, and fourths', 'Make halves, fourths, and eighths', 'Make halves, thirds, and fourths in different ways', 'Make halves, fourths, and eighths in different ways', 'Identify a half, a third, and a fourth', 'Identify a half, a fourth, and an eighth', 'Count halves, fourths, and eighths beyond one whole']],
  ['MM', 'Financial literacy', ['Spending and saving money', 'Deposits and withdrawals', 'Borrowing and lending money', 'Producers and consumers', 'Cost to produce an item']],
];

function buildCurriculum(subject, standard, units, mapper) {
  const cur = {
    subject, standard,
    units: units.map((u, i) => ({
      id: u[0], name: u[1], color: PALETTE[i % PALETTE.length], icon: ICONS[i % ICONS.length],
      skills: u[2].map((nm, j) => ({ id: u[0] + (j + 1), name: nm, gen: mapper(u[0], nm) })),
    })),
  };
  cur.allSkills = cur.units.flatMap(u => u.skills.map(s => ({ ...s, unitId: u.id, unitName: u.name, color: u.color })));
  return cur;
}
// Grade 6 (core topics) — real above-grade curriculum for the "move up" flow
const UNITS6 = [
  ['A', 'Ratios and rates', ['Understand ratios', 'Equivalent ratios', 'Unit rates', 'Ratio tables', 'Compare rates', 'Ratio word problems']],
  ['B', 'Percents', ['Percent of a number', 'Percents, fractions, and decimals', 'Tax and tip', 'Discount and sale price', 'Percent word problems']],
  ['C', 'Integers and negative numbers', ['Understand integers', 'Absolute value', 'Compare and order integers', 'Add integers', 'Subtract integers', 'Multiply and divide integers', 'Points on the coordinate plane']],
  ['D', 'The number system', ['Divide fractions', 'Multiply fractions', 'Add and subtract decimals', 'Multiply decimals', 'Divide decimals', 'Greatest common factor', 'Least common multiple']],
  ['E', 'Exponents and expressions', ['Exponents', 'Order of operations', 'Evaluate expressions', 'Write expressions', 'Combine like terms', 'The distributive property']],
  ['F', 'Equations and inequalities', ['One-step equations: addition and subtraction', 'One-step equations: multiplication and division', 'Write equations', 'Solve inequalities', 'Dependent and independent variables']],
  ['G', 'Geometry', ['Area of triangles', 'Area of quadrilaterals', 'Area of composite figures', 'Volume of rectangular prisms', 'Surface area', 'Nets of solids']],
  ['H', 'Statistics', ['Mean', 'Median', 'Mode', 'Range', 'Mean absolute deviation', 'Interpret data displays']],
];
function pickGen6(unitId, name) {
  const s = name.toLowerCase(); const has = (...w) => w.some(x => s.includes(x));
  if (has('unit rate', 'compare rate')) return 'g6_unitRate';
  if (has('equivalent ratio', 'ratio table', 'understand ratio', 'ratio word')) return 'g6_ratioTable';
  if (has('tax', 'tip')) return 'g6_taxTip';
  if (has('discount', 'sale')) return 'g6_taxTip';
  if (has('percent')) return 'g6_percentOf';
  if (has('absolute value')) return 'g6_absValue';
  if (has('coordinate', 'points on')) return 'g6_quadrant';
  if (has('add integers', 'subtract integers', 'multiply and divide integers', 'compare and order integers', 'understand integers', 'integer')) return 'st_integers';
  if (has('divide fractions', 'multiply fractions')) return 'st_fracMultDiv';
  if (has('decimal')) return 'st_decimals';
  if (has('greatest common factor')) return 'gcfGen';
  if (has('least common multiple')) return 'st_lcmgcf';
  if (has('exponent')) return 'g6_exponent';
  if (has('order of operations')) return 'st_orderOps';
  if (has('evaluate expression')) return 'evalVar';
  if (has('write expression', 'write equation')) return 'writeExpr';
  if (has('combine like terms')) return 'g6_combineLike';
  if (has('distributive')) return 'g6_distribute';
  if (has('one-step') && has('multiplication', 'division')) return 'g6_oneStep';
  if (has('one-step', 'equation')) return 'g6_oneStep';
  if (has('inequalit')) return 'g6_inequality';
  if (has('dependent', 'independent')) return 'evalVar';
  if (has('area of triangle')) return 'g6_triangleArea';
  if (has('surface area', 'nets')) return 'g6_surfaceArea';
  if (has('area')) return 'area';
  if (has('volume')) return 'volume';
  if (has('mean absolute')) return 'g6_absValue';
  if (has('median')) return 'median';
  if (has('mode')) return 'mode';
  if (has('range')) return 'range';
  if (has('mean', 'interpret data')) return 'mean';
  return 'st_integers';
}
const CURRICULA = {
  g5: buildCurriculum('Grade 5 Mathematics', 'Full curriculum · IXL-aligned scope', UNITS5, pickGen),
  g2: buildCurriculum('Grade 2 Mathematics', 'Full curriculum · IXL-aligned scope', UNITS2, pickGen2),
  g6: buildCurriculum('Grade 6 Mathematics', 'Core topics · above grade level', UNITS6, pickGen6),
};
const GRADES = [
  { id: 'g2', label: 'Grade 2', short: 'G2' },
  { id: 'g5', label: 'Grade 5', short: 'G5' },
  { id: 'g6', label: 'Grade 6', short: 'G6' },
];
// active curriculum (mutable) — the app rebinds these to whichever student is in view
let CURRICULUM = CURRICULA.g5;
let ALL_SKILLS = CURRICULA.g5.allSkills;
let ACTIVE_GRADE = 'g5';
function setActiveGrade(grade) { const g = CURRICULA[grade] ? grade : 'g5'; CURRICULUM = CURRICULA[g]; ALL_SKILLS = CURRICULA[g].allSkills; ACTIVE_GRADE = g; return g; }
function generateItem(genName) { return (GEN[genName] || GEN.addSub)(); }

if (typeof module !== 'undefined') { module.exports = { CURRICULA, GRADES, CURRICULUM, ALL_SKILLS, GEN, STRETCH_MAP, stretchGenName, generateItem, pickGen, pickGen2, setActiveGrade, gcd, reduceFrac }; }
