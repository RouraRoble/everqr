import { describe, expect, it } from 'vitest';
import { createMatrix, isFinder, explainEncodeError, isEcc, MAX_PAYLOAD_BYTES } from '../../src/lib/qr/matrix';

describe('createMatrix', () => {
  it('creates a square matrix whose get() matches the raw data', () => {
    const m = createMatrix('https://example.com', 'M');
    expect(m.size).toBeGreaterThan(0);
    expect(m.data.length).toBe(m.size * m.size);
    const anyDark = m.data.some((v) => v === 1);
    expect(anyDark).toBe(true);
    expect(m.get(0, 0)).toBe(m.data[0] === 1);
  });
  it('throws for empty text', () => {
    expect(() => createMatrix('')).toThrow();
  });
  it('produces a larger matrix for more error correction at the same content', () => {
    const l = createMatrix('a'.repeat(200), 'L');
    const h = createMatrix('a'.repeat(200), 'H');
    expect(h.size).toBeGreaterThanOrEqual(l.size);
  });
});

describe('isFinder', () => {
  it('identifies the three 7x7 finder corners', () => {
    const size = 25;
    expect(isFinder(size, 0, 0)).toBe(true);
    expect(isFinder(size, 6, 6)).toBe(true);
    expect(isFinder(size, 0, size - 1)).toBe(true);
    expect(isFinder(size, size - 1, 0)).toBe(true);
    expect(isFinder(size, size - 1, size - 1)).toBe(false);
    expect(isFinder(size, 12, 12)).toBe(false);
  });
});

describe('isEcc', () => {
  it('accepts only L/M/Q/H', () => {
    expect(isEcc('L')).toBe(true);
    expect(isEcc('H')).toBe(true);
    expect(isEcc('X')).toBe(false);
    expect(isEcc(undefined)).toBe(false);
  });
});

describe('explainEncodeError', () => {
  it('gives a friendly message for "too big" errors', () => {
    expect(explainEncodeError(new Error('The amount of data is too big'))).toMatch(/too much data/i);
  });
  it('falls back to the raw message otherwise', () => {
    expect(explainEncodeError(new Error('something else'))).toBe('something else');
    expect(explainEncodeError('plain string')).toBe('plain string');
  });
});

describe('MAX_PAYLOAD_BYTES', () => {
  it('rejects content larger than the cap when creating a matrix', () => {
    expect(() => createMatrix('a'.repeat(MAX_PAYLOAD_BYTES + 500), 'H')).toThrow();
  });
});
