# Smoke Shop Guru — platform-free rebuild

A complete reconstruction of `https://smokeshopgurus.com` as a static site with no
Shopify runtime, redesigned around a gun-metal skeuomorphic design system.

Everything in `dist/` is generated. Nothing in it was hand-edited, so the build is
reproducible from the harvest at any time.

---

## What is here

```
audit/        the evidence. Every verdict in this project resolves to a file here.
  raw/        the 150 pages exactly as the live site served them — never edited
  capture/    computed style + live animations, 6 pages x 4 breakpoints, browser-measured
  screens/    full-height screenshots, baseline and rebuild
  *.json      one artifact per stage
facts/        client-facts.json — the only place a claim may come from that is not in audit/
src/          the authored source: styles, scripts, data model, generated imagery
tools/        the build. Plain Node, no dependencies.
dist/         the built site — 141 pages
docs/         this documentation
```

## Rebuilding from scratch

Node 18+ and nothing else. From the project root, in this order:

```bash
node tools/build-model.mjs        # audit/raw/*.html      -> src/data/site-model.json
node tools/apply-brand-layer.mjs  # re-append the gun-metal tokens to tokens.css
node tools/generate.mjs           # site-model.json       -> dist/ (141 pages)
```

Then the three post-passes, **in this order** — each one rewrites what the last wrote:

```bash
node <skill>/scripts/sr-seo.mjs    --project . --apply --site-url https://smokeshopgurus.com
node <skill>/scripts/sr-images.mjs --project . --apply     # JPEG/PNG -> WebP, rewrites refs
node <skill>/scripts/sr-rebase.mjs --dir dist              # NOTE: --dir, not --project
```

`sr-rebase` takes `--dir`. Given `--project` it silently falls back to the current
directory and rewrites whatever it finds there — during this build that was the
installed skill itself, and 30 of its preset and fixture files had to be restored
from backup. Pass `--dir dist` and check what it reports.

Re-running `tools/generate.mjs` discards the SEO repair, the WebP conversion and the
rebasing, because it rewrites `dist/` from nothing. Always re-run all three after it.

## Serving it

The build is path-independent after `sr-rebase`: a domain root, a subdirectory and a
`file://` path all work. For a local check:

```bash
node <skill>/scripts/sr-serve.mjs --root dist --port 8788 --no-open
```

## What the live site turned out to be

The capture is the record; these are the headlines.

| | |
|---|---|
| Platform | Shopify (150/150 pages) |
| Pages | 150 crawled — 1 home, 82 products, 46 collections, 9 pages, 1 blog index, 11 paginated |
| Products | 82, all priced, 81 with descriptions, 82 with photography |
| Images | 3,590 references, 3,590 distinct URLs |
| `<title>` | **absent on 150 of 150 pages** |
| meta description | **absent on 150 of 150 pages** |
| structured data | **absent on 150 of 150 pages** |
| `og:title` | **absent on 150 of 150 pages** |
| `<h1>` | absent on the homepage |

Those five SEO defects are the single biggest finding of this project and all of them
are fixed in the rebuild: 141 of 141 built pages carry a title, a description, a
canonical, Open Graph and Twitter metadata and JSON-LD, with no duplicates
(`node tools/head-audit.mjs` re-checks that in one pass).

## Verifying it

`sr-gate.mjs` is the only authority on whether this is ready. It reads files, not
claims:

```bash
node <skill>/scripts/sr-gate.mjs --project .
```

See `CHANGE-LOG.md` for what the gate says at handover and exactly which checks are
not green, with the evidence for each.

## Tools written for this project

All zero-dependency Node, all in `tools/`.

| tool | what it does |
|---|---|
| `build-model.mjs` | parses `audit/raw/*.html` into one structured site model |
| `generate.mjs` | renders the whole site from that model |
| `cdp.mjs` | a Chrome DevTools Protocol client on Node 24's built-in WebSocket |
| `capture-run.mjs` | drives headless Chrome to harvest computed style at each breakpoint |
| `shoot.mjs` | full-document-height screenshots over CDP |
| `falgen.mjs` | generates imagery via fal.ai and records full provenance |
| `recall-diff.mjs` | shows which tokens a rebuilt page is short of, and by how many |
| `head-audit.mjs` | counts head fields per page, reports duplicates and gaps |
| `sanitize-motion.mjs` | strips platform names from generated CSS comments, refusing if a keyframe changes |
| `apply-brand-layer.mjs` | re-applies the gun-metal token layer after any `sr-tokens` run |

`recall-diff.mjs` is the one worth keeping. The parity report names the first sixty
missing words, which tells you something is wrong and not what to build;
`recall-diff` prints the per-token deficit and turns that into a list of fixes.
