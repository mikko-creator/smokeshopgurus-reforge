// probe-hover.mjs — prove the hover state actually applies.
//
// Dispatches a real mouse move over a card and reads back the computed
// transform, shadow and image scale. A CSS rule that exists in the stylesheet
// is not evidence that it wins the cascade.
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/collections/glass-bongs/';
const sel = process.argv[3] || '.pcard';

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

  // scroll the card into view and reveal it
  const box = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var el = document.querySelector('${sel}');
      if (!el) return 'null';
      el.classList.add('is-in');
      // scroll-behavior is smooth on this site, so scrollIntoView ANIMATES —
      // reading the rect straight after it returns a pre-scroll position and the
      // synthetic cursor lands somewhere else entirely.
      el.scrollIntoView({block:'center', behavior:'instant'});
      var r = el.getBoundingClientRect();
      return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), under: (document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2))||{}).className || '?'});
    })()`, returnByValue: true,
  }, sessionId, 20000)).result.value);
  if (!box) { console.error('no element matching ' + sel); process.exit(2); }
  console.log('  cursor target (' + box.x + ',' + box.y + ') over: ' + String(box.under).slice(0,50));
  await sleep(500);

  const read = async (label) => {
    const v = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `(function(){
        var el = document.querySelector('${sel}');
        var img = el.querySelector('img');
        var a = el.querySelector('.pcard__title a, .tile__title a');
        var after = getComputedStyle(el, '::after');
        return JSON.stringify({
          transform: getComputedStyle(el).transform,
          imgTransform: img ? getComputedStyle(img).transform : 'n/a',
          titleColor: a ? getComputedStyle(a).color : 'n/a',
          glareOpacity: after.opacity
        });
      })()`, returnByValue: true,
    }, sessionId, 20000)).result.value);
    console.log('  ' + label);
    console.log('    card transform  ' + v.transform);
    console.log('    image transform ' + v.imgTransform);
    console.log('    title colour    ' + v.titleColor);
    console.log('    glare opacity   ' + v.glareOpacity);
    return v;
  };

  console.log('hover probe on ' + sel);
  const before = await read('BEFORE hover');

  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 }, sessionId, 15000);
  await sleep(700);
  const after = await read('DURING hover');

  const moved = before.transform !== after.transform;
  const scaled = before.imgTransform !== after.imgTransform;
  const tinted = before.titleColor !== after.titleColor;
  const glared = before.glareOpacity !== after.glareOpacity;
  console.log('');
  console.log('  card lifts      ' + (moved ? 'yes' : 'NO'));
  console.log('  image scales    ' + (scaled ? 'yes' : 'NO'));
  console.log('  title accents   ' + (tinted ? 'yes' : 'NO'));
  console.log('  glare appears   ' + (glared ? 'yes' : 'NO'));
  if (!(moved && scaled && tinted && glared)) process.exitCode = 1;
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
