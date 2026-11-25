/* ============================================================
   本轮 / EPICYCLE — geometry
   text -> bitmap -> 1px skeleton -> polylines -> one continuous path
   ============================================================ */
(function (EP) {
  'use strict';

  var FONT = '"Songti SC","SimSun","STSong","Noto Serif SC",serif';

  /* ---------- raster ---------- */
  function rasterize(text, size, font) {
    size = size || 260;
    font = font || FONT;
    var m = document.createElement('canvas').getContext('2d');
    m.font = size + 'px ' + font;
    var tw = Math.max(8, m.measureText(text).width);
    var pad = Math.round(size * 0.12);
    var W = Math.ceil(tw + pad * 2);
    var H = Math.ceil(size * 1.3 + pad * 2);

    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.font = size + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, W / 2, H / 2);

    var px = ctx.getImageData(0, 0, W, H).data;
    var bin = new Uint8Array(W * H);
    var minX = W, minY = H, maxX = -1, maxY = -1;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 100) {
          bin[y * W + x] = 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    var cw = maxX - minX + 1, ch = maxY - minY + 1;
    /* thinning and tracing both need a quiet border, otherwise a glyph that
       touches the crop edge is never eroded (and a plain 「一」 vanishes) */
    var PAD = 2;
    var W2 = cw + PAD * 2, H2 = ch + PAD * 2;
    var out = new Uint8Array(W2 * H2);
    for (var j = 0; j < ch; j++)
      for (var i = 0; i < cw; i++)
        out[(j + PAD) * W2 + (i + PAD)] = bin[(j + minY) * W + (i + minX)];

    return { w: W2, h: H2, d: out };
  }

  /* ---------- Zhang-Suen thinning ---------- */
  function thin(img) {
    var W = img.w, H = img.h, d = img.d;
    var mark = new Uint8Array(W * H);
    var changed = true, guard = 0;

    while (changed && guard++ < 90) {
      changed = false;
      for (var step = 0; step < 2; step++) {
        mark.fill(0);
        var hit = false;
        for (var y = 1; y < H - 1; y++) {
          for (var x = 1; x < W - 1; x++) {
            var i = y * W + x;
            if (!d[i]) continue;
            var p2 = d[i - W], p3 = d[i - W + 1], p4 = d[i + 1],
                p5 = d[i + W + 1], p6 = d[i + W], p7 = d[i + W - 1],
                p8 = d[i - 1], p9 = d[i - W - 1];
            var B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;
            var A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
                    (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
            if (A !== 1) continue;
            if (step === 0) {
              if (p2 && p4 && p6) continue;
              if (p4 && p6 && p8) continue;
            } else {
              if (p2 && p4 && p8) continue;
              if (p2 && p6 && p8) continue;
            }
            mark[i] = 1;
            hit = true;
          }
        }
        if (hit) {
          changed = true;
          for (var k = 0; k < d.length; k++) if (mark[k]) d[k] = 0;
        }
      }
    }
    return img;
  }

  /* ---------- spur pruning ----------
     Serifs, 顿角 and brush tails all leave a short dead-end branch on the
     skeleton. Walk every free end; if it dies at a junction within maxLen
     pixels, it is a spur, not a stroke. Delete it.                          */
  function pruneSpurs(img, maxLen) {
    var W = img.w, H = img.h, d = img.d;
    var NX = [-1, 0, 1, -1, 1, -1, 0, 1];
    var NY = [-1, -1, -1, 0, 0, 1, 1, 1];
    var x, y, i, n, pass;

    for (pass = 0; pass < 8; pass++) {
      /* crossing number tells a real junction (>=3 branches) from a merely
         thick 2px remnant (crossing 2) — degree alone confuses the two */
      var cross = new Uint8Array(W * H);
      var deg = new Uint8Array(W * H);
      for (y = 1; y < H - 1; y++) {
        for (x = 1; x < W - 1; x++) {
          i = y * W + x;
          if (!d[i]) continue;
          var nb = [
            d[(y - 1) * W + x], d[(y - 1) * W + x + 1], d[y * W + x + 1], d[(y + 1) * W + x + 1],
            d[(y + 1) * W + x], d[(y + 1) * W + x - 1], d[y * W + x - 1], d[(y - 1) * W + x - 1]
          ];
          var c = 0, a = 0;
          for (n = 0; n < 8; n++) {
            c += nb[n];
            if (!nb[n] && nb[(n + 1) % 8]) a++;
          }
          deg[i] = c;
          cross[i] = a;
        }
      }

      var kill = new Uint8Array(W * H);
      var removed = 0;

      for (y = 1; y < H - 1; y++) {
        for (x = 1; x < W - 1; x++) {
          if (!d[y * W + x] || cross[y * W + x] !== 1) continue;

          var px = x, py = y, path = [[px, py]], junction = false;
          var guard = 0;

          while (guard++ < maxLen + 4) {
            var nx = -1, ny = -1, cnt = 0;
            for (n = 0; n < 8; n++) {
              var qx = px + NX[n], qy = py + NY[n];
              if (qx < 1 || qy < 1 || qx >= W - 1 || qy >= H - 1) continue;
              if (!d[qy * W + qx]) continue;
              if (path.length > 1 && qx === path[path.length - 2][0] && qy === path[path.length - 2][1]) continue;
              nx = qx; ny = qy; cnt++;
            }
            if (cnt !== 1) break;
            path.push([nx, ny]);
            px = nx; py = ny;
            if (cross[py * W + px] >= 3) { junction = true; break; }
            if (cross[py * W + px] === 1 && path.length > 1) break;
          }

          if (junction && path.length <= maxLen) {
            for (var k = 0; k < path.length - 1; k++) {
              var idx = path[k][1] * W + path[k][0];
              if (!kill[idx]) { kill[idx] = 1; removed++; }
            }
          }
        }
      }

      if (!removed) break;
      for (i = 0; i < kill.length; i++) if (kill[i]) d[i] = 0;
    }
    return img;
  }

  /* ---------- skeleton -> polylines ---------- */
  var NX = [-1, 0, 1, -1, 1, -1, 0, 1];
  var NY = [-1, -1, -1, 0, 0, 1, 1, 1];

  function trace(img) {
    var W = img.w, H = img.h, d = img.d;
    var deg = new Uint8Array(W * H);
    var x, y, i, n;

    for (y = 1; y < H - 1; y++) {
      for (x = 1; x < W - 1; x++) {
        i = y * W + x;
        if (!d[i]) continue;
        var c = 0;
        for (n = 0; n < 8; n++) c += d[(y + NY[n]) * W + (x + NX[n])];
        deg[i] = c;
      }
    }

    var seen = new Uint8Array(W * H);
    var segs = [];

    function walk(sx, sy) {
      var path = [[sx, sy]];
      seen[sy * W + sx] = 1;
      var cx = sx, cy = sy, dx = 0, dy = 0, hasDir = false;

      while (true) {
        var best = -1, bestDot = -2;
        for (var m = 0; m < 8; m++) {
          var nx = cx + NX[m], ny = cy + NY[m];
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          var ni = ny * W + nx;
          if (!d[ni] || seen[ni]) continue;
          var vx = NX[m], vy = NY[m];
          var dot = hasDir ? vx * dx + vy * dy : 0;
          if (dot > bestDot) { bestDot = dot; best = m; }
        }
        if (best < 0) break;

        var ax = cx + NX[best], ay = cy + NY[best];
        var len = Math.hypot(NX[best], NY[best]);
        dx = NX[best] / len; dy = NY[best] / len; hasDir = true;
        seen[ay * W + ax] = 1;
        path.push([ax, ay]);
        cx = ax; cy = ay;
      }
      return path;
    }

    for (var pass = 0; pass < 2; pass++) {
      for (y = 1; y < H - 1; y++) {
        for (x = 1; x < W - 1; x++) {
          i = y * W + x;
          if (!d[i] || seen[i]) continue;
          if (pass === 0 && deg[i] !== 1) continue;
          segs.push(walk(x, y));
        }
      }
    }
    return segs;
  }

  /* ---------- Ramer-Douglas-Peucker ---------- */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    var keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    var stack = [[0, pts.length - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      var vx = bx - ax, vy = by - ay;
      var vv = vx * vx + vy * vy;
      var best = -1, bd = eps * eps;
      for (var i = a + 1; i < b; i++) {
        var px = pts[i][0] - ax, py = pts[i][1] - ay;
        var t = vv ? Math.max(0, Math.min(1, (px * vx + py * vy) / vv)) : 0;
        var dx = px - vx * t, dy = py - vy * t;
        var dd = dx * dx + dy * dy;
        if (dd > bd) { bd = dd; best = i; }
      }
      if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    var out = [];
    for (var j = 0; j < pts.length; j++) if (keep[j]) out.push(pts[j]);
    return out;
  }

  function plen(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  /* 1-2-1 smoothing: kills the pixel staircase before we simplify */
  function smooth(pts, passes) {
    var a = pts.map(function (p) { return [p[0], p[1]]; });
    var b = a.map(function (p) { return [p[0], p[1]]; });
    for (var s = 0; s < passes; s++) {
      for (var i = 1; i < a.length - 1; i++) {
        b[i][0] = (a[i - 1][0] + 2 * a[i][0] + a[i + 1][0]) * 0.25;
        b[i][1] = (a[i - 1][1] + 2 * a[i][1] + a[i + 1][1]) * 0.25;
      }
      b[0][0] = a[0][0]; b[0][1] = a[0][1];
      var last = a.length - 1;
      b[last][0] = a[last][0]; b[last][1] = a[last][1];
      var t = a; a = b; b = t;
    }
    return a;
  }

  /* ---------- chain strokes into one path, minimizing pen lifts ---------- */
  function chain(segs) {
    var n = segs.length;
    if (n === 1) {
      return { path: segs[0].slice(), skip: new Uint8Array(segs[0].length), order: [{ i: 0, rev: false }] };
    }

    function d(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

    var best = null, bestCost = Infinity, bestStarts = null, bestOrder = null;

    for (var start = 0; start < n; start++) {
      for (var flip = 0; flip < 2; flip++) {
        var used = new Uint8Array(n);
        used[start] = 1;
        var head = segs[start];
        var pts = flip ? head.slice().reverse() : head.slice();
        var starts = [0];
        var order = [{ i: start, rev: !!flip }];
        var cost = 0;

        for (var k = 1; k < n; k++) {
          var ex = pts[pts.length - 1];
          var bi = -1, rev = false, bd = Infinity;
          for (var i = 0; i < n; i++) {
            if (used[i]) continue;
            var s = segs[i];
            var d0 = d(ex, s[0]);
            var d1 = d(ex, s[s.length - 1]);
            if (d0 < bd) { bd = d0; bi = i; rev = false; }
            if (d1 < bd) { bd = d1; bi = i; rev = true; }
          }
          used[bi] = 1;
          cost += bd;
          var pick = segs[bi];
          starts.push(pts.length);
          order.push({ i: bi, rev: rev });
          if (rev) { for (var q = pick.length - 1; q >= 0; q--) pts.push(pick[q]); }
          else { for (var q2 = 0; q2 < pick.length; q2++) pts.push(pick[q2]); }
        }
        if (cost < bestCost) {
          bestCost = cost; best = pts; bestStarts = starts; bestOrder = order;
        }
      }
    }

    /* a pen lift is exactly where one stroke ends and the next begins */
    var skip = new Uint8Array(best.length);
    for (var m = 1; m < bestStarts.length; m++) {
      var idx = bestStarts[m];
      if (idx < best.length && d(best[idx - 1], best[idx]) > 1.2) skip[idx] = 1;
    }
    return { path: best, skip: skip, order: bestOrder };
  }

  /* ---------- resample by arc length ---------- */
  function resample(pts, n, skip) {
    var cum = [0], total = 0, i;
    for (i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cum.push(total);
    }
    if (total < 1e-6) return null;

    var out = [], outSkip = [], j = 0;
    for (var k = 0; k < n; k++) {
      var target = total * k / n;
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      var seg = (cum[j + 1] - cum[j]) || 1e-9;
      var f = (target - cum[j]) / seg;
      var a = pts[j], b = pts[j + 1];
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      outSkip.push(skip ? (skip[j + 1] || 0) : 0);
    }
    return { pts: out, skip: outSkip };
  }

  /* cyclic smoothing on the final N samples: removes the sampling comb */
  function smoothClosed(pts, passes) {
    var n = pts.length, i, s;
    var a = pts.map(function (p) { return [p[0], p[1]]; });
    var b = a.map(function (p) { return [p[0], p[1]]; });
    for (s = 0; s < passes; s++) {
      for (i = 0; i < n; i++) {
        var p = (i - 1 + n) % n, q = (i + 1) % n;
        b[i][0] = (a[p][0] + 2 * a[i][0] + a[q][0]) * 0.25;
        b[i][1] = (a[p][1] + 2 * a[i][1] + a[q][1]) * 0.25;
      }
      var t = a; a = b; b = t;
    }
    return a;
  }

  /* pixel space is y-down; flip into maths space (y-up) once, here */
  function toUnit(paths) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var i, j, p;
    for (i = 0; i < paths.length; i++) {
      for (j = 0; j < paths[i].length; j++) {
        p = paths[i][j];
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    if (maxX < minX) return null;

    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var s = 1 / Math.max(maxX - minX, maxY - minY, 1);

    return paths.map(function (pts) {
      return pts.map(function (q) { return [(q[0] - cx) * s, -(q[1] - cy) * s]; });
    });
  }

  /* ---------- text -> unit-space path ---------- */
  function textToPath(text, opt) {
    opt = opt || {};
    var img = rasterize(text, opt.size, opt.font);
    if (!img) return null;
    var before = 0;
    for (var i = 0; i < img.d.length; i++) before += img.d[i];

    thin(img);
    pruneSpurs(img, Math.max(4, Math.round(img.h * 0.055)));
    var segs = trace(img);
    segs = segs.filter(function (s) { return plen(s) >= 3.5; });
    segs = segs.map(function (s) { return smooth(s, 3); });
    segs = segs.map(function (s) { return rdp(s, 1.2); });
    segs = segs.filter(function (s) { return s.length >= 2; });
    if (!segs.length) return null;

    var chained = chain(segs);

    var strokes = [];
    for (var oi = 0; oi < chained.order.length; oi++) {
      var od = chained.order[oi];
      var src = segs[od.i];
      if (!src || src.length < 2) continue;
      strokes.push(od.rev ? src.slice().reverse() : src.slice());
    }
    if (!strokes.length) return null;

    var unit = toUnit(strokes);
    return { strokes: unit, stats: { pixels: before, segs: segs.length } };
  }

  /* ---------- corner rounding (Chaikin) ---------- */
  function chaikin(pts, iters) {
    var p = pts;
    for (var k = 0; k < iters; k++) {
      if (p.length < 3) break;
      var out = [p[0]];
      for (var i = 0; i < p.length - 1; i++) {
        var a = p[i], b = p[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }

  /* ---------- one glyph -> strokes in a fixed 1000-unit em box ----------
     y is down (font convention), origin at the top-left of the em square.   */
  var EM = 1000;
  var EM_SIZE = 400;

  function rasterizeEm(ch, size, font) {
    size = size || EM_SIZE;
    font = font || FONT;
    var side = Math.round(size * 1.45);
    var c = document.createElement('canvas');
    c.width = side; c.height = side;
    var ctx = c.getContext('2d');
    ctx.font = size + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, side / 2, side / 2);

    var px = ctx.getImageData(0, 0, side, side).data;
    var minX = side, minY = side, maxX = -1, maxY = -1, x, y;
    var bin = new Uint8Array(side * side);
    for (y = 0; y < side; y++) {
      for (x = 0; x < side; x++) {
        if (px[(y * side + x) * 4 + 3] > 100) {
          bin[y * side + x] = 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    var cw = maxX - minX + 1, chh = maxY - minY + 1;
    var PAD = 2;
    var W2 = cw + PAD * 2, H2 = chh + PAD * 2;
    var out = new Uint8Array(W2 * H2);
    for (var j = 0; j < chh; j++)
      for (var i = 0; i < cw; i++)
        out[(j + PAD) * W2 + (i + PAD)] = bin[(j + minY) * side + (i + minX)];

    return { w: W2, h: H2, d: out, ox: minX - PAD, oy: minY - PAD, side: side, size: size };
  }

  /* returns null, or [[ [x,y], ... ], ...] with integer-ish em coordinates */
  function charStrokesEm(ch, opt) {
    opt = opt || {};
    var size = opt.size || EM_SIZE;
    var img = rasterizeEm(ch, size, opt.font);
    if (!img) return null;

    thin(img);
    pruneSpurs(img, Math.max(4, Math.round(img.h * 0.055)));
    var segs = trace(img);
    segs = segs.filter(function (s) { return plen(s) >= 3.5; });
    segs = segs.map(function (s) { return smooth(s, 1); });
    segs = segs.map(function (s) { return rdp(s, 0.8); });
    segs = segs.filter(function (s) { return s.length >= 2; });
    if (!segs.length) return null;

    var chained = chain(segs);
    var k = EM / img.size;                 /* pixels -> em units */
    var mid = img.side / 2;
    var out = [];

    for (var oi = 0; oi < chained.order.length; oi++) {
      var od = chained.order[oi];
      var src = segs[od.i];
      if (!src || src.length < 2) continue;
      var pts = od.rev ? src.slice().reverse() : src.slice();

      /* a light round-over: sharp corners are infinite bandwidth for the DFT */
      pts = chaikin(pts, 1);
      pts = rdp(pts, 0.9);

      /* the series rounds stroke ends inward; push them back out so that
         strokes still meet at a junction */
      if (pts.length >= 2) {
        var p0 = pts[0], p1 = pts[1];
        var d0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        var q0 = pts[pts.length - 2], q1 = pts[pts.length - 1];
        var d1 = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1;
        var EXT = 14;
        pts = [[p0[0] - (p1[0] - p0[0]) / d0 * EXT, p0[1] - (p1[1] - p0[1]) / d0 * EXT]]
          .concat(pts)
          .concat([[q1[0] + (q1[0] - q0[0]) / d1 * EXT, q1[1] + (q1[1] - q0[1]) / d1 * EXT]]);
      }

      var em = pts.map(function (p) {
        return [
          Math.round(((p[0] + img.ox - mid) * k + EM / 2) * 10) / 10,
          Math.round(((p[1] + img.oy - mid) * k + EM / 2) * 10) / 10
        ];
      });
      /* anything under ~4% of the em square is a skeleton artefact, not a stroke */
      if (em.length >= 2 && plen(em) >= 45) out.push(em);
    }
    return out.length ? out : null;
  }

  /* ---------- lay a string out from per-glyph em strokes ---------- */
  function layoutEm(glyphs) {
    var paths = [];
    for (var i = 0; i < glyphs.length; i++) {
      var g = glyphs[i];
      if (!g) continue;
      var dx = i * EM;
      for (var s = 0; s < g.length; s++) {
        var pts = new Array(g[s].length);
        for (var p = 0; p < g[s].length; p++) pts[p] = [g[s][p][0] + dx, g[s][p][1]];
        paths.push(pts);
      }
    }
    return paths.length ? toUnit(paths) : null;
  }

  EP.geom = {
    textToPath: textToPath,
    charStrokesEm: charStrokesEm,
    layoutEm: layoutEm,
    toUnit: toUnit,
    chaikin: chaikin,
    rasterize: rasterize,
    rasterizeEm: rasterizeEm,
    thin: thin,
    pruneSpurs: pruneSpurs,
    trace: trace,
    chain: chain,
    resample: resample,
    smoothClosed: smoothClosed,
    rdp: rdp,
    EM: EM
  };
})(window.EP = window.EP || {});
