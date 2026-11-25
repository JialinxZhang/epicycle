/* ============================================================
   EPICYCLE — app
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var txtEl = $('txt'), statusEl = $('status'), countEl = $('count'), knEl = $('kn');
  var rK = $('rK'), vK = $('vK'), rS = $('rS'), vS = $('vS'), vF = $('vF'), vFace = $('vFace'), vMode = $('vMode'), vSnd = $('vSnd');
  var spec = $('spectrum'), sctx = spec.getContext('2d');

  var N = 1024, F = 720, PERIOD = 9000;

  var FONTS = {
    song: '"宋体","SimSun",serif',
    hei: '"黑体","SimHei",sans-serif',
    deng: '"等线","DengXian",sans-serif',
    yuan: '"幼圆","YouYuan",sans-serif',
    xing: '"华文行楷","STXingkai",cursive',
    kai: '"楷体","KaiTi",serif',
    fourier: '"Noto Sans SC","思源黑体",sans-serif'
  };

  /* characters missing from the baked font are built on the fly with this */
  var FALLBACK_FONT = '"Noto Sans SC","思源黑体",sans-serif';

  var state = {
    text: '永',
    K: 600,
    speed: 1,
    autoK: true,
    mode: 'multi',
    font: FONTS.song,
    fontKey: 'song',
    strokes: null,     /* unit-space polylines, one per stroke */
    shape: null
  };

  var t = 0, phase = 'draw', holdUntil = 0, fadeUntil = 0, last = 0, lastStatus = '';
  var dragging = false;
  var bars = null, DPR = 1;
  var seedT = null;

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function setStatus(s) {
    if (s === lastStatus) return;
    lastStatus = s;
    statusEl.textContent = s;
  }

  function autoKFor(len) {
    return Math.round(clamp(7000 / Math.max(1, len), 400, 1000));
  }

  /* ---------- pipeline ---------- */
  function fourierPath(text) {
    var glyphs = [], used = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var g = (window.EP_FONT && window.EP_FONT.chars[ch]) || null;
      if (g) used++;
      else if (ch.trim()) {
        g = EP.geom.charStrokesEm(ch, { size: 400, font: FALLBACK_FONT });
      }
      glyphs.push(g);
    }
    var strokes = EP.geom.layoutEm(glyphs);
    if (!strokes) return null;
    return { strokes: strokes, fromFont: used, total: text.length };
  }

  function oneStrokePath(text) {
    if (text.length !== 1) return null;
    var raw = window.EP_ONE && window.EP_ONE.chars[text];
    if (!raw || raw.length < 3) return null;
    var pts = raw.map(function (p) { return [p[0] / 1000, p[1] / 1000]; });
    pts.closed = true;
    var unit = EP.geom.toUnit([pts]);
    if (!unit || !unit.length) return null;
    unit[0].closed = true;
    return { strokes: unit, fromFont: 1, total: 1, one: true };
  }

  function rebuildAll() {
    var text = state.text;
    setStatus('● 解析中');
    setTimeout(function () {
      var res = null;

      if (state.mode === 'one') res = oneStrokePath(text);

      if (!res) {
        if (state.fontKey === 'fourier') {
          res = fourierPath(text);
          if (res) vFace.textContent = '傅里叶体' + (res.fromFont < res.total ? ' +补' : '');
        } else {
          res = EP.geom.textToPath(text, { size: 400, font: state.font });
        }
      }

      if (state.mode === 'one') vMode.textContent = res && res.one ? '一笔' : '一笔 · 回退';

      if (!res || !res.strokes.length) {
        state.shape = null;
        EP.ink.setShape(null);
        setStatus('● 无法解析');
        return;
      }
      state.strokes = res.strokes;
      rebuildSeries();
    }, 16);
  }

  function rebuildSeries() {
    if (!state.strokes) return;
    var built = EP.fourier.buildAll(state.strokes, N, state.K, F);
    if (!built) {
      EP.ink.setShape(null);
      setStatus('● 无法解析');
      return;
    }
    state.shape = built;
    bars = null;
    EP.ink.setShape(built);
    EP.audio.setChord(built.comps);
    drawBars();

    knEl.textContent = 'K = ' + state.K + ' / N = ' + N;
    vK.textContent = state.K;
    rK.value = state.K;

    t = 0;
    phase = 'draw';
    EP.ink.clear();

    if (seedT !== null) {
      t = seedT;
      EP.ink.redraw(Math.round(seedT * (built.totalF - 1)));
      phase = 'hold';
      holdUntil = performance.now() + 1e9;
    }
    setStatus('● 绘制中');
  }

  /* ---------- spectrum ---------- */
  function drawBars() {
    if (!state.shape || !state.shape.comps) return;
    var r = spec.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    spec.width = Math.round(w * DPR);
    spec.height = Math.round(h * DPR);
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    bars = document.createElement('canvas');
    bars.width = spec.width;
    bars.height = spec.height;
    var b = bars.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);

    var comps = state.shape.comps.slice().sort(function (a, b) { return b.amp - a.amp; });
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
        : 'rgba(237,234,227,' + (0.09 + 0.20 * (1 - i / count)).toFixed(3) + ')';
      b.fillRect(x, h - bh, bw, bh);
    }
  }

  function paintSpectrum() {
    if (!bars) return;
    var r = spec.getBoundingClientRect();
    var w = r.width, h = r.height;
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(bars, 0, 0, w, h);
    sctx.fillStyle = 'rgba(94,235,255,0.9)';
    sctx.fillRect(Math.round(t * w), 0, 1, h);
  }

  /* ---------- loop ---------- */
  function tick(now) {
    requestAnimationFrame(tick);
    if (!last) last = now;
    var dt = Math.min(now - last, 100);
    last = now;

    if (!state.shape || dragging) { paintSpectrum(); return; }

    if (phase === 'draw') {
      t += dt * state.speed / PERIOD;
      if (t >= 1) { t = 1; phase = 'hold'; holdUntil = now + 700; setStatus('● 完成'); }
    } else if (phase === 'hold') {
      if (now > holdUntil) { phase = 'fade'; fadeUntil = now + 780; setStatus('● 溶解'); }
    } else if (phase === 'fade') {
      EP.ink.fade(0.055);
      if (now > fadeUntil) {
        t = 0; phase = 'draw';
        EP.ink.clear();
        setStatus('● 绘制中');
      }
    }

    EP.ink.draw(t);
    EP.audio.tick(phase, EP.ink.speed / 18);
    paintSpectrum();
  }

  /* ---------- input ---------- */
  var debounce = null;

  function onText() {
    var v = txtEl.value.slice(0, 10);
    if (v !== txtEl.value) txtEl.value = v;
    countEl.textContent = String(v.length).padStart(2, '0') + ' / 10';
    state.text = v;
    if (state.autoK) state.K = autoKFor(v.length || 1);
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      if (!v.trim()) {
        state.shape = null; state.strokes = null;
        EP.ink.setShape(null);
        setStatus('● 等待输入');
        return;
      }
      rebuildAll();
    }, 240);
  }

  function bind() {
    txtEl.addEventListener('input', onText);

    rK.addEventListener('input', function () {
      state.autoK = false;
      state.K = parseInt(rK.value, 10);
      vK.textContent = state.K;
      clearTimeout(debounce);
      debounce = setTimeout(rebuildSeries, 90);
    });

    rS.addEventListener('input', function () {
      state.speed = parseFloat(rS.value);
      vS.textContent = state.speed.toFixed(1) + '×';
    });

    var FACE_LABEL = { song: '宋体', hei: '黑体', deng: '等线', yuan: '幼圆', kai: '楷体', xing: '行楷', fourier: '傅里叶体' };
    var faceBtns = Array.prototype.slice.call(document.querySelectorAll('#faces button'));
    faceBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        state.fontKey = b.getAttribute('data-f');
        state.font = FONTS[state.fontKey];
        vF.textContent = FACE_LABEL[state.fontKey];
        faceBtns.forEach(function (o) { o.classList.toggle('on', o === b); });
        rebuildAll();
      });
    });
    faceBtns.forEach(function (o) {
      o.classList.toggle('on', o.getAttribute('data-f') === state.fontKey);
    });
    vF.textContent = FACE_LABEL[state.fontKey];

    var modeBtns = Array.prototype.slice.call(document.querySelectorAll('#modeRow button'));
    modeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.getAttribute('data-m');
        modeBtns.forEach(function (o) { o.classList.toggle('on', o === b); });
        vMode.textContent = state.mode === 'one' ? '一笔' : '分笔';
        rebuildAll();
      });
    });
    modeBtns.forEach(function (o) {
      o.classList.toggle('on', o.getAttribute('data-m') === state.mode);
    });

    var sndBtns = Array.prototype.slice.call(document.querySelectorAll('#sndRow button'));
    sndBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var on = b.getAttribute('data-s') === 'on';
        EP.audio.setEnabled(on);
        vSnd.textContent = on ? '开' : '关';
        sndBtns.forEach(function (o) { o.classList.toggle('on', o === b); });
        /* the audio graph only exists after a real gesture — restart the loop
           so the current phrase is played with its own chord */
        if (on) {
          if (state.shape) EP.audio.setChord(state.shape.comps);
          t = 0; phase = 'draw'; EP.ink.clear();
        }
      });
    });

    /* click to replay */
    window.addEventListener('click', function (e) {
      if (e.target.closest('input, button, a, .chrome')) return;
      t = 0; phase = 'draw';
      EP.ink.clear();
      setStatus('● 绘制中');
    });

    /* horizontal scrub */
    var downX = 0, moved = false;
    window.addEventListener('pointerdown', function (e) {
      if (e.target.closest('input, button, a')) return;
      dragging = false; moved = false; downX = e.clientX;
    });
    window.addEventListener('pointermove', function (e) {
      if (!e.buttons || !state.shape) return;
      if (Math.abs(e.clientX - downX) > 6) {
        dragging = true; moved = true;
        t = clamp((e.clientX / window.innerWidth), 0, 1);
        EP.ink.draw(t);
      }
    });
    window.addEventListener('pointerup', function () {
      if (dragging && moved) { phase = t >= 1 ? 'hold' : 'draw'; if (phase === 'hold') holdUntil = performance.now() + 700; }
      dragging = false;
    });

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        EP.ink.resize();
        bars = null;
        drawBars();
      }, 120);
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    var q = new URLSearchParams(location.search);
    if (q.has('text')) txtEl.value = q.get('text').slice(0, 10);
    if (q.has('k')) { state.K = clamp(parseInt(q.get('k'), 10) || 600, 60, 1400); state.autoK = false; }
    if (q.has('font') && FONTS[q.get('font')]) { state.fontKey = q.get('font'); state.font = FONTS[state.fontKey]; }
    if (q.get('mode') === 'one') state.mode = 'one';
    if (q.has('t')) seedT = clamp(parseFloat(q.get('t')) || 0, 0, 0.999);

    state.text = txtEl.value || '永';
    if (state.autoK) state.K = autoKFor(state.text.length);
    countEl.textContent = String(state.text.length).padStart(2, '0') + ' / 10';

    EP.ink.init($('ink'), $('circles'));
    EP.ink.resize();
    bind();
    rebuildAll();
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
