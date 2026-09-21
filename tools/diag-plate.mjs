// diag-plate.mjs — which elements resolve to which smoke plate at a viewport?
import { launch, Session, sleep } from './cdp.mjs';
const vw = Number(process.argv[2] || 390);
const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 844, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const l = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url: 'http://127.0.0.1:8788/' }, sessionId, 45000);
  await l; await sleep(2200);
  const r = (await s.send('Runtime.evaluate', { expression: `(function(){
    var out = [];
    document.querySelectorAll('.vapor__plume, .hero__puff').forEach(function(p){
      var cs = getComputedStyle(p);
      var m = /smoke-plate-([abc])/.exec(cs.backgroundImage);
      out.push((p.className.split(' ').pop() || '?').padEnd(22)
        + ' display=' + cs.display.padEnd(6)
        + ' plate=' + (m ? m[1] : 'none'));
    });
    return JSON.stringify(out);
  })()`, returnByValue: true }, sessionId, 25000)).result.value;
  console.log('@' + vw + 'px');
  JSON.parse(r).forEach(function(x){console.log("  "+x)});
} finally { s.close(); try { browser.proc.kill(); } catch {} }
