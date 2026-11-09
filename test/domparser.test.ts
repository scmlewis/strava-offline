import { afterEach, describe, expect, it } from 'vitest';
import { ensureDomParser } from '../src/data/domparser.ts';
import { parseGpx } from '../src/data/gpx.ts';

type GlobalWithDomParser = { DOMParser?: typeof DOMParser };

const GPX =
  '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Run</name><trkseg>' +
  '<trkpt lat="51.5" lon="-0.1"><time>2024-06-01T07:00:00Z</time></trkpt>' +
  '<trkpt lat="51.505" lon="-0.095"><time>2024-06-01T07:01:00Z</time></trkpt>' +
  '</trkseg></trk></gpx>';

function globalScope(): GlobalWithDomParser {
  return globalThis as unknown as GlobalWithDomParser;
}

describe('ensureDomParser', () => {
  // Vitest runs in environment: 'node', where DOMParser is absent — the same
  // situation a dedicated Web Worker is in. Clean up so ordering cannot leak.
  afterEach(() => {
    delete globalScope().DOMParser;
  });

  it('installs a DOMParser so GPX routes parse when none is present', () => {
    delete globalScope().DOMParser;
    expect(typeof globalScope().DOMParser).toBe('undefined');

    ensureDomParser();

    const parsed = parseGpx(GPX, '123');
    expect(parsed).not.toBeNull();
    expect(parsed?.activity.route).toEqual([
      [51.5, -0.1],
      [51.505, -0.095],
    ]);
  });

  it('leaves an existing DOMParser untouched', () => {
    const sentinel = { parseFromString: () => ({}) } as unknown as typeof DOMParser;
    globalScope().DOMParser = sentinel;

    ensureDomParser();

    expect(globalScope().DOMParser).toBe(sentinel);
  });

  it('reads gpxtpx heart rate through the xmldom polyfill', () => {
    delete globalScope().DOMParser;
    ensureDomParser();

    const xml =
      '<?xml version="1.0"?>' +
      '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"' +
      ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">' +
      '<trk><name>HR Run</name><trkseg>' +
      '<trkpt lat="51.5" lon="-0.1"><time>2024-06-01T07:00:00Z</time>' +
      '<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr>' +
      '</gpxtpx:TrackPointExtension></extensions></trkpt>' +
      '<trkpt lat="51.505" lon="-0.095"><time>2024-06-01T07:01:00Z</time>' +
      '<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>152</gpxtpx:hr>' +
      '</gpxtpx:TrackPointExtension></extensions></trkpt>' +
      '</trkseg></trk></gpx>';

    const parsed = parseGpx(xml, '150');
    expect(parsed).not.toBeNull();
    expect(parsed?.points[0]?.hr).toBe(150);
    expect(parsed?.points[1]?.hr).toBe(152);
    expect(parsed?.activity.avgHr).toBe(151);
    expect(parsed?.activity.maxHr).toBe(152);
  });
});
