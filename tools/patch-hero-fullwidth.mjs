// patch-hero-fullwidth.mjs — take the hero full-bleed, by class not by nesting.
//
// The hero sat inside .shell, so it was capped at 1280px with a rounded card edge.
// Rather than re-nest the markup (easy to get wrong, hard to reverse), the outer
// wrapper simply stops being a .shell and the inner content becomes one. CSS does
// the rest.
//
// NOT width:100vw — 100vw includes the scrollbar, which would push the document
// ~15px past the viewport on desktop and reintroduce the horizontal-scroll defect
// the responsive sweep just cleared.
import fs from 'node:fs';

const P = 'tools/generate.mjs';
const lines = fs.readFileSync(P, 'utf8').split('\n');
let n = 0;

const at = (i, from, to, name) => {
  if (!lines[i] || !lines[i].includes(from)) { console.log('  MISS ' + name + ' @' + (i + 1) + ': ' + (lines[i] || '').trim().slice(0, 70)); return; }
  lines[i] = lines[i].replace(from, to);
  n++;
  console.log('  ok   ' + name + ' @' + (i + 1));
};

// --- homepage hero: the section that opens the body ---
const homeIdx = lines.findIndex((l) => l.includes('const body = `    <section class="shell">'));
if (homeIdx >= 0) {
  at(homeIdx, '<section class="shell">', '<section class="hero-wrap">', 'home hero wrapper');
  const inner = lines.findIndex((l, i) => i > homeIdx && i < homeIdx + 6 && l.includes('<div class="hero__inner">'));
  if (inner >= 0) at(inner, '<div class="hero__inner">', '<div class="hero__inner shell">', 'home hero inner');
} else { console.log('  MISS home hero wrapper (section not found)'); }

// --- collection hero ---
const colIdx = lines.findIndex((l) => l.includes('<div class="hero" style="margin-top:0">'));
if (colIdx >= 0) {
  // the wrapper is the line above it
  at(colIdx - 1, '<section class="shell sec" style="margin-top:0">', '<section class="hero-wrap sec" style="margin-top:0">', 'collection hero wrapper');
} else { console.log('  MISS collection hero wrapper'); }

fs.writeFileSync(P, lines.join('\n'));
console.log('applied ' + n + ' change(s)');
