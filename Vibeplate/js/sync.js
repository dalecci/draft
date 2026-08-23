"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
const Store = (() => {
  const KEY = "vr_store_v1";
  const TABLES = ["users", "sessions", "presets", "kb_entries", "training", "settings"];
  let state = { lastSync: 0, dirty: {}, data: {} };
  let online = false;
  let syncTimer = null;
  const listeners = /* @__PURE__ */ new Set();
  function deviceId() {
    let id = localStorage.getItem("vr_device_id");
    if (!id) {
      id = "dev-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("vr_device_id", id);
    }
    return id;
  }
  function uuid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
    }
    for (const t of TABLES) {
      if (!Array.isArray(state.data[t])) state.data[t] = [];
      if (!Array.isArray(state.dirty[t])) state.dirty[t] = [];
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error("save failed", e);
    }
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
    if (i >= 0) state.data[table][i] = __spreadValues(__spreadValues({}, state.data[table][i]), row);
    else state.data[table].push(row);
    if (!state.dirty[table].includes(row.id)) state.dirty[table].push(row.id);
    save();
    notify(table);
    scheduleSync();
    return row.id;
  }
  function softDelete(table, id) {
    const r = get(table, id);
    if (r) upsert(table, __spreadProps(__spreadValues({}, r), { deleted: 1 }));
  }
  function setting(id, fallback) {
    const r = get("settings", id);
    if (!r || !r.value_json) return fallback;
    try {
      return JSON.parse(r.value_json);
    } catch (e) {
      return fallback;
    }
  }
  function setSetting(id, value) {
    upsert("settings", { id, value_json: JSON.stringify(value) });
  }
  const GH_OWNER = "dalecci";
  const GH_REPO = "vibeplate-data";
  const GH_PATH = "data.json";
  function syncToken() {
    return localStorage.getItem("vr_sync_token") || "";
  }
  function setSyncToken(t) {
    if (t) localStorage.setItem("vr_sync_token", t.trim());
    else localStorage.removeItem("vr_sync_token");
    sync();
  }
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
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
    const url = "https://api.github.com/repos/".concat(GH_OWNER, "/").concat(GH_REPO, "/contents/").concat(GH_PATH);
    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      let doc = { format: 1, tables: {} };
      let sha = null;
      const res = await fetch(url + "?nocache=" + Date.now(), { headers, cache: "no-store" });
      if (res.status === 200) {
        const body = await res.json();
        sha = body.sha;
        try {
          doc = JSON.parse(b64decode(body.content));
        } catch (e) {
          doc = { format: 1, tables: {} };
        }
        if (!doc.tables) doc.tables = {};
      } else if (res.status === 401 || res.status === 403) {
        throw new Error("token");
      } else if (res.status !== 404) {
        throw new Error("HTTP " + res.status);
      }
      mergeIncoming(doc.tables);
      const changed = mergeLocalIntoDoc(doc);
      if (changed === 0) return true;
      const put = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(__spreadValues({
          message: "sync from ".concat(deviceId()),
          content: b64encode(JSON.stringify(doc))
        }, sha ? { sha } : {}))
      });
      if (put.ok) return true;
      if (put.status === 409 || put.status === 422) continue;
      if (put.status === 401 || put.status === 403) throw new Error("token");
      throw new Error("HTTP " + put.status);
    }
    throw new Error("conflict-retries");
  }
  function mergeIncoming(changes) {
    let changed = false;
    for (const t of TABLES) {
      for (const row of (changes == null ? void 0 : changes[t]) || []) {
        const local = get(t, row.id) || state.data[t].find((r) => r.id === row.id);
        const localFull = state.data[t].find((r) => r.id === row.id);
        if (localFull && Number(localFull.updated_at) >= Number(row.updated_at)) continue;
        if (localFull) Object.assign(localFull, row);
        else state.data[t].push(row);
        changed = true;
      }
    }
    if (changed) {
      save();
      notify("*");
    }
    return changed;
  }
  let syncing = false;
  let lastError = "";
  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      if (syncToken()) {
        await githubSync();
        for (const t of TABLES) state.dirty[t] = [];
        state.lastSync = Date.now();
        save();
        lastError = "";
        setOnline(true);
      } else {
        const changes = {};
        for (const t of TABLES) {
          changes[t] = state.dirty[t].map((id) => state.data[t].find((r) => r.id === id)).filter(Boolean);
        }
        const res = await fetch("api/ping", { method: "GET" }).catch(() => null);
        if (!res || !res.ok) throw new Error("no-backend");
        const syncRes = await fetch("api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: deviceId(), since: state.lastSync, changes })
        });
        if (!syncRes.ok) throw new Error("HTTP " + syncRes.status);
        const body = await syncRes.json();
        for (const t of TABLES) state.dirty[t] = [];
        mergeIncoming(body.changes);
        state.lastSync = body.now;
        save();
        lastError = "";
        setOnline(true);
      }
    } catch (e) {
      lastError = e.message === "token" ? "Sync token rejected \u2014 re-enter it in Admin \u2192 Cloud Sync" : e.message || "sync failed";
      setOnline(false);
    } finally {
      syncing = false;
    }
  }
  function setOnline(v) {
    if (online !== v) {
      online = v;
      notify("online");
    }
  }
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 800);
  }
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function notify(what) {
    listeners.forEach((fn) => {
      try {
        fn(what);
      } catch (e) {
      }
    });
  }
  function exportAll() {
    return JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), device: deviceId(), data: state.data }, null, 2);
  }
  function importAll(json) {
    const parsed = JSON.parse(json);
    if (!parsed.data) throw new Error("Not a Vibrant Resonance backup file");
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
  setInterval(sync, 12e3);
  window.addEventListener("online", sync);
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync();
  });
  return {
    rows,
    get,
    upsert,
    softDelete,
    setting,
    setSetting,
    sync,
    onChange,
    exportAll,
    importAll,
    uuid,
    deviceId,
    setSyncToken,
    get isOnline() {
      return online;
    },
    get lastSync() {
      return state.lastSync;
    },
    get hasSyncToken() {
      return !!syncToken();
    },
    get lastError() {
      return lastError;
    }
  };
})();
