import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from '../src/ui/router.ts';

describe('parseHash', () => {
  it('parses known tabs', () => {
    expect(parseHash('#/load')).toBe('load');
    expect(parseHash('#/log')).toBe('log');
  });
  it('falls back to overview for empty or unknown hashes', () => {
    expect(parseHash('')).toBe('overview');
    expect(parseHash('#/nope')).toBe('overview');
    expect(parseHash('#')).toBe('overview');
  });
});

describe('toHash', () => {
  it('serializes tabs to hashes', () => {
    expect(toHash('overview')).toBe('#/overview');
    expect(toHash('zones')).toBe('#/zones');
  });
});
