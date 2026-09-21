// probe-vapor-speed.mjs — how fast does the vapour ACTUALLY move, in px/s?
//
// This exists because of a real miss. The first vapour field was verified with
// "do pixels change over five seconds", which a 71-second cycle passes easily
// while travelling about 7px per second — below the speed at which the eye
// registers motion at all. The probe was green and the effect was invisible.
// "Pixels differ between two screenshots" is a test for EXISTENCE, not for
// perceptibility, and the two are not the same question.
//
// So this measures displacement against the wall clock: each plume's rect is
// sampled twice a known interval apart and the speed is reported in px/s, with
// a band for what is actually perceptible as a slow drift.
//
//   node tools/probe-vapor-speed.mjs <url> [viewport] [sampleMs]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const sampleMs = Number(process.argv[4] || 2000);

// Two classes of motion, two bands. Ambient drift reads as a still image below
// ~10px/s and starts competing with the content above ~60. The hero emitter is
// a jet from a device: it is SUPPOSED to be brisk, and anything under ~40px/s
// looks like a stalled cloud rather than vapour being exhaled.
const BANDS = {
  ambient: { floor: 10, ceil: 60 },
  emitter: { floor: 40, ceil: 260 },
};

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
  await sleep(2200);

  const res = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var plumes = Array.prototype.slice.call(document.querySelectorAll('.vapor__plume, .hero__puff'));
      if (!plumes.length) return Promise.resolve(JSON.stringify({ none: true }));
      function snap(){
        return plumes.map(function(p){
          var r = p.getBoundingClientRect();
          var a = p.getAnimations()[0];
          /* NOT currentTime: on an infinite animation it increases monotonically
             across iterations, so a test for "it went backwards" can never fire.
             getComputedTiming().progress is the position WITHIN the iteration,
             0..1, which does go backwards exactly when the loop restarts. */
          var prog = 0;
          try { prog = a ? (a.effect.getComputedTiming().progress || 0) : 0; } catch (e) { prog = 0; }
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: prog };
        });
      }
      /* A second pass, offset in time, so a plume whose delay parks it on the
         loop boundary is not silently never measured. The delays here are
         fixed, so without this the SAME puff is skipped on every single run —
         a permanent blind spot rather than an occasional one. */
      function measure(){
        var t0 = performance.now();
        var first = snap();
        return new Promise(function(r){
          setTimeout(function(){
            var dt = (performance.now() - t0) / 1000;
            r({ dt: dt, a: first, b: snap() });
          }, ${sampleMs});
        });
      }
      return measure().then(function(p1){
        return measure().then(function(p2){ return [p1, p2]; });
      }).then(function(passes){
        /* prefer the pass that did not cross a restart for each plume */
        var pick = plumes.map(function(_, i){
          var un = passes.filter(function(p){ return !(p.b[i].t < p.a[i].t); });
          return un.length ? un[0] : passes[0];
        });
        var dt = passes[0].dt;
        var a = pick.map(function(p, i){ return p.a[i]; });
        var b = pick.map(function(p, i){ return p.b[i]; });
        return { dt: dt, a: a, b: b };
      }).then(function(m){
        var dt = m.dt, a = m.a, b = m.b;
        {
          var rows = a.map(function(p, i){
            var dx = b[i].x - p.x, dy = b[i].y - p.y;
            var anim = plumes[i].getAnimations()[0];
            return {
              i: i + 1,
              kind: plumes[i].classList.contains('hero__puff') ? 'emitter' : 'ambient',
              wrapped: b[i].t < p.t,
              dx: Math.round(dx / dt),
              dy: Math.round(dy / dt),
              speed: Math.round(Math.sqrt(dx * dx + dy * dy) / dt),
              dur: anim ? Math.round(anim.effect.getTiming().duration / 1000) : null,
              state: anim ? anim.playState : 'none',
              opacity: Number(getComputedStyle(plumes[i]).opacity).toFixed(2)
            };
          });
          return JSON.stringify({ dt: dt.toFixed(2), rows: rows });
        }
      });
    })()`, returnByValue: true, awaitPromise: true,
  }, sessionId, 60000)).result.value);

  if (res.none) { console.log('no plumes found'); process.exitCode = 2; }
  else {
    console.log('vapour speed — @' + vw + 'px, sampled over ' + res.dt + 's');
    console.log('  bands: ambient ' + BANDS.ambient.floor + '-' + BANDS.ambient.ceil
      + ' px/s (drift behind the page), emitter ' + BANDS.emitter.floor + '-' + BANDS.emitter.ceil
      + ' px/s (a jet leaving the device)');
    let slow = 0, fast = 0, wrapped = 0, judged = 0;
    for (const r of res.rows) {
      const band = BANDS[r.kind] || BANDS.ambient;
      let verdict;
      if (r.wrapped) {
        // the sample straddled the animation restarting, so the displacement
        // measured is the rewind and not the motion — one puff reported
        // +176px/s DOWNWARD this way
        verdict = 'sample crossed a loop restart — not judged';
        wrapped++;
      } else if (r.speed < band.floor) { verdict = 'TOO SLOW TO SEE'; slow++; judged++; }
      else if (r.speed > band.ceil) { verdict = 'TOO FAST'; fast++; judged++; }
      else { verdict = r.kind === 'emitter' ? 'rises' : 'drifts'; judged++; }
      console.log('  ' + String(r.kind).padEnd(8) + String(r.i).padStart(2)
        + '  ' + String(r.speed).padStart(3) + ' px/s'
        + '  (dx ' + String(r.dx).padStart(3) + ', dy ' + String(r.dy).padStart(4) + ')'
        + '   band ' + (band.floor + '-' + band.ceil).padEnd(7)
        + '   ' + verdict);
    }
    const ok = res.rows.filter((r) => !r.wrapped);
    const avg = ok.length ? Math.round(ok.reduce((a, r) => a + r.speed, 0) / ok.length) : 0;
    console.log('\n  mean ' + avg + ' px/s across ' + ok.length + ' judged'
      + (wrapped ? ', ' + wrapped + ' skipped mid-restart' : ''));
    if (!judged) { console.log('  NOTHING JUDGED — not a pass'); process.exitCode = 2; }
    else if (slow) { console.log('  ' + slow + ' too slow to be seen'); process.exitCode = 1; }
    else if (fast) { console.log('  ' + fast + ' fast enough to distract'); process.exitCode = 1; }
    else console.log('  every plume moves within the band for its kind');
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
