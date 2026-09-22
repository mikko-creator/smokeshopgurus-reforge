// shot-rail.mjs — look at the mobile rail, at rest and part-scrolled.
//
// Every number the rail probe reports can be right while the thing still looks
// wrong, so this writes the frames a person has to actually judge: the strip as
// it first appears, one card along, and at the far end.
//
//   node tools/shot-rail.mjs [url] [viewport]

import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 390);
const vh = Number(process.argv[4] || 844);

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride',
    { width: vw, height: vh, deviceScaleFactor: 2, mobile: true }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument',
    { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 60000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 60000);
  await loaded;
  await sleep(2200);

  await s.send('Runtime.evaluate', {
    expression: `new Promise(function(r){
      var secs = Array.prototype.slice.call(document.querySelectorAll('main section'));
      var sec = secs.filter(function(x){ var t=x.querySelector('.sec__title'); return t && /Latest/.test(t.textContent); })[0];
      var target = sec.getBoundingClientRect().top + window.scrollY - 24;
      var y = 0, step = Math.round(innerHeight * 0.75);
      (function go(){
        window.scrollTo(0, Math.min(y, target));
        if (y >= target) { setTimeout(r, 1400); return; }
        y += step; setTimeout(go, 110);
      })();
    })`, returnByValue: true, awaitPromise: true,
  }, sessionId, 60000);

  // stop the smoke so three frames of the same strip differ only by scroll
  await s.send('Runtime.evaluate', {
    expression: `document.getAnimations().forEach(function(a){ try{
      var t=a.effect&&a.effect.getTiming();
      if(t&&t.iterations===Infinity){a.pause();a.currentTime=0;} else a.finish(); }catch(e){} }); 1`,
    returnByValue: true,
  }, sessionId, 20000);

  const dir = path.join('audit', 'screens', 'rail');
  fs.mkdirSync(dir, { recursive: true });
  const stops = [['start', 0], ['one-along', 1], ['end', -1]];
  for (const [name, which] of stops) {
    await s.send('Runtime.evaluate', {
      expression: `(function(){
        var g = document.querySelector('.grid--rail');
        var cards = Array.prototype.slice.call(g.querySelectorAll('.pcard'));
        var max = g.scrollWidth - g.clientWidth;
        g.scrollLeft = ${which} < 0 ? max
          : Math.min(max, Math.round(cards[${which}].offsetLeft - cards[0].offsetLeft));
        return g.scrollLeft;
      })()`, returnByValue: true,
    }, sessionId, 20000);
    await sleep(800);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const f = path.join(dir, vw + '-' + name + '.png');
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log('  ' + f);
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
