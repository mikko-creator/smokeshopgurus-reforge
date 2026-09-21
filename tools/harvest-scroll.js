(function () {
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var WATCH = ['opacity','transform','filter','visibility','clip-path','translate','scale','rotate'];
  function cssPath(el) {
    if (el.id) return '#' + el.id;
    var parts = [], node = el, guard = 0;
    while (node && node.nodeType === 1 && guard++ < 8) {
      var seg = node.tagName.toLowerCase();
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) seg += '.' + cls.join('.');
      parts.unshift(seg); node = node.parentElement;
    }
    return parts.join(' > ');
  }
  var nodes = Array.prototype.slice.call(document.querySelectorAll('section, article, header, footer, main, div, h1, h2, h3, img, figure, li')).slice(0, 900);
  function snap() {
    return nodes.map(function (el) {
      var cs = getComputedStyle(el);
      var o = { sel: cssPath(el), cls: (el.getAttribute('class') || '').slice(0, 120) };
      for (var i = 0; i < WATCH.length; i++) o[WATCH[i]] = cs.getPropertyValue(WATCH[i]);
      var r = el.getBoundingClientRect();
      o.y = r2(r.y + window.scrollY);
      return o;
    });
  }
  var before = snap();
  window.scrollTo(0, document.documentElement.scrollHeight);
  return new Promise(function (resolve) {
    setTimeout(function () {
      var after = snap();
      var changes = [];
      for (var i = 0; i < before.length; i++) {
        var b = before[i], a = after[i], diff = {};
        for (var k = 0; k < WATCH.length; k++) {
          var p = WATCH[k];
          if (b[p] !== a[p]) diff[p] = { from: b[p], to: a[p] };
        }
        if (Object.keys(diff).length) changes.push({ sel: b.sel, cls: b.cls, y: b.y, changed: diff });
      }
      window.scrollTo(0, 0);
      resolve({
        schema: 'site-reforge/scroll-capture@1',
        url: location.href,
        capturedAt: new Date().toISOString(),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        scrollHeight: document.documentElement.scrollHeight,
        revealCount: changes.length,
        reveals: changes.slice(0, 400)
      });
    }, 1200);
  });
})()
