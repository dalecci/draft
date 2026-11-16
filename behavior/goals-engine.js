// Goal / challenge scoring engine — pure functions, no DOM. Runs in the browser
// (window.GoalEngine) and in node (module.exports) so the math can be tested.
//
// A goal:
//   mode   'total'  → earn `target` points inside start_date..end_date
//          'streak' → `target` days in a row (end_date optional = open-ended)
//   scope  'individual' → each kid is scored on their own
//          'team'       → all kids' points (or team days) count together
//   items        [{ key, name, points, days:[0..6] }]  (0 = Sunday; omit days = every day)
//   day_weights  { "0".."6": multiplier }  e.g. weekends 0.5
//   day_overrides { "YYYY-MM-DD": multiplier }  holiday = 0, big day = 2
// A log row: { kid_id, item_key, log_date, status: 'done' | 'missed' }
// Unlogged cells are "still up for grabs" — they count toward what is possible.
(function (root) {
  'use strict';
  const EPS = 1e-9;
  const DAY = 86400000;

  function parse(ds) { const p = String(ds).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function fmt(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function addDays(ds, n) { return fmt(parse(ds) + n * DAY); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / DAY); } // b − a
  function dow(ds) { return new Date(parse(ds)).getUTCDay(); }
  function eachDate(a, b) {
    const out = [];
    if (!a || !b || b < a) return out;
    for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
    return out;
  }

  function dayWeight(g, ds) {
    const ov = g.day_overrides || {};
    if (Object.prototype.hasOwnProperty.call(ov, ds)) return Number(ov[ds]) || 0;
    const w = (g.day_weights || {})[String(dow(ds))];
    return w == null ? 1 : (Number(w) || 0);
  }
  function itemApplies(it, ds) { return !Array.isArray(it.days) || it.days.indexOf(dow(ds)) !== -1; }
  function cellValue(g, it, ds) {
    if (!itemApplies(it, ds)) return 0;
    return (Number(it.points) || 0) * dayWeight(g, ds);
  }
  // Open-ended goals are evaluated through today.
  function evalEnd(g, today) { return g.end_date || today; }

  function indexLogs(logs) {
    const m = new Map();
    (logs || []).forEach(function (l) { m.set(l.kid_id + '|' + l.item_key + '|' + l.log_date, l.status); });
    return m;
  }

  // Max points one kid can earn across the whole window (for the editor helper).
  function maxPerKid(g, today) {
    let max = 0;
    eachDate(g.start_date, evalEnd(g, today)).forEach(function (d) {
      (g.items || []).forEach(function (it) { max += Math.max(0, cellValue(g, it, d)); });
    });
    return max;
  }

  function kidTally(g, kidId, idx, today) {
    const t = { max: 0, earned: 0, attempted: 0, remaining: 0, elapsedMax: 0, pendingPast: 0, days: [] };
    eachDate(g.start_date, evalEnd(g, today)).forEach(function (d) {
      const day = { date: d, avail: 0, earned: 0, logged: 0, unlogged: 0 };
      (g.items || []).forEach(function (it) {
        const v = cellValue(g, it, d);
        if (v <= EPS) return;
        const st = idx.get(kidId + '|' + it.key + '|' + d) || null;
        day.avail += v;
        if (st === 'done') { day.earned += v; day.logged += v; }
        else if (st === 'missed') { day.logged += v; }
        else { day.unlogged += v; if (d < today) t.pendingPast++; }
      });
      t.max += day.avail; t.earned += day.earned; t.attempted += day.logged; t.remaining += day.unlogged;
      if (d < today) t.elapsedMax += day.avail;
      t.days.push(day);
    });
    return t;
  }

  function totalResult(target, s) {
    const needed = Math.max(0, target - s.earned);
    let state;
    if (s.earned >= target - EPS) state = 'made';
    else if (needed > s.remaining + EPS) state = 'out';
    else if (needed >= s.remaining - EPS) state = 'perfect';
    else state = 'alive';
    const expected = s.max > 0 ? target * (s.elapsedMax / s.max) : 0;
    return {
      needed: needed, state: state, expected: expected,
      onPace: s.earned >= expected - EPS,
      pct: target > 0 ? s.earned / target : 0,
    };
  }

  // A streak day: 'skip' (nothing to earn), 'hit', 'fail', or 'pending' (not scored yet).
  function dayStatus(day, pct) {
    if (!day || day.avail <= EPS) return 'skip';
    const need = day.avail * pct / 100 - EPS;
    if (day.earned >= need) return 'hit';
    if (day.earned + day.unlogged < need) return 'fail';
    return 'pending';
  }

  function streakResult(sts, N, today, endDate) {
    let run = 0, best = 0, wins = 0, unscored = 0;
    sts.forEach(function (x) {
      if (x.st === 'hit') { run++; if (run > best) best = run; }
      else if (x.st === 'fail') { wins += Math.floor(run / N); run = 0; }
      else if (x.st === 'pending' && x.date < today) unscored++;
    });
    wins += Math.floor(run / N);
    const daysLeft = sts.filter(function (x) { return x.st === 'pending' && x.date >= today; }).length;
    const needed = wins >= 1 ? 0 : N - run;
    let state;
    if (wins >= 1) state = 'made';
    else if (endDate && needed > daysLeft) state = 'out';
    else if (endDate && needed === daysLeft) state = 'perfect';
    else state = 'alive';
    return {
      current: run, best: best, wins: wins, needed: needed, daysLeft: daysLeft, state: state,
      unscored: unscored, pct: Math.min(1, best / N), streak: sts,
    };
  }

  function evaluate(g, idx, today) {
    const kids = (g.kid_ids || []).slice();
    const target = Number(g.target) || 0;
    const ended = !!(g.end_date && g.end_date < today);
    const per = {};
    kids.forEach(function (k) { per[k] = kidTally(g, k, idx, today); });
    const res = { ended: ended, target: target, mode: g.mode, scope: g.scope, kids: {}, team: null };

    if (g.mode === 'streak') {
      const N = Math.max(1, Math.round(target));
      const pct = g.streak_min_pct == null ? 100 : Number(g.streak_min_pct);
      kids.forEach(function (k) {
        const sts = per[k].days.map(function (d) { return { date: d.date, st: dayStatus(d, pct) }; });
        res.kids[k] = Object.assign({}, per[k], streakResult(sts, N, today, g.end_date));
      });
      if (g.scope === 'team' && kids.length) {
        const dates = per[kids[0]].days.map(function (d) { return d.date; });
        const teamSts = dates.map(function (date, i) {
          const sts = kids.map(function (k) { return dayStatus(per[k].days[i], pct); });
          let st;
          if (sts.every(function (s) { return s === 'skip'; })) st = 'skip';
          else if (sts.some(function (s) { return s === 'fail'; })) st = 'fail';
          else if (sts.every(function (s) { return s === 'hit' || s === 'skip'; })) st = 'hit';
          else st = 'pending';
          return { date: date, st: st };
        });
        res.team = streakResult(teamSts, N, today, g.end_date);
      }
    } else {
      kids.forEach(function (k) { res.kids[k] = Object.assign({}, per[k], totalResult(target, per[k])); });
      if (g.scope === 'team' && kids.length) {
        const agg = { max: 0, earned: 0, attempted: 0, remaining: 0, elapsedMax: 0, pendingPast: 0 };
        kids.forEach(function (k) { Object.keys(agg).forEach(function (f) { agg[f] += per[k][f]; }); });
        res.team = Object.assign(agg, totalResult(target, agg));
      }
    }

    // Final call per kid: 'won' | 'lost' | 'pending'
    kids.forEach(function (k) {
      const r = g.scope === 'team' ? res.team : res.kids[k];
      res.kids[k].outcome = r.state === 'made' ? 'won' : (r.state === 'out' ? 'lost' : 'pending');
    });
    return res;
  }

  const api = {
    parse: parse, fmt: fmt, addDays: addDays, diffDays: diffDays, dow: dow, eachDate: eachDate,
    dayWeight: dayWeight, itemApplies: itemApplies, cellValue: cellValue, indexLogs: indexLogs,
    maxPerKid: maxPerKid, kidTally: kidTally, totalResult: totalResult, dayStatus: dayStatus,
    streakResult: streakResult, evaluate: evaluate,
  };
  root.GoalEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
