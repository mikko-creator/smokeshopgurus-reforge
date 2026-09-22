// probe-rail.mjs — is the mobile Latest Products rail actually a carousel?
//
// Four separate claims, because a horizontal scroller can satisfy any one of
// them and still be broken:
//
//   IT SCROLLS       the box overflows and scrollLeft can move. A flex row that
//                    fits is not a carousel, it is a squashed grid.
//   EVERY CARD IS
//   REACHABLE        driven to the far end, the LAST card's right edge sits
//                    inside the visible box. A rail that runs out of scroll
//                    range before its last item hides stock.
//   IT SNAPS         released between two cards, a card edge comes to rest on
//                    the rail's content edge. Without this the strip parks
//                    mid-card and reads as broken rather than scrollable.
//   THE CARDS ARE
//   VISIBLE          every card ends up revealed. The cards start at opacity 0
//                    and are revealed by an IntersectionObserver that is
//                    clipped by the rail itself, so a card that scrolls in from
//                    the right has to trip it or it arrives blank.
//
// It also measures what the change was FOR: the section's height as a multiple
// of the viewport, against the 5.67 screens it cost before.
//
// --control removes the rail class first, which must turn the verdict red — a
// probe that cannot fail proves nothing.
//
//   node tools/probe-rail.mjs <url> [viewport] [--control]

import { launch, Session, sleep } from './cdp.mjs';

const url = process.argv[2] || 'http://127.0.0.1:8788/';
const vw = Number(process.argv[3] || 390);
const vh = Number(process.argv[4] || 844);
const CONTROL = process.argv.includes('--control');

const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride',
    { width: vw, height: vh, deviceScaleFactor: 1, mobile: vw < 768 }, sessionId);
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: vw < 768, maxTouchPoints: 5 }, sessionId).catch(() => {});
  await s.send('Page.addScriptToEvaluateOnNewDocument',
    { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const loaded = s.once('Page.loadEventFired', 60000).catch(() => null);
  await s.send('Page.navigate', { url }, sessionId, 60000);
  await loaded;
  await sleep(2200);

  if (CONTROL) {
    await s.send('Runtime.evaluate', {
      expression: "document.querySelectorAll('.grid--rail').forEach(function(r){ r.classList.remove('grid--rail'); }); 1",
      returnByValue: true,
    }, sessionId, 15000);
    await sleep(400);
  }

  const res = JSON.parse((await s.send('Runtime.evaluate', {
    expression: `(function(){
      var secs = Array.prototype.slice.call(document.querySelectorAll('main section'));
      var sec = secs.filter(function(x){
        var t = x.querySelector('.sec__title'); return t && /Latest/.test(t.textContent);
      })[0];
      if (!sec) return JSON.stringify({ found: false });
      var g = sec.querySelector('.grid');
      var cs = getComputedStyle(g);
      var cards = Array.prototype.slice.call(g.querySelectorAll('.pcard'));
      var gr = g.getBoundingClientRect();
      return JSON.stringify({
        found: true,
        classes: g.className,
        display: cs.display,
        overflowX: cs.overflowX,
        snapType: cs.scrollSnapType,
        cards: cards.length,
        cardW: cards.length ? Math.round(cards[0].getBoundingClientRect().width) : 0,
        railW: Math.round(gr.width),
        scrollW: g.scrollWidth,
        clientW: g.clientWidth,
        maxScroll: g.scrollWidth - g.clientWidth,
        secH: Math.round(sec.getBoundingClientRect().height),
        screens: +(sec.getBoundingClientRect().height / innerHeight).toFixed(2),
        vh: innerHeight,
        docH: document.documentElement.scrollHeight,
        docOverflow: document.documentElement.scrollWidth - innerWidth,
        tabindex: g.getAttribute('tabindex'),
        role: g.getAttribute('role'),
        ariaLabel: g.getAttribute('aria-label')
      });
    })()`, returnByValue: true,
  }, sessionId, 25000)).result.value);

  const tag = CONTROL ? '  [CONTROL: rail class removed]' : '';
  console.log('Latest Products rail — @' + vw + 'x' + res.vh + tag);
  if (!res.found) { console.log('  NOTHING MEASURED — no Latest Products section'); process.exit(2); }

  console.log('  class      ' + res.classes);
  console.log('  display    ' + res.display + '   overflow-x ' + res.overflowX + '   snap ' + res.snapType);
  console.log('  cards      ' + res.cards + '   card ' + res.cardW + 'px   rail ' + res.railW + 'px');
  console.log('  scroll     content ' + res.scrollW + ' in ' + res.clientW + '   range ' + res.maxScroll + 'px');
  console.log('  section    ' + res.secH + 'px  (' + res.screens + ' screens of a ' + res.vh + 'px viewport)');
  console.log('  document   ' + res.docH + 'px   horizontal overflow ' + res.docOverflow + 'px');
  console.log('  a11y       tabindex=' + res.tabindex + '  role=' + res.role + '  label=' + JSON.stringify(res.ariaLabel));

  const fails = [];
  const isCarousel = res.display === 'flex' && res.overflowX === 'auto';
  if (!isCarousel) fails.push('not a horizontal scroller (display ' + res.display + ', overflow-x ' + res.overflowX + ')');
  if (res.maxScroll <= 0) fails.push('nothing to scroll — the row fits, so it is not a carousel');
  if (res.docOverflow > 0) fails.push('the DOCUMENT scrolls sideways by ' + res.docOverflow + 'px');

  // ---- drive it to the end: is the last card reachable? ---------------------
  if (res.maxScroll > 0) {
    /* Bring the section into the viewport FIRST. The reveal observer's root is
       the window, so with the page still at the top nothing in a section 6,000
       pixels down can ever intersect — the first run of this probe reported
       "0 of 8 revealed" for that reason and not because the rail was broken. */
    await s.send('Runtime.evaluate', {
      expression: `new Promise(function(r){
        var secs = Array.prototype.slice.call(document.querySelectorAll('main section'));
        var sec = secs.filter(function(x){ var t=x.querySelector('.sec__title'); return t && /Latest/.test(t.textContent); })[0];
        var target = sec.getBoundingClientRect().top + window.scrollY - 60;
        var y = 0, step = Math.round(innerHeight * 0.75);
        (function go(){
          window.scrollTo(0, Math.min(y, target));
          if (y >= target) { setTimeout(r, 1200); return; }
          y += step; setTimeout(go, 110);
        })();
      })`, returnByValue: true, awaitPromise: true,
    }, sessionId, 60000);

    const reach = JSON.parse((await s.send('Runtime.evaluate', {
      expression: `new Promise(function(done){
        var g = document.querySelector('.grid--rail') ||
                Array.prototype.slice.call(document.querySelectorAll('main section .grid')).pop();
        var cards = Array.prototype.slice.call(g.querySelectorAll('.pcard'));
        var last = cards[cards.length - 1];
        // step through in card-sized moves, the way a thumb would
        var step = Math.round(g.clientWidth * 0.8), x = 0, seen = 0;
        function go() {
          g.scrollLeft = x;
          var revealed = cards.filter(function(c){ return c.classList.contains('is-in'); }).length;
          if (revealed > seen) seen = revealed;
          if (x >= g.scrollWidth - g.clientWidth) {
            setTimeout(function () {
              var gr = g.getBoundingClientRect(), lr = last.getBoundingClientRect();
              var revealedNow = cards.filter(function(c){ return c.classList.contains('is-in'); }).length;
              // now release between two cards and let snapping decide
              g.scrollLeft = Math.round((g.scrollWidth - g.clientWidth) / 2) + 37;
              setTimeout(function () {
                var restX = g.scrollLeft;
                var edges = cards.map(function(c){
                  return Math.round(c.getBoundingClientRect().left - g.getBoundingClientRect().left
                    - parseFloat(getComputedStyle(g).paddingLeft));
                });
                var nearest = edges.reduce(function(a, e){ return Math.min(a, Math.abs(e)); }, Infinity);
                done(JSON.stringify({
                  lastRight: Math.round(lr.right), railRight: Math.round(gr.right),
                  lastInside: lr.right <= gr.right + 1,
                  revealed: revealedNow, total: cards.length,
                  restX: Math.round(restX), snapOffset: nearest
                }));
              }, 900);
            }, 700);
            return;
          }
          x = Math.min(x + step, g.scrollWidth - g.clientWidth);
          setTimeout(go, 260);
        }
        go();
      })`, returnByValue: true, awaitPromise: true,
    }, sessionId, 60000)).result.value);

    console.log('  reach      last card right ' + reach.lastRight + ' vs rail right ' + reach.railRight
      + '   ' + (reach.lastInside ? 'fully reachable' : 'UNREACHABLE'));
    console.log('  revealed   ' + reach.revealed + ' of ' + reach.total + ' cards visible after scrolling through');
    console.log('  snap       released at an offset, came to rest ' + reach.snapOffset + 'px from a card edge');

    if (!reach.lastInside) fails.push('the last card cannot be scrolled fully into view');
    if (reach.revealed < reach.total) fails.push((reach.total - reach.revealed) + ' card(s) never became visible');
    if (reach.snapOffset > 2) fails.push('does not snap — rests ' + reach.snapOffset + 'px from the nearest card edge');
  }

  console.log('');
  if (fails.length) {
    for (const f of fails) console.log('  FAIL  ' + f);
    console.log('  ' + fails.length + ' problem(s)' + (CONTROL ? '   <- expected: the control must fail' : ''));
    process.exitCode = CONTROL ? 0 : 1;
  } else {
    console.log('  a real carousel: it scrolls, every card is reachable and visible, and it snaps');
    if (CONTROL) { console.log('  CONTROL PASSED WHEN IT SHOULD HAVE FAILED — this probe proves nothing'); process.exitCode = 1; }
  }
} finally {
  s.close();
  try { browser.proc.kill(); } catch { /* gone */ }
}
