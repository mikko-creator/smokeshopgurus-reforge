// css-slim.mjs — strip the commentary out of the SHIPPED stylesheets.
//
// src/styles/ is heavily commented on purpose: the reasoning is the handover.
// None of it needs to travel to a phone. 44KB of the 118KB served is comments,
// and because comments compress well in isolation but still cost, the gzipped
// CSS goes 26.9KB -> 12.0KB. That is 55% of the stylesheet transfer on a page
// whose initial mobile payload is 432KB, so CSS is the second-largest item
// after fonts.
//
// It runs on dist/ only. src/ is never touched, so the documentation survives
// exactly where a maintainer looks for it.
//
// NOT A REGEX. `/\/\*[\s\S]*?\*\//g` is wrong on CSS: a `/*` inside a string or
// an unquoted url() is content, not a comment, and deleting from there to the
// next `*/` silently eats real declarations. This walks the text and tracks
// whether it is inside a string or a url(), which is the only way to know what
// a `/*` means. `/*!` is preserved by convention for licence banners.
//
//   node tools/css-slim.mjs [--dir dist/styles] [--check]

import fs from 'node:fs';
import path from 'node:path';

const dirIdx = process.argv.indexOf('--dir');
const DIR = dirIdx > -1 ? process.argv[dirIdx + 1] : path.join('dist', 'styles');
const CHECK = process.argv.includes('--check');

function slim(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];

    // string — copy verbatim, honouring backslash escapes
    if (c === '"' || c === "'") {
      const quote = c;
      out += c; i++;
      while (i < n) {
        if (css[i] === '\\') { out += css[i] + (css[i + 1] || ''); i += 2; continue; }
        out += css[i];
        if (css[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }

    // url( ... ) — opaque until the matching paren, because an unquoted url may
    // contain characters that mean something else everywhereise in CSS
    if (c === 'u' && /^url\(/i.test(css.slice(i, i + 4))) {
      const close = css.indexOf(')', i);
      if (close === -1) { out += css.slice(i); break; }
      out += css.slice(i, close + 1);
      i = close + 1;
      continue;
    }

    // comment
    if (c === '/' && css[i + 1] === '*') {
      if (css[i + 2] === '!') {           // /*! licence banner — keep
        const end = css.indexOf('*/', i + 2);
        if (end === -1) { out += css.slice(i); break; }
        out += css.slice(i, end + 2);
        i = end + 2;
        continue;
      }
      const end = css.indexOf('*/', i + 2);
      if (end === -1) { i = n; break; }   // unterminated: drop the rest
      out += ' ';                          // a comment can separate tokens
      i = end + 2;
      continue;
    }

    out += c;
    i++;
  }

  // Collapse whitespace runs to a single space, then drop the spaces that can
  // never be significant. Spaces around ':' are LEFT ALONE on purpose: in a
  // selector `a :hover` is a descendant combinator and `a:hover` is not, and
  // telling those apart needs a full selector parser rather than a rule of thumb.
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim() + '\n';
}

if (!fs.existsSync(DIR)) {
  console.error('no such directory: ' + DIR);
  process.exit(2);
}

let rawBefore = 0, rawAfter = 0, files = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.css')) continue;
  const p = path.join(DIR, f);
  const src = fs.readFileSync(p, 'utf8');
  const out = slim(src);
  rawBefore += src.length;
  rawAfter += out.length;
  files++;
  if (!CHECK) fs.writeFileSync(p, out);
  console.log('  ' + f.padEnd(14)
    + String((src.length / 1024).toFixed(1)).padStart(7) + ' KB -> '
    + String((out.length / 1024).toFixed(1)).padStart(7) + ' KB');
}
console.log('  ' + files + ' file(s)  ' + (rawBefore / 1024).toFixed(1) + ' KB -> '
  + (rawAfter / 1024).toFixed(1) + ' KB'
  + (CHECK ? '   (--check: nothing written)' : '')
  + '   saves ' + ((rawBefore - rawAfter) / 1024).toFixed(1) + ' KB');
