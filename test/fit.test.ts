import { describe, it, expect } from 'vitest';
import { parseFitGz } from '../src/data/fit';
import { FIT_FIXTURE_B64 } from './fit.fixture';

describe('FIT parser', () => {
  it('parses a valid .fit.gz file', async () => {
    const gz = Buffer.from(FIT_FIXTURE_B64, 'base64');
    const stream = await parseFitGz(gz as unknown as Uint8Array);
    expect(stream).not.toBeNull();
    expect(stream!.hrHistogram).toBeTruthy();
    const buckets = Object.keys(stream!.hrHistogram!).map(Number);
    expect(buckets.length).toBeGreaterThan(5);
    const spread = Math.max(...buckets) - Math.min(...buckets);
    expect(spread).toBeGreaterThan(10);
    expect(stream!.route).toBeTruthy();
    expect(stream!.route!.length).toBeGreaterThan(10);
    const [lat, lon] = stream!.route![0];
    expect(lat).toBeGreaterThan(20);
    expect(lat).toBeLessThan(25);
    expect(lon).toBeGreaterThan(110);
    expect(lon).toBeLessThan(120);
    expect(stream!.avgHr!).toBeGreaterThan(100);
    expect(stream!.maxHr!).toBeGreaterThanOrEqual(stream!.avgHr!);
  });

  it('returns null for garbage input', async () => {
    const bad = await parseFitGz(Buffer.from('not a fit file') as unknown as Uint8Array);
    expect(bad).toBeNull();
  });
});
