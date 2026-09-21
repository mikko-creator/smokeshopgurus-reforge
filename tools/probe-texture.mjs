// probe-texture.mjs — is the rough tooth actually gone from the PAINTED page?
//
// `--grain: none` is a claim about a token, not about rendering. The tokens are
// consumed as background-image LAYERS (`var(--grain), var(--sheen)`), and `none`
// is a valid layer, so the declaration still resolves — but only a computed
// style read proves what each surface ends up painting.
//
// Reports every element whose computed background-image contains a
// repeating-linear-gradient, which is the shape both retired textures had.
// --control injects a grain back into the token first, so a clean result is
// shown to be a working instrument rather than a blind one.
//
//   node tools/probe-texture.mjs <url> [--control]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const control = process.argv.includes('--control');

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
  await sleep(2000);

  if (control) {
    await s.send('Runtime.evaluate', {
      expression: "document.documentElement.style.setProperty('--grain',"
        + "'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)');",
      returnByValue: true,
    }, sessionId, 15000);
    await sleep(400);
  }

  const res = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var hits = [], seen = {}, scanned = 0;
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        scanned++;
        var bi = getComputedStyle(el).backgroundImage;
        if (bi.indexOf('repeating-linear-gradient') === -1) continue;
        var key = (el.tagName + '.' + (typeof el.className === 'string' ? el.className : '')).trim();
        if (seen[key]) { seen[key].count++; continue; }
        seen[key] = { key: key, count: 1, css: bi.slice(0, 70) };
        hits.push(seen[key]);
      }
      // the knurl grip lives on a pseudo-element, so check those too
      var pseudo = [];
      for (var j = 0; j < all.length; j++) {
        var e2 = all[j];
        ['::before', '::after'].forEach(function(p){
          var b = getComputedStyle(e2, p).backgroundImage;
          if (b && b.indexOf('repeating-linear-gradient') !== -1) {
            var k2 = e2.tagName + '.' + (typeof e2.className === 'string' ? e2.className : '').trim().split(/\\s+/)[0] + p;
            if (!pseudo.some(function(z){ return z.key === k2; })) pseudo.push({ key: k2, css: b.slice(0, 60) });
          }
        });
      }
      // what a surface that used to be grained now resolves to
      var sample = null;
      var body = document.body;
      if (body) sample = getComputedStyle(body).backgroundImage.slice(0, 90);
      return JSON.stringify({ scanned: scanned, hits: hits, pseudo: pseudo,
        grain: getComputedStyle(document.documentElement).getPropertyValue('--grain').trim(),
        glassNoise: getComputedStyle(document.documentElement).getPropertyValue('--glass-noise').trim(),
        bodyBg: sample });
    })()`, returnByValue: true,
  }, sessionId, 30000)).result.value);

  console.log('texture probe — ' + url.replace('http://127.0.0.1:8788', '') + (control ? '   [CONTROL: grain re-injected]' : ''));
  console.log('  elements scanned : ' + res.scanned);
  console.log('  --grain          : ' + res.grain);
  console.log('  --glass-noise    : ' + res.glassNoise);
  console.log('  body background  : ' + res.bodyBg);
  console.log('  elements painting a repeating gradient : ' + res.hits.length);
  for (const h of res.hits) console.log('     ' + h.key.slice(0, 54) + '  x' + h.count + '   ' + h.css);
  console.log('  pseudo-elements painting one          : ' + res.pseudo.length);
  for (const p of res.pseudo) console.log('     ' + p.key.slice(0, 54) + '   ' + p.css);

  if (res.scanned < 50) { console.log('\n  SCANNED TOO LITTLE — not a result'); process.exitCode = 2; }
  else if (control) {
    const ok = res.hits.length > 0;
    console.log('\n  control: probe ' + (ok ? 'DETECTS an injected texture — instrument works' : 'SAW NOTHING — instrument is blind'));
    if (!ok) process.exitCode = 1;
  } else {
    console.log('\n  ' + (res.hits.length === 0
      ? 'no element paints a rough texture; only the knurl grip strip remains, on pseudo-elements'
      : res.hits.length + ' element(s) still painting a texture'));
    if (res.hits.length) process.exitCode = 1;
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
