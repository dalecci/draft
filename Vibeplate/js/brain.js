// Vibrant Resonance — The Brain
// Knowledge layer:  KB_BASE (shipped) + kb_entries store rows (research updates) merged by id.
// Training layer:   training store rows (edits, ratings, tuned protocols) — kept completely
//                   separate so knowledge updates can NEVER erase what the Brain has learned.
'use strict';

const Brain = (() => {
  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // Convert a store row (SQLite column shape) into a canonical KB object.
  function rowToEntry(row) {
    let frequencies = [];
    let aliases = [];
    try { frequencies = JSON.parse(row.frequencies_json || '[]'); } catch {}
    try { aliases = JSON.parse(row.aliases || '[]'); } catch {}
    return {
      id: row.id, condition: row.condition_name, aliases, category: row.category || 'General & Support',
      frequencies, dwell: row.dwell || DEFAULT_DWELL, source: row.source || 'Imported research',
      notes: row.notes || '', noReliableListing: frequencies.length === 0, imported: true,
      updated_at: row.updated_at,
    };
  }

  // Full merged knowledge base: imported/updated entries override shipped ones by id.
  function all() {
    const map = new Map();
    for (const e of KB_BASE) map.set(e.id, { ...e });
    for (const row of Store.rows('kb_entries')) map.set(row.id, rowToEntry(row));
    for (const row of Store.rows('kb_entries', true)) {
      if (row.deleted) map.delete(row.id);
    }
    return [...map.values()];
  }

  function get(id) { return all().find((e) => e.id === id) || null; }

  // ---- Search ----
  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    const results = [];
    for (const e of all()) {
      const names = [e.condition, ...(e.aliases || [])].map((n) => n.toLowerCase());
      const hay = names.join(' ');
      let score = 0;
      // Exact name/alias matches dominate ("black mold" → Stachybotrys, not a partial alias)
      for (const n of names) {
        if (n === q) { score += 120; break; }
        if (n.startsWith(q)) { score += 40; break; }
      }
      if (hay.includes(q)) score += 25;
      for (const t of terms) {
        if (!t) continue;
        if (hay.includes(t)) score += 12;
        // token prefix bonus
        for (const word of hay.split(/[^a-z0-9.]+/)) {
          if (word.startsWith(t)) { score += 6; break; }
        }
      }
      if (score > 0) results.push({ entry: e, score });
    }
    results.sort((a, b) => b.score - a.score || a.entry.condition.localeCompare(b.entry.condition));
    return results.map((r) => r.entry);
  }

  // ---- Protocol building ----
  function buildProtocol(entry) {
    return {
      name: entry.condition,
      kbId: entry.id,
      steps: (entry.frequencies || []).map((hz) => ({ hz, seconds: entry.dwell || DEFAULT_DWELL })),
    };
  }

  // ---- Training (never touched by KB updates) ----
  function training(kind, refId) {
    return Store.rows('training').filter((r) => r.kind === kind && (!refId || r.ref_id === refId));
  }

  function recordTraining(kind, refId, payload) {
    return Store.upsert('training', {
      id: undefined, ref_id: refId, kind, payload_json: JSON.stringify(payload), created_at: Date.now(),
    });
  }

  // The user's tuned version of a KB entry's protocol (latest wins).
  function tunedProtocol(kbId) {
    const rowsFor = training('tuned-protocol', kbId).sort((a, b) => b.created_at - a.created_at);
    if (!rowsFor.length) return null;
    try {
      const payload = JSON.parse(rowsFor[0].payload_json);
      return { ...payload, tuned: true, tunedAt: rowsFor[0].created_at, trainingId: rowsFor[0].id };
    } catch { return null; }
  }

  function saveTunedProtocol(kbId, protocol, note) {
    return recordTraining('tuned-protocol', kbId, {
      name: protocol.name, kbId, steps: protocol.steps, note: note || '',
    });
  }

  function recordRating(refId, rating, notes, sessionId) {
    return recordTraining('rating', refId, { rating, notes: notes || '', sessionId });
  }

  function ratingSummary(refId) {
    const rs = training('rating', refId)
      .map((r) => { try { return JSON.parse(r.payload_json).rating; } catch { return null; } })
      .filter((n) => typeof n === 'number');
    if (!rs.length) return null;
    return { count: rs.length, avg: rs.reduce((a, b) => a + b, 0) / rs.length };
  }

  // What has the Brain learned overall (for the Admin training view)?
  function allTraining() {
    return Store.rows('training').map((r) => {
      let payload = {};
      try { payload = JSON.parse(r.payload_json); } catch {}
      return { ...r, payload };
    }).sort((a, b) => b.created_at - a.created_at);
  }

  // ---- Research import (writes ONLY to kb_entries — training is untouchable) ----
  // Accepts: JSON array, or text lines:
  //   Condition name | Category | 123, 456, 789 | dwell 180 | optional notes
  //   Condition name: 123, 456, 789
  function parseResearch(text) {
    const trimmed = text.trim();
    const entries = [];
    const errors = [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const arr = JSON.parse(trimmed);
        for (const item of Array.isArray(arr) ? arr : [arr]) {
          if (!item.condition || !Array.isArray(item.frequencies)) {
            errors.push('JSON entry missing "condition" or "frequencies" array: ' + JSON.stringify(item).slice(0, 80));
            continue;
          }
          entries.push({
            id: item.id || slugify(item.condition),
            condition: item.condition,
            aliases: item.aliases || [],
            category: item.category || 'General & Support',
            frequencies: item.frequencies.map(Number).filter((n) => n > 0),
            dwell: Number(item.dwell) || DEFAULT_DWELL,
            source: item.source || 'Imported research',
            notes: item.notes || '',
          });
        }
      } catch (e) {
        errors.push('JSON parse error: ' + e.message);
      }
      return { entries, errors };
    }
    for (const rawLine of trimmed.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      let name = '', category = 'General & Support', freqText = '', dwell = DEFAULT_DWELL, notes = '';
      if (line.includes('|')) {
        const parts = line.split('|').map((p) => p.trim());
        name = parts[0];
        category = parts[1] || category;
        freqText = parts[2] || '';
        for (const extra of parts.slice(3)) {
          const dm = extra.match(/dwell\s*(\d+)/i);
          if (dm) dwell = Number(dm[1]);
          else notes = notes ? notes + ' ' + extra : extra;
        }
      } else {
        const ci = line.lastIndexOf(':');
        if (ci === -1) { errors.push('Could not parse line: ' + line); continue; }
        name = line.slice(0, ci).trim();
        freqText = line.slice(ci + 1);
      }
      const freqs = (freqText.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0);
      if (!name || !freqs.length) { errors.push('No condition name or frequencies in: ' + line); continue; }
      entries.push({
        id: slugify(name), condition: name, aliases: [], category,
        frequencies: freqs, dwell, source: 'Imported research', notes,
      });
    }
    return { entries, errors };
  }

  function importEntries(entries) {
    let count = 0;
    for (const e of entries) {
      Store.upsert('kb_entries', {
        id: e.id,
        condition_name: e.condition,
        aliases: JSON.stringify(e.aliases || []),
        category: e.category,
        frequencies_json: JSON.stringify(e.frequencies),
        dwell: e.dwell || DEFAULT_DWELL,
        source: e.source || 'Imported research',
        notes: e.notes || '',
        version: KB_VERSION + 1,
      });
      count++;
    }
    return count;
  }

  return {
    all, get, search, buildProtocol, slugify,
    training, recordTraining, tunedProtocol, saveTunedProtocol, recordRating, ratingSummary, allTraining,
    parseResearch, importEntries,
  };
})();
