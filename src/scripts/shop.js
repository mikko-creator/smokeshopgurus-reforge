/* shop.js — quote basket, collection facets and catalogue search.
 *
 * These three replace Shopify features that were server-side on the source:
 * the cart notification, the faceted filter/sort on collection pages, and the
 * /search form. They are rebuilt as real client-side behaviour rather than
 * dropped, so the rebuild keeps the function as well as the words.
 *
 * Nothing here fabricates data. Stock state, prices and titles come from the
 * generated markup or from /search-index.json, both of which are derived from
 * the harvest. Where the harvest has no ranking signal — "Best selling",
 * "Most relevant", "Date" — the sort keeps the collection's published order
 * rather than inventing one.
 */
(function () {
  'use strict';

  /* --- basket ---------------------------------------------------------- */
  var CART = 'ssg.cart.v1';
  function read() {
    try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch (e) { return []; }
  }
  function save(items) {
    try { localStorage.setItem(CART, JSON.stringify(items)); } catch (e) { /* private mode */ }
    paintCount(items);
  }
  function paintCount(items) {
    var n = (items || read()).reduce(function (a, b) { return a + (b.qty || 1); }, 0);
    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-count]'), function (el) {
      el.textContent = String(n);
    });
  }
  paintCount();

  var note = document.getElementById('cartnote');
  var noteItem = document.getElementById('cartnote-item');
  var noteTimer = null;
  function announce(title) {
    if (!note) return;
    if (noteItem) noteItem.textContent = title;
    note.hidden = false;
    note.setAttribute('data-open', 'true');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      note.removeAttribute('data-open');
      note.hidden = true;
    }, 5000);
  }
  if (note) {
    note.addEventListener('click', function (e) {
      if (e.target.closest('[data-cartnote-close]')) {
        note.removeAttribute('data-open');
        note.hidden = true;
      }
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    var handle = btn.getAttribute('data-add');
    var items = read();
    var found = null;
    for (var i = 0; i < items.length; i++) { if (items[i].handle === handle) found = items[i]; }
    if (found) { found.qty = (found.qty || 1) + 1; }
    else {
      items.push({
        handle: handle,
        title: btn.getAttribute('data-title') || handle,
        price: btn.getAttribute('data-price') || '',
        qty: 1
      });
    }
    save(items);
    announce(btn.getAttribute('data-title') || handle);
  });

  /* --- basket page ----------------------------------------------------- */
  var table = document.querySelector('[data-cart-table]');
  if (table) {
    var emptyEl = document.querySelector('[data-cart-empty]');
    var formEl = document.querySelector('[data-cart-form]');
    var payload = document.querySelector('[data-cart-payload]');

    var paint = function () {
      var items = read();
      if (!items.length) {
        table.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        if (formEl) formEl.hidden = true;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      if (formEl) formEl.hidden = false;
      var rows = items.map(function (it) {
        return '<tr><th scope="row"><a href="/products/' + it.handle + '">' + it.title + '</a></th>'
          + '<td>' + it.price + '</td>'
          + '<td><button class="btn btn--sm" type="button" data-qty="-1" data-h="' + it.handle + '" aria-label="Decrease quantity">-</button>'
          + ' <span>' + it.qty + '</span> '
          + '<button class="btn btn--sm" type="button" data-qty="1" data-h="' + it.handle + '" aria-label="Increase quantity">+</button></td>'
          + '<td><button class="btn btn--sm" type="button" data-remove="' + it.handle + '">Remove</button></td></tr>';
      }).join('');
      table.innerHTML = '<table class="spec"><tbody>' + rows + '</tbody></table>';
      if (payload) {
        payload.value = items.map(function (i) {
          return i.qty + ' x ' + i.title + ' (' + i.price + ')';
        }).join('; ');
      }
    };

    table.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove]');
      var qty = e.target.closest('[data-qty]');
      var items = read();
      if (rm) {
        items = items.filter(function (i) { return i.handle !== rm.getAttribute('data-remove'); });
      } else if (qty) {
        var h = qty.getAttribute('data-h');
        var d = Number(qty.getAttribute('data-qty'));
        items.forEach(function (i) { if (i.handle === h) i.qty = Math.max(1, (i.qty || 1) + d); });
      } else { return; }
      save(items);
      paint();
    });
    paint();
  }

  /* --- collection facets ------------------------------------------------ */
  var fw = document.querySelector('[data-facets]');
  if (fw) {
    var grid = document.querySelector('.grid.grid--4');
    var cards = grid ? Array.prototype.slice.call(grid.querySelectorAll('.pcard')) : [];
    var order = cards.slice();
    var countEl = document.querySelector('[data-product-count]');
    var selEl = document.querySelector('[data-facet-count]');
    var minEl = fw.querySelector('[data-facet-min]');
    var maxEl = fw.querySelector('[data-facet-max]');
    var availBoxes = Array.prototype.slice.call(fw.querySelectorAll('[data-facet-avail]'));

    var apply = function () {
      var wanted = availBoxes.filter(function (b) { return b.checked; })
        .map(function (b) { return b.getAttribute('data-facet-avail'); });
      var lo = (minEl && minEl.value !== '') ? Number(minEl.value) * 100 : null;
      var hi = (maxEl && maxEl.value !== '') ? Number(maxEl.value) * 100 : null;
      var shown = 0;
      cards.forEach(function (c) {
        var a = c.getAttribute('data-available');
        var cents = Number(c.getAttribute('data-price-cents') || 0);
        var ok = true;
        if (wanted.length && wanted.indexOf(a) === -1) ok = false;
        if (ok && lo !== null && cents < lo) ok = false;
        if (ok && hi !== null && cents > hi) ok = false;
        c.hidden = !ok;
        if (ok) shown++;
      });
      if (countEl) countEl.textContent = String(shown);
      if (selEl) selEl.textContent = wanted.length + ' selected';
    };

    var sortBy = function (mode) {
      var arr = order.slice();
      var num = function (c) { return Number(c.getAttribute('data-price-cents') || 0); };
      var name = function (c) { return c.getAttribute('data-title') || ''; };
      if (mode === 'az') { arr.sort(function (a, b) { return name(a).localeCompare(name(b)); }); }
      else if (mode === 'za') { arr.sort(function (a, b) { return name(b).localeCompare(name(a)); }); }
      else if (mode === 'plh') { arr.sort(function (a, b) { return num(a) - num(b); }); }
      else if (mode === 'phl') { arr.sort(function (a, b) { return num(b) - num(a); }); }
      else if (mode === 'dno') { arr.reverse(); }
      arr.forEach(function (c) { if (grid) grid.appendChild(c); });
    };

    fw.addEventListener('change', function (e) {
      if (e.target.matches('[data-facet-avail]')) apply();
      if (e.target.matches('[data-sort]')) sortBy(e.target.value);
    });
    fw.addEventListener('click', function (e) {
      if (e.target.closest('[data-facet-apply]')) apply();
      if (e.target.closest('[data-facet-clear]')) {
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
        apply();
      }
      if (e.target.closest('[data-facet-reset="avail"]')) {
        availBoxes.forEach(function (b) { b.checked = false; });
        apply();
      }
      if (e.target.closest('[data-facet-reset="price"]')) {
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
        apply();
      }
      if (e.target.closest('[data-facet-removeall]')) {
        availBoxes.forEach(function (b) { b.checked = false; });
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
        apply();
      }
    });
    apply();
  }

  /* --- search ----------------------------------------------------------- */
  var results = document.querySelector('[data-search-results]');
  if (results) {
    var summary = document.querySelector('[data-search-summary]');
    var none = document.querySelector('[data-search-empty]');
    var q = new URLSearchParams(location.search).get('q') || '';
    var input = document.getElementById('search-page');
    if (input) input.value = q;
    if (!q) {
      if (summary) summary.textContent = 'Type a product name to search the catalogue.';
      return;
    }
    var link = document.getElementById('search-index-url');
    // .href on a <link> is already resolved against the document, so this works
    // from any directory the build is served out of.
    fetch(link ? link.href : 'search-index.json').then(function (r) { return r.json(); }).then(function (idx) {
      var needle = q.toLowerCase();
      var hits = idx.products.filter(function (p) {
        return (p.t + ' ' + p.v + ' ' + p.c).toLowerCase().indexOf(needle) !== -1;
      });
      if (summary) {
        summary.textContent = hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for "' + q + '"';
      }
      if (!hits.length) { if (none) none.hidden = false; return; }
      results.innerHTML = hits.map(function (p) {
        return '<article class="pcard">'
          + '<div class="pcard__media">' + (p.i ? '<img src="' + p.i + '" alt="' + p.t + '" loading="lazy" width="600" height="600">' : '') + '</div>'
          + '<div class="pcard__body">'
          + (p.v ? '<span class="pcard__vendor">' + p.v + '</span>' : '')
          + '<h3 class="pcard__title"><a href="/products/' + p.h + '">' + p.t + '</a></h3>'
          + '<p class="pcard__price">' + p.pr + '</p>'
          + (p.a
            ? '<button class="btn btn--sm btn--block" type="button" data-add="' + p.h + '" data-title="' + p.t + '" data-price="' + p.pr + '">Add to cart</button>'
            : '<p class="pcard__stock pcard__stock--out">Sold out</p>')
          + '</div></article>';
      }).join('');
    }).catch(function () {
      if (summary) summary.textContent = 'Search is unavailable right now.';
    });
  }
})();

/* --- product lightbox -------------------------------------------------
   The source opens each product image in a modal. <dialog> gives that for
   free, including the backdrop and Escape, so this only wires the source. */
(function () {
  'use strict';
  var dlg = document.querySelector('[data-lightbox]');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  // The <img> is created on first open. Shipping one with an empty src makes
  // the browser attempt a load of the page URL and report a broken image.
  var stage = dlg.querySelector('[data-lightbox-stage]');
  var img = null;
  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-zoom]');
    if (open) {
      if (!img) { img = new Image(); img.alt = ''; if (stage) stage.appendChild(img); }
      img.src = open.getAttribute('data-full');
      dlg.showModal();
      return;
    }
    if (e.target.closest('[data-lightbox-close]')) dlg.close();
  });
})();

/* --- sticky buy bar ---------------------------------------------------
   Revealed only once the main order panel leaves the viewport, so it never
   covers the control it duplicates. */
(function () {
  'use strict';
  var bar = document.querySelector('[data-sticky]');
  var panel = document.querySelector('.pdp__order');
  if (!bar || !panel || typeof IntersectionObserver !== 'function') return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { bar.hidden = en.isIntersecting; });
  }, { rootMargin: '0px 0px -40px 0px' });
  io.observe(panel);
})();
