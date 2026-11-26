/* ============================================================
   EPICYCLE — ink
   one Fourier chain per stroke; the pen lifts between them.
   two layers: persistent ink + per-frame epicycles
   ============================================================ */
(function (EP) {
  'use strict';

  var ACCENT = '#5EEBFF';
  var TAU = Math.PI * 2;

  var inkC, cirC, ictx, cctx, W = 0, H = 0, DPR = 1;
  var shape = null;
  var scale = 1, ox = 0, oy = 0;
  var lastF = -1, prevPen = null;
  var speed = 0;              /* px travelled since the previous frame */

  var LAYERS = [
    { color: 'rgba(94,235,255,0.08)', width: 10, blur: 0, a: 1 },
    { color: 'rgba(94,235,255,0.26)', width: 3.4, blur: 0, a: 0.55 },
    { color: 'rgba(226,251,255,0.98)', width: 1.45, blur: 9, a: 1 }
  ];

  function init(ink, circles) {
    inkC = ink; cirC = circles;
    ictx = inkC.getContext('2d');
    cctx = cirC.getContext('2d');
  }

  function layout() {
    ox = W / 2;
    oy = H / 2 - Math.min(H * 0.03, 26);
    scale = Math.min(W * 0.74, H * 0.58);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = inkC.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    [inkC, cirC].forEach(function (c) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    });
    ictx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
    clear();
    redraw(0);
  }

  function setShape(s) {
    shape = s;
    lastF = -1; prevPen = null;
    layout();
    clear();
    redraw(0);
  }

  function clear() {
    ictx.clearRect(0, 0, W, H);
    if (cctx) cctx.clearRect(0, 0, W, H);
    lastF = -1; prevPen = null;
  }

  /* ---------- frame → stroke + local frame ---------- */
  function frameInfo(f) {
    var st = shape.strokes;
    for (var i = 0; i < st.length; i++) {
      if (f < st[i].start + st[i].F) return { i: i, local: f - st[i].start };
    }
    var l = st.length - 1;
    return { i: l, local: st[l].F - 1 };
  }

  function penOfFrame(f) {
    var info = frameInfo(f);
    var s = shape.strokes[info.i];
    var o = (info.local * s.K + s.K - 1) * 2;
    return { x: ox + s.pos[o] * scale, y: oy - s.pos[o + 1] * scale, s: info.i };
  }

  /* ---------- stroke styling ---------- */
  function paint(ctx, path, alphaScale) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      ctx.globalAlpha = L.a * alphaScale;
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.width;
      ctx.shadowColor = 'rgba(94,235,255,0.85)';
      ctx.shadowBlur = L.blur;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function seg(ax, ay, bx, by) {
    var p = new Path2D();
    p.moveTo(ax, ay);
    p.lineTo(bx, by);
    paint(ictx, p, 1);
  }

  /* rebuild everything up to frame f (load, scrub, replay) */
  function redraw(f) {
    if (!shape) return;
    ictx.clearRect(0, 0, W, H);

    var paths = [], cur = null, curS = -1, i;
    for (i = 0; i <= f; i++) {
      var p = penOfFrame(i);
      if (p.s !== curS) {
        cur = new Path2D();
        cur.moveTo(p.x, p.y);
        paths.push(cur);
        curS = p.s;
      } else {
        cur.lineTo(p.x, p.y);
      }
    }
    for (i = 0; i < paths.length; i++) paint(ictx, paths[i], 1);

    lastF = f;
    prevPen = f >= 0 ? penOfFrame(f) : null;
  }

  function fade(k) {
    ictx.globalCompositeOperation = 'destination-out';
    ictx.fillStyle = 'rgba(0,0,0,' + k.toFixed(4) + ')';
    ictx.fillRect(0, 0, W, H);
    ictx.globalCompositeOperation = 'source-over';
  }

  /* ---------- one animation step, t in [0,1) ---------- */
  function draw(t, opts) {
    if (!shape) return;
    var f = Math.floor(t * shape.totalF);
    if (f >= shape.totalF) f = shape.totalF - 1;
    if (f < 0) f = 0;

    if (opts && opts.fade) fade(opts.fade);

    if (lastF < 0 || f < lastF || f - lastF > 3) {
      redraw(f);
    } else if (f !== lastF) {
      var a = penOfFrame(f);
      if (prevPen && a.s === prevPen.s) {
        var dd = Math.hypot(a.x - prevPen.x, a.y - prevPen.y);
        if (dd > 0.01 && dd < 60) { seg(prevPen.x, prevPen.y, a.x, a.y); speed = dd; }
      }
      prevPen = a;
      lastF = f;
    }

    drawCircles(f);
  }

  function drawCircles(f) {
    cctx.clearRect(0, 0, W, H);
    var info = frameInfo(f);
    var s = shape.strokes[info.i];
    var K = s.K;
    var base = info.local * K * 2;
    var visible = Math.min(K, 56);

    cctx.save();
    cctx.translate(ox, oy);

    for (var j = 0; j < visible; j++) {
      var x = s.pos[base + j * 2] * scale;
      var y = -s.pos[base + j * 2 + 1] * scale;
      var c = s.comps[j];
      var r = c.amp * scale;
      var a = 0.115 + 0.10 * Math.pow(j / visible, 0.8);

      if (r > 0.4) {
        cctx.beginPath();
        cctx.arc(x, y, r, 0, TAU);
        cctx.strokeStyle = 'rgba(237,234,227,' + a.toFixed(4) + ')';
        cctx.lineWidth = 0.8;
        cctx.stroke();
      }

      if (j + 1 < K) {
        var nx = s.pos[base + (j + 1) * 2] * scale;
        var ny = -s.pos[base + (j + 1) * 2 + 1] * scale;
        cctx.beginPath();
        cctx.moveTo(x, y);
        cctx.lineTo(nx, ny);
        cctx.strokeStyle = 'rgba(94,235,255,' + (a * 0.20).toFixed(4) + ')';
        cctx.lineWidth = 0.5;
        cctx.stroke();
      }
    }

    var px = s.pos[base + (K - 1) * 2] * scale;
    var py = -s.pos[base + (K - 1) * 2 + 1] * scale;

    cctx.beginPath();
    cctx.arc(px, py, 2.4, 0, TAU);
    cctx.fillStyle = ACCENT;
    cctx.shadowColor = ACCENT;
    cctx.shadowBlur = 16;
    cctx.fill();
    cctx.shadowBlur = 0;

    cctx.beginPath();
    cctx.arc(px, py, 7.5, 0, TAU);
    cctx.strokeStyle = 'rgba(94,235,255,0.30)';
    cctx.lineWidth = 0.6;
    cctx.stroke();

    cctx.restore();
  }

  /* one polyline per stroke, in canvas coordinates — used by the exporters */
  function exportPaths() {
    if (!shape) return [];
    var runs = [], cur = null, curS = -1;
    for (var f = 0; f < shape.totalF; f++) {
      var p = penOfFrame(f);
      if (p.s !== curS) { cur = []; runs.push(cur); curS = p.s; }
      cur.push([p.x, p.y]);
    }
    return runs.filter(function (r) { return r.length > 1; });
  }

  EP.ink = {
    init: init, resize: resize, setShape: setShape,
    draw: draw, redraw: redraw, clear: clear, fade: fade,
    exportPaths: exportPaths,
    canvas: function () { return inkC; },
    get speed() { return speed; },
    get size() { return { w: W, h: H }; }
  };
})(window.EP = window.EP || {});
