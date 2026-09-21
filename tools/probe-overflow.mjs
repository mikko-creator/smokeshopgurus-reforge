// probe-overflow.mjs — find what makes a page wider than its viewport.
//
// A sweep that reports innerWidth 715 when it asked for 390 is not a broken
// probe: in mobile emulation Chrome widens the layout viewport to fit content it
// cannot break. So the question is which element is too wide, and by how much.
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2];
const vw = Number(process.argv[3] || 390);
if (!url) { console.error('usage: probe-overflow.mjs <url> [viewport]'); process.exit(2); }

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: !process.argv.includes("--desktop") && vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2500);

  const expr = `(function(){
    var vw = window.innerWidth;
    var out = [];
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      var right = r.left + r.width + window.scrollX;
      if (right > vw + 1) {
        var cs = getComputedStyle(el);
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').slice(0, 70),
          w: Math.round(r.width), left: Math.round(r.left), right: Math.round(right),
          ws: cs.whiteSpace, ov: cs.overflowX, pos: cs.position, minW: cs.minWidth
        });
      }
    }
    out.sort(function (a, b) { return b.right - a.right; });
    return JSON.stringify({
      innerWidth: vw,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      worst: out.slice(0, 14)
    });
  })()`;
  const res = await s.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId, 30000);
  const d = JSON.parse(res.result.value);
  console.log('asked ' + vw + ' · innerWidth ' + d.innerWidth + ' · doc.scrollWidth ' + d.docScrollWidth + ' · body.scrollWidth ' + d.bodyScrollWidth);
  console.log('elements extending past the viewport, widest first:');
  for (const w of d.worst) {
    console.log('  right=' + String(w.right).padStart(5) + ' w=' + String(w.w).padStart(5)
      + '  ' + w.tag + (w.cls ? '.' + w.cls.split(/\s+/).slice(0, 3).join('.') : '')
      + '  [ws=' + w.ws + ' ovx=' + w.ov + ' pos=' + w.pos + ']');
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
