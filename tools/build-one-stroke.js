/* Batch: hand-drawn connected glyphs -> Chinese-Postman single closed walk.
   Emits data/one-stroke.js */
const fs = require('fs');
const path = require('path');

const TOL = 26 / 1000;   /* in em units */

/* ---------- the sample set: every stroke touches another ---------- */
const P = (x, y) => [x / 1000, y / 1000];
/* start mid-edge, so the closed outline has no un-filleted corner at the seam */
const box = (x0, y0, x1, y1) => [P((x0 + x1) / 2, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0), P((x0 + x1) / 2, y0)];

const DESIGNS = {
  '一': [[P(150, 500), P(850, 500)]],
  '十': [[P(500, 140), P(500, 860)], [P(140, 500), P(860, 500)]],
  '口': [box(220, 200, 780, 800)],
  '日': [box(240, 160, 760, 840), [P(240, 500), P(760, 500)]],
  '田': [box(200, 200, 800, 800), [P(500, 200), P(500, 800)], [P(200, 500), P(800, 500)]],
  '目': [box(240, 140, 760, 880), [P(240, 380), P(760, 380)], [P(240, 640), P(760, 640)]],
  '中': [box(260, 240, 740, 660), [P(500, 80), P(500, 880)]],
  '山': [[P(160, 860), P(840, 860)], [P(500, 300), P(500, 860)],
         [P(240, 480), P(240, 860)], [P(760, 480), P(760, 860)]],
  '工': [[P(180, 240), P(820, 240)], [P(500, 240), P(500, 760)], [P(180, 760), P(820, 760)]],
  '王': [[P(180, 200), P(820, 200)], [P(180, 480), P(820, 480)], [P(180, 760), P(820, 760)],
         [P(500, 120), P(500, 840)]]
};

/* ---------- geometry ---------- */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const plen = p => { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i], p[i - 1]); return L; };

function closestOnSeg(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], vv = vx * vx + vy * vy;
  let t = vv ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / vv : 0;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + vx * t, a[1] + vy * t];
  return { p: q, d: dist(p, q) };
}

/* arc-length position of q on segment i..i+1 of pts */
function arcAt(pts, i, q) {
  let acc = 0;
  for (let k = 1; k <= i; k++) acc += dist(pts[k], pts[k - 1]);
  return acc + dist(pts[i], q);
}

function closestOnPolyline(p, pts) {
  let best = { d: Infinity, at: 0, p: null };
  for (let i = 1; i < pts.length; i++) {
    const r = closestOnSeg(p, pts[i - 1], pts[i]);
    if (r.d < best.d) best = { d: r.d, at: arcAt(pts, i - 1, r.p), p: r.p };
  }
  return best;
}

function segIntersect(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [a[0] + t * rx, a[1] + t * ry];
}

/* fixed-radius fillet at every corner: the curvature floor, made literal */
function roundPath(pts, R) {
  if (pts.length < 3) return pts.map(q => [q[0], q[1]]);
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = dist(a, b) || 1, l2 = dist(c, b) || 1;
    const r1 = Math.min(R, l1 * 0.45), r2 = Math.min(R, l2 * 0.45);
    const p0 = [b[0] + (a[0] - b[0]) / l1 * r1, b[1] + (a[1] - b[1]) / l1 * r1];
    const p2 = [b[0] + (c[0] - b[0]) / l2 * r2, b[1] + (c[1] - b[1]) / l2 * r2];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, u = 1 - t;
      out.push([
        u * u * p0[0] + 2 * u * t * b[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * b[1] + t * t * p2[1]
      ]);
    }
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}
function buildGraph(strokes) {
  /* 1. where does each stroke get cut? at its own ends, at other strokes'
        endpoints that land on it, and at every crossing */
  const cutLists = strokes.map(s => {
    const L = plen(s);
    const list = [{ at: 0, p: s[0] }, { at: L, p: s[s.length - 1] }];
    /* a stroke that is already a closed loop would become a self-loop edge,
       which the Euler pass cannot walk — cut it in half instead */
    if (s.length > 2 && dist(s[0], s[s.length - 1]) < TOL) {
      let acc = 0, k = 1;
      while (k < s.length - 1 && acc < L / 2) { acc += dist(s[k], s[k - 1]); if (acc < L / 2) k++; else break; }
      list.push({ at: acc, p: s[Math.min(k, s.length - 1)] });
    }
    return list;
  });

  for (let i = 0; i < strokes.length; i++) {
    const si = strokes[i];
    for (let j = 0; j < strokes.length; j++) {
      if (i === j) continue;
      const sj = strokes[j];

      /* j's free ends touching i */
      [sj[0], sj[sj.length - 1]].forEach(ep => {
        const c = closestOnPolyline(ep, si);
        if (c.p && c.d < TOL) cutLists[i].push({ at: c.at, p: c.p });
      });

      /* real crossings */
      for (let a = 1; a < si.length; a++) {
        for (let b = 1; b < sj.length; b++) {
          const x = segIntersect(si[a - 1], si[a], sj[b - 1], sj[b]);
          if (!x) continue;
          cutLists[i].push({ at: arcAt(si, a - 1, x), p: x });
        }
      }
    }
  }

  /* 2. vertices and sub-edges */
  const verts = [];
  const addVert = p => {
    for (let i = 0; i < verts.length; i++) if (dist(p, verts[i]) < TOL * 1.2) return i;
    verts.push([p[0], p[1]]);
    return verts.length - 1;
  };

  let edges = [];
  strokes.forEach((s, si) => {
    const cuts = cutLists[si].slice().sort((a, b) => a.at - b.at);
    const clean = [];
    cuts.forEach(c => {
      if (!clean.length || Math.abs(c.at - clean[clean.length - 1].at) > TOL * 0.5) clean.push(c);
    });
    if (clean.length < 2) return;
    for (let c = 0; c < clean.length - 1; c++) {
      const A = clean[c], B = clean[c + 1];
      const pts = [A.p];
      for (let k = 1; k < s.length; k++) {
        const at = arcAt(s, k - 1, s[k]);
        if (at > A.at + 1e-6 && at < B.at - 1e-6) pts.push(s[k]);
      }
      pts.push(B.p);
      if (pts.length < 2) continue;
      const L = plen(pts);
      if (L < 1e-5) continue;
      edges.push({ a: addVert(A.p), b: addVert(B.p), pts, len: L, bridge: false });
    }
  });

  const buildAdj = () => {
    const adj = verts.map(() => []);
    edges.forEach((e, i) => {
      if (e.a === e.b) return;
      adj[e.a].push({ to: e.b, e: i });
      adj[e.b].push({ to: e.a, e: i });
    });
    return adj;
  };

  /* dissolve degree-2 vertices */
  let guard = 0;
  /* hand-designed graphs are already clean; dissolving degree-2 vertices here
     corrupts parallel-edge cases (it folds an edge into a there-and-back walk) */
  while (false && guard++ < 300) {
    const adj0 = buildAdj();
    let did = false;
    for (let v = 0; v < verts.length && !did; v++) {
      if (adj0[v].length !== 2) continue;
      const e1 = adj0[v][0].e, e2 = adj0[v][1].e;
      if (e1 === e2) continue;
      const A = edges[e1], B = edges[e2];
      /* parallel edges between the same pair: merging would make a self-loop */
      if ((A.a === B.b && A.b === B.a) || (A.a === B.a && A.b === B.b)) continue;
      if (!A || !B) continue;
      let p1 = A.pts.slice(), p2 = B.pts.slice();
      if (A.b !== v) p1.reverse();
      if (B.a !== v) p2.reverse();
      const joined = p1.concat(p2.slice(1));
      edges.push({ a: A.a === v ? A.b : A.a, b: B.a === v ? B.b : B.a,
                   pts: joined, len: plen(joined), bridge: A.bridge || B.bridge });
      edges[e1] = null; edges[e2] = null;
      edges = edges.filter(e => e);
      did = true;
    }
    if (!did) break;
  }

  /* connect components with the shortest bridge */
  let bridges = 0, bridgeLen = 0;
  const comps = () => {
    const adj = buildAdj();
    const seen = new Array(verts.length).fill(-1);
    let n = 0;
    for (let i = 0; i < verts.length; i++) {
      if (seen[i] >= 0) continue;
      const q = [i]; seen[i] = n;
      while (q.length) {
        const u = q.pop();
        adj[u].forEach(a => { if (seen[a.to] < 0) { seen[a.to] = n; q.push(a.to); } });
      }
      n++;
    }
    return { label: seen, count: n };
  };

  let c = comps();
  guard = 0;
  while (c.count > 1 && guard++ < 12) {
    let best = { d: Infinity, a: -1, b: -1 };
    for (let i = 0; i < verts.length; i++)
      for (let j = i + 1; j < verts.length; j++) {
        if (c.label[i] === c.label[j]) continue;
        const d = dist(verts[i], verts[j]);
        if (d < best.d) best = { d, a: i, b: j };
      }
    if (best.a < 0) break;
    if (process.env.DBG) console.log('   bridge', best.d.toFixed(3), verts[best.a].map(v=>v.toFixed(2)), verts[best.b].map(v=>v.toFixed(2)));
    edges.push({ a: best.a, b: best.b, pts: [verts[best.a].slice(), verts[best.b].slice()],
                 len: best.d, bridge: true });
    bridges++; bridgeLen += best.d;
    c = comps();
  }

  return { verts, edges, adj: buildAdj(), bridges, bridgeLen, comps: c };
}

/* Insert a small loop at every 180-degree reversal: the pen turns around with a
   visible flourish instead of a cusp the series cannot represent. */
function addLoops(flat, r) {
  if (flat.length < 3) return flat;
  const out = [[flat[0][0], flat[0][1]]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const nrm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

  for (let i = 1; i < flat.length - 1; i++) {
    const p0 = flat[i - 1], p1 = flat[i], p2 = flat[i + 1];
    const d1 = nrm(sub(p1, p0)), d2 = nrm(sub(p2, p1));
    const dot = d1[0] * d2[0] + d1[1] * d2[1];

    if (dot < -0.85) {
      /* teardrop: stretched along the stroke, narrow across, and centred
         behind the tip so it curls back over the ink instead of capping it.
         radius follows the local stroke length so the loops breathe. */
      const span = Math.min(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
                            Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
      const rr = r * Math.max(0.6, Math.min(1.5, span / 140));
      const a = rr * 1.75, b = rr * 0.5;
      const n = [-d1[1], d1[0]];
      const cx = p1[0] - d1[0] * a, cy = p1[1] - d1[1] * a;
      const STEPS = 18;
      for (let k = 0; k <= STEPS; k++) {
        const th = 2 * Math.PI * k / STEPS;
        out.push([
          cx + a * Math.cos(th) * d1[0] + b * Math.sin(th) * n[0],
          cy + a * Math.cos(th) * d1[1] + b * Math.sin(th) * n[1]
        ]);
      }
    } else {
      out.push([p1[0], p1[1]]);
    }
  }
  out.push([flat[flat.length - 1][0], flat[flat.length - 1][1]]);
  return out;
}
function cpp(strokes) {
  const g = buildGraph(strokes);
  const { verts, edges, adj, bridges, bridgeLen, comps } = g;
  if (process.env.DBG) console.log('  verts', verts.length, 'edges', edges.length, 'comps', comps.count);
  const deg = adj.map(a => a.length);
  const odd = [];
  deg.forEach((d, i) => { if (d % 2 === 1) odd.push(i); });

  const dijkstra = src => {
    const n = verts.length;
    const D = new Array(n).fill(Infinity), Pp = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    D[src] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && D[i] < bd) { bd = D[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      adj[u].forEach(lk => {
        const w = D[u] + edges[lk.e].len;
        if (w < D[lk.to]) { D[lk.to] = w; Pp[lk.to] = lk.e; }
      });
    }
    return { D, P: Pp };
  };

  const SP = {};
  odd.forEach(v => { SP[v] = dijkstra(v); });

  const pathEdges = (a, b) => {
    const res = []; let cur = b, guard = 0;
    while (cur !== a && guard++ < 400) {
      const e = SP[a].P[cur];
      if (e < 0) break;
      res.push(e);
      cur = edges[e].a === cur ? edges[e].b : edges[e].a;
    }
    return res;
  };

  const m = odd.length;
  const W = [];
  for (let i = 0; i < m; i++) {
    W.push([]);
    for (let j = 0; j < m; j++) {
      W[i][j] = i === j ? 0 : SP[odd[i]].D[odd[j]];
      if (!isFinite(W[i][j])) W[i][j] = dist(verts[odd[i]], verts[odd[j]]) * 1.5;
    }
  }

  let avail = [...Array(m).keys()];
  const pairs = [];
  while (avail.length >= 2) {
    let bp = { d: Infinity, a: -1, b: -1 };
    for (let x = 0; x < avail.length; x++)
      for (let y = x + 1; y < avail.length; y++) {
        const dd = W[avail[x]][avail[y]];
        if (dd < bp.d) bp = { d: dd, a: avail[x], b: avail[y] };
      }
    pairs.push([bp.a, bp.b]);
    avail = avail.filter(k => k !== bp.a && k !== bp.b);
  }
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (let p1 = 0; p1 < pairs.length; p1++)
      for (let p2 = p1 + 1; p2 < pairs.length; p2++) {
        const [A1, B1] = pairs[p1], [A2, B2] = pairs[p2];
        const now = W[A1][B1] + W[A2][B2];
        const alt1 = W[A1][A2] + W[B1][B2];
        const alt2 = W[A1][B2] + W[B1][A2];
        if (alt1 < now - 1e-9 && alt1 <= alt2) { pairs[p1] = [A1, A2]; pairs[p2] = [B1, B2]; improved = true; }
        else if (alt2 < now - 1e-9) { pairs[p1] = [A1, B2]; pairs[p2] = [B1, A2]; improved = true; }
      }
    if (!improved) break;
  }

  const dup = {};
  pairs.forEach(([a, b]) => pathEdges(odd[a], odd[b]).forEach(e => { dup[e] = (dup[e] || 0) + 1; }));

  const multi = [];
  edges.forEach((e, i) => {
    multi.push({ e: i, dup: false });
    for (let k = 0; k < (dup[i] || 0); k++) multi.push({ e: i, dup: true });
  });

  const pool = verts.map(() => []);
  multi.forEach((M, idx) => {
    const e = edges[M.e];
    if (e.a === e.b) return;
    pool[e.a].push({ idx, to: e.b });
    pool[e.b].push({ idx, to: e.a });
  });

  const ptr = verts.map(() => 0);
  const usedM = new Array(multi.length).fill(false);
  const stackN = [0], circuitN = [];
  while (stackN.length) {
    const v = stackN[stackN.length - 1];
    let found = -1;
    while (ptr[v] < pool[v].length) {
      const cand = pool[v][ptr[v]];
      if (!usedM[cand.idx]) { found = cand.idx; break; }
      ptr[v]++;
    }
    if (found < 0) circuitN.push(stackN.pop());
    else {
      usedM[found] = true;
      const e = edges[multi[found].e];
      stackN.push(e.a === v ? e.b : e.a);
    }
  }
  circuitN.reverse();

  const taken = new Array(multi.length).fill(false);
  const segs = [];
  let totalLen = 0, dupLen = 0;

  for (let c = 0; c < circuitN.length - 1; c++) {
    const f = circuitN[c], t = circuitN[c + 1];
    let hit = -1;
    for (let q = 0; q < pool[f].length; q++) {
      const cc = pool[f][q];
      if (cc.to === t && !taken[cc.idx]) { hit = cc.idx; break; }
    }
    if (hit < 0) continue;
    taken[hit] = true;
    const ee = edges[multi[hit].e];
    const pts = ee.pts.slice();
    if (ee.a !== f) pts.reverse();
    segs.push({ pts, dup: multi[hit].dup });
    totalLen += ee.len;
    if (multi[hit].dup) dupLen += ee.len;
  }

  /* flat point list */
  const flat = [];
  segs.forEach(s => {
    const pts = s.pts.map(q => [Math.round(q[0] * 1000), Math.round(q[1] * 1000)]);
    const start = flat.length ? 1 : 0;
    for (let i = start; i < pts.length; i++) flat.push(pts[i]);
  });

  const looped = addLoops(flat, 16);

  return {
    pts: looped,
    dup: totalLen ? dupLen / totalLen * 100 : 0,
    bridge: totalLen ? bridgeLen / totalLen * 100 : 0,
    bridges,
    strokes: strokes.length
  };
}

/* ---------- run ---------- */
const out = {};
const rows = [];
for (const [ch, rawStrokes] of Object.entries(DESIGNS)) {
  const strokes = rawStrokes.map(s => roundPath(s, 0.06));
  const r = cpp(strokes);
  out[ch] = r.pts;
  rows.push([ch, r.strokes, r.bridges, r.dup.toFixed(1), r.bridge.toFixed(1)]);
}

const body = 'window.EP_ONE=' + JSON.stringify({ v: 1, upem: 1000, chars: out }) + ';';
fs.writeFileSync(path.resolve(__dirname, '../data/one-stroke.js'), body, 'utf8');

console.log('char  strokes  bridges  retrace  newInk');
rows.forEach(r => console.log(r[0] + '     ' + r[1] + '       ' + r[2] + '       ' + r[3] + '%    ' + r[4] + '%'));
console.log('bytes', body.length);
