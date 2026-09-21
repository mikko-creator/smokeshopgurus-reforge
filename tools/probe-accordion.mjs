// probe-accordion.mjs — does the FAQ panel actually SLIDE, and for how long?
//
// "It animates now" is a claim about intermediate frames. This clicks a real
// summary and samples the <details> height every rAF, so a snap and a slide are
// told apart by the number of distinct heights between the two endpoints, not
// by watching it.
//
// It also runs the reduced-motion case, which is the control: the same code
// path must produce a SNAP there. A probe that reports a slide in both states
// is measuring something other than the animation.
//
//   node tools/probe-accordion.mjs <url> [--reduced]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/pages/faqs/';
const reduced = process.argv.includes('--reduced');

const SAMPLER = `(function(sel, ms){
  var det = document.querySelectorAll('.acc details')[sel];
  var sum = det.querySelector('summary');
  var samples = [];
  var t0 = performance.now();
  function tick(){
    samples.push(Math.round(det.offsetHeight));
    if (performance.now() - t0 < ms) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  sum.click();
  return new Promise(function(r){
    setTimeout(function(){
      r(JSON.stringify({
        samples: samples,
        open: det.open,
        closing: det.classList.contains('is-closing'),
        marker: getComputedStyle(sum, '::after').content
      }));
    }, ms + 120);
  });
})`;

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  if (reduced) {
    await s.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  }
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2200);

  const total = (await s.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('.acc details').length", returnByValue: true,
  }, sessionId, 15000)).result.value;

  console.log('accordion — ' + url.replace('http://127.0.0.1:8788', '')
    + (reduced ? '   [prefers-reduced-motion: reduce]' : ''));
  console.log('  .acc details on page : ' + total);
  if (!total) { console.log('\n  NOTHING TO MEASURE — not a pass'); process.exitCode = 2; }
  else {
    // panel 1 starts closed (panel 0 ships open), so this is a genuine expand
    for (const [idx, phase] of [[1, 'EXPAND'], [1, 'COLLAPSE']]) {
      const raw = (await s.send('Runtime.evaluate', {
        expression: SAMPLER + '(' + idx + ', 1000)', returnByValue: true, awaitPromise: true,
      }, sessionId, 30000)).result.value;
      const r = JSON.parse(raw);
      const uniq = [...new Set(r.samples)];
      const first = r.samples[0];
      const last = r.samples[r.samples.length - 1];
      // how long until the height stopped changing
      let settleIdx = r.samples.length - 1;
      while (settleIdx > 0 && r.samples[settleIdx - 1] === last) settleIdx--;
      const ms = Math.round(settleIdx * 16.67);
      console.log('');
      console.log('  ' + phase);
      console.log('    height ' + first + 'px -> ' + last + 'px');
      console.log('    distinct heights sampled : ' + uniq.length);
      console.log('    time to settle           : ~' + ms + 'ms');
      console.log('    details.open afterwards  : ' + r.open + '   marker ' + r.marker);
      const slid = uniq.length > 8;
      if (reduced) {
        console.log('    verdict: ' + (slid ? 'SLID — reduced motion was not honoured' : 'snapped, as reduced motion asks'));
        if (slid) process.exitCode = 1;
      } else {
        console.log('    verdict: ' + (slid ? 'slid through ' + uniq.length + ' heights' : 'SNAPPED — no animation'));
        if (!slid) process.exitCode = 1;
      }
      await sleep(400);
    }
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
