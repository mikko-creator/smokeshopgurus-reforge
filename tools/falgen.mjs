#!/usr/bin/env node
// falgen.mjs — generate imagery via fal.ai and record full provenance.
//
// Every image this writes is DECORATIVE by construction: product-category
// still life and material textures. It never depicts a person, a premises,
// a named brand or a documented result (site-reforge BYLAW B3).
//
//   node tools/falgen.mjs --manifest tools/image-manifest.json --out src/assets/generated
//   node tools/falgen.mjs ... --only hero-forge,tex-brushed   (regenerate a subset)
//
// FAL_KEY is read from the environment. It is never written to disk.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const KEY = process.env.FAL_KEY;
if (!KEY) { console.error('falgen: FAL_KEY not set in environment'); process.exit(2); }

const root = path.resolve(arg('project', '.'));
const manifestPath = path.resolve(root, arg('manifest', 'tools/image-manifest.json'));
const outDir = path.resolve(root, arg('out', 'src/assets/generated'));
const provPath = path.join(outDir, 'provenance.json');
const only = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const prior = fs.existsSync(provPath) ? JSON.parse(fs.readFileSync(provPath, 'utf8')) : { schema: 'falgen/provenance@1', images: [] };
const byId = new Map((prior.images || []).map((r) => [r.id, r]));

// Baked into every prompt: keeps the set one visual system and pushes the model
// away from rendering lettering, which is how a generated image fabricates a mark.
const STYLE = manifest.style || '';
const ANTI = manifest.antiText || '';

async function generate(item) {
  const model = item.model || manifest.model || 'fal-ai/flux/dev';
  // A per-item style override exists because the shared style string is itself a
  // prompt: "gunmetal" next to "grip" produced a firearm, not a knurled texture.
  const style = item.styleOverride != null ? item.styleOverride : STYLE;
  const prompt = [item.prompt, style, ANTI].filter(Boolean).join(', ');
  const body = {
    prompt,
    image_size: item.size || 'landscape_4_3',
    num_images: 1,
    enable_safety_checker: true,
  };
  if (item.steps || manifest.steps) body.num_inference_steps = item.steps || manifest.steps;
  if (item.seed != null) body.seed = item.seed;
  if (item.guidance != null) body.guidance_scale = item.guidance;

  const res = await fetch('https://fal.run/' + model, {
    method: 'POST',
    headers: { 'Authorization': 'Key ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error('fal ' + res.status + ': ' + text.slice(0, 300));
  const json = JSON.parse(text);
  const img = (json.images || [])[0];
  if (!img || !img.url) throw new Error('fal returned no image: ' + text.slice(0, 200));

  const bin = await fetch(img.url);
  if (!bin.ok) throw new Error('download failed ' + bin.status);
  const buf = Buffer.from(await bin.arrayBuffer());
  const ext = (img.content_type || 'image/jpeg').includes('png') ? '.png' : '.jpg';
  const file = item.id + ext;
  fs.writeFileSync(path.join(outDir, file), buf);

  return {
    id: item.id,
    file,
    bytes: buf.length,
    width: img.width || null,
    height: img.height || null,
    role: item.role,
    alt: item.alt,
    model,
    prompt,
    seed: json.seed ?? null,
    nsfwFlagged: Array.isArray(json.has_nsfw_concepts) ? !!json.has_nsfw_concepts[0] : null,
    sourceUrl: img.url,
    generatedAt: new Date().toISOString(),
    inspected: false,
    inspectionNote: '',
  };
}

const todo = manifest.images.filter((i) => (only.length ? only.includes(i.id) : !byId.has(i.id)));
console.log('falgen: ' + todo.length + ' to generate, ' + byId.size + ' already on disk');

let ok = 0; const failures = [];
// Serial with a gap: fal is a third-party host and this is not a race.
for (const item of todo) {
  try {
    const rec = await generate(item);
    byId.set(rec.id, rec);
    ok++;
    console.log('  OK   ' + rec.id + '  ' + rec.width + 'x' + rec.height + '  ' + (rec.bytes / 1024).toFixed(0) + 'KB');
  } catch (e) {
    failures.push({ id: item.id, reason: String(e.message || e) });
    console.log('  FAIL ' + item.id + '  ' + String(e.message || e).slice(0, 160));
  }
  // prior.inspection is CARRIED FORWARD. Dropping it lost the site-wide verdict
  // summary on every regeneration; the per-image verdicts survived only because
  // they ride along inside byId.
  fs.writeFileSync(provPath, JSON.stringify({ schema: 'falgen/provenance@1', updatedAt: new Date().toISOString(), inspection: prior.inspection, images: [...byId.values()], failures }, null, 2));
  await new Promise((r) => setTimeout(r, 400));
}

console.log('falgen: ' + ok + ' generated, ' + failures.length + ' failed -> ' + provPath);
if (failures.length) process.exitCode = 1;
