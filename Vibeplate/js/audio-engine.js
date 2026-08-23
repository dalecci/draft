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
    if (deadWebAudio) {
      if (fallbackActive && fallbackEl && fallbackEl.paused && playing) fallbackEl.play().catch(() => {
      });
      if (mediaKeepalive) {
        try {
          mediaKeepalive.pause();
        } catch (e) {
        }
      }
      return;
    }
    if (!mediaKeepalive) {
      try {
        mediaKeepalive = document.createElement("audio");
        mediaKeepalive.setAttribute("playsinline", "");
        mediaKeepalive.loop = true;
        mediaKeepalive.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        mediaKeepalive.style.display = "none";
        (document.body || document.documentElement).appendChild(mediaKeepalive);
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
    ensureContext();
    if (ctx.state === "suspended" && ctx.resume) {
      try {
        ctx.resume();
      } catch (e) {
      }
    }
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      if (src.start) src.start(0);
      else if (src.noteOn) src.noteOn(0);
    } catch (e) {
    }
  }
  document.addEventListener("touchend", unlockMediaSession, { capture: true });
  document.addEventListener("click", unlockMediaSession, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && playing && ctx.state === "suspended") ctx.resume();
  });
  function rebuildOnRouteChange() {
    if (playing || !ctx) return;
    try {
      ctx.close();
    } catch (e) {
    }
    ctx = null;
    master = null;
    analyser = null;
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", rebuildOnRouteChange);
  }
  let deadWebAudio = localStorage.getItem("vr_wa_dead") === "1";
  let fallbackEl = null;
  let fallbackActive = false;
  let probeTimer = 0;
  function makeOsc(freq, sr) {
    const w = 2 * Math.PI * freq / sr;
    const k = 2 * Math.cos(w);
    let s0 = Math.sin(-2 * w);
    let s1 = Math.sin(-w);
    return function() {
      const x = k * s1 - s0;
      s0 = s1;
      s1 = x;
      return x;
    };
  }
  const wavCache = {};
  let wavCacheCount = 0;
  function wavDataURI(carrier, pulseHz, mixHz) {
    carrier = Math.min(carrier, 2e4);
    const cacheKey = carrier + "|" + (pulseHz || 0) + "|" + (mixHz || 0);
    if (wavCache[cacheKey]) return wavCache[cacheKey];
    const maxComp = Math.max(carrier, mixHz || 0) * 1.25;
    const sr = maxComp < 3600 ? 8e3 : maxComp < 9800 ? 22050 : 44100;
    const targetDur = Math.min(60, Math.max(10, Math.floor(18e5 / (sr * 2))));
    const base = pulseHz || mixHz || carrier;
    const cycles = Math.max(1, Math.round(base * targetDur));
    const n = Math.max(1, Math.round(sr * cycles / base));
    const bytes = new Uint8Array(44 + n * 2);
    const dv = new DataView(bytes.buffer);
    const w = (o, s) => {
      for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
    };
    w(0, "RIFF");
    dv.setUint32(4, 36 + n * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    w(36, "data");
    dv.setUint32(40, n * 2, true);
    const oscC = makeOsc(carrier, sr);
    const oscM = mixHz ? makeOsc(mixHz, sr) : null;
    const oscP = pulseHz ? makeOsc(pulseHz, sr) : null;
    for (let i = 0; i < n; i++) {
      let s = oscC();
      if (oscM) s = 0.5 * s + 0.5 * oscM();
      if (oscP) s *= 0.5 + 0.5 * oscP();
      dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * 0.6)) * 32767, true);
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    const uri = "data:audio/wav;base64," + btoa(bin);
    if (wavCacheCount > 10) {
      for (const k2 in wavCache) delete wavCache[k2];
      wavCacheCount = 0;
    }
    wavCache[cacheKey] = uri;
    wavCacheCount++;
    return uri;
  }
  function elementStart(hz, stepPulse) {
    const chain = resolveChain(hz, stepPulse || 0);
    currentHz = chain.carrier;
    currentPulse = chain.pulse;
    currentMix = chain.mix || 0;
    if (mediaKeepalive) {
      try {
        mediaKeepalive.pause();
      } catch (e) {
      }
    }
    try {
      if (!fallbackEl) {
        fallbackEl = document.createElement("audio");
        fallbackEl.setAttribute("playsinline", "");
        fallbackEl.loop = true;
        fallbackEl.style.display = "none";
        fallbackEl.id = "vr-fallback-tone";
        (document.body || document.documentElement).appendChild(fallbackEl);
      }
      fallbackEl.src = wavDataURI(chain.carrier, chain.pulse, chain.mix || 0);
      try {
        fallbackEl.volume = Math.min(1, volume * 2);
      } catch (e) {
      }
      fallbackEl.play().catch(() => {
      });
      fallbackActive = true;
      playing = true;
    } catch (e) {
    }
  }
  function elementStop() {
    if (fallbackEl) {
      try {
        fallbackEl.pause();
      } catch (e) {
      }
    }
    fallbackActive = false;
  }
  function retryWebAudio() {
    deadWebAudio = false;
    try {
      localStorage.removeItem("vr_wa_dead");
    } catch (e) {
    }
  }
  function engageFallback(hz, stepPulse) {
    deadWebAudio = true;
    localStorage.setItem("vr_wa_dead", "1");
    stopNow();
    elementStart(hz, stepPulse);
  }
  function scheduleOutputProbe(hz, stepPulse) {
    clearTimeout(probeTimer);
    if (deadWebAudio || volume < 0.02) return;
    probeTimer = setTimeout(() => {
      if (!playing || fallbackActive) return;
      const buf = new Float32Array(1024);
      if (!waveform(buf)) {
        engageFallback(hz, stepPulse);
        return;
      }
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      if (rms < 2e-3) engageFallback(hz, stepPulse);
    }, 900);
  }
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
    try {
      analyser = ctx.createAnalyser();
      try {
        analyser.fftSize = 4096;
      } catch (e) {
        analyser.fftSize = 2048;
      }
      analyser.smoothingTimeConstant = 0;
      master.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (e) {
      analyser = null;
      master.connect(ctx.destination);
    }
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
    if (deadWebAudio) {
      elementStop();
      elementStart(hz, pulseHz);
      return;
    }
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
    voiceGain.gain.setValueAtTime(0, t);
    voiceGain.gain.linearRampToValueAtTime(1, t + RAMP);
    playing = true;
    const wdGain = voiceGain;
    setTimeout(() => {
      try {
        if (playing && voiceGain === wdGain && wdGain.gain.value < 0.05) {
          try {
            wdGain.gain.cancelScheduledValues(0);
          } catch (e) {
          }
          wdGain.gain.value = 1;
        }
      } catch (e) {
      }
    }, RAMP * 1e3 + 250);
    scheduleOutputProbe(hz, pulseHz);
  }
  function retune(hz, stepPulse = 0) {
    if (deadWebAudio || fallbackActive) {
      elementStart(hz, stepPulse);
      return;
    }
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
    if (deadWebAudio || fallbackActive) {
      elementStart(hz, 0);
      return;
    }
    hz = resolveChain(hz, 0).carrier;
    if (!playing || !osc) return;
    const t = ctx.currentTime;
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(osc.frequency.value, t);
    osc.frequency.linearRampToValueAtTime(hz, t + seconds);
    currentHz = hz;
  }
  function stop() {
    if (fallbackActive) {
      elementStop();
      playing = false;
      currentPulse = 0;
      currentMix = 0;
      return;
    }
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
    if (fallbackActive) elementStop();
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
    if (fallbackEl) {
      try {
        fallbackEl.volume = Math.min(1, volume * 2);
      } catch (e) {
      }
    }
  }
  function pause() {
    if (fallbackActive && fallbackEl) {
      try {
        fallbackEl.pause();
      } catch (e) {
      }
      return;
    }
    if (ctx && ctx.state === "running") return ctx.suspend();
  }
  function resume() {
    if (fallbackActive && fallbackEl) {
      fallbackEl.play().catch(() => {
      });
      return;
    }
    if (ctx && ctx.state === "suspended") return ctx.resume();
  }
  let byteBuf = null;
  function waveform(buf) {
    if (!analyser) return false;
    if (analyser.getFloatTimeDomainData) {
      analyser.getFloatTimeDomainData(buf);
      return true;
    }
    if (analyser.getByteTimeDomainData) {
      if (!byteBuf || byteBuf.length !== buf.length) byteBuf = new Uint8Array(buf.length);
      analyser.getByteTimeDomainData(byteBuf);
      for (let i = 0; i < buf.length; i++) buf[i] = (byteBuf[i] - 128) / 128;
      return true;
    }
    return false;
  }
  function measuredHz() {
    if (fallbackActive) return currentHz;
    if (!analyser || !playing) return 0;
    const n = analyser.frequencyBinCount;
    const data = new Float32Array(n);
    analyser.getFloatFrequencyData(data);
    let peak = 1, peakVal = -Infinity;
    for (let i = 1; i < n - 1; i++) if (data[i] > peakVal) {
      peakVal = data[i];
      peak = i;
    }
    if (!isFinite(peakVal) || peakVal < -75) return 0;
    const a = data[peak - 1], b = data[peak], c = data[peak + 1];
    let delta = 0;
    const denom = a - 2 * b + c;
    if (isFinite(a) && isFinite(c) && denom !== 0) delta = 0.5 * (a - c) / denom;
    return (peak + delta) * ctx.sampleRate / analyser.fftSize;
  }
  function chime() {
    try {
      chimeInner();
    } catch (e) {
    }
  }
  function chimeInner() {
    if (deadWebAudio) return;
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
    retryWebAudio,
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
