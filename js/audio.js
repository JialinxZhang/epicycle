/* ============================================================
   EPICYCLE — audio
   The instrument breathes: a noise brush that follows the pen, and a three
   voice pad whose chord is read off the shape's own spectrum.
   Always silent until the user asks for it.
   ============================================================ */
(function (EP) {
  'use strict';

  var ctx = null;
  var master = null, padBus = null, conv = null;
  var pad = [];                 /* { osc, gain, level } */
  var noiseSrc = null, noiseFilter = null, noiseGain = null;

  var enabled = false;
  var running = false;
  var phase = 'idle';
  var held = false;
  var dest = null;

  var PENTA = [0, 3, 5, 7, 10, 12, 15, 17];   /* A minor pentatonic, two octaves */
  var ROOT = 110;                              /* A2 */

  /* the chord is a fingerprint of the character: same text, same chord */
  function noteFor(comp, rank) {
    var h = Math.abs(comp.f) % 5;
    var idx = (rank * 2 + h) % PENTA.length;
    return ROOT * Math.pow(2, PENTA[idx] / 12);
  }

  function noiseBuffer(seconds) {
    var n = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function impulse(seconds, decay) {
    var n = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    conv = ctx.createConvolver();
    conv.buffer = impulse(1.8, 2.6);
    var wet = ctx.createGain();
    wet.gain.value = 0.34;
    conv.connect(wet);
    wet.connect(master);

    padBus = ctx.createGain();
    padBus.gain.value = 1;
    padBus.connect(master);
    padBus.connect(conv);

    var levels = [0.115, 0.075, 0.05];
    for (var i = 0; i < 3; i++) {
      var o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = ROOT * Math.pow(2, i * 7 / 12);
      var g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(padBus);
      o.start();
      pad.push({ osc: o, gain: g, level: levels[i] });
    }

    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer(3);
    noiseSrc.loop = true;
    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2600;
    noiseFilter.Q.value = 0.8;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noiseSrc.start();

    return ctx;
  }

  function setChord(comps) {
    if (!ctx || !comps || !comps.length) return;
    var top = comps.slice(0, 3);
    var t = ctx.currentTime;
    for (var i = 0; i < 3; i++) {
      var c = top[Math.min(i, top.length - 1)];
      var f = noteFor(c, i) * (held ? 2 : 1);
      pad[i].osc.frequency.setTargetAtTime(f, t, 0.09);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) {
      release();
      return;
    }
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (phase === 'draw') start();
  }

  function start() {
    if (!enabled || !ctx) return;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0.15, t, 0.35);
    for (var i = 0; i < pad.length; i++) {
      pad[i].gain.gain.cancelScheduledValues(t);
      pad[i].gain.gain.setTargetAtTime(pad[i].level, t, 0.45);
    }
    running = true;
    held = false;
  }

  function hold() {
    if (!running || !ctx) return;
    held = true;
    var t = ctx.currentTime;
    for (var i = 0; i < 3; i++) {
      pad[i].osc.frequency.setTargetAtTime(pad[i].osc.frequency.value * 2, t, 0.22);
    }
    master.gain.setTargetAtTime(0.19, t, 0.3);
  }

  function release() {
    if (!ctx) return;
    running = false;
    held = false;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0, t, 0.32);
    for (var i = 0; i < pad.length; i++) pad[i].gain.gain.setTargetAtTime(0, t, 0.3);
    if (noiseGain) noiseGain.gain.setTargetAtTime(0, t, 0.12);
  }

  /* noise gain follows how fast the pen is moving */
  function setEnergy(v) {
    if (!ctx || !noiseGain) return;
    var e = Math.max(0, Math.min(1, v));
    noiseGain.gain.setTargetAtTime(e * 0.055, ctx.currentTime, 0.05);
  }

  function tick(nowPhase, speed) {
    if (!enabled) return;
    if (nowPhase !== phase) {
      phase = nowPhase;
      if (phase === 'draw') start();
      else if (phase === 'hold') hold();
      else if (phase === 'fade') release();
    }
    if (running) setEnergy(speed || 0);
  }

  EP.audio = {
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; },
    setChord: setChord,
    tick: tick,
    release: release,
    ready: function () { return !!ctx; },
    /* a media stream of the same mix, for the screen recorder */
    streamDestination: function () {
      if (!ctx) return null;
      if (!dest) {
        dest = ctx.createMediaStreamDestination();
        master.connect(dest);
      }
      return dest.stream;
    },
    _debug: function () {
      if (!ctx) return null;
      return {
        state: ctx.state,
        master: +master.gain.value.toFixed(4),
        noise: noiseGain ? +noiseGain.gain.value.toFixed(4) : 0,
        notes: pad.map(function (p) { return Math.round(p.osc.frequency.value); })
      };
    }
  };
})(window.EP = window.EP || {});
