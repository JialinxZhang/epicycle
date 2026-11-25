/* extract the <pre id="dump"> payloads into data/one-stroke.js */
const fs = require('fs');
const path = require('path');

const tools = path.resolve(__dirname);
const out = path.resolve(__dirname, '../data/one-stroke.js');

const chars = {};
for (const f of fs.readdirSync(tools).filter(f => f.startsWith('dump-') && f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(tools, f), 'utf8');
  const m = html.match(/<pre id="dump">([\s\S]*?)<\/pre>/);
  if (!m) { console.error('no dump in', f); continue; }
  const data = JSON.parse(m[1]);
  chars[data.ch] = data.pts;
  console.log(data.ch, 'pts', data.pts.length, 'dup', data.dup.toFixed(1) + '%', 'bridge', data.bridge.toFixed(1) + '%');
}

const body = 'window.EP_ONE=' + JSON.stringify({ v: 1, upem: 1000, chars }) + ';';
fs.writeFileSync(out, body, 'utf8');
console.log('bytes', body.length, '->', out);
