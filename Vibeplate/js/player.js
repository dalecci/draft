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
const Player = /* @__PURE__ */ (() => {
  let protocol = null;
  let stepIndex = 0;
  let stepStart = 0;
  let playedBefore = 0;
  let running = false;
  let paused = false;
  let startedAt = 0;
  let rafId = 0;
  let advanceTimer = 0;
  let wakeLock = null;
  let sessionLogged = false;
  let clock = 0;
  let lastTickAudio = 0;
  let lastTickWall = 0;
  function clockTick() {
    const wall = performance.now() / 1e3;
    const audio = AudioEngine.context ? AudioEngine.context.currentTime : 0;
    if (running && !paused) {
      const dAudio = audio - lastTickAudio;
      const dWall = Math.max(0, Math.min(wall - lastTickWall, 2));
      clock += dAudio > 0.01 ? Math.min(dAudio, dWall + 0.5) : dWall;
    }
    lastTickAudio = audio;
    lastTickWall = wall;
  }
  function ctxNow() {
    return clock;
  }
  function stepElapsed() {
    return Math.max(0, ctxNow() - stepStart);
  }
  function stepRemaining() {
    return Math.max(0, protocol.steps[stepIndex].seconds - stepElapsed());
  }
  function elapsedTotal() {
    return playedBefore + Math.min(stepElapsed(), protocol.steps[stepIndex].seconds);
  }
  const $ = (sel) => document.querySelector(sel);
  function fmt(s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function fmtHz(hz) {
    return (Math.round(hz * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  function voiceOn() {
    return Store.setting("voice", false);
  }
  function speak(text) {
    if (!voiceOn() || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    speechSynthesis.speak(u);
  }
  async function acquireWakeLock() {
    var _a;
    try {
      wakeLock = await ((_a = navigator.wakeLock) == null ? void 0 : _a.request("screen"));
    } catch (e) {
    }
  }
  function releaseWakeLock() {
    try {
      wakeLock == null ? void 0 : wakeLock.release();
    } catch (e) {
    }
    wakeLock = null;
  }
  function totalSeconds() {
    return protocol.steps.reduce((a, s) => a + s.seconds, 0);
  }
  function start(proto) {
    protocol = __spreadProps(__spreadValues({}, proto), { steps: proto.steps.map((s) => __spreadValues({}, s)) });
    if (!protocol.steps.length) return;
    stepIndex = 0;
    playedBefore = 0;
    running = true;
    paused = false;
    sessionLogged = false;
    startedAt = Date.now();
    $("#session-overlay").classList.remove("hidden");
    $("#session-summary").classList.add("hidden");
    $("#session-live").classList.remove("hidden");
    $("#sp-pause").textContent = "\u23F8 Pause";
    $("#session-live").classList.remove("paused");
    $("#sp-name").textContent = protocol.name;
    $("#sp-user").textContent = App.currentUserName() || "\u2014";
    syncVM15UI();
    renderSteps();
    acquireWakeLock();
    AudioEngine.ensureContext();
    beginStep(0, true);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(uiTick);
    lastTickWall = performance.now() / 1e3;
    lastTickAudio = AudioEngine.context ? AudioEngine.context.currentTime : 0;
    clearInterval(advanceTimer);
    advanceTimer = setInterval(advanceCheck, 250);
    speak("Beginning ".concat(protocol.name, ". ").concat(protocol.steps.length, " steps. Total time ").concat(describeDuration(totalSeconds()), "."));
  }
  function describeDuration(s) {
    const m = Math.round(s / 60);
    if (m < 1) return "".concat(Math.round(s), " seconds");
    return m === 1 ? "1 minute" : "".concat(m, " minutes");
  }
  function beginStep(i, first = false) {
    stepIndex = i;
    const step = protocol.steps[i];
    const warn = step.hz > AudioEngine.maxCleanHz() || step.sweepToHz && step.sweepToHz > AudioEngine.maxCleanHz();
    const pulse = step.pulseHz || 0;
    if (first || !AudioEngine.playing) AudioEngine.start(step.hz, pulse);
    else AudioEngine.retune(step.hz, pulse);
    if (step.sweepToHz) AudioEngine.glideTo(step.sweepToHz, step.seconds);
    stepStart = ctxNow();
    $("#sp-warning").classList.toggle("hidden", !warn);
    renderSteps();
    const label = step.sweepToHz ? "Sweep ".concat(fmtHz(step.hz), " to ").concat(fmtHz(step.sweepToHz), " hertz") : step.pulseHz ? "".concat(fmtHz(step.hz), " hertz, pulsed at ").concat(step.pulseHz, " hertz") : "".concat(fmtHz(step.hz), " hertz");
    speak("Step ".concat(i + 1, " of ").concat(protocol.steps.length, ". ").concat(label, ". ").concat(describeDuration(step.seconds), "."));
  }
  function advanceCheck() {
    clockTick();
    if (!running || paused) return;
    const actx = AudioEngine.context;
    if (actx && actx.state === "suspended" && actx.resume) {
      try {
        actx.resume();
      } catch (e) {
      }
    }
    if (stepRemaining() <= 0) {
      if (stepIndex + 1 < protocol.steps.length) {
        playedBefore += protocol.steps[stepIndex].seconds;
        try {
          beginStep(stepIndex + 1);
        } catch (e) {
        }
      } else {
        finish();
        return;
      }
    }
    try {
      updateUI();
    } catch (e) {
    }
  }
  function uiTick() {
    if (!running) return;
    try {
      updateUI();
    } catch (e) {
    }
    rafId = requestAnimationFrame(uiTick);
  }
  function syncVM15UI() {
    const mode = AudioEngine.vm15Mode;
    const tag = $("#sp-vm15");
    tag.classList.toggle("hidden", mode === "off");
    tag.textContent = mode === "dual" ? "\u{1F4F3} VM15 DUAL \xB7 TOP + BOTTOM TONES" : "\u{1F4F3} VM15 FOLD \xB7 BOTTOM TONE ONLY";
    const btn = $("#sp-vm15-btn");
    btn.classList.toggle("on", mode !== "off");
    btn.classList.toggle("dual", mode === "dual");
    btn.textContent = mode === "off" ? "\u{1F4F3} VM15" : mode === "fold" ? "\u{1F4F3} FOLD" : "\u{1F4F3} DUAL";
  }
  function cycleVM15() {
    var _a;
    const next = { off: "fold", fold: "dual", dual: "off" }[AudioEngine.vm15Mode];
    AudioEngine.setVM15Mode(next);
    syncVM15UI();
    renderSteps();
    if (running && !paused && AudioEngine.playing) {
      const step = protocol.steps[stepIndex];
      AudioEngine.retune(step.hz, step.pulseHz || 0);
    }
    if ((_a = window.App) == null ? void 0 : _a.refreshVM15) App.refreshVM15();
  }
  function updateUI() {
    const step = protocol.steps[stepIndex];
    const rem = stepRemaining();
    const total = totalSeconds();
    const done = protocol.steps.slice(0, stepIndex).reduce((a, s) => a + s.seconds, 0) + (step.seconds - rem);
    $("#sp-freq").textContent = fmtHz(AudioEngine.currentHz || step.hz);
    $("#sp-step-time").textContent = fmt(rem);
    $("#sp-total-time").textContent = fmt(total - done) + " left";
    $("#sp-step-label").textContent = "Step ".concat(stepIndex + 1, " of ").concat(protocol.steps.length);
    const C = 2 * Math.PI * 90;
    $("#sp-ring-progress").style.strokeDashoffset = C * (1 - Math.min(1, done / total));
    const next = protocol.steps[stepIndex + 1];
    $("#sp-next-hz").textContent = next ? "".concat(next.sweepToHz ? fmtHz(next.hz) + "\u2192" + fmtHz(next.sweepToHz) : fmtHz(next.hz), " Hz") : "Finish \u{1F3C1}";
    $("#sp-elapsed").textContent = fmt(done);
    $("#sp-count").textContent = "".concat(stepIndex + 1, " / ").concat(protocol.steps.length);
    const cells = document.querySelectorAll("#sp-steps .sp-step");
    cells.forEach((el, i) => {
      el.classList.toggle("active", i === stepIndex);
      el.classList.toggle("done", i < stepIndex);
      const t = el.querySelector(".sp-step-remaining");
      if (t) t.textContent = i < stepIndex ? "\u2713" : i === stepIndex ? fmt(rem) : fmt(protocol.steps[i].seconds);
      const bar = el.querySelector(".sp-step-bar");
      if (bar) bar.style.width = i < stepIndex ? "100%" : i === stepIndex ? ((1 - rem / protocol.steps[i].seconds) * 100).toFixed(1) + "%" : "0%";
    });
  }
  function renderSteps() {
    const el = $("#sp-steps");
    const hzLabel = (hz) => {
      const c = AudioEngine.resolveChain(hz, 0);
      if (c.carrier !== hz) {
        return "".concat(c.carrier, ' <span class="sp-fold">(').concat(fmtHz(hz), "\xF7").concat(AudioEngine.fold(hz).div, ")</span>");
      }
      return fmtHz(hz) + "";
    };
    el.innerHTML = protocol.steps.map((s, i) => {
      const chain = AudioEngine.resolveChain(s.hz, s.pulseHz || 0);
      const pulseBadge = chain.mix ? ' <span class="sp-pulse">+ '.concat(chain.mix, " Hz</span>") : chain.pulse ? ' <span class="sp-pulse">\u26A1'.concat(chain.pulse, "</span>") : "";
      return '\n      <div class="sp-step '.concat(i === stepIndex ? "active" : "", " ").concat(i < stepIndex ? "done" : "", '">\n        <span class="sp-step-num">').concat(i + 1, '</span>\n        <span class="sp-step-hz">').concat(s.sweepToHz ? hzLabel(s.hz) + " \u2192 " + hzLabel(s.sweepToHz) : hzLabel(s.hz), " Hz").concat(pulseBadge, '</span>\n        <span class="sp-step-remaining">').concat(fmt(s.seconds), '</span>\n        <span class="sp-step-bar"></span>\n      </div>');
    }).join("");
  }
  function pauseResume() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      AudioEngine.pause();
      speechSynthesis == null ? void 0 : speechSynthesis.cancel();
    } else AudioEngine.resume();
    $("#sp-pause").textContent = paused ? "\u25B6 Resume" : "\u23F8 Pause";
    $("#session-live").classList.toggle("paused", paused);
  }
  function bankElapsed() {
    playedBefore += Math.min(stepElapsed(), protocol.steps[stepIndex].seconds);
    stepStart = ctxNow();
  }
  function skip() {
    if (!running) return;
    bankElapsed();
    if (stepIndex + 1 < protocol.steps.length) beginStep(stepIndex + 1);
    else finish();
  }
  function back() {
    if (!running) return;
    bankElapsed();
    beginStep(Math.max(0, stepIndex - 1));
  }
  function finish() {
    endSession(true);
  }
  function stopEarly() {
    endSession(false);
  }
  function endSession(completed) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    clearInterval(advanceTimer);
    AudioEngine.stop();
    releaseWakeLock();
    if (completed) {
      AudioEngine.chime();
      speak("Session complete.");
    } else {
      speechSynthesis == null ? void 0 : speechSynthesis.cancel();
    }
    logSession(completed);
    $("#session-live").classList.add("hidden");
    const sum = $("#session-summary");
    sum.classList.remove("hidden");
    $("#ss-title").textContent = completed ? "Session Complete" : "Session Stopped";
    $("#ss-detail").textContent = "".concat(protocol.name, " \u2014 ").concat(completed ? protocol.steps.length : stepIndex, " of ").concat(protocol.steps.length, " steps, ") + "".concat(fmt(elapsedTotal()), " of tone time");
    document.querySelectorAll("#ss-stars .star").forEach((s) => s.classList.remove("on"));
    $("#ss-notes").value = "";
    sum.dataset.rating = "";
  }
  let loggedSessionId = null;
  function logSession(completed) {
    if (sessionLogged) return;
    sessionLogged = true;
    loggedSessionId = Store.upsert("sessions", {
      id: void 0,
      user_id: App.currentUserId(),
      user_name: App.currentUserName(),
      started_at: startedAt,
      protocol_name: protocol.name,
      preset_id: protocol.presetId || protocol.kbId || null,
      steps_json: JSON.stringify(protocol.steps),
      steps_completed: completed ? protocol.steps.length : stepIndex,
      steps_planned: protocol.steps.length,
      total_seconds: Math.round(elapsedTotal()),
      completed: completed ? 1 : 0,
      vm15: AudioEngine.vm15 ? AudioEngine.vm15Mode : 0,
      // honest record of the delivery mode
      rating: null,
      notes: null
    });
  }
  function saveRating() {
    const rating = Number($("#session-summary").dataset.rating) || null;
    const notes = $("#ss-notes").value.trim() || null;
    if (loggedSessionId && (rating || notes)) {
      const row = Store.get("sessions", loggedSessionId);
      if (row) Store.upsert("sessions", __spreadProps(__spreadValues({}, row), { rating, notes }));
      const refId = protocol.presetId || protocol.kbId;
      if (refId && rating) Brain.recordRating(refId, rating, notes, loggedSessionId);
    }
    close();
  }
  function close() {
    if (running) endSession(false);
    $("#session-overlay").classList.add("hidden");
    App.refresh();
  }
  function bind() {
    $("#sp-vm15-btn").addEventListener("click", cycleVM15);
    $("#sp-pause").addEventListener("click", pauseResume);
    $("#sp-skip").addEventListener("click", skip);
    $("#sp-back").addEventListener("click", back);
    $("#sp-stop").addEventListener("click", stopEarly);
    $("#ss-save").addEventListener("click", saveRating);
    $("#ss-close").addEventListener("click", close);
    $("#sp-volume").addEventListener("input", (e) => AudioEngine.setVolume(Number(e.target.value) / 100));
    document.querySelectorAll("#ss-stars .star").forEach((star, i) => {
      star.addEventListener("click", () => {
        $("#session-summary").dataset.rating = String(i + 1);
        document.querySelectorAll("#ss-stars .star").forEach((s, j) => s.classList.toggle("on", j <= i));
      });
    });
    window.addEventListener("keydown", (e) => {
      if ($("#session-overlay").classList.contains("hidden")) return;
      if (e.code === "Space") {
        e.preventDefault();
        pauseResume();
      }
      if (e.code === "ArrowRight") skip();
      if (e.code === "ArrowLeft") back();
    });
  }
  return { start, bind, get running() {
    return running;
  } };
})();
