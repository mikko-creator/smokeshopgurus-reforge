// probe-vapor-bounds.mjs — does any plume EVER poke past the viewport?
//
// The responsive sweep measures rects at one instant, so it can only ever catch
// whichever plume happens to be at its widest right then. Arithmetic in a
// comment is not proof either. This steps every plume's animation through a
// full cycle and records the extreme rect, so the answer covers every frame the
// visitor could land on rather than the one the sweep sampled.
//
//   node tools/probe-vapor-bounds.mjs <url> [viewport] [steps]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const steps = Number(process.argv[4] || 60);

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
  await sleep(2200);

  const res = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var plumes = Array.prototype.slice.call(document.querySelectorAll('.vapor__plume, .hero__puff'));
      if (!plumes.length) return JSON.stringify({ none: true });
      var out = [];
      plumes.forEach(function(p, i){
        var a = p.getAnimations()[0];
        if (!a) { out.push({ i: i + 1, noAnim: true }); return; }
        var dur = a.effect.getTiming().duration;   // ms
        a.pause();
        var maxRight = -Infinity, minLeft = Infinity, atRight = 0, maxW = 0;
        for (var k = 0; k <= ${steps}; k++) {
          a.currentTime = dur * k / ${steps};
          var r = p.getBoundingClientRect();
          if (r.right > maxRight) { maxRight = r.right; atRight = k / ${steps}; }
          if (r.left < minLeft) minLeft = r.left;
          if (r.width > maxW) maxW = r.width;
        }
        a.play();
        out.push({ i: i + 1, maxRight: Math.round(maxRight), minLeft: Math.round(minLeft),
                   maxW: Math.round(maxW), atRight: Math.round(atRight * 100) });
      });
      return JSON.stringify({ vw: innerWidth, plumes: out,
        docW: document.documentElement.scrollWidth });
    })()`, returnByValue: true,
  }, sessionId, 40000)).result.value);

  if (res.none) { console.log('no plumes found'); process.exitCode = 2; }
  else {
    console.log('vapour bounds over a full cycle — @' + res.vw + 'px, ' + steps + ' steps per plume');
    let over = 0;
    for (const p of res.plumes) {
      if (p.noAnim) { console.log('  plume ' + p.i + '  no animation'); continue; }
      const bad = p.maxRight > res.vw;
      if (bad) over++;
      console.log('  plume ' + p.i
        + '  widest right edge ' + String(p.maxRight).padStart(5) + 'px'
        + '  (at ' + String(p.atRight).padStart(3) + '% of cycle)'
        + '   left ' + String(p.minLeft).padStart(6) + 'px'
        + '   ' + (bad ? 'PAST THE VIEWPORT by ' + (p.maxRight - res.vw) + 'px' : 'inside'));
    }
    console.log('  document scrollWidth: ' + res.docW + ' vs viewport ' + res.vw
      + '   ' + (res.docW <= res.vw ? '(no horizontal scroll)' : '(SCROLLS)'));
    console.log('\n  ' + (over === 0
      ? 'every plume stays inside the viewport at every point of its cycle'
      : over + ' plume(s) exceed the viewport at some phase'));
    if (over) process.exitCode = 1;
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
