/* rail.js — the mobile product rail's keyboard and screen-reader contract.
 *
 * The rail itself is pure CSS: at phone widths the Latest Products grid becomes
 * a horizontal snap carousel, and above 767px the class is inert. Nothing here
 * scrolls anything, and nothing here is required for the products to be
 * reachable — a visitor without JavaScript gets an ordinary scroller with all
 * eight products in it.
 *
 * What it does do is make the scroller keyboard-operable and announceable.
 * WCAG 2.1.1 asks that content reachable only by scrolling be reachable by
 * keyboard, and a div with overflow is NOT focusable by default, so the arrow
 * keys have nothing to act on. tabindex="0" gives it a focus stop and the
 * browser's own arrow-key scrolling does the rest.
 *
 * It is applied CONDITIONALLY, and that is the whole reason this file exists.
 * The same element is a plain 4-up grid on a desktop, where it does not scroll
 * at all — and a focus stop on something that cannot scroll is a dead tab stop
 * that tells a keyboard user nothing. So the attributes go on only while
 * scrollWidth actually exceeds clientWidth, and come off again when it does
 * not. That is re-checked on resize, because the breakpoint can be crossed by
 * rotating a phone or dragging a window.
 */
(function () {
  'use strict';

  var rails = Array.prototype.slice.call(document.querySelectorAll('.grid--rail'));
  if (!rails.length) return;

  function sync() {
    for (var i = 0; i < rails.length; i++) {
      var r = rails[i];
      /* 1px of slack: sub-pixel layout can leave scrollWidth a hair over
         clientWidth on a grid that is not actually scrollable. */
      var scrollable = r.scrollWidth - r.clientWidth > 1;

      if (scrollable && r.getAttribute('tabindex') !== '0') {
        var label = r.getAttribute('data-rail-label');
        r.setAttribute('tabindex', '0');
        r.setAttribute('role', 'group');
        r.setAttribute('aria-label', (label ? label + ', ' : '') + 'horizontally scrollable');
      } else if (!scrollable && r.hasAttribute('tabindex')) {
        r.removeAttribute('tabindex');
        r.removeAttribute('role');
        r.removeAttribute('aria-label');
      }
    }
  }

  sync();

  var t = null;
  window.addEventListener('resize', function () {
    if (t) clearTimeout(t);
    t = setTimeout(sync, 150);
  }, { passive: true });

  /* Card widths are a percentage of the rail, so they settle only once the
     fonts are in and the images have their boxes. Re-check then rather than
     trust the first frame. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
  window.addEventListener('load', sync);
})();
