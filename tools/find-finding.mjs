// Locate which raw sweep file a finding actually came from, so a stale merge is
// never mistaken for a live defect.
import fs from 'node:fs';
import path from 'node:path';

const needle = new RegExp(process.argv[2] || 'facets__range|rangeactions');
const RAW = 'audit/sweep-raw';
let total = 0;
for (const f of fs.readdirSync(RAW).sort()) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue;
  const d = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  const hits = (d.findings || []).filter((x) => needle.test(x.location || ''));
  if (hits.length) {
    total += hits.length;
    console.log(f + '  (' + hits.length + ')');
    hits.forEach((h) => console.log('    [' + h.severity + '] ' + h.title + '  ' + (h.value || '')));
  }
}
console.log('total matching findings across raw sweeps: ' + total);

// and what the merged store now claims
const merged = JSON.parse(fs.readFileSync('audit/sweep-findings.json', 'utf8'));
const mm = merged.dimensions.flatMap((d) => d.findings).filter((x) => needle.test(x.location || ''));
console.log('in audit/sweep-findings.json: ' + mm.length);
