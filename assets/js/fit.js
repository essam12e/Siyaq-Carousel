/* سياق كاروسيل — fit copy to the slide.
   Picks the largest type scale --k in [MIN_K, MAX_K] for which the content fits the stage without overflow
   and occupies at most FILL of its height (so slides are neither cramped nor half empty).
   Elements marked .grow keep a minimum share of the stage (data-min, default 0.35).
   Result is exposed on window.__siyaqFit for the renderer's QC. */
(function () {
  var root = document.documentElement;
  var cfg = document.body.dataset;
  var MIN_K = parseFloat(cfg.minK || '0.78'), MAX_K = parseFloat(cfg.maxK || '1.3'), FILL = parseFloat(cfg.fill || '0.86'), STEP = 0.02;
  var st = document.querySelector('.stage');
  function overflowing() {
    if (!st) return false;
    if (st.scrollHeight > st.clientHeight + 1) return true;
    // horizontal: real content (text, CTA, images) must stay inside the stage; a few px slack for slightly rotated paper cards
    var sr = st.getBoundingClientRect();
    var items = st.querySelectorAll('.tx, [data-cta], img, .qr, .chip, .cta-btn');
    for (var h = 0; h < items.length; h++) { var r = items[h].getBoundingClientRect(); if (r.width && (r.left < sr.left - 6 || r.right > sr.right + 6)) return true; }
    var tx = document.querySelectorAll('.stage .tx');
    for (var i = 0; i < tx.length; i++) if (tx[i].clientWidth > 0 && tx[i].scrollWidth > tx[i].clientWidth + 2) return true;
    var boxes = document.querySelectorAll('.stage .card, .stage .col, .stage .node, .stage .box');
    for (var j = 0; j < boxes.length; j++) if (boxes[j].scrollHeight > boxes[j].clientHeight + 1) return true;
    return false;
  }
  function used() {
    if (!st) return 0;
    var h = 0, n = 0, kids = st.children, H = st.clientHeight;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.classList.contains('spacer')) continue;
      if (c.classList.contains('grow')) { h += H * parseFloat(c.dataset.min || '0.35'); n++; continue; }
      var cs = getComputedStyle(c);
      h += c.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); n++;
    }
    var gap = parseFloat(getComputedStyle(st).rowGap) || 0;
    return h + Math.max(0, n - 1) * gap;
  }
  /* big numbers (t-num) never wrap: shrink each one to its box width instead */
  function fitNums() {
    var nums = document.querySelectorAll('.stage .t-num');
    for (var i = 0; i < nums.length; i++) {
      var n = nums[i]; n.style.fontSize = ''; var base = parseFloat(getComputedStyle(n).fontSize), sc = 1;
      while (n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1 && sc > 0.35) { sc -= 0.04; n.style.fontSize = (base * sc) + 'px'; }
    }
  }
  function ok() { fitNums(); return !overflowing() && used() <= st.clientHeight * FILL + 1; }
  function run() {
    var k = MAX_K;
    root.style.setProperty('--k', k);
    while (!ok() && k > MIN_K + 1e-9) { k = Math.round((k - STEP) * 1000) / 1000; root.style.setProperty('--k', k); }
    var hidden = avoidDecor();
    window.__siyaqFit = { k: k, fitted: !overflowing(), fill: st ? +(used() / st.clientHeight).toFixed(3) : 0, decorHidden: hidden, done: true };
  }
  /* Decorative shapes must never sit behind text, logos or CTAs. Each decor candidate (svg > g[data-g])
     is tested with real geometry (isPointInFill/Stroke); within a group the first clear candidate wins. */
  function avoidDecor() {
    var u = parseFloat(getComputedStyle(root).getPropertyValue('--u')) || 1, pad = 14 * u;
    var rects = [];
    document.querySelectorAll('.tx, [data-cta], [data-brand], .qr, .logo-big, .badge-num, .mark, .card, .col, .chip, .cta-btn, .ico, .product-stage img, .img-box, .vs').forEach(function (el) {
      var r = el.getBoundingClientRect(); if (r.width && r.height) rects.push([r.left - pad, r.top - pad, r.right + pad, r.bottom + pad]);
    });
    function hits(g) {
      var shapes = g.matches('path,circle,rect,polygon,ellipse,line,polyline') ? [g] : g.querySelectorAll('path,circle,rect,polygon,ellipse,line,polyline');
      for (var s = 0; s < shapes.length; s++) {
        var el = shapes[s], bb = el.getBoundingClientRect();
        var m = el.getScreenCTM(); if (!m) continue; var inv = m.inverse(); var svg = el.ownerSVGElement;
        for (var i = 0; i < rects.length; i++) {
          var R = rects[i];
          if (bb.right < R[0] || bb.left > R[2] || bb.bottom < R[1] || bb.top > R[3]) continue;
          // small marks (sparkles, dots) can slip between sample points: any bbox overlap counts
          if (bb.width < 90 * u && bb.height < 90 * u) return true;
          for (var a = 0; a <= 8; a++) for (var b = 0; b <= 4; b++) {
            var pt = svg.createSVGPoint(); pt.x = R[0] + (R[2] - R[0]) * a / 8; pt.y = R[1] + (R[3] - R[1]) * b / 4;
            var q = pt.matrixTransform(inv);
            if (el.isPointInFill(q) || (el.isPointInStroke && el.isPointInStroke(q))) return true;
          }
        }
      }
      return false;
    }
    var hidden = 0, groups = {};
    document.querySelectorAll('.bg-layer svg > *').forEach(function (g) {
      if (g.tagName === 'defs') return;
      var key = g.getAttribute('data-g');
      if (key) { (groups[key] = groups[key] || []).push(g); return; }
      if (!g.hasAttribute('data-keep') && hits(g)) { g.style.display = 'none'; hidden++; }
    });
    Object.keys(groups).forEach(function (k) {
      var chosen = false;
      groups[k].forEach(function (g) { if (!chosen && !hits(g)) chosen = true; else { g.style.display = 'none'; hidden++; } });
    });
    return hidden;
  }
  window.__siyaqFit = { done: false };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    var imgs = Array.prototype.slice.call(document.images).map(function (im) { return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; }); });
    return Promise.all(imgs);
  }).then(function () { requestAnimationFrame(run); });
})();
