// capture-run.mjs — drive headless Chrome over CDP and harvest the site-reforge
// capture payloads at every breakpoint.
//
//   node tools/capture-run.mjs --pages <file.json> --out audit/capture-raw [--side baseline]
//
// The payloads come from `sr-capture --emit` / `--emit-scroll` verbatim; this file
// only transports them. Each capture is written as its own JSON so sr-capture
// --merge can record it as evidence one file at a time.

import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const root = path.resolve(arg('project', '.'));
const plan = JSON.parse(fs.readFileSync(path.resolve(root, arg('pages', 'tools/capture-plan.json')), 'utf8'));
const outDir = path.resolve(root, arg('out', 'audit/capture-raw'));
const side = arg('side', 'baseline');
const doScroll = args.includes('--scroll');
fs.mkdirSync(outDir, { recursive: true });

const HARVEST = fs.readFileSync(path.resolve(root, 'tools/harvest.js'), 'utf8');
const HARVEST_SCROLL = fs.readFileSync(path.resolve(root, 'tools/harvest-scroll.js'), 'utf8');

const slug = (u) => { try { const p = new URL(u).pathname; return p.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'index'; } catch { return 'page'; } };

const browser = await launch({ headless: true });
console.log('chrome up on port ' + browser.port);
const root$ = await Session.connect(browser.wsUrl);

const results = [];
const failures = [];

try {
  for (const pageUrl of plan.pages) {
    for (const vw of plan.viewports) {
      const tag = slug(pageUrl) + '@' + vw;
      let targetId = null;
      try {
        // A fresh target per capture: no state leaks between viewports, and a
        // wedged tab costs one capture instead of the whole run.
        const { targetId: tid } = await root$.send('Target.createTarget', { url: 'about:blank' });
        targetId = tid;
        const { sessionId } = await root$.send('Target.attachToTarget', { targetId, flatten: true });

        await root$.send('Page.enable', {}, sessionId);
        await root$.send('Runtime.enable', {}, sessionId);
        await root$.send('Emulation.setDeviceMetricsOverride', {
          width: vw, height: plan.height || 900, deviceScaleFactor: 1,
          mobile: vw < 768,
        }, sessionId);

        const loaded = root$.once('Page.loadEventFired', 45000).catch(() => null);
        await root$.send('Page.navigate', { url: pageUrl }, sessionId, 45000);
        await loaded;
        await sleep(plan.settleMs || 2500);

        // Assert the viewport the page actually has. A resize that did not take
        // produces an honest report about a width you were never testing.
        const probe = await root$.send('Runtime.evaluate', {
          expression: 'JSON.stringify({w:innerWidth,h:innerHeight,sh:document.documentElement.scrollHeight,rs:document.readyState})',
          returnByValue: true,
        }, sessionId, 20000);
        const got = JSON.parse(probe.result.value);
        if (got.w !== vw) throw new Error('viewport did not take: asked ' + vw + ', innerWidth ' + got.w);

        const res = await root$.send('Runtime.evaluate', {
          expression: HARVEST, returnByValue: true, awaitPromise: false,
        }, sessionId, 90000);
        if (res.exceptionDetails) throw new Error('harvest threw: ' + JSON.stringify(res.exceptionDetails).slice(0, 300));
        const cap = res.result.value;
        if (!cap || !cap.schema) throw new Error('harvest returned no capture');

        const f = path.join(outDir, [side, slug(pageUrl), vw, 'style'].join('.') + '.json');
        fs.writeFileSync(f, JSON.stringify(cap));
        results.push({ tag, kind: 'style', file: f, elements: (cap.elements || []).length, vw: cap.viewport.w, scrollHeight: got.sh });
        console.log('  OK  ' + tag + '  style  els=' + (cap.elements || []).length + '  sh=' + got.sh);

        if (doScroll) {
          const sres = await root$.send('Runtime.evaluate', {
            expression: HARVEST_SCROLL, returnByValue: true, awaitPromise: true,
          }, sessionId, 60000);
          if (!sres.exceptionDetails && sres.result.value && sres.result.value.schema) {
            const sc = sres.result.value;
            const sf = path.join(outDir, [side, slug(pageUrl), vw, 'scroll'].join('.') + '.json');
            fs.writeFileSync(sf, JSON.stringify(sc));
            results.push({ tag, kind: 'scroll', file: sf, reveals: sc.revealCount, vw: sc.viewport.w });
            console.log('  OK  ' + tag + '  scroll reveals=' + sc.revealCount);
          } else {
            failures.push({ tag, kind: 'scroll', reason: 'scroll harvest returned nothing' });
            console.log('  FAIL ' + tag + ' scroll');
          }
        }
      } catch (e) {
        failures.push({ tag, reason: String(e.message || e) });
        console.log('  FAIL ' + tag + '  ' + String(e.message || e).slice(0, 180));
      } finally {
        if (targetId) { try { await root$.send('Target.closeTarget', { targetId }, undefined, 10000); } catch { /* tab already gone */ } }
      }
    }
  }
} finally {
  root$.close();
  try { browser.proc.kill(); } catch { /* already exited */ }
}

fs.writeFileSync(path.join(outDir, '_run.json'), JSON.stringify({ generated: new Date().toISOString(), side, results, failures }, null, 2));
console.log('\ncapture-run: ' + results.length + ' captured, ' + failures.length + ' failed -> ' + outDir);
if (failures.length) process.exitCode = 1;
