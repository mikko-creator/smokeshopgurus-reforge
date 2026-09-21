// shoot.mjs — screenshot pages over CDP at full document height.
//
//   node tools/shoot.mjs --urls <file.json> --out audit/screens/baseline --viewport 1440
//
// Full-height by design: a short capture reports a verdict about the part of the
// page it never looked at. Height is read from documentElement.scrollHeight after
// the page settles, then the metrics are re-applied before the shot.

import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const root = path.resolve(arg('project', '.'));
const spec = JSON.parse(fs.readFileSync(path.resolve(root, arg('urls')), 'utf8'));
const outDir = path.resolve(root, arg('out', 'audit/screens/baseline'));
const viewport = Number(arg('viewport', 1440));
const maxH = Number(arg('maxHeight', 20000));
fs.mkdirSync(outDir, { recursive: true });

const nameOf = (u, i) => {
  if (spec.names && spec.names[i]) return spec.names[i];
  try { const p = new URL(u).pathname; return (p.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'index'); }
  catch { return 'shot-' + i; }
};

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
const done = []; const failed = [];

try {
  for (let i = 0; i < spec.urls.length; i++) {
    const url = spec.urls[i];
    const name = nameOf(url, i);
    let targetId = null;
    try {
      const { targetId: tid } = await s.send('Target.createTarget', { url: 'about:blank' });
      targetId = tid;
      const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
      await s.send('Page.enable', {}, sessionId);
      await s.send('Emulation.setDeviceMetricsOverride', { width: viewport, height: 1000, deviceScaleFactor: 1, mobile: viewport < 768 }, sessionId);
      // Runs before any page script on every navigation. Used to satisfy the 21+
      // gate, which otherwise correctly covers every page and every screenshot.
      // A full-height capture uses captureBeyondViewport, which paints past the
      // viewport WITHOUT making the viewport that tall — so IntersectionObserver
      // never fires for anything below the fold and scroll reveals photograph as
      // blank. For a QA screenshot we want the state a reader sees AFTER scrolling,
      // so the reveal is neutralised for the capture only.
      if (spec.revealAll !== false) {
        await s.send('Page.addScriptToEvaluateOnNewDocument', { source:
          "document.addEventListener('DOMContentLoaded',function(){var st=document.createElement('style');" +
          "st.textContent='.js-reveal [data-reveal]{opacity:1!important;transform:none!important;transition:none!important}';" +
          "document.head.appendChild(st);});" }, sessionId, 15000);
      }
      if (spec.initScript) {
        await s.send('Page.addScriptToEvaluateOnNewDocument', { source: spec.initScript }, sessionId, 15000);
      }

      const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
      await s.send('Page.navigate', { url }, sessionId, 45000);
      await loaded;
      await sleep(spec.settleMs || 2500);

      const probe = await s.send('Runtime.evaluate', {
        expression: '(function(){window.scrollTo(0,document.documentElement.scrollHeight);var h=document.documentElement.scrollHeight;window.scrollTo(0,0);return JSON.stringify({h:h,w:innerWidth});})()',
        returnByValue: true,
      }, sessionId, 20000);
      const got = JSON.parse(probe.result.value);
      if (got.w !== viewport) throw new Error('viewport did not take: asked ' + viewport + ', got ' + got.w);
      const height = Math.min(got.h, maxH);

      // Lazy images below the fold only decode once they have been near the
      // viewport, so the tall metrics are applied and given a beat to settle.
      await s.send('Emulation.setDeviceMetricsOverride', { width: viewport, height, deviceScaleFactor: 1, mobile: viewport < 768 }, sessionId);
      await sleep(spec.paintMs || 1200);

      const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId, 90000);
      const file = path.join(outDir, name + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      done.push({ url, name, file, viewport, height });
      console.log('  OK  ' + name + '  ' + viewport + 'x' + height);
    } catch (e) {
      failed.push({ url, name, reason: String(e.message || e) });
      console.log('  FAIL ' + name + '  ' + String(e.message || e).slice(0, 160));
    } finally {
      if (targetId) { try { await s.send('Target.closeTarget', { targetId }, undefined, 10000); } catch { /* gone */ } }
    }
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* already exited */ }
}

fs.writeFileSync(path.join(outDir, '_shots.json'), JSON.stringify({ generated: new Date().toISOString(), viewport, done, failed }, null, 2));
console.log('\nshoot: ' + done.length + ' captured, ' + failed.length + ' failed -> ' + outDir);
if (failed.length) process.exitCode = 1;
