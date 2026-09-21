// record-inspection.mjs — write the human visual verdict for each generated image
// into provenance.json. A generated picture is not cleared by its prompt or its
// alt text; it is cleared by somebody looking at it. This file is that record.
import fs from 'node:fs';

const P = 'src/assets/generated/provenance.json';
const prov = JSON.parse(fs.readFileSync(P, 'utf8'));

// pass: fit to ship. reject: not used anywhere in the build.
const VERDICTS = {
  'hero-gunmetal-anvil':   ['pass', 'Abstract steel plates. No text, no marks, no subject risk.'],
  'tex-brushed-gunmetal':  ['pass', 'Pure brushed-metal gradient. Clean.'],
  'tex-machined-swirl':    ['pass', 'Engine-turned swirl relief. Clean.'],
  'tex-knurled-grip':      ['pass', 'REGENERATED pass 2. Pass 1 rendered a semi-automatic handgun with engraved lettering, caused by the shared style string placing "gunmetal" beside "grip". Now a flat crosshatch steel texture with no object and no lettering.'],
  'tex-tread-plate':       ['pass', 'Diamond tread plate. Clean.'],
  'tex-perforated-mesh':   ['pass', 'Perforated mesh in perspective. Clean.'],
  'tex-scratched-steel':   ['pass', 'Scuffed steel plate. Clean.'],
  'cat-glass-bongs':       ['pass', 'Clear beaker water pipe, plain unetched glass, no markings.'],
  'cat-glass-pipes':       ['reject', 'Pass 1 read as glass beads; pass 2 read as decanters. Never resolved as a spoon pipe. No fabricated text, but the tile would misrepresent the category, so it is not used — the real product photography from the source covers glass.'],
  'cat-glass-bangers':     ['reject', 'Pass 1 read as a bottle; pass 2 as a vase with spheres. Never resolved as a quartz banger. Not used, for the same reason as cat-glass-pipes.'],
  'cat-rolling-papers':    ['pass', 'Stack of blank unbleached booklets. No print on any cover.'],
  'cat-pre-rolled-cones':  ['pass', 'Empty cones in a metal tray. Blank paper.'],
  'cat-blunt-wraps':       ['pass', 'Leaf wraps in a plain dish. Clean.'],
  'cat-disposable-vapes':  ['pass', 'REGENERATED pass 2. Pass 1 rendered a repeated fabricated wordmark on all three device bodies. Now smooth matte casings with no markings.'],
  'cat-wax-pens':          ['pass', 'REGENERATED pass 2. Pass 1 carried faint fabricated lettering on the pen bodies. Now plain steel cylinders.'],
  'cat-grinders':          ['pass', 'Four-piece grinder, lid off, milled teeth visible. No markings.'],
  'cat-lighters':          ['pass', 'Plain lighters and one jet torch. No legible print.'],
  'cat-mushroom-wellness': ['pass', 'Dried fungi and a cork-stoppered jar. No label.'],
  'cat-edibles':           ['pass', 'Gummies from a plain tin. No print.'],
  'cat-tinctures':         ['pass', 'Blank amber dropper bottle. No label.'],
  'cat-topicals':          ['pass', 'Blank balm tin, lid off. No print.'],
  'cat-kratom':            ['pass', 'Green powder, capsules and a leaf. No packaging.'],
  'cat-pet-treats':        ['pass', 'Bone biscuits in a plain metal bowl. No print.'],
  'cat-stash-bags':        ['pass', 'Matte zip bag with metal hardware. No badge or wordmark.'],
  'cat-herb-containers':   ['pass', 'Two screw-top metal containers. No markings.'],
  'cat-accessories':       ['pass', 'REGENERATED pass 2. Pass 1 carried engraved lettering on a tool handle. Now a clean flat-lay of screens, bowls and tools with no engraving.'],
};

let pass = 0, reject = 0, unknown = [];
for (const im of prov.images) {
  const v = VERDICTS[im.id];
  if (!v) { unknown.push(im.id); continue; }
  im.inspected = true;
  im.inspectionVerdict = v[0];
  im.inspectionNote = v[1];
  im.inspectedAt = new Date().toISOString();
  im.inspectionMethod = 'rendered to a labelled contact sheet at 520px and read by eye (audit/contact-sheets/png/)';
  if (v[0] === 'pass') pass++; else reject++;
}

prov.inspection = {
  method: 'Every generated image was rendered into a labelled contact sheet and visually read. Text and alt checks cannot see a fabricated wordmark or a wrong subject; only looking can.',
  passed: pass, rejected: reject, uninspected: unknown.length,
  rejectedIds: prov.images.filter((i) => i.inspectionVerdict === 'reject').map((i) => i.id),
  completedAt: new Date().toISOString(),
};
fs.writeFileSync(P, JSON.stringify(prov, null, 2));
console.log('inspection recorded: ' + pass + ' pass, ' + reject + ' reject, ' + unknown.length + ' uninspected');
if (unknown.length) console.log('  UNINSPECTED: ' + unknown.join(', '));
console.log('  rejected: ' + prov.inspection.rejectedIds.join(', '));
