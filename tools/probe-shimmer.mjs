// probe-shimmer.mjs — does the hover shimmer actually run?
//
// Selects a VISIBLE match deliberately: the first .btn--primary in the DOM sits
// inside the display:none age gate, where a percentage transform resolves to
// `none` — which reads as a broken rule when the rule is fine.
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const sel = process.argv[3] || '.btn--primary';

const PICK = `Array.prototype.find.call(document.querySelectorAll('${sel}'), function(c){
  var r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0;
})`;

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2200);

  const raw = (await s.send('Runtime.evaluate', {
    expression: `(function(){
      var el = ${PICK};
      if (!el) return 'null';
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      var r = el.getBoundingClientRect();
      var under = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
      return JSON.stringify({
        x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
        cls: el.className,
        under: under ? (under.className || under.tagName) : '?'
      });
    })()`, returnByValue: true,
  }, sessionId, 20000)).result.value;
  const box = JSON.parse(raw);
  if (!box) { console.error('no visible element matching ' + sel); process.exit(2); }
  console.log('shimmer probe on ' + sel);
  console.log('  target: ' + box.cls);
  console.log('  cursor (' + box.x + ',' + box.y + ') lands on: ' + String(box.under).slice(0, 48));
  await sleep(300);

  const readAnim = async () => JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var el = ${PICK};
      var anims = el.getAnimations({ subtree: true }).map(function(a){
        return { name: a.animationName || 'anim', state: a.playState,
                 target: (a.effect && a.effect.pseudoElement) || 'element' };
      });
      var b = getComputedStyle(el, '::before');
      return JSON.stringify({
        anims: anims, beforeOpacity: b.opacity, beforeTransform: b.transform,
        isolation: getComputedStyle(el).isolation, bg: getComputedStyle(el).backgroundColor
      });
    })()`, returnByValue: true,
  }, sessionId, 20000)).result.value);

  const before = await readAnim();
  console.log('  isolation: ' + before.isolation + '   fill: ' + before.bg);
  console.log('  BEFORE hover — animations ' + before.anims.length + ', ::before transform ' + before.beforeTransform.slice(0, 44));

  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 }, sessionId, 15000);
  await sleep(240);
  const during = await readAnim();
  console.log('  DURING hover — animations ' + during.anims.length + ', fill: ' + during.bg);
  during.anims.forEach((a) => console.log('     ' + a.name + '  ' + a.state + '  on ' + a.target));

  const fired = during.anims.some((a) => /shimmer/i.test(a.name) && a.state === 'running');
  const fillHeld = before.bg === during.bg;
  console.log('');
  console.log('  shimmer runs on hover : ' + (fired ? 'yes' : 'NO'));
  console.log('  fill stays put        : ' + (fillHeld ? 'yes' : 'no — it still colour-shifts'));
  if (!fired) process.exitCode = 1;
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
