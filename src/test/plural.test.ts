import { describe, expect, it } from 'vitest';
import { pluralMinutes, pluralParts, pluralReaders } from '@/lib/plural';

describe('plural forms', () => {
  it('uses all Arabic plural categories instead of "1 أجزاء"', () => {
    expect(pluralParts(0, 'ar')).toBe('لا أجزاء');
    expect(pluralParts(1, 'ar')).toBe('جزء واحد');
    expect(pluralParts(2, 'ar')).toBe('جزءان');
    expect(pluralParts(3, 'ar')).toBe('3 أجزاء');
    expect(pluralParts(11, 'ar')).toBe('11 جزءًا');
  });

  it('pluralizes English and French part counts', () => {
    expect(pluralParts(1, 'en')).toBe('1 part');
    expect(pluralParts(4, 'en')).toBe('4 parts');
    expect(pluralParts(1, 'fr')).toBe('1 partie');
    expect(pluralParts(4, 'fr')).toBe('4 parties');
  });

  it('never renders a negative or fractional count', () => {
    expect(pluralParts(-3, 'en')).toBe('0 parts');
    expect(pluralParts(Number.NaN, 'ar')).toBe('لا أجزاء');
    expect(pluralMinutes(1, 'en')).toBe('1 min read');
    expect(pluralReaders(2, 'ar')).toBe('قارئان');
    expect(pluralReaders(12, 'ar')).toBe('12 قارئًا');
  });
});
