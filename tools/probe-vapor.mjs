// probe-vapor.mjs — is the vapour field actually there, actually moving, and
// actually harmless?
//
// Four separate claims, each measured rather than assumed:
//   1. it exists, is fixed, sits at z-index -1 and eats no clicks
//   2. every plume has a RUNNING animation (a paused one still reports as an
//      animation, and a mistyped animation-name reports as nothing at all)
//   3. it changes real pixels over time — two screenshots seconds apart,
//      differing-pixel count between them
//   4. it is BEHIND the content: hit-testing over a card must not find a plume
//
// --reduced is the control for (3). The same diff, with the motion preference
// on, must come back at ~0: that proves the differing pixels are the animation
// and not JPEG noise, a lazy image, or a reveal that had not settled.
//
//   node tools/probe-vapor.mjs <url> [scrollY] [--reduced]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const scrollY = Number(process.argv[3] || 0);
const reduced = process.argv.includes('--reduced');

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
  await sleep(2500);

  if (scrollY) {
    await s.send('Runtime.evaluate', {
      expression: 'new Promise(function(r){var t=' + scrollY + ',i=0;function st(){i+=Math.min(400,t-i);window.scrollTo(0,i);if(i<t)setTimeout(st,110);else setTimeout(r,900);}st();})',
      returnByValue: true, awaitPromise: true,
    }, sessionId, 40000);
  }
  // let every reveal finish so the only thing still moving is the vapour
  await s.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});",
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(1400);

  const info = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var v = document.querySelector('.vapor');
      if (!v) return JSON.stringify({ missing: true });
      var cs = getComputedStyle(v);
      var plumes = Array.prototype.slice.call(document.querySelectorAll('.vapor__plume'));
      var anims = plumes.map(function(p){
        var a = p.getAnimations()[0];
        var pcs = getComputedStyle(p);
        return { name: a ? a.animationName : null, state: a ? a.playState : 'none',
                 bg: pcs.backgroundImage.slice(0, 26), opacity: pcs.opacity,
                 transform: pcs.transform.slice(0, 34) };
      });
      // what is painted where a product card or body copy sits
      var probe = document.querySelector('.pcard') || document.querySelector('main');
      var hit = null;
      if (probe) {
        var r = probe.getBoundingClientRect();
        var y = Math.min(innerHeight - 2, Math.max(2, Math.round(r.top + r.height / 2)));
        var e = document.elementFromPoint(Math.round(r.left + r.width / 2), y);
        hit = e ? (e.tagName + '.' + (typeof e.className === 'string' ? e.className : '').trim().split(/\\s+/)[0]) : 'none';
      }
      return JSON.stringify({
        position: cs.position, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents,
        overflow: cs.overflow, contain: cs.contain,
        w: Math.round(v.getBoundingClientRect().width), h: Math.round(v.getBoundingClientRect().height),
        plumes: anims, hitOverContent: hit
      });
    })()`, returnByValue: true,
  }, sessionId, 25000)).result.value);

  console.log('vapour field — ' + url.replace('http://127.0.0.1:8788', '')
    + (scrollY ? ' scrollY ' + scrollY : '') + (reduced ? '   [reduced motion]' : ''));
  if (info.missing) { console.log('  .vapor NOT FOUND'); process.exitCode = 2; }
  else {
    console.log('  position ' + info.position + '   z-index ' + info.zIndex
      + '   pointer-events ' + info.pointerEvents + '   ' + info.w + 'x' + info.h);
    console.log('  contain: ' + info.contain + '   overflow: ' + info.overflow);
    let running = 0;
    info.plumes.forEach((p, i) => {
      if (p.state === 'running') running++;
      console.log('    plume ' + (i + 1) + '  ' + String(p.name).padEnd(17) + p.state.padEnd(9)
        + ' opacity ' + Number(p.opacity).toFixed(3) + '   ' + p.bg);
    });
    console.log('  running animations: ' + running + ' of ' + info.plumes.length);
    console.log('  painted over a card: ' + info.hitOverContent
      + (/vapor/.test(String(info.hitOverContent)) ? '   <-- THE FIELD IS IN FRONT OF CONTENT' : '   (content, not the field)'));
    if (/vapor/.test(String(info.hitOverContent))) process.exitCode = 1;
    if (!reduced && running !== info.plumes.length) {
      console.log('  NOT EVERY PLUME IS RUNNING');
      process.exitCode = 1;
    }
    if (reduced && running !== 0) {
      console.log('  PLUMES STILL RUNNING UNDER REDUCED MOTION');
      process.exitCode = 1;
    }
  }

  // --- does it change pixels? -------------------------------------------
  const shoot = async (tag) => {
    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const f = path.join('audit', 'screens', 'scroll', '_vapor-' + tag + '.png');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    return readPNG(f);
  };
  const a = await shoot('t0');
  await sleep(5000);
  const b = await shoot('t1');

  let diff = 0, maxDelta = 0;
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 6) diff++;
    if (d > maxDelta) maxDelta = d;
  }
  const px = a.width * a.height;
  const pct = (diff / px * 100).toFixed(2);
  console.log('\n  pixels changed over 5s : ' + diff.toLocaleString() + ' of ' + px.toLocaleString()
    + '  (' + pct + '%)   peak channel delta ' + maxDelta);
  if (reduced) {
    console.log('  control: ' + (diff < px * 0.002
      ? 'still, as reduced motion asks — so the movement above is the animation'
      : 'STILL MOVING under reduced motion'));
    if (diff >= px * 0.002) process.exitCode = 1;
  } else {
    console.log('  ' + (diff > px * 0.01
      ? 'the field is genuinely drifting'
      : 'BARELY MOVING — the effect is not visible in the pixels'));
    if (diff <= px * 0.01) process.exitCode = 1;
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
