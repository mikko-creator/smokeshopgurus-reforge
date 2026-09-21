// probe-drawer.mjs — does the mobile menu still open, and is it ON SCREEN?
//
// This exists because moving the notice strip out of <header> changed what the
// sticky header contains. `position: sticky` only sticks inside its parent's
// box, so the obvious version of that change — pinning the bar's wrapper while
// leaving it inside the header — would have unpinned the nav as soon as the
// header scrolled past. The drawer lives inside the pinned element, so if the
// pinning is wrong the menu opens somewhere the visitor cannot see.
//
// "The menu opens" is therefore not the question. The question is whether its
// rect lands inside the viewport after scrolling down a long page.
//
//   node tools/probe-drawer.mjs <url> [viewport] [scrollY]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 390);
const scrollY = Number(process.argv[4] || 2000);

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride',
    { width: vw, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 45000);
  await loaded;
  await sleep(2200);

  const step = async (label, doScroll) => {
    if (doScroll) {
      await s.send('Runtime.evaluate', {
        expression: 'window.scrollTo(0, ' + scrollY + '); 1', returnByValue: true,
      }, sessionId, 20000);
      await sleep(700);
    }
    return JSON.parse((await s.send('Runtime.evaluate', {
      expression: `(function(){
        var m = document.querySelector('.masthead');
        var lab = document.querySelector('label.nav-toggle');
        var cb = document.getElementById('nav-open');
        var dr = document.querySelector('.drawer');
        var mr = m ? m.getBoundingClientRect() : null;
        var dr2 = dr ? dr.getBoundingClientRect() : null;
        return JSON.stringify({
          scrollY: Math.round(window.scrollY),
          mastheadTop: mr ? Math.round(mr.top) : null,
          mastheadH: mr ? Math.round(mr.height) : null,
          toggleVisible: lab ? getComputedStyle(lab).display !== 'none' : false,
          checked: cb ? cb.checked : null,
          drawerDisplay: dr ? getComputedStyle(dr).display : '(none)',
          drawerTop: dr2 ? Math.round(dr2.top) : null,
          drawerH: dr2 ? Math.round(dr2.height) : null,
          vh: innerHeight
        });
      })()`, returnByValue: true,
    }, sessionId, 20000)).result.value);
  };

  console.log('mobile drawer — ' + url.replace('http://127.0.0.1:8788', '') + ' @' + vw + 'px');

  const atTop = await step('top', false);
  console.log('  at top      : masthead top ' + atTop.mastheadTop + 'px, height ' + atTop.mastheadH
    + '   toggle visible ' + atTop.toggleVisible + '   drawer ' + atTop.drawerDisplay);

  const scrolled = await step('scrolled', true);
  const stuck = scrolled.mastheadTop === 0;
  console.log('  scrolled ' + scrolled.scrollY + 'px: masthead top ' + scrolled.mastheadTop + 'px   '
    + (stuck ? 'still pinned' : 'NOT PINNED — it scrolled away'));
  if (!stuck) process.exitCode = 1;

  // open the menu the way a visitor does
  await s.send('Runtime.evaluate', {
    expression: "document.querySelector('label.nav-toggle').click(); 1", returnByValue: true,
  }, sessionId, 20000);
  await sleep(600);
  const open = await step('open', false);
  console.log('  menu opened : checked ' + open.checked + '   drawer display ' + open.drawerDisplay
    + '   rect top ' + open.drawerTop + ' height ' + open.drawerH);

  const onScreen = open.drawerDisplay !== 'none'
    && open.drawerTop !== null
    && open.drawerTop >= 0 && open.drawerTop < open.vh;
  console.log('  drawer within the viewport: ' + onScreen
    + (onScreen ? '' : '   <-- the menu opened where the visitor cannot see it'));
  if (!onScreen) process.exitCode = 1;

  // and close again
  await s.send('Runtime.evaluate', {
    expression: "document.querySelector('label.nav-toggle').click(); 1", returnByValue: true,
  }, sessionId, 20000);
  await sleep(500);
  const closed = await step('closed', false);
  console.log('  menu closed : checked ' + closed.checked + '   drawer display ' + closed.drawerDisplay);
  if (closed.drawerDisplay !== 'none') { console.log('  DRAWER DID NOT CLOSE'); process.exitCode = 1; }

  if (process.exitCode) console.log('\n  the mobile menu is broken');
  else console.log('\n  menu opens on screen while scrolled, and closes again');
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
