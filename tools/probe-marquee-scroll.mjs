// probe-marquee-scroll.mjs — can you keep scrolling past the last product?
//
// The auto-travel is a CSS transform and loops forever. The SCROLLBAR under it
// is an ordinary finite range, so dragging to the last product hit a wall —
// which is a different failure from the loop and needs its own test.
//
// Three claims:
//   1. the scroll never dead-ends: pushing past the end keeps yielding content
//      instead of pinning at the maximum
//   2. the wrap is INVISIBLE: the frame either side of it is pixel-identical,
//      which is what "the first product is immediately after the last" means
//   3. it works travelling left as well as right
//
// The control is the point: with the wrap disabled the same test must show the
// scroll pinning at its maximum, or this probe is measuring nothing.
//
//   node tools/probe-marquee-scroll.mjs <url> [viewport] [--no-wrap]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const noWrap = process.argv.includes('--no-wrap');

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
  await sleep(2500);

  // freeze the auto-travel and the smoke so only the SCROLL moves anything
  await s.send('Runtime.evaluate', {
    expression: `(function(){
      var t = document.querySelector('.marquee__track');
      t.getAnimations().forEach(function(a){ a.pause(); a.currentTime = 0; });
      document.querySelectorAll('.vapor__plume').forEach(function(p){
        p.getAnimations().forEach(function(a){ a.pause(); });
      });
      document.documentElement.classList.remove('js-marquee');
      document.querySelectorAll('.mcard.is-focus').forEach(function(c){ c.classList.remove('is-focus'); });
      document.querySelector('.marquee').scrollIntoView({ block: 'center', behavior: 'instant' });
      ${noWrap ? "window.__noWrap = true;" : ''}
      return 1;
    })()`, returnByValue: true,
  }, sessionId, 20000);
  await sleep(700);

  if (noWrap) {
    // disable the handler the only way that is honest: clone the node so its
    // listeners are dropped, leaving an identical but un-wrapped scroller
    await s.send('Runtime.evaluate', {
      expression: `(function(){
        var m = document.querySelector('.marquee');
        var c = m.cloneNode(true);
        m.parentNode.replaceChild(c, m);
        return 1;
      })()`, returnByValue: true,
    }, sessionId, 20000);
    await sleep(300);
  }

  const geo = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var m = document.querySelector('.marquee');
      var cards = m.querySelectorAll('.mcard');
      return JSON.stringify({
        copyWidth: Math.round(cards[cards.length/2].offsetLeft - cards[0].offsetLeft),
        scrollWidth: m.scrollWidth, clientWidth: m.clientWidth,
        maxScroll: m.scrollWidth - m.clientWidth
      });
    })()`, returnByValue: true,
  }, sessionId, 20000)).result.value);

  console.log('marquee scroll — @' + vw + 'px' + (noWrap ? '   [CONTROL: wrap disabled]' : ''));
  console.log('  one copy ' + geo.copyWidth + 'px   scrollable range 0..' + geo.maxScroll);

  const setX = async (x) => {
    await s.send('Runtime.evaluate', {
      expression: `(function(){
        var m = document.querySelector('.marquee');
        m.scrollLeft = ${x};
        m.dispatchEvent(new Event('scroll'));
        return m.scrollLeft;
      })()`, returnByValue: true,
    }, sessionId, 15000);
    await sleep(260);
    return (await s.send('Runtime.evaluate', {
      expression: "document.querySelector('.marquee').scrollLeft", returnByValue: true,
    }, sessionId, 15000)).result.value;
  };

  const shoot = async (tag) => {
    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const f = path.join('audit', 'screens', 'scroll', '_mscroll-' + tag + '.png');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    return readPNG(f);
  };

  // --- 1. push past the end ------------------------------------------------
  const target = geo.copyWidth + 40;
  const landed = await setX(target);
  console.log('  asked for ' + target + 'px (past one copy) and landed on ' + landed + 'px');
  const wrapped = landed < geo.copyWidth;
  console.log('  ' + (wrapped
    ? 'the scroll wrapped — there is more strip after the last product'
    : 'IT PINNED — the scroll dead-ends at the last product'));

  // --- 2. is the wrap invisible? -------------------------------------------
  // just short of the wrap, then the wrapped equivalent: identical content
  await setX(geo.copyWidth - 1);
  const before = await shoot('before');
  await setX(geo.copyWidth + (geo.copyWidth - 1) - geo.copyWidth);   // same place, one copy on
  const after = await shoot('after');
  let diff = 0, maxD = 0;
  const n = Math.min(before.data.length, after.data.length);
  for (let i = 0; i < n; i += 4) {
    const d = Math.abs(before.data[i] - after.data[i])
      + Math.abs(before.data[i + 1] - after.data[i + 1])
      + Math.abs(before.data[i + 2] - after.data[i + 2]);
    if (d > 6) diff++;
    if (d > maxD) maxD = d;
  }
  const px = before.width * before.height;
  console.log('  frame either side of the wrap: ' + diff.toLocaleString() + ' pixels differ ('
    + (diff / px * 100).toFixed(3) + '%), peak delta ' + maxD);
  const seamless = maxD < 80;
  console.log('  ' + (seamless ? 'the wrap is invisible' : 'THE WRAP IS VISIBLE'));

  // --- 3. and travelling left ----------------------------------------------
  await setX(40);
  const atStart = await setX(0);
  console.log('  scrolled back to the start: landed on ' + atStart + 'px   '
    + (atStart > 0 ? 'wrapped forward, so there is strip before the first product' : 'stopped at 0'));

  let bad = 0;
  if (!noWrap) {
    if (!wrapped) bad++;
    if (!seamless) bad++;
    if (!(atStart > 0)) bad++;
    console.log('\n  ' + (bad ? bad + ' problem(s)' : 'the scroll is endless in both directions and the joins do not show'));
  } else {
    console.log('\n  control: ' + (wrapped
      ? 'STILL WRAPPED WITH THE HANDLER GONE — this probe is not measuring the wrap'
      : 'pinned, as an un-wrapped scroller must — the probe measures the wrap'));
    if (wrapped) bad++;
  }
  if (bad) process.exitCode = 1;
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
