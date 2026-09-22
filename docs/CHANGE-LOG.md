# Change log — what changed, and what the gate says

Source: `https://smokeshopgurus.com` (Shopify, 150 pages, crawled 2026-09-21).
Rebuild: 141 static pages, no platform runtime.

Every decision below is in `audit/change-control.json`: **476 rows, all decided** —
259 PRESERVE, 210 REMOVE, 5 IMPROVE, 2 ADD. Nothing was dropped without a written reason.

---

## What was removed, and why

| rows | what | reason |
|---|---|---|
| 150 | Shopify cart-notification section | Platform chrome whose only text was "Item added to your cart". The rebuild has its own basket notification carrying the same words. |
| 54 | Server-side facet filter | Rebuilt as a real client-side filter (availability + price) on every collection page. |
| 6 | Server-side sort control | Rebuilt client-side. Alphabetical and price orderings are real; "Featured", "Best selling" and the date orderings keep the collection's published order, because the harvest holds no ranking signal and inventing one would be inventing data. |

## What was rebuilt rather than dropped

The source's server-side features were replaced with working client-side ones, so
the rebuild keeps the function and not just the words:

- **Search** — `/search?q=`, over a generated index of 82 products and 46 collections.
- **Collection filter and sort** — availability, price range, six orderings.
- **Quote basket** — add to cart, quantities, `/cart/`, request-a-quote form.
- **Age gate** — a 21+ interstitial replacing the Shopify age-verifier app.
- **Product lightbox** — `<dialog>`, with the source's own "Open media N in modal" labels.

## What was fixed

The source's SEO surface was almost entirely absent. Measured, not asserted —
`audit/seo-report.json`:

| defect | source | rebuild |
|---|---|---|
| `<title>` | 0 of 150 pages had one | 141 of 141 |
| meta description | 0 of 150 | 141 of 141 |
| structured data | 0 of 150 | 141 of 141 |
| `og:title` | 0 of 150 | 141 of 141 |
| canonical | present | 141 of 141 |
| `<h1>` | absent on the homepage | present on every page |

`node tools/head-audit.mjs` re-checks this in one pass: **0 duplicates, 0 missing**.

Also fixed:
- **86 products recovered from pagination.** Collections were being read from page 1
  only; folding `?page=N` back in recovered 86 product listings that would otherwise
  have been silently missing.
- **A site-wide legal disclaimer was being dropped.** The source renders it above the
  footer on every page; the first build lost it because it looked like shared chrome.
  Restored verbatim.
- **Policy pages were being truncated.** The returns policy was captured as 3
  paragraphs when it has 22 blocks — the opening line survived and every clause after
  it did not. Fixed, and that page now scores 100% content recall.
- **Images:** 140 converted to WebP, **37.1 MB → 6.6 MB**, 1,038 references rewritten.
- **Fonts self-hosted** — 20 woff2 files, the same families the source loaded from
  Google. The rebuild makes no third-party request.
- **Responsive defects found by the sweep and fixed:** horizontal scroll on the
  product page at 390px (a grid track that would not shrink below a `<select>`),
  mega-panels extending the document to 1136px at 1024px, a facet drawer laid out
  off-screen, 283 tap targets under 44×44, and 181 runs of text under 12px.

---

## The gate

`node <skill>/scripts/sr-gate.mjs --project .` is the authority. At handover it reads
**PASS 23 · FAIL 5 · UNPROVEN 1 of 29 — NOT-READY**. These are the six that are
not green, each with its evidence. None of them is unexplained, and two of them
grade the source rather than the rebuild.

### C03 — crawl had 1 failure · FAIL

`https://smokeshopgurus.com/customer_authentication/redirect` is Shopify's customer
account OAuth bounce. It leaves the origin for `shopify.com` and `shop.app` and
returns a login flow, not a page. robots.txt disallows `/account`. Recorded and
accepted in `audit/failures.json` with that reasoning; C03 reads the crawl's raw
failure count, so acceptance does not change it. **No page of the site is missing:
150 of 150 were fetched.**

### C06 — source SEO inventory has no titles · FAIL

This check grades the **source**, not the rebuild. 150 of 150 live pages ship no
`<title>`. It cannot pass for this target without falsifying the capture, and the
capture is the evidence. The rebuild fixes the defect — see the table above.

### C12 — no preset library · UNPROVEN

No preset library was supplied for this project. The design system was authored
against the measured design baseline instead. Indexing a library that did not inform
the build would make this check green without making the statement true.

### C17 — 86 content-loss findings · FAIL

Mean content recall is **95.4%**, at a 95% floor, with **0 blockers** and **0 missing
pages**. 64 pages are at or above the floor; the 86 below sit between 89.7% and 95%,
and 79 of them are product pages.

The residual is Shopify rendering its product form about four times per page — the
quantity label, "Sold out" and "Variant unavailable" repeat once per form instance —
plus two things the rebuild genuinely does not have: a customer-account "Log in" link
and a media-carousel counter ("1 / of 4"), which is a grid here.

It is **not** lost copy. `node tools/recall-diff.mjs <path>` prints the per-token
deficit for any page and shows exactly this. Reaching 100% would mean shipping hidden
duplicate text to match a platform's markup, which is padding a measurement rather
than preserving content.

### C21 — "powered by Shopify" survives · FAIL

One sentence, in the client's Terms & Conditions, left verbatim:

> Smoke Shop Gurus is powered by Shopify, which enables us to provide the Services to you.

This is legal text, not a platform artifact. Rewriting a client's terms is not a
developer's decision. **See `DEPLOY.md` — the client's counsel updates that sentence
and C21 goes green with no other change.**

### C22 — pixel drift 99.5% · FAIL

This check asks whether the design matches the source pixel-for-pixel. This is a
commissioned redesign, so it does not, deliberately. The drift was measured rather
than skipped: 24 pairs across 390/768/1024/1440px, 98.0%–99.5% differing pixels, diff
images in `audit/screens/diff/`. An UNPROVEN here would have meant "nobody looked";
a number means the difference is intentional and quantified.

---

## What is green

**C01 C02 C04 C05 C07 C08 C09 C10 C11 C13 C14 C15 C16 C18 C19 C20 C23 C24 C25 C26 C27 C28 C29** — 23 of 29.

Worth calling out:

- **C09** — the design baseline is computed style from a real browser at all four
  breakpoints, 24 captures, re-read from disk.
- **C13** — 159 tokens declared, **0 off-token colour literals** in authored CSS.
- **C16** — 0 of 150 source pages missing, and the 2 pages the rebuild adds (/search/, /cart/) each carry an ADD row with its reason.
- **C19** — every form and contact detail intact.
- **C20** — 772 claims checked, all traced to the capture or to declared facts.
- **C23** — 0 blockers and 0 majors introduced at 390/768/1024/1440px.
- **C24** — 17 recorded failures, all closed with a stated reason.

---

## Generated imagery

24 images from fal.ai, full provenance in `src/assets/generated/provenance.json`.
Every one was rendered to a contact sheet and **looked at**; that pass rejected or
regenerated six, including one that produced a **handgun** when asked for a knurled
gun-metal texture. Two remain rejected and cannot be published by the generator. See
`BRAND-SYSTEM.md`.

## Revision — texture out, shimmer in, glass +30% transparent

Three requested changes, and the one place a request met a measurement.

**The rough site texture is gone.** `--grain` and `--glass-noise` are `none`. Both
are retired rather than deleted: they are still referenced at 22 and 6 call sites,
and `none` is a valid `background-image` *layer*, so every declaration still
resolves and paints an empty layer. Restoring the roughness is one token value.
Proven from the rendered page, not from the CSS text — `tools/probe-texture.mjs`
reports **0 of 411 elements** painting a repeating gradient, and `--control`
re-injects a grain and detects **12**, so the zero is a working instrument rather
than a blind one. The only repeating gradient still painted anywhere is the
`--knurl` grip strip on `.btn--knurled::after`, which is a separate, deliberate
skeuomorphic detail and was kept.

**Button hover is now a metal shimmer.** The fill no longer moves; a specular band
sweeps across the face. Mechanics in `docs/BRAND-SYSTEM.md` → *Motion*. As a side
effect the hover contrast problem stops existing: rest contrast is now also hover
contrast.

**Glass is 30% more transparent — except the masthead, which could not take it.**
Tints went 0.56 → 0.39 and 0.80 → 0.56. The masthead is the one pane that floats
over *arbitrary* content, including white product photography scrolling underneath,
and at 0.39 its nav measured **1.58:1** against a 4.5:1 floor. `tools/solve-tint.mjs`
solves the floor at 0.72; the rail takes **0.78** in a new `--glass-tint-rail`. Every
other pane got the full requested increase. `.pcard__vendor` also moved `--gm-300` →
`--gm-200`: at the new tint it measured 4.48:1, because the 14px blur pulls light in
from the white media well above the card.

Verified across 17 page/viewport/scroll combinations by `tools/probe-text-contrast.mjs`.

## Three instrument defects found while verifying this revision

All three would have produced a *confident wrong answer*, and all three are recorded
because the fix was to the probe, not to the site.

1. **The probe sampled the padding box, not the text.** A button's padding box
   contains its own 1px top edge highlight, which no glyph ever sits on. It reported
   the ghost button at **4.40:1 — FAIL**; the rows the 13px label actually occupies
   measure **11–14:1**. Now sampled per text node via `Range.getClientRects()`.
2. **The probe measured elements hidden under the sticky masthead.** "Inside the
   viewport" is not "visible": a card scrolled under the header still has a rect with
   `top >= 0`. It reported a card title at **1.00:1** — the sampled pixel was the
   brand logo. Now every run is hit-tested with `elementFromPoint` before measuring.
3. **The transparency trick leaked.** Setting `color: transparent` on `.pcard__price`
   left the amount painting, because a child sets its own colour — so the probe
   measured the text against *itself* and reported **1.19:1**. Now the whole subtree
   goes transparent with `important`.

A fourth, in the solvers written for this round: `getComputedStyle` returns a **live**
declaration, so reading `cs.color` into a result object *after* mutating the element
reports the mutated value. It made every tint alpha look identical at 1.05:1.

The rewritten probe carries both controls: it passes clean on the real build, and
fires on an injected masthead failure *and* an injected card failure. It also now
refuses to report a pass when it measured nothing — which immediately caught a
product URL in the test matrix that was returning **404** and had been reading as
"all sampled text clears its floor".

## Revision — hero alignment and a mark-only masthead brand

**The hero copy was 276px too far right**, and it was a real defect rather than a
taste call. `.hero__inner` carries `.shell`, which sets `margin-inline: auto`, but
then overrode `max-width` to 760px — so the block centred itself in the *viewport*
instead of filling the shell. Its left edge landed at 372px while every section
title on the page sat at 96px (148px adrift at 1024px). Giving it the shell's own
width and gutter puts it at 96px exactly; the 620px caps already on the eyebrow, h1,
lede and actions keep the text at a reading measure, so the column's allowance
widened without the text widening. Verified by `tools/probe-align.mjs`, which now
reports `hero h1 vs section title: aligned`.

Side effect worth recording: moving the text left put it over the **darker** side of
the hero photograph, so hero contrast improved rather than degraded — 14.03:1 for the
h1 at 1440px, and clear at 1280 / 1024 / 768 / 390 as well.

**The masthead brand is now the logo alone**, at `height: 48px` (40px below 560px),
up from 34px. The wordmark is drawn inside the logo artwork, so setting "Smoke Shop
Guru" and "Albuquerque, NM" beside it repeated the same information twice. The footer
keeps the full lockup. The `<img>` now declares **261x66** — the file's real
dimensions, read from the WebP header — instead of the 120x30 it claimed before.

Enlarging the logo cost nothing: the masthead measures **116px tall with the logo at
either 34px or 48px**, because the bar's height is set by the nav controls. The mark
grew into whitespace that was already there.

### The regression that caused, and how it surfaced

Removing the text broke the **tap target**. The link had been a logo stacked with two
lines of text, so it cleared 44x44 by accident; mark-only it measured **191.4x40** at
390px. The responsive sweep went from 0 majors to **6 majors** — all six the same
element on the six swept pages. `min-height: 44px` on the link fixed it without
changing the logo's drawn size, and the sweep returned to 0 blockers / 0 majors.

It also put the link's **accessible name** entirely on the `<img alt>`. Chrome's
accessibility tree confirms role `link`, name `"Smoke Shop Guru"`, computed from
contents — so the header's home link is still announced. `tools/probe-brand-a11y.mjs`
asserts both of these, because neither is visible on screen and both would fail
silently.

Content recall was unaffected: **95.38%** against 95.4% before, 0 missing pages. The
brand words still appear in the footer lockup and in every page title.

### The gate caught a stale-evidence mistake

After the tap-target fix I re-ran the gate without re-running the reports, and it
dropped to **PASS 19 · FAIL 3 · UNPROVEN 7** — five parity checks plus fabrication
and decontamination all resolved UNPROVEN with "report predates the build it
describes". The reports were 3 minutes older than `dist/`. Re-running the three
stages against the current build returned it to 23 / 5 / 1. Recorded because the
gate refusing a stale pass is the behaviour that makes the other numbers worth
anything.

## Revision — FAQ slide and a vapour field

**The FAQ accordion now slides.** It was not slow before — it had no animation at
all, because a native `<details>` snaps and CSS has nothing to interpolate: the
content is not in flow until `open` flips. `src/scripts/accordion.js` measures both
heights and animates between them, 620ms open / 540ms close. Mechanics and the two
traps (keeping `open` true through the collapse; honouring reduced motion by *not*
intercepting) are in `docs/BRAND-SYSTEM.md` → *Motion*.

Measured: 26 distinct heights expanding, 23 collapsing. The control runs the same
clicks under `prefers-reduced-motion: reduce` and gets one height, 0ms — a snap.

**A vapour field drifts behind the whole site.** Five soft plumes, fixed at
`z-index: -1`, aria-hidden, pointer-events none, in real markup so the atmosphere
survives with JavaScript off.

The design was driven by a measurement taken before writing any of it: the page
carries **90 elements with a `backdrop-filter`**, 78 of them product cards, 8 on
screen at a time over ~66% of the viewport. The cost of a moving background here is
not the background — it is every one of those re-sampling. That ruled out canvas,
animated `filter`, and SVG turbulence, and left radial gradients moved by transform
alone. Result on the 82-card page: **mean 16.67ms and 0 long frames both before and
after**, unchanged at 390px too.

### Three things the probes caught that would have shipped

1. **The first version was invisible.** It measured 1.48% of pixels changing over
   5s with a peak channel delta of 15 — technically drifting, visually a faint
   gradient wash rather than smoke. Raising the plume alphas and adding rotation
   took it to ~11% with a peak delta of 74.

2. **The sticky buy bar failed under the brightened field.** Its price measured
   **4.24:1** against a 4.5 floor with the plumes forced to maximum. Same class of
   problem as the masthead — a fixed pane with arbitrary content passing behind it —
   so it took the same answer, `--glass-tint-rail`.

   Worth noting *how* that was found. The live contrast probe waits a fixed time
   after load, so it samples the same animation phase every run: a blind spot that
   would have reported clean forever. The failure only appeared when the plumes were
   frozen at full opacity and scaled over the viewport — a strict upper bound the
   live field can never exceed.

3. **A plume poked past the viewport, and the arithmetic said it could not.** The
   responsive sweep went to **24 majors**, all one plume's rect exceeding the
   viewport width — clipped by `overflow: hidden`, with `document.scrollWidth`
   exactly `innerWidth`, so it caused no scrolling. The real problem was that the
   sweep samples one instant, so *which* plume gets flagged changes run to run: a
   gate input that moves on its own.

   The first fix was computed from `left + width + translate + scale` and was wrong,
   because it ignored rotation. A rotated box measures `w·cos + h·sin`, and since
   the widths here are `vw` while the heights are `vh`, the overflow got *worse* as
   the viewport narrowed — 33px over at 390px, 8px at 1024px, clean at 1440px, which
   is the opposite of what the model predicted. `tools/probe-vapor-bounds.mjs` now
   steps every plume through a full cycle at all four breakpoints and reports the
   widest rect. Sweep is back to 0 blockers / 0 majors with 28px of headroom at the
   tightest breakpoint.

## Revision — visible vapour, matching footer brand, and mobile

**The vapour was running and invisible.** Not broken: `prefers-reduced-motion` was
off and all five animations were playing. The cycles were 56–97 seconds, which works
out to about **7px per second** — below the speed at which the eye registers motion.

Every probe had passed, and that is the lesson worth keeping. "Do pixels change over
five seconds" tests whether an effect EXISTS; it says nothing about whether anyone
can perceive it, and only the first question was being asked. Cycles are now 24–41s
over ~88vh, measured at **19–34 px/s, mean 27**, by a new probe that holds a
perceptibility band rather than a difference count. Horizontal travel was left
untouched on purpose, because the proven plume bounds depend on it.

**The footer brand now matches the masthead** — mark-only, 48px. It also fixes a
defect that was invisible on screen: with the alt text and the visible wordmark both
present, the footer link's accessible name computed to **"Smoke Shop Guru Smoke Shop
Guru ALBUQUERQUE, NM"**. It is now one clean name, and both links clear 44x44.

### Mobile

Three changes, each from a measurement rather than a hunch.

**The sticky header was taking 20.1% of a 390x844 phone screen.** 170px of it: a
72px bar plus a 98px notice strip that had wrapped onto three rows. The strip now
sits *outside* `<header>`, so the bar alone is pinned at **72px — 8.5%** — and the
reading area goes from 674px to **772px**. Nothing was removed: the notice and the
tap-to-call link are still there, they just scroll away.

The obvious version of that change does not work, and it is worth writing down why:
`position: sticky` only sticks within its parent's box, so pinning the bar's wrapper
while leaving it inside the header would have unpinned the nav the moment the header
scrolled past. The drawer lives inside the pinned element, so that failure mode ends
with the mobile menu opening off-screen. `tools/probe-drawer.mjs` now checks the
menu's rect is actually in the viewport after scrolling 2000px, not merely that it
opened. It also affects desktop, where the sticky header drops 116px → 72px.

**CSS transfer cut 55%.** `src/styles/` is heavily commented on purpose — the
reasoning is the handover — but none of it needs to reach a phone. Comments were 44KB
of the 118KB served. `tools/css-slim.mjs` strips them from `dist/` only, taking the
stylesheets to **65.2KB raw and 26.9KB → 12.0KB gzipped**. It is a tokenizer, not a
regex, because `/*` inside a string or an unquoted `url()` is content and deleting
from there to the next `*/` silently eats real declarations.

Proven safe rather than assumed: `tools/probe-css-parity.mjs` compares 40 computed
properties and the rect of **every** element before and after — 2,974 elements across
four page/viewport pairs, **0 differences**. Its control deletes one real declaration
and the probe reports the cascade of changes, so the zero is a working instrument.

**Initial mobile payload is 379KB** (18 requests), and the whole-page cost of the
82-card collection page is 4.4MB. Lazy-loading was already correct (83 of 85 images,
with the hero and logo eager) and the fonts already are too: 20 `@font-face` rules
declared, only **3 files painted**.

### The build could silently un-optimise itself, twice

`generate.mjs` re-copies the original assets into `dist/` on every run, overwriting
whatever `sr-images` converted on the previous pass. So a rebuild that ran only
`generate` left **169 raster files, 38.8MB**, and the mobile payload went to 17.2MB
on the collection page. Nothing in the gate fails for this, because image
optimisation is a report rather than a check.

It happened twice. Both times it was caught by the size of the deploy zip, which is
luck. `tools/build.mjs` now runs all five stages in order, stops at the first
failure, and ends by asserting that the only raster files left in `dist/` are the
ones `sr-images` explicitly recorded as deliberately kept. Verified by running
`generate` alone and confirming the assertion fires.

## Revision — the vapour was invisible on the first screen

Reported as "not visible anywhere". It was rendering — 6.7–16.8% of pixels below the
fold — but at **scrollY 0 it changed 0.5% of pixels with a peak delta of 6**, i.e.
nothing. The hero is opaque and full-bleed, the site-wide field sits *behind* the
page, and the hero is the first screen. So the place it could never show was the only
place most visitors look.

The hero now carries its own plumes between the photograph and the copy, and the
plume fills were raised (0.30/0.17/0.26 → 0.42/0.24/0.38). Measured at the reporting
viewport: **19.8–28.1%** of pixels at the top of the page, **6.8–20.6%** on mobile,
peak deltas 51–166. Hero text still clears its floor at 7.70–19.17:1, and holds with
every plume frozen at full opacity.

### Three probes, three different questions — and the third was never asked

The vapour had passed every check at each stage, and each time the check was about
something else:

| probe | question | verdict it gave |
|---|---|---|
| `probe-vapor` | do pixels change over time? | running |
| `probe-vapor-speed` | how fast? | 27 px/s, perceptible |
| `probe-vapor-bounds` | does it overflow? | in bounds |
| `probe-vapor-visible` | **is it visible at all?** | **not on the first screen** |

"Do pixels differ between two frames" is a test for existence. "How fast does it
move" is a test for the motion. Neither asks whether the thing is visible where
someone is looking, and nothing was asking it until the fourth probe existed.

### And the new probe was wrong on its first run

It hid `.vapor` to take the "off" frame, but the hero plumes live in `.hero__vapor` —
so they were present in *both* frames, cancelled out, and the hero read as having
almost no vapour even after it had been added. The 1.4% it reported was the fixed
field alone. Fixed to hide both, after which the same frame measured 38.3%.

### The bounds arithmetic was wrong a second time, the same way

The hero plumes were placed in percentages of the hero, with a note claiming that
kept their rects in bounds "by construction". It did not: a rotated box measures
`w·cos + h·sin`, and these are a large fraction of the hero's *height*, so rotation
converts height into width. One plume ran **100–256px past the viewport at every
breakpoint**. A second, quieter bug sat underneath it — `.hero__vapor .vapor__plume`
is specificity 0,2,0 and was setting `width`, so the per-plume `width` at 0,1,0 never
applied at all.

Both fixed; `probe-vapor-bounds` confirms all eight plumes stay inside at 390 / 768 /
1024 / 1440 / 1563. The lesson is now recorded twice in this log, which is the point:
the closed-form estimate has been wrong every time it has been tried, and the probe
has been right every time.

## Revision — the vapour is real smoke now

Reported again as not showing. It was rendering — all eight plumes present and
running, confirmed in the reporting browser — so this was not a bug. It was the
wrong approach: **a radial gradient is a haze, and smoke is wisps.** Every probe
kept passing because each measured a property the gradients genuinely had. None of
them could measure "does this look like smoke", and no probe can.

Three smoke plates are now generated (fal) and converted to transparent textures by
`tools/smoke-plate.mjs` — crop, luminance→alpha, feathered edges. Mechanics and the
three defects that tool exists to handle are in `docs/BRAND-SYSTEM.md` → *Motion*.

### The generator put objects in the frame, twice

Two of three plates came back with a lit floor across the bottom, and one with an
**incense holder** standing in it — despite "no objects" in the prompt. Regenerating
that one with explicit negatives (`no floor, no incense, no stick, no holder`)
produced the holder again: flux does not honour negative prompts.

This is exactly what the inspection step is for. All three raw generations carry
`inspectionVerdict: not-published` with the reason written out, so they cannot reach
`dist/`; only the cropped, alpha-converted derivatives ship, and those carry their
own inspection and a `derivedFrom` pointer back to the generation.

### The smoke broke the hero headline, and the fix was one z-index

With the plates in, hero text measured **2.04:1 against a 3:1 floor** — the plumes
were painting *above* the scrim that makes the headline readable. Moving them to
`z-index: -1`, the same index as the scrim, puts them underneath it: among
positioned elements sharing an index the painting order is DOM order, and `::after`
is the hero's last child. Hero text now clears **7.52–19.17:1**, and holds with
every plume frozen fully opaque.

### Mobile paid for it, so mobile got it back

The three plates cost 142KB — 27% of a phone's initial payload, which had been
optimised down to 379KB the revision before. At ≤767px one plume is hidden and the
rest are repointed at the two lighter plates, so the heaviest is never fetched:
**521KB → 454KB**, with the smoke still visible at 4 of 5 sampled scroll offsets.

At one mobile offset (scrollY 2400) nothing is on screen — the drift leaves gaps on
a narrow column. Recorded rather than chased.

### The visibility probe's verdict was wrong for wisps

It called mobile "INVISIBLE" at a peak channel delta of **411**. The rule was
coverage-only — written for a broad gradient haze, which touches many pixels weakly.
Real smoke is the opposite: a thin wisp changes under 1% of the frame and changes
those pixels enormously, and the eye sees it plainly. The verdict now recognises
broad-and-faint and thin-and-strong as separate cases and prints both numbers, so
the rule can be argued with rather than trusted.

## Revision — the vape emits moving vapour

The plume in the hero photograph is baked into the raster and cannot move, so a real
one is layered on top, rising from the mouthpiece. Anchoring it is the hard part: the
mouthpiece sits at a fixed point of the *picture* and a moving point of the *box*,
because `object-fit: cover` crops differently at every window size.
`src/scripts/hero-emit.js` recomputes the painted rectangle and publishes it; details
in `docs/BRAND-SYSTEM.md` → *The hero emitter*.

### An adversarial review found four defects this author missed

The change was put through a four-lens review (cover maths, accessibility,
performance and layering, build integration) with every finding independently
refuted before being accepted. **24 reported, 11 survived.** Four mattered:

1. **`transform-origin` defaulted to the box centre**, so `scale()` pulled the plume
   toward its own middle. The comment claiming the bottom stayed on the mouthpiece
   was true only at scale 1; at the first keyframe the bottom sat **99px above** the
   anchor. The plume was being born in mid-air — and every existing check passed,
   because they all verified the *anchor* and none verified where the puff rendered.
2. **Size was scaled to the picture width**, not the room above the mouthpiece, so
   most of each cycle played above the clip edge.
3. **`will-change` was unconditional**, holding three compositor layers for the life
   of the page even with JavaScript off or reduced motion on — against a rule this
   stylesheet already states for the scroll reveals.
4. **The script shipped on all 141 pages** for markup that exists on one.

A fifth, that the puffs re-fetched the 68KB plate on phones, had already been found
and fixed here independently — the mobile override had been placed in an *earlier*
media query at equal specificity and silently lost to the later emitter block.

`tools/probe-hero-emit.mjs` now steps the puff through a full cycle and asserts its
**painted bottom** starts at the mouthpiece, which is the check whose absence let
defect 1 through. Verified at 390 / 768 / 1024 / 1440 / 1563 / 1920: the plume starts
within 7–9px of the rim at every one.

### Two instrument faults, surfaced by the same change

- **One speed band did not fit two kinds of motion.** 10–60px/s was calibrated for
  ambient drift; a jet leaving a device is meant to be brisker, and judging it against
  the drift band called correct behaviour "too fast". Each class now has its own band.
- **Sampling across a loop restart measured the rewind.** One puff reported
  **+176px/s downward** — the animation jumping from the top of its cycle back to the
  bottom between two samples. The first attempt to detect that used `currentTime`,
  which on an infinite animation increases monotonically and so could never fire; the
  working signal is `getComputedTiming().progress`. A second offset pass was added
  too, because the fixed delays meant the *same* puff was skipped on every run — a
  permanent blind spot rather than an occasional one.

Clamping the size (defect 2) then dropped the rise to 23px/s, under the emitter floor.
Size and duration are coupled, so the cycle went 7s → **4.2s**; measured 51–83px/s.

Gate unchanged at 23 / 5 / 1. Scroll performance is 0 long frames — an earlier reading
of 3 was contention from the 28 review agents running concurrently, and is not a
property of the build.

## Revision — the hero emitter removed

Removed at the client's request. The plume rising from the vape is gone; the drifting
smoke field stays.

What went, completely: `.hero__emit` and its three `.hero__puff` spans,
`src/scripts/hero-emit.js`, the emitter's CSS blocks and its `@keyframes
sr-puff-rise`, and `tools/probe-hero-emit.mjs` — a probe whose only subject no longer
exists is a check that fails for the wrong reason. Verified by grep: zero references
to `hero__emit`, `hero__puff` or `hero-emit` anywhere in `dist/`, and `dist/scripts/`
is back to four files.

What stays, deliberately:

- **`.vapor`** — the five-plume field fixed behind the whole page.
- **`.hero__vapor`** — the three ambient plumes inside the hero. These are not "from
  the vape"; they are the *background* effect reaching the hero, which the fixed
  field cannot do because the hero is opaque and full-bleed. Removing them would have
  left the first screen as the one place with no drifting smoke, which is the exact
  complaint that put them there.
- The three generated smoke plates, which the field is built from.

The device still shows the plume in the photograph itself — that one is baked into
the raster and was never animated.

Re-measured after the removal: field drifting at 22px/s across 8 plumes and visible
at every sampled offset, all plumes in bounds at 390/1024/1563, hero and glass text
clearing their floors, no overflow, **0 long frames**, sweep 0 blockers / 0 majors,
gate unchanged at 23 / 5 / 1. Mobile still avoids fetching the heaviest plate:
**453.6KB**, plates A and B only.

## Revision — logo unplated and enlarged, Best Seller as a carousel

**The logo's white card was pure CSS.** The file carries a real alpha channel, so
the plate, the padding and the bevel were all that stood between the mark and the
masthead. All three are gone in both the header and the footer. The heights now
describe the ARTWORK rather than a padded box: 40px of drawn logo became **48px**
and 32px became 38.4px, which is the 20%. The masthead is still 72px tall — the
mark grew into space that was already there.

**Best Seller is now an unboxed, infinite carousel, directly below the hero.** The
cards, their glass and the add-to-cart buttons are gone; the products are not.

### The loop is seamless, and that took getting the arithmetic right

A CSS marquee loops by translating a doubled track exactly -50%, which only lands on
the second copy's first item if the track is an exact multiple of the item pitch.
With `gap` it is not: 14 items have 13 gaps, so the track is `14C + 13G` and -50%
stops **half a gap short** — a 16px jump, every cycle, forever. A trailing margin on
each card makes the width `14(C + G)`, whose half is exactly the eighth card.
`tools/probe-marquee.mjs` proves it two ways: the geometry, and a pixel comparison of
the frame at progress 0 against the frame at progress 1.

That second check was **broken on its first run**, and only the control caught it. It
compared `currentTime = 0` with `currentTime = duration`, but `animation-fill-mode`
is `none`, so at exactly the end the effect is out of its active interval and the
transform snaps back to the base — it was comparing frame 0 with itself, and reported
"no seam" on a build with a deliberate 16px jump. It now samples one millisecond
inside the interval. A second threshold was wrong too: judging the seam by
*percentage* of differing pixels called three viewports broken, because the same few
hundred antialiased pixels are a bigger share of a 390px frame than a 1440px one.
Peak delta decides now — a real seam measures 731, antialiasing measures 21.

### The strip is a real scroller, not overflow:hidden

With `overflow: hidden` every card past the fold counted as an element overflowing
the page: **64 sweep majors**. The responsive sweep exempts elements inside a
container whose `overflow-x` is `auto`/`scroll`, because content wider than the
viewport is the entire point of one. Making it a genuine scroller cleared all 64 —
and it also makes the off-screen products *reachable*: hovering pauses the loop and a
trackpad or keyboard can then scroll to any of them, where `overflow: hidden` left
them reachable only by waiting.

### Unboxing the text cost contrast, and the fix was a category change

Removing the card put body text directly over the drifting smoke. Measured: a stable
**12.72:1** with the field hidden, but as low as **2.49:1** when a bright wisp passed
behind a title. A halo helped little (the probe samples the whole line box, including
the gaps a soft shadow does not reach) and brightening to white still left one phase
at 4.33:1.

The title is now **19px/700**, which is WCAG's large-text class with a 3:1 floor, and
that same worst phase measures 4.33 with margin. That is a real change of category —
bigger, heavier type — not a threshold shaved to make a number pass. Measured across
eight samples: title 5.24–18.69 against 3, price 7.08–7.67 against 4.5.

The edge fade mask was dropped for the same reason: it faded the *text* in the ends,
and partially transparent body text is partially readable text.

### Two probe faults found on the way

- The contrast probe read rects, then screenshotted 400ms later. On a moving strip
  those disagree — a title measured 2.49:1 in one run and 12.08:1 in the next because
  a white media well had slid under the sample. It now finishes finite animations and
  pauses infinite ones before measuring.
- The marquee text was not in the probe's target list at all, so the first "all
  labels clear their floor" on this page was reporting on everything except the thing
  that had just changed.

### Content kept

Unboxing dropped the screen-reader price labels the old card carried, taking the
homepage from 95.4% to **92.0%** recall. Restoring them put it at **98.4%**, and mean
recall is back to 95.38% with the major count unchanged at 86. Gate holds at 23/5/1,
sweep 0 blockers / 0 majors, 0 long frames.

One deliberate minor remains: the sweep counts `alt=""` as a missing alt, and the
seven duplicated cards use empty alt inside an `aria-hidden` anchor — which is the
correct markup for a decorative copy, so it stays.

## Revision — floating products and a centre highlight

**The products float because the white was taken out of the PIXELS.** Removing the
CSS well alone would have left each photograph's own white rectangle on a dark page —
the opposite of floating. `tools/cutout.mjs` lifts each product off its studio
background and the marquee uses the cut-out.

It is a **flood fill from the frame border, not a white key**. Keying every near-white
pixel would punch holes straight through the products that are themselves white — and
several are: the Elements paper box, the pale Blazy Susan packaging, the lighter
display's white labels. Filling only background that is *connected to the edge*
leaves white enclosed by a product untouched, which the contact sheet confirms.

It also refuses to guess: a border that is not a flat colour, or a fill that removes
under 3% or over 92% of the frame, is rejected and the original photograph is kept.
All seven passed with 0% border noise; each was then inspected composited on the page
colour, because a cut-out judged on white hides the exact fringe worth worrying about.

These are the **client's own product photographs, altered**. That is recorded in
`audit/cutouts.json` with the tool, the count and the file list. The originals are
untouched and remain what every product page and grid shows.

**The centre product is enlarged and hands off as the strip moves.**
`src/scripts/marquee-focus.js` watches a band down the middle of the strip with an
IntersectionObserver whose `rootMargin` collapses the root to that band, so
"intersecting" means "in the centre". Verified by `tools/probe-marquee-focus.mjs`:
exactly one card focused at a time, always the one nearest the centre, handing off
between products, scaled 1.16 and never clipped by the strip's hidden overflow.

The observer alone was not enough. It only speaks when a threshold is crossed, so a
card held the highlight up to **168px past centre** before the next one tripped it —
the emphasis visibly lagged the product. Membership still comes from the observer;
the *choice* is now re-made on a frame loop that runs only while something is in the
band and measures only the one or two cards that are, which is about three rect reads
a frame against fourteen for polling everything. 0 long frames, desktop and mobile.

### The cut-outs cost nothing, after a second pass

Alpha carries bytes: the first cut-outs took mobile from 664.9KB to 767.3KB. They were
894–1024px for a card that displays at 210px, so they are now capped at 700px — which
is still ample at DPR 3 — and mobile sits at **654.5KB**, slightly *below* where it was
before the cut-outs existed. The downscale happens AFTER the fill, never before: on an
interpolated image the product/background boundary is a gradient, and the fill either
leaks through it or stops short and leaves a halo.

### The seam probe was passing on nothing

The control caught this, not the probe. With a deliberately broken loop injected, the
frame comparison **failed at 390px and passed at 1440px** — because the probe captured
the top of the page and at ≥768px the strip sits below the fold. Those two frames
contained no marquee at all, so "0 pixels differ" meant "nothing was compared", and
every wide-viewport "no seam" verdict before this was vacuous. It now scrolls the
strip into shot and refuses to report when less than half of it is visible. With that
fixed the control fails at **all five** viewports (10–12% of pixels, peak delta 738)
and the real build passes at all five (peak delta 21–24).

It also had to stop looking at the highlight: the focused card is scaled and glowing,
and a *different* card is focused at each end of the cycle, which injected 467
differing pixels into a track whose geometry was provably exact.

Gate unchanged at 23/5/1, sweep 0 blockers / 0 majors, parity 95.38% with the homepage
at 98.4%, contrast clear at every sampled offset, no overflow.

## Revision — the carousel looked stopped, and it was the pause target

Reported as "make Best Seller an infinite carousel loop" — which it already was.
Checked in the reporting browser first: `sr-marquee` playing, 14 cards, the strip
moving 33px per 900ms. The loop was running.

The fault was the pause. `.marquee:hover` put the pause on a band **1563 x 427px**
spanning the full width of the page, so a cursor resting anywhere near that area
froze the carousel — and a frozen carousel reads exactly like one that does not loop.
Hovering a band that large is not a deliberate act.

Pausing now hangs off `.marquee__track:has(.mcard:hover)`: hovering a *product* still
stops the motion so it can be read or clicked, and resting the pointer anywhere else
in the section does nothing. `:has()` is the only way a child's hover can reach the
track; where it is unsupported the strip never pauses on hover, which is the safe
degradation — it keeps looping. Keyboard `:focus-within` still pauses either way.

`tools/probe-marquee-states.mjs` now tests both points: the cursor over the track's
padding (off any card) must leave it **running**, and over a card must **pause** and
resume on leaving. Both confirmed at 1440 and 390.

The cycle also went 46s -> 24s. At 37px/s a full pass through all seven products
took three quarters of a minute, which reads as a static row however correct the
loop is; 24s is 58-71px/s, clearly travelling and still slow enough to read a title.
The duration changes speed, not the -50% the seam depends on, so the geometry is
untouched. The centre highlight keeps up: 4 distinct products over 12 samples, always
the nearest to centre, never two at once.

One knock-on, and it was the probe rather than the page. Pausing needs a CARD under
the pointer, and at 71px/s a 32px gap crosses the cursor in about 0.45s, so a fixed
400ms check sampled the gap and reported that hovering no longer paused. The probe
now polls and reports the wait: 0ms with a card under the cursor, up to 480ms with a
gap, which matches the predicted crossing. Once a card arrives it stops dead there.

Nothing else moved: geometry still exact at 390/1440/1563, the loop still closes on
itself (peak delta 21–24 against 738 for a deliberately broken one), the centre
highlight still hands off one card at a time, sweep 0 blockers / 0 majors, 0 long
frames, gate 23/5/1.

## Revision — the manual scroll is endless too

The auto-travel looped forever; the **scrollbar under it did not**. That loop is a
CSS transform, while the scroller beneath has an ordinary finite range — so dragging
to the last product hit a wall. Two different mechanisms, and only one of them was
infinite.

The track already holds the seven products twice, so layout repeats every copy width
and position `x` shows the same pixels as `x + copyWidth`. `src/scripts/marquee.js`
subtracts one copy the moment the scroll passes it, which is invisible — and stays
invisible while the auto-travel runs, because that is a constant offset at any instant
and the content still repeats with the same period underneath it.

Measured at 1440: asked for 1734px (past one 1694px copy), landed on 40px, and the
frames either side of the wrap are **pixel-identical — 0 differing pixels**. Same at
390 and 768. The control matters here: with the handler removed the identical test
shows the scroll **pinning at its maximum** with 231,281 pixels differing, so the
probe is measuring the wrap rather than agreeing with itself.

**The two wrap rules cancelled each other out at first.** Reaching the start while
travelling left jumped forward to exactly `copyWidth` — which satisfies the
`x >= copyWidth` rule, so the next scroll event threw it straight back to 0 and the
strip simply refused to pass the first product. Landing one pixel inside the boundary
fixes it. Both directions now wrap at 1440, 768 and 390.

The auto-travel also pauses while a hand is on the strip and resumes 1.1s after the
last scroll, otherwise the transform slides products out from under the gesture trying
to move them. And `scroll-behavior` is pinned to `auto` on the strip: the document
sets `smooth`, and if that reached this element the wrap would *glide* across a whole
copy in full view instead of being instant.

`marquee-focus.js` became `marquee.js`, since it now owns both behaviours. Everything
else re-verified: loop geometry exact, seam invisible, centre highlight still handing
off one card at a time, hover pause, reduced motion, contrast 18.7:1 / 7.6:1, 0 long
frames, sweep 0 blockers / 0 majors, gate 23/5/1.

## Revision — mega-menu links painting over the next column

Long category names ran out of their column and over their neighbour.
"Functional Mushroom Products" rendered **230px wide in a 150px column** — 80px of
text on top of the next column's links — and two names ran off the panel entirely.
Measured by `tools/probe-megamenu.mjs`, which forces every panel open (they exist
only on hover, so nothing that measures the page at rest can see them) and compares
each link against its column and its panel: **11 links wider than their column, 2 past
the panel, 0 wrapping**.

**Two causes, and fixing only the obvious one changes nothing.** `white-space: nowrap`
forbade the wrap. But the links were also `display: inline-flex`, and an inline-level
box is shrink-to-fit — it sizes itself to the text's max-content width and overflows
the column whatever the wrapping rules say. It has to be a **block-level** flex
container to take the column's width and let the text wrap inside it.
`overflow-wrap: anywhere` is the backstop for a single word longer than the column,
which wrapping alone cannot help with.

After: **0 escaping, 11 links wrapping to a second row**, at 1024 / 1280 / 1440 /
1563 / 1920.

### The fix exposed a defect that was already there

Wrapping makes a panel taller. At **1563x653** — the window this was reported from —
the wide panel ran **134px past the bottom of the screen**, so the last categories
could not be reached. Checking the previous CSS at the same size: it ran **117px**
past. The overflow was pre-existing; wrapping added 17px to it.

Both are fixed. The panel now caps at the room below its own top edge and scrolls
past that, with the scrollbar left visible on purpose — it is the only thing telling
a visitor there are more categories below. Verified at window heights 653, 700, 800,
900 and 1080: it fits at every one.

The probe's own line counter was wrong first time round: it divided height by
line-height and read the 44px tap-target minimum, so it called every single-line link
two lines. Counting real line boxes via a Range is what makes "wraps to a second row"
a measurement rather than an impression.

## Revision — Latest Products becomes a carousel on phones, and the desktop is locked

Two halves, and the second one is the harder one: change the phone layout, and
*prove* the desktop did not move.

### What was wrong

Eight product cards stacked one per column measured **4,782px — 5.67 screens** at
390x844, on a page that is 13.4 screens end to end. The section was more than a
third of the whole document, and it sat between the category tiles and the trust
badges, so everything after it was behind five screens of swiping.

Stacking is right for a collection page, where browsing *is* the task. It is wrong
for a taste of what is new on the way to somewhere else.

### The change

Below 768px that one grid becomes a horizontal snap rail. Above it, nothing:

| | before | after |
|---|---|---|
| section height @390 | 4,782px | **591px** |
| screens of scrolling | 5.67 | **0.70** |
| whole document @390 | 11,335px | **7,144px** |

Verified at 360, 390, 480 and 767: it scrolls, **all 8 cards are reachable**, the
last card's right edge comes fully inside the box, it **rests 0px from a card edge**
when released mid-swipe, and **8 of 8 cards reveal** as they arrive from the right.
No horizontal overflow on the document at any of them. At 768 and 1440 the class
matches nothing and the grid is still `display: grid` with no tab stop.

Four decisions worth writing down:

- **flex, not a one-row grid.** `grid-auto-flow: column` sizes each track to the
  widest card, so the rail would inherit whichever product has the longest title.
- **`clamp(228px, 72%, 300px)`.** A bare percentage breaks at both ends — 72% of a
  360px phone is too narrow to read a price on, 72% of a 767px tablet is a 529px
  slab with nothing beside it. Inside the clamp, the next card always peeks, and
  that peek is the only affordance a horizontal scroller really needs.
- **`scroll-snap-align: start`, not `center`.** Centre snapping cannot bring the
  first card to rest against the left edge, so the rail opens looking misaligned.
  Start-snapping plus scroll-padding matching the shell gutter puts the first card
  exactly where the heading above it starts.
- **`padding-block` is for the shadow, not for looks.** `--plate-raised` ends in
  `0 6px 16px`; without room, `overflow-y: hidden` slices every card's shadow off
  square.

`src/scripts/rail.js` adds `tabindex="0"`, `role="group"` and a label — but only
while `scrollWidth` actually exceeds `clientWidth`, and it takes them off again
when it does not. A focus stop on something that cannot scroll is a dead tab stop.
Re-checked on resize and after fonts load.

### Locking the desktop, and the three ways the instrument lied first

`tools/lock-view.mjs` captures the whole page at 1440 / 1280 / 1024 / 768 and
compares two runs pixel by pixel. Final result: **0 differing pixels at all four
widths**, with a positive control (a 0.4px `letter-spacing` nudge scoped to
`min-width: 768px`) correctly reporting 19,698.

Getting there took four fixes, every one found by running the tool against an
**unchanged** build and demanding zero:

1. **322,812 pixels, from the carousel.** `marquee.js` re-applies `.is-focus` from
   a `requestAnimationFrame` loop, so removing the class does nothing — it is back
   next frame, on whichever card is nearest the middle. Every focus rule is scoped
   to `html.js-marquee`; dropping that class makes the loop's writes inert.
2. **A whole row of category tiles, present in one capture and empty in the next.**
   They carry their photograph as a CSS `background-image`, so they are not in
   `document.images` and "0 broken images" said nothing about them. Every `url()`
   the page's computed styles resolve to is now fetched and decoded first.
3. **21,158 pixels of hairline around every card.** Forcing `.is-in` *starts* a
   transition — 0.55s plus a stagger of up to 8 x 55ms — so cards revealed by the
   freeze itself were still moving for up to 990ms afterwards. Waiting longer is a
   guess; the freeze now turns transitions off outright.
4. **6,869 pixels inside one photograph.** Chrome paints a scaled background image
   at low filtering quality and re-rasters it a moment later; on the one category
   tile that sits alone on its row at 768px that was the whole difference between
   two runs of the same build.

### The finding that was not one

With those fixed, 1440 / 1280 / 1024 read zero and **768 reported 14,290 differing
pixels**, reproducibly, starting at exactly the top of the Latest Products grid.
It was not a rendering difference:

- the grid measured **identical to three decimal places** on both builds — same
  `display`, same `grid-template-columns`, same card box, same section height,
  same document height, `tabindex: null` on both
- the CSS delta between the two builds is **four rules, all inside
  `@media (max-width: 767px)`**, which does not match at 768
- no image byte in `dist/assets/` changed, and every other page differed by one
  blank line
- screenshotted the **ordinary** way at the same scroll offset, the two builds
  differed by **6 pixels** — photographic dither, delta 14 on a threshold of 12

The difference came from `Page.captureScreenshot` with `captureBeyondViewport`,
which rasterises the whole document onto one surface; with 17 `backdrop-filter`
elements and 8 `mix-blend-mode` images on the page, that path reports edge
differences the browser does not paint. `lock-view.mjs` now captures a column of
**ordinary viewport screenshots and stitches them**, hiding the sticky masthead
from the second slice on so it is compared where it belongs instead of being
pasted over the content of every band beneath it.

Both controls pass on the stitched instrument: three runs of the unchanged build
are byte-identical at all four widths, and the deliberate desktop nudge is caught.

### Where everything else landed

Gate unchanged at **23/5/1**. Sweep **0 blockers / 0 majors** across 24 runs.
Contrast on the rail cards 7.24 / 6.77 / 5.36 against floors of 4.5 / 4.5 / 3.
Payload 1,053.6 KB at 390, **0 long frames**. Marquee geometry still exact with a
0.0px drift per cycle, the manual wrap still invisible in both directions, the
mega menu still 0 escapes with 11 links wrapping, the FAQ still slides through 23
heights.

## A defect this project caused and repaired

`sr-rebase` takes `--dir`; given `--project` it falls back to the current directory.
Run from the skill directory it rewrote 30 preset and fixture files **inside the
installed skill**, injecting its base-path shim into each. All 30 were restored from
`skill-backups/site-reforge-1.8.0-patched-20260921` after proving 29 reversed to the
backup byte-for-byte and the 30th differed only by that rewrite. The skill's own
tests pass afterwards (`rebase` 52 checks, `docs-drift` 276 passed), and its four
local patches are intact. Recorded here because a silent repair is not a repair.
