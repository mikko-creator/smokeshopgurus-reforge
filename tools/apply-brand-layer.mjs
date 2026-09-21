// apply-brand-layer.mjs — append the gun-metal brand layer to the token layer.
//
// WHY THIS IS A SCRIPT AND NOT A HAND EDIT: sr-tokens.mjs regenerates
// src/styles/tokens.css from the design baseline, which would silently drop a
// hand-written palette. Running this after any sr-tokens run restores it, and
// the append is idempotent — it replaces its own block rather than stacking.
//
// WHY THE PALETTE LIVES IN tokens.css: the skill's rule is "change values in
// tokens.css, never at a call site". Every authored stylesheet therefore carries
// var() references and no colour literals at all.
//
//   node tools/apply-brand-layer.mjs

import fs from 'node:fs';

const FILE = 'src/styles/tokens.css';
const BEGIN = '/* === BEGIN gun-metal brand layer (tools/apply-brand-layer.mjs) === */';
const END = '/* === END gun-metal brand layer === */';

const LAYER = `${BEGIN}
/* The redesign's own system. The greys are a gunmetal ramp built around the
   canonical gunmetal #2a3439 — a desaturated blue-grey with a faint green cast,
   which is what "gun-metal" means as a finish rather than as a neutral.
   The accent is EMERALD, a deliberate brand change from the yellow-green the
   source used. sr-tokens' measurement of that original (--c-2, #74a739) is left
   untouched above, so the capture still records what the live site actually was.

   A fourth surface state, GLASS, sits on top of the three plate states. Glass is
   only for surfaces that FLOAT with something behind them worth glimpsing; the
   chassis stays metal. See .glass in site.css. */
:root {
  /* gunmetal ramp — darkest shell to lightest machined highlight */
  --gm-990: #06080a;
  --gm-950: #0a0d10;
  --gm-900: #0f1317;
  --gm-850: #13181d;
  --gm-800: #181e23;
  --gm-750: #1d242a;
  --gm-700: #232b32;
  --gm-650: #29323a;
  --gm-600: #2a3439;
  --gm-500: #3c474e;
  --gm-450: #46525a;
  --gm-400: #55626b;
  --gm-300: #78868f;
  --gm-200: #9fabb3;
  --gm-150: #b6c0c7;
  --gm-100: #c8d1d7;
  --gm-050: #e9eef1;
  --gm-000: #f7fafb;

  /* accent — EMERALD. The hue lives in --acc-rgb and everything else derives
     from it, so retuning the brand is one line rather than a hunt through
     rgba() literals. The source site measured #74a739 (a yellow-green); that
     value is still recorded as --c-2 above, where sr-tokens wrote it, so the
     capture stays intact — this is a deliberate brand change, not a lost
     measurement.

     Every pairing below was computed with tools/contrast.mjs, not estimated:
       --gm-000 on --acc-deep  7.38:1   (button at rest)
       --gm-000 on --acc       5.62:1   (button hover)
       --gm-000 on --acc-lo    9.36:1   (button pressed)
       --acc-hi on --gm-800    6.51:1   (price / link on a card)
       --acc-hi on --gm-950    7.54:1   (link on the page)
     The ramp it replaces FAILED: white on the old hover fill was 2.73:1. */
  --acc-rgb: 7 115 74;
  --acc-deep: #065f3d;
  --acc: #07734a;
  --acc-hi: #0ab875;
  --acc-lo: #034e32;
  --acc-glow: rgba(10, 184, 117, 0.35);
  /* warm machined metal, used sparingly for engraved rules and badge rims */
  --brass: #b08d57;
  --brass-hi: #d4b078;

  /* light model — one light source, upper-left, for every bevel on the site */
  --lite-1: rgba(255, 255, 255, 0.16);
  --lite-2: rgba(255, 255, 255, 0.09);
  --lite-3: rgba(255, 255, 255, 0.05);
  --dark-1: rgba(0, 0, 0, 0.72);
  --dark-2: rgba(0, 0, 0, 0.5);
  --dark-3: rgba(0, 0, 0, 0.3);
  --hairline: rgba(255, 255, 255, 0.07);
  --hairline-dk: rgba(0, 0, 0, 0.55);

  /* status */
  --warn: #d8a13a;
  --warn-bg: rgba(216, 161, 58, 0.12);

  /* type — self-hosted in src/styles/fonts.css, same families the source loads */
  --ff-display: 'Fira Sans', 'Poppins', system-ui, sans-serif;
  --ff-body: 'Inter', system-ui, -apple-system, sans-serif;
  --ff-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;

  /* plate geometry */
  --r-sm: 4px;
  --r-md: 7px;
  --r-lg: 11px;
  --r-xl: 16px;
  --bevel: 1px;

  /* elevation, as machined plates rather than floating cards */
  --plate-raised:
    inset 0 1px 0 var(--lite-1),
    inset 0 -1px 0 var(--hairline-dk),
    inset 1px 0 0 var(--lite-3),
    inset -1px 0 0 var(--hairline-dk),
    0 1px 2px var(--dark-3),
    0 6px 16px var(--dark-2);
  --plate-sunk:
    inset 0 2px 5px var(--dark-1),
    inset 0 -1px 0 var(--lite-3),
    0 1px 0 var(--lite-2);
  --plate-flush:
    inset 0 1px 0 var(--lite-2),
    inset 0 -1px 0 var(--hairline-dk),
    0 1px 3px var(--dark-3);
  --plate-lifted:
    inset 0 1px 0 var(--lite-1),
    inset 0 -1px 0 var(--hairline-dk),
    0 2px 4px var(--dark-3),
    0 14px 34px var(--dark-2);

  /* engraved and embossed lettering */
  --engrave: 0 1px 0 var(--lite-2), 0 -1px 1px var(--dark-1);
  --emboss: 0 -1px 0 var(--dark-1), 0 1px 0 var(--lite-1);

  /* --grain is RETIRED. It was a 4px repeating gradient giving every metal
     surface a brushed tooth; the brief asked for that roughness gone. It is
     neutralised HERE rather than deleted from 22 call sites, so the look is
     one line to restore and no authored stylesheet had to change. The keyword
     "none" is a valid background-image LAYER, so a declaration written as
     var(--grain), var(--sheen) still resolves — it simply paints the sheen on
     its own with an empty layer above it. Put the repeating-linear-gradient
     back on this one property to restore the roughness. */
  --grain: none;
  --sheen: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.075) 0%,
    rgba(255, 255, 255, 0.022) 42%,
    rgba(0, 0, 0, 0.055) 43%,
    rgba(0, 0, 0, 0.14) 100%
  );
  --knurl: repeating-linear-gradient(45deg,
      rgba(255,255,255,0.05) 0 1px, rgba(0,0,0,0.12) 1px 3px),
    repeating-linear-gradient(-45deg,
      rgba(255,255,255,0.05) 0 1px, rgba(0,0,0,0.12) 1px 3px);

  /* --- glass ------------------------------------------------------
     A pane laid ON the metal. Same single upper-left light source: bright
     specular hairline on the top edge, shaded hairline below, glare sweeping
     down-right. --glass-blur is 14px rather than something showier because the
     body background is background-attachment:fixed, so a heavy blur flattens
     --grain to a dead tone and the pane stops parallaxing — --glass-noise puts
     a tooth back on the surface. */
  --glass-blur: 14px;
  --glass-blur-lite: 8px;
  --glass-sat: 1.45;
  --glass-bright: 1.04;
  --glass-r: 14px;
  --glass-tint: rgba(24, 30, 35, 0.39);
  --glass-tint-deep: rgba(24, 30, 35, 0.56);
  /* the no-backdrop-filter surface: --gm-800 at 94%, contrast-identical to a
     real opaque card, so text never depends on the blur existing */
  /* The masthead is the one pane that floats over ARBITRARY content — including
     the white product media wells scrolling under it — so it cannot take the
     same transparency as a pane sitting on the dark page. Solved, not guessed
     (tools/solve-tint.mjs): nav text needs alpha >= 0.72 over --gm-050 to hold
     4.5:1, so the rail sits at 0.78 with headroom. At 0.39 it measured 1.58:1. */
  --glass-tint-rail: rgba(24, 30, 35, 0.78);
  --glass-tint-solid: rgba(24, 30, 35, 0.94);

  /* VAPOUR. Three real smoke plates, generated then converted to transparent
     textures by tools/smoke-plate.mjs. They started as radial gradients, which
     rendered, moved and measured correctly and still did not look like smoke —
     a soft ellipse is a haze, and smoke is wisps. No amount of tuning a
     gradient produces a tendril, so the shape had to come from an image.

     Two constraints shaped the alpha values. The haze sits BEHIND 90 elements
     that carry a backdrop-filter, so anything bright enough to read as smoke on
     its own would also lift the surface under every card's text. And the page
     is near-black, so a plume only has to reach about 16% alpha to be visible
     at all. A closest-side ellipse keeps the falloff soft enough that no plume
     ever shows an edge. */
  --vapor-1: url('/assets/generated/smoke-plate-a.png');
  --vapor-2: url('/assets/generated/smoke-plate-b.png');
  --vapor-3: url('/assets/generated/smoke-plate-c.png');
  --glass-edge: rgba(255, 255, 255, 0.28);
  --glass-inner: rgba(255, 255, 255, 0.055);
  --glass-scrim: rgba(6, 8, 10, 0.78);
  --glass-face: linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.028) 46%, rgba(0,0,0,0.045) 100%);
  --glass-glare: linear-gradient(105deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.035) 24%, rgba(255,255,255,0) 56%);
  /* retired with --grain: the same rough tooth, on the glass panes. */
  --glass-noise: none;
  /* derived from --acc-rgb so the emerald retune cannot leave it behind */
  --glass-acc-edge: rgb(var(--acc-rgb) / 0.26);
  /* rhythm */
  --gap-1: 4px;
  --gap-2: 8px;
  --gap-3: 12px;
  --gap-4: 16px;
  --gap-5: 24px;
  --gap-6: 32px;
  --gap-7: 48px;
  --gap-8: 64px;
  --gap-9: 88px;
  --shell: 1280px;
  --shell-narrow: 820px;
}
${END}`;

let css = fs.readFileSync(FILE, 'utf8');
const i = css.indexOf(BEGIN);
if (i >= 0) {
  const j = css.indexOf(END);
  css = css.slice(0, i) + LAYER + css.slice(j + END.length);
  console.log('brand layer replaced in ' + FILE);
} else {
  css = css.trimEnd() + '\n\n' + LAYER + '\n';
  console.log('brand layer appended to ' + FILE);
}
fs.writeFileSync(FILE, css);

const declared = [...new Set((css.match(/--[a-zA-Z][\w-]*\s*:/g) || []).map((d) => d.replace(/\s*:$/, '')))];
console.log('tokens now declared: ' + declared.length);
