// Generates test/fit.fixture.ts from a real Strava .fit.gz in an export zip.
// Usage: node scripts/gen-fit-fixture.mjs <path-to-export.zip> <fit-gz-name>
// e.g.  node scripts/gen-fit-fixture.mjs ~/Downloads/export.zip activities/20895439576.fit.gz
// The full export (44MB) stays local; only the 25KB fixture is committed.
import fs from 'node:fs';
import JSZip from 'jszip';

const zipPath = process.argv[2];
const fitName = process.argv[3] || 'activities/20895439576.fit.gz';
if (!zipPath) { console.error('usage: node scripts/gen-fit-fixture.mjs <export.zip> [fitName]'); process.exit(1); }

const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
const gz = await zip.files[fitName].async('uint8array');
const b64 = Buffer.from(gz).toString('base64');
const out = `// AUTO-GENERATED from a real HK run .fit.gz (${fitName}).\n// Do NOT edit by hand. Regenerate: node scripts/gen-fit-fixture.mjs\n// The full 44MB Strava export is NOT in the repo; this fixture locks the parser.\nexport const FIT_FIXTURE_B64 = ${JSON.stringify(b64)};\n`;
fs.writeFileSync('test/fit.fixture.ts', out);
console.log(`wrote test/fit.fixture.ts (${b64.length} base64 chars) from ${fitName}`);
