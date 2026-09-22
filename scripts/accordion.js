/* accordion.js — a real slide on the FAQ accordion.
 *
 * A native <details> snaps. There is no height to transition, because the
 * content simply is not in flow until `open` flips, so CSS alone has nothing
 * to interpolate between.
 *
 * WHY NOT THE CSS-ONLY ROUTE. `::details-content` plus `interpolate-size:
 * allow-keywords` does this with no script, and it is the nicer answer — but
 * only in engines that ship both. Everywhere else the accordion would keep
 * snapping, so a client handing this to their visitors would get the effect on
 * some browsers and not others. This measures the two heights and animates
 * between them, which every engine with the Web Animations API can do.
 *
 * PROGRESSIVE, NOT DEFENSIVE. If this file never runs, or runs somewhere
 * without Element.animate, nothing is intercepted and <details> behaves
 * natively — open, closed, keyboard, find-in-page all still work. The script
 * only ever makes an already-working control smoother.
 *
 * Reduced motion is handled by NOT intercepting the click at all, so the
 * browser's own instant toggle is what a visitor who asked for less motion
 * gets. The preference is read live rather than cached, so turning it on
 * mid-session takes effect on the next click.
 */
(function () {
  'use strict';

  /* Deliberately unhurried: this was asked to feel like a slide, not a snap.
     Closing is a little quicker than opening — a panel that lingers on the way
     out reads as lag rather than as motion. */
  var OPEN_MS = 620;
  var CLOSE_MS = 540;
  var EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

  if (!document.querySelectorAll || !Element.prototype.animate) return;

  var motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  function prefersReduced() {
    return !!(motionQuery && motionQuery.matches);
  }

  function setup(det) {
    var summary = det.querySelector('summary');
    var body = det.querySelector('.acc__body');
    if (!summary || !body) return;

    var anim = null;
    var bodyAnim = null;

    function stop() {
      if (anim) { anim.cancel(); anim = null; }
      if (bodyAnim) { bodyAnim.cancel(); bodyAnim = null; }
    }

    function settle() {
      det.style.height = '';
      det.style.overflow = '';
      anim = null;
      bodyAnim = null;
    }

    /* offsetHeight reports the CURRENT animated height mid-flight, so an
       interrupted click carries on from where the panel actually is rather
       than jumping to a remembered value. */
    function slide(from, to, ms, onDone) {
      stop();
      det.style.overflow = 'hidden';
      det.style.height = from + 'px';
      anim = det.animate({ height: [from + 'px', to + 'px'] }, { duration: ms, easing: EASE });
      anim.onfinish = function () { onDone(); settle(); };
      anim.oncancel = function () { anim = null; };
    }

    function fadeBody(inward, ms) {
      bodyAnim = body.animate(
        inward
          ? { opacity: [0, 1], transform: ['translateY(-6px)', 'none'] }
          : { opacity: [1, 0], transform: ['none', 'translateY(-6px)'] },
        { duration: ms, easing: EASE }
      );
    }

    function openPanel() {
      var from = det.offsetHeight;
      det.open = true;                 // content enters flow, so a target exists
      det.classList.remove('is-closing');
      var to = det.offsetHeight;
      slide(from, to, OPEN_MS, function () {});
      fadeBody(true, OPEN_MS);
    }

    function closePanel() {
      var from = det.offsetHeight;
      /* is-closing flips the +/- marker and the summary colour immediately.
         `open` has to stay true for the whole collapse or the content would
         vanish on frame one and there would be nothing to slide. */
      det.classList.add('is-closing');
      var to = summary.offsetHeight;
      slide(from, to, CLOSE_MS, function () {
        det.open = false;
        det.classList.remove('is-closing');
      });
      fadeBody(false, CLOSE_MS);
    }

    summary.addEventListener('click', function (e) {
      if (prefersReduced()) return;    // let the browser do its instant toggle
      e.preventDefault();
      if (det.classList.contains('is-closing') || !det.open) openPanel();
      else closePanel();
    });
  }

  var panels = document.querySelectorAll('.acc details');
  for (var i = 0; i < panels.length; i++) setup(panels[i]);
})();
