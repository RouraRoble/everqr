/**
 * Browser-only QR decoding with jsQR (Apache-2.0), lazy-loaded on first use.
 * Images are downscaled to at most MAX_DIM px so a huge photo can never hang the page.
 */
export const MAX_DIM = 1600;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

type JsQr = typeof import('jsqr').default;
let jsqrPromise: Promise<JsQr> | null = null;
export function loadJsqr(): Promise<JsQr> {
  if (!jsqrPromise) jsqrPromise = import('jsqr').then((m) => m.default);
  return jsqrPromise;
}

export interface DecodeResult {
  data: string;
  width: number;
  height: number;
}

async function toBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall back to <img> */
    }
  }
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
  return img;
}

export function decodeImageData(jsqr: JsQr, imageData: ImageData): string | null {
  const r = jsqr(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return r?.data ?? null;
}

/** Decode a QR code from an image file. Tries the native size, then a 2× upscale for tiny images. */
export async function decodeImageFile(file: Blob): Promise<DecodeResult | null> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Image files are limited to 25 MB.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPG, WebP, GIF…).');
  const [jsqr, bmp] = await Promise.all([loadJsqr(), toBitmap(file)]);
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  if (!w || !h) throw new Error('Could not decode the image.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  const scales = [Math.min(1, MAX_DIM / Math.max(w, h))];
  if (Math.max(w, h) < 400) scales.push(2);
  for (const s of scales) {
    canvas.width = Math.max(1, Math.round(w * s));
    canvas.height = Math.max(1, Math.round(h * s));
    ctx.imageSmoothingEnabled = s < 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const data = decodeImageData(jsqr, ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (data) return { data, width: w, height: h };
  }
  return null;
}

/** Decode from a live <video> frame (camera mode). Returns null when no code is visible. */
export function decodeVideoFrame(jsqr: JsQr, video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const s = Math.min(1, 800 / Math.max(vw, vh));
  canvas.width = Math.round(vw * s);
  canvas.height = Math.round(vh * s);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return decodeImageData(jsqr, ctx.getImageData(0, 0, canvas.width, canvas.height));
}
