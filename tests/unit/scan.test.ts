/**
 * "Self-test" round trip: render a QR code with our SVG renderer, rasterise it with sharp (no
 * DOM/canvas needed in Node) and decode it back with jsQR — the same decoder the Checker page
 * uses. This is what actually caught P2-8 (the "Dots" module style rendering as isolated circles
 * with visible gaps, which jsQR could not lock onto) and guards against a regression.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createMatrix } from '../../src/lib/qr/matrix';
import { renderSvg, DEFAULT_DESIGN, MODULE_STYLES, EYE_STYLES, type Design } from '../../src/lib/qr/render';

async function decodeSvg(svg: string, size: number): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const result = jsQR(clamped, info.width, info.height, { inversionAttempts: 'dontInvert' });
  return result?.data ?? null;
}

describe('renderSvg scannability (round trip through jsQR)', () => {
  const payloads = ['https://example.com/scan-test', 'WIFI:T:WPA;S:Home;P:password123;;'];

  for (const style of MODULE_STYLES.map((s) => s.id)) {
    it(`"${style}" module style decodes back to the original payload at multiple sizes`, async () => {
      for (const payload of payloads) {
        const matrix = createMatrix(payload, 'M');
        const design: Design = { ...DEFAULT_DESIGN, moduleStyle: style, size: 400 };
        const svg = renderSvg(matrix, design);
        for (const size of [300, 600]) {
          const decoded = await decodeSvg(svg, size);
          expect(decoded, `${style} @ ${size}px for ${payload.slice(0, 20)}`).toBe(payload);
        }
      }
    });
  }

  // Regression coverage for audit-2 N-2: a denser payload (a v7-ish vCard) rendered with "dots" at
  // the default export size (1024px, DEFAULT_DESIGN.size) and other common export sizes failed to
  // decode, even though the smaller sizes covered above passed. Exercise exactly that case.
  it('"dots" style decodes a dense vCard-like payload at every common export size', async () => {
    const vcard =
      'BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jane;;;\nFN:Jane Doe\nORG:Example Long Company Name Ltd\nTITLE:Senior Director of Operations\nTEL;TYPE=CELL:+1 555 123 4567\nTEL;TYPE=WORK:+1 555 987 6543\nEMAIL:jane.doe@example-company.com\nADR;TYPE=WORK:;;123 Example Street Suite 400;Springfield;IL;62704;USA\nURL:https://www.example-company.com/about/jane-doe\nNOTE:Met at the Q3 industry conference, follow up about the partnership proposal.\nEND:VCARD';
    const matrix = createMatrix(vcard, 'M');
    const design: Design = { ...DEFAULT_DESIGN, moduleStyle: 'dots', size: 400 };
    const svg = renderSvg(matrix, design);
    for (const size of [512, 1000, 1024, 1200, 2048]) {
      const decoded = await decodeSvg(svg, size);
      expect(decoded, `dots @ ${size}px for dense vCard`).toBe(vcard);
    }
  });

  it('every eye style still decodes (eyes are drawn separately from module style)', async () => {
    const payload = 'https://example.com/eyes';
    const matrix = createMatrix(payload, 'M');
    for (const eyeStyle of EYE_STYLES.map((s) => s.id)) {
      const svg = renderSvg(matrix, { ...DEFAULT_DESIGN, eyeStyle, size: 400 });
      const decoded = await decodeSvg(svg, 400);
      expect(decoded, `eye style ${eyeStyle}`).toBe(payload);
    }
  });
});
