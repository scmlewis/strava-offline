import assert from 'node:assert';
import { parseFitGz } from '../src/data/fit';

// A real Strava .fit.gz from a Hong Kong run (activities/20895439576.fit.gz).
// The full base64 fixture is injected into FIT_FIXTURE_B64 at build time; see
// test/fit.fixture.ts (generated from the real export, NOT committed as 44MB).
import { FIT_FIXTURE_B64 } from './fit.fixture';

async function main() {
  const gz = Buffer.from(FIT_FIXTURE_B64, 'base64');
  const stream = await parseFitGz(gz as unknown as Uint8Array);
  assert.ok(stream, 'parseFitGz should return a stream for a valid run');
  assert.ok(stream!.hrHistogram, 'should have an HR histogram');
  const buckets = Object.keys(stream!.hrHistogram!).map(Number);
  assert.ok(buckets.length > 5, `expected a real HR spread (>5 buckets), got ${buckets.length}`);
  const spread = Math.max(...buckets) - Math.min(...buckets);
  assert.ok(spread > 10, `expected real HR spread (>10 bpm), got ${spread}`);
  assert.ok(stream!.route && stream!.route!.length > 10, 'should have a route polyline');
  const [lat, lon] = stream!.route![0];
  assert.ok(
    lat > 20 && lat < 25 && lon > 110 && lon < 120,
    `route should be in HK bounds, got ${lat},${lon}`,
  );
  assert.ok(stream!.avgHr! > 100, 'avgHr should be plausible');
  assert.ok(stream!.maxHr! >= stream!.avgHr!, 'maxHr >= avgHr');

  const bad = await parseFitGz(Buffer.from('not a fit file') as unknown as Uint8Array);
  assert.strictEqual(bad, null, 'garbage input should return null');

  console.log('FIT parse: 2 passed');
}

main().catch((e) => {
  console.error('FIT parse FAILED:', e);
  process.exit(1);
});
