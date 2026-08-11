/* ============================================================================
   Ascend — Misconception engine ("diagnose, don't just mark wrong").
   Each detector inspects the kid's ACTUAL wrong answer and recognizes the
   predictable bug behind it (operation swap, forgot the carry, subtracted
   upward, added fraction labels…). On repeat offenses the app launches a
   short, targeted repair lesson built with THIS miss's own numbers.
   Loads after curriculum.js. Detection is pure + deterministic — no AI.
   ============================================================================ */

function parseBinaryOp(prompt) {
  const m = String(prompt).replace(/,/g, '').replace(/\s+/g, ' ').match(/(\d+) ?([+−×÷]) ?(\d+)/);
  return m ? { a: +m[1], op: m[2], b: +m[3] } : null;
}
function digitwiseAbsSub(a, b) { let out = 0, mul = 1; while (a > 0 || b > 0) { out += Math.abs(a % 10 - b % 10) * mul; mul *= 10; a = Math.floor(a / 10); b = Math.floor(b / 10); } return out; }
function hasBorrow(a, b) { while (a > 0 || b > 0) { if (a % 10 < b % 10) return true; a = Math.floor(a / 10); b = Math.floor(b / 10); } return false; }

const MISCONCEPTIONS = [
  {
    id: 'op-swap', name: 'Mixed up + and −',
    tip: 'Before homework, have them circle the sign in each problem and say "bigger or smaller?" out loud.',
    detect(item, g) {
      const p = parseBinaryOp(item.prompt); if (!p || !isFinite(g)) return false;
      const ans = Number(item.answer);
      if (p.op === '+' && p.a - p.b >= 0 && g === p.a - p.b && g !== ans) return true;
      if (p.op === '−' && g === p.a + p.b && g !== ans) return true;
      return false;
    },
    repair(item) {
      const p = parseBinaryOp(item.prompt);
      return { concept: 'The SIGN tells you the job. + means put together — the answer gets BIGGER. − means take away — the answer gets SMALLER. Read the sign before you touch the numbers!', steps: [
        `Look at the sign in ${p.a} ${p.op} ${p.b}. It's ${p.op} — that means ${p.op === '+' ? 'ADD: put the two amounts together' : 'SUBTRACT: take the second amount away'}.`,
        p.op === '+' ? `${p.a} + ${p.b} = ${p.a + p.b}. Check: ${p.a + p.b} is BIGGER than ${p.a} — adding grows. ✅` : `${p.a} − ${p.b} = ${p.a - p.b}. Check: ${p.a - p.b} is SMALLER than ${p.a} — subtracting shrinks. ✅`,
        `Your trick for next time: circle the sign FIRST, then ask "should my answer be bigger or smaller?" If it isn't — recheck!`,
      ] };
    },
  },
  {
    id: 'forgot-carry', name: 'Forgot to carry the ten',
    tip: 'Watch them do one 2-digit addition on paper and ask "where does the little 1 go?" when the ones pass 10.',
    detect(item, g) {
      const p = parseBinaryOp(item.prompt); if (!p || p.op !== '+' || !isFinite(g)) return false;
      const ans = Number(item.answer);
      return (p.a % 10) + (p.b % 10) >= 10 && (g === ans - 10 || g === ans - 100) && g > 0;
    },
    repair(item) {
      const p = parseBinaryOp(item.prompt); const ones = (p.a % 10) + (p.b % 10);
      return { concept: 'When the ones add up to 10 or more, a ten is BORN — and it must move to the tens column. Dropping it makes your answer exactly 10 too small!', steps: [
        `In ${p.a} + ${p.b}, the ones are ${p.a % 10} + ${p.b % 10} = ${ones}. That's ten or more!`,
        `Write ${ones % 10} in the ones place and CARRY the 1 ten — it's not optional, it's part of the answer.`,
        `With the carry: ${p.a} + ${p.b} = ${p.a + p.b}. Without it you'd get ${p.a + p.b - 10} — exactly 10 too small. That's the clue!`,
        `Next time your answer feels "10 off" — go find the missing carry. ✅`,
      ] };
    },
  },
  {
    id: 'sub-up', name: 'Subtracted the smaller digit "upward"',
    tip: 'Ask: "Can 3 take away 8?" Then trade a ten together with base-ten blocks or coins.',
    detect(item, g) {
      const p = parseBinaryOp(item.prompt); if (!p || p.op !== '−' || !isFinite(g)) return false;
      const ans = Number(item.answer);
      return hasBorrow(p.a, p.b) && g === digitwiseAbsSub(p.a, p.b) && g !== ans;
    },
    repair(item) {
      const p = parseBinaryOp(item.prompt);
      return { concept: 'In subtraction, the TOP digit is the boss — you always take the bottom away from the top. If the top digit is too small, you must BORROW a ten. Never flip them around!', steps: [
        `In ${p.a} − ${p.b}, look at the ones: ${p.a % 10} on top, ${p.b % 10} below. ${p.a % 10} is too small to give away ${p.b % 10}.`,
        `Flipping them (${p.b % 10} − ${p.a % 10}) feels easy — but it changes the problem! That's how you got ${digitwiseAbsSub(p.a, p.b)}.`,
        `The real move: borrow 1 ten. Now it's ${p.a % 10 + 10} − ${p.b % 10} = ${p.a % 10 + 10 - p.b % 10} in the ones.`,
        `Finish it properly: ${p.a} − ${p.b} = ${p.a - p.b}. Top is the boss — borrow, don't flip! ✅`,
      ] };
    },
  },
  {
    id: 'frac-add-labels', name: 'Added the tops AND the bottoms',
    tip: 'Fold two paper strips — thirds and fourths — and show that the pieces are different sizes, so they can\'t just be counted together.',
    detect(item, g, raw) {
      const m = String(item.prompt).match(/(\d+)\/(\d+) ?\+ ?(\d+)\/(\d+)/); if (!m) return false;
      const bad = `${+m[1] + +m[3]}/${+m[2] + +m[4]}`;
      return raw.replace(/\s/g, '') === bad && bad !== String(item.answer);
    },
    repair(item) {
      const m = String(item.prompt).match(/(\d+)\/(\d+) ?\+ ?(\d+)\/(\d+)/);
      return { concept: 'The bottom number is the SIZE of the pieces, not a thing to add. You can only add pieces when they\'re the SAME size — that\'s why we find a common denominator first.', steps: [
        `${m[1]}/${m[2]} + ${m[3]}/${m[4]}: the pieces are different sizes (${m[2]}ths and ${m[4]}ths). Adding the bottoms mixes up the sizes!`,
        `Think pizza: ${m[1]} slice of a ${m[2]}-slice pizza plus ${m[3]} slice of a ${m[4]}-slice pizza is NOT ${+m[1] + +m[3]} slices of a ${+m[2] + +m[4]}-slice pizza.`,
        `First make the pieces match (a common denominator), THEN add only the tops.`,
        `The bottoms never add — they just tell you what size the pieces are. ✅`,
      ] };
    },
  },
  {
    id: 'bigger-denom', name: 'Thought a bigger bottom number = a bigger fraction',
    tip: 'Cut two equal sandwiches — one into 4 pieces, one into 8 — and ask which single piece is bigger.',
    detect(item, g, raw) {
      if (!/which fraction is bigger/i.test(String(item.prompt))) return false;
      return /^1\/\d+$/.test(raw) && raw !== String(item.answer);
    },
    repair(item) {
      return { concept: 'More pieces means SMALLER pieces! When the tops match, the bigger bottom number means the whole was cut into more (smaller) parts — so the fraction is smaller.', steps: [
        `Imagine two same-size pizzas. Cut one into 4 slices, the other into 8 slices.`,
        `Which single slice is bigger? The one from the 4-cut pizza — fewer cuts, bigger slices!`,
        `So 1/4 > 1/8, even though 8 > 4. The bottom number counts the cuts, not the size.`,
        `Rule when tops match: SMALLER bottom = BIGGER fraction. ✅`,
      ] };
    },
  },
  {
    id: 'coins-as-ones', name: 'Counted every coin as 1¢',
    tip: 'Empty a pocket of change and count it together by VALUE — dimes by 10s, nickels by 5s.',
    detect(item, g) {
      const m = String(item.prompt).match(/(\d+) dimes?, (\d+) nickels?, (\d+) penn/); if (!m || !isFinite(g)) return false;
      const count = +m[1] + +m[2] + +m[3];
      return g === count && g !== Number(item.answer);
    },
    repair(item) {
      const m = String(item.prompt).match(/(\d+) dimes?, (\d+) nickels?, (\d+) penn/);
      const d = +m[1], n = +m[2], p = +m[3];
      return { concept: 'Coins are not all worth 1! Each coin carries its VALUE: a dime counts as ten, a nickel as five. Count values, not coins.', steps: [
        `You have ${d + n + p} coins — but that's the coin COUNT, not the money.`,
        `Count the dimes by TENS: ${Array.from({ length: d }, (_, i) => (i + 1) * 10).join(', ')}.`,
        `Keep going with nickels by FIVES, then pennies by ones: total ${d * 10 + n * 5 + p}¢.`,
        `${d + n + p} coins, but ${d * 10 + n * 5 + p}¢ of money. Always count the value! ✅`,
      ] };
    },
  },
  {
    id: 'round-trunc', name: 'Chopped down instead of rounding',
    tip: 'Draw a number line between two tens and ask "which ten is it CLOSER to?" for a few numbers ending in 6-9.',
    detect(item, g) {
      const m = String(item.prompt).replace(/,/g, '').match(/Round (\d+) to the nearest (ten|hundred|thousand)/i); if (!m || !isFinite(g)) return false;
      const n = +m[1], k = { ten: 10, hundred: 100, thousand: 1000 }[m[2].toLowerCase()];
      const down = Math.floor(n / k) * k, ans = Number(item.answer);
      return g === down && ans !== down;
    },
    repair(item) {
      const m = String(item.prompt).replace(/,/g, '').match(/Round (\d+) to the nearest (ten|hundred|thousand)/i);
      const n = +m[1], k = { ten: 10, hundred: 100, thousand: 1000 }[m[2].toLowerCase()];
      const down = Math.floor(n / k) * k, up = down + k, judge = Math.floor(n / (k / 10)) % 10;
      return { concept: 'Rounding is about which neighbor is CLOSER — not about chopping the end off. The judge digit (5 or more) sends you UP.', steps: [
        `${n} lives between ${down} and ${up} on the number line.`,
        `The judge digit here is ${judge}. Rule: 0–4 stays down, 5–9 goes UP.`,
        `${judge} means ${n} is closer to ${up} — so it rounds to ${up}, not ${down}.`,
        `Chopping always goes down. Rounding asks "which neighbor is closer?" ✅`,
      ] };
    },
  },
  {
    id: 'change-echo', name: 'Gave back the price instead of the change',
    tip: 'Play store with real coins: they pay you $1 for a 60¢ toy, and YOU count up the change out loud.',
    detect(item, g) {
      const m = String(item.prompt).match(/costs? (\d+)¢.*change/i); if (!m || !isFinite(g)) return false;
      return g === +m[1] && g !== Number(item.answer);
    },
    repair(item) {
      const m = String(item.prompt).match(/costs? (\d+)¢/i); const cost = +m[1];
      return { concept: 'Change is what comes BACK after paying — the money left over, not the price again. Change = what you paid − what it cost.', steps: [
        `The toy costs ${cost}¢ — that money goes TO the store. It's gone!`,
        `You handed over 100¢. The store keeps ${cost}¢ of it.`,
        `What comes back is the rest: 100 − ${cost} = ${100 - cost}¢. That's your change.`,
        `Cashier trick: count UP from ${cost} to 100. ✅`,
      ] };
    },
  },
  {
    id: 'digit-value', name: 'Said the digit instead of its value',
    tip: 'Write 44 and ask: "Are these two 4s worth the same?" Build both with blocks: 4 tens vs 4 ones.',
    detect(item, g) {
      const m = String(item.prompt).match(/value of the (\d)/i); if (!m || !isFinite(g)) return false;
      return g === +m[1] && Number(item.answer) !== +m[1];
    },
    repair(item) {
      const m = String(item.prompt).match(/value of the (\d)/i); const d = +m[1]; const ans = Number(item.answer);
      return { concept: 'A digit\'s VALUE depends on its seat. The same digit is worth different amounts in different places — the seat multiplies it!', steps: [
        `The digit is ${d} — but a digit is just a symbol until you check its SEAT.`,
        `Here the ${d} sits in the ${ans >= 100 ? 'hundreds' : ans >= 10 ? 'tens' : 'ones'} place.`,
        `So its value is ${d} × ${ans / d} = ${ans}, not ${d}.`,
        `Digit = the symbol. Value = symbol × seat. ✅`,
      ] };
    },
  },
  {
    id: 'count-slip', name: 'Off by one (counting slip)',
    tip: 'Slow the count down: have them touch each object once while counting out loud.',
    detect(item, g) {
      const ans = Number(item.answer);
      if (!isFinite(g) || !isFinite(ans) || ans > 30) return false;
      const p = parseBinaryOp(item.prompt);
      if (!p || (p.op !== '+' && p.op !== '−')) return false;
      return Math.abs(g - ans) === 1;
    },
    repair(item) {
      const p = parseBinaryOp(item.prompt);
      return { concept: 'So close — one off! That usually means the count started or stopped in the wrong spot. Start counting AFTER the number you\'re on.', steps: [
        `For ${p.a} ${p.op} ${p.b}: put ${p.a} in your head — don't count it again!`,
        `Count ${p.op === '+' ? 'UP' : 'BACK'} exactly ${p.b}: ${Array.from({ length: Math.min(p.b, 10) }, (_, i) => p.op === '+' ? p.a + i + 1 : p.a - i - 1).join(', ')}${p.b > 10 ? '…' : ''}.`,
        `You land on ${p.op === '+' ? p.a + p.b : p.a - p.b} exactly. The number you start on is already counted! ✅`,
      ] };
    },
  },
];

function detectMisconception(item, rawVal) {
  const raw = String(rawVal == null ? '' : rawVal).trim();
  const g = Number(raw.replace(/[^\d.\-/]/g, '').includes('/') ? NaN : raw);
  for (const m of MISCONCEPTIONS) {
    try { if (m.detect(item, g, raw)) return m; } catch (e) { /* a detector must never break practice */ }
  }
  return null;
}
function misconceptionById(id) { return MISCONCEPTIONS.find(m => m.id === id) || null; }

if (typeof module !== 'undefined') { module.exports = { MISCONCEPTIONS, detectMisconception, parseBinaryOp, digitwiseAbsSub }; }
