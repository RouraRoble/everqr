import { describe, expect, it } from 'vitest';
import { createMatrix } from '../../src/lib/qr/matrix';
import {
  renderSvg,
  sanitizeDesign,
  DEFAULT_DESIGN,
  clampInt,
  clampNum,
  isModuleStyle,
  isEyeStyle,
  logoBox,
  hiddenModuleRatio,
  safeFilename,
  LIMITS,
} from '../../src/lib/qr/render';

describe('clampInt / clampNum', () => {
  it('clamps within range and falls back for non-numeric input', () => {
    expect(clampInt(5, 0, 10, 1)).toBe(5);
    expect(clampInt(50, 0, 10, 1)).toBe(10);
    expect(clampInt(-5, 0, 10, 1)).toBe(0);
    expect(clampInt('abc', 0, 10, 3)).toBe(3);
    expect(clampNum(0.5, 0, 1, 0)).toBe(0.5);
  });
});

describe('isModuleStyle / isEyeStyle', () => {
  it('validates the known style ids only', () => {
    expect(isModuleStyle('dots')).toBe(true);
    expect(isModuleStyle('bogus')).toBe(false);
    expect(isEyeStyle('circle')).toBe(true);
    expect(isEyeStyle('bogus')).toBe(false);
  });
});

describe('sanitizeDesign', () => {
  it('fills in defaults for a completely invalid input', () => {
    const d = sanitizeDesign(null);
    expect(d).toEqual(DEFAULT_DESIGN);
  });
  it('clamps and normalises a partially valid input', () => {
    const d = sanitizeDesign({ fg: '#ABC', size: 99999, margin: -3, moduleStyle: 'dots', transparent: '1' });
    expect(d.fg).toBe('#aabbcc');
    expect(d.size).toBe(LIMITS.size.max);
    expect(d.margin).toBe(LIMITS.margin.min);
    expect(d.moduleStyle).toBe('dots');
    expect(d.transparent).toBe(true);
  });
});

describe('renderSvg', () => {
  const matrix = createMatrix('https://example.com', 'M');

  it('produces a valid svg root element sized to the design', () => {
    const svg = renderSvg(matrix, DEFAULT_DESIGN);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain(`width="${DEFAULT_DESIGN.size}"`);
    expect(svg).toContain('</svg>');
  });
  it('omits the background rect when transparent is set', () => {
    const svg = renderSvg(matrix, { ...DEFAULT_DESIGN, transparent: true });
    expect(svg).not.toContain(`fill="${DEFAULT_DESIGN.bg}"`);
  });
  it('escapes colour values used as attributes', () => {
    const svg = renderSvg(matrix, { ...DEFAULT_DESIGN, fg: '#112233' });
    expect(svg).toContain('fill="#112233"');
  });
  it('includes an <image> element when a logo is supplied', () => {
    const svg = renderSvg(matrix, DEFAULT_DESIGN, { logo: 'data:image/png;base64,AAAA' });
    expect(svg).toContain('<image');
  });
});

describe('logoBox / hiddenModuleRatio', () => {
  const matrix = createMatrix('https://example.com', 'H');

  it('returns null when there is no logo scale', () => {
    expect(logoBox(matrix.size, 4, 0)).toBeNull();
  });
  it('centers a box sized by the scale', () => {
    const box = logoBox(matrix.size, 4, 0.2);
    expect(box).not.toBeNull();
    expect(box!.w).toBeGreaterThan(0);
    expect(box!.x).toBe(box!.y);
  });
  it('reports a hidden-module ratio between 0 and 1, higher for a bigger logo', () => {
    const design = { ...DEFAULT_DESIGN };
    const small = hiddenModuleRatio(matrix, { ...design, logoScale: 0.15 });
    const large = hiddenModuleRatio(matrix, { ...design, logoScale: 0.3 });
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(1);
    expect(large).toBeGreaterThan(small);
  });
});

describe('safeFilename', () => {
  it('strips unsafe characters and accents', () => {
    expect(safeFilename('Café Menü!')).toBe('Cafe-Menu');
  });
  it('falls back when the result would be empty', () => {
    expect(safeFilename('!!!', 'fallback')).toBe('fallback');
  });
  it('truncates very long labels', () => {
    expect(safeFilename('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
