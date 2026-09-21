// Repair the glass section of docs/BRAND-SYSTEM.md.
//
// It was written through a double-quoted shell string, where every backticked
// class name was swallowed as command substitution — the table came out with
// empty cells. Written from a file this time so nothing interprets the content.
import fs from 'node:fs';

const P = 'docs/BRAND-SYSTEM.md';
let d = fs.readFileSync(P, 'utf8');

const START = '### 4. Glass floats, metal is the chassis';
const i = d.indexOf(START);
if (i < 0) { console.error('glass section not found'); process.exit(2); }
const j = d.indexOf('\n---\n\n## Palette', i);
if (j < 0) { console.error('end of glass section not found'); process.exit(2); }

const section = `### 4. Glass floats, metal is the chassis

Glassmorphism and skeuomorphism are opposite material languages — translucent and
blurred against opaque and machined. They are reconciled here by making glass a
**pane laid on the metal**, never a replacement for it.

Glass is only for surfaces that FLOAT with something behind them worth glimpsing:

| glass | why |
|---|---|
| \`.masthead\` | sticky at top:0 with the whole document scrolling under it |
| \`.facets__panel\` (desktop only) | absolutely positioned over the product grid |
| \`.agegate\` scrim | the storefront frosts behind it; its panel stays metal |
| \`.lightbox::backdrop\` | the page frosts behind the light table |
| \`.cartnote__panel\` | slides in over scrolling content, at the LITE blur |
| \`.stickybuy\` | fixed over the product page |
| \`.hero__eyebrow\` | one pill sitting on the photograph |
| \`.btn--ghost\` | it already declared itself transparent |

Everything else stays opaque metal. Four surfaces **must never** be glass:

- **\`.pcard__media\`, \`.pdp__stage\`, \`.lightbox\`** — their images use
  \`mix-blend-mode: multiply\` against an opaque light box. Make the parent
  translucent and every product cut-out multiplies against the dark page and goes
  near-black. \`site.css\` already records this exact failure for \`.pdp__thumbs\`.
- **\`.disclaimer\`** — the block with legal weight. Legibility is not negotiable.
- **\`.nav__panel\`** — it is a DOM descendant of the glass \`.masthead\`. An element
  with a \`backdrop-filter\` becomes a Backdrop Root, so a descendant can only sample
  what that root painted; the panel hangs below the masthead's box, where that root
  painted nothing, and would blur an empty backdrop into a flat tinted rectangle.
  **Glass rail, machined drawer** — you cannot have both.
- **\`.tile\`, \`.pcard\`, \`.badge\`, \`.chip\`, \`.footer\`** — all sit in normal flow on
  the page background with nothing behind them. Blur there is cost with no effect,
  and a collection page carries up to 82 cards.

Three more traps, all avoided in the CSS and worth keeping avoided:

- The blur is **fallback-first**: the base rule is the no-backdrop-filter surface
  (\`--glass-tint-solid\`, contrast-identical to a real card) and the blur is added
  inside \`@supports\`. Never the other way round — an engine that drops the filter
  then inherits a readable pane rather than a transparent one.
- The tint is **dark** (\`--gm-800\` at 56%), not white. Over the dark shell it
  composites to \`#12171b\`, so accent text gains contrast on glass rather than
  losing it. A white tint would have killed \`--acc-hi\` text above about 8% alpha.
- **Never** \`will-change\` or \`contain: paint\` on a glass ancestor. Both create a
  containing block for \`position: fixed\`, which would re-anchor \`.stickybuy\`,
  \`.cartnote\` and \`.agegate\` and re-break the mega-panel overflow fix. The blur is
  already GPU-composited; the hint buys nothing and costs three working components.

Two blur strengths exist because they have to. \`--glass-blur\` is 14px, not something
showier, because \`body\` sets \`background-attachment: fixed\` — a heavy blur flattens
\`--grain\` to a dead tone and the pane stops parallaxing, which is why
\`--glass-noise\` puts a tooth back on the surface. \`--glass-blur-lite\` (8px) is for
\`.cartnote__panel\`, which paints over the already-blurred masthead: at full strength
the two compound into exactly the milky blob glass is supposed to avoid.

---

## Palette`;

d = d.slice(0, i) + section + d.slice(j + '\n---\n\n## Palette'.length);
fs.writeFileSync(P, d);
console.log('glass section repaired');

// prove the table cells are populated again
const tbl = d.slice(d.indexOf('| glass | why |'), d.indexOf('Everything else stays opaque'));
const empties = (tbl.match(/^\|\s*\|/gm) || []).length;
console.log('empty table cells: ' + empties + (empties ? '  <-- STILL BROKEN' : '  (ok)'));
console.log('backticked selectors in section: ' + (section.match(/`\.[a-z]/g) || []).length);
