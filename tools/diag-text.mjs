// diag-text.mjs — a worst-pixel number with no location is unactionable.
// Reports the element, its line boxes, the worst pixel's coordinates and RGB,
// and WHICH element is painted on top at that pixel — which is how a
// rect/paint mismatch (overlap, unsettled transform) tells itself apart from a
// genuine contrast failure.
//   node tools/diag-text.mjs <url> <vw> <scrollY> <selector>
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

const url = process.argv[2], vw = Number(process.argv[3]), sy = Number(process.argv[4]), sel = process.argv[5];
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
  await loaded; await sleep(2200);
  if (sy) await s.send('Runtime.evaluate', { expression:
    `new Promise(function(r){var t=${sy},i=0;function st(){i+=Math.min(400,t-i);window.scrollTo(0,i);if(i<t)setTimeout(st,130);else setTimeout(r,700);}st();})`,
    returnByValue: true, awaitPromise: true }, sessionId, 40000);
  await s.send('Runtime.evaluate', { expression:
    `document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});`,
    returnByValue: true }, sessionId, 20000);
  await sleep(900);
  const info = JSON.parse((await s.send('Runtime.evaluate', { expression: `(function(){
      var el = Array.prototype.find.call(document.querySelectorAll(${JSON.stringify(sel)}), function(c){
        var r=c.getBoundingClientRect(); return r.width>4&&r.height>4&&r.top>=0&&r.bottom<=innerHeight;});
      if(!el) return 'null';
      var cs=getComputedStyle(el); var col=cs.color; var op=cs.opacity;
      var host=el.closest('[data-reveal]');
      var hostInfo = host ? { cls: host.className, op: getComputedStyle(host).opacity,
                              tf: getComputedStyle(host).transform } : null;
      var rng=document.createRange(); rng.selectNodeContents(el);
      var lines=Array.prototype.slice.call(rng.getClientRects()).filter(function(q){return q.width>1&&q.height>1;});
      el.style.color='transparent';
      return JSON.stringify({ text:(el.textContent||'').trim().slice(0,34), cls: el.className,
        color: col, opacity: op, host: hostInfo,
        rects: lines.map(function(q){return {x:Math.round(q.left),y:Math.round(q.top),w:Math.round(q.width),h:Math.round(q.height)};}) });
    })()`, returnByValue: true }, sessionId, 20000)).result.value);
  if (!info) { console.error('no visible ' + sel); process.exit(2); }
  console.log(sel + ' @' + vw + ' scrollY ' + sy);
  console.log('  text    : "' + info.text + '"   color ' + info.color + '   opacity ' + info.opacity);
  if (info.host) console.log('  reveal  : ' + info.host.cls + '   opacity ' + info.host.op + '   transform ' + info.host.tf);
  console.log('  rects   : ' + JSON.stringify(info.rects));
  await sleep(400);
  const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
  const tmp = path.join('audit', 'screens', 'scroll', '_diag-text.png');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, Buffer.from(shot.data, 'base64'));
  const png = readPNG(tmp);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(info.color);
  const fg = lum(+m[1], +m[2], +m[3]);
  let worst = Infinity, wx = 0, wy = 0, wc = null;
  for (const r of info.rects)
    for (let y = Math.max(0, r.y); y < Math.min(png.height, r.y + r.h); y++)
      for (let x = Math.max(0, r.x); x < Math.min(png.width, r.x + r.w); x++) {
        const i = (y * png.width + x) * 4;
        const c = cr(fg, lum(png.data[i], png.data[i+1], png.data[i+2]));
        if (c < worst) { worst = c; wx = x; wy = y; wc = [png.data[i], png.data[i+1], png.data[i+2]]; }
      }
  console.log('  worst   : ' + worst.toFixed(2) + ':1 at (' + wx + ',' + wy + ') = rgb(' + wc.join(',') + ')');
  const top = (await s.send('Runtime.evaluate', { expression: `(function(){
      var e=document.elementFromPoint(${wx},${wy}); if(!e) return 'none';
      var chain=[]; while(e && chain.length<4){ chain.push(e.tagName+'.'+(typeof e.className==='string'?e.className:'').trim().split(/\s+/).slice(0,2).join('.')); e=e.parentElement; }
      return chain.join('  <  ');
    })()`, returnByValue: true }, sessionId, 15000)).result.value;
  console.log('  painted at that pixel: ' + top);
} finally { s.close(); try { browser.proc.kill(); } catch {} }
