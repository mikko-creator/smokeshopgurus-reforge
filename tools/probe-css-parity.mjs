// probe-css-parity.mjs — did slimming the CSS change how anything RENDERS?
//
// A minifier that is "probably fine" is not fine: one mis-parsed comment can
// delete a declaration, and the page still looks broadly right while one rule
// is quietly gone. The only honest check is to compare what the browser
// actually computed, element by element, before and after.
//
// Snapshots the computed value of ~40 layout- and paint-critical properties for
// every element, plus its rect, and writes them to a file. Run once before the
// change and once after, then diff.
//
//   node tools/probe-css-parity.mjs <url> <viewport> --save <file>
//   node tools/probe-css-parity.mjs <url> <viewport> --compare <file>

import fs from 'node:fs';
import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const saveIdx = process.argv.indexOf('--save');
const cmpIdx = process.argv.indexOf('--compare');
const outFile = saveIdx > -1 ? process.argv[saveIdx + 1] : null;
const cmpFile = cmpIdx > -1 ? process.argv[cmpIdx + 1] : null;

if (!outFile && !cmpFile) {
  console.error('usage: probe-css-parity.mjs <url> <viewport> --save <file> | --compare <file>');
  process.exit(2);
}

const PROPS = [
  'display', 'position', 'width', 'height', 'margin', 'padding', 'border',
  'color', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform',
  'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap',
  'gridTemplateColumns', 'gridTemplateRows',
  'opacity', 'transform', 'boxShadow', 'borderRadius', 'overflow',
  'zIndex', 'visibility', 'textAlign', 'whiteSpace', 'backdropFilter',
  'animationName', 'animationDuration', 'transitionProperty', 'objectFit', 'inset',
];

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  // freeze the vapour, or its transform differs between runs for honest reasons
  await s.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2500);
  await s.send('Runtime.evaluate', {
    expression: "document.querySelectorAll('[data-reveal]').forEach(function(e){e.classList.add('is-in');});",
    returnByValue: true,
  }, sessionId, 20000);
  await sleep(600);

  const snap = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var P = ${JSON.stringify(PROPS)};
      var all = document.querySelectorAll('*');
      var rows = [];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cs = getComputedStyle(el);
        var v = [];
        for (var j = 0; j < P.length; j++) v.push(cs[P[j]]);
        var r = el.getBoundingClientRect();
        rows.push({
          k: el.tagName + '#' + i + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''),
          r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          v: v
        });
      }
      return JSON.stringify({ count: rows.length, rows: rows });
    })()`, returnByValue: true,
  }, sessionId, 60000)).result.value);

  if (snap.count < 50) { console.log('SCANNED TOO LITTLE — not a result'); process.exitCode = 2; }
  else if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(snap));
    console.log('css parity snapshot — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');
    console.log('  ' + snap.count + ' elements x ' + PROPS.length + ' properties -> ' + outFile);
  } else {
    const before = JSON.parse(fs.readFileSync(cmpFile, 'utf8'));
    console.log('css parity — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');
    console.log('  elements: ' + before.count + ' before, ' + snap.count + ' after');
    if (before.count !== snap.count) {
      console.log('  ELEMENT COUNT CHANGED — not comparable');
      process.exitCode = 1;
    } else {
      let propDiffs = 0, rectDiffs = 0;
      const examples = [];
      for (let i = 0; i < snap.rows.length; i++) {
        const a = before.rows[i], b = snap.rows[i];
        for (let j = 0; j < PROPS.length; j++) {
          if (a.v[j] !== b.v[j]) {
            propDiffs++;
            if (examples.length < 8) {
              examples.push(b.k + '  ' + PROPS[j] + ': "' + a.v[j] + '" -> "' + b.v[j] + '"');
            }
          }
        }
        for (let j = 0; j < 4; j++) if (Math.abs(a.r[j] - b.r[j]) > 1) { rectDiffs++; break; }
      }
      console.log('  computed-property differences : ' + propDiffs);
      console.log('  elements whose box moved >1px : ' + rectDiffs);
      for (const e of examples) console.log('     ' + e);
      if (propDiffs === 0 && rectDiffs === 0) {
        console.log('\n  the slimmed stylesheets compute identically — nothing was lost');
      } else {
        console.log('\n  THE SLIM CHANGED RENDERING');
        process.exitCode = 1;
      }
    }
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
