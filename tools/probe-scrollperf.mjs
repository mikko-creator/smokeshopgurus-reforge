// probe-scrollperf.mjs — measure scroll smoothness on a real page.
//
// "82 blurred cards will be slow" is a guess until someone times it. This drives
// a programmatic scroll and records frame intervals via rAF, then reports the
// long-frame count. Run it before and after a change and compare; a single
// absolute number means little, the delta means everything.
//
//   node tools/probe-scrollperf.mjs <url> [viewport] [label]

import fs from 'node:fs';
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2];
const vw = Number(process.argv[3] || 1440);
const label = process.argv[4] || 'run';
if (!url) { console.error('usage: probe-scrollperf.mjs <url> [viewport] [label]'); process.exit(2); }

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const throttle = Number(process.env.CPU_THROTTLE || 0);
  if (throttle > 1) {
    // A desktop GPU in headless Chrome is not a phone. Throttling the main thread
    // is an imperfect proxy for a mid-tier device (backdrop-filter is GPU-composited)
    // but it does catch main-thread cost that a fast machine hides.
    await s.send('Emulation.setCPUThrottlingRate', { rate: throttle }, sessionId);
  }
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2500);

  const expr = `new Promise(function(resolve){
    var frames = [], last = performance.now(), started = last;
    var H = document.documentElement.scrollHeight - innerHeight;
    var step = Math.max(1, H / 140);
    var y = 0;
    function tick(now){
      frames.push(now - last); last = now;
      y += step; window.scrollTo(0, y);
      if (y < H && now - started < 6000) requestAnimationFrame(tick);
      else {
        frames.shift();
        var sorted = frames.slice().sort(function(a,b){return a-b;});
        var sum = frames.reduce(function(a,b){return a+b;},0);
        resolve(JSON.stringify({
          frames: frames.length,
          meanMs: +(sum/frames.length).toFixed(2),
          p95Ms: +sorted[Math.floor(sorted.length*0.95)].toFixed(2),
          worstMs: +sorted[sorted.length-1].toFixed(2),
          longFrames: frames.filter(function(f){return f > 32;}).length,
          cards: document.querySelectorAll('.pcard').length,
          blurred: Array.prototype.filter.call(document.querySelectorAll('*'), function(el){
            var b = getComputedStyle(el).backdropFilter;
            return b && b !== 'none';
          }).length,
          scrollHeight: document.documentElement.scrollHeight
        }));
      }
    }
    requestAnimationFrame(tick);
  })`;

  const res = await s.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId, 40000);
  const d = JSON.parse(res.result.value);
  console.log(label + '  ' + url.replace('http://127.0.0.1:8788', ''));
  console.log('  cards ' + d.cards + '  ·  elements with backdrop-filter ' + d.blurred + '  ·  page ' + d.scrollHeight + 'px');
  console.log('  frames ' + d.frames + '  mean ' + d.meanMs + 'ms  p95 ' + d.p95Ms + 'ms  worst ' + d.worstMs + 'ms');
  console.log('  long frames (>32ms): ' + d.longFrames + '  (' + (100 * d.longFrames / d.frames).toFixed(1) + '%)');
  fs.mkdirSync('audit/perf', { recursive: true });
  fs.writeFileSync('audit/perf/' + label + '.json', JSON.stringify({ url, vw, ...d }, null, 2));
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
