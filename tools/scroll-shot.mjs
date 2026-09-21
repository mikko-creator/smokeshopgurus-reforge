// scroll-shot.mjs — screenshot the VIEWPORT after scrolling to a given offset.
//
// Distinguishes a real rendering bug from a capture artifact: if a glass sticky
// header composites wrongly mid-scroll, an independent CDP capture will show it
// too. If only the extension shows it, it was the extension.
import fs from 'node:fs';
import path from 'node:path';
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const y = Number(process.argv[3] || 1200);
const vw = Number(process.argv[4] || 1440);
const name = process.argv[5] || ('scroll-' + y);

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2000);

  // scroll in a few steps rather than one jump, so reveals fire as a reader's would
  await s.send('Runtime.evaluate', {
    expression: `new Promise(function(r){var t=${y},i=0;function st(){i+=Math.min(400,t-i);window.scrollTo(0,i);if(i<t)setTimeout(st,140);else setTimeout(r,700);}st();})`,
    returnByValue: true, awaitPromise: true,
  }, sessionId, 40000);

  const probe = await s.send('Runtime.evaluate', {
    expression: `JSON.stringify({y:Math.round(window.scrollY),isIn:document.querySelectorAll('[data-reveal].is-in').length,total:document.querySelectorAll('[data-reveal]').length,mastheadTop:Math.round(document.querySelector('.masthead').getBoundingClientRect().top)})`,
    returnByValue: true,
  }, sessionId, 20000);
  const d = JSON.parse(probe.result.value);
  console.log('scrollY ' + d.y + '  ·  reveals ' + d.isIn + '/' + d.total + '  ·  masthead top offset ' + d.mastheadTop + 'px (0 = correctly stuck)');

  const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
  fs.mkdirSync('audit/screens/scroll', { recursive: true });
  const f = path.join('audit/screens/scroll', name + '.png');
  fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
  console.log('wrote ' + f);
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
