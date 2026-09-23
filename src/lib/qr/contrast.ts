/** Colour helpers: hex parsing, WCAG relative luminance and contrast ratio. */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isValidHex(hex: unknown): hex is string {
  return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex);
}

/** Normalise '#abc' / 'abc' / '#AABBCC' to '#aabbcc'; returns fallback when invalid. */
export function normalizeHex(hex: unknown, fallback: string): string {
  if (typeof hex !== 'string') return fallback;
  const rgb = parseHex(hex);
  if (!rgb) return fallback;
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** WCAG 2.x relative luminance (sRGB). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Scanners need dark modules on a light background; inverted codes are unreliable on many readers. */
export function isInverted(fg: string, bg: string): boolean {
  return relativeLuminance(fg) > relativeLuminance(bg);
}

export const MIN_SCAN_CONTRAST = 3;
