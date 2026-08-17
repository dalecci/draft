// Vibrant Resonance — offline-first store + sync
// Every device keeps a full localStorage mirror. Two interchangeable backends:
//   1. CLOUD (primary): a private GitHub repo (vibeplate-data) shared by every
//      device in every location. Enter the sync token once per device in
//      Admin → Backup & Settings → Cloud Sync. Rows merge last-write-wins.
//   2. LOCAL SERVER (dev / LAN fallback): the Node server's /api/sync.
// If neither is reachable, everything keeps working locally and syncs when a
// backend returns. Nothing is lost.
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

  // ---- cloud backend (GitHub private repo) ----
  const GH_OWNER = 'dalecci';
  const GH_REPO = 'vibeplate-data';
  const GH_PATH = 'data.json';

  function syncToken() { return localStorage.getItem('vr_sync_token') || ''; }
  function setSyncToken(t) {
    if (t) localStorage.setItem('vr_sync_token', t.trim());
    else localStorage.removeItem('vr_sync_token');
    sync();
  }

  // Unicode-safe base64 (chunked — avoids call-stack limits on large docs)
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Fold every local row into the shared doc (LWW). Returns how many rows changed.
  function mergeLocalIntoDoc(doc) {
    let changed = 0;
    for (const t of TABLES) {
      if (!Array.isArray(doc.tables[t])) doc.tables[t] = [];
      const byId = new Map(doc.tables[t].map((r) => [r.id, r]));
      for (const row of state.data[t]) {
        const remote = byId.get(row.id);
        if (!remote || Number(remote.updated_at || 0) < Number(row.updated_at || 0)) {
          if (remote) Object.assign(remote, row);
          else doc.tables[t].push(row);
          changed++;
        }
      }
    }
    return changed;
  }

  async function githubSync() {
    const token = syncToken();
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
    const headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      // Pull the shared doc
      let doc = { format: 1, tables: {} };
      let sha = null;
      const res = await fetch(url + '?nocache=' + Date.now(), { headers, cache: 'no-store' });
      if (res.status === 200) {
        const body = await res.json();
        sha = body.sha;
        try { doc = JSON.parse(b64decode(body.content)); } catch { doc = { format: 1, tables: {} }; }
        if (!doc.tables) doc.tables = {};
      } else if (res.status === 401 || res.status === 403) {
        throw new Error('token');
      } else if (res.status !== 404) {
        throw new Error('HTTP ' + res.status);
      }

      mergeIncoming(doc.tables);                 // cloud → this device
      const changed = mergeLocalIntoDoc(doc);    // this device → cloud

      if (changed === 0) return true;            // nothing new to push

      const put = await fetch(url, {
        method: 'PUT', headers,
        body: JSON.stringify({
          message: `sync from ${deviceId()}`,
          content: b64encode(JSON.stringify(doc)),
          ...(sha ? { sha } : {}),
        }),
      });
      if (put.ok) return true;
      if (put.status === 409 || put.status === 422) continue; // another device pushed first — refetch & retry
      if (put.status === 401 || put.status === 403) throw new Error('token');
      throw new Error('HTTP ' + put.status);
    }
    throw new Error('conflict-retries');
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

  let syncing = false;
  let lastError = '';

  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      if (syncToken()) {
        // Cloud backend — shared across every location
        await githubSync();
        for (const t of TABLES) state.dirty[t] = [];
        state.lastSync = Date.now();
        save();
        lastError = '';
        setOnline(true);
      } else {
        // Local Node server backend (clinic LAN / dev)
        const changes = {};
        for (const t of TABLES) {
          changes[t] = state.dirty[t].map((id) => state.data[t].find((r) => r.id === id)).filter(Boolean);
        }
        const res = await fetch('api/ping', { method: 'GET' }).catch(() => null);
        if (!res || !res.ok) throw new Error('no-backend');
        const syncRes = await fetch('api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: deviceId(), since: state.lastSync, changes }),
        });
        if (!syncRes.ok) throw new Error('HTTP ' + syncRes.status);
        const body = await syncRes.json();
        for (const t of TABLES) state.dirty[t] = [];
        mergeIncoming(body.changes);
        state.lastSync = body.now;
        save();
        lastError = '';
        setOnline(true);
      }
    } catch (e) {
      lastError = e.message === 'token'
        ? 'Sync token rejected — re-enter it in Admin → Cloud Sync'
        : (e.message || 'sync failed');
      setOnline(false);
    } finally {
      syncing = false;
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
  setInterval(sync, 12000); // live background sync
  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  return {
    rows, get, upsert, softDelete, setting, setSetting, sync, onChange,
    exportAll, importAll, uuid, deviceId, setSyncToken,
    get isOnline() { return online; },
    get lastSync() { return state.lastSync; },
    get hasSyncToken() { return !!syncToken(); },
    get lastError() { return lastError; },
  };
})();
