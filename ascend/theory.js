/* ============================================================================
   Ascend — Theory ("the book"): a short lesson per skill, taught BEFORE numbers.
   concept + worked example (step by step) + vocab + misconception + why.
   Demo content — a real launch has each lesson teacher-vetted.
   ============================================================================ */
const THEORY = {
  nso1: {
    concept: 'Integers are whole numbers that can be positive or negative. When you add, subtract, or multiply them, the SIGNS decide the result. Same signs multiply/divide to a positive; different signs give a negative.',
    worked: ['Problem: (-6) × (3)', 'The signs are different (one negative, one positive).', 'Multiply the numbers: 6 × 3 = 18.', 'Different signs → the answer is negative: -18.'],
    vocab: [{ t: 'Integer', d: 'a whole number, positive or negative (…-2,-1,0,1,2…)' }, { t: 'Absolute value', d: 'distance from 0, always positive' }],
    misconception: 'Two negatives don’t always make a positive — that’s only for × and ÷. For addition, (-3) + (-4) = -7.',
    why: 'Integers show up in money (debt), temperature, and elevation every day.',
  },
  nso2: {
    concept: 'To add or subtract fractions, they must have the SAME denominator (bottom number). Find a common denominator, rewrite each fraction, then add or subtract the tops (numerators).',
    worked: ['Problem: 1/2 + 1/3', 'Common denominator of 2 and 3 is 6.', 'Rewrite: 1/2 = 3/6 and 1/3 = 2/6.', 'Add the tops: 3/6 + 2/6 = 5/6.'],
    vocab: [{ t: 'Numerator', d: 'the top number' }, { t: 'Denominator', d: 'the bottom number' }, { t: 'Common denominator', d: 'a shared bottom number' }],
    misconception: 'Never add the bottoms! 1/2 + 1/3 is NOT 2/5. Only the numerators add once denominators match.',
    why: 'Fractions are everywhere: recipes, measurements, time, and money.',
  },
  ar1: {
    concept: 'Combining like terms means grouping parts that have the SAME variable. Add the number in front (the coefficient) of matching terms, and add the plain numbers separately.',
    worked: ['Problem: 3x + 5 + 2x - 2', 'Like terms with x: 3x and 2x → 3x + 2x = 5x.', 'Plain numbers: 5 - 2 = 3.', 'Put it together: 5x + 3.'],
    vocab: [{ t: 'Term', d: 'a number, variable, or number×variable' }, { t: 'Coefficient', d: 'the number in front of a variable' }, { t: 'Like terms', d: 'terms with the same variable' }],
    misconception: 'You can’t combine 3x and 5 — they’re not alike. x-terms only join other x-terms.',
    why: 'Simplifying expressions is the first step to solving almost every equation.',
  },
  ar2: {
    concept: 'A two-step equation takes two moves to solve. Undo addition/subtraction FIRST, then undo multiplication/division. Always do the same thing to both sides.',
    worked: ['Problem: 3x + 4 = 19', 'Undo +4: subtract 4 from both sides → 3x = 15.', 'Undo ×3: divide both sides by 3 → x = 5.', 'Check: 3(5) + 4 = 19 ✓'],
    vocab: [{ t: 'Equation', d: 'two expressions set equal' }, { t: 'Inverse operation', d: 'the opposite move that undoes another' }],
    misconception: 'Do the +/− step before the ×/÷ step — reverse order of operations when solving.',
    why: 'Two-step equations model real situations: cost = fee + rate × amount.',
  },
  ar3: {
    concept: 'Inequalities are solved like equations, but the answer is a RANGE. One special rule: if you multiply or divide both sides by a negative number, FLIP the inequality sign.',
    worked: ['Problem: 2x + 3 > 11', 'Subtract 3 from both sides → 2x > 8.', 'Divide both sides by 2 (positive, no flip) → x > 4.', 'Answer: any number greater than 4.'],
    vocab: [{ t: 'Inequality', d: 'a comparison using >, <, ≥, ≤' }, { t: 'Solution set', d: 'all values that make it true' }],
    misconception: 'Forgetting to flip the sign when dividing by a negative is the #1 mistake.',
    why: 'Inequalities model limits: budgets, minimum scores, speed limits.',
  },
  pr1: {
    concept: 'A unit rate tells you how much for ONE. Divide the total by the number of units to get the “per one” amount.',
    worked: ['Problem: 60 miles in 4 hours. Miles per hour?', 'Divide total by units: 60 ÷ 4.', 'Unit rate = 15 miles per hour.'],
    vocab: [{ t: 'Rate', d: 'a ratio comparing two different units' }, { t: 'Unit rate', d: 'a rate for exactly 1 of something' }],
    misconception: 'Divide the right way: it’s total ÷ number of units, not the other way around.',
    why: 'Unit rates let you compare prices ($/oz) and speeds instantly.',
  },
  pr2: {
    concept: 'In a proportional relationship, y is always the same multiple of x. That multiple is the constant of proportionality, k. Find it with k = y ÷ x.',
    worked: ['Problem: when x = 3, y = 12. Find k.', 'k = y ÷ x = 12 ÷ 3.', 'k = 4. So y = 4x.'],
    vocab: [{ t: 'Proportional', d: 'y = kx for a constant k' }, { t: 'Constant of proportionality', d: 'the fixed multiplier k' }],
    misconception: 'k = y ÷ x, not x ÷ y. Keep y on top.',
    why: 'It’s the math behind scaling recipes, maps, and pay rates.',
  },
  pr3: {
    concept: 'Percent means “out of 100.” Turn the percent into a decimal (÷100), then multiply. For tax/tip you ADD it on; for a discount you SUBTRACT it.',
    worked: ['Problem: $50 item, 20% off. Sale price?', '20% = 0.20. Discount = 50 × 0.20 = $10.', 'Subtract: 50 - 10 = $40.'],
    vocab: [{ t: 'Percent', d: 'a number out of 100' }, { t: 'Discount', d: 'an amount subtracted from the price' }],
    misconception: 'A 20% discount isn’t “×20” — convert to 0.20 first.',
    why: 'Percents run shopping, tips, sales tax, and interest.',
  },
  gr1: {
    concept: 'A circle’s size comes from its radius. Area = π r² (space inside). Circumference = 2 π r (distance around). Use π ≈ 3.14.',
    worked: ['Problem: radius 5, find area.', 'Area = π r² ≈ 3.14 × 5².', '5² = 25, so 3.14 × 25.', 'Area ≈ 78.5 square units.'],
    vocab: [{ t: 'Radius', d: 'center to edge' }, { t: 'Circumference', d: 'the distance around' }, { t: 'π (pi)', d: '≈ 3.14' }],
    misconception: 'r² means r × r, not r × 2. And area uses r², circumference uses just r.',
    why: 'Circles are wheels, pizzas, tracks, and clocks.',
  },
  gr2: {
    concept: 'Volume is how much space fills a solid. For a rectangular prism (a box), multiply the three dimensions: length × width × height.',
    worked: ['Problem: box 4 × 3 × 2.', 'Multiply: 4 × 3 = 12.', 'Then × height: 12 × 2 = 24.', 'Volume = 24 cubic units.'],
    vocab: [{ t: 'Volume', d: 'space inside a 3-D solid' }, { t: 'Prism', d: 'a solid with matching ends' }],
    misconception: 'Volume uses all three dimensions — don’t stop at length × width (that’s area).',
    why: 'Volume tells you what fits: boxes, tanks, aquariums.',
  },
  gr3: {
    concept: 'Angles often come in pairs. Complementary angles add to 90°. Supplementary angles add to 180°. Subtract the one you know from the total to find the other.',
    worked: ['Problem: two complementary angles, one is 35°.', 'Complementary → they add to 90°.', 'Other = 90 - 35 = 55°.'],
    vocab: [{ t: 'Complementary', d: 'two angles summing to 90°' }, { t: 'Supplementary', d: 'two angles summing to 180°' }],
    misconception: 'Complementary = 90°, Supplementary = 180°. (C comes before S, 90 before 180.)',
    why: 'Angle rules build ramps, roofs, and video-game graphics.',
  },
  dp1: {
    concept: 'Probability measures how likely something is, from 0 (never) to 1 (always). It’s the number of favorable outcomes ÷ total outcomes.',
    worked: ['Problem: bag of 10 marbles, 3 red. P(red)?', 'Favorable = 3, total = 10.', 'P = 3/10 = 0.3.'],
    vocab: [{ t: 'Outcome', d: 'a possible result' }, { t: 'Probability', d: 'favorable ÷ total' }],
    misconception: 'Probability can’t be more than 1 (or 100%). If you get a bigger number, you flipped the fraction.',
    why: 'Probability drives games, weather forecasts, and sports stats.',
  },
  dp2: {
    concept: 'The mean is the average. Add up all the values, then divide by how many values there are.',
    worked: ['Problem: mean of 4, 8, 6, 2.', 'Add them: 4 + 8 + 6 + 2 = 20.', 'Count them: 4 values.', 'Mean = 20 ÷ 4 = 5.'],
    vocab: [{ t: 'Mean', d: 'the average of a data set' }, { t: 'Data set', d: 'a collection of numbers' }],
    misconception: 'Divide by how many numbers there are — not by the biggest one.',
    why: 'Averages summarize grades, scores, and prices in one number.',
  },
};
if (typeof module !== 'undefined') { module.exports = { THEORY }; }
