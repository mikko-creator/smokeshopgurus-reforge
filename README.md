# Smoke Shop Gurus — platform-free rebuild

A reconstruction of `smokeshopgurus.com` as 141 static pages with no Shopify runtime,
plus a commissioned redesign: gun-metal skeuomorphism, glass, and a drifting smoke
field.

## Preview it

**From a clone — no build, nothing to install:**

```bash
git clone https://github.com/mikko-creator/smokeshopgurus-reforge.git
cd smokeshopgurus-reforge
node tools/serve.mjs          # http://127.0.0.1:8788
```

`dist/` is committed, so that serves the real thing immediately. The server is Node
builtins only — no package manager, no dependencies, and it resolves bare paths to
`index.html` the way a real host will.

**Hosted preview.** A `gh-pages` branch is built and pushed, holding `dist/` at its
root. GitHub Pages is not serving it yet: Pages on a **private** repository requires a
paid plan, and turning it on means making this repository **public** — which puts the
client's copy, product photography and legal text on the open internet. That is a
decision for the owner, not a build step.

If it is turned on, the preview already carries a `robots.txt` that disallows
everything. This is a copy of a live store, and an indexable duplicate would compete
with the client's own site in search. `dist/robots.txt` — the one that actually ships
— is the real one and allows crawling as it should.

---

## Where to look

| path | what it is |
|---|---|
| `dist/` | the built site. This is the deliverable, and what the preview serves. |
| `docs/BRAND-SYSTEM.md` | the design system: why each rule exists, and what breaks if you change it |
| `docs/CHANGE-LOG.md` | every revision, every defect found, and what the gate says |
| `docs/DEPLOY.md` | how to put it live, and the one thing the client's counsel must do |
| `src/` | sources — the page generator's model, the authored CSS, the scripts |
| `tools/` | the build and the probes (see below) |
| `audit/*.json` | the evidence the docs cite: parity, fabrication, sweep, gate |

## Build it

```bash
node tools/build.mjs
```

That runs all five stages in order and refuses to finish if the result is
un-optimised. Do **not** run `tools/generate.mjs` alone: it re-copies the original
assets over the converted ones, and a build that skips the image stage silently ships
39 MB of PNG instead of 7 MB of WebP. That happened twice; `build.mjs` exists so it
cannot happen again.

Building from a fresh clone needs `assets/` (423 MB of raw downloads from the live
site), which is not in the repo. `dist/` is committed, so the site and the preview
work without it.

## The gate is the authority

```bash
node <site-reforge>/scripts/sr-gate.mjs --project .
```

It reads **PASS 23 · FAIL 5 · UNPROVEN 1 of 29 — NOT-READY**. That is expected and
every one of the six is analysed in `docs/CHANGE-LOG.md`. Two of them grade the
*source site*, not this rebuild; one is a sentence of the client's own Terms of
Service; one asks a deliberate redesign to be pixel-identical to the thing it
replaced. None is an unexplained failure.

## The probes

Nothing in the change log is asserted without a measurement, and every probe carries
a control that proves it can fail. Some of what they caught:

- `probe-text-contrast` — text sampled against the pixels actually behind it.
- `probe-marquee` — the carousel's loop geometry, and the rendered first and last
  frames compared. Its control injects a 16px seam.
- `probe-vapor-visible` / `-speed` / `-bounds` — three different questions about the
  smoke, because "it is running" and "you can see it" are not the same claim.
- `probe-hero-contrast`, `probe-overflow`, `probe-scrollperf`, `probe-drawer`,
  `probe-brand-a11y`, `probe-css-parity`, `probe-marquee-focus`, `probe-marquee-scroll`.

Run any of them against a local server:

```bash
node <site-reforge>/scripts/sr-serve.mjs --root dist --port 8788 --no-open
node tools/probe-marquee.mjs http://127.0.0.1:8788/ 1440
```

## Altered imagery, declared

- `src/assets/generated/` — decorative images generated with fal.ai. Every one was
  inspected; `provenance.json` records the prompt, the seed and the verdict, and
  anything that failed inspection cannot be published by the generator.
- `src/assets/cutouts/` — the client's **own** product photographs with their studio
  background flood-filled away, for the Best Seller strip only. Recorded in
  `audit/cutouts.json`. The originals are untouched and still serve every product
  page and grid.
