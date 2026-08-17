// Vibrant Resonance — audio engine
// Pure sine generation via Web Audio. Click-free ramps, sweep support, live analyser.
'use strict';

const AudioEngine = (() => {
  const RAMP = 0.04; // seconds — cosine-smooth enough at this length to be click-free

  let ctx = null;
  let master = null;   // master volume
  let voiceGain = null; // per-tone envelope (ramped on start/stop/step change)
  let osc = null;
  let analyser = null;
  let playing = false;
  let currentHz = 0;
  let volume = 0.3;    // safe default

  function ensureContext() {
    if (ctx) return ctx;
    // Ask for 192 kHz so high-frequency work is possible; browser falls back if unsupported.
    try {
      ctx = new AudioContext({ sampleRate: 192000 });
    } catch {
      ctx = new AudioContext();
    }
    master = ctx.createGain();
    master.gain.value = volume;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    return ctx;
  }

  function info() {
    ensureContext();
    return {
      sampleRate: ctx.sampleRate,
      nyquist: ctx.sampleRate / 2,
      state: ctx.state,
    };
  }

  // Highest frequency this device can cleanly produce.
  function maxCleanHz() { return ensureContext().sampleRate / 2; }

  function start(hz) {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    stopNow(); // safety: never two oscillators
    currentHz = hz;
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    osc = ctx.createOscillator();
    osc.type = 'sine'; // mathematically pure
    osc.frequency.value = hz;
    osc.connect(voiceGain);
    voiceGain.connect(master);
    const t = ctx.currentTime;
    osc.start(t);
    voiceGain.gain.linearRampToValueAtTime(1, t + RAMP);
    playing = true;
  }

  // Change frequency between protocol steps: quick dip to zero, retune, rise. No clicks.
  function setFrequency(hz) {
    currentHz = hz;
    if (!playing || !osc) return;
    const t = ctx.currentTime;
    voiceGain.gain.cancelScheduledValues(t);
    voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
    voiceGain.gain.linearRampToValueAtTime(0, t + RAMP);
    osc.frequency.setValueAtTime(hz, t + RAMP);
    voiceGain.gain.linearRampToValueAtTime(1, t + RAMP * 2);
  }

  // Sweep (glide) from current frequency to hz over `seconds` — a continuous pure-sine slide.
  function glideTo(hz, seconds) {
    if (!playing || !osc) return;
    const t = ctx.currentTime;
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(osc.frequency.value, t);
    osc.frequency.linearRampToValueAtTime(hz, t + seconds);
    currentHz = hz;
  }

  function stop() {
    if (!playing || !osc) return;
    const t = ctx.currentTime;
    const dying = osc, dyingGain = voiceGain;
    dyingGain.gain.cancelScheduledValues(t);
    dyingGain.gain.setValueAtTime(dyingGain.gain.value, t);
    dyingGain.gain.linearRampToValueAtTime(0, t + RAMP);
    dying.stop(t + RAMP + 0.02);
    osc = null; voiceGain = null; playing = false;
  }

  function stopNow() {
    if (osc) { try { osc.stop(); } catch {} osc = null; voiceGain = null; }
    playing = false;
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
  }

  function pause() { if (ctx && ctx.state === 'running') return ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') return ctx.resume(); }

  // Live waveform for the oscilloscope.
  function waveform(buf) {
    if (!analyser) return false;
    analyser.getFloatTimeDomainData(buf);
    return true;
  }

  // Measure the actual dominant frequency from the analyser (verification readout).
  function measuredHz() {
    if (!analyser || !playing) return 0;
    const n = analyser.frequencyBinCount;
    const data = new Float32Array(n);
    analyser.getFloatFrequencyData(data);
    let peak = 1, peakVal = -Infinity;
    for (let i = 1; i < n - 1; i++) if (data[i] > peakVal) { peakVal = data[i]; peak = i; }
    // Parabolic interpolation for sub-bin precision
    const a = data[peak - 1], b = data[peak], c = data[peak + 1];
    let delta = 0;
    const denom = a - 2 * b + c;
    if (isFinite(a) && isFinite(c) && denom !== 0) delta = 0.5 * (a - c) / denom;
    return (peak + delta) * ctx.sampleRate / analyser.fftSize;
  }

  // Gentle completion chime (C6-E6-G6 arpeggio, short).
  function chime() {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    const notes = [1046.5, 1318.5, 1568.0];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = 0;
      o.connect(g); g.connect(master);
      const t0 = ctx.currentTime + i * 0.18;
      o.start(t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.stop(t0 + 0.55);
    });
  }

  return {
    ensureContext, info, maxCleanHz, start, setFrequency, glideTo, stop, setVolume,
    pause, resume, waveform, measuredHz, chime,
    get playing() { return playing; },
    get currentHz() { return currentHz; },
    get volume() { return volume; },
    get analyserNode() { return analyser; },
    get context() { return ctx; },
  };
})();
