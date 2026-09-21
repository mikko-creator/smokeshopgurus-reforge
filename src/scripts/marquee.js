/* marquee.js — the Best Seller strip's two behaviours.
 *
 * 1. INFINITE MANUAL SCROLL. The strip auto-scrolls in an endless loop, but that
 *    loop is a CSS transform; the scrollbar underneath it has an ordinary,
 *    finite range. Drag to the last product and you hit a wall. This wraps the
 *    scroll position so the first product follows the last with no edge at all.
 *
 *    The track holds the seven products TWICE, so layout repeats every copy
 *    width. Position x and position x + copyWidth therefore show pixel-identical
 *    content — which means subtracting one copy width the moment the scroll
 *    passes it is invisible. It stays invisible while the auto-animation runs,
 *    because that is a constant offset at any instant and the content still
 *    repeats with the same period underneath it.
 *
 *    The jump MUST be instant. The document sets scroll-behavior: smooth, so if
 *    that ever reaches this element the wrap would glide across a whole copy in
 *    full view. The stylesheet pins the strip to `auto`; this is why.
 *
 * 2. CENTRE HIGHLIGHT. Whichever product is crossing the middle is enlarged, and
 *    hands the emphasis to the next as it passes.
 *
 * PROGRESSIVE. html.js-marquee is added only by this file. Without it nothing is
 * dimmed or scaled and the strip is an ordinary scroller — every product still
 * visible, legible and reachable.
 */
(function () {
  'use strict';

  var strip = document.querySelector('.marquee');
  var track = document.querySelector('.marquee__track');
  if (!strip || !track) return;

  var cards = Array.prototype.slice.call(strip.querySelectorAll('.mcard'));
  if (cards.length < 2) return;

  /* One copy = half the cards. Measured from offsetLeft rather than assumed from
     a width, so a change to the card size or its margin cannot desynchronise
     this from the CSS. */
  var half = cards.length / 2;
  var copyWidth = Math.round(cards[half].offsetLeft - cards[0].offsetLeft);
  if (!copyWidth || copyWidth < 1) return;

  // ---------------------------------------------------------------- 1. wrap
  var wrapping = false;
  var lastX = strip.scrollLeft;
  var idle = null;

  function onScroll() {
    if (wrapping) return;
    var x = strip.scrollLeft;

    if (x >= copyWidth) {
      /* past the end of the first copy — step back one copy. The content there
         is identical, so nothing on screen changes. */
      wrapping = true;
      strip.scrollLeft = x - copyWidth;
      wrapping = false;
    } else if (x <= 0 && lastX > 0) {
      /* Arrived at the start travelling left: jump forward a copy so there is
         somewhere to keep going.
         copyWidth - 1, NOT copyWidth. Landing exactly on copyWidth satisfies the
         `x >= copyWidth` test above, so the very next scroll event wrapped it
         straight back to 0 and the two rules cancelled each other out — the
         strip simply refused to pass the start. One pixel inside the boundary
         is the whole fix. */
      wrapping = true;
      strip.scrollLeft = copyWidth - 1;
      wrapping = false;
    }
    lastX = strip.scrollLeft;

    /* Hold the auto-travel while a hand is on it. Without this the transform
       keeps sliding the products under the very gesture trying to move them,
       and the strip feels like it is fighting back. */
    track.classList.add('is-dragging');
    if (idle) clearTimeout(idle);
    idle = setTimeout(function () { track.classList.remove('is-dragging'); }, 1100);
  }

  strip.addEventListener('scroll', onScroll, { passive: true });

  // ------------------------------------------------------ 2. centre highlight
  if (!('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('js-marquee');

  var live = [];
  var current = null;

  function settle() {
    if (!live.length) return;
    var r = strip.getBoundingClientRect();
    var target = r.left + r.width / 2;
    var best = null, bestDist = Infinity;
    for (var i = 0; i < live.length; i++) {
      var b = live[i].getBoundingClientRect();
      var d = Math.abs(b.left + b.width / 2 - target);
      if (d < bestDist) { bestDist = d; best = live[i]; }
    }
    if (best && best !== current) {
      if (current) current.classList.remove('is-focus');
      best.classList.add('is-focus');
      current = best;
    }
  }

  /* The observer says WHICH cards are in the band; it cannot say which is
     nearest the middle right now, because it only speaks when a threshold is
     crossed. Between crossings the strip keeps moving, so a card held the
     highlight up to 168px past centre before the next one tripped it. The
     choice is re-made on a frame loop that runs only while something is in the
     band and measures only the one or two cards that are. */
  var ticking = false;
  function pump() {
    if (!live.length) { ticking = false; return; }
    settle();
    requestAnimationFrame(pump);
  }
  function wake() {
    if (ticking || !live.length) return;
    ticking = true;
    requestAnimationFrame(pump);
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var el = entries[i].target;
      var at = live.indexOf(el);
      if (entries[i].isIntersecting) {
        if (at === -1) live.push(el);
      } else if (at !== -1) {
        live.splice(at, 1);
      }
    }
    settle();
    wake();
  }, {
    root: strip,
    rootMargin: '0px -47% 0px -47%',
    threshold: 0
  });

  for (var i = 0; i < cards.length; i++) io.observe(cards[i]);
})();
