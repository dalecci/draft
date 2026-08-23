"use strict";
const AudioEngine = (() => {
  const RAMP = 0.04;
  let ctx = null;
  let master = null;
  let voiceGain = null;
  let osc = null;
  let analyser = null;
  let playing = false;
  let currentHz = 0;
  let currentPulse = 0;
  let currentMix = 0;
  let osc2 = null;
  let pulseLfo = null;
  let pulseGainNode = null;
  let volume = 0.3;
  let mediaKeepalive = null;
  function unlockMediaSession() {
    if (!mediaKeepalive) {
      try {
        mediaKeepalive = document.createElement("audio");
        mediaKeepalive.setAttribute("playsinline", "");
        mediaKeepalive.loop = true;
        mediaKeepalive.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        mediaKeepalive.play().catch(() => {
          mediaKeepalive = null;
        });
      } catch (e) {
        mediaKeepalive = null;
      }
    } else {
      mediaKeepalive.play().catch(() => {
      });
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  document.addEventListener("touchend", unlockMediaSession, { capture: true });
  document.addEventListener("click", unlockMediaSession, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && playing && ctx.state === "suspended") ctx.resume();
  });
  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    try {
      ctx = new AC({ sampleRate: 192e3 });
    } catch (e) {
      ctx = new AC();
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
      state: ctx.state
    };
  }
  function maxCleanHz() {
    return ensureContext().sampleRate / 2;
  }
  const VM15_MAX = 68;
  let vm15Mode = localStorage.getItem("vr_vm15_mode") || (localStorage.getItem("vr_vm15") === "1" ? "dual" : "off");
  function fold(hz) {
    let f = hz, n = 0;
    while (f > VM15_MAX) {
      f /= 2;
      n++;
    }
    return { hz: Math.round(f * 100) / 100, div: 2 ** n, octaves: n };
  }
  function setVM15Mode(mode) {
    vm15Mode = ["off", "fold", "dual"].includes(mode) ? mode : "off";
    if (vm15Mode === "off") localStorage.removeItem("vr_vm15_mode");
    else localStorage.setItem("vr_vm15_mode", vm15Mode);
    localStorage.removeItem("vr_vm15");
  }
  function resolveChain(hz, stepPulse = 0) {
    if (vm15Mode === "fold") return { carrier: fold(hz).hz, pulse: stepPulse || 0, mix: 0 };
    if (vm15Mode === "dual") {
      if (stepPulse) return { carrier: hz, pulse: stepPulse, mix: 0 };
      return hz > VM15_MAX ? { carrier: hz, pulse: 0, mix: fold(hz).hz } : { carrier: hz, pulse: 0, mix: 0 };
    }
    return { carrier: hz, pulse: stepPulse || 0, mix: 0 };
  }
  function start(hz, pulseHz = 0) {
    ensureContext();
    if (ctx.state === "suspended") ctx.resume();
    stopNow();
    const chain = resolveChain(hz, pulseHz);
    hz = chain.carrier;
    currentHz = hz;
    currentPulse = chain.pulse;
    currentMix = chain.mix || 0;
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    if (currentMix > 0) {
      const gTop = ctx.createGain();
      gTop.gain.value = 0.5;
      const gBottom = ctx.createGain();
      gBottom.gain.value = 0.5;
      osc.connect(gTop);
      gTop.connect(voiceGain);
      osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = currentMix;
      osc2.connect(gBottom);
      gBottom.connect(voiceGain);
    } else {
      osc.connect(voiceGain);
    }
    if (currentPulse > 0) {
      pulseGainNode = ctx.createGain();
      pulseGainNode.gain.value = 0.5;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      pulseLfo = ctx.createOscillator();
      pulseLfo.type = "sine";
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
  function retune(hz, stepPulse = 0) {
    const chain = resolveChain(hz, stepPulse);
    if (!playing || !osc) {
      start(hz, stepPulse);
      return;
    }
    const sameTopology = currentPulse > 0 === chain.pulse > 0 && currentMix > 0 === (chain.mix || 0) > 0;
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
  function setFrequency(hz) {
    retune(hz, 0);
  }
  function glideTo(hz, seconds) {
    hz = resolveChain(hz, 0).carrier;
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
    if (dying2) {
      try {
        dying2.stop(t + RAMP + 0.02);
      } catch (e) {
      }
    }
    if (dyingLfo) {
      try {
        dyingLfo.stop(t + RAMP + 0.02);
      } catch (e) {
      }
    }
    osc = null;
    osc2 = null;
    voiceGain = null;
    pulseLfo = null;
    pulseGainNode = null;
    playing = false;
    currentPulse = 0;
    currentMix = 0;
  }
  function stopNow() {
    if (osc) {
      try {
        osc.stop();
      } catch (e) {
      }
      osc = null;
      voiceGain = null;
    }
    if (osc2) {
      try {
        osc2.stop();
      } catch (e) {
      }
      osc2 = null;
    }
    if (pulseLfo) {
      try {
        pulseLfo.stop();
      } catch (e) {
      }
      pulseLfo = null;
      pulseGainNode = null;
    }
    playing = false;
    currentPulse = 0;
    currentMix = 0;
  }
  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
  }
  function pause() {
    if (ctx && ctx.state === "running") return ctx.suspend();
  }
  function resume() {
    if (ctx && ctx.state === "suspended") return ctx.resume();
  }
  function waveform(buf) {
    if (!analyser) return false;
    if (!analyser.getFloatTimeDomainData) return false;
    analyser.getFloatTimeDomainData(buf);
    return true;
  }
  function measuredHz() {
    if (!analyser || !playing) return 0;
    const n = analyser.frequencyBinCount;
    const data = new Float32Array(n);
    analyser.getFloatFrequencyData(data);
    let peak = 1, peakVal = -Infinity;
    for (let i = 1; i < n - 1; i++) if (data[i] > peakVal) {
      peakVal = data[i];
      peak = i;
    }
    const a = data[peak - 1], b = data[peak], c = data[peak + 1];
    let delta = 0;
    const denom = a - 2 * b + c;
    if (isFinite(a) && isFinite(c) && denom !== 0) delta = 0.5 * (a - c) / denom;
    return (peak + delta) * ctx.sampleRate / analyser.fftSize;
  }
  function chime() {
    ensureContext();
    if (ctx.state === "suspended") ctx.resume();
    const notes = [1046.5, 1318.5, 1568];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0;
      o.connect(g);
      g.connect(master);
      const t0 = ctx.currentTime + i * 0.18;
      o.start(t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(1e-3, t0 + 0.5);
      o.stop(t0 + 0.55);
    });
  }
  return {
    ensureContext,
    info,
    maxCleanHz,
    start,
    setFrequency,
    retune,
    glideTo,
    stop,
    setVolume,
    pause,
    resume,
    waveform,
    measuredHz,
    chime,
    fold,
    setVM15Mode,
    resolveChain,
    get vm15() {
      return vm15Mode !== "off";
    },
    get vm15Mode() {
      return vm15Mode;
    },
    get currentMix() {
      return currentMix;
    },
    get playing() {
      return playing;
    },
    get currentHz() {
      return currentHz;
    },
    get currentPulse() {
      return currentPulse;
    },
    get volume() {
      return volume;
    },
    get analyserNode() {
      return analyser;
    },
    get context() {
      return ctx;
    }
  };
})();
