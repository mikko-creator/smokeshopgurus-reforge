// lock-view.mjs — freeze a rendering, then prove a later build did not disturb it.
//
// "Lock in the desktop view" is only a promise until something can contradict
// it. This captures the WHOLE page at a set of widths, and a second run
// compares the two sets pixel by pixel. A change that was meant to be
// mobile-only either shows zero differing pixels at every desktop width or it
// was not mobile-only.
//
//   node tools/lock-view.mjs save <tag> [--widths 1440,1280,1024,768] [--url ...]
//   node tools/lock-view.mjs diff <tagA> <tagB>
//
// THREE THINGS THIS GOT WRONG FIRST, each caught by a control run rather than
// by inspection, and each fixed rather than tolerated:
//
// 1. The Best Seller strip re-applies .is-focus from a requestAnimationFrame
//    loop. Removing the class does nothing — it is back on the next frame, on
//    whichever card is nearest the middle — so two captures of an UNCHANGED
//    build differed by 322,812 pixels. Every focus rule is scoped to
//    html.js-marquee; dropping that class makes the loop's writes inert.
//
// 2. Forcing [data-reveal].is-in STARTS a transition: 0.55s plus a stagger of
//    up to 8 x 55ms, so cards revealed by the freeze itself were still moving
//    for up to 990ms after it. Waiting longer is a guess; the freeze now turns
//    transitions off outright and pins the revealed state with !important.
//
// 3. The category tiles carry their photograph as a CSS background-image, so
//    they are not in document.images and "0 broken images" said nothing about
//    them. One run captured them rendered and the next captured them empty.
//    Every url() the page actually uses is now fetched and decoded first.
//
// AND ONE ABOUT THE SCREENSHOT ITSELF. Page.captureScreenshot with
// captureBeyondViewport rasterises the whole document onto one surface, and on
// this page — 17 backdrop-filter elements and 8 mix-blend-mode images — that
// path reported differences that are not in the rendering: 14,290 pixels along
// card edges between two builds whose Latest Products grid measured identical
// to three decimal places in every box. The same two builds, screenshotted the
// ordinary way at the same scroll offset, differed by 6 pixels of photographic
// dither. So the page is captured here as a column of ORDINARY viewport
// screenshots, stitched. The sticky masthead is hidden from the second slice
// on: it is compared in the first one, where it belongs, instead of being
// pasted over the content of every band beneath it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG, writePNG } = await import('file:///' + SK.split(path.sep).join('/'));

const mode = process.argv[2];
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const DIR = (tag) => path.join('audit', 'screens', 'lock', tag);
const URL_ = arg('url', 'http://127.0.0.1:8788/');
const SLICE = Number(arg('slice', 900));

const FREEZE = `(function(){
  var st = document.getElementById('sr-lock-freeze') || document.createElement('style');
  st.id = 'sr-lock-freeze';
  st.textContent =
    'html{scroll-behavior:auto!important}' +
    '*,*::before,*::after{transition:none!important;animation-play-state:paused!important}' +
    '[data-reveal]{opacity:1!important;transform:none!important;will-change:auto!important}';
  document.head.appendChild(st);

  document.querySelectorAll('[data-reveal]').forEach(function(e){ e.classList.add('is-in'); });
  document.documentElement.classList.remove('js-marquee');
  var m = document.querySelector('.marquee'); if (m) m.scrollLeft = 0;
  document.querySelectorAll('.mcard.is-focus').forEach(function(c){ c.classList.remove('is-focus'); });
  document.querySelectorAll('.grid--rail').forEach(function(r){ r.scrollLeft = 0; });

  void document.body.offsetHeight;   // commit the style change before reading animations

  document.getAnimations().forEach(function(a){
    try {
      var t = a.effect && a.effect.getTiming();
      if (t && t.iterations === Infinity) { a.pause(); a.currentTime = 0; }
      else a.finish();
    } catch (e) { try { a.pause(); } catch (e2) {} }
  });
  return document.documentElement.scrollHeight;
})()`;

async function capture(width, file) {
  const browser = await launch({ headless: true });
  const s = await Session.connect(browser.wsUrl);
  try {
    const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
    await s.send('Page.enable', {}, sessionId);
    await s.send('Emulation.setDeviceMetricsOverride',
      { width, height: SLICE, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
    await s.send('Page.addScriptToEvaluateOnNewDocument',
      { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
    const loaded = s.once('Page.loadEventFired', 60000).catch(() => null);
    await s.send('Page.navigate', { url: URL_ }, sessionId, 60000);
    await loaded;
    await sleep(2200);

    // walk the page so every lazy image commits, then come back to the top
    await s.send('Runtime.evaluate', {
      expression: `new Promise(function(r){
        var y = 0, step = Math.round(innerHeight * 0.8);
        function go(){
          window.scrollTo(0, y);
          if (y >= document.documentElement.scrollHeight) { window.scrollTo(0,0); setTimeout(r, 900); return; }
          y += step; setTimeout(go, 90);
        }
        go();
      })`, returnByValue: true, awaitPromise: true,
    }, sessionId, 90000);

    // both kinds of image: the ones in document.images, and every url() a
    // computed style actually resolves to
    const bgUrls = (await s.send('Runtime.evaluate', {
      expression: `new Promise(function(r){
        var urls = {};
        var RE = new RegExp('url\\\\(\\\\s*[\\'"]?([^\\'")]+)[\\'"]?\\\\s*\\\\)', 'g');
        Array.prototype.forEach.call(document.querySelectorAll('*'), function(el){
          var cs = getComputedStyle(el);
          ['backgroundImage','borderImageSource','maskImage'].forEach(function(prop){
            var v = cs[prop];
            if (!v || v === 'none') return;
            var m; RE.lastIndex = 0;
            while ((m = RE.exec(v))) { if (m[1].slice(0,5) !== 'data:') urls[m[1]] = 1; }
          });
        });
        var list = Object.keys(urls);
        var imgs = Array.prototype.slice.call(document.images).filter(function(i){ return !i.complete; });
        var n = list.length + imgs.length;
        if (!n) return r(0);
        var left = n, done = function(){ if (--left <= 0) r(list.length); };
        list.forEach(function(u){ var im = new Image(); im.onload = done; im.onerror = done; im.src = u; });
        imgs.forEach(function(i){ i.addEventListener('load', done); i.addEventListener('error', done); });
        setTimeout(function(){ r(list.length); }, 20000);
      })`, returnByValue: true, awaitPromise: true,
    }, sessionId, 40000)).result.value;

    const docH = (await s.send('Runtime.evaluate', { expression: FREEZE, returnByValue: true }, sessionId, 30000)).result.value;
    await sleep(1200);

    // ---- stitch ordinary viewport screenshots -------------------------------
    const canvas = { width, height: docH, data: new Uint8Array(width * docH * 4) };
    let slices = 0;
    for (let want = 0; want < docH; want += SLICE) {
      const hide = want > 0
        ? "var mh=document.querySelector('.masthead'); if (mh) mh.style.setProperty('visibility','hidden','important');"
        : '';
      const at = (await s.send('Runtime.evaluate', {
        expression: `(function(){ window.scrollTo(0, ${want}); ${hide} return Math.round(window.scrollY); })()`,
        returnByValue: true,
      }, sessionId, 20000)).result.value;
      /* Chrome paints a scaled background image at low filtering quality first
         and re-rasters it a moment later. On the one category tile that sits
         alone on its row at 768px that showed up as 6,869 differing pixels
         between two runs of the SAME build — inside the photograph, nowhere
         else. The settle is generous for that reason, not for layout. */
      await s.send('Runtime.evaluate', {
        expression: `new Promise(function(r){ var n=0; (function f(){ if (++n>6) return setTimeout(r,500); requestAnimationFrame(f); })(); })`,
        returnByValue: true, awaitPromise: true,
      }, sessionId, 20000);
      const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
      const tmp = file + '.slice.png';
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, Buffer.from(shot.data, 'base64'));
      const png = readPNG(tmp);
      fs.unlinkSync(tmp);
      for (let y = 0; y < png.height; y++) {
        const dy = at + y;
        if (dy >= docH) break;
        canvas.data.set(png.data.subarray(y * png.width * 4, (y + 1) * png.width * 4), dy * width * 4);
      }
      slices++;
    }
    writePNG(file, canvas);

    const broken = (await s.send('Runtime.evaluate', {
      expression: "Array.prototype.filter.call(document.images,function(i){return i.complete&&i.naturalWidth===0;}).length",
      returnByValue: true,
    }, sessionId, 15000)).result.value;
    return { docH, slices, broken, bgUrls, bytes: fs.statSync(file).size };
  } finally {
    s.close();
    try { browser.proc.kill(); } catch { /* gone */ }
  }
}

if (mode === 'save') {
  const tag = process.argv[3];
  if (!tag) { console.error('usage: lock-view.mjs save <tag> [--widths 1440,1280,1024,768]'); process.exit(2); }
  const widths = String(arg('widths', '1440,1280,1024,768')).split(',').map(Number);
  console.log('locking "' + tag + '" — ' + URL_);
  const meta = {};
  for (const w of widths) {
    const f = path.join(DIR(tag), w + '.png');
    const r = await capture(w, f);
    meta[w] = r;
    console.log('  ' + String(w).padStart(5) + 'px   document ' + String(r.docH).padStart(6) + 'px   '
      + String(r.slices).padStart(2) + ' slices   ' + (r.bytes / 1024).toFixed(0).padStart(5) + ' KB   '
      + r.bgUrls + ' css images'
      + (r.broken ? '   ' + r.broken + ' BROKEN IMAGES' : ''));
  }
  fs.writeFileSync(path.join(DIR(tag), 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('  -> ' + DIR(tag));
} else if (mode === 'diff') {
  const [a, b] = [process.argv[3], process.argv[4]];
  if (!a || !b) { console.error('usage: lock-view.mjs diff <tagA> <tagB>'); process.exit(2); }
  const files = fs.readdirSync(DIR(a)).filter((f) => f.endsWith('.png') && !f.startsWith('diff-'));
  if (!files.length) { console.log('NOTHING MEASURED — no captures in ' + DIR(a)); process.exit(2); }
  console.log('lock diff — ' + a + '  vs  ' + b);
  let worst = 0, compared = 0;
  for (const f of files.sort((x, y) => Number(y.split('.')[0]) - Number(x.split('.')[0]))) {
    const pb = path.join(DIR(b), f);
    if (!fs.existsSync(pb)) { console.log('  ' + f.padEnd(12) + 'MISSING on ' + b); worst = Infinity; continue; }
    const A = readPNG(path.join(DIR(a), f)), B = readPNG(pb);
    if (A.width !== B.width || A.height !== B.height) {
      console.log('  ' + f.padEnd(12) + 'DIFFERENT PAGE SIZE  ' + A.width + 'x' + A.height + '  vs  ' + B.width + 'x' + B.height
        + '   (height ' + (B.height - A.height > 0 ? '+' : '') + (B.height - A.height) + 'px)');
      worst = Infinity; compared++; continue;
    }
    let diff = 0, maxD = 0, firstY = -1;
    const W = A.width, H = A.height;
    const mask = { width: W, height: H, data: new Uint8Array(W * H * 4) };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1])
          + Math.abs(A.data[i + 2] - B.data[i + 2]);
        const hit = d > 12;
        if (hit) { diff++; if (firstY < 0) firstY = y; }
        if (d > maxD) maxD = d;
        mask.data[i] = hit ? 255 : A.data[i] >> 2;
        mask.data[i + 1] = hit ? 0 : A.data[i + 1] >> 2;
        mask.data[i + 2] = hit ? 0 : A.data[i + 2] >> 2;
        mask.data[i + 3] = 255;
      }
    }
    compared++;
    const pct = diff / (W * H) * 100;
    if (diff) writePNG(path.join(DIR(b), 'diff-' + f), mask);
    console.log('  ' + f.padEnd(12) + W + 'x' + H + '   differing ' + diff.toLocaleString().padStart(11)
      + '  (' + pct.toFixed(4) + '%)  peak ' + String(maxD).padStart(3)
      + (firstY >= 0 ? '  first row ' + firstY : '')
      + (diff ? '   <-- MOVED' : '   identical'));
    if (diff > worst) worst = diff;
  }
  console.log('\n  compared ' + compared + ' width(s)');
  console.log('  ' + (worst === 0
    ? 'LOCKED — every captured width renders exactly as before'
    : 'NOT LOCKED — ' + (worst === Infinity ? 'page geometry changed' : worst.toLocaleString() + ' pixels moved')));
  if (worst !== 0) process.exitCode = 1;
} else {
  console.error('usage: lock-view.mjs save <tag> | diff <tagA> <tagB>');
  process.exit(2);
}
