// probe-align.mjs — where does each block actually START?
//
// "The hero text looks awkwardly centered" is a claim about a left edge. The
// page has one authored gutter (`.shell`), so the question is simply whether the
// hero's left edge agrees with every other section's left edge, in pixels.
//
//   node tools/probe-align.mjs <url> [viewport]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);

const TARGETS = [
  ['.hero__inner', 'hero inner'],
  ['.hero__eyebrow', 'hero eyebrow'],
  ['.hero h1', 'hero h1'],
  ['.hero__lede', 'hero lede'],
  ['.hero__actions', 'hero actions'],
  ['.sec__kicker', 'section kicker'],
  ['.sec__title', 'section title'],
  ['.masthead__bar', 'masthead bar'],
  ['.brand', 'brand'],
  ['.brand__logo', 'brand logo'],
];

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2000);
  // reveals can start an element offset; settle them first
  await s.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});",
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(800);

  const rows = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var T = ${JSON.stringify(TARGETS)};
      var out = [];
      T.forEach(function(p){
        var e = document.querySelector(p[0]);
        if (!e) { out.push({ name: p[1], missing: true }); return; }
        var r = e.getBoundingClientRect();
        var cs = getComputedStyle(e);
        out.push({ name: p[1],
          left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
          height: Math.round(r.height),
          contentLeft: Math.round(r.left + parseFloat(cs.paddingLeft || 0)),
          maxW: cs.maxWidth, padL: cs.paddingLeft, marginInline: cs.marginLeft + '/' + cs.marginRight });
      });
      return JSON.stringify({ rows: out, shell: getComputedStyle(document.documentElement).getPropertyValue('--shell').trim(), vw: innerWidth });
    })()`, returnByValue: true,
  }, sessionId, 25000)).result.value);

  console.log('alignment — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + rows.vw + 'px   --shell: ' + rows.shell);
  console.log('  ' + 'block'.padEnd(16) + 'left  content-left   width   max-width   padding-left');
  for (const r of rows.rows) {
    if (r.missing) { console.log('  ' + r.name.padEnd(16) + '(not present)'); continue; }
    console.log('  ' + r.name.padEnd(16)
      + String(r.left).padStart(4) + String(r.contentLeft).padStart(14)
      + String(r.width).padStart(8) + r.maxW.padStart(12) + r.padL.padStart(15));
  }

  const ref = rows.rows.find((r) => r.name === 'section title');
  const h1 = rows.rows.find((r) => r.name === 'hero h1');
  if (ref && h1 && !ref.missing && !h1.missing) {
    const delta = h1.contentLeft - ref.contentLeft;
    console.log('\n  hero h1 vs section title: ' + (delta === 0 ? 'aligned'
      : delta + 'px ' + (delta > 0 ? 'further right' : 'further left')));
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
