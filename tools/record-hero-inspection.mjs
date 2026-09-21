// Visual verdicts for the four cannabis-vape hero candidates. Same rule as every
// other generated image: a picture is cleared by being looked at, not by its prompt.
import fs from 'node:fs';
const P = 'src/assets/generated/provenance.json';
const prov = JSON.parse(fs.readFileSync(P, 'utf8'));
const V = {
  'hero-vape-vapor': ['pass', 'SELECTED as the homepage hero. Matte unbranded device, fresh cannabis leaf, vapour plume, cold blue-grey palette that already matches the gunmetal shell. Inspected at full resolution: no lettering, no wordmark, no logo. Large negative space on the left is where the headline sits.'],
  'hero-vape-leaf': ['pass', 'Clean at full size — no lettering on the casing. Held as an alternate; composition puts the device across the left third, which is where the headline goes.'],
  'hero-vape-macro': ['pass', 'Clean — knurled mouthpiece macro, leaf blurred behind, no text. Held as an alternate; too tight to carry a headline.'],
  'hero-vape-flatlay': ['reject', 'REJECTED. All three devices carry fabricated lettering on the casing — a wordmark on the left device and two-character marks on the others. This is exactly the failure mode the contact-sheet pass exists to catch, and no alt or prompt check would have seen it.'],
};
let pass = 0, reject = 0;
for (const im of prov.images) {
  const v = V[im.id];
  if (!v) continue;
  im.inspected = true;
  im.inspectionVerdict = v[0];
  im.inspectionNote = v[1];
  im.inspectionMethod = 'contact sheet at 520px plus a full-resolution render of the selected candidate (audit/contact-sheets/png/)';
  if (v[0] === 'pass') pass++; else reject++;
}
prov.inspection = prov.inspection || { method: 'Every generated image is rendered to a labelled contact sheet and read by eye; a text or alt check cannot see a fabricated wordmark.' };
prov.inspection.passed = prov.images.filter((i) => i.inspectionVerdict === 'pass').length;
prov.inspection.rejected = prov.images.filter((i) => i.inspectionVerdict === 'reject').length;
prov.inspection.rejectedIds = prov.images.filter((i) => i.inspectionVerdict === 'reject').map((i) => i.id);
fs.writeFileSync(P, JSON.stringify(prov, null, 2));
console.log('hero verdicts: ' + pass + ' pass, ' + reject + ' reject');
console.log('site totals: ' + prov.inspection.passed + ' pass, ' + prov.inspection.rejected + ' reject');
console.log('rejected: ' + prov.inspection.rejectedIds.join(', '));
