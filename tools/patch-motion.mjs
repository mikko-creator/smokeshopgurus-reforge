// Wire the hero image, the scroll reveals and reveal.js into the generator.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
let g = fs.readFileSync(P, 'utf8');
const D = '$';
let n = 0;
const swap = (name, from, to) => {
  if (!g.includes(from)) { console.log('  MISS ' + name); return; }
  g = g.split(from).join(to);
  n++; console.log('  ok   ' + name);
};

// --- 1. the hero image ---------------------------------------------------
swap('hero image',
  "const hero = gen('hero-gunmetal-anvil');",
  "const hero = gen('hero-vape-vapor');");

// --- 2. reveal.js --------------------------------------------------------
swap('reveal script',
  '  <script src="/scripts/shop.js" defer></script>',
  '  <script src="/scripts/shop.js" defer></script>\n  <script src="/scripts/reveal.js" defer></script>');

// --- 3. product cards reveal, staggered by grid index --------------------
// The stagger caps at 8 so the last card in an 82-item grid is not still
// waiting four seconds after the first one landed.
swap('productCard signature',
  'function productCard(p) {',
  'function productCard(p, idx) {');
swap('productCard element',
  '  return `<article class="pcard" data-price-cents=',
  '  const i = Math.min(Number(idx) || 0, 8);\n  return `<article class="pcard" data-reveal style="--i:' + D + '{i}" data-price-cents=');
swap('productGrid map',
  '        ${list.map(productCard).join(\'\\n        \')}',
  '        ${list.map((p, i) => productCard(p, i)).join(\'\\n        \')}');

// --- 4. category tiles ---------------------------------------------------
swap('tile element',
  '    return `<article class="tile">',
  '    return `<article class="tile" data-reveal style="--i:' + D + '{Math.min(i, 8)}">');
swap('tile map index',
  '  const tiles = h.tiles.map((t) => {',
  '  const tiles = h.tiles.map((t, i) => {');

// --- 5. section heads, badges, FAQ, prose -------------------------------
swap('section heads',
  '      <div class="sec__head">',
  '      <div class="sec__head" data-reveal>');
swap('badges',
  '        ${h.badges.map((b) => `<div class="badge">',
  '        ${h.badges.map((b, i) => `<div class="badge" data-reveal style="--i:' + D + '{i}">');
swap('faq accordion',
  '      <div class="acc">\n        ${h.faqs.map',
  '      <div class="acc" data-reveal>\n        ${h.faqs.map');
swap('prose blocks',
  '      <div class="prose">',
  '      <div class="prose" data-reveal>');

fs.writeFileSync(P, g);
console.log('applied ' + n + ' patch(es)');
