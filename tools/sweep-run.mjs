// sweep-run.mjs — run the sr-sweep payload at every breakpoint, on either side.
//
//   node tools/sweep-run.mjs --pages tools/sweep-pages.json --out audit/sweep-raw --side rebuild
//
// The sweep returns viewport.w. It is asserted against the width we asked for,
// because a resize that did not take produces a perfectly honest report about a
// viewport nobody was testing.

import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const plan = JSON.parse(fs.readFileSync(path.resolve(arg('pages')), 'utf8'));
const outDir = path.resolve(arg('out', 'audit/sweep-raw'));
const side = arg('side', 'rebuild');
fs.mkdirSync(outDir, { recursive: true });

const PAYLOAD = fs.readFileSync(path.resolve(arg('payload', 'tools/sweep.js')), 'utf8');
const slug = (u) => { try { const p = new URL(u).pathname; return p.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'index'; } catch { return 'page'; } };

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
const done = []; const failed = [];

try {
  for (const url of plan.pages) {
    for (const vw of plan.viewports) {
      const tag = side + '.' + slug(url) + '.' + vw;
      let targetId = null;
      try {
        const { targetId: tid } = await s.send('Target.createTarget', { url: 'about:blank' });
        targetId = tid;
        const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
        await s.send('Page.enable', {}, sessionId);
        await s.send('Runtime.enable', {}, sessionId);
        await s.send('Emulation.setDeviceMetricsOverride',
          { width: vw, height: plan.height || 900, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
        if (plan.initScript) {
          await s.send('Page.addScriptToEvaluateOnNewDocument', { source: plan.initScript }, sessionId, 15000);
        }
        const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
        await s.send('Page.navigate', { url }, sessionId, 45000);
        await loaded;
        await sleep(plan.settleMs || 2500);

        const res = await s.send('Runtime.evaluate',
          { expression: PAYLOAD, returnByValue: true, awaitPromise: true }, sessionId, 90000);
        if (res.exceptionDetails) throw new Error('sweep threw: ' + JSON.stringify(res.exceptionDetails).slice(0, 240));
        const out = res.result.value;
        if (!out) throw new Error('sweep returned nothing');
        const got = out.viewport && out.viewport.w;
        if (got !== vw) throw new Error('viewport did not take: asked ' + vw + ', got ' + got);

        const f = path.join(outDir, tag + '.json');
        fs.writeFileSync(f, JSON.stringify(out));
        done.push({ tag, file: f, vw, findings: (out.findings || []).length });
        console.log('  OK  ' + tag + '  findings=' + (out.findings || []).length);
      } catch (e) {
        failed.push({ tag, reason: String(e.message || e) });
        console.log('  FAIL ' + tag + '  ' + String(e.message || e).slice(0, 160));
      } finally {
        if (targetId) { try { await s.send('Target.closeTarget', { targetId }, undefined, 10000); } catch { /* gone */ } }
      }
    }
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* already exited */ }
}

fs.writeFileSync(path.join(outDir, '_' + side + '.json'), JSON.stringify({ generated: new Date().toISOString(), side, done, failed }, null, 2));
console.log('\nsweep-run(' + side + '): ' + done.length + ' ok, ' + failed.length + ' failed');
if (failed.length) process.exitCode = 1;
