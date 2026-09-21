// probe-hero-contrast.mjs — measure the REAL backdrop behind the hero text.
//
// The scrim was weakened so the vape and leaf would show. That is a legibility
// change, and a gradient over a photograph cannot be reasoned about from the CSS
// — the only honest number comes from the pixels that actually render.
//
// Method: hide .hero__inner, screenshot the hero band, then sample the exact
// rectangle each text element occupied and compute WCAG contrast against the
// colour that text is painted in. Worst pixel wins, not the average — an
// average hides a bright highlight cutting through a letterform.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);

const lum = (r, g, b) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const hexLum = (h) => {
  const s = h.replace('#', '');
  return lum(parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16));
};
const cr = (l1, l2) => { const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1]; return (a + 0.05) / (b + 0.05); };

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

  // record where the text sits, and what colour it is, THEN hide it
  const boxes = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var out = [];
      [['h1','h1'],['.hero__lede','lede'],['.hero__eyebrow','eyebrow']].forEach(function(p){
        var el = document.querySelector('.hero-wrap ' + p[0]);
        if (!el) return;
        var r = el.getBoundingClientRect();
        out.push({ name: p[1], color: getComputedStyle(el).color,
          x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
      });
      var inner = document.querySelector('.hero-wrap .hero__inner');
      if (inner) inner.style.visibility = 'hidden';
      return JSON.stringify(out);
    })()`, returnByValue: true,
  }, sessionId, 20000)).result.value);

  await sleep(400);
  const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
  const tmp = path.join('audit', 'screens', 'scroll', '_hero-backdrop.png');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, Buffer.from(shot.data, 'base64'));

  const png = readPNG(tmp);
  const px = (x, y) => {
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };

  console.log('hero text legibility over the REAL rendered backdrop (' + vw + 'px)');
  let worstOverall = Infinity;
  for (const b of boxes) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(b.color);
    const fg = m ? lum(+m[1], +m[2], +m[3]) : hexLum('#f7fafb');
    let worst = Infinity, worstAt = null;
    for (let y = Math.max(0, b.y); y < Math.min(png.height, b.y + b.h); y += 2) {
      for (let x = Math.max(0, b.x); x < Math.min(png.width, b.x + b.w); x += 2) {
        const [r, g, bl] = px(x, y);
        const c = cr(fg, lum(r, g, bl));
        if (c < worst) { worst = c; worstAt = [x, y]; }
      }
    }
    worstOverall = Math.min(worstOverall, worst);
    const need = b.name === 'h1' ? 3 : 4.5;   // h1 is large text
    console.log('  ' + b.name.padEnd(9) + ' worst pixel ' + worst.toFixed(2) + ':1'
      + '  need ' + need + '  ' + (worst >= need ? 'ok' : 'FAIL')
      + '   at ' + (worstAt ? worstAt.join(',') : '-'));
  }
  console.log(worstOverall >= 3 ? '\nhero text clears its floor everywhere sampled' : '\nHERO TEXT FAILS somewhere — tighten the scrim');
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
