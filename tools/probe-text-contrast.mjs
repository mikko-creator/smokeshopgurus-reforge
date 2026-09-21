// probe-text-contrast.mjs — measure text against the surface it actually lands on.
//
// Raising glass transparency lets more of the page behind show through, which is
// a legibility change on every pane that carries words. CSS cannot answer it:
// the surface under a label is a blurred composite of whatever happens to be
// behind it. So the text is made transparent (layout and the pane's own
// background stay exactly as they are), the page is photographed, and each
// label's rectangle is sampled.
//
// Three things this gets right that a naive version does not:
//
//   1. It samples TEXT NODES, not the element's padding box. A button's padding
//      box contains its own 1px edge highlight, which no glyph ever sits on and
//      which reads as a failure that is not there.
//   2. It goes transparent with `important` on the element AND every descendant.
//      A price like "Regular price $8.00" puts the amount in a child that sets
//      its own colour — make only the parent transparent and the child keeps
//      painting, so the probe measures the text against ITSELF and reports ~1:1.
//   3. It hit-tests each run before measuring. "Inside the viewport" is not
//      "visible": the masthead is sticky, so a card scrolled under it still has
//      a rect with top >= 0, and sampling there measures the MASTHEAD's pixels.
//
// Each text run carries its own colour and size, because a 12px label and a
// 20px price inside one element have different floors.
//
// WORST pixel, not mean — an average hides a bright highlight cutting through a
// letterform, which is precisely where reading breaks down.
//
//   node tools/probe-text-contrast.mjs <url> [viewport] [scrollY]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const scrollY = Number(process.argv[4] || 0);

// every glass surface that carries words, plus the accent text that lives on them
const TARGETS = [
  ['.masthead .nav__link', 'nav link'],
  ['.masthead .brand__name', 'brand name'],
  ['.masthead__strip a', 'strip link'],
  ['.pcard .pcard__vendor', 'card vendor'],
  ['.pcard .pcard__title a', 'card title'],
  ['.pcard .pcard__price', 'card price'],
  ['.tile .tile__text', 'tile text'],
  ['.tile .tile__title a', 'tile title'],
  ['.stickybuy .stickybuy__title', 'stickybuy title'],
  ['.stickybuy .stickybuy__price', 'stickybuy price'],
  ['.facets__panel label', 'facet label'],
  ['.mcard .mcard__title', 'marquee title'],
  ['.mcard .mcard__price', 'marquee price'],
  ['.btn--ghost', 'ghost button'],
];

const lum = (r, g, b) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const cr = (a, b) => { const [h, l] = a > b ? [a, b] : [b, a]; return (h + 0.05) / (l + 0.05); };

const COLLECT = `(function(){
  var T = __TARGETS__;
  var out = [];

  function textRuns(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var res = [], n;
    while ((n = w.nextNode())) {
      if (!/\\S/.test(n.nodeValue)) continue;
      var pe = n.parentElement;
      if (!pe) continue;
      var pcs = getComputedStyle(pe);
      if (pcs.visibility === 'hidden' || pcs.display === 'none' || parseFloat(pcs.opacity) === 0) continue;
      var rg = document.createRange(); rg.selectNode(n);
      // > 2px in both axes drops the 1x1 clipped rect of a visually-hidden label
      var rects = Array.prototype.slice.call(rg.getClientRects())
        .filter(function(q){ return q.width > 2 && q.height > 2; });
      if (!rects.length) continue;
      // the run must be the topmost thing at its own centre
      var p = rects[0];
      var hit = document.elementFromPoint(
        Math.round(p.left + p.width / 2), Math.round(p.top + p.height / 2));
      if (!hit || !(hit === pe || pe.contains(hit))) continue;
      res.push({
        color: pcs.color, size: parseFloat(pcs.fontSize), weight: pcs.fontWeight,
        text: n.nodeValue.trim().slice(0, 22),
        rects: rects.map(function(q){ return { x: Math.round(q.left), y: Math.round(q.top),
          w: Math.round(q.width), h: Math.round(q.height) }; })
      });
    }
    return res;
  }

  T.forEach(function(pair){
    var cands = Array.prototype.slice.call(document.querySelectorAll(pair[0]));
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var r = c.getBoundingClientRect();
      if (!(r.width > 4 && r.height > 4 && r.top >= 0 && r.bottom <= innerHeight)) continue;
      var rs = textRuns(c);
      if (!rs.length) continue;
      out.push({ name: pair[1], runs: rs });
      // a descendant may set its own colour, so blank the whole subtree
      c.style.setProperty('color', 'transparent', 'important');
      Array.prototype.forEach.call(c.querySelectorAll('*'), function(d){
        d.style.setProperty('color', 'transparent', 'important');
      });
      break;
    }
  });
  return JSON.stringify(out);
})()`;

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
  await sleep(2200);

  if (scrollY) {
    await s.send('Runtime.evaluate', {
      expression: 'new Promise(function(r){var t=' + scrollY + ',i=0;function st(){i+=Math.min(400,t-i);window.scrollTo(0,i);if(i<t)setTimeout(st,130);else setTimeout(r,700);}st();})',
      returnByValue: true, awaitPromise: true,
    }, sessionId, 40000);
  }
  // reveal everything so nothing is measured at opacity 0
  await s.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});",
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(900);

  // FREEZE THE PAGE before measuring. This probe reads rects, then screenshots
  // a moment later, and compares the two — which is only valid if nothing moved
  // in between. The best-seller marquee slides continuously, so a card's text
  // rect was being sampled against whatever had slid into that position by the
  // time of the capture: a title measured 2.49:1 in one run and 12.08:1 in the
  // next, because sometimes a white media well had arrived under the sample.
  // Finite animations are finished (so reveals land settled), infinite ones are
  // paused (finish() on an infinite animation throws).
  await s.send('Runtime.evaluate', {
    expression: `document.getAnimations().forEach(function(a){
      try {
        var t = a.effect && a.effect.getTiming();
        if (t && t.iterations === Infinity) a.pause(); else a.finish();
      } catch (e) { try { a.pause(); } catch (e2) {} }
    }); 1`,
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(350);

  const runs = JSON.parse((await s.send('Runtime.evaluate', {
    expression: COLLECT.replace('__TARGETS__', JSON.stringify(TARGETS)), returnByValue: true,
  }, sessionId, 25000)).result.value);

  await sleep(400);
  const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
  const tmp = path.join('audit', 'screens', 'scroll', '_text-backdrop.png');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, Buffer.from(shot.data, 'base64'));
  const png = readPNG(tmp);

  console.log('text on glass — ' + url.replace('http://127.0.0.1:8788', '') + '  @' + vw + 'px' + (scrollY ? ' scrollY ' + scrollY : ''));
  let fails = 0, measured = 0;
  for (const t of runs) {
    let tightest = null;
    for (const run of t.runs) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(run.color);
      if (!m) continue;
      const fg = lum(+m[1], +m[2], +m[3]);
      let worst = Infinity;
      for (const r of run.rects) {
        for (let y = Math.max(0, r.y); y < Math.min(png.height, r.y + r.h); y += 1) {
          for (let x = Math.max(0, r.x); x < Math.min(png.width, r.x + r.w); x += 1) {
            const i = (y * png.width + x) * 4;
            const c = cr(fg, lum(png.data[i], png.data[i + 1], png.data[i + 2]));
            if (c < worst) worst = c;
          }
        }
      }
      if (worst === Infinity) continue;
      // large text (>=24px, or >=18.66px bold) needs 3:1; everything else 4.5:1
      const large = run.size >= 24 || (run.size >= 18.66 && Number(run.weight) >= 700);
      const need = large ? 3 : 4.5;
      const cand = { worst, need, size: run.size, text: run.text, margin: worst / need };
      if (!tightest || cand.margin < tightest.margin) tightest = cand;
    }
    if (!tightest) continue;
    measured++;
    const ok = tightest.worst >= tightest.need;
    if (!ok) fails++;
    console.log('  ' + t.name.padEnd(18) + tightest.worst.toFixed(2).padStart(6) + ':1   need '
      + String(tightest.need).padStart(3) + '   ' + (ok ? 'ok  ' : 'FAIL')
      + '   ' + tightest.size + 'px   "' + tightest.text + '"');
  }
  if (!measured) {
    console.log('\n  NOTHING MEASURED — a probe that compared nothing is not a pass');
    process.exitCode = 2;
  } else {
    console.log(fails
      ? '\n  ' + fails + ' FAILING of ' + measured + ' — glass is too transparent here'
      : '\n  all ' + measured + ' sampled labels clear their floor');
    if (fails) process.exitCode = 1;
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
