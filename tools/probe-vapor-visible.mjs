// probe-vapor-visible.mjs — is the vapour visible AT ALL?
//
// Every earlier vapour probe asked a different question. probe-vapor asked
// "do pixels change over time" (movement). probe-vapor-speed asked "how fast"
// (perceptibility of the motion). Neither asked the first question of all:
// does the field change what the visitor sees, compared with it not being there?
//
// A plume can be running, fast, in-bounds and still invisible — because opaque
// content is painted over it, or because the page background it sits on is the
// same brightness as the plume. The only test for that is to render the page
// with the field and without it, and count the pixels that differ.
//
// It reports coverage per scroll offset AND the strongest single difference, so
// "faintly visible in a corner" and "clearly visible" do not read the same.
//
//   node tools/probe-vapor-visible.mjs <url> [width] [height] [scrollList]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const vh = Number(process.argv[4] || 900);
const offsets = (process.argv[5] || '0,900,1800,2700,3600').split(',').map(Number);

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
  await sleep(2500);
  await s.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});"
      + "var st=document.createElement('style'); st.id='sr-vis'; document.head.appendChild(st);"
      // freeze the drift so the ONLY difference between the two shots is the
      // field's presence, not the time that passed between them
      + "document.querySelectorAll('.vapor__plume').forEach(function(p){p.getAnimations().forEach(function(a){a.pause();});});",
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(500);

  const shoot = async (tag) => {
    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const f = path.join('audit', 'screens', 'scroll', '_vis-' + tag + '.png');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    return readPNG(f);
  };
  const setHidden = async (hide) => {
    await s.send('Runtime.evaluate', {
      expression: "document.getElementById('sr-vis').textContent = "
        + (hide ? "'.vapor,.hero__vapor{display:none!important}'" : "''") + "; 1",
      returnByValue: true,
    }, sessionId, 15000);
    await sleep(350);
  };

  console.log('vapour visibility — ' + url.replace('http://127.0.0.1:8788', '')
    + ' @' + vw + 'x' + vh);
  console.log('  same frame with the field on and off; only its presence differs');

  let anyVisible = false;
  for (const y of offsets) {
    await s.send('Runtime.evaluate', {
      expression: 'window.scrollTo(0, ' + y + '); 1', returnByValue: true,
    }, sessionId, 20000);
    await sleep(700);

    await setHidden(false);
    const on = await shoot('on');
    await setHidden(true);
    const off = await shoot('off');
    await setHidden(false);

    let diff = 0, maxD = 0, sum = 0;
    const n = Math.min(on.data.length, off.data.length);
    for (let i = 0; i < n; i += 4) {
      const d = Math.abs(on.data[i] - off.data[i])
        + Math.abs(on.data[i + 1] - off.data[i + 1])
        + Math.abs(on.data[i + 2] - off.data[i + 2]);
      if (d > 3) { diff++; sum += d; }
      if (d > maxD) maxD = d;
    }
    const px = on.width * on.height;
    const pct = (diff / px * 100);
    const mean = diff ? (sum / diff).toFixed(1) : '0';
    // Coverage and intensity are different things, and the first version of
    // this rule only understood coverage. That was written for a broad gradient
    // haze, which covers a lot of pixels weakly. Real smoke is the opposite: a
    // thin wisp can change under 1% of the frame while changing those pixels by
    // 400+, and the eye sees it clearly. So a region counts as visible if it is
    // broad-and-faint OR narrow-and-strong, and both numbers are printed so the
    // reader can disagree with the rule.
    const broad = pct >= 1 && maxD >= 8;
    const strong = pct >= 0.25 && maxD >= 60;
    const verdict = broad ? 'visible (broad)'
      : (strong ? 'visible (thin, strong)' : 'INVISIBLE');
    if (broad || strong) anyVisible = true;
    console.log('  scrollY ' + String(y).padStart(5)
      + '   ' + pct.toFixed(1).padStart(5) + '% of pixels differ'
      + '   peak delta ' + String(maxD).padStart(3)
      + '   mean delta ' + String(mean).padStart(5)
      + '   ' + verdict);
  }

  console.log('\n  ' + (anyVisible
    ? 'the field is visible somewhere on this page'
    : 'THE FIELD IS NOT VISIBLE ANYWHERE ON THIS PAGE'));
  if (!anyVisible) process.exitCode = 1;
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
