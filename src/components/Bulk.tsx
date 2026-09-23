/**
 * Bulk island: paste lines or upload a CSV (content,label) -> grid preview -> ZIP of PNG/SVG
 * named by label, or a printable sheet. Capped at BULK_ROW_CAP rows; everything runs locally.
 */
import { useMemo, useState } from 'preact/hooks';
import { linesToItems, parseCsv, rowsToItems, BULK_ROW_CAP, type BulkItem } from '../lib/qr/csv';
import { createMatrix, MAX_PAYLOAD_BYTES } from '../lib/qr/matrix';
import { renderSvg, DEFAULT_DESIGN, svgDataUrl, svgToPngBlob, downloadBlob, safeFilename, sanitizeDesign, type Design } from '../lib/qr/render';

interface Rendered {
  item: BulkItem;
  svg: string;
  error?: string;
}

const PREVIEW_CAP = 60;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function Bulk() {
  const [raw, setRaw] = useState('');
  const [items, setItems] = useState<BulkItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [format, setFormat] = useState<'svg' | 'png'>('png');
  const [design, setDesign] = useState<Design>({ ...DEFAULT_DESIGN, size: 512 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  function fromText(text: string) {
    setRaw(text);
    const { items: parsed, truncated: t } = linesToItems(text, BULK_ROW_CAP);
    setItems(parsed);
    setTruncated(t);
  }

  async function onFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    setRaw(text);
    const { items: parsed, truncated: t } = rowsToItems(parseCsv(text), BULK_ROW_CAP);
    setItems(parsed);
    setTruncated(t);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  }

  const rendered = useMemo<Rendered[]>(() => {
    return items.map((item) => {
      if (item.error) return { item, svg: '', error: item.error };
      try {
        if (new TextEncoder().encode(item.content).length > MAX_PAYLOAD_BYTES) {
          return { item, svg: '', error: 'Too long to encode' };
        }
        const matrix = createMatrix(item.content, 'M');
        return { item, svg: renderSvg(matrix, design) };
      } catch {
        return { item, svg: '', error: 'Could not encode' };
      }
    });
  }, [items, design]);

  const okCount = rendered.filter((r) => !r.error).length;
  const failCount = rendered.length - okCount;

  async function downloadZip() {
    if (!okCount) return;
    setBusy(true);
    setStatus('Building ZIP…');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Set<string>();
      let i = 0;
      for (const r of rendered) {
        i++;
        if (r.error) continue;
        let name = safeFilename(r.item.label, `qr-${i}`);
        let candidate = name;
        let n = 2;
        while (used.has(candidate)) candidate = `${name}-${n++}`;
        used.add(candidate);
        if (format === 'svg') {
          zip.file(`${candidate}.svg`, r.svg);
        } else {
          const blob = await svgToPngBlob(r.svg, design.size);
          zip.file(`${candidate}.png`, blob);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `everqr-bulk-${okCount}.zip`);
      setStatus(`Downloaded ${okCount} QR codes${failCount ? ` (${failCount} skipped)` : ''}.`);
    } catch {
      setStatus('Could not build the ZIP file. Try a smaller batch.');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 5000);
    }
  }

  function printSheet() {
    const ok = rendered.filter((r) => !r.error);
    if (!ok.length) return;
    // `noopener` in the feature string makes window.open() return null per the HTML spec, so a
    // blank tab would open with no way to write into it. Open normally (about:blank has nothing
    // to leak an opener into) and sever the opener reference on the returned handle instead.
    const w = window.open('', '_blank');
    if (!w) {
      setStatus('Pop-up blocked. Allow pop-ups for this site to print the sheet.');
      return;
    }
    w.opener = null;
    const cells = ok
      .map((r) => `<div class="cell"><img src="${svgDataUrl(r.svg)}" width="160" height="160" alt=""><div class="label">${esc(r.item.label)}</div></div>`)
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print QR codes</title><style>
      body{font-family:system-ui,sans-serif;margin:24px;color:#111}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
      .cell{text-align:center;break-inside:avoid;padding:8px;border:1px solid #ddd;border-radius:8px}
      .cell img{width:100%;height:auto}
      .label{margin-top:6px;font-size:12px;word-break:break-word}
      @media print{.cell{border:1px solid #ccc}}
    </style></head><body><div class="grid">${cells}</div></body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <div class="bulk">
      <div
        class={`bulk__drop${dragActive ? ' is-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <p>
          Drag a CSV file here, or{' '}
          <label class="gen__linklike" style="cursor:pointer">
            choose a file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              class="gen__fileinput"
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>{' '}
          — columns <code>content,label</code>, up to {BULK_ROW_CAP} rows.
        </p>
        {fileName && <p class="muted small">Loaded: {fileName}</p>}
      </div>

      <div class="gen__field" style="margin-top:1rem">
        <label for="bulk-paste">Or paste one item per line (content,label)</label>
        <textarea
          id="bulk-paste"
          rows={6}
          placeholder={'https://example.com/1,Table 1\nhttps://example.com/2,Table 2'}
          value={raw}
          onInput={(e) => fromText((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      {truncated && <p class="gen__warning">Only the first {BULK_ROW_CAP} rows were kept.</p>}

      {items.length > 0 && (
        <>
          <div class="bulk__actions">
            <span class="muted small">
              {okCount} code{okCount === 1 ? '' : 's'} ready{failCount ? `, ${failCount} could not be encoded` : ''}
            </span>
            <label class="gen__checklabel gen__checklabel--small">
              <input type="radio" name="fmt" checked={format === 'png'} onChange={() => setFormat('png')} /> PNG
            </label>
            <label class="gen__checklabel gen__checklabel--small">
              <input type="radio" name="fmt" checked={format === 'svg'} onChange={() => setFormat('svg')} /> SVG
            </label>
            <label class="small" style="display:flex;align-items:center;gap:.4rem">
              Colour
              <input type="color" value={design.fg} onInput={(e) => setDesign(sanitizeDesign({ ...design, fg: (e.target as HTMLInputElement).value }))} />
            </label>
            <button type="button" class="btn" onClick={downloadZip} disabled={busy || !okCount}>
              Download ZIP
            </button>
            <button type="button" class="btn btn--secondary" onClick={printSheet} disabled={!okCount}>
              Print sheet
            </button>
          </div>
          {status && <p class="gen__status" role="status">{status}</p>}

          <div class="bulk__grid">
            {rendered.slice(0, PREVIEW_CAP).map((r, i) => (
              <div class="bulk__cell" key={i}>
                {r.svg ? <img src={svgDataUrl(r.svg)} alt="" width="80" height="80" /> : <span class="gen__error" title={r.error}>✕ {r.error}</span>}
                <div>{r.item.label}</div>
              </div>
            ))}
          </div>
          {rendered.length > PREVIEW_CAP && <p class="muted small">+ {rendered.length - PREVIEW_CAP} more (included in the ZIP / print sheet).</p>}
        </>
      )}
    </div>
  );
}
