// diag-ghost.mjs — WHERE is the worst pixel and what is it? A worst-pixel
// number with no location is a claim you cannot act on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';
const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));
const lum = (r, g, b) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const cr = (a, b) => { const [h, l] = a > b ? [a, b] : [b, a]; return (h + 0.05) / (l + 0.05); };

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url: 'http://127.0.0.1:8788/' }, sessionId, 45000);
  await loaded; await sleep(2200);
  await s.send('Runtime.evaluate', { expression:
    `document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});`,
    returnByValue: true }, sessionId, 20000);
  await sleep(500);
  const box = JSON.parse((await s.send('Runtime.evaluate', { expression: `(function(){
      var all = Array.prototype.slice.call(document.querySelectorAll('.btn--ghost'));
      var vis = all.filter(function(c){var r=c.getBoundingClientRect();
        return r.width>4&&r.height>4&&r.top>=0&&r.bottom<=innerHeight;});
      var el = vis[0]; if(!el) return 'null';
      var r=el.getBoundingClientRect(); var cs=getComputedStyle(el); var col=cs.color;
      el.style.color='transparent';
      return JSON.stringify({ total: all.length, visible: vis.length,
        cls: el.className, text: (el.textContent||'').trim().slice(0,30),
        parent: el.parentElement ? el.parentElement.className : '?',
        color: col, bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0,60),
        shadow: cs.boxShadow.slice(0,90),
        x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height) });
    })()`, returnByValue: true }, sessionId, 20000)).result.value);
  console.log('element : ' + box.cls + '   "' + box.text + '"');
  console.log('parent  : ' + box.parent);
  console.log('ghosts  : ' + box.total + ' total, ' + box.visible + ' fully in viewport');
  console.log('rect    : ' + box.x + ',' + box.y + '  ' + box.w + 'x' + box.h);
  console.log('color   : ' + box.color + '   bg: ' + box.bg);
  console.log('shadow  : ' + box.shadow);
  await sleep(300);
  const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
  const tmp = path.join('audit', 'screens', 'scroll', '_ghost-diag.png');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, Buffer.from(shot.data, 'base64'));
  const png = readPNG(tmp);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(box.color);
  const fg = lum(+m[1], +m[2], +m[3]);
  let worst = Infinity, wx = 0, wy = 0, wc = null;
  const rows = new Map();
  for (let y = box.y; y < Math.min(png.height, box.y + box.h); y++) {
    let rowWorst = Infinity, rc = null;
    for (let x = box.x; x < Math.min(png.width, box.x + box.w); x++) {
      const i = (y * png.width + x) * 4;
      const c = cr(fg, lum(png.data[i], png.data[i+1], png.data[i+2]));
      if (c < rowWorst) { rowWorst = c; rc = [png.data[i], png.data[i+1], png.data[i+2]]; }
      if (c < worst) { worst = c; wx = x; wy = y; wc = rc; }
    }
    rows.set(y - box.y, [rowWorst, rc]);
  }
  console.log('\nworst   : ' + worst.toFixed(2) + ':1 at (' + wx + ',' + wy + ') = rgb(' + wc.join(',') + ')'
    + '   row ' + (wy - box.y) + ' of ' + box.h + ', col ' + (wx - box.x) + ' of ' + box.w);
  console.log('\nper-row worst (row: ratio  rgb):');
  for (const [r, [v, c]] of rows) console.log('  ' + String(r).padStart(2) + ': ' + v.toFixed(2) + '  rgb(' + c.join(',') + ')');
} finally { s.close(); try { browser.proc.kill(); } catch {} }
