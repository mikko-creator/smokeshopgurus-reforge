// probe-section-height.mjs — how much scrolling does a section cost?
//
// "Too long a scroll on mobile" is a measurable claim: the section's height as a
// multiple of the viewport is exactly how many screens a visitor must swipe past.
//
//   node tools/probe-section-height.mjs <url> <viewport> <height>
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
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const l = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await l; await sleep(2500);
  const r = JSON.parse((await s.send('Runtime.evaluate', { expression: `(function(){
    document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});
    var out = [];
    document.querySelectorAll('main section').forEach(function(sec){
      var k = sec.querySelector('.sec__kicker');
      var t = sec.querySelector('.sec__title');
      var r = sec.getBoundingClientRect();
      var grid = sec.querySelector('.grid');
      out.push({
        name: (t ? t.textContent : (k ? k.textContent : sec.className)).trim().slice(0, 26),
        h: Math.round(r.height),
        screens: +(r.height / innerHeight).toFixed(2),
        grid: grid ? getComputedStyle(grid).display : null,
        cards: sec.querySelectorAll('.pcard').length,
        scrollX: grid ? (grid.scrollWidth > grid.clientWidth) : false
      });
    });
    return JSON.stringify({ vh: innerHeight, docH: document.documentElement.scrollHeight, rows: out });
  })()`, returnByValue: true }, sessionId, 25000)).result.value);
  console.log('section heights — @' + vw + 'x' + r.vh + '   document ' + r.docH + 'px ('
    + (r.docH / r.vh).toFixed(1) + ' screens)');
  for (const x of r.rows) {
    console.log('  ' + x.name.padEnd(28) + String(x.h).padStart(6) + 'px  '
      + String(x.screens).padStart(5) + ' screens'
      + (x.cards ? '   ' + x.cards + ' cards' : '')
      + (x.grid ? '   grid: ' + x.grid : '')
      + (x.scrollX ? '   scrolls-x' : ''));
  }
} finally { s.close(); try { browser.proc.kill(); } catch {} }
