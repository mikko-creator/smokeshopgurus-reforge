// contrast.mjs — WCAG 2.1 contrast ratios, computed here rather than believed.
//
// An accent ramp is a legibility decision before it is a taste decision: --acc-hi
// is link and price text on two different dark backgrounds. A proposal that says
// "4.8:1" and actually measures 3.2:1 ships unreadable prices, so every candidate
// ramp is recomputed from its own hex values before anything is written to CSS.
//
//   node tools/contrast.mjs "#16a06a" "#181e23" "#0a0d10"
//   node tools/contrast.mjs --ramp "#0f7a4f" "#21b37a" "#0a5436"

const hex = (h) => {
  const s = String(h).trim().replace(/^#/, '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  if (!/^[0-9a-fA-F]{6}$/.test(f)) throw new Error('bad hex: ' + h);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};

// sRGB -> linear, then relative luminance.
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const ratio = (a, b) => {
  const la = lum(hex(a)), lb = lum(hex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

const verdict = (r) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA-large only' : 'FAIL');

const args = process.argv.slice(2);

if (args[0] === '--ramp') {
  const [acc, accHi, accLo] = args.slice(1);
  const GM_800 = '#181e23';   // card / panel background
  const GM_950 = '#0a0d10';   // page background
  const GM_900 = '#0f1317';
  const WHITE = '#f7fafb';    // --gm-000, the text on a filled button
  const rows = [
    ['acc-hi on gm-800 (price/link on a card)', accHi, GM_800, 4.5],
    ['acc-hi on gm-950 (link on the page)', accHi, GM_950, 4.5],
    ['acc-hi on gm-900 (link on a sunk panel)', accHi, GM_900, 4.5],
    ['gm-000 on acc  (white text on a filled button)', WHITE, acc, 4.5],
    ['acc-lo vs gm-800 (pressed state is distinguishable)', accLo, GM_800, 1.3],
  ];
  let fails = 0;
  console.log('pair                                                  ratio   need   verdict');
  for (const [name, fg, bg, need] of rows) {
    const r = ratio(fg, bg);
    const ok = r >= need;
    if (!ok) fails++;
    console.log('  ' + name.padEnd(52) + r.toFixed(2).padStart(5) + '  ' + String(need).padStart(4)
      + '   ' + (ok ? 'ok ' : 'FAIL ') + verdict(r));
  }
  console.log(fails ? '\n' + fails + ' pairing(s) FAIL — do not ship this ramp as-is' : '\nall pairings pass');
  process.exitCode = fails ? 1 : 0;
} else if (args.length >= 2) {
  const [fg, ...bgs] = args;
  for (const bg of bgs) {
    const r = ratio(fg, bg);
    console.log(fg + ' on ' + bg + '  ' + r.toFixed(2) + ':1  ' + verdict(r));
  }
} else {
  console.log('usage: contrast.mjs <fg> <bg...>   |   contrast.mjs --ramp <acc> <accHi> <accLo>');
}
