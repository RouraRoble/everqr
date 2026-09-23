/**
 * QR matrix generation via `qrcode` (MIT). We only use QRCode.create(); rendering is ours (render.ts).
 */
import QRCode from 'qrcode';

export type Ecc = 'L' | 'M' | 'Q' | 'H';
export const ECC_LEVELS: { id: Ecc; label: string; recovers: string }[] = [
  { id: 'L', label: 'L · low', recovers: '~7%' },
  { id: 'M', label: 'M · medium', recovers: '~15%' },
  { id: 'Q', label: 'Q · quartile', recovers: '~25%' },
  { id: 'H', label: 'H · high', recovers: '~30%' },
];
export function isEcc(x: unknown): x is Ecc {
  return x === 'L' || x === 'M' || x === 'Q' || x === 'H';
}

export interface Matrix {
  size: number;
  version: number;
  ecc: Ecc;
  /** Row-major module bitmap, 1 = dark. */
  data: Uint8Array;
  get(row: number, col: number): boolean;
}

/** Max bytes at ECC L / version 40 (binary mode). Longer payloads cannot become a QR code. */
export const MAX_PAYLOAD_BYTES = 2953;

export function createMatrix(text: string, ecc: Ecc = 'M'): Matrix {
  if (!text) throw new Error('Nothing to encode.');
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc });
  const modules = qr.modules as unknown as { size: number; data: Uint8Array };
  const size = modules.size;
  const data = Uint8Array.from(modules.data, (v) => (v ? 1 : 0));
  return {
    size,
    version: qr.version,
    ecc,
    data,
    get: (r, c) => data[r * size + c] === 1,
  };
}

/** True when (row, col) belongs to one of the three finder patterns ("eyes"), 7×7 each. */
export function isFinder(size: number, row: number, col: number): boolean {
  return (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);
}

/** Human readable error for payloads that do not fit. */
export function explainEncodeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/too big|too much data|amount of data/i.test(msg)) return 'Too much data for one QR code. Shorten the content or lower the error correction level.';
  return msg || 'Could not encode this content.';
}
