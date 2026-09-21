// probe-masthead.mjs — what does the sticky header cost, as a share of the screen?
//
// A sticky header is permanently subtracted from the reading area, so its height
// matters far more on a phone than on a desktop. This reports each band's height
// and what fraction of the viewport the whole thing occupies, plus how many rows
// each band has wrapped onto — which is usually the reason it is too tall.
//
//   node tools/probe-masthead.mjs <url> [viewport] [height]

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
    { width: vw, height: vh, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2200);

  const r = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      function m(sel){
        var e = document.querySelector(sel);
        if (!e) return null;
        var b = e.getBoundingClientRect();
        var cs = getComputedStyle(e);
        // how many text rows has this band wrapped onto?
        var rows = 0;
        var rg = document.createRange();
        rg.selectNodeContents(e);
        var rects = Array.prototype.slice.call(rg.getClientRects())
          .filter(function(q){ return q.height > 4; });
        var tops = {};
        rects.forEach(function(q){ tops[Math.round(q.top / 6)] = 1; });
        rows = Object.keys(tops).length;
        return { h: Math.round(b.height), pos: cs.position, rows: rows,
                 pad: cs.paddingTop + '/' + cs.paddingBottom };
      }
      return JSON.stringify({
        vw: innerWidth, vh: innerHeight,
        masthead: m('.masthead'),
        strip: m('.masthead__strip'),
        bar: m('.masthead__bar'),
        stripText: (function(){
          var e = document.querySelector('.masthead__strip');
          return e ? e.textContent.replace(/\\s+/g,' ').trim().slice(0, 90) : '';
        })()
      });
    })()`, returnByValue: true,
  }, sessionId, 25000)).result.value);

  console.log('masthead — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + r.vw + 'x' + r.vh);
  if (!r.masthead) { console.log('  .masthead not found'); process.exitCode = 2; }
  else {
    const pct = (r.masthead.h / r.vh * 100).toFixed(1);
    console.log('  masthead   ' + String(r.masthead.h).padStart(4) + 'px   position ' + r.masthead.pos
      + '   = ' + pct + '% of the viewport, permanently');
    if (r.strip) console.log('  strip      ' + String(r.strip.h).padStart(4) + 'px   '
      + r.strip.rows + ' text row(s)   padding ' + r.strip.pad);
    if (r.bar) console.log('  bar        ' + String(r.bar.h).padStart(4) + 'px   '
      + r.bar.rows + ' row(s)   padding ' + r.bar.pad);
    console.log('  strip text: "' + r.stripText + '"');
    console.log('\n  reading area left: ' + (r.vh - r.masthead.h) + 'px of ' + r.vh + 'px');
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
