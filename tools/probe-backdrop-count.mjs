// probe-backdrop-count.mjs — how many elements would a MOVING backdrop force to
// repaint? Every element with a live backdrop-filter re-samples what is behind
// it, so an animated background layer costs one repaint per such element per
// frame. Counting them is the difference between "should be fine" and knowing.
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);

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
  await sleep(2000);

  const res = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var all = document.querySelectorAll('*');
      var byClass = {}, total = 0, visible = 0, area = 0;
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cs = getComputedStyle(el);
        var bf = cs.backdropFilter || cs.webkitBackdropFilter;
        if (!bf || bf === 'none') continue;
        total++;
        var r = el.getBoundingClientRect();
        var onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        if (onScreen) { visible++; area += r.width * r.height; }
        var k = el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0];
        byClass[k] = (byClass[k] || 0) + 1;
      }
      return JSON.stringify({ total: total, visible: visible,
        areaPct: Math.round(area / (innerWidth * innerHeight) * 100),
        scanned: all.length, byClass: byClass });
    })()`, returnByValue: true,
  }, sessionId, 30000)).result.value);

  console.log('backdrop-filter surfaces — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');
  console.log('  elements scanned            : ' + res.scanned);
  console.log('  carrying a backdrop-filter  : ' + res.total);
  console.log('  currently on screen         : ' + res.visible + '   covering ~' + res.areaPct + '% of the viewport');
  for (const [k, v] of Object.entries(res.byClass).sort((a, b) => b[1] - a[1])) {
    console.log('     ' + k.slice(0, 44).padEnd(44) + ' x' + v);
  }
  if (res.scanned < 50) { console.log('\n  SCANNED TOO LITTLE — not a result'); process.exitCode = 2; }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
