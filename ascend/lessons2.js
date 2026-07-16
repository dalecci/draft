/* ============================================================================
   Ascend — Grade 2 explained lessons ("the teacher").
   One rich lesson per GENERATOR, so every Grade 2 skill gets real teaching:
   a concept explained in kid language + a step-by-step worked example where
   every step says WHY, not just what. Lessons adapt to the skill's name
   (with/without regrouping, number lines, break apart, compensation…) and to
   its difficulty band (1-, 2-, or 3-digit), and can regenerate fresh examples.
   Loads after curriculum.js (uses randInt / pick from there).
   ============================================================================ */

/* ------------------------------ helpers ---------------------------------- */
function L2_band(skill) { const d = (skill && skill.pos) || 0; return d < 0.25 ? 1 : d < 0.46 ? 2 : 3; } // matches g2add caps
function L2_name(skill) { return ((skill && skill.name) || '').toLowerCase(); }
function L2_strategy(skill) {
  const s = L2_name(skill);
  if (s.includes('number line')) return 'numberline';
  if (s.includes('break apart')) return 'breakapart';
  if (s.includes('compensation')) return 'compensation';
  if (s.includes('expanded form')) return 'expanded';
  if (s.includes('model')) return 'models';
  if (s.includes('count on') || s.includes('counting on') || s.includes('use ten to')) return 'counton';
  if (s.includes('count back') || s.includes('counting back')) return 'countback';
  if (s.includes('vertical') || s.includes('place value')) return 'column';
  return null;
}
function L2_regroupWanted(skill) {
  const s = L2_name(skill);
  if (s.includes('without regrouping')) return 'no';
  if (s.includes('with regrouping')) return 'yes';
  if (s.includes('across zeros')) return 'zeros';
  return null;
}
function L2_pickAdd(band, want) { // pick a, b that match the regrouping requirement
  const cap = band === 1 ? 9 : band === 2 ? 99 : 999;
  for (let i = 0; i < 300; i++) {
    const a = randInt(band === 1 ? 3 : Math.floor(cap / 4), cap), b = randInt(band === 1 ? 2 : 11, Math.min(a, cap));
    const carry = (a % 10) + (b % 10) >= 10;
    if (want === 'yes' && !carry) continue;
    if (want === 'no' && carry) continue;
    return [a, b];
  }
  return [34, 25];
}
function L2_pickSub(band, want) {
  const cap = band === 1 ? 18 : band === 2 ? 99 : 999;
  for (let i = 0; i < 300; i++) {
    let a = randInt(band === 1 ? 5 : Math.floor(cap / 3), cap), b = randInt(2, a - 1);
    if (want === 'zeros' && band === 3) { a = randInt(2, 9) * 100 + randInt(0, 5); if (b >= a) b = a - randInt(7, 60); }
    const borrow = (a % 10) < (b % 10);
    if (want === 'yes' && !borrow) continue;
    if (want === 'no' && borrow) continue;
    if (want === 'zeros' && ((a % 100 >= 10) || (b % 10) <= (a % 10))) continue; // across zeros: 0 tens AND a real borrow
    if (b < 1 || b >= a) continue;
    return [a, b];
  }
  return [52, 27];
}
function L2_tens(n) { return Math.floor(n / 10) % 10; }
function L2_hund(n) { return Math.floor(n / 100); }
function L2_denoms(skill) { // which fraction parts the skill actually names
  const s = L2_name(skill); const out = [];
  if (s.includes('half') || s.includes('halves')) out.push(2);
  if (s.includes('third')) out.push(3);
  if (s.includes('fourth')) out.push(4);
  if (s.includes('eighth')) out.push(8);
  return out.length ? out : [2, 3, 4, 8];
}
const L2_ADD_CONCEPTS = {
  numberline: 'A number line turns adding into jumps! Start at the first number and hop to the RIGHT — big hops of ten first, then little hops of one. Where you land is the sum.',
  breakapart: 'Break one number apart into tens and ones, then add the pieces one at a time — tens first, then ones. Two easy adds beat one hard add!',
  compensation: 'Compensation is the "friendly number" trick: instead of adding a bumpy number, add the nearby ten (easy!), then give back the extra you added.',
  expanded: 'Expanded form stretches numbers out (476 = 400 + 70 + 6) so you can add hundreds with hundreds, tens with tens, and ones with ones — then squish it back together.',
  models: 'Base-ten blocks make adding real: build both numbers out of tens and ones, push all the blocks together, and if you collect 10 ones, trade them for 1 ten.',
  counton: 'Adding means putting groups together. Start with the bigger number and count on the smaller one — fewer counts, same answer!',
};
const L2_SUB_CONCEPTS = {
  numberline: 'A number line turns subtracting into jumps! Start at the bigger number and hop to the LEFT — big hops of ten first, then little hops of one.',
  breakapart: 'Break the number you’re taking away into tens and ones, then subtract the pieces one at a time — tens first, then ones.',
  compensation: 'Compensation for subtraction: take away a friendly ten instead (easy!), then give back the extra you took.',
  expanded: 'Expanded form stretches both numbers out so you can subtract hundreds from hundreds, tens from tens, and ones from ones.',
  models: 'Base-ten blocks make subtracting real: build the big number, take blocks away — and if you run out of ones, trade 1 ten for 10 ones.',
  counton: 'Here’s a secret: subtraction is just the DISTANCE between two numbers. Count UP from the small number to the big one, and the distance is your answer.',
  countback: 'Subtracting means taking away. Start at the first number and count back — the number always gets smaller.',
};

/* ------------------------ addition step builders ------------------------- */
function L2_addColumn(a, b) {
  const ans = a + b;
  const steps = [`Let's add ${a} + ${b}. Stack the numbers so the ones digits line up in a column.`];
  const ao = a % 10, bo = b % 10, so = ao + bo;
  let carry = so >= 10 ? 1 : 0;
  steps.push(so >= 10
    ? `Start with the ONES: ${ao} + ${bo} = ${so}. That's 10 or more, so we regroup — keep ${so % 10} in the ones place and carry 1 ten over. ✋`
    : `Start with the ONES: ${ao} + ${bo} = ${so}. Write ${so} in the ones place.`);
  if (a > 9 || b > 9 || carry) {
    const at = L2_tens(a), bt = L2_tens(b), st = at + bt + carry;
    steps.push(st > 9
      ? `Now the TENS: ${at} + ${bt}${carry ? ' + 1 we carried' : ''} = ${st} tens. Ten tens make a hundred! Keep ${st % 10} tens and carry 1 hundred.`
      : `Now the TENS: ${at} + ${bt}${carry ? ' + 1 we carried' : ''} = ${st} tens.`);
    carry = st > 9 ? 1 : 0;
    if (a > 99 || b > 99 || carry) {
      const ah = L2_hund(a), bh = L2_hund(b);
      steps.push(`Now the HUNDREDS: ${ah} + ${bh}${carry ? ' + 1 we carried' : ''} = ${ah + bh + carry}.`);
    }
  }
  steps.push(`Read the answer from the columns: ${a} + ${b} = ${ans}. ✅`);
  return steps;
}
function L2_addCountOn(a, b) {
  const ans = a + b, big = Math.max(a, b), small = Math.min(a, b);
  const counts = Array.from({ length: small }, (_, i) => big + i + 1).join(', ');
  return [
    `Let's add ${a} + ${b}. Adding means putting the two amounts together.`,
    `Trick: start with the BIGGER number, ${big}. That way there is less counting to do.`,
    `Now count on ${small} more: ${counts}.`,
    `We landed on ${ans}. So ${a} + ${b} = ${ans}. ✅`,
  ];
}
function L2_addNumberLine(a, b) {
  const ans = a + b;
  if (b < 10) {
    return [
      `Let's add ${a} + ${b} on a number line. Put your finger on ${a}.`,
      `Adding means the number gets BIGGER, so we jump to the RIGHT.`,
      `Make ${b} jumps of 1: ${Array.from({ length: b }, (_, i) => a + i + 1).join(', ')}.`,
      `You land on ${ans}. So ${a} + ${b} = ${ans}. ✅`,
    ];
  }
  const bt = Math.floor(b / 10), bo = b % 10;
  const tenStops = Array.from({ length: bt }, (_, i) => a + (i + 1) * 10).join(', ');
  const steps = [
    `Let's add ${a} + ${b} on a number line. Start at ${a}.`,
    `Big jumps first! ${b} has ${bt} tens, so make ${bt} jumps of 10: ${tenStops}.`,
  ];
  if (bo) steps.push(`Then ${bo} little jumps of 1 to land on ${ans}.`);
  steps.push(`So ${a} + ${b} = ${ans}. Big jumps, then little jumps. ✅`);
  return steps;
}
function L2_addBreakApart(a, b) {
  const ans = a + b, bt = Math.floor(b / 10) * 10, bo = b % 10;
  return [
    `Let's add ${a} + ${b}. Break ${b} apart by place value: ${b} = ${bt} + ${bo}.`,
    `Add the tens part first: ${a} + ${bt} = ${a + bt}. Adding tens is easy — only the tens change!`,
    `Now add the ones part: ${a + bt} + ${bo} = ${ans}.`,
    `So ${a} + ${b} = ${ans}. Breaking a number apart turns one hard step into two easy ones. ✅`,
  ];
}
function L2_addCompensation(a, b) {
  const rb = Math.ceil(b / 10) * 10, e = rb - b, ans = a + b;
  return [
    `Let's add ${a} + ${b}. Hmm, ${b} is not a friendly number… but it's close to ${rb}!`,
    `Add the friendly number instead: ${a} + ${rb} = ${a + rb}.`,
    `We added ${e} too many, so give ${e} back: ${a + rb} − ${e} = ${ans}.`,
    `So ${a} + ${b} = ${ans}. That's compensation: use a friendly number, then fix it up. ✅`,
  ];
}
function L2_addExpanded(a, b) {
  const ans = a + b;
  const px = n => [L2_hund(n) * 100, L2_tens(n) * 10, n % 10];
  const [ah, at, ao] = px(a), [bh, bt, bo] = px(b);
  return [
    `Let's add ${a} + ${b}. Stretch each number into expanded form:`,
    `${a} = ${ah} + ${at} + ${ao}, and ${b} = ${bh} + ${bt} + ${bo}.`,
    `Add the matching parts: hundreds ${ah} + ${bh} = ${ah + bh}, tens ${at} + ${bt} = ${at + bt}, ones ${ao} + ${bo} = ${ao + bo}.`,
    `Put the parts back together: ${ah + bh} + ${at + bt} + ${ao + bo} = ${ans}.`,
    `So ${a} + ${b} = ${ans}. ✅`,
  ];
}
function L2_addModels(a, b) {
  const ans = a + b, totOnes = a % 10 + b % 10;
  const d = n => `${Math.floor(n / 10)} tens and ${n % 10} ones`;
  const steps = [
    `Let's add ${a} + ${b} with base-ten blocks. Build each number: ${a} is ${d(a)}; ${b} is ${d(b)}.`,
    `Push all the blocks together. Now you have ${Math.floor(a / 10) + Math.floor(b / 10)} tens and ${totOnes} ones.`,
  ];
  if (totOnes >= 10) steps.push(`${totOnes} ones is enough to trade! Swap 10 ones for 1 ten rod. Now it's ${Math.floor(ans / 10)} tens and ${ans % 10} ones.`);
  steps.push(`Count the blocks: ${Math.floor(ans / 10)} tens = ${Math.floor(ans / 10) * 10}, plus ${ans % 10} ones = ${ans}. So ${a} + ${b} = ${ans}. ✅`);
  return steps;
}
function L2_addSteps(skill) {
  const band = L2_band(skill), strat = L2_strategy(skill), want = L2_regroupWanted(skill);
  const useBand = strat === 'models' ? Math.min(band, 2) : band;
  const [a, b] = L2_pickAdd(useBand, want || (strat === 'compensation' ? 'yes' : null));
  if (band === 1 || strat === 'counton') return L2_addCountOn(a, b);
  if (strat === 'numberline') return L2_addNumberLine(a, b);
  if (strat === 'breakapart') return L2_addBreakApart(a, b);
  if (strat === 'compensation') return L2_addCompensation(a, b === Math.floor(b / 10) * 10 ? b + randInt(6, 9) - 10 + 10 : b);
  if (strat === 'expanded') return L2_addExpanded(a, b);
  if (strat === 'models') return L2_addModels(a, b);
  return L2_addColumn(a, b);
}

/* ----------------------- subtraction step builders ----------------------- */
function L2_subColumn(a, b) {
  const ans = a - b;
  const steps = [`Let's subtract ${a} − ${b}. Stack them with the ones digits lined up. The bigger number goes on top.`];
  let ao = a % 10, at = L2_tens(a), ah = L2_hund(a);
  const bo = b % 10, bt = L2_tens(b), bh = L2_hund(b);
  if (ao < bo) {
    if (at === 0 && a >= 100) { steps.push(`We need to borrow a ten, but there are 0 tens! Borrow 1 hundred first and trade it for 10 tens.`); ah -= 1; at = 10; }
    steps.push(`ONES: ${ao} is too small to take away ${bo}. Borrow 1 ten and trade it for 10 ones → now ${ao + 10} ones. ${ao + 10} − ${bo} = ${ao + 10 - bo}. ✋`);
    at -= 1;
  } else {
    steps.push(`ONES: ${ao} − ${bo} = ${ao - bo}. No borrowing needed.`);
  }
  if (a > 9 && (bt > 0 || at > 0 || b > 9)) {
    if (at < bt) {
      steps.push(`TENS: ${at} is too small to take away ${bt}. Borrow 1 hundred → ${at + 10} tens. ${at + 10} − ${bt} = ${at + 10 - bt}.`);
      ah -= 1;
    } else {
      steps.push(`TENS: ${at} − ${bt} = ${at - bt}.`);
    }
  }
  if (a > 99 && (bh > 0 || ah > 0)) steps.push(`HUNDREDS: ${ah} − ${bh} = ${ah - bh}.`);
  steps.push(`Read the answer: ${a} − ${b} = ${ans}. ✅`);
  return steps;
}
function L2_subCountBack(a, b) {
  const counts = Array.from({ length: b }, (_, i) => a - i - 1).join(', ');
  return [
    `Let's subtract ${a} − ${b}. Subtracting means taking away, so the number gets SMALLER.`,
    `Start at ${a} and count BACK ${b}: ${counts}.`,
    `We landed on ${a - b}. So ${a} − ${b} = ${a - b}. ✅`,
  ];
}
function L2_subCountUp(a, b) {
  const ans = a - b;
  const steps = [`Let's subtract ${a} − ${b} a clever way: count UP from ${b} to ${a}, and see how far it is.`];
  let cur = b; const jumps = [];
  const nextTen = Math.ceil(b / 10) * 10;
  if (nextTen > b && nextTen <= a) { jumps.push(nextTen - cur); steps.push(`First hop from ${b} up to the friendly ten: ${nextTen}. That's a hop of ${nextTen - b}.`); cur = nextTen; }
  const lastStop = Math.floor(a / 10) * 10;
  if (lastStop > cur) { jumps.push(lastStop - cur); steps.push(`Now big hops by ten: from ${cur} to ${lastStop}. That's ${lastStop - cur} more.`); cur = lastStop; }
  if (a > cur) { jumps.push(a - cur); steps.push(`Last little hop: from ${cur} to ${a} is ${a - cur}.`); }
  steps.push(`Add up all the hops: ${jumps.join(' + ')} = ${ans}. So ${a} − ${b} = ${ans}. ✅`);
  return steps;
}
function L2_subNumberLine(a, b) {
  const ans = a - b;
  if (b < 10) {
    return [
      `Let's subtract ${a} − ${b} on a number line. Put your finger on ${a}.`,
      `Subtracting means the number gets SMALLER, so we jump to the LEFT.`,
      `Make ${b} jumps of 1: ${Array.from({ length: b }, (_, i) => a - i - 1).join(', ')}.`,
      `You land on ${ans}. So ${a} − ${b} = ${ans}. ✅`,
    ];
  }
  const bt = Math.floor(b / 10), bo = b % 10;
  const stops = Array.from({ length: bt }, (_, i) => a - (i + 1) * 10).join(', ');
  const steps = [
    `Let's subtract ${a} − ${b} on a number line. Start at ${a} and jump LEFT (smaller).`,
    `${b} has ${bt} tens, so make ${bt} big jumps of 10: ${stops}.`,
  ];
  if (bo) steps.push(`Then ${bo} little jumps of 1 to land on ${ans}.`);
  steps.push(`So ${a} − ${b} = ${ans}. ✅`);
  return steps;
}
function L2_subBreakApart(a, b) {
  const ans = a - b, bt = Math.floor(b / 10) * 10, bo = b % 10;
  return [
    `Let's subtract ${a} − ${b}. Break ${b} apart: ${b} = ${bt} + ${bo}.`,
    `Take away the tens first: ${a} − ${bt} = ${a - bt}.`,
    `Then take away the ones: ${a - bt} − ${bo} = ${ans}.`,
    `So ${a} − ${b} = ${ans}. Two easy steps instead of one hard one! ✅`,
  ];
}
function L2_subCompensation(a, b) {
  const rb = Math.ceil(b / 10) * 10, e = rb - b, ans = a - b;
  return [
    `Let's subtract ${a} − ${b}. ${b} is close to the friendly number ${rb}.`,
    `Subtract the friendly number: ${a} − ${rb} = ${a - rb}.`,
    `But we took away ${e} too many! Give ${e} back: ${a - rb} + ${e} = ${ans}.`,
    `So ${a} − ${b} = ${ans}. Friendly number first, then fix it. ✅`,
  ];
}
function L2_subExpanded(a, b) {
  const ans = a - b;
  let ah = L2_hund(a) * 100, at = L2_tens(a) * 10, ao = a % 10;
  const bh = L2_hund(b) * 100, bt = L2_tens(b) * 10, bo = b % 10;
  const steps = [
    `Let's subtract ${a} − ${b}. Stretch both into expanded form:`,
    `${a} = ${ah} + ${at} + ${ao}, and ${b} = ${bh} + ${bt} + ${bo}.`,
  ];
  if (ao < bo && at === 0) { steps.push(`The ones need help but there are no tens! Break a hundred into tens first: now ${a} = ${ah - 100} + ${at + 100} + ${ao}.`); ah -= 100; at += 100; }
  if (ao < bo) { steps.push(`Ones check: ${ao} is too small for − ${bo}. Break one ten into ones: now ${a} = ${ah} + ${at - 10} + ${ao + 10}.`); at -= 10; ao += 10; }
  if (at < bt) { steps.push(`Tens check: ${at} is too small for − ${bt}. Break one hundred into tens: now it's ${ah - 100} + ${at + 100} + ${ao}.`); ah -= 100; at += 100; }
  steps.push(`Subtract the matching parts: ${ah} − ${bh} = ${ah - bh}, ${at} − ${bt} = ${at - bt}, ${ao} − ${bo} = ${ao - bo}.`);
  steps.push(`Put the parts together: ${ah - bh} + ${at - bt} + ${ao - bo} = ${ans}. So ${a} − ${b} = ${ans}. ✅`);
  return steps;
}
function L2_subModels(a, b) {
  const ans = a - b, borrow = (a % 10) < (b % 10);
  const d = n => `${Math.floor(n / 10)} tens and ${n % 10} ones`;
  const steps = [`Let's subtract ${a} − ${b} with base-ten blocks. Build ${a}: that's ${d(a)}.`];
  if (borrow) steps.push(`We must take away ${b % 10} ones but only have ${a % 10}. Trade 1 ten rod for 10 ones — now there are ${a % 10 + 10} ones.`);
  steps.push(`Take away ${b}: remove ${Math.floor(b / 10)} tens and ${b % 10} ones.`);
  steps.push(`Count what's left: ${d(ans)} = ${ans}. So ${a} − ${b} = ${ans}. ✅`);
  return steps;
}
function L2_subSteps(skill) {
  const band = L2_band(skill), strat = L2_strategy(skill), want = L2_regroupWanted(skill);
  const useBand = strat === 'models' ? Math.min(band, 2) : band;
  let [a, b] = L2_pickSub(useBand, want);
  if (strat === 'counton') { // counting up shines when the hop crosses a ten
    let g = 0;
    while ((Math.floor(a / 10) === Math.floor(b / 10) || b % 10 === 0) && g++ < 100) [a, b] = L2_pickSub(useBand, want);
    return L2_subCountUp(a, b);
  }
  if (band === 1 || strat === 'countback') return L2_subCountBack(Math.min(a, 20), Math.min(b, 9));
  if (strat === 'numberline') return L2_subNumberLine(a, b);
  if (strat === 'breakapart') return L2_subBreakApart(a, b);
  if (strat === 'compensation') return L2_subCompensation(a, b);
  if (strat === 'expanded') return L2_subExpanded(a, b);
  if (strat === 'models') return L2_subModels(a, b);
  return L2_subColumn(a, b);
}

/* --------------------------- THE LESSON BOOK ----------------------------- */
const LESSON2 = {
  g2add: {
    concept(skill) {
      const band = L2_band(skill), strat = L2_strategy(skill);
      if (strat && L2_ADD_CONCEPTS[strat]) return L2_ADD_CONCEPTS[strat];
      if (band === 1) return L2_ADD_CONCEPTS.counton;
      return 'To add big numbers, use place value: add the ones first, then the tens' + (band === 3 ? ', then the hundreds' : '') + '. If any column adds up to 10 or more, regroup — trade 10 ones for 1 ten (or 10 tens for 1 hundred).';
    },
    vocab: [{ t: 'Sum', d: 'the answer to an addition problem' }, { t: 'Addends', d: 'the numbers being added' }, { t: 'Regroup', d: 'trade 10 ones for 1 ten (or 10 tens for 1 hundred)' }],
    misconception: 'When the ones add to 10 or more, don’t write both digits in the ones column! 47 + 5 is 52, not 412 — carry the ten over.',
    why: 'You add every day: counting your coins, your points in a game, or how many stickers you have in all.',
    teach(skill) { return { steps: L2_addSteps(skill) }; },
  },
  addSmall: {
    concept: 'Adding means putting two groups together to find how many in all. Start with the bigger number and count on the smaller one — that’s the fastest way!',
    vocab: [{ t: 'Sum', d: 'the answer to an addition problem' }, { t: 'Addends', d: 'the numbers being added' }],
    misconception: 'You can add in any order: 3 + 9 and 9 + 3 give the same answer. Pick the order that makes counting easier!',
    why: 'Quick adding helps with games, money, and everything that comes next in math.',
    teach() { const a = randInt(3, 9), b = randInt(2, 9); return { steps: L2_addCountOn(a, b) }; },
  },
  g2sub: {
    concept(skill) {
      const band = L2_band(skill), strat = L2_strategy(skill);
      if (strat && L2_SUB_CONCEPTS[strat]) return L2_SUB_CONCEPTS[strat];
      if (band === 1) return L2_SUB_CONCEPTS.countback;
      return 'To subtract big numbers, use place value: subtract the ones first, then the tens' + (band === 3 ? ', then the hundreds' : '') + '. If the top digit is too small, borrow from the next place — trade 1 ten for 10 ones.';
    },
    vocab: [{ t: 'Difference', d: 'the answer to a subtraction problem' }, { t: 'Borrow (regroup)', d: 'trade 1 ten for 10 ones when the top digit is too small' }],
    misconception: 'Always take the BOTTOM digit away from the TOP one. If the top is smaller, you must borrow — never just flip them around!',
    why: 'Subtracting tells you what’s left: your change at the store, or how many more points you need to win.',
    teach(skill) { return { steps: L2_subSteps(skill) }; },
  },
  g2mixed: {
    concept(skill) {
      const s = L2_name(skill);
      if (s.includes('which sign')) return 'Some puzzles hide the + or − sign. Here’s the secret: if the answer is BIGGER than the first number, it was addition. If it’s SMALLER, it was subtraction. Test the sign and check!';
      if (s.includes('balance')) return 'A balanced equation is like a seesaw: both sides must be worth the SAME amount. Work out one side first, then figure out what the other side needs to match it.';
      return 'Addition and subtraction are opposites — one undoes the other! If 6 + 3 = 9, then 9 − 3 must be 6. Knowing one fact gives you its partners for free.';
    },
    vocab: [{ t: 'Equation', d: 'a number sentence with an equals sign' }, { t: 'Fact family', d: 'a set of + and − facts using the same three numbers' }],
    misconception: 'The equals sign doesn’t mean "the answer comes next" — it means both sides are worth the same amount.',
    why: 'Real problems mix adding and subtracting: you earn some points, spend some, and need to know where you stand.',
    teach(skill) {
      const s = L2_name(skill), band = L2_band(skill);
      const cap = band === 1 ? 9 : band === 2 ? 89 : 899;
      if (s.includes('which sign')) {
        const a = randInt(5, cap), b = randInt(2, Math.min(a - 1, cap));
        return { steps: [
          `The puzzle: ${a} ? ${b} = ${a + b}. Which sign goes in the blank, + or −?`,
          `Look at the answer, ${a + b}. Is it bigger or smaller than ${a}? It's BIGGER.`,
          `Adding makes numbers bigger, subtracting makes them smaller. So the sign must be +.`,
          `Check it: ${a} + ${b} = ${a + b}. ✅ It works! (If the answer had been smaller, we'd pick −.)`,
        ] };
      }
      if (s.includes('balance')) {
        const a = randInt(3, cap), b = randInt(2, Math.min(cap, a + 5)), c = randInt(1, a + b - 1);
        return { steps: [
          `Balance this: ${a} + ${b} = ${c} + ___. Both sides must be worth the same.`,
          `Left side first: ${a} + ${b} = ${a + b}. So the right side must also make ${a + b}.`,
          `The right side already has ${c}. How much more to reach ${a + b}? ${a + b} − ${c} = ${a + b - c}.`,
          `So the blank is ${a + b - c}. Check: ${c} + ${a + b - c} = ${a + b}. Balanced! ⚖️ ✅`,
        ] };
      }
      const a = randInt(2, Math.min(cap, 9)), b = randInt(2, 9), sum = a + b;
      return { steps: [
        `Meet a fact family! Our three numbers are ${a}, ${b}, and ${sum}.`,
        `Addition facts: ${a} + ${b} = ${sum}, and ${b} + ${a} = ${sum}. (Order doesn't matter when adding.)`,
        `Now the opposites: ${sum} − ${b} = ${a}, and ${sum} − ${a} = ${b}. Subtraction UNDOES addition!`,
        `So if you know ${a} + ${b} = ${sum}, you already know four facts. That's the power of fact families. ✅`,
      ] };
    },
  },
  countNext: {
    concept: 'Counting forward means each number is exactly 1 more than the one before it. The tricky spots are when the ones digit hits 9 — then the tens go up and the ones start over at 0.',
    vocab: [{ t: 'One more', d: 'the next number when counting up' }, { t: 'Digit', d: 'one of the symbols 0–9 that build numbers' }],
    misconception: 'After 39 comes 40 — not 310! When ones reach 9, the ones reset to 0 and the tens digit grows by 1.',
    why: 'Counting is the base of ALL math — page numbers, scores, and money all count up.',
    teach() {
      const t = randInt(2, 97) * 10 + 9;
      return { steps: [
        `What comes right after ${t}? Let's think it through instead of guessing.`,
        `The ones digit is 9 — that's the last one before a full ten.`,
        `So the ones start over at 0, and the tens digit goes up by one.`,
        `${t} → ${t + 1}. Try whispering the count: ${t - 2}, ${t - 1}, ${t}, ${t + 1}. ✅`,
      ] };
    },
  },
  countBefore: {
    concept: 'Counting backward means each number is exactly 1 less. When the ones digit is 0, going back means the tens go down by one and the ones become 9.',
    vocab: [{ t: 'One less', d: 'the number just before when counting' }],
    misconception: 'Before 40 comes 39 — the tens went DOWN by one and the ones jumped to 9.',
    why: 'Counting back is how subtraction starts — and how you count down to a birthday!',
    teach() {
      const t = randInt(3, 98) * 10;
      return { steps: [
        `What comes right before ${t}?`,
        `The ones digit is 0 — we can't go lower in the ones, so we borrow from the tens.`,
        `The tens go down by one, and the ones become 9.`,
        `${t} → ${t - 1}. Check by counting up: ${t - 1}, then ${t}. ✅`,
      ] };
    },
  },
  skipCount: {
    concept: 'Skip-counting means counting by jumps of the same size — by 2s, 5s, 10s, or 100s — instead of one at a time. Each number is the last one PLUS the jump.',
    vocab: [{ t: 'Skip-count', d: 'count by equal jumps (2, 5, 10…)' }, { t: 'Pattern', d: 'something that repeats by a rule' }],
    misconception: 'The jump must stay the SAME every time. 5, 10, 15, 25 is wrong — it skipped 20!',
    why: 'Skip-counting is fast counting: nickels by 5s, dimes by 10s — and it’s secretly multiplication in disguise.',
    teach() {
      const k = pick([2, 5, 10, 100]); const start = k * randInt(1, 5);
      const seq = [start, start + k, start + 2 * k, start + 3 * k];
      const hint = k === 5 ? 'Numbers counted by 5 always end in 5 or 0.' : k === 10 ? 'Counting by 10 only changes the tens digit — the ones digit stays the same!' : k === 100 ? 'Counting by 100 only changes the hundreds digit.' : 'Counting by 2 skips every other number.';
      return { steps: [
        `Let's skip-count by ${k}, starting at ${start}: ${seq.join(', ')}, ___`,
        `The rule: each number = the one before it + ${k}.`,
        `${hint}`,
        `So the next number is ${seq[3]} + ${k} = ${start + 4 * k}. ✅`,
      ] };
    },
  },
  skipBack: {
    concept: 'Skip-counting backward means jumping DOWN by the same amount each time. Each number is the last one MINUS the jump.',
    vocab: [{ t: 'Count back', d: 'count downward, getting smaller' }],
    misconception: 'Going backward the numbers get SMALLER. If your numbers are growing, you’re jumping the wrong way!',
    why: 'Counting down helps with change at the store and rocket launches. 🚀',
    teach() {
      const k = pick([2, 5, 10]); const start = k * randInt(7, 12);
      const seq = [start, start - k, start - 2 * k, start - 3 * k];
      return { steps: [
        `Count backward by ${k}, starting at ${start}: ${seq.join(', ')}, ___`,
        `The rule: each number = the one before it − ${k}.`,
        `Check the pattern: ${seq[0]} − ${k} = ${seq[1]}, and ${seq[1]} − ${k} = ${seq[2]}. It works!`,
        `So the next number is ${seq[3]} − ${k} = ${start - 4 * k}. ✅`,
      ] };
    },
  },
  compare2: {
    concept: 'To compare two numbers, look at the digits from LEFT to right. More hundreds wins. Same hundreds? Compare tens. Same tens? Compare ones. The open mouth of the sign (< or >) always eats the bigger number!',
    vocab: [{ t: '>', d: 'greater than — the left number is bigger' }, { t: '<', d: 'less than — the left number is smaller' }, { t: '=', d: 'both are worth the same' }],
    misconception: 'More digits beats fewer digits: 100 is bigger than 99, even though 9s look big. Always check length first!',
    why: 'Comparing tells you who scored more, which price is cheaper, and which line is shorter.',
    teach() {
      const t = randInt(2, 8), a = t * 100 + randInt(1, 9) * 10 + randInt(0, 9); let b = t * 100 + randInt(1, 9) * 10 + randInt(0, 9);
      if (b === a) b = b - (b % 10) + ((b % 10 + 3) % 10); // nudge the ones only, so the hundreds/tens story stays true
      const bigger = Math.max(a, b), sign = a > b ? '>' : '<';
      return { steps: [
        `Which is bigger: ${a} or ${b}? Compare digits from the left, like reading a book.`,
        `HUNDREDS first: both have ${t} hundreds. Tie! Move to the next place.`,
        `TENS: ${L2_tens(a)} tens vs ${L2_tens(b)} tens${L2_tens(a) === L2_tens(b) ? ' — another tie, so check the ONES: ' + a % 10 + ' vs ' + b % 10 : ''}. ${bigger} wins.`,
        `Write it with the hungry sign eating the bigger number: ${a} ${sign} ${b}. ✅`,
      ] };
    },
  },
  greatest: {
    concept: 'To find the greatest number in a group, compare them place by place: the most hundreds wins; if tied, the most tens; if still tied, the most ones. Numbers with more digits are automatically bigger.',
    vocab: [{ t: 'Greatest', d: 'the biggest number in the group' }, { t: 'Place value', d: 'what a digit is worth based on its spot' }],
    misconception: 'Don’t just look for big digits! 91 beats 89 even though 8 and 9 "look" close — the tens place decides it.',
    why: 'Finding the greatest (or least) helps you spot the high score, the best deal, and the longest jump.',
    teach() {
      const s = new Set(); while (s.size < 4) s.add(randInt(80, 999));
      const arr = [...s], mx = Math.max(...arr);
      const three = arr.filter(x => String(x).length === 3);
      return { steps: [
        `Find the greatest: ${arr.join(', ')}.`,
        `Step 1 — count digits: a 3-digit number always beats a 2-digit number.${three.length < arr.length ? ' So we can ignore the short ones!' : ' They all have 3 digits here, so we compare places.'}`,
        `Step 2 — compare the biggest place first (hundreds), then tens, then ones if needed.`,
        `The winner is ${mx}. 🏆 ✅`,
      ] };
    },
  },
  least: {
    concept: 'To find the least (smallest) number, compare place by place just like finding the greatest — but now the FEWEST hundreds wins. A number with fewer digits is automatically smaller.',
    vocab: [{ t: 'Least', d: 'the smallest number in the group' }],
    misconception: 'A short number is small even if its digits look big: 99 is less than 100.',
    why: 'Least = cheapest price, shortest wait, fewest mistakes. Good things to find!',
    teach() {
      const s = new Set(); while (s.size < 4) s.add(randInt(80, 999));
      const arr = [...s], mn = Math.min(...arr);
      return { steps: [
        `Find the least: ${arr.join(', ')}.`,
        `Fewer digits means smaller — check for 2-digit numbers first.`,
        `Then compare hundreds (fewest wins), then tens, then ones.`,
        `The smallest is ${mn}. ✅`,
      ] };
    },
  },
  wordName: {
    concept: 'Number words are just numbers in disguise! Break the words into place-value chunks: "three hundred" is 300, "forty" is 40, "two" is 2. Then add the chunks: 300 + 40 + 2 = 342.',
    vocab: [{ t: 'Standard form', d: 'a number written with digits, like 342' }, { t: 'Word form', d: 'a number written with words' }],
    misconception: '"Forty" has no U (not fourty), and "three hundred forty-two" has no word "and" in it. Also 342 is NOT 300402 — the chunks overlap into one number!',
    why: 'Checks are written with number words, and reading big numbers out loud uses this exact skill.',
    teach() {
      const h = randInt(1, 9), t = randInt(2, 9), o = randInt(1, 9);
      const n = h * 100 + t * 10 + o, w = numToWords(n);
      return { steps: [
        `Turn the words into a number: "${w}".`,
        `Chunk it by place value: "${numToWords(h * 100)}" = ${h * 100}.`,
        `"${numToWords(t * 10 + o)}" = ${t * 10 + o} (that's ${t * 10} + ${o}).`,
        `Add the chunks: ${h * 100} + ${t * 10} + ${o} = ${n}. ✅`,
      ] };
    },
  },
  evenOdd: {
    concept: 'An even number can be split into two equal teams with nobody left over. An odd number always has 1 left out. The shortcut: only look at the ONES digit — 0, 2, 4, 6, 8 mean even; 1, 3, 5, 7, 9 mean odd.',
    vocab: [{ t: 'Even', d: 'makes pairs perfectly: 0, 2, 4, 6, 8…' }, { t: 'Odd', d: 'always one left over: 1, 3, 5, 7, 9…' }],
    misconception: 'Only the ONES digit matters. 34 is even because it ends in 4 — the 3 in front doesn’t change that.',
    why: 'Evens and odds show up in sharing fairly, team games, and house numbers on each side of the street.',
    teach() {
      const n = randInt(11, 99);
      const even = n % 2 === 0, last = n % 10;
      return { steps: [
        `Is ${n} even or odd? Don't count — use the shortcut!`,
        `Cover everything except the ONES digit. It's ${last}.`,
        `Evens end in 0, 2, 4, 6, 8. Odds end in 1, 3, 5, 7, 9. ${last} is ${even ? 'even' : 'odd'}.`,
        `So ${n} is ${even ? 'EVEN — it splits into two equal teams' : 'ODD — one is always left out'}. ✅`,
      ] };
    },
  },
  doubles: {
    concept: 'A double is a number added to itself, like 7 + 7. Doubles are super facts to memorize — they’re everywhere, and they unlock near-doubles: if you know 7 + 7 = 14, then 7 + 8 is just one more, 15!',
    vocab: [{ t: 'Double', d: 'a number plus itself' }, { t: 'Near double', d: 'a double plus or minus 1' }],
    misconception: 'Doubling is adding, not writing the digit twice: double 6 is 12, not 66!',
    why: 'Two hands, two feet, mirror images — doubles are everywhere, and they make mental math lightning fast.',
    teach() {
      const n = randInt(3, 10);
      return { steps: [
        `Let's double ${n}. That means ${n} + ${n}.`,
        `Picture it: ${n} fingers on one hand-shape, ${n} on the other — two equal groups.`,
        `${n} + ${n} = ${2 * n}.`,
        `Bonus trick: now ${n} + ${n + 1} is easy — it's just one more: ${2 * n + 1}! ✅`,
      ] };
    },
  },
  makeTen: {
    concept: 'Some number pairs are best friends — they always make 10 together: 1+9, 2+8, 3+7, 4+6, 5+5. Knowing these "bonds" by heart makes bigger adding easy, because tens are friendly numbers.',
    vocab: [{ t: 'Number bond', d: 'two numbers that join to make another' }, { t: 'Make ten', d: 'find the partner that gets you to 10' }],
    misconception: 'Each number has exactly ONE partner to make ten. If you picked 4 for "7 + ___ = 10", count up: 8, 9, 10 — it’s 3!',
    why: 'Making ten is THE mental-math superpower — 8 + 5 becomes 8 + 2 + 3 = 13 in your head.',
    teach() {
      const a = randInt(1, 9);
      return { steps: [
        `${a} + ___ = 10. Who is ${a}'s partner?`,
        `Count UP from ${a} to 10: ${Array.from({ length: 10 - a }, (_, i) => a + i + 1).join(', ')}. That took ${10 - a} counts.`,
        `So ${a} + ${10 - a} = 10. They're a ten-bond pair!`,
        `Memorize the pairs: 1+9, 2+8, 3+7, 4+6, 5+5. ✅`,
      ] };
    },
  },
  factFamily: {
    concept: 'A fact family is three numbers that make four facts together — two additions and two subtractions. The two small numbers add up to the big one; the big one minus either small one gives the other.',
    vocab: [{ t: 'Fact family', d: 'four facts built from the same three numbers' }, { t: 'Related facts', d: 'facts that use the same numbers' }],
    misconception: 'In subtraction facts, the BIG number always comes first: 12 − 5 = 7 works, but 5 − 12 is not in the family.',
    why: 'Learn one fact, get three free! Fact families cut your memorizing in quarter.',
    teach() {
      const a = randInt(2, 9), b = randInt(2, 9), s = a + b;
      return { steps: [
        `Our family: ${a}, ${b}, and ${s}. The big number is ${s} — it sits at the top.`,
        `Addition facts (small + small = big): ${a} + ${b} = ${s} and ${b} + ${a} = ${s}.`,
        `Subtraction facts (big − small = small): ${s} − ${a} = ${b} and ${s} − ${b} = ${a}.`,
        `Four facts, three numbers, one family. If you know one, you know all four! ✅`,
      ] };
    },
  },
  repeatedAdd: {
    concept: 'When you have EQUAL groups, you don’t need to count one by one — add the group over and over. 3 groups of 4 means 4 + 4 + 4. (Psst: this is what multiplication is!)',
    vocab: [{ t: 'Equal groups', d: 'groups with the same amount in each' }, { t: 'Repeated addition', d: 'adding the same number again and again' }],
    misconception: '"3 groups of 4" means 4 + 4 + 4 (three fours) — not 3 + 3 + 3 + 3. The GROUPS tell you how many times to add.',
    why: 'Cookies on trays, wheels on cars, legs on spiders — equal groups are everywhere, and this is the road to multiplication.',
    teach() {
      const g = randInt(3, 5), s = randInt(2, 5);
      const parts = Array(g).fill(s);
      let run = 0; const running = parts.map(v => (run += v));
      return { steps: [
        `Picture ${g} baskets with ${s} apples in EACH. How many apples in all?`,
        `Equal groups → repeated addition: ${parts.join(' + ')}.`,
        `Add them up one group at a time: ${running.join(', ')}.`,
        `${g} groups of ${s} = ${g * s}. ✅ (One day you'll write this as ${g} × ${s}!)`,
      ] };
    },
  },
  arrays: {
    concept: 'An array arranges things in neat ROWS and COLUMNS, like eggs in a carton. To count everything: count one row, then add that row for every row you have.',
    vocab: [{ t: 'Row', d: 'a line going across ↔' }, { t: 'Column', d: 'a line going up and down ↕' }, { t: 'Array', d: 'objects in equal rows and columns' }],
    misconception: 'Rows go ACROSS (like rowing a boat on flat water); columns stand UP (like building columns). Don’t swap them!',
    why: 'Egg cartons, muffin tins, marching bands, and computer screens are all arrays.',
    teach() {
      const r = randInt(2, 5), c = randInt(3, 5);
      const rows = Array(r).fill(c);
      let run = 0; const running = rows.map(v => (run += v));
      return { steps: [
        `Our array has ${r} rows with ${c} in each row. Picture ${r} neat lines of ${c} dots.`,
        `Count the first row: ${c}.`,
        `Every row is the same, so add ${c} for each row: ${rows.join(' + ')} → ${running.join(', ')}.`,
        `${r} rows of ${c} = ${r * c} in all. ✅`,
      ] };
    },
  },
  roundTen: {
    concept: 'Rounding to the nearest ten means sliding to the closest "friendly" ten. The ONES digit decides: 0–4 rounds DOWN (stay at your ten), 5–9 rounds UP (jump to the next ten).',
    vocab: [{ t: 'Round', d: 'swap a number for the nearest friendly number' }, { t: 'Nearest ten', d: 'the multiple of 10 that’s closest' }],
    misconception: 'A 5 in the ones place rounds UP, even though it looks like the middle: 45 rounds to 50.',
    why: 'Rounding lets you estimate fast: "about 30 dollars" is quicker than counting every penny.',
    teach() {
      const n = randInt(11, 98);
      const lo = Math.floor(n / 10) * 10, hi = lo + 10, ones = n % 10, ans = Math.round(n / 10) * 10;
      return { steps: [
        `Round ${n} to the nearest ten. ${n} lives between ${lo} and ${hi} on the number line.`,
        `Look at the ONES digit: it's ${ones}.`,
        `Rule: 0–4 → round down, 5–9 → round up. ${ones} means round ${ones >= 5 ? 'UP' : 'DOWN'}.`,
        `So ${n} rounds to ${ans}. ✅`,
      ] };
    },
  },
  roundTenHundred: {
    concept: 'Rounding to the nearest hundred works like rounding to ten, but the TENS digit is the judge: 0–4 rounds down, 5–9 rounds up. Always ask: "which place am I rounding to?" then look at the digit just to its right.',
    vocab: [{ t: 'Nearest hundred', d: 'the multiple of 100 that’s closest' }, { t: 'Judge digit', d: 'the digit one spot right of the place you round to' }],
    misconception: 'Rounding 349 to the nearest hundred: look at the TENS (4), not the ones. It rounds DOWN to 300 even though the 9 looks big.',
    why: 'Estimating prices and distances usually means rounding to the nearest hundred.',
    teach() {
      const n = randInt(110, 989), k = pick([10, 100]);
      const judge = k === 10 ? n % 10 : L2_tens(n);
      const ans = Math.round(n / k) * k;
      return { steps: [
        `Round ${n} to the nearest ${k === 10 ? 'ten' : 'hundred'}.`,
        `Find the judge digit — the one just RIGHT of the ${k === 10 ? 'tens' : 'hundreds'} place. It's ${judge}.`,
        `Rule: 0–4 → round down, 5–9 → round up. ${judge} says round ${judge >= 5 ? 'UP' : 'DOWN'}.`,
        `So ${n} → ${ans}. ✅`,
      ] };
    },
  },
  estSum2: {
    concept: 'Estimating a sum means rounding each number to a friendly ten FIRST, then adding the easy numbers. You trade a tiny bit of exactness for a lot of speed.',
    vocab: [{ t: 'Estimate', d: 'a smart "about" answer, not an exact one' }],
    misconception: 'Round BEFORE you add — don’t add first and round after. The whole point is to make the adding easy!',
    why: 'Estimating tells you fast if you have enough money — before you get to the cash register.',
    teach() {
      const a = randInt(12, 88), b = randInt(12, 88);
      const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10;
      return { steps: [
        `Estimate ${a} + ${b}. We don't need the exact answer — just a smart "about".`,
        `Round each number to the nearest ten: ${a} ≈ ${ra} and ${b} ≈ ${rb}.`,
        `Now add the friendly numbers: ${ra} + ${rb} = ${ra + rb}.`,
        `So ${a} + ${b} is about ${ra + rb}. (The exact answer, ${a + b}, is close by!) ✅`,
      ] };
    },
  },
  estDiff2: {
    concept: 'Estimating a difference means rounding each number to a friendly ten first, then subtracting the easy numbers.',
    vocab: [{ t: 'Difference', d: 'the answer when you subtract' }, { t: 'About', d: 'close to, but not exactly' }],
    misconception: 'Round each number separately first. Don’t subtract exactly and then round — that’s doing it the hard way!',
    why: 'Quick "about how many more?" answers help you decide things fast.',
    teach() {
      const a = randInt(45, 98), b = randInt(11, a - 12);
      const ra = Math.round(a / 10) * 10, rb = Math.round(b / 10) * 10;
      return { steps: [
        `Estimate ${a} − ${b}.`,
        `Round each to the nearest ten: ${a} ≈ ${ra} and ${b} ≈ ${rb}.`,
        `Subtract the friendly numbers: ${ra} − ${rb} = ${ra - rb}.`,
        `So ${a} − ${b} is about ${ra - rb}. ✅`,
      ] };
    },
  },
  regroup: {
    concept: 'Ten ones can be traded for one ten — same value, new shape! So "5 tens and 13 ones" is a number in disguise: trade 10 of the ones for a ten, and you get 6 tens and 3 ones = 63.',
    vocab: [{ t: 'Regroup', d: 'trade 10 ones for 1 ten (or back)' }, { t: 'Tens rod', d: 'a block worth ten ones' }],
    misconception: '5 tens and 13 ones is NOT 513! Trade the extra ones first: it’s 63.',
    why: 'Regrouping is the engine inside carrying and borrowing — master the trade and big adding gets easy.',
    teach() {
      const t = randInt(2, 7), o = randInt(11, 19);
      const total = t * 10 + o;
      return { steps: [
        `${t} tens and ${o} ones — what number is that? The ones pile is overflowing!`,
        `Trade time: take 10 of the ${o} ones and swap them for 1 ten. Same value, tidier number.`,
        `Now we have ${t + 1} tens and ${o - 10} ones.`,
        `${t + 1} tens = ${(t + 1) * 10}, plus ${o - 10} ones = ${total}. ✅`,
      ] };
    },
  },
  digitValue2: {
    concept: 'A digit’s VALUE depends on its seat! In 358, the 5 sits in the tens seat, so it’s worth 50 — not 5. Value = digit × its place (hundreds, tens, or ones).',
    vocab: [{ t: 'Digit', d: 'a symbol 0–9' }, { t: 'Place value', d: 'what a digit is worth in its position' }],
    misconception: 'The same digit changes value in different seats: the 7 in 700, 70, and 7 is worth different amounts each time.',
    why: 'Place value is why 21 and 12 are different numbers — the seat matters as much as the digit!',
    teach() {
      const h = randInt(1, 9), t = randInt(1, 9), o = randInt(1, 9);
      const n = h * 100 + t * 10 + o;
      return { steps: [
        `Look at ${n}. Each digit has a seat: ${h} is in the hundreds seat, ${t} in the tens seat, ${o} in the ones seat.`,
        `The value of the ${h}: it means ${h} hundreds = ${h * 100}.`,
        `The value of the ${t}: it means ${t} tens = ${t * 10}. The value of the ${o}: ${o} ones = ${o}.`,
        `Check: ${h * 100} + ${t * 10} + ${o} = ${n}. The seats add up to the whole number! ✅`,
      ] };
    },
  },
  expand2: {
    concept: 'Expanded form stretches a number out to show what every digit is really worth: 476 = 400 + 70 + 6. It’s the number’s "insides" on display.',
    vocab: [{ t: 'Expanded form', d: 'a number written as the sum of its place values' }, { t: 'Standard form', d: 'the usual way, like 476' }],
    misconception: 'Every value keeps its zeros: 476 is 400 + 70 + 6, not 4 + 7 + 6.',
    why: 'Expanded form makes adding and subtracting big numbers much easier to see.',
    teach() {
      const h = randInt(1, 9), t = randInt(1, 9), o = randInt(1, 9);
      const n = h * 100 + t * 10 + o;
      return { steps: [
        `Stretch out ${n} into expanded form.`,
        `The ${h} is in the hundreds place → worth ${h * 100}.`,
        `The ${t} is in the tens place → worth ${t * 10}. The ${o} is in the ones place → worth ${o}.`,
        `Expanded form: ${n} = ${h * 100} + ${t * 10} + ${o}. Squish it back together to check! ✅`,
      ] };
    },
  },
  placeTensOnes: {
    concept: 'Tens and ones are building blocks: 4 tens means 40, and 6 ones means 6. Put the blocks together — 40 + 6 = 46. The tens digit tells how many tens, the ones digit how many singles.',
    vocab: [{ t: 'Tens', d: 'groups of ten' }, { t: 'Ones', d: 'single units' }],
    misconception: '7 tens and 3 ones is 73, not 703 and not 10. Multiply the tens by ten, then add the ones.',
    why: 'This is how our whole number system works — everything is built from tens!',
    teach() {
      const t = randInt(2, 9), o = randInt(1, 9);
      return { steps: [
        `${t} tens and ${o} ones — let's build the number.`,
        `${t} tens = ${t} × 10 = ${t * 10}.`,
        `Add the ones: ${t * 10} + ${o} = ${t * 10 + o}.`,
        `So ${t} tens and ${o} ones make ${t * 10 + o}. ✅`,
      ] };
    },
  },
  coinValue: {
    concept: 'Every coin has a name and a value: penny = 1¢, nickel = 5¢, dime = 10¢, quarter = 25¢. Watch out — SIZE doesn’t tell value! The little dime is worth more than the bigger nickel.',
    vocab: [{ t: 'Penny', d: '1¢ — copper colored' }, { t: 'Nickel', d: '5¢ — thick and smooth-edged' }, { t: 'Dime', d: '10¢ — the smallest coin!' }, { t: 'Quarter', d: '25¢ — the big one' }],
    misconception: 'Bigger coin ≠ more money. The tiny dime (10¢) beats the chunky nickel (5¢)!',
    why: 'Knowing coins means you can buy things, check your change, and save for what you want.',
    teach() {
      return { steps: [
        `Meet the coin team: penny, nickel, dime, quarter.`,
        `Penny = 1¢ (the copper one). Nickel = 5¢ (thick, smooth edge).`,
        `Dime = 10¢ — it's the SMALLEST coin but beats the nickel! Quarter = 25¢ — the big champion.`,
        `Memory trick, smallest value to biggest: penny (1), nickel (5), dime (10), quarter (25). ✅`,
      ] };
    },
  },
  countCoins: {
    concept: 'To count mixed coins, start with the BIGGEST value first, then work down. Skip-count: dimes by 10s, nickels by 5s, pennies by 1s — and keep a running total as you go.',
    vocab: [{ t: 'Running total', d: 'the count so far as you add each coin' }],
    misconception: 'Don’t count coins as "1, 2, 3…" — a dime counts as TEN, not one! Count each coin’s VALUE.',
    why: 'Count your money right and no one can shortchange you.',
    teach() {
      const d = randInt(2, 4), n = randInt(1, 3), p = randInt(1, 4);
      let run = 0; const dimes = Array.from({ length: d }, () => (run += 10)); const nicks = Array.from({ length: n }, () => (run += 5)); const pens = Array.from({ length: p }, () => (run += 1));
      return { steps: [
        `Count: ${d} dimes, ${n} nickels, ${p} pennies. Biggest value first!`,
        `Dimes (10¢ each) — skip-count by 10: ${dimes.join(', ')}.`,
        `Nickels (5¢ each) — keep going by 5: ${nicks.join(', ')}. Pennies — by 1: ${pens.join(', ')}.`,
        `Total: ${run}¢. ✅`,
      ] };
    },
  },
  makeDollar: {
    concept: 'One dollar = 100 cents. To find how much MORE you need, count UP from what you have to 100 — first to the next friendly ten, then by tens to 100.',
    vocab: [{ t: 'Dollar', d: '100 cents' }, { t: 'Count up', d: 'start at what you have and climb to the goal' }],
    misconception: 'A dollar is 100¢, not 10¢. And you’re finding the missing PART, not adding to 100 twice.',
    why: 'Saving up for something? This is exactly how you figure out how much is left to go.',
    teach() {
      const c = randInt(15, 85); const nt = Math.ceil(c / 10) * 10;
      const steps = [`You have ${c}¢ and want $1 (that's 100¢). How much more do you need?`];
      if (nt !== c) steps.push(`Count up to the next friendly ten: ${c} → ${nt} is ${nt - c}¢.`);
      steps.push(`Then jump by tens to 100: ${nt} → 100 is ${100 - nt}¢.`);
      steps.push(`Add the hops: ${nt !== c ? `${nt - c} + ${100 - nt} = ` : ''}${100 - c}¢ more to make a dollar. ✅`);
      return { steps };
    },
  },
  makeChange: {
    concept: 'Change is the money you get BACK: what you paid minus what it cost. Cashiers count UP from the price to what you handed over — that’s the easiest way to see it.',
    vocab: [{ t: 'Change', d: 'money returned to you after paying' }, { t: 'Cost', d: 'the price of the item' }],
    misconception: 'Change = paid − cost, never cost − paid. You can’t get more change than you handed over!',
    why: 'Check your change every time — it’s YOUR money.',
    teach() {
      let cost = randInt(25, 85); if (cost % 10 === 0) cost += 3;
      const nt = Math.ceil(cost / 10) * 10;
      return { steps: [
        `A toy costs ${cost}¢. You pay with $1 (100¢). What's your change?`,
        `Count up like a cashier: ${cost} → ${nt} is ${nt - cost}¢${nt < 100 ? `, then ${nt} → 100 is ${100 - nt}¢ more` : ''}.`,
        `Add the hops: ${nt < 100 ? `${nt - cost} + ${100 - nt} = ` : ''}${100 - cost}¢.`,
        `Your change is ${100 - cost}¢. Same as 100 − ${cost}. ✅`,
      ] };
    },
  },
  addMoney: {
    concept: 'Cents add up just like regular numbers — 35¢ + 20¢ works exactly like 35 + 20. Add the ones, then the tens, and put the ¢ sign back on the answer.',
    vocab: [{ t: 'Cent (¢)', d: 'the smallest bit of money; 100 make a dollar' }],
    misconception: 'Don’t drop the labels: 35¢ + 20¢ = 55¢ (cents), not 55 dollars!',
    why: 'Adding money = knowing if you can afford BOTH the toy and the candy.',
    teach() {
      const a = randInt(15, 60), b = randInt(10, 39);
      return { steps: [
        `Add the money: ${a}¢ + ${b}¢.`,
        `Money adds like plain numbers. Ones first: ${a % 10} + ${b % 10} = ${a % 10 + b % 10}.`,
        `Then tens: ${Math.floor(a / 10)}0 + ${Math.floor(b / 10)}0 → total ${a + b}.`,
        `Answer with the label: ${a + b}¢. ✅`,
      ] };
    },
  },
  timeAfter: {
    concept: 'A clock has two hands: the SHORT hand points to the hour, the LONG hand counts minutes. Each number on the clock face is 5 minutes for the long hand — so count by 5s: 1 means :05, 3 means :15, 6 means :30.',
    vocab: [{ t: 'Hour hand', d: 'the short hand' }, { t: 'Minute hand', d: 'the long hand' }, { t: 'Half past', d: '30 minutes after the hour' }],
    misconception: 'When the long hand points at 3, it’s 15 minutes (3 × 5), not 3 minutes!',
    why: 'Read the clock and you’ll never miss recess, practice, or your favorite show.',
    teach() {
      const h = randInt(1, 11), m = pick([15, 30, 45]);
      const nickname = m === 15 ? 'quarter past' : m === 30 ? 'half past' : 'quarter to ' + (h === 12 ? 1 : h + 1);
      return { steps: [
        `Let's read ${h}:${String(m).padStart(2, '0')} on a clock.`,
        `The SHORT hand shows the hour: it points ${m > 30 ? 'past' : 'at or just past'} ${h}.`,
        `The LONG hand shows minutes. It points at the ${m / 5}, and each number is worth 5 minutes: ${m / 5} × 5 = ${m}.`,
        `So it's ${h}:${String(m).padStart(2, '0')} — also called "${nickname}". ✅`,
      ] };
    },
  },
  relateTime: {
    concept: 'Time units fit inside each other like nesting dolls: 60 seconds make a minute, 60 minutes make an hour, 24 hours make a day, and 7 days make a week.',
    vocab: [{ t: 'Minute', d: '60 seconds' }, { t: 'Hour', d: '60 minutes' }, { t: 'Day', d: '24 hours' }, { t: 'Week', d: '7 days' }],
    misconception: 'Hours come in 60-minute packs, not 100! Time doesn’t work like regular counting.',
    why: 'How long until the party? Converting time units answers every "how long" question.',
    teach() {
      return { steps: [
        `Time facts to keep in your pocket:`,
        `60 seconds = 1 minute (about how long it takes to tie both shoes).`,
        `60 minutes = 1 hour (one cartoon episode plus a snack). 24 hours = 1 day.`,
        `7 days = 1 week: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday. ✅`,
      ] };
    },
  },
  amPm: {
    concept: 'The day has two halves. A.M. is from midnight to noon — waking up, breakfast, morning school. P.M. is from noon to midnight — afternoon, dinner, bedtime. Same numbers, different half!',
    vocab: [{ t: 'A.M.', d: 'midnight to noon (morning)' }, { t: 'P.M.', d: 'noon to midnight (afternoon + night)' }, { t: 'Noon', d: '12:00 in the middle of the day' }],
    misconception: 'There are TWO 8 o’clocks every day — 8 A.M. (breakfast) and 8 P.M. (almost bedtime). You need the letters to tell them apart!',
    why: 'Set an alarm for 7 P.M. instead of 7 A.M. and you’ll miss the whole school day!',
    teach() {
      return { steps: [
        `A.M. or P.M.? Ask: which HALF of the day is it?`,
        `A.M. = midnight to noon. Waking up, breakfast, morning recess → all A.M.`,
        `P.M. = noon to midnight. Lunch is right at the switch; dinner, sunset, and bedtime → all P.M.`,
        `Test yourself: eating breakfast at 8:00 → A.M. Going to bed at 9:00 → P.M. ✅`,
      ] };
    },
  },
  months: {
    concept: 'The year is a loop of 12 months, always in the same order: January, February, March, April, May, June, July, August, September, October, November, December. After December, the loop starts again!',
    vocab: [{ t: 'Month', d: 'one of 12 parts of the year' }, { t: 'Calendar', d: 'a map of days, weeks, and months' }],
    misconception: 'After December comes January of the NEXT year — the months are a circle, not a line that ends.',
    why: 'Birthdays, holidays, summer break — everything lives on the calendar.',
    teach() {
      const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const i = randInt(0, 10);
      return { steps: [
        `The 12 months in order: ${MO.slice(0, 6).join(', ')},`,
        `${MO.slice(6).join(', ')}.`,
        `To find what comes after a month, just step one forward in the list.`,
        `Example: what comes after ${MO[i]}? Step forward one… ${MO[i + 1]}! ✅`,
      ] };
    },
  },
  readData: {
    concept: 'Graphs and charts turn numbers into pictures. To read one: 1) find each amount by reading its bar or symbols, 2) answer the question. "How many more?" always means SUBTRACT the smaller from the bigger.',
    vocab: [{ t: 'Bar graph', d: 'taller bar = bigger amount' }, { t: 'Tally', d: 'lines that count in bundles of 5' }, { t: 'Data', d: 'information collected as numbers' }],
    misconception: '"How many more cats than dogs?" is subtraction (cats − dogs), NOT addition of both!',
    why: 'Graphs are everywhere — sports stats, weather, class votes. Read them and you know the story fast.',
    teach() {
      const a = randInt(5, 9), b = randInt(2, a - 2);
      return { steps: [
        `A chart shows 🐱 cats: ${a} and 🐶 dogs: ${b}. Question: how many MORE cats than dogs?`,
        `Step 1 — read each amount from the chart: cats = ${a}, dogs = ${b}.`,
        `Step 2 — "how many more" compares two amounts → subtract: ${a} − ${b} = ${a - b}.`,
        `There are ${a - b} more cats than dogs. ✅`,
      ] };
    },
  },
  measureUnit: {
    concept: 'Pick a measuring unit that FITS the object: inches (or centimeters) for small things like a pencil, feet (or meters) for bigger things like a door, and yards for really big things like a playground.',
    vocab: [{ t: 'Inch', d: 'small unit — about a thumb joint' }, { t: 'Foot', d: '12 inches — about a big shoe' }, { t: 'Yard', d: '3 feet — about a giant step' }, { t: 'Centimeter', d: 'small metric unit — a pinky width' }],
    misconception: 'You COULD measure a car in inches, but you’d be counting forever! The best unit is the one that fits the size of the object.',
    why: 'Builders, tailors, and game designers all pick the right unit before they measure.',
    teach() {
      return { steps: [
        `Choosing a unit is about matching sizes.`,
        `SMALL things → small units: a pencil or a book is measured in inches (or centimeters).`,
        `BIG things → big units: a room or a car in feet (or meters); a playground or football field in yards.`,
        `Quick test: pencil → inches. Car → feet. Playground → yards. ✅`,
      ] };
    },
  },
  sides: {
    concept: 'A side is one straight edge of a shape; a vertex is a corner where two sides meet. To count sides, trace the shape with your finger and count every straight edge exactly once.',
    vocab: [{ t: 'Side', d: 'a straight edge of a shape' }, { t: 'Vertex', d: 'a corner (plural: vertices)' }],
    misconception: 'Sides and corners come in matching numbers: a shape with 5 sides also has 5 vertices. If your counts don’t match, recount!',
    why: 'Counting sides is how shapes get their names — and how you win at shape-spotting.',
    teach() {
      const shapes = [['triangle', 3], ['square', 4], ['rectangle', 4], ['pentagon', 5], ['hexagon', 6]];
      const s = pick(shapes);
      return { steps: [
        `Let's count the sides of a ${s[0]}.`,
        `Put your finger on one corner and trace each straight edge, counting as you go: ${Array.from({ length: s[1] }, (_, i) => i + 1).join(', ')}.`,
        `You're back where you started — a ${s[0]} has ${s[1]} sides.`,
        `Bonus: it also has ${s[1]} vertices (corners). Sides and corners always match! ✅`,
      ] };
    },
  },
  name2D: {
    concept: 'Shapes are named by their number of sides: 3 sides = triangle, 4 = quadrilateral, 5 = pentagon, 6 = hexagon. Count the sides and you’ve got the name!',
    vocab: [{ t: 'Triangle', d: '3 sides ("tri" = three)' }, { t: 'Quadrilateral', d: '4 sides ("quad" = four)' }, { t: 'Pentagon', d: '5 sides' }, { t: 'Hexagon', d: '6 sides' }],
    misconception: 'A shape is a hexagon because it has 6 sides — not because it looks like a honeycomb cell. Long, skinny, or lopsided — 6 sides is still a hexagon!',
    why: 'Shape names are the secret code of buildings, signs, and art.',
    teach() {
      const shapes = [[3, 'triangle', 'tri- means three, like tricycle'], [4, 'quadrilateral', 'quad- means four, like quad bike'], [5, 'pentagon', 'the famous Pentagon building has 5 sides'], [6, 'hexagon', 'honeycomb cells are hexagons']];
      const s = pick(shapes);
      return { steps: [
        `A shape has ${s[0]} sides. What's its name?`,
        `Use the name code: 3 → triangle, 4 → quadrilateral, 5 → pentagon, 6 → hexagon.`,
        `${s[0]} sides → it's a ${s[1]}!`,
        `Memory hook: ${s[2]}. ✅`,
      ] };
    },
  },
  solid3D: {
    concept: '3-D shapes have three part-types: FACES are the flat surfaces (like walls), EDGES are the lines where two faces meet, and VERTICES are the pointy corners. A cube has 6 faces, 12 edges, and 8 vertices.',
    vocab: [{ t: 'Face', d: 'a flat surface of a solid' }, { t: 'Edge', d: 'where two faces meet' }, { t: 'Vertex', d: 'a corner point' }],
    misconception: 'Faces are FLAT — a ball (sphere) has no faces, no edges, and no vertices at all!',
    why: 'Dice, boxes, and buildings are all 3-D shapes — knowing their parts helps you build and draw them.',
    teach() {
      return { steps: [
        `Let's explore a cube — like a dice. 🎲`,
        `FACES (flat surfaces): top, bottom, front, back, left, right → 6 faces.`,
        `EDGES (where two faces meet): 4 around the top, 4 around the bottom, 4 standing up → 12 edges.`,
        `VERTICES (pointy corners): 4 on top + 4 on bottom → 8 vertices. So a cube: 6 faces, 12 edges, 8 vertices. ✅`,
      ] };
    },
  },
  name3D: {
    concept: 'Match solids to real things: a ball is a SPHERE, a soup can is a CYLINDER, a dice is a CUBE, an ice-cream cone is a CONE. Ask: does it roll? Does it stack? Does it have a point?',
    vocab: [{ t: 'Sphere', d: 'round like a ball — rolls every way' }, { t: 'Cylinder', d: 'like a can — rolls on its side, stacks on its ends' }, { t: 'Cube', d: 'like a dice — all square faces' }, { t: 'Cone', d: 'circle bottom, one point on top' }],
    misconception: 'A circle is FLAT (2-D); a sphere is SOLID (3-D). A drawing of a ball is a circle — the ball itself is a sphere.',
    why: 'Everything you can hold is a 3-D shape — spotting them makes you see math everywhere.',
    teach() {
      return { steps: [
        `Solid shapes hide in everyday things. Let's find them!`,
        `Rolls every direction, no flat parts → SPHERE (ball, orange, globe).`,
        `Two flat circle ends, rolls on its side → CYLINDER (soup can, glue stick). All square faces → CUBE (dice, gift box).`,
        `Flat circle bottom + a point on top → CONE (ice-cream cone, party hat, traffic cone). ✅`,
      ] };
    },
  },
  tileArea: {
    concept: 'Area is how many unit squares cover a shape — like tiles covering a floor. For a rectangle, count one row, then add that row for every row (rows × columns).',
    vocab: [{ t: 'Area', d: 'the number of squares that cover a shape' }, { t: 'Unit square', d: 'one little measuring square' }],
    misconception: 'Area counts the squares INSIDE a shape. Perimeter walks around the OUTSIDE — don’t mix them up!',
    why: 'Area tells you how much carpet a room needs and how much frosting covers a cake.',
    teach() {
      const r = randInt(2, 5), c = randInt(3, 6);
      const rows = Array(r).fill(c);
      let run = 0; const running = rows.map(v => (run += v));
      return { steps: [
        `A rectangle is ${r} squares tall and ${c} squares wide. How many squares cover it?`,
        `Count the first row: ${c} squares.`,
        `Every row is the same, so add ${c} for each of the ${r} rows: ${rows.join(' + ')} → ${running.join(', ')}.`,
        `The area is ${r * c} squares. (That's ${r} rows × ${c} columns!) ✅`,
      ] };
    },
  },
  perimeter: {
    concept: 'Perimeter is the distance all the way AROUND a shape — imagine an ant walking the edges. Add up every side. A rectangle has two lengths and two widths, so add all four.',
    vocab: [{ t: 'Perimeter', d: 'the distance around the outside' }, { t: 'Side length', d: 'how long one edge is' }],
    misconception: 'Don’t forget the sides you can’t see labels for! A rectangle has FOUR sides — the opposite sides match.',
    why: 'Perimeter tells you how much fence a yard needs, or ribbon to wrap around a present.',
    teach() {
      const l = randInt(4, 10), w = randInt(2, 6);
      return { steps: [
        `Find the perimeter of a rectangle ${l} long and ${w} wide. Imagine an ant marching around it! 🐜`,
        `A rectangle's opposite sides match, so the four sides are ${l}, ${w}, ${l}, ${w}.`,
        `Add them all: ${l} + ${w} + ${l} + ${w} = ${2 * (l + w)}.`,
        `The perimeter is ${2 * (l + w)}. The ant walked ${2 * (l + w)} units. ✅`,
      ] };
    },
  },
  fracParts: {
    concept: 'Fractions start with EQUAL parts. Cut a whole into 2 equal parts and each is a HALF; 3 equal parts make THIRDS; 4 make FOURTHS; 8 make EIGHTHS. All the parts together always rebuild one whole.',
    vocab: [{ t: 'Half', d: '1 of 2 equal parts' }, { t: 'Third', d: '1 of 3 equal parts' }, { t: 'Fourth', d: '1 of 4 equal parts' }, { t: 'Equal parts', d: 'parts that are exactly the same size' }],
    misconception: 'The parts must be EQUAL. Cutting a sandwich into a big piece and a small piece does NOT make halves!',
    why: 'Sharing pizza fairly is fractions in action. 🍕',
    teach(skill) {
      const d = pick(L2_denoms(skill));
      const names = { 2: 'halves', 3: 'thirds', 4: 'fourths', 8: 'eighths' };
      return { steps: [
        `Imagine one whole pizza. 🍕 Cut it into ${d} EQUAL slices.`,
        `Each slice is called one ${names[d].slice(0, -1)} — because there are ${d} equal parts.`,
        `Important: the slices must all be the SAME size, or they aren't ${names[d]}!`,
        `Eat all ${d} slices and you've eaten ${d} ${names[d]} = 1 whole pizza. ✅`,
      ] };
    },
  },
  identFrac: {
    concept: 'A fraction is two numbers with a job each: the BOTTOM (denominator) tells how many equal parts the whole is cut into; the TOP (numerator) tells how many parts you’re talking about. 3/4 = cut into 4, take 3.',
    vocab: [{ t: 'Numerator', d: 'top number — parts you have' }, { t: 'Denominator', d: 'bottom number — equal parts in all' }],
    misconception: 'The bottom number is not "how many are left" — it’s how many equal parts the WHOLE was cut into.',
    why: 'Half a sandwich, a quarter of an hour — you already speak fraction!',
    teach(skill) {
      const d = pick(L2_denoms(skill)), n = randInt(1, d - 1);
      return { steps: [
        `A shape is cut into ${d} equal parts, and ${n} ${n === 1 ? 'part is' : 'parts are'} shaded. What fraction is shaded?`,
        `BOTTOM number (denominator) = total equal parts = ${d}.`,
        `TOP number (numerator) = shaded parts = ${n}.`,
        `The fraction is ${n}/${d} — say it "${n} out of ${d}". ✅`,
      ] };
    },
  },
  producerConsumer: {
    concept: 'A PRODUCER makes or grows things to sell — a baker baking bread, a farmer growing corn. A CONSUMER buys or uses things — you, buying that bread! Most people are both at different times.',
    vocab: [{ t: 'Producer', d: 'someone who makes or grows something to sell' }, { t: 'Consumer', d: 'someone who buys or uses goods' }, { t: 'Goods', d: 'things people make and sell' }],
    misconception: 'The same person can be BOTH: a baker produces bread in the morning and consumes groceries in the afternoon.',
    why: 'Knowing who makes and who buys explains how stores, jobs, and money all connect.',
    teach() {
      return { steps: [
        `Producers MAKE. Consumers BUY. Let's sort some people!`,
        `A baker bakes bread to sell → makes something → PRODUCER.`,
        `A kid buys a toy at the store → buys something → CONSUMER.`,
        `A farmer grows vegetables to sell → PRODUCER. A family eating at a restaurant → CONSUMER. Easy: makers vs. buyers! ✅`,
      ] };
    },
  },
  spendSave: {
    concept: 'SPENDING is using money now — it leaves your pocket and you get something today. SAVING is keeping money for later — it stays with you (often in a piggy bank!) and grows toward something bigger.',
    vocab: [{ t: 'Spend', d: 'use money to buy now' }, { t: 'Save', d: 'keep money for later' }, { t: 'Deposit', d: 'put money INTO savings' }, { t: 'Withdraw', d: 'take money OUT of savings' }],
    misconception: 'Saving isn’t losing your money — it’s still yours, just waiting for something bigger and better!',
    why: 'Savers get the BIG rewards later: spend 5 coins today, or save up for the 50-coin prize!',
    teach() {
      return { steps: [
        `Spending or saving? Ask: does the money GO AWAY now, or STAY for later?`,
        `Buying candy → the money leaves now → SPENDING.`,
        `Putting coins into a piggy bank → keeping them for later → SAVING. (Putting money in = deposit; taking it out = withdrawal.)`,
        `Both are okay! The trick is balancing: spend a little, save a little. ✅`,
      ] };
    },
  },
  roman: {
    concept: 'Roman numerals use letters as numbers: I = 1, V = 5, X = 10. Usually you ADD the letters (VI = 5 + 1 = 6). But when a smaller letter comes BEFORE a bigger one, you SUBTRACT (IV = 5 − 1 = 4).',
    vocab: [{ t: 'I', d: '1' }, { t: 'V', d: '5' }, { t: 'X', d: '10' }],
    misconception: 'You never write IIII for 4 — small-before-big means subtract, so 4 is IV and 9 is IX.',
    why: 'Roman numerals are on clocks, book chapters, and the Super Bowl!',
    teach() {
      const n = randInt(4, 20), r = toRoman(n);
      return { steps: [
        `Let's write ${n} in Roman numerals. The letter values: I = 1, V = 5, X = 10.`,
        `Build ${n} from the biggest letters down${n >= 10 ? `: start with X (10)` : n >= 5 ? `: start with V (5)` : ' using I’s'}.`,
        `Remember the subtraction rule: IV = 4 (one before five) and IX = 9 (one before ten).`,
        `${n} = ${r}. Read it back to check! ✅`,
      ] };
    },
  },
};
// small-number aliases share the main add/sub lessons
LESSON2.addThree = {
  concept: 'To add three numbers, add two of them first, then add the third to that total. Pick a clever pair first — numbers that make ten are best friends!',
  vocab: [{ t: 'Make ten', d: 'pair numbers that add to 10 first' }],
  misconception: 'You can add in ANY order — so choose the easiest pair first!',
  why: 'Three-number adding shows up whenever you buy three things.',
  teach() {
    let a = randInt(2, 9), b = randInt(1, 9), c = randInt(2, 9);
    const pairTen = [[a, b], [a, c], [b, c]].find(p => p[0] + p[1] === 10);
    const steps = [`Let's add ${a} + ${b} + ${c}.`];
    if (pairTen) steps.push(`Spot the ten-friends: ${pairTen[0]} + ${pairTen[1]} = 10. Add them first!`, `Now add the last number: 10 + ${a + b + c - 10} = ${a + b + c}.`);
    else steps.push(`Add the first two: ${a} + ${b} = ${a + b}.`, `Now add the third: ${a + b} + ${c} = ${a + b + c}.`);
    steps.push(`So ${a} + ${b} + ${c} = ${a + b + c}. ✅`);
    return { steps };
  },
};
LESSON2.subSmall = LESSON2.g2sub;
LESSON2.addTwoDigit = LESSON2.g2add; LESSON2.subTwoDigit = LESSON2.g2sub;
LESSON2.addThreeDigit = LESSON2.g2add; LESSON2.subThreeDigit = LESSON2.g2sub;

/* ------------------------------ entry point ------------------------------ */
function buildLesson(skill) {
  const L = skill && LESSON2[skill.gen];
  if (!L) return null;
  const t = L.teach(skill);
  return {
    concept: typeof L.concept === 'function' ? L.concept(skill) : L.concept,
    steps: (t && t.steps) || [],
    vocab: L.vocab || [],
    misconception: L.misconception || '',
    why: L.why || '',
  };
}
if (typeof module !== 'undefined') { module.exports = { LESSON2, buildLesson }; }
