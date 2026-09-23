/**
 * Our own SVG renderer for styled QR codes. Output is exact vector art: every module is a path
 * segment in the same units as the matrix (1 unit = 1 module), so it scales without artefacts.
 */
import { isFinder, type Matrix } from './matrix';
import { normalizeHex } from './contrast';

export type ModuleStyle = 'square' | 'rounded' | 'dots';
export type EyeStyle = 'square' | 'rounded' | 'circle';
export const MODULE_STYLES: { id: ModuleStyle; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'dots', label: 'Dots' },
];
export const EYE_STYLES: { id: EyeStyle; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle', label: 'Circle' },
];

export interface Design {
  fg: string;
  bg: string;
  /** Optional separate colour for the three eyes; empty = same as fg. */
  eyeColor: string;
  moduleStyle: ModuleStyle;
  eyeStyle: EyeStyle;
  /** Quiet zone in modules (spec recommends 4). */
  margin: number;
  /** Export size in px (square). */
  size: number;
  transparent: boolean;
  /** Logo width as a fraction of the code width (0.15–0.3). */
  logoScale: number;
}

export const DEFAULT_DESIGN: Design = {
  fg: '#10201a',
  bg: '#ffffff',
  eyeColor: '',
  moduleStyle: 'square',
  eyeStyle: 'square',
  margin: 4,
  size: 1024,
  transparent: false,
  logoScale: 0.22,
};

export const LIMITS = {
  size: { min: 256, max: 4096 },
  margin: { min: 0, max: 10 },
  logoScale: { min: 0.15, max: 0.3 },
};

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
export function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function isModuleStyle(x: unknown): x is ModuleStyle {
  return MODULE_STYLES.some((s) => s.id === x);
}
export function isEyeStyle(x: unknown): x is EyeStyle {
  return EYE_STYLES.some((s) => s.id === x);
}

/** Coerce any object into a valid Design (used for URL state and localStorage). */
export function sanitizeDesign(input: unknown): Design {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    fg: normalizeHex(o.fg, DEFAULT_DESIGN.fg),
    bg: normalizeHex(o.bg, DEFAULT_DESIGN.bg),
    eyeColor: o.eyeColor ? normalizeHex(o.eyeColor, '') : '',
    moduleStyle: isModuleStyle(o.moduleStyle) ? o.moduleStyle : DEFAULT_DESIGN.moduleStyle,
    eyeStyle: isEyeStyle(o.eyeStyle) ? o.eyeStyle : DEFAULT_DESIGN.eyeStyle,
    margin: clampInt(o.margin, LIMITS.margin.min, LIMITS.margin.max, DEFAULT_DESIGN.margin),
    size: clampInt(o.size, LIMITS.size.min, LIMITS.size.max, DEFAULT_DESIGN.size),
    transparent: o.transparent === true || o.transparent === 1 || o.transparent === '1',
    logoScale: clampNum(o.logoScale, LIMITS.logoScale.min, LIMITS.logoScale.max, DEFAULT_DESIGN.logoScale),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const f = (n: number) => String(Math.round(n * 1000) / 1000);

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
  return (
    `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}` +
    `h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`
  );
}
function circlePath(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
}
/**
 * Winds counter-clockwise on screen to match circlePath's winding direction (sweep-flag 0). This
 * matters wherever a rectPath and a circlePath overlap in the same fill-rule="nonzero" path (see
 * drawDots): opposite windings cancel to a winding count of 0 in the overlap, which SVG renders as
 * a hole — a thin notch right at the seam between a dot and its bridge, which is exactly the kind
 * of gap this style exists to eliminate. Reproduced and fixed during the audit-2 N-2 pass; keep
 * this orientation (or flip circlePath's sweep-flag to match) if this function changes.
 */
function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${f(x)} ${f(y)}v${f(h)}h${f(w)}v${f(-h)}h${f(-w)}z`;
}

/** Dot radius and connector half-width for the 'dots' module style (see drawDots below). */
const DOT_R = 0.42;

function modulePath(style: ModuleStyle, x: number, y: number): string {
  switch (style) {
    case 'rounded':
      return roundedRectPath(x, y, 1, 1, 0.35);
    default:
      return `M${f(x)} ${f(y)}h1v1h-1z`;
  }
}

/**
 * 'dots' style needs neighbour context, unlike the other styles: a plain per-module circle at
 * r=0.42 left visible gaps between orthogonally-adjacent dark modules, so jsQR (and other
 * scanners) sometimes failed to lock onto the grid — especially at export sizes where the SVG's
 * antialiasing of many small isolated circles softens module edges past the decoder's binarizer
 * threshold (verified with a jsQR round trip across payload sizes/scales; see tests/unit/scan.test.ts).
 * Bumping the radius alone (r=0.58) papered over the gap but over-inflated every isolated dot,
 * which still failed at some sizes for denser payloads (long vCards). Instead: keep each dot at a
 * true aesthetic radius, and draw a straight "bridge" the same width as the dot between the
 * centres of any two orthogonally-adjacent dark modules, so a run of dark modules renders as one
 * continuous capsule-shaped blob (same width throughout, nothing thin or isolated for the decoder
 * to lose), while a genuinely isolated dark module still reads as a small circle.
 */
function drawDots(matrix: Matrix, m: number, eligible: (r: number, c: number) => boolean): string {
  const n = matrix.size;
  let data = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!eligible(r, c)) continue;
      const cx = c + m + 0.5;
      const cy = r + m + 0.5;
      data += circlePath(cx, cy, DOT_R);
      if (eligible(r, c + 1)) data += rectPath(cx, cy - DOT_R, 1, 2 * DOT_R);
      if (eligible(r + 1, c)) data += rectPath(cx - DOT_R, cy, 2 * DOT_R, 1);
    }
  }
  return data;
}

/** Eye = 7×7 outer ring (1 module thick) + 3×3 pupil, drawn with even-odd fill. */
function eyePath(style: EyeStyle, x: number, y: number): string {
  switch (style) {
    case 'rounded':
      return roundedRectPath(x, y, 7, 7, 2) + roundedRectPath(x + 1, y + 1, 5, 5, 1.2) + roundedRectPath(x + 2, y + 2, 3, 3, 0.8);
    case 'circle':
      return circlePath(x + 3.5, y + 3.5, 3.5) + circlePath(x + 3.5, y + 3.5, 2.5) + circlePath(x + 3.5, y + 3.5, 1.5);
    default:
      return `M${f(x)} ${f(y)}h7v7h-7z` + `M${f(x + 1)} ${f(y + 1)}h5v5h-5z` + `M${f(x + 2)} ${f(y + 2)}h3v3h-3z`;
  }
}

export interface RenderOptions {
  /** Data URL (image/png) of an already rasterised logo; omitted = no logo. */
  logo?: string;
  /** Override width/height attributes (default design.size). */
  size?: number;
}

/** Area (in modules, inclusive bounds) hidden behind the logo pad; null when no logo. */
export function logoBox(matrixSize: number, margin: number, scale: number): { x: number; y: number; w: number } | null {
  if (!(scale > 0)) return null;
  const total = matrixSize + 2 * margin;
  const w = Math.max(3, Math.round(matrixSize * scale));
  const x = Math.round((total - w) / 2);
  return { x, y: x, w };
}

export function renderSvg(matrix: Matrix, design: Design, opts: RenderOptions = {}): string {
  const n = matrix.size;
  const m = design.margin;
  const total = n + 2 * m;
  const px = opts.size ?? design.size;
  const fg = design.fg;
  const eye = design.eyeColor || fg;
  const box = opts.logo ? logoBox(n, m, design.logoScale) : null;
  const pad = 0.6;
  const hidden = (r: number, c: number) => {
    if (!box) return false;
    const x = c + m;
    const y = r + m;
    return x + 1 > box.x - pad && x < box.x + box.w + pad && y + 1 > box.y - pad && y < box.y + box.w + pad;
  };

  const eligible = (r: number, c: number) => r >= 0 && r < n && c >= 0 && c < n && matrix.get(r, c) && !isFinder(n, r, c) && !hidden(r, c);
  let data = '';
  if (design.moduleStyle === 'dots') {
    data = drawDots(matrix, m, eligible);
  } else {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!eligible(r, c)) continue;
        data += modulePath(design.moduleStyle, c + m, r + m);
      }
    }
  }
  const eyes = eyePath(design.eyeStyle, m, m) + eyePath(design.eyeStyle, m + n - 7, m) + eyePath(design.eyeStyle, m, m + n - 7);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision" role="img" aria-label="QR code">`,
  );
  if (!design.transparent) parts.push(`<rect width="${total}" height="${total}" fill="${esc(design.bg)}"/>`);
  parts.push(`<path fill="${esc(fg)}" d="${data}"/>`);
  parts.push(`<path fill="${esc(eye)}" fill-rule="evenodd" d="${eyes}"/>`);
  if (box && opts.logo) {
    const padBg = design.transparent ? '#ffffff' : design.bg;
    parts.push(
      `<rect x="${f(box.x - pad)}" y="${f(box.y - pad)}" width="${f(box.w + 2 * pad)}" height="${f(box.w + 2 * pad)}" rx="${f(pad)}" fill="${esc(padBg)}"/>`,
    );
    parts.push(
      `<image href="${esc(opts.logo)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.w}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Rough count of dark modules that a logo would hide; used to warn when it exceeds what ECC H can absorb. */
export function hiddenModuleRatio(matrix: Matrix, design: Design): number {
  const box = logoBox(matrix.size, design.margin, design.logoScale);
  if (!box) return 0;
  const n = matrix.size;
  const m = design.margin;
  let hidden = 0;
  let total = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(n, r, c)) continue;
      total++;
      const x = c + m;
      const y = r + m;
      if (x + 1 > box.x - 0.6 && x < box.x + box.w + 0.6 && y + 1 > box.y - 0.6 && y < box.y + box.w + 0.6) hidden++;
    }
  }
  return total ? hidden / total : 0;
}

/* ---------- Browser-only helpers (guarded so unit tests can import this module) ---------- */

export function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export async function svgToPngBlob(svg: string, size: number): Promise<Blob> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not rasterise the SVG.'));
    img.src = svgDataUrl(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed.'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Safe file name from a label. */
export function safeFilename(label: string, fallback = 'qr-code'): string {
  const s = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

/**
 * Rasterise a user-selected logo file to a small PNG data URL (max 512px). Loading through an
 * <img> and re-encoding via canvas strips any embedded scripts/metadata from SVG or photo files.
 */
export async function prepareLogo(file: Blob, max = 512): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Use a PNG, JPG, WebP, GIF or SVG image.');
  if (file.size > 4 * 1024 * 1024) throw new Error('Logo files are limited to 4 MB.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Could not read the file.'));
    fr.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not decode the image.'));
    img.src = dataUrl;
  });
  const w = img.naturalWidth || 256;
  const h = img.naturalHeight || 256;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
