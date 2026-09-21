/* site.js — the only script this build ships.
 *
 * Two jobs, both progressive: the 21+ gate and the product gallery. The nav
 * drawer and the accordions are CSS and <details>, so they keep working with
 * this file blocked.
 */
(function () {
  'use strict';

  /* --- 21+ gate --------------------------------------------------------
     The markup ships hidden and is only revealed here, because a gate that
     cannot be dismissed is worse than no gate at all: without script it would
     cover the page forever. Remembered per browser, never sent anywhere. */
  var KEY = 'ssg.age.ok';
  var gate = document.getElementById('agegate');
  if (gate) {
    var ok = false;
    try { ok = localStorage.getItem(KEY) === '1'; } catch (e) { ok = false; }
    if (!ok) {
      gate.setAttribute('data-open', 'true');
      document.body.style.overflow = 'hidden';
      var yes = gate.querySelector('[data-age="yes"]');
      var no = gate.querySelector('[data-age="no"]');
      if (yes) yes.focus();
      gate.addEventListener('click', function (e) {
        var t = e.target.closest('[data-age]');
        if (!t) return;
        if (t.getAttribute('data-age') === 'yes') {
          try { localStorage.setItem(KEY, '1'); } catch (err) { /* private mode */ }
          gate.removeAttribute('data-open');
          document.body.style.overflow = '';
        } else {
          gate.querySelector('.agegate__panel').innerHTML =
            '<h2>Come back when you are 21</h2><p class="muted">You must be 21 or older to use this site.</p>';
        }
      });
      /* Trap focus inside the dialog while it is open. */
      gate.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var f = gate.querySelectorAll('button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
  }

  /* --- product gallery ------------------------------------------------- */
  var main = document.getElementById('pdp-main');
  var thumbs = document.querySelector('.pdp__thumbs');
  if (main && thumbs) {
    var swap = function (el) {
      var full = el.getAttribute('data-full');
      if (full) main.setAttribute('src', full);
    };
    thumbs.addEventListener('click', function (e) {
      if (e.target.tagName === 'IMG') swap(e.target);
    });
    thumbs.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'IMG') {
        e.preventDefault(); swap(e.target);
      }
    });
  }

  /* --- nav panels ------------------------------------------------------
     The panels open on :hover and :focus-within in CSS. This only keeps
     aria-expanded truthful for assistive tech, and lets Escape close one. */
  var items = document.querySelectorAll('.nav__item');
  Array.prototype.forEach.call(items, function (item) {
    var btn = item.querySelector('button.nav__link');
    if (!btn) return;
    var sync = function (v) { btn.setAttribute('aria-expanded', v ? 'true' : 'false'); };
    item.addEventListener('mouseenter', function () { sync(true); });
    item.addEventListener('mouseleave', function () { sync(false); });
    item.addEventListener('focusin', function () { sync(true); });
    item.addEventListener('focusout', function () {
      if (!item.contains(document.activeElement)) sync(false);
    });
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { sync(false); btn.blur(); }
    });
  });
})();
