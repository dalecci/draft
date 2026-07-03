/* ============================================================================
   Ascend — Writing module (Florida B.E.S.T. Writing rubric)
   Prompts + a TRANSPARENT heuristic evaluator that scores the three official
   B.E.S.T. dimensions (Purpose/Structure, Development, Language) 1–4 each → /12.

   NOTE: this heuristic is a PROTOTYPE stand-in for the real evaluator, which
   (per the architecture doc) would call the Claude API anchored to the official
   rubric + graded anchor papers, with a human override. It is deterministic and
   explainable so you can see the UX and the rubric working end-to-end.
   ============================================================================ */

const WRITING_PROMPTS = [
  { id: 'w1', mode: 'Expository', title: 'A skill worth learning',
    prompt: 'Write an essay explaining a skill you think every 7th grader should learn, and why it matters. Use reasons and examples.' },
  { id: 'w2', mode: 'Argumentation', title: 'Longer or shorter school day?',
    prompt: 'Some people think the school day should be shorter. Write an essay arguing your position. Support your claim with reasons and evidence.' },
  { id: 'w3', mode: 'Expository', title: 'How something works',
    prompt: 'Explain how something you understand well actually works (a sport, a game, a hobby). Organize your explanation clearly with steps or parts.' },
];

const BEST_RUBRIC = {
  purpose: { name: 'Purpose / Structure', hint: 'clear central idea, organization, transitions, coherence' },
  development: { name: 'Development', hint: 'elaboration, evidence, examples, depth of ideas' },
  language: { name: 'Language', hint: 'vocabulary, sentence variety, conventions, tone' },
};

function _stdev(a) { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); }
function _clamp(n) { return Math.max(1, Math.min(4, Math.round(n))); }

function evaluateWriting(text) {
  const t = (text || '').trim();
  const words = t.match(/\b[\w']+\b/g) || [];
  const wc = words.length;
  const sentences = t.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const sc = Math.max(1, sentences.length);
  const paras = t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const pc = paras.length;
  const lower = ' ' + t.toLowerCase() + ' ';
  const transitions = ['first', 'second', 'next', 'then', 'however', 'therefore', 'for example', 'in addition', 'finally', 'because', 'as a result', 'on the other hand', 'furthermore', 'in conclusion', 'also', 'for instance', 'although'];
  const transCount = transitions.filter(w => lower.includes(w)).length;
  const evidence = ['for example', 'for instance', 'because', 'this shows', 'according to', 'evidence', 'such as', 'in fact', 'research', 'data'];
  const evCount = evidence.filter(w => lower.includes(w)).length;
  const uniq = new Set(words.map(w => w.toLowerCase())).size;
  const lexDiv = wc ? uniq / wc : 0;
  const lens = sentences.map(s => (s.match(/\b[\w']+\b/g) || []).length);
  const variety = _stdev(lens);
  const capStart = sentences.filter(s => /^["']?[A-Z]/.test(s)).length / sc;
  const endsPunct = /[.!?]["']?\s*$/.test(t);
  const hasConclusionCue = /in conclusion|to sum up|overall|in the end|that is why/i.test(t);

  // ---- score each dimension 1–4 with explainable rules ----
  const notes = { purpose: [], development: [], language: [] };

  let p = 1;
  if (pc >= 2) p++; else notes.purpose.push('Break your writing into paragraphs (intro, body, conclusion).');
  if (transCount >= 3) p++; else notes.purpose.push('Add transition words (first, however, for example, in conclusion) to connect ideas.');
  if (pc >= 3 && hasConclusionCue) p++; else notes.purpose.push('Add a clear ending that wraps up your main idea.');
  p = _clamp(p);

  let d = 1;
  if (wc >= 70) d++; else notes.development.push('Write more — aim for at least a few solid paragraphs.');
  if (wc >= 150) d++; else if (wc >= 70) notes.development.push('Develop your ideas further with more detail.');
  if (evCount >= 2) d++; else notes.development.push('Support your points with examples or evidence ("for example…", "because…").');
  d = _clamp(d);

  let l = 1;
  if (capStart > 0.8 && endsPunct) l++; else notes.language.push('Check capitalization at the start of sentences and end punctuation.');
  if (variety >= 3) l++; else notes.language.push('Vary your sentence length — mix short and longer sentences.');
  if (lexDiv >= 0.5 && wc >= 40) l++; else notes.language.push('Use more varied vocabulary; avoid repeating the same words.');
  l = _clamp(l);

  const dims = {
    purpose: { score: p, notes: notes.purpose },
    development: { score: d, notes: notes.development },
    language: { score: l, notes: notes.language },
  };
  const total = p + d + l;
  const overall = total >= 10 ? 'Strong work! 🌟' : total >= 7 ? 'Good progress — keep going!' : total >= 4 ? 'Nice start — use the tips to level up.' : 'Let’s build this out together.';
  return { dims, total, overall, stats: { words: wc, sentences: sc, paragraphs: pc } };
}

if (typeof module !== 'undefined') { module.exports = { WRITING_PROMPTS, BEST_RUBRIC, evaluateWriting }; }
