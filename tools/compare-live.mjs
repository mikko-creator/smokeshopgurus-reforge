// compare-live.mjs — render two URLs identically and diff the pixels.
//
// "The preview looks different from my local" is a claim about what renders, and
// a byte comparison cannot settle it: the published files can be identical and
// still paint differently, because the host is different — a subdirectory base
// path, a case-sensitive filesystem, a missing MIME type, a resource that 404s
// only there.
//
// So this loads both, freezes everything that animates (or the smoke alone would
// differ between two loads), shoots the same viewport and scroll offset, and
// reports where they diverge. It also records every FAILED request on each side,
// because a 404 that only happens on one host is the usual answer.
//
//   node tools/compare-live.mjs <urlA> <urlB> [--viewport 1440] [--scroll 0]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG, writePNG } = await import('file:///' + SK.split(path.sep).join('/'));

const [, , urlA, urlB] = process.argv;
if (!urlA || !urlB) { console.error('usage: compare-live.mjs <urlA> <urlB> [--viewport n] [--scroll n]'); process.exit(2); }
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const VW = arg('viewport', 1440);
const SCROLL = arg('scroll', 0);

async function shoot(url, tag) {
  const browser = await launch({ headless: true });
  const s = await Session.connect(browser.wsUrl);
  const failures = [];
  try {
    const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
    await s.send('Page.enable', {}, sessionId);
    await s.send('Network.enable', {}, sessionId);
    s.on('Network.responseReceived', (p) => {
      if (p.response && p.response.status >= 400) {
        failures.push(p.response.status + '  ' + p.response.url);
      }
    });
    s.on('Network.loadingFailed', (p) => {
      failures.push('FAILED  ' + (p.errorText || 'unknown'));
    });
    await s.send('Emulation.setDeviceMetricsOverride',
      { width: VW, height: 900, deviceScaleFactor: 1, mobile: VW < 768 }, sessionId);
    await s.send('Page.addScriptToEvaluateOnNewDocument',
      { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
    const loaded = s.once('Page.loadEventFired', 60000).catch(() => null);
    await s.send('Page.navigate', { url }, sessionId, 60000);
    await loaded;
    await sleep(3500);

    if (SCROLL) {
      await s.send('Runtime.evaluate', {
        expression: 'new Promise(function(r){var t=' + SCROLL + ',i=0;function st(){i+=Math.min(400,t-i);window.scrollTo(0,i);if(i<t)setTimeout(st,110);else setTimeout(r,900);}st();})',
        returnByValue: true, awaitPromise: true,
      }, sessionId, 40000);
    }

    // Freeze EVERYTHING that moves and settle every reveal, or the smoke field
    // and the carousel alone would make two loads differ for honest reasons.
    await s.send('Runtime.evaluate', {
      expression: `(function(){
        document.querySelectorAll('[data-reveal]').forEach(function(e){ e.classList.add('is-in'); });
        document.documentElement.classList.remove('js-marquee');
        document.querySelectorAll('.mcard.is-focus').forEach(function(c){ c.classList.remove('is-focus'); });
        var m = document.querySelector('.marquee'); if (m) m.scrollLeft = 0;
        document.getAnimations().forEach(function(a){
          try {
            var t = a.effect && a.effect.getTiming();
            if (t && t.iterations === Infinity) { a.pause(); a.currentTime = 0; }
            else a.finish();
          } catch (e) { try { a.pause(); } catch (e2) {} }
        });
        return 1;
      })()`, returnByValue: true,
    }, sessionId, 30000);
    await sleep(900);

    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const f = path.join('audit', 'screens', 'compare', tag + '.png');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));

    const meta = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        base: (window.__SR_BASE__ || '(unset)'),
        sheets: document.styleSheets.length,
        cssRules: (function(){ var n=0; for (var i=0;i<document.styleSheets.length;i++){ try{ n+=document.styleSheets[i].cssRules.length; }catch(e){ n+=-1; } } return n; })(),
        fonts: document.fonts ? document.fonts.size : -1,
        imgs: document.images.length,
        brokenImgs: Array.prototype.filter.call(document.images, function(i){ return i.complete && i.naturalWidth === 0; }).length,
        scripts: document.scripts.length,
        marquee: !!document.querySelector('.marquee'),
        plumes: document.querySelectorAll('.vapor__plume').length,
        title: document.title
      })`, returnByValue: true,
    }, sessionId, 20000)).result.value);

    return { png: readPNG(f), failures, meta, file: f };
  } finally {
    s.close();
    try { browser.proc.kill(); } catch { /* gone */ }
  }
}

console.log('comparing at ' + VW + 'px' + (SCROLL ? ', scrollY ' + SCROLL : '') + '\n  A: ' + urlA + '\n  B: ' + urlB + '\n');

const a = await shoot(urlA, 'A');
const b = await shoot(urlB, 'B');

const row = (k, x, y) => console.log('  ' + k.padEnd(14) + String(x).padEnd(26) + String(y)
  + (String(x) !== String(y) ? '   <-- DIFFERS' : ''));
console.log('  ' + 'property'.padEnd(14) + 'A'.padEnd(26) + 'B');
for (const k of Object.keys(a.meta)) row(k, a.meta[k], b.meta[k]);

console.log('\n  failed requests on A: ' + a.failures.length);
for (const f of a.failures.slice(0, 10)) console.log('     ' + f);
console.log('  failed requests on B: ' + b.failures.length);
for (const f of b.failures.slice(0, 10)) console.log('     ' + f);

if (a.png.width !== b.png.width || a.png.height !== b.png.height) {
  console.log('\n  DIFFERENT CANVAS SIZES — ' + a.png.width + 'x' + a.png.height
    + ' vs ' + b.png.width + 'x' + b.png.height);
  process.exitCode = 1;
} else {
  let diff = 0, maxD = 0, firstY = -1;
  const W = a.png.width, H = a.png.height;
  const mask = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.abs(a.png.data[i] - b.png.data[i])
        + Math.abs(a.png.data[i + 1] - b.png.data[i + 1])
        + Math.abs(a.png.data[i + 2] - b.png.data[i + 2]);
      const hit = d > 12;
      if (hit) { diff++; if (firstY < 0) firstY = y; }
      if (d > maxD) maxD = d;
      mask.data[i] = hit ? 255 : a.png.data[i] >> 2;
      mask.data[i + 1] = hit ? 0 : a.png.data[i + 1] >> 2;
      mask.data[i + 2] = hit ? 0 : a.png.data[i + 2] >> 2;
      mask.data[i + 3] = 255;
    }
  }
  const px = W * H;
  const out = path.join('audit', 'screens', 'compare', 'diff.png');
  writePNG(out, mask);
  console.log('\n  differing pixels: ' + diff.toLocaleString() + ' of ' + px.toLocaleString()
    + ' (' + (diff / px * 100).toFixed(2) + '%)   peak delta ' + maxD
    + (firstY >= 0 ? '   first at row ' + firstY : ''));
  console.log('  diff map: ' + out + '   (red = differs)');
  console.log('  A: ' + a.file + '   B: ' + b.file);
  console.log('\n  ' + (diff / px < 0.001
    ? 'the two render the same'
    : 'THEY RENDER DIFFERENTLY'));
  if (diff / px >= 0.001) process.exitCode = 1;
}
