/* reveal.js — scroll-in reveals.
 *
 * PROGRESSIVE, NOT DEFENSIVE. The CSS that hides an element is scoped to
 * html.js-reveal, and this file is the only thing that adds that class. It
 * adds it only after confirming IntersectionObserver exists AND that the
 * visitor has not asked for reduced motion. If this script never runs, or
 * runs on an engine without IO, the class is never added and every element
 * is simply visible. Content does not depend on a script to be readable.
 *
 * It also re-checks the motion preference live: a visitor who turns reduced
 * motion on mid-session gets everything revealed immediately rather than
 * being left with a page of invisible cards.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var els = [];

  function revealAll() {
    for (var i = 0; i < els.length; i++) els[i].classList.add('is-in');
    root.classList.remove('js-reveal');
  }

  function start() {
    els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!els.length) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!('IntersectionObserver' in window) || (reduced && reduced.matches)) return;

    root.classList.add('js-reveal');

    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);   // one-shot: reveals do not replay on scroll-up
      }
    }, {
      /* fire slightly before the element reaches the fold, so the animation
         has finished by the time it is actually being read */
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.01
    });

    for (var j = 0; j < els.length; j++) io.observe(els[j]);

    /* A tall viewport — a full-page screenshot, a very large window, print —
       can leave IO callbacks pending on the first frame. Anything still
       hidden after two frames is shown unconditionally. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var k = 0; k < els.length; k++) {
          var el = els[k];
          if (el.classList.contains('is-in')) continue;
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-in');
        }
      });
    });

    if (reduced && reduced.addEventListener) {
      reduced.addEventListener('change', function (ev) { if (ev.matches) revealAll(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
