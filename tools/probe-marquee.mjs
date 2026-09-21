// probe-marquee.mjs — is the infinite loop actually seamless, and how fast?
//
// A CSS marquee loops by translating a doubled track exactly -50%. That only
// lands on the second copy's first item if the track's width is an exact
// multiple of the item pitch. Use `gap` and it is not: 14 items have 13 gaps,
// so the track is 14C + 13G wide and -50% stops half a gap short — the strip
// jumps by that much on every cycle, forever.
//
// Three checks:
//   1. GEOMETRY — the second copy's first card must start at exactly half the
//      track width, to within a pixel
//   2. SEAM — the rendered frame at progress 0 and at progress 1 must be
//      IDENTICAL. This is the decisive one: it catches any cause of a jump,
//      including ones this probe's arithmetic does not model
//   3. SPEED — px/s, because a carousel nobody can read is not a carousel
//
//   node tools/probe-marquee.mjs <url> [viewport]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);

// a strip that crawls is ignored; one that races cannot be read or clicked
const FLOOR = 15;
const CEIL = 140;

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

  const geo = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var track = document.querySelector('.marquee__track');
      if (!track) return JSON.stringify({ missing: true });
      var cards = track.querySelectorAll('.mcard');
      var a = track.getAnimations()[0];
      if (a) a.pause(), a.currentTime = 0;
      var t = track.getBoundingClientRect();
      var first = cards[0].getBoundingClientRect();
      var half = cards[cards.length / 2].getBoundingClientRect();
      return JSON.stringify({
        cards: cards.length,
        trackW: Math.round(t.width),
        firstLeft: Math.round(first.left),
        secondCopyLeft: Math.round(half.left),
        pitch: Math.round(half.left - first.left),
        dur: a ? a.effect.getTiming().duration : null,
        marqueeW: Math.round(document.querySelector('.marquee').getBoundingClientRect().width)
      });
    })()`, returnByValue: true,
  }, sessionId, 25000)).result.value);

  console.log('marquee — @' + vw + 'px');
  if (geo.missing) { console.log('  .marquee__track NOT FOUND'); process.exitCode = 2; }
  else {
    const half = geo.trackW / 2;
    const drift = Math.abs(geo.pitch - half);
    console.log('  cards ' + geo.cards + '   track ' + geo.trackW + 'px   viewport strip ' + geo.marqueeW + 'px');
    console.log('  second copy starts at ' + geo.pitch + 'px, half the track is ' + half + 'px'
      + '   -> drift per cycle ' + drift.toFixed(1) + 'px   '
      + (drift <= 1 ? 'geometry is exact' : 'GEOMETRY IS OFF — it will jump'));
    if (drift > 1) process.exitCode = 1;

    // --- the decisive check: do the first and last frames match? ------------
    const shoot = async (progress, tag) => {
      await s.send('Runtime.evaluate', {
        expression: `(function(){
          var t = document.querySelector('.marquee__track');
          var a = t.getAnimations()[0];
          a.pause();
          var dur = a.effect.getTiming().duration;
          /* NOT currentTime === duration. animation-fill-mode is none, so at
             exactly the end the effect is past its active interval and the
             transform snaps back to the base value — which is the progress-0
             frame. Comparing those two compares frame 0 with itself, and this
             check reported "no seam" on a build with a deliberate 16px jump.
             One millisecond inside the interval is the last real frame. */
          a.currentTime = ${progress} >= 1 ? dur - 1 : ${progress} * dur;
          return 1;
        })()`, returnByValue: true,
      }, sessionId, 15000);
      await sleep(300);
      const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
      const f = path.join('audit', 'screens', 'scroll', '_marq-' + tag + '.png');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      return readPNG(f);
    };
    // Freeze or remove everything else that can differ between the two frames.
    // The vapour drifts. And the centre highlight scales and glows a DIFFERENT
    // card at each end of the cycle, which put 467 differing pixels with a peak
    // delta of 253 into a track whose geometry was provably exact — this check
    // is about the track's translation, so the highlight has to be out of shot.
    await s.send('Runtime.evaluate', {
      expression: "document.querySelectorAll('.vapor__plume').forEach(function(p){"
        + "p.getAnimations().forEach(function(a){a.pause();});});"
        + "document.documentElement.classList.remove('js-marquee');"
        + "document.querySelectorAll('.mcard.is-focus').forEach(function(c){c.classList.remove('is-focus');});1",
      returnByValue: true,
    }, sessionId, 15000);
    await sleep(700);   // let the scale transition unwind before the first shot

    // SCROLL IT INTO SHOT. Without this the capture is the top of the page, and
    // at >=768px the strip sits below the fold — so the two frames contained no
    // marquee at all and "0 pixels differ" meant "nothing was compared". The
    // control proved it: a deliberately broken loop passed at 1440 and failed at
    // 390, purely because only the phone viewport had the strip on screen.
    const inShot = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `(function(){
        var m = document.querySelector('.marquee');
        m.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = m.getBoundingClientRect();
        var visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        return JSON.stringify({ visible: Math.round(visible), height: Math.round(r.height) });
      })()`, returnByValue: true,
    }, sessionId, 15000)).result.value);
    await sleep(500);
    if (inShot.visible < inShot.height * 0.5) {
      console.log('  THE STRIP IS NOT IN SHOT (' + inShot.visible + ' of ' + inShot.height
        + 'px) — the frame comparison would compare nothing');
      process.exitCode = 2;
    }

    const start = await shoot(0, 'start');
    const end = await shoot(1, 'end');
    let diff = 0, maxD = 0;
    const n = Math.min(start.data.length, end.data.length);
    for (let i = 0; i < n; i += 4) {
      const d = Math.abs(start.data[i] - end.data[i])
        + Math.abs(start.data[i + 1] - end.data[i + 1])
        + Math.abs(start.data[i + 2] - end.data[i + 2]);
      if (d > 6) diff++;
      if (d > maxD) maxD = d;
    }
    const px = start.width * start.height;
    const pct = (diff / px * 100);
    console.log('  frame at progress 0 vs progress 1: ' + diff.toLocaleString() + ' pixels differ ('
      + pct.toFixed(3) + '%), peak delta ' + maxD);
    // PEAK delta decides, not the percentage. A real seam slides content and
    // produces enormous per-pixel differences — the deliberate 16px jump
    // measured 731. Subpixel antialiasing along the mask edge measures ~20, and
    // on a 390px viewport those few hundred pixels are a larger SHARE of the
    // frame than the same antialiasing is at 1440, so a percentage-only rule
    // called three viewports broken while the geometry was provably exact.
    const seam = maxD >= 80 && pct >= 0.02;
    console.log('  ' + (seam
      ? 'THE LOOP JUMPS at the wrap'
      : 'the loop closes on itself — no visible seam (residual is edge antialiasing)'));
    if (seam) process.exitCode = 1;

    // --- speed --------------------------------------------------------------
    // Resume from a quarter of the way in, not from wherever the seam check
    // left it. Playing on from `duration - 1ms` wraps on the very next frame,
    // and the sample then straddles the reset — which reported 1255 px/s
    // travelling RIGHT on a strip that moves left at 34.
    await s.send('Runtime.evaluate', {
      expression: `(function(){
        var a = document.querySelector('.marquee__track').getAnimations()[0];
        a.currentTime = a.effect.getTiming().duration * 0.25;
        a.play();
        return 1;
      })()`, returnByValue: true,
    }, sessionId, 15000);
    await sleep(400);
    const speed = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `(function(){
        var c = document.querySelector('.mcard');
        var t0 = performance.now(), x0 = c.getBoundingClientRect().left;
        return new Promise(function(done){
          setTimeout(function(){
            var dt = (performance.now() - t0) / 1000;
            var dx = c.getBoundingClientRect().left - x0;
            done(JSON.stringify({ px: Math.round(Math.abs(dx) / dt), dir: dx < 0 ? 'left' : 'right' }));
          }, 1200);
        });
      })()`, returnByValue: true, awaitPromise: true,
    }, sessionId, 30000)).result.value);
    const ok = speed.px >= FLOOR && speed.px <= CEIL;
    console.log('  travel: ' + speed.px + ' px/s ' + speed.dir + '   band ' + FLOOR + '-' + CEIL
      + '   ' + (ok ? 'readable' : (speed.px < FLOOR ? 'TOO SLOW' : 'TOO FAST TO READ')));
    if (!ok) process.exitCode = 1;
    if (speed.dir !== 'left') { console.log('  IT IS TRAVELLING THE WRONG WAY'); process.exitCode = 1; }
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
