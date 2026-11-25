/* ============================================================
   本轮 / EPICYCLE — visual direction study
   Real maths: DFT of a closed curve, drawn term by term.
   ?t=0.85 seeds the ink so the frame can be captured as a poster.
   ============================================================ */
(function () {
  'use strict';

  var ACCENT = '#5EEBFF';
  var INK = '237,234,227';
  var N = 1024;        // resampled samples
  var K = 256;         // epicycles kept
  var PERIOD = 7600;   // ms per loop
  var TAU = Math.PI * 2;

  var trail = document.getElementById('trail');
  var overlay = document.getElementById('overlay');
  var spectrum = document.getElementById('spectrum');
  var tctx = trail.getContext('2d');
  var octx = overlay.getContext('2d');
  var sctx = spectrum.getContext('2d');

  var W = 0, H = 0, DPR = 1;
  var scale = 1, cx = 0, cy = 0;
  var comps = null;
  var bars = null;          // offscreen spectrum bars
  var prevPen = null;
  var tAcc = 0;
  var last = 0;
  var loopIndex = 0;
  var fadeAt = 0;
  var fadeUntil = 0;

  var qs = new URLSearchParams(location.search);
  var seedT = qs.has('t') ? Math.max(0, Math.min(1, parseFloat(qs.get('t')) || 0)) : null;

  /* ---------- source curve: heart, y-up ---------- */
  function heartAt(t) {
    var a = t * TAU;
    var x = 16 * Math.pow(Math.sin(a), 3);
    var y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    return [x, y];
  }

  function arcResample(fn, n) {
    var M = 4096, raw = [], i;
    for (i = 0; i < M; i++) raw.push(fn(i / M));
    raw.push(raw[0]);
    var cum = [0], total = 0;
    for (i = 1; i < raw.length; i++) {
      total += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
      cum.push(total);
    }
    var out = [], j = 0;
    for (var k = 0; k < n; k++) {
      var target = total * k / n;
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      var seg = (cum[j + 1] - cum[j]) || 1e-9;
      var f = (target - cum[j]) / seg;
      var a = raw[j], b = raw[j + 1];
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return out;
  }

  function dft(z) {
    var n = z.length, out = [];
    for (var k = 0; k < n; k++) {
      var re = 0, im = 0;
      for (var i = 0; i < n; i++) {
        var ang = TAU * k * i / n;
        var c = Math.cos(ang), s = Math.sin(ang);
        re += z[i][0] * c + z[i][1] * s;
        im += z[i][1] * c - z[i][0] * s;
      }
      re /= n; im /= n;
      out.push({ f: k <= n / 2 ? k : k - n, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
    }
    return out;
  }

  function build() {
    var all = dft(arcResample(heartAt, N));
    /* the DC term only translates the figure — it never draws. drop it. */
    all = all.filter(function (c) { return c.f !== 0; });
    all.sort(function (a, b) { return b.amp - a.amp; });
    comps = all.slice(0, K);
  }

  function penAt(t) {
    var x = 0, y = 0;
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      var ang = TAU * c.f * t + c.phase;
      x += c.amp * Math.cos(ang);
      y += c.amp * Math.sin(ang);
    }
    return [cx + x * scale, cy - y * scale];
  }

  /* ---------- layout ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = trail.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);

    [trail, overlay].forEach(function (c) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    });
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);

    cx = W / 2;
    cy = H / 2 - Math.min(H * 0.025, 22);
    scale = Math.min(W, H) / 54;

    tctx.clearRect(0, 0, W, H);
    prevPen = null;
    bars = null;

    if (seedT !== null) seed(seedT);
    drawSpectrum();
  }

  /* ---------- ink ---------- */
  var INK_LAYERS = [
    { color: 'rgba(94,235,255,0.085)', width: 9, blur: 0 },
    { color: 'rgba(94,235,255,0.26)', width: 3.2, blur: 0 },
    { color: 'rgba(226,251,255,0.98)', width: 1.35, blur: 10 }
  ];

  function strokePath(ctx, path) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var i = 0; i < INK_LAYERS.length; i++) {
      var L = INK_LAYERS[i];
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.width;
      ctx.shadowColor = 'rgba(94,235,255,0.85)';
      ctx.shadowBlur = L.blur;
      ctx.stroke(path);
      ctx.shadowBlur = 0;
    }
  }

  function seed(t) {
    var path = new Path2D();
    var STEPS = 2200;
    for (var i = 0; i <= STEPS; i++) {
      var p = penAt(t * i / STEPS);
      if (i === 0) path.moveTo(p[0], p[1]); else path.lineTo(p[0], p[1]);
    }
    strokePath(tctx, path);
    prevPen = penAt(t);
  }

  /* ---------- spectrum ---------- */
  function drawSpectrum() {
    if (!comps) return;
    var r = spectrum.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height);

    spectrum.width = Math.round(w * DPR);
    spectrum.height = Math.round(h * DPR);
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    bars = document.createElement('canvas');
    bars.width = spectrum.width;
    bars.height = spectrum.height;
    var b = bars.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);

    var count = Math.max(24, Math.floor(w / 6));
    var gap = 2;
    var bw = Math.max(1, (w - (count - 1) * gap) / count);
    var maxA = comps[0].amp;
    var minA = comps[Math.min(count, comps.length) - 1].amp || 1e-9;
    var lo = Math.log(minA), hi = Math.log(maxA) - lo;

    for (var i = 0; i < count; i++) {
      var c = comps[Math.min(i, comps.length - 1)];
      var norm = hi > 0 ? (Math.log(c.amp) - lo) / hi : 0;
      var v = Math.pow(Math.max(0, norm), 1.7);
      var bh = Math.max(1, v * (h - 2));
      var x = i * (bw + gap);
      b.fillStyle = i < 16
        ? 'rgba(94,235,255,' + (0.55 + 0.45 * (1 - i / 16)).toFixed(3) + ')'
        : 'rgba(' + INK + ',' + (0.09 + 0.20 * (1 - i / count)).toFixed(3) + ')';
      b.fillRect(x, h - bh, bw, bh);
    }
  }

  function paintSpectrum(t, w, h) {
    if (!bars) return;
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(bars, 0, 0, w, h);
    var px = Math.round(t * w);
    sctx.fillStyle = 'rgba(94,235,255,0.9)';
    sctx.fillRect(px, 0, 1, h);
  }

  /* ---------- frame ---------- */
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(now - last, 100);
    last = now;
    tAcc += dt;

    var t = (tAcc % PERIOD) / PERIOD;

    /* one loop = one complete drawing: hold, dissolve, begin again */
    var idx = Math.floor(tAcc / PERIOD);
    if (idx !== loopIndex) {
      loopIndex = idx;
      fadeAt = now + 240;
      fadeUntil = fadeAt + 720;
    }
    if (now > fadeAt && now < fadeUntil) {
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.1, dt / 640).toFixed(4) + ')';
      tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = 'source-over';
    }

    octx.clearRect(0, 0, W, H);
    octx.save();
    octx.translate(cx, cy);

    var x = 0, y = 0;
    var visible = Math.min(comps.length, 96);

    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      var ang = TAU * c.f * t + c.phase;
      var nx = x + c.amp * Math.cos(ang);
      var ny = y + c.amp * Math.sin(ang);

      if (i < visible) {
        /* big rings are ghosts; the small ones knot together at the pen */
        var a = 0.145 + 0.10 * Math.pow(i / visible, 0.8);
        var ox = x * scale, oy = -y * scale, rr = c.amp * scale;
        if (rr > 0.4) {
          octx.beginPath();
          octx.arc(ox, oy, rr, 0, TAU);
          octx.strokeStyle = 'rgba(237,234,227,' + a.toFixed(4) + ')';
          octx.lineWidth = 0.9;
          octx.stroke();
        }
        octx.beginPath();
        octx.moveTo(ox, oy);
        octx.lineTo(nx * scale, -ny * scale);
        octx.strokeStyle = 'rgba(94,235,255,' + (a * 0.30).toFixed(4) + ')';
        octx.lineWidth = 0.5;
        octx.stroke();
      }
      x = nx; y = ny;
    }

    var penX = x * scale, penY = -y * scale;

    octx.beginPath();
    octx.arc(penX, penY, 2.4, 0, TAU);
    octx.fillStyle = ACCENT;
    octx.shadowColor = ACCENT;
    octx.shadowBlur = 16;
    octx.fill();
    octx.shadowBlur = 0;

    octx.beginPath();
    octx.arc(penX, penY, 7, 0, TAU);
    octx.strokeStyle = 'rgba(94,235,255,0.30)';
    octx.lineWidth = 0.6;
    octx.stroke();
    octx.restore();

    var gx = cx + penX, gy = cy + penY;
    if (prevPen && Math.hypot(gx - prevPen[0], gy - prevPen[1]) < 80) {
      var seg = new Path2D();
      seg.moveTo(prevPen[0], prevPen[1]);
      seg.lineTo(gx, gy);
      strokePath(tctx, seg);
    }
    prevPen = [gx, gy];

    var sr = spectrum.getBoundingClientRect();
    paintSpectrum(t, sr.width, sr.height);

    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  function boot() {
    build();
    if (seedT !== null) {
      tAcc = seedT * PERIOD;
      loopIndex = Math.floor(tAcc / PERIOD);
    }
    resize();
    requestAnimationFrame(frame);

    var to;
    window.addEventListener('resize', function () {
      clearTimeout(to);
      to = setTimeout(resize, 140);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
