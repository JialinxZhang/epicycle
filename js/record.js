/* ============================================================
   EPICYCLE — recorder
   One full loop, composited the way the PNG export looks, into WebM.
   If sound is on, the audio graph is mixed in as a second track.
   ============================================================ */
(function (EP) {
  'use strict';

  var BG = '#07070A';

  var canvas = null, ctx = null, ground = null;
  var stream = null, rec = null, chunks = [];
  var active = false, hooks = null, t0 = 0;
  var mime = '';

  function pickMime() {
    var list = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    if (typeof MediaRecorder === 'undefined') return '';
    for (var i = 0; i < list.length; i++) {
      if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    }
    return '';
  }

  function groundLayer(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);

    var bloom = g.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.62);
    bloom.addColorStop(0, 'rgba(94,235,255,0.055)');
    bloom.addColorStop(0.55, 'rgba(94,235,255,0)');
    bloom.addColorStop(1, 'rgba(94,235,255,0)');
    g.fillStyle = bloom;
    g.fillRect(0, 0, w, h);

    var vg = g.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.30, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.88)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    return c;
  }

  function setup() {
    var size = EP.ink.size;
    var scale = Math.min(1.5, 1920 / Math.max(size.w, size.h));
    var w = Math.max(2, Math.round(size.w * scale));
    var h = Math.max(2, Math.round(size.h * scale));

    if (!canvas) {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ground = groundLayer(w, h);
    } else if (!ground) {
      ground = groundLayer(w, h);
    }
    return { w: w, h: h };
  }

  function paint() {
    var ink = EP.ink.canvas();
    if (!ctx || !ink) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(ground, 0, 0);
    ctx.drawImage(ink, 0, 0, canvas.width, canvas.height);
  }

  function start(opts) {
    if (active) return;
    hooks = opts || {};

    if (typeof MediaRecorder === 'undefined' || !canvasCaptureSupported()) {
      if (hooks.onDone) hooks.onDone('浏览器不支持录制');
      return;
    }
    mime = pickMime();
    if (!mime) {
      if (hooks.onDone) hooks.onDone('浏览器不支持 WebM');
      return;
    }

    var dim = setup();
    paint();

    stream = canvas.captureStream(60);

    if (EP.audio && EP.audio.isEnabled() && EP.audio.ready && EP.audio.ready()) {
      var aud = EP.audio.streamDestination && EP.audio.streamDestination();
      if (aud && aud.getAudioTracks().length) {
        aud.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      }
    }

    chunks = [];
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });

    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var blob = new Blob(chunks, { type: 'video/webm' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'epicycle-' + slug(EP.appText ? EP.appText() : 'loop') + '-' + stamp() + '.webm';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

      active = false;
      var mb = (blob.size / 1048576).toFixed(1);
      if (hooks && hooks.onDone) hooks.onDone('WebM ' + dim.w + '×' + dim.h + ' · ' + mb + 'MB');
      hooks = null;
    };

    rec.start(250);
    active = true;
    t0 = performance.now();
    if (hooks.onStart) hooks.onStart(dim);
  }

  function stop() {
    if (!active || !rec) return;
    if (rec.state !== 'inactive') rec.stop();
    if (stream) {
      stream.getTracks().forEach(function (t) { if (t.kind === 'video') t.stop(); });
    }
  }

  function frame(phase) {
    if (!active) return;
    paint();
    if (hooks && hooks.onTick) hooks.onTick((performance.now() - t0) / 1000);
    if (phase === 'fade') stop();
  }

  function slug(text) {
    return (text || 'epicycle').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function canvasCaptureSupported() {
    return !!document.createElement('canvas').captureStream;
  }

  EP.recorder = {
    start: start,
    stop: stop,
    frame: frame,
    isActive: function () { return active; }
  };
})(window.EP = window.EP || {});
