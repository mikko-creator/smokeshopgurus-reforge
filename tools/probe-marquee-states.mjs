// probe-marquee-states.mjs — the marquee's three behaviours, not just its motion.
//
// probe-marquee covers the loop geometry and the speed. Three things were
// written into the CSS and never measured: that hovering pauses it, that
// reduced motion stops it, and that the strip is genuinely scrollable so every
// product stays reachable. A carousel that cannot be paused or scrolled hides
// most of its contents behind a wait.
//
//   node tools/probe-marquee-states.mjs <url> [viewport]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);

async function open(reduced) {
  const browser = await launch({ headless: true });
  const s = await Session.connect(browser.wsUrl);
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride',
    { width: vw, height: 900, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  if (reduced) {
    await s.send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  }
  await s.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}",
  }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2500);
  return { browser, s, sessionId };
}

const centre = `(function(){
  var m = document.querySelector('.marquee');
  if (!m) return 'null';
  m.scrollIntoView({ block: 'center', behavior: 'instant' });
  var r = m.getBoundingClientRect();
  return JSON.stringify({
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
    scrollW: m.scrollWidth, clientW: m.clientWidth,
    overflowX: getComputedStyle(m).overflowX
  });
})()`;

const playState = `(function(){
  var t = document.querySelector('.marquee__track');
  var a = t.getAnimations()[0];
  return a ? a.playState : 'none';
})()`;

console.log('marquee states — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');
let bad = 0;

// ---- normal motion, and whether hovering pauses it -------------------------
{
  const { browser, s, sessionId } = await open(false);
  try {
    const raw = (await s.send('Runtime.evaluate', { expression: centre, returnByValue: true },
      sessionId, 20000)).result.value;
    if (raw === 'null') { console.log('  .marquee not found'); bad++; }
    else {
      const box = JSON.parse(raw);
      await sleep(400);
      const before = (await s.send('Runtime.evaluate', { expression: playState, returnByValue: true },
        sessionId, 15000)).result.value;

      // Where in the band is there NO card? The track has vertical padding, so
      // just inside the strip's top edge is empty. This matters: the strip is a
      // full-width band hundreds of pixels tall, and pausing on the BAND meant a
      // cursor resting anywhere near it froze the carousel — which reads as a
      // carousel that does not loop at all. Pausing belongs on a deliberate act.
      const empty = JSON.parse((await s.send('Runtime.evaluate', {
        expression: `(function(){
          var m = document.querySelector('.marquee');
          var r = m.getBoundingClientRect();
          var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + 4);
          var el = document.elementFromPoint(x, y);
          return JSON.stringify({ x: x, y: y,
            over: el ? String(el.className || el.tagName) : 'none',
            isCard: !!(el && el.closest && el.closest('.mcard')) });
        })()`, returnByValue: true,
      }, sessionId, 15000)).result.value);

      await s.send('Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: empty.x, y: empty.y, buttons: 0 }, sessionId, 15000);
      await sleep(400);
      const overBand = (await s.send('Runtime.evaluate', { expression: playState, returnByValue: true },
        sessionId, 15000)).result.value;
      console.log('  cursor in the band, off any card (' + empty.over.slice(0, 24)
        + ', isCard ' + empty.isCard + ') : ' + overBand);
      if (!empty.isCard && overBand !== 'running') {
        console.log('  RESTING IN THE BAND STILL FREEZES IT');
        bad++;
      }

      await s.send('Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 }, sessionId, 15000);
      // POLL, do not sleep a fixed interval. Pausing needs a CARD under the
      // pointer, and the gaps between cards pass under it too — at 71px/s a
      // 32px gap sits there for about 0.45s, so a fixed 400ms check can sample
      // the gap and conclude that hovering does not pause. Once a card does
      // arrive it stops dead under the cursor, so the wait is bounded by one
      // gap crossing.
      let during = 'running', waited = 0;
      while (waited < 2000) {
        during = (await s.send('Runtime.evaluate', { expression: playState, returnByValue: true },
          sessionId, 15000)).result.value;
        if (during === 'paused') break;
        await sleep(120);
        waited += 120;
      }
      console.log('  time for a hover to bite : ' + waited + 'ms'
        + (waited > 900 ? '   (a gap was under the cursor)' : ''));
      await s.send('Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: box.x, y: 5, buttons: 0 }, sessionId, 15000);
      await sleep(400);
      const after = (await s.send('Runtime.evaluate', { expression: playState, returnByValue: true },
        sessionId, 15000)).result.value;

      console.log('  play state   : ' + before + ' -> hover ' + during + ' -> away ' + after);
      const ok = before === 'running' && during === 'paused' && after === 'running';
      console.log('  hover pauses : ' + (ok ? 'yes, and it resumes on leaving' : 'NO'));
      if (!ok) bad++;

      console.log('  scroller     : overflow-x ' + box.overflowX
        + ', scrollWidth ' + box.scrollW + ' vs clientWidth ' + box.clientW);
      const scrollable = (box.overflowX === 'auto' || box.overflowX === 'scroll')
        && box.scrollW > box.clientW;
      console.log('  reachable    : ' + (scrollable
        ? 'every product can be scrolled to'
        : 'NOT SCROLLABLE — off-screen products are reachable only by waiting'));
      if (!scrollable) bad++;

      // and prove a scroll actually moves it
      const moved = JSON.parse((await s.send('Runtime.evaluate', {
        expression: `(function(){
          var m = document.querySelector('.marquee');
          var a = m.scrollLeft;
          m.scrollLeft = 300;
          var b = m.scrollLeft;
          m.scrollLeft = a;
          return JSON.stringify({ from: a, to: b });
        })()`, returnByValue: true,
      }, sessionId, 15000)).result.value);
      console.log('  scrollLeft   : ' + moved.from + ' -> ' + moved.to
        + '   ' + (moved.to > moved.from ? 'accepts a scroll' : 'IGNORES A SCROLL'));
      if (!(moved.to > moved.from)) bad++;
    }
  } finally { s.close(); try { browser.proc.kill(); } catch { /* gone */ } }
}

// ---- reduced motion --------------------------------------------------------
{
  const { browser, s, sessionId } = await open(true);
  try {
    const res = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `(function(){
        var t = document.querySelector('.marquee__track');
        var m = document.querySelector('.marquee');
        if (!t || !m) return JSON.stringify({ missing: true });
        var cs = getComputedStyle(t);
        return JSON.stringify({
          animations: t.getAnimations().length,
          animationName: cs.animationName,
          willChange: cs.willChange,
          overflowX: getComputedStyle(m).overflowX,
          scrollW: m.scrollWidth, clientW: m.clientWidth
        });
      })()`, returnByValue: true,
    }, sessionId, 20000)).result.value);

    if (res.missing) { console.log('  reduced motion: marquee not found'); bad++; }
    else {
      console.log('\n  [prefers-reduced-motion: reduce]');
      console.log('    running animations : ' + res.animations + '   animation-name ' + res.animationName);
      console.log('    will-change        : ' + res.willChange);
      const stopped = res.animations === 0 && res.animationName === 'none';
      console.log('    travel stopped     : ' + (stopped ? 'yes' : 'NO — it still moves'));
      if (!stopped) bad++;
      const reachable = (res.overflowX === 'auto' || res.overflowX === 'scroll') && res.scrollW > res.clientW;
      console.log('    still reachable    : ' + (reachable
        ? 'yes, the strip scrolls'
        : 'NO — products are frozen off-screen'));
      if (!reachable) bad++;
      if (res.willChange !== 'auto') {
        console.log('    will-change is still promoting a layer that never animates');
        bad++;
      }
    }
  } finally { s.close(); try { browser.proc.kill(); } catch { /* gone */ } }
}

console.log('\n  ' + (bad ? bad + ' behaviour(s) wrong' : 'pause, scroll and reduced-motion all behave'));
if (bad) process.exitCode = 1;
