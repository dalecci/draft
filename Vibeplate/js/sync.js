// Vibrant Resonance — offline-first store + sync
// Every device keeps a full localStorage mirror and an outbox of dirty rows.
// The server merges by last-write-wins (updated_at). If the server is unreachable,
// everything keeps working locally and syncs when it returns. Nothing is lost.
'use strict';

const Store = (() => {
  const KEY = 'vr_store_v1';
  const TABLES = ['users', 'sessions', 'presets', 'kb_entries', 'training', 'settings'];

  let state = { lastSync: 0, dirty: {}, data: {} };
  let online = false;
  let syncTimer = null;
  const listeners = new Set();

  function deviceId() {
    let id = localStorage.getItem('vr_device_id');
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('vr_device_id', id);
    }
    return id;
  }

  function uuid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch {}
    for (const t of TABLES) {
      if (!Array.isArray(state.data[t])) state.data[t] = [];
      if (!Array.isArray(state.dirty[t])) state.dirty[t] = [];
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error('save failed', e); }
  }

  function rows(table, includeDeleted = false) {
    return state.data[table].filter((r) => includeDeleted || !r.deleted);
  }

  function get(table, id) {
    return state.data[table].find((r) => r.id === id) || null;
  }

  function upsert(table, row) {
    if (!row.id) row.id = uuid();
    row.updated_at = Date.now();
    row.device_id = deviceId();
    const i = state.data[table].findIndex((r) => r.id === row.id);
    if (i >= 0) state.data[table][i] = { ...state.data[table][i], ...row };
    else state.data[table].push(row);
    if (!state.dirty[table].includes(row.id)) state.dirty[table].push(row.id);
    save();
    notify(table);
    scheduleSync();
    return row.id;
  }

  function softDelete(table, id) {
    const r = get(table, id);
    if (r) upsert(table, { ...r, deleted: 1 });
  }

  function setting(id, fallback) {
    const r = get('settings', id);
    if (!r || !r.value_json) return fallback;
    try { return JSON.parse(r.value_json); } catch { return fallback; }
  }

  function setSetting(id, value) {
    upsert('settings', { id, value_json: JSON.stringify(value) });
  }

  // ---- sync ----
  function mergeIncoming(changes) {
    let changed = false;
    for (const t of TABLES) {
      for (const row of changes?.[t] || []) {
        const local = get(t, row.id) || state.data[t].find((r) => r.id === row.id);
        const localFull = state.data[t].find((r) => r.id === row.id);
        if (localFull && Number(localFull.updated_at) >= Number(row.updated_at)) continue;
        if (localFull) Object.assign(localFull, row);
        else state.data[t].push(row);
        changed = true;
      }
    }
    if (changed) { save(); notify('*'); }
    return changed;
  }

  async function sync() {
    const changes = {};
    for (const t of TABLES) {
      changes[t] = state.dirty[t].map((id) => state.data[t].find((r) => r.id === id)).filter(Boolean);
    }
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId(), since: state.lastSync, changes }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      for (const t of TABLES) state.dirty[t] = [];
      mergeIncoming(body.changes);
      state.lastSync = body.now;
      save();
      setOnline(true);
    } catch (e) {
      setOnline(false);
    }
  }

  function setOnline(v) {
    if (online !== v) { online = v; notify('online'); }
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 800);
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function notify(what) { listeners.forEach((fn) => { try { fn(what); } catch {} }); }

  function exportAll() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), device: deviceId(), data: state.data }, null, 2);
  }

  function importAll(json) {
    const parsed = JSON.parse(json);
    if (!parsed.data) throw new Error('Not a Vibrant Resonance backup file');
    let count = 0;
    for (const t of TABLES) {
      for (const row of parsed.data[t] || []) {
        if (!row.id) continue;
        const local = state.data[t].find((r) => r.id === row.id);
        if (local && Number(local.updated_at) >= Number(row.updated_at || 0)) continue;
        upsert(t, row);
        count++;
      }
    }
    return count;
  }

  load();
  setInterval(sync, 20000); // background sync every 20s
  window.addEventListener('online', sync);

  return {
    rows, get, upsert, softDelete, setting, setSetting, sync, onChange,
    exportAll, importAll, uuid, deviceId,
    get isOnline() { return online; },
    get lastSync() { return state.lastSync; },
  };
})();
