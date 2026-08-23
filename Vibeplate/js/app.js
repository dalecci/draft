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
const APP_VERSION = 23;
window.onerror = function(msg, src, line) {
  try {
    let el = document.getElementById("vr-err");
    if (!el) {
      el = document.createElement("div");
      el.id = "vr-err";
      document.body.appendChild(el);
    }
    el.textContent = "\u26A0 " + msg + " \u2014 " + String(src || "").split("/").pop() + ":" + line;
  } catch (e) {
  }
};
const App = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  let currentUser = null;
  let genRaf = 0;
  const genScopeBuf = new Float32Array(4096);
  function pins() {
    return Store.setting("pins", { app: "4545", admin: "1212" });
  }
  function toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), ms);
  }
  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function fmtHz(hz) {
    return (Math.round(hz * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  function protoTotal(steps) {
    return steps.reduce((a, s) => a + (Number(s.seconds) || 0), 0);
  }
  let pinBuffer = "";
  function renderDots() {
    $("#lock-dots").innerHTML = [0, 1, 2, 3].map((i) => '<span class="dot '.concat(i < pinBuffer.length ? "filled" : "", '"></span>')).join("");
  }
  function pressKey(k) {
    if (k === "back") pinBuffer = pinBuffer.slice(0, -1);
    else if (pinBuffer.length < 4) pinBuffer += k;
    renderDots();
    if (pinBuffer.length === 4) {
      if (pinBuffer === pins().app) {
        pinBuffer = "";
        $("#lock-screen").classList.add("hidden");
        showUserScreen();
      } else {
        const pad = $("#lock-pad-wrap");
        pad.classList.add("shake");
        setTimeout(() => {
          pad.classList.remove("shake");
          pinBuffer = "";
          renderDots();
        }, 450);
      }
    }
  }
  function activeUsers() {
    return Store.rows("users").filter((u) => u.active !== 0).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  function showUserScreen() {
    $("#user-screen").classList.remove("hidden");
    renderUserList();
  }
  function renderUserList() {
    const users = activeUsers();
    $("#user-list").innerHTML = users.length ? users.map((u) => '<button class="user-card" data-id="'.concat(u.id, '">').concat(u.name, "</button>")).join("") : '<p class="muted">No users yet \u2014 add the first one below.</p>';
    $$("#user-list .user-card").forEach((b) => b.addEventListener("click", () => {
      const u = Store.get("users", b.dataset.id);
      currentUser = { id: u.id, name: u.name };
      $("#user-screen").classList.add("hidden");
      enterApp();
    }));
  }
  function addUser(name) {
    name = (name || "").trim();
    if (!name) return;
    const exists = activeUsers().find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast("".concat(name, " already exists"));
      return;
    }
    Store.upsert("users", { id: void 0, name, active: 1 });
    renderUserList();
    renderAdminUsers();
  }
  function enterApp() {
    $("#main-app").classList.remove("hidden");
    $("#user-chip").textContent = currentUser.name;
    switchTab("generator");
    refresh();
  }
  function switchTab(tab) {
    $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tab-pane").forEach((p) => p.classList.toggle("hidden", p.id !== "tab-" + tab));
    if (tab === "generator") {
      updateGenInfo();
      startGenScope();
    } else stopGenScope();
    if (tab === "protocols") renderPresets();
    if (tab === "brain") {
      renderBrainResults($("#brain-q").value);
      updateChatKeyNotice();
    }
    if (tab === "admin") renderAdminGate();
  }
  function refresh() {
    seedUsers();
    renderUserList();
    renderPresets();
    renderAdminSessions();
    renderAdminUsers();
    renderTraining();
    updateSyncBadge();
  }
  function updateSyncBadge() {
    const dot = $("#sync-dot");
    dot.classList.toggle("online", Store.isOnline);
    $("#sync-label").textContent = Store.isOnline ? Store.hasSyncToken ? "Live \xB7 all locations" : "Synced" : "Local mode";
  }
  let genHz = 728;
  function setGenHz(hz) {
    hz = Math.min(1e5, Math.max(0.1, Number(hz) || 0.1));
    genHz = Math.round(hz * 10) / 10;
    $("#gen-freq").value = genHz;
    if (AudioEngine.playing) AudioEngine.setFrequency(genHz);
    updateGenInfo();
  }
  function updateGenInfo() {
    const info = AudioEngine.context ? AudioEngine.info() : null;
    $("#gen-sr").textContent = info ? info.sampleRate / 1e3 + " kHz \xB7 " + info.state : "starts on play";
    $("#gen-max").textContent = info ? fmtHz(info.nyquist) + " Hz" : "\u2014";
    const over = info && genHz > info.nyquist;
    $("#gen-warning").classList.toggle("hidden", !over);
    if (over) {
      $("#gen-warning").textContent = "\u26A0 ".concat(fmtHz(genHz), " Hz is above this device's clean limit of ").concat(fmtHz(info.nyquist), " Hz (sample rate ").concat(info.sampleRate / 1e3, " kHz). The tone cannot be produced accurately on this hardware.");
    }
    updateVM15Hint();
  }
  function updateVM15Hint() {
    const el = $("#gen-vm15-hint");
    const mode = AudioEngine.vm15Mode;
    if (mode === "off") {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const f = AudioEngine.fold(genHz);
    if (f.div === 1) {
      el.innerHTML = "\u{1F4F3} VM15: <b>".concat(f.hz, " Hz</b> is inside the plate's native band \u2014 plays as-is");
    } else if (mode === "fold") {
      el.innerHTML = "\u{1F4F3} VM15 FOLD: plays as <b>".concat(f.hz, " Hz</b> on the plate (").concat(fmtHz(genHz), " \xF7 ").concat(f.div, " \u2014 down ").concat(f.octaves, " octave").concat(f.octaves > 1 ? "s" : "", ")");
    } else {
      el.innerHTML = "\u{1F4F3} VM15 DUAL: <b>".concat(fmtHz(genHz), " Hz</b> + <b>").concat(f.hz, " Hz</b> playing together \u2014 two real tones, the plate moves on the bottom one");
    }
  }
  function updateVM15Pill() {
    const mode = AudioEngine.vm15Mode;
    const pill = $("#vm15-toggle");
    pill.classList.toggle("on", mode !== "off");
    pill.classList.toggle("dual", mode === "dual");
    pill.textContent = mode === "off" ? "\u{1F4F3} VM15" : mode === "fold" ? "\u{1F4F3} VM15 \xB7 FOLD" : "\u{1F4F3} VM15 \xB7 DUAL";
  }
  function toggleVM15() {
    const next = { off: "fold", fold: "dual", dual: "off" }[AudioEngine.vm15Mode];
    AudioEngine.setVM15Mode(next);
    updateVM15Pill();
    updateVM15Hint();
    if (AudioEngine.playing) AudioEngine.retune(genHz, 0);
    if (next === "fold") {
      if (!localStorage.getItem("vr_vm15_hint")) {
        localStorage.setItem("vr_vm15_hint", "1");
        toast("\u{1F4F3} FOLD \u2014 frequencies fold into the plate's band. Plug line-out \u2192 plate Audio-In, device volume high, plate intensity 0\u201399");
      } else toast("\u{1F4F3} FOLD \u2014 pure low tone, folded into the plate's band");
    } else if (next === "dual") {
      toast("\u{1F4F3} DUAL \u2014 top + bottom tones together: the original frequency AND its folded sub-tone, both real");
    } else {
      toast("VM15 off \u2014 normal speaker playback");
    }
  }
  function toggleGenPlay() {
    if (AudioEngine.playing) {
      AudioEngine.stop();
      $("#gen-play").textContent = "\u25B6 Play";
      $("#gen-play").classList.remove("playing");
    } else {
      AudioEngine.start(genHz);
      $("#gen-play").textContent = "\u23F9 Stop";
      $("#gen-play").classList.add("playing");
      updateGenInfo();
    }
  }
  function startGenScope() {
    cancelAnimationFrame(genRaf);
    const draw = () => {
      const canvas = $("#gen-scope");
      const ctx2 = canvas.getContext("2d");
      const { width: w, height: h } = canvas;
      ctx2.clearRect(0, 0, w, h);
      if (AudioEngine.playing && AudioEngine.waveform(genScopeBuf)) {
        ctx2.beginPath();
        ctx2.strokeStyle = "#2DD4BF";
        ctx2.lineWidth = 2;
        ctx2.shadowColor = "#2DD4BF";
        ctx2.shadowBlur = 10;
        const sr = AudioEngine.context.sampleRate;
        const samples = Math.min(genScopeBuf.length, Math.max(64, Math.floor(sr / Math.max(1, genHz) * 4)));
        for (let i = 0; i < samples; i++) {
          const x = i / samples * w;
          const y = h / 2 - genScopeBuf[i] * (h / 2.4);
          i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y);
        }
        ctx2.stroke();
        ctx2.shadowBlur = 0;
        const measured = AudioEngine.measuredHz();
        $("#gen-measured").textContent = measured ? fmtHz(measured) + " Hz" : "\u2014";
      } else {
        ctx2.beginPath();
        ctx2.strokeStyle = "rgba(255,255,255,.12)";
        ctx2.lineWidth = 1.5;
        ctx2.moveTo(0, h / 2);
        ctx2.lineTo(w, h / 2);
        ctx2.stroke();
        $("#gen-measured").textContent = "\u2014";
      }
      genRaf = requestAnimationFrame(draw);
    };
    draw();
  }
  function stopGenScope() {
    cancelAnimationFrame(genRaf);
  }
  const BUILTIN_PRESETS = [
    { id: "preset-parasites-4step", name: "Parasites \u2014 Classic 4-Step Cleanup", category: "Parasites", freqs: [728, 784, 880, 465] },
    { id: "preset-parasites-6step", name: "Parasites \u2014 Extended 6-Step", category: "Parasites", freqs: [728, 784, 880, 465, 727, 800] },
    { id: "preset-mold-core", name: "Mold & Fungus \u2014 General Core", category: "Mold & Fungus", freqs: [728, 784, 880, 464] },
    { id: "preset-mold-general", name: "Mold \u2014 General (13-frequency)", category: "Mold & Fungus", freqs: [222, 242, 523, 565, 592, 623, 745, 933, 1130, 1155, 1333, 1833, 4442] },
    { id: "preset-aspergillus-master", name: "Aspergillus \u2014 Master Set", category: "Mold & Fungus", freqs: [1972, 1823, 758, 743, 697, 524, 374, 339, 247] },
    { id: "preset-rife-classics", name: "Rife Classics \u2014 General Set", category: "General", freqs: [20, 72, 95, 125, 440, 465, 727, 787, 802, 880, 1550, 5e3, 1e4] },
    {
      id: "preset-asthma2-historical",
      name: "Asthma \u2014 CAFL Asthma_2 (Historical 45 min)",
      category: "Respiratory",
      steps: [1234, 3672, 7346, 727, 787, 880, 1e4, 47, 120].map((hz) => ({ hz, seconds: 300 }))
    },
    {
      id: "preset-gamma-frontal",
      name: "Frontal Lobe \u2014 Gamma 40 Hz (Research Mode)",
      category: "Brain & Cognition",
      favorite: 1,
      steps: [
        { hz: 700, seconds: 600, pulseHz: 40 },
        { hz: 700, seconds: 600, pulseHz: 40 },
        { hz: 700, seconds: 600, pulseHz: 40 }
      ]
    },
    {
      id: "preset-alzheimers2",
      name: "Memory \u2014 CAFL Alzheimers_2",
      category: "Brain & Cognition",
      steps: [19180.5, 2213, 5148, 866, 840, 624, 620, 430].map((hz) => ({ hz, seconds: 180 }))
    },
    {
      id: "preset-ibs-gutreset",
      name: "Gut Reset \u2014 CAFL IBS + Calm Finish",
      category: "Digestive",
      steps: [
        ...[6766, 5429, 4334, 2018, 1550, 880, 832, 829, 812, 802, 787, 727, 465, 422, 407, 334, 20].map((hz) => ({ hz, seconds: 180 })),
        { hz: 7.83, seconds: 180 },
        // Schumann — calm finisher
        { hz: 10, seconds: 180 }
        // alpha — calm finisher
      ]
    },
    {
      id: "preset-lymph-support",
      name: "Lymphatic Drainage \u2014 CAFL Lymph Support",
      category: "Lymph & Circulation",
      steps: [15.05, 10.36, 3176].map((hz) => ({ hz, seconds: 360 }))
    },
    {
      id: "preset-arteries",
      name: "Arteries \u2014 CAFL Arteriosclerosis",
      category: "Lymph & Circulation",
      steps: [1e4, 2720, 2170, 1800, 1600, 1500, 880, 787, 776, 727, 20].map((hz) => ({ hz, seconds: 180 }))
    },
    {
      id: "preset-tapeworm-totalkill",
      name: "Tapeworm \u2014 Total Kill (One Session)",
      category: "Parasites",
      favorite: 1,
      steps: [
        { hz: 522, seconds: 300 },
        { hz: 562, seconds: 300 },
        { hz: 843, seconds: 300 },
        { hz: 1223, seconds: 300 },
        { hz: 3032, seconds: 300 },
        { hz: 5522, seconds: 300 },
        { hz: 728, seconds: 180 },
        { hz: 784, seconds: 180 },
        { hz: 880, seconds: 180 },
        { hz: 465, seconds: 180 },
        { hz: 522, seconds: 300 },
        { hz: 562, seconds: 300 },
        { hz: 843, seconds: 300 }
      ]
    }
  ];
  const BUILTIN_USERS = [
    { id: "user-jordan", name: "Jordan" },
    { id: "user-dale", name: "Dale" },
    { id: "user-philip", name: "Philip Francis" }
  ];
  function seedUsers() {
    for (const u of BUILTIN_USERS) {
      if (Store.get("users", u.id)) continue;
      if (Store.rows("users").some((r) => (r.name || "").toLowerCase() === u.name.toLowerCase())) continue;
      Store.upsert("users", { id: u.id, name: u.name, active: 1 });
    }
  }
  function seedPresets() {
    for (const p of BUILTIN_PRESETS) {
      if (Store.get("presets", p.id)) continue;
      Store.upsert("presets", {
        id: p.id,
        name: p.name,
        category: p.category,
        builtin: 1,
        favorite: p.favorite || 0,
        steps_json: JSON.stringify(p.steps || p.freqs.map((hz) => ({ hz, seconds: 180 }))),
        created_by: "Vibrant research"
      });
    }
  }
  function presetSteps(p) {
    try {
      return JSON.parse(p.steps_json || "[]");
    } catch (e) {
      return [];
    }
  }
  function renderPresets() {
    const groupsEl = $("#preset-groups");
    if (!groupsEl) return;
    const presets = Store.rows("presets").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const cats = [...new Set(presets.map((p) => p.category || "General"))].sort();
    groupsEl.innerHTML = presets.length ? cats.map((cat) => '\n      <div class="preset-group">\n        <h3>'.concat(cat, '</h3>\n        <div class="preset-grid">\n          ').concat(presets.filter((p) => (p.category || "General") === cat).map((p) => {
      const steps = presetSteps(p);
      const rating = Brain.ratingSummary(p.id);
      return '\n            <div class="preset-card" data-id="'.concat(p.id, '">\n              <div class="preset-name">').concat(p.name, " ").concat(p.favorite ? "\u2605" : "", '</div>\n              <div class="preset-meta">').concat(steps.length, " steps \xB7 ").concat(fmtTime(protoTotal(steps)), " total\n                ").concat(rating ? " \xB7 \u2605 ".concat(rating.avg.toFixed(1), " (").concat(rating.count, ")") : "", '</div>\n              <div class="preset-freqs">').concat(steps.slice(0, 8).map((s) => fmtHz(s.hz)).join(" \xB7 ")).concat(steps.length > 8 ? " \u2026" : "", '</div>\n              <div class="preset-actions">\n                <button class="btn primary run-preset">\u25B6 Run</button>\n                <button class="btn edit-preset">Edit</button>\n                <button class="btn dup-preset">Copy</button>\n                <button class="btn fav-preset">').concat(p.favorite ? "\u2605" : "\u2606", '</button>\n                <button class="btn danger del-preset">\u2715</button>\n              </div>\n            </div>');
    }).join(""), "\n        </div>\n      </div>")).join("") : '<p class="muted">No protocols yet \u2014 tap \u201CNew Protocol\u201D.</p>';
    $$("#preset-groups .preset-card").forEach((card) => {
      const p = Store.get("presets", card.dataset.id);
      card.querySelector(".run-preset").addEventListener("click", () => Player.start({ name: p.name, presetId: p.id, steps: presetSteps(p) }));
      card.querySelector(".edit-preset").addEventListener("click", () => openBuilder(p));
      card.querySelector(".dup-preset").addEventListener("click", () => {
        Store.upsert("presets", {
          id: void 0,
          name: p.name + " (copy)",
          category: p.category,
          steps_json: p.steps_json,
          created_by: (currentUser == null ? void 0 : currentUser.name) || ""
        });
        renderPresets();
      });
      card.querySelector(".fav-preset").addEventListener("click", () => {
        Store.upsert("presets", __spreadProps(__spreadValues({}, p), { favorite: p.favorite ? 0 : 1 }));
        renderPresets();
      });
      card.querySelector(".del-preset").addEventListener("click", () => {
        if (confirm('Delete "'.concat(p.name, '"?'))) {
          Store.softDelete("presets", p.id);
          renderPresets();
        }
      });
    });
  }
  let builderState = { id: null, kbId: null, steps: [] };
  function openBuilder(preset, fromBrain) {
    builderState = preset ? { id: preset.id, kbId: fromBrain ? preset.kbId : null, steps: presetSteps(preset).map((s) => __spreadValues({}, s)) } : { id: null, kbId: null, steps: [{ hz: 728, seconds: 180 }] };
    $("#builder-title").textContent = preset ? preset.id ? "Edit Protocol" : "New Protocol" : "New Protocol";
    $("#b-name").value = preset ? preset.name : "";
    $("#b-category").value = preset ? preset.category || "General" : "General";
    renderBuilderSteps();
    $("#builder-modal").classList.remove("hidden");
  }
  function renderBuilderSteps() {
    $("#b-steps").innerHTML = builderState.steps.map((s, i) => '\n      <div class="b-step" data-i="'.concat(i, '">\n        <span class="b-num">').concat(i + 1, '</span>\n        <input type="number" class="b-hz" value="').concat(s.hz, '" min="0.1" max="100000" step="0.1" title="Frequency (Hz)"> Hz\n        <input type="number" class="b-min" value="').concat(Math.floor(s.seconds / 60), '" min="0" max="120" title="Minutes"> m\n        <input type="number" class="b-sec" value="').concat(s.seconds % 60, '" min="0" max="59" title="Seconds"> s\n        <label class="b-sweep-label"><input type="checkbox" class="b-sweep-on" ').concat(s.sweepToHz ? "checked" : "", '> sweep\u2192</label>\n        <input type="number" class="b-sweep" value="').concat(s.sweepToHz || "", '" min="0.1" max="100000" step="0.1"\n          placeholder="Hz" ').concat(s.sweepToHz ? "" : "disabled", '>\n        <button class="btn b-up" title="Move up">\u2191</button>\n        <button class="btn b-down" title="Move down">\u2193</button>\n        <button class="btn danger b-del" title="Remove">\u2715</button>\n      </div>')).join("");
    $("#b-total").textContent = "Total: " + fmtTime(protoTotal(builderState.steps));
    $$("#b-steps .b-step").forEach((row) => {
      const i = Number(row.dataset.i);
      const sync = () => {
        const s = builderState.steps[i];
        s.hz = Math.min(1e5, Math.max(0.1, Number(row.querySelector(".b-hz").value) || 0.1));
        s.seconds = Math.max(1, (Number(row.querySelector(".b-min").value) || 0) * 60 + (Number(row.querySelector(".b-sec").value) || 0));
        const on = row.querySelector(".b-sweep-on").checked;
        row.querySelector(".b-sweep").disabled = !on;
        s.sweepToHz = on ? Number(row.querySelector(".b-sweep").value) || null : null;
        if (s.sweepToHz === null && on === false) delete s.sweepToHz;
        $("#b-total").textContent = "Total: " + fmtTime(protoTotal(builderState.steps));
      };
      row.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", sync));
      row.querySelector(".b-sweep-on").addEventListener("change", () => {
        sync();
        renderBuilderSteps();
      });
      row.querySelector(".b-del").addEventListener("click", () => {
        builderState.steps.splice(i, 1);
        renderBuilderSteps();
      });
      row.querySelector(".b-up").addEventListener("click", () => {
        if (i > 0) {
          [builderState.steps[i - 1], builderState.steps[i]] = [builderState.steps[i], builderState.steps[i - 1]];
          renderBuilderSteps();
        }
      });
      row.querySelector(".b-down").addEventListener("click", () => {
        if (i < builderState.steps.length - 1) {
          [builderState.steps[i + 1], builderState.steps[i]] = [builderState.steps[i], builderState.steps[i + 1]];
          renderBuilderSteps();
        }
      });
    });
  }
  function builderProtocol() {
    return {
      name: $("#b-name").value.trim() || "Untitled Protocol",
      steps: builderState.steps.filter((s) => s.hz > 0 && s.seconds > 0)
    };
  }
  function saveBuilder(run) {
    const proto = builderProtocol();
    if (!proto.steps.length) {
      toast("Add at least one step");
      return;
    }
    const id = Store.upsert("presets", {
      id: builderState.id || void 0,
      name: proto.name,
      category: $("#b-category").value || "General",
      steps_json: JSON.stringify(proto.steps),
      created_by: (currentUser == null ? void 0 : currentUser.name) || ""
    });
    $("#builder-modal").classList.add("hidden");
    renderPresets();
    toast("Protocol saved");
    if (run) Player.start({ name: proto.name, presetId: id, steps: proto.steps });
  }
  function renderBrainResults(q) {
    const el = $("#brain-results");
    const detail = $("#brain-detail");
    detail.classList.add("hidden");
    el.classList.remove("hidden");
    const results = q && q.trim() ? Brain.search(q) : Brain.all().sort((a, b) => a.condition.localeCompare(b.condition));
    el.innerHTML = results.length ? results.map((e) => '\n      <button class="brain-card" data-id="'.concat(e.id, '">\n        <span class="brain-cond">').concat(e.condition, '</span>\n        <span class="brain-meta">\n          <span class="badge cat">').concat(e.category, '</span>\n          <span class="badge src ').concat(e.source === "Vibrant research" ? "vibrant" : "", '">').concat(e.source, "</span>\n          ").concat(e.verify ? '<span class="badge warn">verify</span>' : "", "\n          ").concat(Brain.tunedProtocol(e.id) ? '<span class="badge tuned">\u{1F393} tuned</span>' : "", "\n          ").concat(e.noReliableListing ? '<span class="badge none">no reliable listing</span>' : '<span class="badge">'.concat(e.frequencies.length, " freqs</span>"), "\n        </span>\n      </button>")).join("") : '<p class="muted">Nothing found. Try another name, or add it via Admin \u2192 Add Research.</p>';
    $$("#brain-results .brain-card").forEach((b) => b.addEventListener("click", () => renderBrainDetail(b.dataset.id)));
  }
  let brainSteps = [];
  function renderBrainDetail(kbId) {
    const e = Brain.get(kbId);
    if (!e) return;
    const tuned = Brain.tunedProtocol(kbId);
    const rating = Brain.ratingSummary(kbId);
    $("#brain-results").classList.add("hidden");
    const detail = $("#brain-detail");
    detail.classList.remove("hidden");
    if (e.noReliableListing) {
      detail.innerHTML = '\n        <button class="btn" id="brain-back">\u2190 Back</button>\n        <h2>'.concat(e.condition, '</h2>\n        <p class="brain-none">No reliable CAFL/Rife listing exists for this organism \u2014 the Brain won\'t invent numbers.</p>\n        <p class="muted">').concat(e.notes || "", "</p>");
      $("#brain-back").addEventListener("click", () => renderBrainResults($("#brain-q").value));
      return;
    }
    const proto = tuned ? { name: tuned.name, kbId, steps: tuned.steps.map((s) => __spreadValues({}, s)) } : Brain.buildProtocol(e);
    brainSteps = proto.steps;
    detail.innerHTML = '\n      <button class="btn" id="brain-back">\u2190 Back</button>\n      <h2>'.concat(e.condition, '</h2>\n      <p class="brain-src">\n        <span class="badge cat">').concat(e.category, '</span>\n        <span class="badge src ').concat(e.source === "Vibrant research" ? "vibrant" : "", '">').concat(e.source, "</span>\n        ").concat(e.verify ? '<span class="badge warn">starter data \u2014 verify</span>' : "", "\n        ").concat(rating ? '<span class="badge">\u2605 '.concat(rating.avg.toFixed(1), " \xB7 ").concat(rating.count, " session").concat(rating.count > 1 ? "s" : "", "</span>") : "", "\n      </p>\n      ").concat(tuned ? '<div class="tuned-banner">\u{1F393} Showing <b>your tuned version</b> (trained '.concat(new Date(tuned.tunedAt).toLocaleDateString(), "). The Brain remembers your adjustments.</div>") : "", "\n      ").concat(e.notes ? '<p class="muted">'.concat(e.notes, "</p>") : "", '\n      <div class="brain-proto" id="brain-proto"></div>\n      <div class="brain-actions">\n        <button class="btn primary" id="brain-run">\u25B6 Run Now</button>\n        <button class="btn" id="brain-save-preset">\u{1F4BE} Save to Protocol Bank</button>\n        <button class="btn" id="brain-train">\u{1F393} Train Brain with My Edits</button>\n        ').concat(tuned ? '<button class="btn" id="brain-stock">\u21BA Show Stock Version</button>' : "", "\n      </div>");
    renderBrainProto();
    $("#brain-back").addEventListener("click", () => renderBrainResults($("#brain-q").value));
    $("#brain-run").addEventListener("click", () => {
      maybeAutoTrain(e, tuned);
      Player.start({ name: e.condition, kbId: e.id, steps: brainSteps.filter((s) => s.hz > 0 && s.seconds > 0) });
    });
    $("#brain-save-preset").addEventListener("click", () => {
      Store.upsert("presets", {
        id: void 0,
        name: e.condition,
        category: e.category,
        steps_json: JSON.stringify(brainSteps),
        created_by: "Brain + " + ((currentUser == null ? void 0 : currentUser.name) || "")
      });
      toast("Saved to Protocol Bank");
    });
    $("#brain-train").addEventListener("click", () => {
      Brain.saveTunedProtocol(e.id, { name: e.condition, steps: brainSteps }, "Manually trained by " + ((currentUser == null ? void 0 : currentUser.name) || ""));
      toast("\u{1F393} The Brain learned your version \u2014 it will offer it first from now on");
      renderTraining();
      renderBrainDetail(e.id);
    });
    const stockBtn = $("#brain-stock");
    if (stockBtn) stockBtn.addEventListener("click", () => {
      brainSteps = Brain.buildProtocol(e).steps;
      renderBrainProto();
      toast("Showing stock listing (your tuned version is still remembered)");
    });
  }
  function maybeAutoTrain(entry, tuned) {
    const baseline = tuned ? tuned.steps : Brain.buildProtocol(entry).steps;
    if (JSON.stringify(baseline) !== JSON.stringify(brainSteps)) {
      Brain.saveTunedProtocol(entry.id, { name: entry.condition, steps: brainSteps }, "Learned from edited run by " + ((currentUser == null ? void 0 : currentUser.name) || ""));
      toast("\u{1F393} Brain learned your adjustments");
    }
  }
  function renderBrainProto() {
    $("#brain-proto").innerHTML = '\n      <div class="b-steps-mini">\n        '.concat(brainSteps.map((s, i) => '\n          <div class="b-step" data-i="'.concat(i, '">\n            <span class="b-num">').concat(i + 1, '</span>\n            <input type="number" class="b-hz" value="').concat(s.hz, '" min="0.1" max="100000" step="0.1"> Hz\n            <input type="number" class="b-min" value="').concat(Math.floor(s.seconds / 60), '" min="0" max="120"> m\n            <input type="number" class="b-sec" value="').concat(s.seconds % 60, '" min="0" max="59"> s\n            <button class="btn danger b-del">\u2715</button>\n          </div>')).join(""), '\n      </div>\n      <div class="row-between">\n        <button class="btn" id="brain-add-step">+ Add Step</button>\n        <span class="muted">Total: ').concat(fmtTime(protoTotal(brainSteps)), "</span>\n      </div>");
    $$("#brain-proto .b-step").forEach((row) => {
      const i = Number(row.dataset.i);
      const sync = () => {
        brainSteps[i].hz = Math.min(1e5, Math.max(0.1, Number(row.querySelector(".b-hz").value) || 0.1));
        brainSteps[i].seconds = Math.max(1, (Number(row.querySelector(".b-min").value) || 0) * 60 + (Number(row.querySelector(".b-sec").value) || 0));
        renderBrainProto();
      };
      row.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", sync));
      row.querySelector(".b-del").addEventListener("click", () => {
        brainSteps.splice(i, 1);
        renderBrainProto();
      });
    });
    $("#brain-add-step").addEventListener("click", () => {
      brainSteps.push({ hz: 728, seconds: 180 });
      renderBrainProto();
    });
  }
  const chatHistory = [];
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function miniMd(s) {
    return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  }
  function updateChatKeyNotice() {
    const noKey = !BrainAI.hasKey();
    $("#bc-nokey").classList.toggle("hidden", !noKey);
    $("#bc-send").disabled = noKey;
  }
  function addChatBubble(role, html) {
    const el = document.createElement("div");
    el.className = "bc-msg " + role;
    el.innerHTML = html;
    $("#bc-thread").appendChild(el);
    $("#bc-thread").scrollTop = $("#bc-thread").scrollHeight;
    return el;
  }
  function renderChatProtocol(container, proto) {
    const total = protoTotal(proto.steps);
    const card = document.createElement("div");
    card.className = "bc-proto";
    card.innerHTML = '\n      <div class="bc-proto-name">'.concat(escapeHtml(proto.name), '</div>\n      <div class="bc-proto-steps">').concat(proto.steps.map((s, i) => '<span class="bc-step">'.concat(i + 1, ". ").concat(fmtHz(s.hz)).concat(s.sweepToHz ? "\u2192" + fmtHz(s.sweepToHz) : "", " Hz \xB7 ").concat(fmtTime(s.seconds), "</span>")).join(""), '</div>\n      <div class="bc-proto-meta muted">').concat(proto.steps.length, " steps \xB7 ").concat(fmtTime(total), ' total</div>\n      <div class="bc-proto-actions">\n        <button class="btn primary bc-run">\u25B6 Run Now</button>\n        <button class="btn bc-save">\u{1F4BE} Save to Bank</button>\n      </div>');
    container.appendChild(card);
    const kbMatch = Brain.search(proto.name)[0];
    const kbId = kbMatch && kbMatch.condition.toLowerCase() === proto.name.toLowerCase() ? kbMatch.id : null;
    card.querySelector(".bc-run").addEventListener("click", () => Player.start({ name: proto.name, kbId, steps: proto.steps.map((s) => __spreadValues({}, s)) }));
    card.querySelector(".bc-save").addEventListener("click", () => {
      Store.upsert("presets", {
        id: void 0,
        name: proto.name,
        category: "General",
        steps_json: JSON.stringify(proto.steps),
        created_by: "AI Brain + " + ((currentUser == null ? void 0 : currentUser.name) || "")
      });
      toast("Saved to Protocol Bank");
      renderPresets();
    });
  }
  async function sendChat() {
    const input = $("#bc-input");
    const text = input.value.trim();
    if (!text || $("#bc-send").disabled) return;
    input.value = "";
    addChatBubble("user", miniMd(text));
    chatHistory.push({ role: "user", content: text });
    const thinking = addChatBubble("assistant thinking", '<span class="bc-dots"><span>\xB7</span><span>\xB7</span><span>\xB7</span></span> The Brain is thinking\u2026');
    $("#bc-send").disabled = true;
    const result = await BrainAI.ask(chatHistory);
    thinking.remove();
    $("#bc-send").disabled = !BrainAI.hasKey();
    if (result.error) {
      if (result.error === "no_key") updateChatKeyNotice();
      else addChatBubble("assistant error", "\u26A0 " + escapeHtml(result.detail || "Something went wrong \u2014 try again."));
      chatHistory.pop();
      input.value = text;
      return;
    }
    const bubble = addChatBubble("assistant", miniMd(result.reply || ""));
    if (result.protocol) renderChatProtocol(bubble, result.protocol);
    chatHistory.push({ role: "assistant", content: JSON.stringify(result) });
    $("#bc-thread").scrollTop = $("#bc-thread").scrollHeight;
  }
  let adminUnlocked = false;
  function renderAdminGate() {
    $("#admin-gate").classList.toggle("hidden", adminUnlocked);
    $("#admin-content").classList.toggle("hidden", !adminUnlocked);
    if (adminUnlocked) {
      renderAdminSessions();
      renderAdminUsers();
      renderTraining();
      renderBackupStatus();
    }
  }
  function tryAdminPin() {
    if ($("#admin-pin").value === pins().admin) {
      adminUnlocked = true;
      $("#admin-pin").value = "";
      renderAdminGate();
    } else {
      $("#admin-pin").value = "";
      toast("Wrong admin PIN");
    }
  }
  function switchAdminSection(sec) {
    $$(".admin-nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.sec === sec));
    $$(".admin-sec").forEach((p) => p.classList.toggle("hidden", p.id !== "sec-" + sec));
  }
  function filteredSessions() {
    var _a, _b, _c, _d;
    const u = ((_a = $("#flt-user")) == null ? void 0 : _a.value) || "";
    const from = ((_b = $("#flt-from")) == null ? void 0 : _b.value) ? new Date($("#flt-from").value).getTime() : 0;
    const to = ((_c = $("#flt-to")) == null ? void 0 : _c.value) ? new Date($("#flt-to").value).getTime() + 864e5 : Infinity;
    const q = (((_d = $("#flt-q")) == null ? void 0 : _d.value) || "").toLowerCase();
    return Store.rows("sessions").filter((s) => (!u || s.user_name === u) && s.started_at >= from && s.started_at <= to && (!q || (s.protocol_name || "").toLowerCase().includes(q) || (s.notes || "").toLowerCase().includes(q))).sort((a, b) => b.started_at - a.started_at);
  }
  function renderAdminSessions() {
    const tbody = $("#sessions-table tbody");
    if (!tbody) return;
    const sel = $("#flt-user");
    const names = [...new Set(Store.rows("sessions").map((s) => s.user_name).filter(Boolean))].sort();
    const cur = sel.value;
    sel.innerHTML = '<option value="">All users</option>' + names.map((n) => "<option ".concat(n === cur ? "selected" : "", ">").concat(n, "</option>")).join("");
    const sessions = filteredSessions();
    tbody.innerHTML = sessions.length ? sessions.map((s) => "\n      <tr>\n        <td>".concat(new Date(s.started_at).toLocaleDateString(), '<br><span class="muted">').concat(new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), "</span></td>\n        <td>").concat(s.user_name || "\u2014", "</td>\n        <td>").concat(s.protocol_name || "\u2014", "</td>\n        <td>").concat(s.steps_completed, "/").concat(s.steps_planned, " ").concat(s.completed ? "\u2705" : "\u23F9", "</td>\n        <td>").concat(fmtTime(s.total_seconds || 0), "</td>\n        <td>").concat(s.rating ? "\u2605".repeat(s.rating) : "\u2014", '</td>\n        <td class="muted">').concat(s.notes || "", "</td>\n      </tr>")).join("") : '<tr><td colspan="7" class="muted">No sessions logged yet.</td></tr>';
  }
  function exportCsv() {
    const rows = [["Date", "Time", "User", "Protocol", "Steps Completed", "Steps Planned", "Completed", "Minutes", "Rating", "Notes", "Frequencies"]];
    for (const s of filteredSessions()) {
      let freqs = "";
      try {
        freqs = JSON.parse(s.steps_json).map((st) => st.hz).join(" ");
      } catch (e) {
      }
      rows.push([
        new Date(s.started_at).toLocaleDateString(),
        new Date(s.started_at).toLocaleTimeString(),
        s.user_name || "",
        s.protocol_name || "",
        s.steps_completed,
        s.steps_planned,
        s.completed ? "yes" : "no",
        (s.total_seconds / 60).toFixed(1),
        s.rating || "",
        (s.notes || "").replace(/"/g, "'"),
        freqs
      ]);
    }
    const csv = rows.map((r) => r.map((c) => '"'.concat(c, '"')).join(",")).join("\n");
    download("vibrant-resonance-sessions.csv", csv, "text/csv");
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function renderAdminUsers() {
    const el = $("#admin-user-list");
    if (!el) return;
    const users = Store.rows("users").sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    el.innerHTML = users.length ? users.map((u) => '\n      <div class="admin-user '.concat(u.active === 0 ? "inactive" : "", '" data-id="').concat(u.id, '">\n        <span>').concat(u.name, '</span>\n        <span>\n          <button class="btn u-rename">Rename</button>\n          <button class="btn u-toggle">').concat(u.active === 0 ? "Reactivate" : "Deactivate", "</button>\n        </span>\n      </div>")).join("") : '<p class="muted">No users yet.</p>';
    $$("#admin-user-list .admin-user").forEach((row) => {
      const u = Store.get("users", row.dataset.id);
      row.querySelector(".u-rename").addEventListener("click", () => {
        const name = prompt("New name for " + u.name, u.name);
        if (name && name.trim()) {
          Store.upsert("users", __spreadProps(__spreadValues({}, u), { name: name.trim() }));
          refresh();
        }
      });
      row.querySelector(".u-toggle").addEventListener("click", () => {
        Store.upsert("users", __spreadProps(__spreadValues({}, u), { active: u.active === 0 ? 1 : 0 }));
        refresh();
      });
    });
  }
  let parsedResearch = null;
  function previewResearch() {
    const { entries, errors } = Brain.parseResearch($("#research-text").value);
    parsedResearch = entries;
    $("#research-preview").innerHTML = "\n      ".concat(errors.length ? '<div class="import-errors">'.concat(errors.map((e) => "<div>\u26A0 ".concat(e, "</div>")).join(""), "</div>") : "", "\n      ").concat(entries.length ? '\n        <table class="mini-table"><thead><tr><th>Condition</th><th>Category</th><th>Frequencies</th><th>Dwell</th></tr></thead>\n        <tbody>'.concat(entries.map((e) => "<tr><td>".concat(e.condition, "</td><td>").concat(e.category, "</td><td>").concat(e.frequencies.join(", "), "</td><td>").concat(e.dwell, "s</td></tr>")).join(""), '</tbody></table>\n        <p class="muted">').concat(entries.length, " entr").concat(entries.length === 1 ? "y" : "ies", " ready. Existing entries with the same name are updated; <b>Brain training is never touched by imports.</b></p>") : '<p class="muted">Nothing parsed yet.</p>');
    $("#research-apply").disabled = !entries.length;
  }
  function applyResearch() {
    if (!(parsedResearch == null ? void 0 : parsedResearch.length)) return;
    const n = Brain.importEntries(parsedResearch);
    toast("\u{1F9E0} Brain updated \u2014 ".concat(n, " entr").concat(n === 1 ? "y" : "ies", " added/refreshed. Training preserved."));
    $("#research-text").value = "";
    $("#research-preview").innerHTML = "";
    $("#research-apply").disabled = true;
    parsedResearch = null;
  }
  function renderTraining() {
    const el = $("#training-list");
    if (!el) return;
    const rows = Brain.allTraining();
    el.innerHTML = rows.length ? rows.map((r) => {
      const ref = Brain.get(r.ref_id);
      const what = r.kind === "tuned-protocol" ? "Tuned protocol (".concat((r.payload.steps || []).length, " steps)") : r.kind === "rating" ? "Rating ".concat("\u2605".repeat(r.payload.rating || 0)).concat(r.payload.notes ? " \u2014 " + r.payload.notes : "") : r.kind;
      return '\n      <div class="training-row" data-id="'.concat(r.id, '">\n        <div>\n          <b>').concat(ref ? ref.condition : r.ref_id || "\u2014", "</b> \xB7 ").concat(what, '\n          <div class="muted">').concat(new Date(r.created_at).toLocaleString(), '</div>\n        </div>\n        <button class="btn danger t-del">\u2715</button>\n      </div>');
    }).join("") : '<p class="muted">No training yet. Edit a Brain protocol or rate a session and it will appear here.</p>';
    $$("#training-list .training-row").forEach((row) => {
      row.querySelector(".t-del").addEventListener("click", () => {
        if (confirm("Remove this training item?")) {
          Store.softDelete("training", row.dataset.id);
          renderTraining();
        }
      });
    });
  }
  function renderBackupStatus() {
    const backend = Store.hasSyncToken ? "Cloud (all locations)" : "Local server / this device";
    $("#backup-status").innerHTML = "\n      <div>Backend: <b>".concat(backend, "</b></div>\n      <div>Status: <b>").concat(Store.isOnline ? "connected \u2705" : Store.lastError || "not connected \u2014 data stays on this device", "</b></div>\n      <div>Last sync: <b>").concat(Store.lastSync ? new Date(Store.lastSync).toLocaleString() : "never", '</b></div>\n      <div>This device: <span class="muted">').concat(Store.deviceId(), "</span></div>");
    $("#set-voice").checked = Store.setting("voice", false);
    $("#sync-token-status").textContent = Store.hasSyncToken ? "\u2705 Cloud sync connected on this device" : "Not connected yet \u2014 paste the sync token to join the shared database.";
    renderApiKeyStatus();
  }
  function renderApiKeyStatus() {
    const key = Store.setting("anthropic_key", "");
    $("#api-key-status").textContent = key ? "\u2705 AI Brain enabled (key \u2026".concat(key.slice(-6), ")") : "No key yet \u2014 get one at platform.claude.com, paste it here, and the Brain becomes conversational.";
  }
  function bind() {
    $("#lock-pad").addEventListener("click", (e) => {
      var _a;
      const key = (_a = e.target.closest("[data-key]")) == null ? void 0 : _a.dataset.key;
      if (key) pressKey(key);
    });
    window.addEventListener("keydown", (e) => {
      if (!$("#lock-screen").classList.contains("hidden")) {
        if (/^[0-9]$/.test(e.key)) pressKey(e.key);
        if (e.key === "Backspace") pressKey("back");
      }
    });
    renderDots();
    $("#add-user-btn").addEventListener("click", () => {
      addUser($("#new-user-name").value);
      $("#new-user-name").value = "";
    });
    $("#new-user-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addUser(e.target.value);
        e.target.value = "";
      }
    });
    $("#switch-user").addEventListener("click", () => {
      if (Player.running) {
        toast("Stop the session first");
        return;
      }
      AudioEngine.stop();
      $("#main-app").classList.add("hidden");
      showUserScreen();
    });
    $$(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    $("#vm15-toggle").addEventListener("click", toggleVM15);
    $("#gen-freq").addEventListener("change", (e) => setGenHz(e.target.value));
    $$("#gen-nudge button").forEach((b) => b.addEventListener("click", () => setGenHz(genHz + Number(b.dataset.d))));
    $("#gen-play").addEventListener("click", toggleGenPlay);
    $("#gen-volume").addEventListener("input", (e) => {
      AudioEngine.setVolume(Number(e.target.value) / 100);
      $("#gen-vol-label").textContent = e.target.value + "%";
    });
    $$("#gen-chips button").forEach((b) => b.addEventListener("click", () => setGenHz(Number(b.dataset.hz))));
    $("#new-preset-btn").addEventListener("click", () => openBuilder(null));
    $("#b-add-step").addEventListener("click", () => {
      builderState.steps.push({ hz: 728, seconds: 180 });
      renderBuilderSteps();
    });
    $("#b-save").addEventListener("click", () => saveBuilder(false));
    $("#b-run").addEventListener("click", () => saveBuilder(true));
    $("#b-cancel").addEventListener("click", () => $("#builder-modal").classList.add("hidden"));
    $("#brain-q").addEventListener("input", (e) => renderBrainResults(e.target.value));
    $("#bc-send").addEventListener("click", sendChat);
    $("#bc-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    $("#admin-enter").addEventListener("click", tryAdminPin);
    $("#admin-pin").addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryAdminPin();
    });
    $$(".admin-nav-btn").forEach((b) => b.addEventListener("click", () => switchAdminSection(b.dataset.sec)));
    ["flt-user", "flt-from", "flt-to", "flt-q"].forEach((id) => $("#" + id).addEventListener("input", renderAdminSessions));
    $("#export-csv").addEventListener("click", exportCsv);
    $("#admin-add-user").addEventListener("click", () => {
      addUser($("#admin-new-user").value);
      $("#admin-new-user").value = "";
    });
    $("#research-preview-btn").addEventListener("click", previewResearch);
    $("#research-apply").addEventListener("click", applyResearch);
    $("#backup-export").addEventListener("click", () => download("vibrant-resonance-backup-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json", Store.exportAll(), "application/json"));
    $("#backup-import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const n = Store.importAll(await file.text());
        toast("Backup restored \u2014 ".concat(n, " records merged"));
        refresh();
      } catch (err) {
        toast("Import failed: " + err.message);
      }
      e.target.value = "";
    });
    $("#set-voice").addEventListener("change", (e) => Store.setSetting("voice", e.target.checked));
    $("#save-sync-token").addEventListener("click", () => {
      const t = $("#set-sync-token").value.trim();
      if (!t) {
        toast("Paste the sync token first");
        return;
      }
      Store.setSyncToken(t);
      $("#set-sync-token").value = "";
      toast("\u2601 Connecting to the shared database\u2026");
      setTimeout(() => {
        renderBackupStatus();
        updateSyncBadge();
      }, 2500);
    });
    $("#save-api-key").addEventListener("click", () => {
      const key = $("#set-api-key").value.trim();
      if (!key.startsWith("sk-ant-")) {
        toast("That does not look like an Anthropic key (sk-ant-\u2026)");
        return;
      }
      Store.setSetting("anthropic_key", key);
      $("#set-api-key").value = "";
      renderApiKeyStatus();
      updateChatKeyNotice();
      toast("\u{1F9E0} AI Brain enabled");
    });
    Player.bind();
    Store.onChange((what) => {
      if (what === "online") updateSyncBadge();
      else if (what === "*") refresh();
    });
  }
  function init() {
    document.getElementById("ver-badge").textContent = "VibePlate v" + APP_VERSION;
    if (localStorage.getItem("vr_app_ver") !== String(APP_VERSION)) {
      localStorage.removeItem("vr_wa_dead");
      localStorage.setItem("vr_app_ver", String(APP_VERSION));
    }
    bind();
    updateVM15Pill();
    seedUsers();
    seedPresets();
    Store.sync();
    updateSyncBadge();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {
    });
  }
  document.addEventListener("DOMContentLoaded", init);
  return {
    refresh,
    toast,
    refreshVM15: () => {
      updateVM15Pill();
      updateVM15Hint();
    },
    currentUserId: () => (currentUser == null ? void 0 : currentUser.id) || null,
    currentUserName: () => (currentUser == null ? void 0 : currentUser.name) || null
  };
})();
