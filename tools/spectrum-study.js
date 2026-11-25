/* How many harmonics does a glyph need?
   Compares the raw skeleton (sharp corners) with a rounded-over design
   on the same stroke, measuring reconstruction error vs K. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'data/fourier-font.js'), 'utf8');
const win = {};
new Function('window', src.replace('window.EP_FONT=', 'window.EP_FONT='))(win);
const FONT = win.EP_FONT;
const chars = Object.keys(FONT.chars);

/* ---------- geometry helpers ---------- */
function plen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); return L; }

function resample(p, n) {
  const cum = [0]; let total = 0;
  for (let i = 1; i < p.length; i++) { total += Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]); cum.push(total); }
  if (total < 1e-9) return null;
  const out = []; let j = 0;
  for (let k = 0; k < n; k++) {
    const t = total * k / n;
    while (j < cum.length - 2 && cum[j+1] < t) j++;
    const seg = (cum[j+1]-cum[j]) || 1e-9;
    const f = (t - cum[j]) / seg;
    out.push([p[j][0] + (p[j+1][0]-p[j][0])*f, p[j][1] + (p[j+1][1]-p[j][1])*f]);
  }
  return out;
}

function chaikin(p, iters) {
  let a = p.map(q => [q[0], q[1]]);
  for (let k = 0; k < iters; k++) {
    if (a.length < 3) break;
    const out = [a[0]];
    for (let i = 0; i < a.length - 1; i++) {
      const A = a[i], B = a[i+1];
      out.push([A[0]*0.75+B[0]*0.25, A[1]*0.75+B[1]*0.25]);
      out.push([A[0]*0.25+B[0]*0.75, A[1]*0.25+B[1]*0.75]);
    }
    out.push(a[a.length-1]);
    a = out;
  }
  return a;
}

/* retrace to a closed loop, exactly like the renderer does */
function closed(p) { return p.concat(p.slice(0, -1).reverse()); }

function dft(z) {
  const n = z.length, out = [];
  for (let k = 0; k < n; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const a = -2*Math.PI*k*i/n;
      const c = Math.cos(a), s = Math.sin(a);
      re += z[i][0]*c - z[i][1]*s;
      im += z[i][0]*s + z[i][1]*c;
    }
    out.push({ k: k <= n/2 ? k : k - n, re: re/n, im: im/n, amp: Math.hypot(re, im)/n, ph: Math.atan2(im/n, re/n) });
  }
  return out;
}

function maxErr(z, comps, K) {
  const n = z.length;
  const top = comps.slice().sort((a,b) => b.amp - a.amp).slice(0, K);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    const t = i / n;
    for (const c of top) {
      const a = 2*Math.PI*c.k*t + c.ph;
      x += c.amp*Math.cos(a);
      y += c.amp*Math.sin(a);
    }
    worst = Math.max(worst, Math.hypot(x - z[i][0], y - z[i][1]));
  }
  return worst;
}

function bboxSize(paths) {
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for (const p of paths) for (const q of p) {
    if (q[0]<minX) minX=q[0]; if (q[0]>maxX) maxX=q[0];
    if (q[1]<minY) minY=q[1]; if (q[1]>maxY) maxY=q[1];
  }
  return Math.hypot(maxX-minX, maxY-minY) || 1;
}

/* ---------- measure ---------- */
const KS = [16, 32, 64, 128];
const N = 256;
const raw = Object.fromEntries(KS.map(k => [k, []]));
const rnd = Object.fromEntries(KS.map(k => [k, []]));

let used = 0;
for (const ch of chars) {
  const strokes = FONT.chars[ch];
  if (!strokes || !strokes.length) continue;
  const longest = strokes.slice().sort((a,b) => plen(b) - plen(a))[0];
  if (plen(longest) < 200) continue;

  const diag = bboxSize(strokes);

  const a = resample(longest, N);
  if (!a) continue;
  const za = closed(a).slice(0, N * 2 - 1);
  // closed() gives 2n-1 points; use df of that length
  const ca = dft(za);

  const b = resample(chaikin(longest, 2), N);
  if (!b) continue;
  const zb = closed(b).slice(0, N * 2 - 1);
  const cb = dft(zb);

  for (const K of KS) {
    raw[K].push(maxErr(za, ca, K) / diag);
    rnd[K].push(maxErr(zb, cb, K) / diag);
  }
  used++;
  if (used >= 120) break;
}

function median(a) { const s = a.slice().sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; }

console.log('glyphs measured:', used, ' (unit: max deviation / glyph diagonal)');
console.log('K\t sharp\t\t rounded(2x chaikin)');
for (const K of KS) {
  console.log(K + '\t' + (median(raw[K])*100).toFixed(2) + '%\t\t ' + (median(rnd[K])*100).toFixed(2) + '%');
}
