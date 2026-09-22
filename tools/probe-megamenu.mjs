// probe-megamenu.mjs — does any mega-menu link escape its box?
//
// The panels only exist on hover, so nothing that measures the page at rest can
// see them. This forces every panel visible and measures each link against the
// column it sits in and the panel that contains it.
//
// Three different escapes, which need telling apart because they have different
// causes and different fixes:
//   OVER COLUMN  the link's box is wider than its grid column — it is painting
//                over the neighbouring column's content
//   OVER PANEL   the link runs past the panel's padding box entirely — text on
//                the page behind the menu
//   CLIPPED      the link's own text is wider than the link box, so the glyphs
//                are cut or spill depending on overflow
//
//   node tools/probe-megamenu.mjs <url> [viewport]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 1440);
const VH = Number((function(){ var i=process.argv.indexOf('--height'); return i>-1?process.argv[i+1]:900; })());

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: VH, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2200);

  const wantShot = process.argv.includes('--shot');
  const res = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      // force every panel open; they are absolutely positioned so they do not
      // disturb each other's layout
      var st = document.createElement('style');
      st.textContent = '.nav__panel{opacity:1!important;visibility:visible!important;transform:none!important}';
      document.head.appendChild(st);

      var panels = Array.prototype.slice.call(document.querySelectorAll('.nav__panel'));
      var rows = [];
      panels.forEach(function(panel, pi) {
        var pr = panel.getBoundingClientRect();
        var pcs = getComputedStyle(panel);
        var padL = parseFloat(pcs.paddingLeft) || 0;
        var padR = parseFloat(pcs.paddingRight) || 0;
        var inner = { left: pr.left + padL, right: pr.right - padR };
        var label = (panel.previousElementSibling && panel.previousElementSibling.textContent || '')
          .replace(/\\s+/g, ' ').trim().slice(0, 18);

        Array.prototype.forEach.call(panel.querySelectorAll('a'), function(a) {
          var ar = a.getBoundingClientRect();
          var col = a.closest('.nav__col');
          var cr = col ? col.getBoundingClientRect() : null;
          var overCol = cr ? Math.round(ar.right - cr.right) : 0;
          var overPanel = Math.round(ar.right - inner.right);
          // does the TEXT fit inside the link's own content box?
          var clipped = Math.round(a.scrollWidth - a.clientWidth);
          var cs = getComputedStyle(a);
          rows.push({
            panel: label || ('panel ' + (pi + 1)),
            text: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 34),
            w: Math.round(ar.width),
            colW: cr ? Math.round(cr.width) : null,
            overCol: overCol,
            overPanel: overPanel,
            clipped: clipped,
            lines: (function(){ var rg=document.createRange(); rg.selectNodeContents(a); var q=Array.prototype.slice.call(rg.getClientRects()).filter(function(z){return z.width>1&&z.height>1;}); var tops={}; q.forEach(function(z){ tops[Math.round(z.top/4)]=1; }); return Object.keys(tops).length||1; })(),
            whiteSpace: cs.whiteSpace,
            display: cs.display
          });
        });
      });
      var boxes = panels.map(function(p){ var r=p.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
                 bottom: Math.round(r.bottom), offBottom: Math.round(r.bottom - innerHeight),
                 offRight: Math.round(r.right - innerWidth) }; });
      return JSON.stringify({
        vh: innerHeight, vw: innerWidth, boxes: boxes,
        panels: panels.length,
        wide: document.querySelectorAll('.nav__panel--wide').length,
        rows: rows
      });
    })()`, returnByValue: true,
  }, sessionId, 30000)).result.value);

  console.log('mega menu — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');
  console.log('  panels ' + res.panels + ' (' + res.wide + ' wide)   links ' + res.rows.length);
  if (!res.rows.length) { console.log('\n  NOTHING MEASURED — not a pass'); process.exitCode = 2; }
  else {
    const white = res.rows[0].whiteSpace, disp = res.rows[0].display;
    console.log('  link white-space: ' + white + '   display: ' + disp);

    const overCol = res.rows.filter((r) => r.overCol > 1);
    const overPanel = res.rows.filter((r) => r.overPanel > 1);
    const clipped = res.rows.filter((r) => r.clipped > 1);

    const show = (list, label) => {
      console.log('\n  ' + label + ': ' + list.length);
      for (const r of list.slice(0, 12)) {
        console.log('     ' + r.panel.padEnd(14) + '"' + r.text + '"'.padEnd(36 - r.text.length)
          + '  w ' + String(r.w).padStart(4)
          + (r.colW !== null ? '  col ' + String(r.colW).padStart(4) : '')
          + '  overCol ' + String(r.overCol).padStart(4)
          + '  overPanel ' + String(r.overPanel).padStart(4)
          + '  lines ' + r.lines);
      }
    };
    show(overCol, 'links wider than their column');
    show(overPanel, 'links past the panel padding');
    show(clipped, 'links whose text does not fit the link box');

    console.log('');
    res.boxes.forEach(function(b,i){
      console.log('  panel '+(i+1)+'  '+b.w+'x'+b.h+'  top '+b.top
        +'  past bottom '+b.offBottom+'  past right '+b.offRight
        +'   '+((b.offBottom>0||b.offRight>0)?'OFF SCREEN':'fits'));
    });
    const worst = res.rows.reduce((a, r) => Math.max(a, r.overCol, r.overPanel), 0);
    const multi = res.rows.filter((r) => r.lines > 1).length;
    console.log('\n  worst escape: ' + worst + 'px   links on more than one line: ' + multi);
    const bad = overCol.length + overPanel.length + clipped.length;
    console.log('  ' + (bad === 0
      ? 'every link stays inside its column and its panel'
      : bad + ' link(s) escaping'));
    if (bad) process.exitCode = 1;
  }
  if (wantShot) {
    // the panel only exists on hover, so a screenshot of it needs the same
    // forcing the measurement used
    await s.send('Runtime.evaluate', {
      expression: "document.querySelectorAll('.vapor__plume').forEach(function(p){p.getAnimations().forEach(function(a){a.pause();});});1",
      returnByValue: true,
    }, sessionId, 15000);
    await sleep(400);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' }, sessionId, 60000);
    const fsmod = await import('node:fs');
    const pathmod = await import('node:path');
    const f = pathmod.default.join('audit', 'screens', 'megamenu-' + vw + '.png');
    fsmod.default.mkdirSync(pathmod.default.dirname(f), { recursive: true });
    fsmod.default.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log('  screenshot: ' + f);
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
