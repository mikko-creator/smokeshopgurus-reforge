// probe-marquee-focus.mjs — does the centre highlight actually hand off?
//
// Three claims, none of which a screenshot can settle:
//   1. exactly ONE card carries .is-focus at a time — a band that matches two
//      cards at once flickers between them
//   2. the focused card is genuinely the one nearest the strip's centre, not
//      merely some card that happened to trip the observer
//   3. the focus MOVES as the strip scrolls, and moves to a different card —
//      a highlight stuck on one product is not a carousel highlight
//
// It also checks the enlarged card is not clipped, because the strip hides its
// vertical overflow and the scaled card is taller than the track.
//
//   node tools/probe-marquee-focus.mjs <url> [viewport] [samples]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const SAMPLES = Number(process.argv[4] || 10);

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
  await sleep(2500);

  await s.send('Runtime.evaluate', {
    expression: "document.querySelector('.marquee').scrollIntoView({block:'center',behavior:'instant'});1",
    returnByValue: true,
  }, sessionId, 15000);
  await sleep(600);

  const READ = `(function(){
    var strip = document.querySelector('.marquee');
    var track = document.querySelector('.marquee__track');
    if (!strip || !track) return JSON.stringify({ missing: true });
    var focused = strip.querySelectorAll('.mcard.is-focus');
    var all = Array.prototype.slice.call(strip.querySelectorAll('.mcard'));
    var sr = strip.getBoundingClientRect();
    var mid = sr.left + sr.width / 2;
    // which card is truly nearest the centre?
    var best = null, bestD = Infinity, bestIdx = -1;
    all.forEach(function(c, i){
      var r = c.getBoundingClientRect();
      var d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) { bestD = d; best = c; bestIdx = i; }
    });
    var f = focused[0] || null;
    var fr = f ? f.getBoundingClientRect() : null;
    var tr = track.getBoundingClientRect();
    return JSON.stringify({
      focusedCount: focused.length,
      focusedIdx: f ? all.indexOf(f) : -1,
      focusedTitle: f ? (f.querySelector('.mcard__title') || {}).textContent : null,
      nearestIdx: bestIdx,
      offBy: f ? Math.round(Math.abs((fr.left + fr.width / 2) - mid)) : null,
      scale: f ? getComputedStyle(f).transform : null,
      clipTop: fr ? Math.round(sr.top - fr.top) : null,
      clipBottom: fr ? Math.round(fr.bottom - sr.bottom) : null,
      stripH: Math.round(sr.height), trackH: Math.round(tr.height)
    });
  })()`;

  console.log('marquee focus — @' + vw + 'px, ' + SAMPLES + ' samples');
  const seen = new Set();
  let multi = 0, none = 0, wrong = 0, clipped = 0;
  let scaleSeen = null;

  for (let i = 0; i < SAMPLES; i++) {
    const r = JSON.parse((await s.send('Runtime.evaluate', { expression: READ, returnByValue: true },
      sessionId, 20000)).result.value);
    if (r.missing) { console.log('  marquee missing'); process.exitCode = 2; break; }
    if (r.focusedCount === 0) none++;
    if (r.focusedCount > 1) multi++;
    if (r.focusedIdx >= 0) {
      seen.add(r.focusedIdx);
      if (r.focusedIdx !== r.nearestIdx) wrong++;
      if (r.scale && r.scale !== 'none') scaleSeen = r.scale;
      if (r.clipTop > 0 || r.clipBottom > 0) clipped++;
    }
    console.log('  sample ' + String(i + 1).padStart(2)
      + '  focused ' + r.focusedCount
      + '  idx ' + String(r.focusedIdx).padStart(2)
      + '  nearest ' + String(r.nearestIdx).padStart(2)
      + '  off-centre ' + String(r.offBy).padStart(4) + 'px'
      + '  clip t/b ' + r.clipTop + '/' + r.clipBottom
      + '   ' + String(r.focusedTitle || '').trim().slice(0, 26));
    await sleep(900);
  }

  console.log('');
  console.log('  distinct cards highlighted : ' + seen.size + (seen.size > 1 ? '  (the focus hands off)' : '  — IT NEVER MOVED'));
  console.log('  samples with two focused   : ' + multi);
  console.log('  samples with none          : ' + none);
  console.log('  focused was not the nearest: ' + wrong);
  console.log('  focused card clipped       : ' + clipped);
  console.log('  applied transform          : ' + (scaleSeen || '(never scaled)'));

  let bad = 0;
  if (seen.size < 2) bad++;
  if (multi) bad++;
  if (wrong) bad++;
  if (clipped) bad++;
  if (!scaleSeen || scaleSeen === 'none') bad++;
  // a couple of empty samples are the hand-off gap; a majority is a broken band
  if (none > SAMPLES / 2) { console.log('  the centre band matches nothing most of the time'); bad++; }
  console.log('\n  ' + (bad ? bad + ' problem(s)' : 'one card at a time, always the centre one, and it hands off'));
  if (bad) process.exitCode = 1;
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
