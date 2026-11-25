/* ============================================================
   EPICYCLE — fourier
   z_n → c_k → sorted, truncated → precomputed joint table
   ============================================================ */
(function (EP) {
  'use strict';

  /* direct DFT with a precomputed twiddle table (N ≤ 2048 is plenty) */
  function dft(pts) {
    var N = pts.length;
    var cosT = new Float64Array(N), sinT = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      var a = 2 * Math.PI * i / N;
      cosT[i] = Math.cos(a);
      sinT[i] = Math.sin(a);
    }

    var out = [];
    for (var k = 0; k < N; k++) {
      var re = 0, im = 0;
      for (var n = 0; n < N; n++) {
        var idx = (k * n) % N;
        var c = cosT[idx], s = sinT[idx];
        re += pts[n][0] * c + pts[n][1] * s;
        im += pts[n][1] * c - pts[n][0] * s;
      }
      re /= N; im /= N;
      out.push({
        f: k <= N / 2 ? k : k - N,
        re: re,
        im: im,
        amp: Math.hypot(re, im),
        phase: Math.atan2(im, re)
      });
    }
    return out;
  }

  function basis(pts, K, keepDC) {
    var all = dft(pts);
    if (!keepDC) all = all.filter(function (c) { return c.f !== 0; });
    all.sort(function (a, b) { return b.amp - a.amp; });
    return all.slice(0, Math.min(K, all.length));
  }

  /* joint positions for F frames: pos[(f*K + j)*2] = joint j of frame f */
  function frames(comps, F) {
    var K = comps.length;
    var pos = new Float32Array(F * K * 2);
    var j, f, o;

    /* 1) each epicycle's own contribution */
    for (j = 0; j < K; j++) {
      var c = comps[j];
      var step = 2 * Math.PI * c.f / F;
      var cr = Math.cos(step), sr = Math.sin(step);
      var ca = Math.cos(c.phase), sa = Math.sin(c.phase);

      for (f = 0; f < F; f++) {
        o = (f * K + j) * 2;
        pos[o] = c.amp * ca;
        pos[o + 1] = c.amp * sa;
        var na = ca * cr - sa * sr;
        sa = ca * sr + sa * cr;
        ca = na;
      }
    }

    /* 2) prefix sum: joint j = tip of the chain after j epicycles */
    for (f = 0; f < F; f++) {
      var base = f * K * 2;
      for (j = 1; j < K; j++) {
        pos[base + j * 2] += pos[base + (j - 1) * 2];
        pos[base + j * 2 + 1] += pos[base + (j - 1) * 2 + 1];
      }
    }

    return { pos: pos, F: F, K: K };
  }

  function penAt(comps, t) {
    var x = 0, y = 0;
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      var a = 2 * Math.PI * c.f * t + c.phase;
      x += c.amp * Math.cos(a);
      y += c.amp * Math.sin(a);
    }
    return [x, y];
  }

  function pathLen(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  /* one Fourier series per stroke — no pen-lift discontinuities in any series */
  function buildAll(strokes, N, K, F) {
    var lens = strokes.map(pathLen);
    var total = 0;
    for (var i = 0; i < lens.length; i++) total += lens[i];
    if (total < 1e-9) return null;

    var out = [], allComps = [], startFrame = 0;

    for (var s = 0; s < strokes.length; s++) {
      var share = lens[s] / total;
      var n = Math.max(64, Math.min(512, Math.round(N * share)));
      /* open strokes ring at their ends: spend more of the budget per stroke */
      var k = Math.max(24, Math.min(n - 1, Math.round(K * share * 1.7)));
      var fc = Math.max(6, Math.round(F * share));

      var rs = EP.geom.resample(strokes[s], n);
      if (!rs) continue;

      var isClosed = !!strokes[s].closed;
      var pts = EP.geom.smoothClosed(rs.pts, 2);

      /* a closed walk usually repeats its first point at the end — drop it,
         otherwise the series sees a zero-length step at the seam */
      if (isClosed && pts.length > 3) {
        var a0 = pts[0], aN = pts[pts.length - 1];
        if (Math.hypot(a0[0] - aN[0], a0[1] - aN[1]) < 1e-4) pts.pop();
      }

      /* an open stroke is a jump discontinuity for the series — the jump back
         to the start rings hard. retrace it to make the series continuous,
         then draw only the forward half. a path that is already closed needs
         no retrace at all. */
      var loop = isClosed ? pts : pts.concat(pts.slice().reverse());

      var comps = basis(loop, k, true);   /* keep DC: each stroke has its own origin */
      if (!comps.length) continue;

      var full = frames(comps, isClosed ? fc : fc * 2);
      var halfLen = fc * full.K * 2;
      var half = new Float32Array(halfLen);
      half.set(full.pos.subarray(0, halfLen));

      out.push({
        comps: comps, pos: half, K: full.K, F: fc,
        start: startFrame, len: lens[s]
      });
      startFrame += fc;
      for (var c = 0; c < comps.length; c++) allComps.push(comps[c]);
    }

    if (!out.length) return null;
    return { strokes: out, totalF: startFrame, comps: allComps };
  }

  EP.fourier = {
    dft: dft, basis: basis, frames: frames, penAt: penAt, buildAll: buildAll
  };
})(window.EP = window.EP || {});
