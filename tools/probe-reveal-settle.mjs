// probe-reveal-settle.mjs — a reveal measured mid-transition is not a hidden
// element. The cards carry a --i stagger, so the last ones to enter are still
// ramping when a probe reads opacity the instant scrolling stops.
//
// This scrolls to the bottom, WAITS for every running transition on a
// [data-reveal] to finish, and only then counts what is still not fully opaque.
// Anything that remains at opacity < 1 after the animations have settled is a
// real defect rather than a timing artifact.
//
//   node tools/probe-reveal-settle.mjs <url> [viewport]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/collections/all/';
const vw = Number(process.argv[3] || 1440);

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

  // walk the whole document so every observer fires
  await s.send('Runtime.evaluate', {
    expression: `new Promise(function(done){
      var y = 0;
      function step(){
        y += 600;
        window.scrollTo(0, y);
        if (y < document.documentElement.scrollHeight) setTimeout(step, 120);
        else setTimeout(done, 400);
      }
      step();
    })`, returnByValue: true, awaitPromise: true,
  }, sessionId, 120000);

  // wait for the staggered transitions to actually finish
  const settled = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
      var anims = [];
      els.forEach(function(e){
        try { anims = anims.concat(e.getAnimations({ subtree: true })); } catch (err) {}
      });
      return Promise.all(anims.map(function(a){ return a.finished.catch(function(){}); }))
        .then(function(){
          return new Promise(function(r){ setTimeout(r, 600); });
        })
        .then(function(){
          var hidden = els.filter(function(e){
            var cs = getComputedStyle(e);
            return parseFloat(cs.opacity) < 0.99;
          });
          return JSON.stringify({
            total: els.length,
            isIn: els.filter(function(e){ return e.classList.contains('is-in'); }).length,
            pendingAnims: anims.length,
            hidden: hidden.slice(0, 10).map(function(e){
              var cs = getComputedStyle(e);
              return { cls: e.className, op: cs.opacity, tf: cs.transform,
                       y: Math.round(e.getBoundingClientRect().top + window.scrollY) };
            }),
            hiddenCount: hidden.length,
          });
        });
    })()`, returnByValue: true, awaitPromise: true,
  }, sessionId, 90000)).result.value);

  console.log('reveal settle — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');
  console.log('  [data-reveal]        : ' + settled.total);
  console.log('  carrying .is-in      : ' + settled.isIn);
  console.log('  transitions awaited  : ' + settled.pendingAnims);
  console.log('  still opacity < 0.99 : ' + settled.hiddenCount);
  for (const h of settled.hidden) {
    console.log('     ' + h.cls.slice(0, 40).padEnd(40) + ' op=' + h.op + '  @y=' + h.y + '  ' + h.tf.slice(0, 30));
  }
  if (settled.total === 0) { console.log('\n  NOTHING TO MEASURE — not a pass'); process.exitCode = 2; }
  else if (settled.isIn !== settled.total) {
    console.log('\n  ' + (settled.total - settled.isIn) + ' never revealed');
    process.exitCode = 1;
  } else if (settled.hiddenCount) {
    console.log('\n  ' + settled.hiddenCount + ' revealed but STILL not opaque after settling — real defect');
    process.exitCode = 1;
  } else {
    console.log('\n  all ' + settled.total + ' revealed and fully opaque once transitions settled');
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
