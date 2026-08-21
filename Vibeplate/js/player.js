// Vibrant Resonance — Session Player
// Full-screen console that runs a protocol: auto-advancing steps, countdowns,
// progress ring, pause/resume/skip, voice announcements, chime, session logging.
'use strict';

const Player = (() => {
  let protocol = null;      // {name, presetId?, kbId?, steps:[{hz, seconds, sweepToHz?}]}
  let stepIndex = 0;
  let stepStart = 0;        // AudioContext clock time when the current step began
  let playedBefore = 0;     // seconds of tone completed in previous steps
  let running = false;
  let paused = false;
  let startedAt = 0;
  let rafId = 0;
  let advanceTimer = 0;     // interval driving step advancement (audio-clock based,
                            // keeps working even when the tab is backgrounded)
  let wakeLock = null;
  let sessionLogged = false;

  // Audio-clock timing: ctx.currentTime freezes while suspended (paused), so these
  // stay exact through pause/resume with no drift bookkeeping.
  function ctxNow() { return AudioEngine.context ? AudioEngine.context.currentTime : 0; }
  function stepElapsed() { return Math.max(0, ctxNow() - stepStart); }
  function stepRemaining() { return Math.max(0, protocol.steps[stepIndex].seconds - stepElapsed()); }
  function elapsedTotal() { return playedBefore + Math.min(stepElapsed(), protocol.steps[stepIndex].seconds); }

  const $ = (sel) => document.querySelector(sel);

  function fmt(s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtHz(hz) {
    return (Math.round(hz * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  function voiceOn() { return Store.setting('voice', false); } // off by default — enable in Admin if ever wanted

  function speak(text) {
    if (!voiceOn() || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.0;
    speechSynthesis.speak(u);
  }

  async function acquireWakeLock() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  }
  function releaseWakeLock() { try { wakeLock?.release(); } catch {} wakeLock = null; }

  function totalSeconds() { return protocol.steps.reduce((a, s) => a + s.seconds, 0); }

  function start(proto) {
    protocol = { ...proto, steps: proto.steps.map((s) => ({ ...s })) };
    if (!protocol.steps.length) return;
    stepIndex = 0;
    playedBefore = 0;
    running = true;
    paused = false;
    sessionLogged = false;
    startedAt = Date.now();
    $('#session-overlay').classList.remove('hidden');
    $('#session-summary').classList.add('hidden');
    $('#session-live').classList.remove('hidden');
    $('#sp-pause').textContent = '⏸ Pause';
    $('#session-live').classList.remove('paused');
    $('#sp-name').textContent = protocol.name;
    $('#sp-user').textContent = App.currentUserName() || '—';
    syncVM15UI();
    renderSteps();
    acquireWakeLock();
    AudioEngine.ensureContext();
    beginStep(0, true);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(uiTick);
    clearInterval(advanceTimer);
    advanceTimer = setInterval(advanceCheck, 250);
    speak(`Beginning ${protocol.name}. ${protocol.steps.length} steps. Total time ${describeDuration(totalSeconds())}.`);
  }

  function describeDuration(s) {
    const m = Math.round(s / 60);
    if (m < 1) return `${Math.round(s)} seconds`;
    return m === 1 ? '1 minute' : `${m} minutes`;
  }

  function beginStep(i, first = false) {
    stepIndex = i;
    const step = protocol.steps[i];
    const warn = step.hz > AudioEngine.maxCleanHz() || (step.sweepToHz && step.sweepToHz > AudioEngine.maxCleanHz());
    const pulse = step.pulseHz || 0;
    if (first || !AudioEngine.playing) AudioEngine.start(step.hz, pulse);
    else AudioEngine.retune(step.hz, pulse); // handles carrier + pulse changes, rebuilds chain if needed
    if (step.sweepToHz) AudioEngine.glideTo(step.sweepToHz, step.seconds);
    stepStart = ctxNow();
    $('#sp-warning').classList.toggle('hidden', !warn);
    renderSteps();
    const label = step.sweepToHz
      ? `Sweep ${fmtHz(step.hz)} to ${fmtHz(step.sweepToHz)} hertz`
      : step.pulseHz
        ? `${fmtHz(step.hz)} hertz, pulsed at ${step.pulseHz} hertz`
        : `${fmtHz(step.hz)} hertz`;
    speak(`Step ${i + 1} of ${protocol.steps.length}. ${label}. ${describeDuration(step.seconds)}.`);
  }

  // Advancement runs on a plain interval reading the audio clock — keeps stepping
  // even when the tab is backgrounded and rAF is frozen.
  function advanceCheck() {
    if (!running || paused) return;
    if (stepRemaining() <= 0) {
      if (stepIndex + 1 < protocol.steps.length) {
        playedBefore += protocol.steps[stepIndex].seconds;
        beginStep(stepIndex + 1);
      } else { finish(); return; } // elapsedTotal() caps the final step at its full duration
    }
    updateUI(); // interval-driven so the console stays live even when rAF is frozen (backgrounded tab)
  }

  function uiTick() {
    if (!running) return;
    updateUI();
    rafId = requestAnimationFrame(uiTick);
  }

  // ---- VM15 in-session toggle ----
  function syncVM15UI() {
    const mode = AudioEngine.vm15Mode;
    const tag = $('#sp-vm15');
    tag.classList.toggle('hidden', mode === 'off');
    tag.textContent = mode === 'dual' ? '📳 VM15 DUAL · TONE + PLATE PULSE' : '📳 VM15 FOLD · OCTAVE-FOLDED';
    const btn = $('#sp-vm15-btn');
    btn.classList.toggle('on', mode !== 'off');
    btn.classList.toggle('dual', mode === 'dual');
    btn.textContent = mode === 'off' ? '📳 VM15' : mode === 'fold' ? '📳 FOLD' : '📳 DUAL';
  }

  function cycleVM15() {
    const next = { off: 'fold', fold: 'dual', dual: 'off' }[AudioEngine.vm15Mode];
    AudioEngine.setVM15Mode(next);
    syncVM15UI();
    renderSteps(); // step labels change with the mode
    // Re-shape the live audio right now, mid-step
    if (running && !paused && AudioEngine.playing) {
      const step = protocol.steps[stepIndex];
      AudioEngine.retune(step.hz, step.pulseHz || 0);
    }
    if (window.App?.refreshVM15) App.refreshVM15(); // keep the main header pill in sync
  }

  function updateUI() {
    const step = protocol.steps[stepIndex];
    const rem = stepRemaining();
    const total = totalSeconds();
    const done = protocol.steps.slice(0, stepIndex).reduce((a, s) => a + s.seconds, 0) + (step.seconds - rem);
    // Center readout
    $('#sp-freq').textContent = fmtHz(AudioEngine.currentHz || step.hz);
    $('#sp-step-time').textContent = fmt(rem);
    $('#sp-total-time').textContent = fmt(total - done) + ' left';
    $('#sp-step-label').textContent = `Step ${stepIndex + 1} of ${protocol.steps.length}`;
    // Ring
    const C = 2 * Math.PI * 90;
    $('#sp-ring-progress').style.strokeDashoffset = C * (1 - Math.min(1, done / total));
    // Info cards
    const next = protocol.steps[stepIndex + 1];
    $('#sp-next-hz').textContent = next
      ? `${next.sweepToHz ? fmtHz(next.hz) + '→' + fmtHz(next.sweepToHz) : fmtHz(next.hz)} Hz`
      : 'Finish 🏁';
    $('#sp-elapsed').textContent = fmt(done);
    $('#sp-count').textContent = `${stepIndex + 1} / ${protocol.steps.length}`;
    // Step list countdown + active-step progress bar
    const cells = document.querySelectorAll('#sp-steps .sp-step');
    cells.forEach((el, i) => {
      el.classList.toggle('active', i === stepIndex);
      el.classList.toggle('done', i < stepIndex);
      const t = el.querySelector('.sp-step-remaining');
      if (t) t.textContent = i < stepIndex ? '✓' : i === stepIndex ? fmt(rem) : fmt(protocol.steps[i].seconds);
      const bar = el.querySelector('.sp-step-bar');
      if (bar) bar.style.width = i < stepIndex ? '100%'
        : i === stepIndex ? ((1 - rem / protocol.steps[i].seconds) * 100).toFixed(1) + '%' : '0%';
    });
  }

  function renderSteps() {
    const el = $('#sp-steps');
    const hzLabel = (hz) => {
      const c = AudioEngine.resolveChain(hz, 0);
      if (c.carrier !== hz) {
        return `${c.carrier} <span class="sp-fold">(${fmtHz(hz)}÷${AudioEngine.fold(hz).div})</span>`;
      }
      return fmtHz(hz) + '';
    };
    el.innerHTML = protocol.steps.map((s, i) => {
      const chain = AudioEngine.resolveChain(s.hz, s.pulseHz || 0);
      const pulseBadge = chain.pulse ? ` <span class="sp-pulse">⚡${chain.pulse}</span>` : '';
      return `
      <div class="sp-step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}">
        <span class="sp-step-num">${i + 1}</span>
        <span class="sp-step-hz">${s.sweepToHz ? hzLabel(s.hz) + ' → ' + hzLabel(s.sweepToHz) : hzLabel(s.hz)} Hz${pulseBadge}</span>
        <span class="sp-step-remaining">${fmt(s.seconds)}</span>
        <span class="sp-step-bar"></span>
      </div>`;
    }).join('');
  }

  function pauseResume() {
    if (!running) return;
    paused = !paused;
    if (paused) { AudioEngine.pause(); speechSynthesis?.cancel(); }
    else AudioEngine.resume();
    $('#sp-pause').textContent = paused ? '▶ Resume' : '⏸ Pause';
    $('#session-live').classList.toggle('paused', paused);
  }

  function bankElapsed() {
    // Credit tone time actually played in the current step, then reset the step clock.
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

  function finish() { endSession(true); }

  function stopEarly() { endSession(false); }

  function endSession(completed) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    clearInterval(advanceTimer);
    AudioEngine.stop();
    releaseWakeLock();
    if (completed) {
      AudioEngine.chime();
      speak('Session complete.');
    } else {
      speechSynthesis?.cancel();
    }
    logSession(completed);
    // Summary + rating screen
    $('#session-live').classList.add('hidden');
    const sum = $('#session-summary');
    sum.classList.remove('hidden');
    $('#ss-title').textContent = completed ? 'Session Complete' : 'Session Stopped';
    $('#ss-detail').textContent =
      `${protocol.name} — ${completed ? protocol.steps.length : stepIndex} of ${protocol.steps.length} steps, ` +
      `${fmt(elapsedTotal())} of tone time`;
    // reset stars
    document.querySelectorAll('#ss-stars .star').forEach((s) => s.classList.remove('on'));
    $('#ss-notes').value = '';
    sum.dataset.rating = '';
  }

  let loggedSessionId = null;
  function logSession(completed) {
    if (sessionLogged) return;
    sessionLogged = true;
    loggedSessionId = Store.upsert('sessions', {
      id: undefined,
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
      vm15: AudioEngine.vm15 ? AudioEngine.vm15Mode : 0, // honest record of the delivery mode
      rating: null, notes: null,
    });
  }

  function saveRating() {
    const rating = Number($('#session-summary').dataset.rating) || null;
    const notes = $('#ss-notes').value.trim() || null;
    if (loggedSessionId && (rating || notes)) {
      const row = Store.get('sessions', loggedSessionId);
      if (row) Store.upsert('sessions', { ...row, rating, notes });
      const refId = protocol.presetId || protocol.kbId;
      if (refId && rating) Brain.recordRating(refId, rating, notes, loggedSessionId);
    }
    close();
  }

  function close() {
    if (running) endSession(false);
    $('#session-overlay').classList.add('hidden');
    App.refresh();
  }

  function bind() {
    $('#sp-vm15-btn').addEventListener('click', cycleVM15);
    $('#sp-pause').addEventListener('click', pauseResume);
    $('#sp-skip').addEventListener('click', skip);
    $('#sp-back').addEventListener('click', back);
    $('#sp-stop').addEventListener('click', stopEarly);
    $('#ss-save').addEventListener('click', saveRating);
    $('#ss-close').addEventListener('click', close);
    $('#sp-volume').addEventListener('input', (e) => AudioEngine.setVolume(Number(e.target.value) / 100));
    document.querySelectorAll('#ss-stars .star').forEach((star, i) => {
      star.addEventListener('click', () => {
        $('#session-summary').dataset.rating = String(i + 1);
        document.querySelectorAll('#ss-stars .star').forEach((s, j) => s.classList.toggle('on', j <= i));
      });
    });
    window.addEventListener('keydown', (e) => {
      if ($('#session-overlay').classList.contains('hidden')) return;
      if (e.code === 'Space') { e.preventDefault(); pauseResume(); }
      if (e.code === 'ArrowRight') skip();
      if (e.code === 'ArrowLeft') back();
    });
  }

  return { start, bind, get running() { return running; } };
})();
