// probe-brand-a11y.mjs — removing the visible brand text is only safe if the
// link still HAS a name. "The img has alt, so it's fine" is a belief about how
// name computation works; this reads the actual accessibility tree Chrome built.
//
// Also reports the masthead's height and the brand's box, because enlarging the
// logo changes the sticky header's size, which every scroll offset depends on.
//
//   node tools/probe-brand-a11y.mjs <url> [viewport]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('DOM.enable', {}, sessionId);
  await s.send('Accessibility.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2000);

  const { root } = await s.send('DOM.getDocument', { depth: -1 }, sessionId, 30000);

  console.log('brand accessibility — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');

  // BOTH brand links. The masthead and the footer each lost their visible
  // wordmark, so each one's name now rests entirely on the img alt — and a
  // missing name in the footer is just as broken as one in the header.
  for (const [sel, label] of [['.masthead .brand', 'masthead'], ['.footer .brand', 'footer']]) {
    const { nodeId } = await s.send('DOM.querySelector',
      { nodeId: root.nodeId, selector: sel }, sessionId, 20000);
    if (!nodeId) {
      console.log('  ' + label + ': ' + sel + ' NOT FOUND — nothing measured, not a pass');
      process.exitCode = 2;
      continue;
    }
    const ax = await s.send('Accessibility.getPartialAXTree',
      { nodeId, fetchRelatives: false }, sessionId, 20000);
    const node = (ax.nodes || []).find((n) => n.role && n.role.value === 'link') || (ax.nodes || [])[0];
    const name = node && node.name ? node.name.value : '';
    const role = node && node.role ? node.role.value : '(none)';
    const from = node && node.name && node.name.sources
      ? node.name.sources.filter((x) => x.value && x.value.value).map((x) => x.type + (x.attribute ? '(' + x.attribute + ')' : '')).join(', ')
      : '(unreported)';
    console.log('  ' + label.padEnd(9) + ' role ' + role + '   name "' + name + '"   from ' + from);
    if (!name.trim()) {
      console.log('    THE ' + label.toUpperCase() + ' BRAND LINK HAS NO NAME');
      process.exitCode = 1;
    }
  }

  const geom = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      function box(sel){ var e=document.querySelector(sel); if(!e) return null;
        var r=e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height),
                 top: Math.round(r.top), bottom: Math.round(r.bottom) }; }
      var m = document.querySelector('.masthead');
      var img = document.querySelector('.masthead .brand__logo');
      var nat = img ? { nw: img.naturalWidth, nh: img.naturalHeight, complete: img.complete } : null;
      var fimg = document.querySelector('.footer .brand__logo');
      return JSON.stringify({
        masthead: box('.masthead'), bar: box('.masthead__bar'),
        brand: box('.masthead .brand'), logo: box('.masthead .brand__logo'),
        footerBrand: box('.footer .brand'), footerLogo: box('.footer .brand__logo'),
        nameLeft: !!document.querySelector('.masthead .brand__name'),
        tagLeft: !!document.querySelector('.masthead .brand__tag'),
        footerName: !!document.querySelector('.footer .brand__name'),
        footerTag: !!document.querySelector('.footer .brand__tag'),
        footerNatural: fimg ? { nw: fimg.naturalWidth, nh: fimg.naturalHeight } : null,
        natural: nat,
        stuck: m ? getComputedStyle(m).position : '(none)'
      });
    })()`, returnByValue: true,
  }, sessionId, 20000)).result.value);

  console.log('\n  masthead   ' + (geom.masthead ? geom.masthead.h + 'px tall  (position: ' + geom.stuck + ')' : 'missing'));
  console.log('  bar        ' + (geom.bar ? geom.bar.h + 'px tall' : 'missing'));
  console.log('  brand box  ' + (geom.brand ? geom.brand.w + 'x' + geom.brand.h : 'missing'));
  console.log('  logo box   ' + (geom.logo ? geom.logo.w + 'x' + geom.logo.h : 'missing')
    + (geom.natural ? '   natural ' + geom.natural.nw + 'x' + geom.natural.nh
      + '   loaded: ' + geom.natural.complete : ''));
  console.log('  footer brand box  ' + (geom.footerBrand ? geom.footerBrand.w + 'x' + geom.footerBrand.h : 'missing'));
  console.log('  footer logo box   ' + (geom.footerLogo ? geom.footerLogo.w + 'x' + geom.footerLogo.h : 'missing')
    + (geom.footerNatural ? '   natural ' + geom.footerNatural.nw + 'x' + geom.footerNatural.nh : ''));
  console.log('  masthead brand__name present : ' + geom.nameLeft + '   brand__tag: ' + geom.tagLeft);
  console.log('  footer   brand__name present : ' + geom.footerName + '   brand__tag: ' + geom.footerTag);

  // both brand links are tap targets; 44x44 is the floor the sweep enforces
  for (const [b, label] of [[geom.brand, 'masthead brand'], [geom.footerBrand, 'footer brand']]) {
    if (!b) continue;
    const ok = b.h >= 44 && b.w >= 44;
    console.log('  tap target ' + label.padEnd(15) + b.w + 'x' + b.h + '   ' + (ok ? 'clears 44x44' : 'UNDER 44x44'));
    if (!ok) process.exitCode = 1;
  }

  if (geom.natural && geom.logo) {
    // a replaced element with padding: content height is the box minus padding
    const ratio = geom.natural.nw / geom.natural.nh;
    console.log('  intrinsic ratio ' + ratio.toFixed(3)
      + '  — rendered box ' + (geom.logo.w / geom.logo.h).toFixed(3)
      + ' (differs by design: the box includes the plate padding)');
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
