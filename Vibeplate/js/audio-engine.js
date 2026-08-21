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
  let currentPulse = 0; // amplitude-pulse rate (0 = steady tone)
  let currentMix = 0;   // dual-mode second tone (0 = single oscillator)
  let osc2 = null;      // dual-mode bottom oscillator (real signal at the folded frequency)
  let pulseLfo = null;  // gamma-mode LFO
  let pulseGainNode = null;
  let volume = 0.3;    // safe default

  // ---- iOS/iPad fix ----
  // iPads route Web Audio as "ambient" sound, which the silent switch / silent
  // mode MUTES (while speech synthesis is not muted — so you hear the voice but
  // no tone). Looping a silent <audio> element promotes the whole app to the
  // "playback" audio category, which iOS never silences.
  let mediaKeepalive = null;
  function unlockMediaSession() {
    if (!mediaKeepalive) {
      try {
        mediaKeepalive = document.createElement('audio');
        mediaKeepalive.setAttribute('playsinline', '');
        mediaKeepalive.loop = true;
        // 44-byte silent WAV
        mediaKeepalive.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        mediaKeepalive.play().catch(() => { mediaKeepalive = null; });
      } catch { mediaKeepalive = null; }
    } else {
      mediaKeepalive.play().catch(() => {});
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  document.addEventListener('touchend', unlockMediaSession, { capture: true });
  document.addEventListener('click', unlockMediaSession, { capture: true });
  // iOS suspends audio when the app is backgrounded — resume when it returns
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && playing && ctx.state === 'suspended') ctx.resume();
  });

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

  // ---- VM15 mode (Sonic Life SW-VM15 vibration plate, 3–70 Hz mechanical band) ----
  // When on, every frequency above VM15_MAX is octave-folded (halved repeatedly)
  // into the plate's window before it reaches the oscillator — the Rife tradition's
  // standard practice for band-limited devices. Stored protocols are never altered;
  // folding happens only at the moment of sound production. Per-device setting.
  const VM15_MAX = 68;
  // Three modes:
  //   'off'  — normal speaker playback
  //   'fold' — frequency is replaced by its sub-octave inside the plate band
  //   'dual' — BOTH at once: the original frequency plays as the carrier while
  //            its amplitude pulses at the folded rate, so the plate physically
  //            moves at the in-band rate and the original tone rides on top.
  let vm15Mode = localStorage.getItem('vr_vm15_mode')
    || (localStorage.getItem('vr_vm15') === '1' ? 'dual' : 'off');

  function fold(hz) {
    let f = hz, n = 0;
    while (f > VM15_MAX) { f /= 2; n++; }
    return { hz: Math.round(f * 100) / 100, div: 2 ** n, octaves: n };
  }

  function setVM15Mode(mode) {
    vm15Mode = ['off', 'fold', 'dual'].includes(mode) ? mode : 'off';
    if (vm15Mode === 'off') localStorage.removeItem('vr_vm15_mode');
    else localStorage.setItem('vr_vm15_mode', vm15Mode);
    localStorage.removeItem('vr_vm15'); // legacy flag
  }

  // What actually reaches the oscillators for a requested (hz, stepPulse) pair.
  // carrier = main tone; pulse = amplitude-pulse rate (gamma steps);
  // mix = a SECOND real oscillator at the folded frequency (dual mode) — true
  // signal energy at both the top and bottom tones simultaneously.
  function resolveChain(hz, stepPulse = 0) {
    if (vm15Mode === 'fold') return { carrier: fold(hz).hz, pulse: stepPulse || 0, mix: 0 };
    if (vm15Mode === 'dual') {
      if (stepPulse) return { carrier: hz, pulse: stepPulse, mix: 0 }; // step's own pulse wins (already in-band by design)
      return hz > VM15_MAX
        ? { carrier: hz, pulse: 0, mix: fold(hz).hz }
        : { carrier: hz, pulse: 0, mix: 0 };
    }
    return { carrier: hz, pulse: stepPulse || 0, mix: 0 };
  }

  // pulseHz > 0 = Gamma/pulse mode: the tone's amplitude throbs at pulseHz
  // (e.g. a 700 Hz carrier pulsing 40×/sec — the audio analog of 40 Hz
  // gamma-entrainment stimulation used in the MIT GENUS research).
  function start(hz, pulseHz = 0) {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    stopNow(); // safety: never two oscillators
    const chain = resolveChain(hz, pulseHz);
    hz = chain.carrier;
    currentHz = hz;
    currentPulse = chain.pulse;
    currentMix = chain.mix || 0;
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    osc = ctx.createOscillator();
    osc.type = 'sine'; // mathematically pure
    osc.frequency.value = hz;
    if (currentMix > 0) {
      // DUAL: two real oscillators — top tone + bottom tone, each at half
      // amplitude so the mix never clips. Real signal energy at BOTH frequencies.
      const gTop = ctx.createGain(); gTop.gain.value = 0.5;
      const gBottom = ctx.createGain(); gBottom.gain.value = 0.5;
      osc.connect(gTop); gTop.connect(voiceGain);
      osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = currentMix;
      osc2.connect(gBottom); gBottom.connect(voiceGain);
    } else {
      osc.connect(voiceGain);
    }
    if (currentPulse > 0) {
      pulseGainNode = ctx.createGain();
      pulseGainNode.gain.value = 0.5;            // amplitude swings 0 → 1
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      pulseLfo = ctx.createOscillator();
      pulseLfo.type = 'sine';
      pulseLfo.frequency.value = currentPulse;
      pulseLfo.connect(depth);
      depth.connect(pulseGainNode.gain);
      voiceGain.connect(pulseGainNode);
      pulseGainNode.connect(master);
      pulseLfo.start();
    } else {
      voiceGain.connect(master);
    }
    const t = ctx.currentTime;
    osc.start(t);
    if (osc2) osc2.start(t);
    voiceGain.gain.linearRampToValueAtTime(1, t + RAMP);
    playing = true;
  }

  // Change frequency between protocol steps: quick dip to zero, retune, rise. No clicks.
  // Move to a new (hz, stepPulse) target. If the chain topology (pulsed vs
  // steady) must change, rebuild with a soft gap; otherwise retune in place.
  function retune(hz, stepPulse = 0) {
    const chain = resolveChain(hz, stepPulse);
    if (!playing || !osc) { start(hz, stepPulse); return; }
    const sameTopology =
      (currentPulse > 0) === (chain.pulse > 0) &&
      (currentMix > 0) === ((chain.mix || 0) > 0);
    if (!sameTopology) {
      stop();
      setTimeout(() => start(hz, stepPulse), 110);
      return;
    }
    currentHz = chain.carrier;
    currentPulse = chain.pulse;
    currentMix = chain.mix || 0;
    const t = ctx.currentTime;
    voiceGain.gain.cancelScheduledValues(t);
    voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
    voiceGain.gain.linearRampToValueAtTime(0, t + RAMP);
    osc.frequency.setValueAtTime(chain.carrier, t + RAMP);
    if (currentMix > 0 && osc2) osc2.frequency.setValueAtTime(currentMix, t + RAMP);
    if (currentPulse > 0 && pulseLfo) pulseLfo.frequency.setValueAtTime(chain.pulse, t + RAMP);
    voiceGain.gain.linearRampToValueAtTime(1, t + RAMP * 2);
  }

  function setFrequency(hz) { retune(hz, 0); }

  // Sweep (glide) from current frequency to hz over `seconds` — a continuous pure-sine slide.
  function glideTo(hz, seconds) {
    hz = resolveChain(hz, 0).carrier; // dual mode sweeps the true carrier; fold mode sweeps in-band
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
    const dying = osc, dying2 = osc2, dyingGain = voiceGain, dyingLfo = pulseLfo;
    dyingGain.gain.cancelScheduledValues(t);
    dyingGain.gain.setValueAtTime(dyingGain.gain.value, t);
    dyingGain.gain.linearRampToValueAtTime(0, t + RAMP);
    dying.stop(t + RAMP + 0.02);
    if (dying2) { try { dying2.stop(t + RAMP + 0.02); } catch {} }
    if (dyingLfo) { try { dyingLfo.stop(t + RAMP + 0.02); } catch {} }
    osc = null; osc2 = null; voiceGain = null; pulseLfo = null; pulseGainNode = null;
    playing = false; currentPulse = 0; currentMix = 0;
  }

  function stopNow() {
    if (osc) { try { osc.stop(); } catch {} osc = null; voiceGain = null; }
    if (osc2) { try { osc2.stop(); } catch {} osc2 = null; }
    if (pulseLfo) { try { pulseLfo.stop(); } catch {} pulseLfo = null; pulseGainNode = null; }
    playing = false;
    currentPulse = 0;
    currentMix = 0;
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
    ensureContext, info, maxCleanHz, start, setFrequency, retune, glideTo, stop, setVolume,
    pause, resume, waveform, measuredHz, chime, fold, setVM15Mode, resolveChain,
    get vm15() { return vm15Mode !== 'off'; },
    get vm15Mode() { return vm15Mode; },
    get currentMix() { return currentMix; },
    get playing() { return playing; },
    get currentHz() { return currentHz; },
    get currentPulse() { return currentPulse; },
    get volume() { return volume; },
    get analyserNode() { return analyser; },
    get context() { return ctx; },
  };
})();
