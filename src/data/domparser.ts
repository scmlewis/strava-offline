import { DOMParser as XMLDOMParser } from '@xmldom/xmldom';

type GlobalWithDomParser = typeof globalThis & { DOMParser?: typeof DOMParser };

/**
 * Dedicated Web Workers do not expose `DOMParser`, which `parseGpx` relies on.
 * Install the `@xmldom/xmldom` implementation as a polyfill when the platform
 * lacks a native one, so GPX tracks keep parsing off the main thread.
 *
 * On the main thread (and in any environment that already provides a native
 * `DOMParser`) this is a no-op.
 */
export function ensureDomParser(): void {
  const scope = globalThis as GlobalWithDomParser;
  if (typeof scope.DOMParser === 'undefined') {
    scope.DOMParser = XMLDOMParser as unknown as typeof DOMParser;
  }
}
