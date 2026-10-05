import { describe, it, expect } from 'vitest';
import { shouldDismissOnKey } from '../src/ui/modals.ts';

describe('shouldDismissOnKey', () => {
  it('dismisses on Escape only', () => {
    expect(shouldDismissOnKey('Escape')).toBe(true);
    expect(shouldDismissOnKey('Enter')).toBe(false);
  });
});
