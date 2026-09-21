(function () {
  var CAP = 1500;              // max elements recorded
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + el.id;
    var parts = [], node = el, guard = 0;
    while (node && node.nodeType === 1 && guard++ < 12) {
      var seg = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + node.id); break; }
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) seg += '.' + cls.join('.');
      var parent = node.parentElement;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) seg += ':nth-of-type(' + (Array.prototype.indexOf.call(sibs, node) + 1) + ')';
      }
      parts.unshift(seg);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  // Properties that DEFINE the design. Anything not here cannot change how the
  // page looks at rest, so recording it would only add noise.
  var PROPS = [
    'display','position','box-sizing','float','clear','overflow','overflow-x','overflow-y','visibility','opacity','z-index',
    'width','height','min-width','max-width','min-height','max-height',
    'margin-top','margin-right','margin-bottom','margin-left',
    'padding-top','padding-right','padding-bottom','padding-left',
    'font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing',
    'text-align','text-transform','text-decoration-line','white-space','text-shadow','font-variation-settings',
    'color','background-color','background-image','background-size','background-position','background-repeat','background-attachment','background-clip',
    'border-top-width','border-right-width','border-bottom-width','border-left-width','border-style','border-color',
    'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius',
    'box-shadow','outline','filter','backdrop-filter','mix-blend-mode',
    'flex-direction','flex-wrap','justify-content','align-items','align-content','gap','row-gap','column-gap','flex-grow','flex-shrink','flex-basis','order',
    'grid-template-columns','grid-template-rows','grid-auto-flow','grid-column','grid-row',
    'transform','transform-origin','perspective','translate','rotate','scale',
    'transition-property','transition-duration','transition-timing-function','transition-delay',
    'animation-name','animation-duration','animation-timing-function','animation-delay','animation-iteration-count','animation-direction','animation-fill-mode','animation-play-state',
    'will-change','object-fit','object-position','aspect-ratio','cursor','list-style-type',
    'position','top','right','bottom','left','inset-block-start',
    'scroll-behavior','content-visibility'
  ];

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, NOSCRIPT: 1, TEMPLATE: 1, BR: 1 };
  function isAutomationNode(el) {
    var id = (el.id || '') + ' ' + (el.getAttribute('class') || '');
    return /(^|\s)(claude-|cic-|__mcp|devtools-overlay|responsive-viewer)/i.test(id);
  }

  var elements = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length && elements.length < CAP; i++) {
    var el = all[i];
    if (SKIP_TAGS[el.tagName] || isAutomationNode(el)) continue;
    var rect = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (rect.width === 0 && rect.height === 0) continue;
    var style = {};
    for (var p = 0; p < PROPS.length; p++) {
      var v = cs.getPropertyValue(PROPS[p]);
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') style[PROPS[p]] = v.trim();
    }
    var before = getComputedStyle(el, '::before').getPropertyValue('content');
    var after = getComputedStyle(el, '::after').getPropertyValue('content');
    elements.push({
      sel: cssPath(el),
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 200),
      role: el.getAttribute('role') || '',
      text: (el.children.length === 0 ? (el.textContent || '') : '').replace(/\s+/g, ' ').trim().slice(0, 120),
      box: { x: r2(rect.x), y: r2(rect.y + window.scrollY), w: r2(rect.width), h: r2(rect.height) },
      style: style,
      pseudo: {
        before: before && before !== 'none' ? before : '',
        after: after && after !== 'none' ? after : ''
      }
    });
  }

  // --- CSS rules we can read (same-origin sheets + inline <style>) -----------
  var keyframes = [];
  var mediaQueries = [];
  var fontFaces = [];
  var unreadableSheets = [];
  function walkRules(rules, sheetHref) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      try {
        if (rule.type === 7 || (window.CSSKeyframesRule && rule instanceof CSSKeyframesRule)) {
          var frames = [];
          for (var k = 0; k < rule.cssRules.length; k++) {
            frames.push({ offset: rule.cssRules[k].keyText, css: rule.cssRules[k].style.cssText });
          }
          keyframes.push({ name: rule.name, frames: frames, sheet: sheetHref });
        } else if (rule.type === 4 || (window.CSSMediaRule && rule instanceof CSSMediaRule)) {
          mediaQueries.push({ condition: rule.conditionText || rule.media.mediaText, matches: window.matchMedia(rule.conditionText || rule.media.mediaText).matches, ruleCount: rule.cssRules.length });
          walkRules(rule.cssRules, sheetHref);
        } else if (rule.type === 5 || (window.CSSFontFaceRule && rule instanceof CSSFontFaceRule)) {
          fontFaces.push({ css: rule.cssText.slice(0, 400), sheet: sheetHref });
        } else if (rule.cssRules) {
          walkRules(rule.cssRules, sheetHref);
        }
      } catch (e) { /* one bad rule must not kill the harvest */ }
    }
  }
  for (var s = 0; s < document.styleSheets.length; s++) {
    var sheet = document.styleSheets[s];
    try { walkRules(sheet.cssRules, sheet.href || '(inline)'); }
    catch (e) { unreadableSheets.push({ href: sheet.href || '(inline)', reason: String(e && e.message || e) }); }
  }

  // --- live animations (the ground truth for motion) -------------------------
  var animations = [];
  try {
    var anims = document.getAnimations ? document.getAnimations() : [];
    for (var ai = 0; ai < anims.length && ai < 400; ai++) {
      var an = anims[ai];
      var eff = an.effect;
      var timing = eff && eff.getTiming ? eff.getTiming() : {};
      var frames = [];
      try { frames = eff && eff.getKeyframes ? eff.getKeyframes().slice(0, 12) : []; } catch (e) {}
      animations.push({
        kind: an.constructor ? an.constructor.name : 'Animation',
        id: an.id || '',
        animationName: an.animationName || (an.transitionProperty || ''),
        target: eff && eff.target ? cssPath(eff.target) : '',
        playState: an.playState,
        timing: {
          duration: timing.duration, delay: timing.delay, endDelay: timing.endDelay,
          easing: timing.easing, iterations: timing.iterations,
          direction: timing.direction, fill: timing.fill
        },
        keyframes: frames
      });
    }
  } catch (e) { animations.push({ error: String(e && e.message || e) }); }

  // --- root custom properties (the author's own token layer) ------------------
  var rootVars = {};
  try {
    var rs = getComputedStyle(document.documentElement);
    for (var vi = 0; vi < rs.length; vi++) {
      var pn = rs[vi];
      if (pn.indexOf('--') === 0) rootVars[pn] = rs.getPropertyValue(pn).trim();
    }
  } catch (e) {}

  // --- fonts actually in use --------------------------------------------------
  var loadedFonts = [];
  try {
    if (document.fonts && document.fonts.forEach) {
      document.fonts.forEach(function (f) {
        if (f.status === 'loaded') loadedFonts.push(f.family + ' ' + f.weight + ' ' + f.style);
      });
    }
  } catch (e) {}

  return {
    schema: 'site-reforge/capture@1',
    url: location.href,
    capturedAt: new Date().toISOString(),
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    document: {
      scrollHeight: document.documentElement.scrollHeight,
      title: document.title,
      lang: document.documentElement.lang || '',
      elementCount: all.length,
      recorded: elements.length,
      truncated: all.length > CAP
    },
    rootVars: rootVars,
    loadedFonts: loadedFonts.slice(0, 60),
    keyframes: keyframes,
    mediaQueries: mediaQueries,
    fontFaces: fontFaces,
    unreadableSheets: unreadableSheets,
    animations: animations,
    elements: elements
  };
})()
