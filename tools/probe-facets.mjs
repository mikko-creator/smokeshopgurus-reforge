// Measure the facet panel's box chain at phone width, with the drawer open.
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/collections/glass-bongs/';
const vw = Number(process.argv[3] || 390);

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

  const expr = `(function(){
    document.querySelectorAll('details').forEach(function(d){ d.open = true; });
    var out = [];
    var target = document.querySelector('.facets__mobile .facets__range input');
    var el = target;
    while (el && el !== document.documentElement) {
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      out.push({
        sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0,2).join('.') : ''),
        w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
        disp: cs.display, dir: cs.flexDirection, flex: cs.flex, minW: cs.minWidth, width: cs.width,
        pad: cs.paddingLeft + '/' + cs.paddingRight, box: cs.boxSizing
      });
      el = el.parentElement;
    }
    return JSON.stringify({ innerWidth: innerWidth, chain: out });
  })()`;
  const res = await s.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId, 30000);
  const d = JSON.parse(res.result.value);
  console.log('innerWidth ' + d.innerWidth);
  for (const c of d.chain) {
    console.log('  w=' + String(c.w).padStart(4) + ' L=' + String(c.left).padStart(4) + ' R=' + String(c.right).padStart(4)
      + '  ' + c.sel.padEnd(28) + ' disp=' + c.disp + ' dir=' + c.dir + ' flex=' + c.flex + ' minW=' + c.minW + ' w=' + c.width + ' pad=' + c.pad + ' box=' + c.box);
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
