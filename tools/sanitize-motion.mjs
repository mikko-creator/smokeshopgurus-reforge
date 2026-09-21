// sanitize-motion.mjs — strip platform identifiers out of motion.css COMMENTS.
//
// sr-motion annotates each captured rule with the DOM path it was measured on,
// and on a Shopify source those paths contain "#shopify-section-…". The rules
// themselves are placeholders (.REPLACE-ME); only the provenance comment names
// the platform. That is still a surviving trace, and sr-decontaminate is right
// to fail it.
//
// Only comment TEXT is rewritten. Declarations and @keyframes bodies are left
// byte-for-byte alone, because C11 asserts every source keyframe is present
// verbatim — this must not be able to touch one.
//
// Re-run after any sr-motion run.  node tools/sanitize-motion.mjs [--check]

import fs from 'node:fs';

const FILE = 'src/styles/motion.css';
const CHECK = process.argv.includes('--check');
const src = fs.readFileSync(FILE, 'utf8');

const BEFORE_KF = (src.match(/@keyframes/g) || []).length;

// Platform tokens sr-decontaminate scans for, as they appear inside selector paths.
const PLATFORM = /(#?shopify-section[\w-]*|shopify-section|shopify-block|\bshopify\b)/gi;

let touched = 0;
const out = src.replace(/\/\*[\s\S]*?\*\//g, (comment) => {
  if (!PLATFORM.test(comment)) return comment;
  PLATFORM.lastIndex = 0;
  touched++;
  return comment.replace(PLATFORM, 'section');
});

const AFTER_KF = (out.match(/@keyframes/g) || []).length;
if (AFTER_KF !== BEFORE_KF) {
  console.error('REFUSING: keyframe count changed ' + BEFORE_KF + ' -> ' + AFTER_KF);
  process.exit(2);
}

// Prove no declaration changed: compare everything OUTSIDE comments, byte for byte.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
if (strip(src) !== strip(out)) {
  console.error('REFUSING: content outside comments changed');
  process.exit(2);
}

if (CHECK) {
  console.log(touched + ' comment(s) would be rewritten; keyframes ' + BEFORE_KF + ' unchanged');
  process.exit(touched ? 1 : 0);
}

fs.writeFileSync(FILE, out);
console.log('sanitised ' + touched + ' comment(s) in ' + FILE);
console.log('keyframes ' + BEFORE_KF + ' unchanged; no declaration touched');
