// probe-payload.mjs — what does this page COST a phone?
//
// "Optimise mobile" is unanswerable without a number. The sweep says an image
// is larger than its slot; this says how many bytes that is actually worth,
// which is what decides whether the fix is worth making.
//
// Counts real transfer over CDP Network events, broken down by resource type,
// so the biggest lever is visible rather than guessed at.
//
//   node tools/probe-payload.mjs <url> [viewport]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 390);

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Network.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride',
    { width: vw, height: 844, deviceScaleFactor: vw < 768 ? 3 : 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);

  const byType = new Map();
  const files = [];
  const typeOf = new Map();

  s.on('Network.responseReceived', (p) => {
    if (p.sessionId && p.sessionId !== sessionId) return;
    typeOf.set(p.requestId, { type: p.type, url: p.response.url });
  });
  s.on('Network.loadingFinished', (p) => {
    if (p.sessionId && p.sessionId !== sessionId) return;
    const meta = typeOf.get(p.requestId);
    if (!meta) return;
    const t = meta.type || 'Other';
    byType.set(t, (byType.get(t) || 0) + p.encodedDataLength);
    files.push({ type: t, url: meta.url, bytes: p.encodedDataLength });
  });

  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(3000);
  // --initial stops here: what the phone pays BEFORE the visitor scrolls, which
  // is the number that decides whether the page feels fast. The default keeps
  // scrolling to the bottom, which is the whole-page cost instead.
  if (!process.argv.includes('--initial')) {
    await s.send('Runtime.evaluate', {
      expression: 'window.scrollTo(0, document.documentElement.scrollHeight); 1',
      returnByValue: true,
    }, sessionId, 20000);
    await sleep(3000);
  }

  const total = [...byType.values()].reduce((a, b) => a + b, 0);
  const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB';

  console.log('payload — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px'
    + (vw < 768 ? ' (mobile, DPR 3)' : ''));
  console.log('  total ' + kb(total) + '   across ' + files.length + ' requests');
  for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('    ' + t.padEnd(12) + kb(n) + '   ' + (n / total * 100).toFixed(1) + '%');
  }
  for (const t of ['Image', 'Font', 'Script', 'Stylesheet']) {
    const group = files.filter((f) => f.type === t).sort((a, b) => b.bytes - a.bytes);
    if (!group.length) continue;
    console.log('  heaviest ' + t.toLowerCase() + 's (' + group.length + ' requests):');
    for (const f of group.slice(0, 8)) {
      console.log('    ' + kb(f.bytes) + '  ' + decodeURIComponent(f.url.split('/').pop()).slice(0, 56));
    }
  }

  // a font that downloads but paints no glyph is pure waste
  const used = await s.send('Runtime.evaluate', {
    expression: `(function(){
      var out = [];
      document.fonts.forEach(function(f){
        out.push({ face: f.family + ' ' + f.weight + ' ' + f.style, status: f.status });
      });
      return JSON.stringify(out);
    })()`, returnByValue: true,
  }, sessionId, 20000);
  const faces = JSON.parse(used.result.value || '[]');
  // exact match: /loaded$/ also matches "unloaded", which counted every
  // unused face as used and reported 20 of 20
  const live = faces.filter((f) => f.status === 'loaded');
  console.log('  @font-face rules declared: ' + faces.length + '   painted: ' + live.length);
  for (const f of live) console.log('    ' + f.face);
  if (!files.length) { console.log('\n  NOTHING RECORDED — not a result'); process.exitCode = 2; }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
