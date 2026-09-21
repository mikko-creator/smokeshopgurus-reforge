// solve-tint.mjs — what alpha does a glass pane need to keep its text legible
// over the WORST backdrop it can sit on?
//
// The masthead is sticky over the whole document, so the worst case is not the
// dark page — it is a white product photo scrolling underneath it. This solves
// for the minimum tint alpha rather than guessing one and re-measuring.
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const cr = (a, b) => { const [h, l] = a > b ? [a, b] : [b, a]; return (h + 0.05) / (l + 0.05); };
const over = (fg, a, bg) => hex(fg).map((c, i) => c * a + hex(bg)[i] * (1 - a));

const TINT = '#181e23';           // --gm-800, the glass tint colour
const WORST_BACKDROP = '#e9eef1'; // --gm-050, the product media well: the brightest thing that scrolls under the masthead

const CASES = [
  { name: 'nav link      --gm-100 13px', fg: '#c8d1d7', need: 4.5 },
  { name: 'brand name    --gm-000 20px bold', fg: '#f7fafb', need: 3 },
  { name: 'strip link    --gm-150 12px', fg: '#b6c0c7', need: 4.5 },
  { name: 'card vendor   --gm-300 12px', fg: '#78868f', need: 4.5 },
];

console.log('minimum tint alpha over the worst backdrop (' + WORST_BACKDROP + ')');
let needed = 0;
for (const c of CASES) {
  let found = null;
  for (let a = 0.30; a <= 1.0001; a += 0.01) {
    const bg = over(TINT, a, WORST_BACKDROP);
    if (cr(lum(hex(c.fg)), lum(bg)) >= c.need) { found = a; break; }
  }
  if (found !== null) needed = Math.max(needed, found);
  console.log('  ' + c.name.padEnd(34) + (found === null ? 'never reaches ' + c.need : 'alpha >= ' + found.toFixed(2)));
}
console.log('\n  masthead needs alpha >= ' + needed.toFixed(2) + ' to hold every label over a white photo');

// and what the current values give
for (const a of [0.39, 0.56, 0.72, 0.80]) {
  const bg = over(TINT, a, WORST_BACKDROP);
  const nav = cr(lum(hex('#c8d1d7')), lum(bg));
  const brand = cr(lum(hex('#f7fafb')), lum(bg));
  console.log('  alpha ' + a.toFixed(2) + '  ->  nav ' + nav.toFixed(2) + ':1   brand ' + brand.toFixed(2) + ':1');
}

// the card case sits over the DARK page, not a photo
console.log('\ncard vendor --gm-300 over the dark page (--gm-950 #0a0d10):');
for (const a of [0.39, 0.50, 0.56, 0.62]) {
  const bg = over(TINT, a, '#0a0d10');
  console.log('  tint alpha ' + a.toFixed(2) + '  ->  ' + cr(lum(hex('#78868f')), lum(bg)).toFixed(2) + ':1   (need 4.5)');
}
