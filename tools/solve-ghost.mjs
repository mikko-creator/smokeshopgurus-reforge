// solve-ghost.mjs — the ghost button is a SMALL pane: its text rect covers the
// bright top edge of --glass-face, so the worst pixel is the pane's own
// highlight rather than the backdrop. Sweep the tint alpha against rendered
// pixels instead of computing it, because a gradient is not a flat colour.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const SK = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'skills', 'site-reforge', 'scripts', 'lib', 'png.mjs');
const { readPNG } = await import('file:///' + SK.split(path.sep).join('/'));

const lum = (r, g, b) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
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
  await loaded;
  await sleep(2200);
  await s.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});
      var st=document.createElement('style'); st.id='sr-solve'; document.head.appendChild(st);`,
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(400);

  console.log('ghost button label — worst pixel vs tint alpha (13px, needs 4.5:1)');
  for (const a of [0.39, 0.45, 0.50, 0.56, 0.62, 0.70]) {
    await s.send('Runtime.evaluate', {
      expression: `document.getElementById('sr-solve').textContent =
        '.btn--ghost{background-color:rgba(24,30,35,${a})}';`,
      returnByValue: true,
    }, sessionId, 15000);
    await sleep(250);
    const box = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `(function(){
        var el = Array.prototype.find.call(document.querySelectorAll('.btn--ghost'), function(c){
          var r=c.getBoundingClientRect(); return r.width>4&&r.height>4&&r.top>=0&&r.bottom<=innerHeight;});
        if(!el) return 'null';
        var r=el.getBoundingClientRect(); var cs=getComputedStyle(el); var col=cs.color;
        el.style.color='transparent';
        return JSON.stringify({color:col,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)});
      })()`, returnByValue: true,
    }, sessionId, 20000)).result.value);
    if (!box) { console.error('no visible ghost button'); break; }
    await sleep(200);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const tmp = path.join('audit', 'screens', 'scroll', '_ghost.png');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, Buffer.from(shot.data, 'base64'));
    const png = readPNG(tmp);
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(box.color);
    const fg = lum(+m[1], +m[2], +m[3]);
    let worst = Infinity;
    for (let y = box.y; y < Math.min(png.height, box.y + box.h); y++)
      for (let x = box.x; x < Math.min(png.width, box.x + box.w); x++) {
        const i = (y * png.width + x) * 4;
        const c = cr(fg, lum(png.data[i], png.data[i + 1], png.data[i + 2]));
        if (c < worst) worst = c;
      }
    console.log('  alpha ' + a.toFixed(2) + '  ->  ' + worst.toFixed(2) + ':1   ' + (worst >= 4.5 ? 'ok' : 'FAIL'));
    await s.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.btn--ghost').forEach(function(e){e.style.color='';});`,
      returnByValue: true,
    }, sessionId, 15000);
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
