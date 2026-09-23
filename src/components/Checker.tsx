/**
 * Checker island: decode an uploaded/dropped QR image (jsQR, lazy-loaded) or a live camera frame,
 * then classify the payload as static / direct / dynamic and surface safety flags.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { decodeImageFile, decodeVideoFrame, loadJsqr, MAX_FILE_BYTES } from '../lib/qr/decode';
import { classifyPayload, verdictSummary, type Verdict } from '../lib/qr/classify';
import { absoluteUrl } from '../lib/url';

type Phase = 'idle' | 'decoding' | 'done' | 'not-found' | 'error';

function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && (location.protocol === 'https:' || location.hostname === 'localhost');
}

export default function Checker() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [payload, setPayload] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  async function handleFile(file: File) {
    setErrorMsg('');
    setPhase('decoding');
    setPayload(null);
    setVerdict(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Image files are limited to 25 MB.');
      const result = await decodeImageFile(file);
      if (!result) {
        setPhase('not-found');
        return;
      }
      applyResult(result.data);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not read that image.');
      setPhase('error');
    }
  }

  function applyResult(data: string) {
    setPayload(data);
    setVerdict(classifyPayload(data));
    setPhase('done');
    stopCamera();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  function onPaste(e: ClipboardEvent) {
    const file = Array.from(e.clipboardData?.items ?? [])
      .find((it) => it.type.startsWith('image/'))
      ?.getAsFile();
    if (file) handleFile(file);
  }

  useEffect(() => {
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setPhase('idle');
      setPayload(null);
      setVerdict(null);
      // The <video> element only mounts once `cameraOn` is true, so `videoRef.current` is still
      // null at this point in the same tick. Flip the flag and let the effect below (which runs
      // after that render, once the element exists) attach the stream and start the scan loop.
      setCameraOn(true);
    } catch {
      setErrorMsg('Could not access the camera. Check your browser permissions.');
      stopCamera();
    }
  }

  // Attach the stream and start decoding once the <video> element has actually mounted.
  useEffect(() => {
    if (!cameraOn || !streamRef.current || !videoRef.current) return;
    let cancelled = false;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {
      /* autoplay may be blocked until user gesture; the click that started the camera counts */
    });
    loadJsqr().then((jsqr) => {
      if (cancelled) return;
      const tick = () => {
        if (cancelled || !videoRef.current || !canvasRef.current || !streamRef.current) return;
        const data = decodeVideoFrame(jsqr, videoRef.current, canvasRef.current);
        if (data) {
          applyResult(data);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  async function shareVerdict() {
    if (!verdict) return;
    const text = verdictSummary(verdict);
    const url = absoluteUrl('/check/');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'QR code checker', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} — ${url}`);
      setShareStatus('Copied to clipboard');
      setTimeout(() => setShareStatus(''), 3000);
    } catch {
      /* user cancelled */
    }
  }

  function reset() {
    setPhase('idle');
    setPayload(null);
    setVerdict(null);
    setErrorMsg('');
  }

  return (
    <div class="check">
      {!cameraOn && (
        <div
          class={`check__drop${dragActive ? ' is-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          <p>
            <strong>Drop a QR code image</strong>, paste a screenshot, or{' '}
            <label class="gen__linklike" style="cursor:pointer">
              choose a file.
              <input
                id="check-file"
                type="file"
                accept="image/*"
                class="gen__fileinput"
                onChange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </p>
        </div>
      )}

      <div class="bulk__actions" style="margin-top:1rem">
        {cameraSupported() && !cameraOn && (
          <button type="button" class="btn btn--secondary" onClick={startCamera}>
            Use camera
          </button>
        )}
        {cameraOn && (
          <button type="button" class="btn btn--secondary" onClick={stopCamera}>
            Stop camera
          </button>
        )}
        {(payload || errorMsg) && (
          <button type="button" class="btn btn--secondary" onClick={reset}>
            Check another
          </button>
        )}
      </div>

      {cameraOn && (
        <div class="check__camera">
          <video ref={videoRef} muted playsInline style="width:100%;max-width:420px;border-radius:var(--radius-lg)" />
          <canvas ref={canvasRef} hidden />
          <p class="muted small">Point the camera at the printed QR code.</p>
        </div>
      )}

      {phase === 'decoding' && <p class="muted" role="status">Reading the image…</p>}
      {phase === 'not-found' && (
        <p class="gen__warning" role="status">
          No QR code found in that image. Try a clearer photo, tighter crop, or better lighting.
        </p>
      )}
      {phase === 'error' && (
        <p class="gen__error" role="alert">
          {errorMsg}
        </p>
      )}

      {verdict && payload && (
        <div class={`check__verdict check__verdict--${verdict.status}`}>
          <p class="check__headline">{verdict.status === 'static' ? '✅' : verdict.status === 'dynamic' ? '⚠️' : 'ℹ️'} {verdict.headline}</p>
          <p>{verdict.explanation}</p>
          <p class="small muted">Decoded as: {verdict.kindLabel}</p>
          <div class="check__payload">{payload}</div>
          {verdict.flags.length > 0 && (
            <ul class="check__flags">
              {verdict.flags.map((f, i) => (
                <li class={`check__flag${f.level === 'info' ? ' check__flag--info' : ''}`} key={i}>
                  {f.message}
                </li>
              ))}
            </ul>
          )}
          <div class="gen__actions" style="margin-top:1rem">
            <button type="button" class="btn btn--secondary" onClick={shareVerdict}>
              Share this result
            </button>
          </div>
          {shareStatus && <p class="gen__status" role="status">{shareStatus}</p>}
        </div>
      )}
    </div>
  );
}
