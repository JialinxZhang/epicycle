/* ============================================================
   EPICYCLE — export
   PNG: the drawing on its own ground (no UI, no circles).
   SVG: the real vector path, resolution independent.
   ============================================================ */
(function (EP) {
  'use strict';

  var ACCENT = '#5EEBFF';
  var BG = '#07070A';

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function slug(text) {
    return (text || 'epicycle').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24);
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* the same soft ground the page has: a cyan bloom and a vignette */
  function ground(ctx, w, h) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    var bloom = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.62);
    bloom.addColorStop(0, 'rgba(94,235,255,0.055)');
    bloom.addColorStop(0.55, 'rgba(94,235,255,0)');
    bloom.addColorStop(1, 'rgba(94,235,255,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);

    var vg = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.30, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function exportPNG(onDone) {
    var src = EP.ink.canvas();
    if (!src || !src.width) { onDone && onDone('nothing to export'); return; }

    var w = src.width, h = src.height;
    var out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    var ctx = out.getContext('2d');
    ground(ctx, w, h);
    ctx.drawImage(src, 0, 0);

    out.toBlob(function (blob) {
      if (!blob) { onDone && onDone('png failed'); return; }
      save(blob, 'epicycle-' + slug(EP.appText()) + '-' + stamp() + '.png');
      onDone && onDone('PNG ' + Math.round(w) + '×' + Math.round(h));
    }, 'image/png');
  }

  function exportSVG(onDone) {
    var paths = EP.ink.exportPaths();
    if (!paths.length) { onDone && onDone('nothing to export'); return; }

    var size = EP.ink.size;
    var w = Math.round(size.w), h = Math.round(size.h);

    var d = paths.map(function (run) {
      var s = 'M' + run[0][0].toFixed(2) + ' ' + run[0][1].toFixed(2);
      for (var i = 1; i < run.length; i++) {
        s += 'L' + run[i][0].toFixed(2) + ' ' + run[i][1].toFixed(2);
      }
      return s;
    }).join(' ');

    var svg =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n' +
      '<title>' + (EP.appText() || 'EPICYCLE') + '</title>\n' +
      '<defs>\n' +
      '  <radialGradient id="bloom" cx="50%" cy="46%" r="62%">\n' +
      '    <stop offset="0" stop-color="#5EEBFF" stop-opacity="0.055"/>\n' +
      '    <stop offset="0.55" stop-color="#5EEBFF" stop-opacity="0"/>\n' +
      '  </radialGradient>\n' +
      '  <radialGradient id="vg" cx="50%" cy="50%" r="78%">\n' +
      '    <stop offset="0.3" stop-color="#000" stop-opacity="0"/>\n' +
      '    <stop offset="1" stop-color="#000" stop-opacity="0.88"/>\n' +
      '  </radialGradient>\n' +
      '  <filter id="soft" x="-15%" y="-15%" width="130%" height="130%">\n' +
      '    <feGaussianBlur stdDeviation="2.6"/>\n' +
      '  </filter>\n' +
      '</defs>\n' +
      '<rect width="' + w + '" height="' + h + '" fill="' + BG + '"/>\n' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#bloom)"/>\n' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#vg)"/>\n' +
      '<g fill="none" stroke-linecap="round" stroke-linejoin="round">\n' +
      '  <path d="' + d + '" stroke="' + ACCENT + '" stroke-opacity="0.16" stroke-width="7" filter="url(#soft)"/>\n' +
      '  <path d="' + d + '" stroke="' + ACCENT + '" stroke-opacity="0.30" stroke-width="3"/>\n' +
      '  <path d="' + d + '" stroke="#E2FBFF" stroke-opacity="0.98" stroke-width="1.35"/>\n' +
      '</g>\n' +
      '</svg>\n';

    save(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
         'epicycle-' + slug(EP.appText()) + '-' + stamp() + '.svg');
    onDone && onDone('SVG ' + w + '×' + h);
  }

  EP.exporter = {
    png: exportPNG,
    svg: exportSVG
  };
})(window.EP = window.EP || {});
