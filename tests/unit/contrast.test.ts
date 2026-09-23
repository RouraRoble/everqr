import { describe, expect, it } from 'vitest';
import { parseHex, isValidHex, normalizeHex, relativeLuminance, contrastRatio, isInverted } from '../../src/lib/qr/contrast';

describe('parseHex / normalizeHex', () => {
  it('parses 3 and 6 digit hex, case-insensitively', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('000000')).toEqual([0, 0, 0]);
    expect(parseHex('#FF0000')).toEqual([255, 0, 0]);
  });
  it('returns null for invalid input', () => {
    expect(parseHex('not-a-color')).toBeNull();
    expect(isValidHex('#zzzzzz')).toBe(false);
    expect(isValidHex('#aabbcc')).toBe(true);
  });
  it('normalizes to lowercase 6-digit form, falling back when invalid', () => {
    expect(normalizeHex('#ABC', '#000000')).toBe('#aabbcc');
    expect(normalizeHex('nope', '#123456')).toBe('#123456');
    expect(normalizeHex(42, '#123456')).toBe('#123456');
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('black is 0 luminance, white is 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
  it('black on white has the maximum contrast ratio of 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 10);
  });
  it('identical colours have a ratio of 1', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });
});

describe('isInverted', () => {
  it('is true when the foreground is lighter than the background', () => {
    expect(isInverted('#ffffff', '#000000')).toBe(true);
    expect(isInverted('#000000', '#ffffff')).toBe(false);
  });
});
