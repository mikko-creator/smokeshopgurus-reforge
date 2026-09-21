// probe-reveal.mjs — does the scroll reveal actually fire?
//
// A reveal that never fires is indistinguishable from deleted content, so this
// scrolls the page like a reader would and reports how many [data-reveal]
// elements have flipped to .is-in at each step. If the count never climbs, the
// observer is not doing its job.
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const vh = Number(process.argv[4] || 900);

const SCROLL = `new Promise(function(res){
  var H = document.documentElement.scrollHeight - innerHeight;
  var y = 0, log = [];
  function step(){
    y = Math.min(y + innerHeight * 0.8, H);
    window.scrollTo(0, y);
    setTimeout(function(){
      log.push({ y: Math.round(y), isIn: document.querySelectorAll('[data-reveal].is-in').length });
      if (y < H) step(); else res(JSON.stringify(log));
    }, 260);
  }
  step();
})`;

const STATE = `(function(){
  var all = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  var hidden = all.filter(function(el){ return parseFloat(getComputedStyle(el).opacity) < 0.95; });
  return JSON.stringify({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    htmlHasClass: document.documentElement.classList.contains('js-reveal'),
    ioSupported: ('IntersectionObserver' in window),
    total: all.length,
    withIsIn: all.filter(function(e){ return e.classList.contains('is-in'); }).length,
    hidden: hidden.length,
    firstHidden: hidden.slice(0,6).map(function(e){
      var r = e.getBoundingClientRect();
      return (e.className||'(none)').slice(0,32) + ' @y=' + Math.round(r.top + window.scrollY)
        + ' op=' + getComputedStyle(e).opacity;
    })
  });
})()`;

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Runtime.enable', {}, sessionId);
  s.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') console.log('  CONSOLE ERROR: ' + JSON.stringify(p.args && p.args[0] && p.args[0].value).slice(0, 160));
  });
  s.on('Runtime.exceptionThrown', (p) => {
    console.log('  PAGE EXCEPTION: ' + String(p.exceptionDetails && p.exceptionDetails.text).slice(0, 200)
      + ' ' + String(p.exceptionDetails && p.exceptionDetails.exception && p.exceptionDetails.exception.description || '').slice(0, 240));
  });
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(1500);

  const sres = await s.send('Runtime.evaluate', { expression: SCROLL, returnByValue: true, awaitPromise: true }, sessionId, 90000);
  console.log('scroll trace (scrollY -> .is-in count):');
  JSON.parse(sres.result.value).forEach((p) => console.log('  y=' + String(p.y).padStart(5) + '   is-in ' + p.isIn));

  const res = await s.send('Runtime.evaluate', { expression: STATE, returnByValue: true }, sessionId, 20000);
  const d = JSON.parse(res.result.value);
  console.log('');
  console.log('  html.js-reveal ' + d.htmlHasClass + '  ·  IO supported ' + d.ioSupported);
  console.log('  [data-reveal] ' + d.total + '  ·  .is-in ' + d.withIsIn + '  ·  STILL HIDDEN ' + d.hidden);
  d.firstHidden.forEach((f) => console.log('    ' + f));
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
