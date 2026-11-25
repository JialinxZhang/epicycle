/* Design law: corner radius vs how many harmonics a glyph costs.
   A closed rounded square, swept over fillet radius, reconstructed at K. */
const N = 1024;

function roundedSquare(r) {
  // square [-0.5,0.5]^2, corner radius r (fraction of side)
  const h = 0.5 - r;
  const pts = [];
  const seg = (x0, y0, x1, y1, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  };
  const arc = (cx, cy, a0, n) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  const S = 40;
  // top edge -> top-right corner -> right edge -> bottom-right -> bottom -> bottom-left -> left -> top-left
  seg(-h, -0.5, h, -0.5, S);           arc(h, -h, -Math.PI / 2, S);
  seg(0.5, -h, 0.5, h, S);             arc(h, h, 0, S);
  seg(h, 0.5, -h, 0.5, S);             arc(-h, h, Math.PI / 2, S);
  seg(-0.5, h, -0.5, -h, S);           arc(-h, -h, Math.PI, S);
  return pts;
}

function resample(p, n) {
  const cum = [0]; let total = 0;
  for (let i = 1; i < p.length; i++) { total += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); cum.push(total); }
  const out = []; let j = 0;
  for (let k = 0; k < n; k++) {
    const t = total * k / n;
    while (j < cum.length - 2 && cum[j+1] < t) j++;
    const seg = (cum[j+1]-cum[j]) || 1e-9;
    const f = (t - cum[j]) / seg;
    out.push([p[j][0]+(p[j+1][0]-p[j][0])*f, p[j][1]+(p[j+1][1]-p[j][1])*f]);
  }
  return out;
}

function dft(z) {
  const n = z.length, out = [];
  for (let k = 0; k < n; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const a = -2*Math.PI*k*i/n, c = Math.cos(a), s = Math.sin(a);
      re += z[i][0]*c - z[i][1]*s;
      im += z[i][0]*s + z[i][1]*c;
    }
    out.push({ k, re: re/n, im: im/n, amp: Math.hypot(re, im)/n, ph: Math.atan2(im, re) });
  }
  return out;
}

function errAt(z, comps, K) {
  const n = z.length;
  const top = comps.slice().sort((a,b)=>b.amp-a.amp).slice(0, K);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0; const t = i/n;
    for (const c of top) {
      const a = 2*Math.PI*c.k*t + c.ph;
      x += c.amp*Math.cos(a); y += c.amp*Math.sin(a);
    }
    worst = Math.max(worst, Math.hypot(x-z[i][0], y-z[i][1]));
  }
  return worst;
}

const radii = [0.005, 0.02, 0.05, 0.08, 0.12, 0.20, 0.35];
const KS = [8, 16, 32, 64];

console.log('corner r   ' + KS.map(k => 'K=' + k).join('\t'));
for (const r of radii) {
  const z = resample(roundedSquare(r), N);
  const c = dft(z);
  const row = KS.map(K => (errAt(z, c, K) / Math.SQRT2 * 100).toFixed(2) + '%');
  console.log((r*100).toFixed(1).padStart(5) + '%   ' + row.join('\t'));
}
