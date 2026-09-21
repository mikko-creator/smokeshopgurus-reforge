(function () {
  var CAP = 15;
  var W = window.innerWidth, H = window.innerHeight;
  var mobileish = W <= 834;
  var findings = [];

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '(page)';
    if (el.id) return '#' + el.id;
    var parts = [], node = el, guard = 0;
    while (node && node.nodeType === 1 && guard++ < 10) {
      var seg = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + node.id); break; }
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) seg += '.' + cls.join('.');
      var p = node.parentElement;
      if (p) {
        var sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) seg += ':nth-of-type(' + (Array.prototype.indexOf.call(sibs, node) + 1) + ')';
      }
      parts.unshift(seg);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function ignorable(el) {
    var s = (el.id || '') + ' ' + (el.getAttribute('class') || '');
    return /(^|\s)(claude-|cic-|__mcp|devtools-|responsive-viewer|grammarly)/i.test(s);
  }
  // A wide table or code block inside an overflow-x:auto wrapper is the CORRECT
  // pattern for wide content, not a layout defect. Measured 2026-09-03: without
  // this, 5 of 5 overflow findings at 390px were false positives on a page whose
  // document did not scroll at all.
  function inHorizontalScroller(el) {
    var node = el.parentElement, guard = 0;
    while (node && node !== document.body && guard++ < 20) {
      var cs = getComputedStyle(node);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && node.scrollWidth > node.clientWidth) return true;
      node = node.parentElement;
    }
    return false;
  }
  var PAGE_LEVEL = {
    'viewport-meta-missing': 1, 'img-broken': 1, 'img-missing-alt': 1, 'img-no-dimensions': 1,
    'dead-link': 1, 'empty-control-name': 1, 'lang-missing': 1, 'missing-h1': 1,
    'multiple-h1': 1, 'heading-skip': 1, 'form-no-action': 1, 'label-missing': 1,
    'title-missing': 1, 'external-noopener': 1
  };
  function push(check, severity, title, detail, el, value) {
    findings.push({
      check: check, severity: severity, title: title, detail: detail || '',
      selector: el ? cssPath(el) : '(page)', value: value == null ? '' : String(value),
      pageLevel: PAGE_LEVEL[check] === 1
    });
  }
  function cap(arr, check, severity, title, fmt) {
    for (var i = 0; i < arr.length && i < CAP; i++) push(check, severity, title, fmt ? fmt(arr[i]) : '', arr[i].el || arr[i], arr[i].value);
    if (arr.length > CAP) push(check, severity, title, (arr.length - CAP) + ' more not listed', null, arr.length);
  }

  // ---- page level -----------------------------------------------------------
  if (!document.querySelector('meta[name="viewport"]')) push('viewport-meta-missing', 'blocker', 'No viewport meta', 'Mobile layout cannot engage.', null, '');
  if (!document.documentElement.getAttribute('lang')) push('lang-missing', 'nit', 'No lang attribute on <html>', '', null, '');
  if (!document.title) push('title-missing', 'blocker', 'No <title>', '', null, '');
  var h1s = document.querySelectorAll('h1');
  if (h1s.length === 0) push('missing-h1', 'major', 'No H1', '', null, '0');
  if (h1s.length > 1) push('multiple-h1', 'minor', h1s.length + ' H1 elements', '', null, String(h1s.length));

  var lastLevel = 0, skips = [];
  var heads = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
  for (var hi = 0; hi < heads.length; hi++) {
    var lvl = Number(heads[hi].tagName[1]);
    if (lastLevel && lvl > lastLevel + 1) skips.push({ el: heads[hi], value: 'h' + lastLevel + ' -> h' + lvl });
    lastLevel = lvl;
  }
  cap(skips, 'heading-skip', 'nit', 'Heading level skipped');

  // ---- images ---------------------------------------------------------------
  var imgs = document.querySelectorAll('img');
  var broken = [], noAlt = [], noDim = [], oversized = [];
  for (var i = 0; i < imgs.length; i++) {
    var im = imgs[i];
    if (ignorable(im)) continue;
    if (im.complete && im.naturalWidth === 0) broken.push({ el: im, value: im.currentSrc || im.src });
    if (im.getAttribute('alt') === null) noAlt.push({ el: im, value: im.currentSrc || im.src });
    if (!im.getAttribute('width') || !im.getAttribute('height')) {
      if (!getComputedStyle(im).aspectRatio || getComputedStyle(im).aspectRatio === 'auto') noDim.push({ el: im, value: '' });
    }
    var r = im.getBoundingClientRect();
    if (im.naturalWidth && r.width && im.naturalWidth > r.width * 2.5 && r.width > 0) {
      oversized.push({ el: im, value: im.naturalWidth + 'px natural vs ' + Math.round(r.width) + 'px displayed' });
    }
  }
  cap(broken, 'img-broken', 'blocker', 'Image fails to load');
  cap(noAlt, 'img-missing-alt', 'minor', 'Image has no alt attribute');
  cap(noDim, 'img-no-dimensions', 'minor', 'Image has no width/height (layout shift)');
  cap(oversized, 'img-oversized', 'minor', 'Image far larger than its display size');

  // ---- links and controls ---------------------------------------------------
  var deadLinks = [], noName = [], noOpener = [];
  var anchors = document.querySelectorAll('a');
  for (var j = 0; j < anchors.length; j++) {
    var an = anchors[j];
    if (ignorable(an)) continue;
    var href = an.getAttribute('href');
    if (href === null || href === '' || href === '#' || /^javascript:\s*void/i.test(href)) {
      deadLinks.push({ el: an, value: String(href) });
    }
    if (an.target === '_blank' && !/noopener/.test(an.rel || '')) noOpener.push({ el: an, value: an.href });
    var txt = (an.textContent || '').trim();
    if (!txt && !an.getAttribute('aria-label') && !an.querySelector('img[alt]:not([alt=""])')) {
      noName.push({ el: an, value: '' });
    }
  }
  var buttons = document.querySelectorAll('button,[role="button"]');
  for (var b = 0; b < buttons.length; b++) {
    var bt = buttons[b];
    if (ignorable(bt)) continue;
    if (!(bt.textContent || '').trim() && !bt.getAttribute('aria-label') && !bt.getAttribute('title')) noName.push({ el: bt, value: '' });
  }
  cap(deadLinks, 'dead-link', 'blocker', 'Link goes nowhere');
  cap(noName, 'empty-control-name', 'major', 'Control has no accessible name');
  cap(noOpener, 'external-noopener', 'nit', 'target=_blank without rel=noopener');

  // ---- forms ----------------------------------------------------------------
  var forms = document.querySelectorAll('form');
  var noAction = [], unlabelled = [];
  for (var f = 0; f < forms.length; f++) {
    var fo = forms[f];
    var act = fo.getAttribute('action');
    if (!act || act === '#') noAction.push({ el: fo, value: String(act) });
    var ctrls = fo.querySelectorAll('input:not([type=hidden]),textarea,select');
    for (var c = 0; c < ctrls.length; c++) {
      var ct = ctrls[c];
      var labelled = (ct.id && fo.querySelector('label[for="' + ct.id + '"]')) || ct.closest('label')
        || ct.getAttribute('aria-label') || ct.getAttribute('aria-labelledby');
      if (!labelled) unlabelled.push({ el: ct, value: ct.name || ct.type });
    }
  }
  cap(noAction, 'form-no-action', 'blocker', 'Form has no action');
  cap(unlabelled, 'label-missing', 'major', 'Form control has no label');

  // ---- viewport-dependent ---------------------------------------------------
  var docW = document.documentElement.scrollWidth;
  if (docW > W + 1) push('page-overflow', 'major', 'Page scrolls horizontally', 'document ' + docW + 'px vs viewport ' + W + 'px', null, docW + 'px');

  var overflowers = [], tiny = [], smallTap = [], clipped = [];
  var all = document.querySelectorAll('body *');
  for (var k = 0; k < all.length; k++) {
    var el = all[k];
    if (ignorable(el)) continue;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    if (rect.right > W + 1 && cs.position !== 'fixed' && el.children.length === 0
        && !inHorizontalScroller(el)) {
      overflowers.push({ el: el, value: Math.round(rect.right) + 'px > ' + W + 'px' });
    }
    var fs2 = parseFloat(cs.fontSize);
    if (fs2 && fs2 < 12 && (el.textContent || '').trim().length > 8 && el.children.length === 0) {
      tiny.push({ el: el, value: cs.fontSize });
    }
    if (mobileish && /^(a|button|input|select|textarea)$/i.test(el.tagName) &&
        (rect.width < 44 || rect.height < 44) && rect.width > 0) {
      // FLOOR, never round: a 44px box measures 43.99 on a 1.1x display, and
      // Math.round printed "44" — a failing target reported as a compliant number.
      var fl1 = function (n) { return Math.floor(n * 10) / 10; };
      smallTap.push({ el: el, value: fl1(rect.width) + 'x' + fl1(rect.height) });
    }
    if (el.scrollHeight > el.clientHeight + 4 && cs.overflow === 'hidden' && el.clientHeight > 0 &&
        (el.textContent || '').trim().length > 20) {
      clipped.push({ el: el, value: el.scrollHeight + 'px in ' + el.clientHeight + 'px' });
    }
    if (mobileish && /^input$/i.test(el.tagName) && fs2 && fs2 < 16 && !/checkbox|radio|submit|button/i.test(el.type)) {
      tiny.push({ el: el, value: cs.fontSize + ' (iOS zooms inputs under 16px)' });
    }
  }
  cap(overflowers, 'element-overflow', 'major', 'Element extends past the viewport');
  cap(tiny, 'font-too-small', 'minor', 'Text under 12px');
  cap(smallTap, 'tap-target-small', 'major', 'Tap target under 44x44');
  cap(clipped, 'text-clipped', 'minor', 'Text clipped by overflow:hidden');

  var counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (var q = 0; q < findings.length; q++) counts[findings[q].severity]++;

  return {
    schema: 'site-reforge/sweep@1',
    url: location.href,
    capturedAt: new Date().toISOString(),
    viewport: { w: W, h: H, dpr: window.devicePixelRatio || 1 },
    documentScrollWidth: docW,
    counts: counts,
    findings: findings
  };
})()
