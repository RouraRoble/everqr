/**
 * Generator island: content-type form -> payload -> live styled QR preview -> export.
 * All computation is local (qrcode for the matrix, our own SVG renderer for styling).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  buildPayload,
  CONTENT_TYPES,
  PRIVATE_TYPES,
  isContentType,
  type ContentType,
  type Fields,
} from '../lib/qr/payloads';
import { createMatrix, explainEncodeError, ECC_LEVELS, isEcc, type Ecc, MAX_PAYLOAD_BYTES } from '../lib/qr/matrix';
import {
  renderSvg,
  sanitizeDesign,
  DEFAULT_DESIGN,
  MODULE_STYLES,
  EYE_STYLES,
  LIMITS,
  svgToPngBlob,
  svgDataUrl,
  downloadBlob,
  safeFilename,
  prepareLogo,
  hiddenModuleRatio,
  type Design,
} from '../lib/qr/render';
import { contrastRatio, isInverted, MIN_SCAN_CONTRAST, parseHex, normalizeHex } from '../lib/qr/contrast';
import { encodeState, stateFromHash, type DesignState } from '../lib/qr/state';
import { absoluteUrl } from '../lib/url';

const STORAGE_KEY = 'everqr:last';

interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'checkbox' | 'tel' | 'email' | 'date' | 'time';
  placeholder?: string;
  options?: { value: string; label: string }[];
  help?: string;
  half?: boolean;
}

const FORMS: Record<ContentType, FieldDef[]> = {
  url: [{ key: 'url', label: 'Web address', kind: 'text', placeholder: 'example.com/page' }],
  text: [{ key: 'text', label: 'Text', kind: 'textarea', placeholder: 'Anything you like — up to ~2000 characters.' }],
  wifi: [
    { key: 'ssid', label: 'Network name (SSID)', kind: 'text', placeholder: 'Home-WiFi', half: true },
    {
      key: 'encryption',
      label: 'Security',
      kind: 'select',
      half: true,
      options: [
        { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
        { value: 'WEP', label: 'WEP' },
        { value: 'nopass', label: 'No password (open)' },
      ],
    },
    { key: 'password', label: 'Password', kind: 'text', placeholder: 'Wi-Fi password', half: true },
    { key: 'hidden', label: 'Hidden network', kind: 'checkbox', half: true },
  ],
  vcard: [
    { key: 'firstName', label: 'First name', kind: 'text', half: true },
    { key: 'lastName', label: 'Last name', kind: 'text', half: true },
    { key: 'org', label: 'Organisation', kind: 'text', half: true },
    { key: 'title', label: 'Job title', kind: 'text', half: true },
    { key: 'phone', label: 'Phone', kind: 'tel', half: true },
    { key: 'email', label: 'Email', kind: 'email', half: true },
    { key: 'url', label: 'Website', kind: 'text', half: true },
    { key: 'street', label: 'Street', kind: 'text', half: true },
    { key: 'city', label: 'City', kind: 'text', half: true },
    { key: 'region', label: 'State / region', kind: 'text', half: true },
    { key: 'zip', label: 'Postcode', kind: 'text', half: true },
    { key: 'country', label: 'Country', kind: 'text', half: true },
  ],
  email: [
    { key: 'to', label: 'Recipient email', kind: 'email' },
    { key: 'subject', label: 'Subject', kind: 'text', half: true },
    { key: 'body', label: 'Message', kind: 'textarea' },
  ],
  sms: [
    { key: 'number', label: 'Phone number', kind: 'tel', placeholder: '+1 555 000 0000' },
    { key: 'message', label: 'Message', kind: 'textarea' },
  ],
  phone: [{ key: 'number', label: 'Phone number', kind: 'tel', placeholder: '+1 555 000 0000' }],
  whatsapp: [
    { key: 'number', label: 'WhatsApp number (with country code)', kind: 'tel', placeholder: '+1 555 000 0000' },
    { key: 'message', label: 'Pre-filled message', kind: 'textarea' },
  ],
  geo: [
    { key: 'lat', label: 'Latitude', kind: 'text', placeholder: '41.3874', half: true },
    { key: 'lng', label: 'Longitude', kind: 'text', placeholder: '2.1686', half: true },
    { key: 'label', label: 'Place name (optional)', kind: 'text' },
  ],
  event: [
    { key: 'summary', label: 'Event title', kind: 'text' },
    { key: 'allDay', label: 'All-day event', kind: 'checkbox' },
    { key: 'startDate', label: 'Start date', kind: 'date', half: true },
    { key: 'startTime', label: 'Start time', kind: 'time', half: true },
    { key: 'endDate', label: 'End date', kind: 'date', half: true },
    { key: 'endTime', label: 'End time', kind: 'time', half: true },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
  ],
};

function defaultFields(type: ContentType): Fields {
  if (type === 'wifi') return { encryption: 'WPA' };
  return {};
}

function isPrivate(type: ContentType): boolean {
  return PRIVATE_TYPES.includes(type);
}

interface Props {
  /** Preselect a content type (used by /qr-code-for/ use-case pages). */
  defaultType?: ContentType;
  /** Restore the last design from this browser's localStorage on mount. Off on use-case
   * pages, so the page's own preselected content type always wins over a previous session. */
  restoreLocal?: boolean;
}

export default function Generator({ defaultType = 'url', restoreLocal = true }: Props) {
  const [type, setType] = useState<ContentType>(defaultType);
  const [fields, setFields] = useState<Fields>(defaultFields(defaultType));
  const [ecc, setEcc] = useState<Ecc>('M');
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [logoError, setLogoError] = useState('');
  const [includeContent, setIncludeContent] = useState(false);
  const [linkStatus, setLinkStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [restored, setRestored] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The hex text fields keep their own draft string, separate from `design.fg`/`design.bg`.
  // Committing every keystroke straight to `design` (via sanitizeDesign) reset an in-progress,
  // momentarily-invalid value like "#f" or "#ff0" back to the previous colour on every key, so
  // nothing could ever be typed. A draft only commits once it parses as a real 3- or 6-digit hex
  // colour, and reverts to the last valid colour on blur if it never became valid.
  //
  // The tricky part: any 3-character prefix of a 6-digit hex is itself a *valid* 3-digit shorthand
  // (typing "#ff0000" passes through the valid-and-committable "#ff0" after 4 keystrokes). If the
  // resulting design.fg change then echoed straight back into the draft, it would overwrite
  // "#ff0" with its expanded form "#ffff00" mid-keystroke and corrupt everything typed after it.
  // These refs mark a design change as "caused by this same field" so the echo-back effect skips
  // exactly that one update, while still syncing the draft for external changes (the colour
  // picker, a restored link/localStorage design).
  const [fgHex, setFgHex] = useState(design.fg);
  const [bgHex, setBgHex] = useState(design.bg);
  const skipFgSync = useRef(false);
  const skipBgSync = useRef(false);
  useEffect(() => {
    if (skipFgSync.current) {
      skipFgSync.current = false;
      return;
    }
    setFgHex(design.fg);
  }, [design.fg]);
  useEffect(() => {
    if (skipBgSync.current) {
      skipBgSync.current = false;
      return;
    }
    setBgHex(design.bg);
  }, [design.bg]);

  // Restore from URL hash, else localStorage, on first mount only.
  useEffect(() => {
    let state: DesignState | null = null;
    try {
      state = stateFromHash(location.hash);
    } catch {
      state = null;
    }
    if (state) {
      setType(state.type);
      setEcc(state.ecc);
      setDesign(state.design);
      if (state.fields) setFields({ ...defaultFields(state.type), ...state.fields });
      setRestored(true);
      return;
    }
    if (restoreLocal) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') {
            // Validate every field the same way decodeState() does for a shared link (P2-15): a
            // stale/corrupt entry (a bogus `type` from a future release, or hand-edited devtools
            // data) must never reach buildPayload()/createMatrix() with an unrecognised shape —
            // that used to throw and leave the island permanently broken until the user cleared
            // site data.
            const type: ContentType = isContentType(saved.type) ? saved.type : 'url';
            if (isContentType(saved.type)) setType(type);
            if (isEcc(saved.ecc)) setEcc(saved.ecc);
            if (saved.design) setDesign(sanitizeDesign(saved.design));
            if (saved.fields && typeof saved.fields === 'object' && !Array.isArray(saved.fields)) {
              const fields: Fields = {};
              for (const [k, v] of Object.entries(saved.fields as Record<string, unknown>)) {
                if (typeof v === 'string') fields[k] = v;
              }
              setFields(fields);
            }
          }
        }
      } catch {
        /* ignore */
      }
    } else {
      // Still restore the visual design (colours/style) so it stays consistent across
      // pages, but keep this page's own preselected content type and blank fields.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && typeof saved === 'object' && saved.design) setDesign(sanitizeDesign(saved.design));
        }
      } catch {
        /* ignore */
      }
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage (own device only) after restore completes. For content types that
  // can carry private data (Wi-Fi password, a contact's phone/email, a WhatsApp number…) we keep
  // remembering the design (colours/style) and which tab was open, but not the field values
  // themselves (P2-14) — so a Wi-Fi password typed in once does not sit in this origin's
  // localStorage indefinitely, readable by any script bug in a sibling product on the same
  // GitHub Pages origin. See /privacy/.
  useEffect(() => {
    if (!restored) return;
    try {
      const toStore = isPrivate(type) ? { type, ecc, design } : { type, ecc, design, fields };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [restored, type, ecc, design, fields]);

  function updateField(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function changeType(next: ContentType) {
    setType(next);
    setFields(defaultFields(next));
    setLinkStatus('');
    setCopyStatus('');
  }

  const built = useMemo(() => buildPayload(type, fields), [type, fields]);

  const effectiveEcc: Ecc = logo && ecc !== 'H' ? 'H' : ecc;

  const matrixResult = useMemo(() => {
    if (!built.payload) return { matrix: null, error: built.error || null };
    if (new TextEncoder().encode(built.payload).length > MAX_PAYLOAD_BYTES) {
      return { matrix: null, error: 'Too much data for one QR code. Shorten the content.' };
    }
    try {
      return { matrix: createMatrix(built.payload, effectiveEcc), error: built.error || null };
    } catch (e) {
      return { matrix: null, error: explainEncodeError(e) };
    }
  }, [built, effectiveEcc]);

  const svg = useMemo(() => {
    if (!matrixResult.matrix) return '';
    return renderSvg(matrixResult.matrix, design, logo ? { logo } : {});
  }, [matrixResult.matrix, design, logo]);

  const contrast = useMemo(() => contrastRatio(design.fg, design.bg), [design.fg, design.bg]);
  const lowContrast = contrast < MIN_SCAN_CONTRAST;
  const inverted = isInverted(design.fg, design.bg);
  const logoHidden = useMemo(() => (matrixResult.matrix && logo ? hiddenModuleRatio(matrixResult.matrix, design) : 0), [matrixResult.matrix, design, logo]);

  async function onLogoFile(file: File | undefined) {
    setLogoError('');
    if (!file) {
      setLogo(undefined);
      return;
    }
    try {
      const url = await prepareLogo(file);
      setLogo(url);
      if (ecc !== 'H') setEcc('H');
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'Could not use that image.');
    }
  }

  function removeLogo() {
    setLogo(undefined);
    setLogoError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function exportSvg() {
    if (!svg) return;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeFilename(labelForFile())}.svg`);
  }

  async function exportPng() {
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg, design.size);
      downloadBlob(blob, `${safeFilename(labelForFile())}.png`);
    } catch (e) {
      setCopyStatus(e instanceof Error ? e.message : 'PNG export failed.');
    }
  }

  async function copyPng() {
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg, Math.min(design.size, 1024));
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopyStatus('QR image copied to clipboard');
      } else {
        throw new Error('no-clipboard-api');
      }
    } catch {
      setCopyStatus('Your browser does not support copying images; use Export instead.');
    }
    setTimeout(() => setCopyStatus(''), 3000);
  }

  function labelForFile(): string {
    if (type === 'wifi' && fields.ssid) return `wifi-${fields.ssid}`;
    if (type === 'vcard' && (fields.firstName || fields.lastName)) return `vcard-${fields.firstName ?? ''}-${fields.lastName ?? ''}`;
    if (type === 'url' && fields.url) return fields.url.replace(/^https?:\/\//, '');
    return `qr-${type}`;
  }

  async function copyLink() {
    const state: DesignState = { v: 1, type, ecc, design, ...(includeContent ? { fields } : {}) };
    const encoded = encodeState(state);
    const url = absoluteUrl('/') + '#d=' + encoded;
    try {
      await navigator.clipboard.writeText(url);
      setLinkStatus('Link copied');
    } catch {
      setLinkStatus(url);
    }
    setTimeout(() => setLinkStatus(''), 4000);
  }

  const form = FORMS[type];
  const showIncludeToggle = true;

  return (
    <div class="gen">
      <div class="gen__form">
        <div class="gen__types" role="tablist" aria-label="Content type">
          {CONTENT_TYPES.map((t) => (
            <button
              type="button"
              role="tab"
              key={t.id}
              class={`gen__type${type === t.id ? ' is-active' : ''}`}
              aria-selected={type === t.id}
              onClick={() => changeType(t.id)}
            >
              {t.short}
            </button>
          ))}
        </div>

        <form class="gen__fields" onSubmit={(e) => e.preventDefault()}>
          {form.map((f) => (
            <div class={`gen__field${f.half ? ' gen__field--half' : ''}${f.kind === 'checkbox' ? ' gen__field--check' : ''}`} key={f.key}>
              {f.kind === 'checkbox' ? (
                <label class="gen__checklabel">
                  <input
                    type="checkbox"
                    checked={fields[f.key] === '1'}
                    onChange={(e) => updateField(f.key, (e.target as HTMLInputElement).checked ? '1' : '')}
                  />
                  {f.label}
                </label>
              ) : (
                <>
                  <label for={`f-${f.key}`}>{f.label}</label>
                  {f.kind === 'textarea' ? (
                    <textarea
                      id={`f-${f.key}`}
                      rows={3}
                      placeholder={f.placeholder}
                      value={fields[f.key] ?? ''}
                      onInput={(e) => updateField(f.key, (e.target as HTMLTextAreaElement).value)}
                    />
                  ) : f.kind === 'select' ? (
                    <select id={`f-${f.key}`} value={fields[f.key] ?? f.options?.[0]?.value ?? ''} onChange={(e) => updateField(f.key, (e.target as HTMLSelectElement).value)}>
                      {f.options?.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`f-${f.key}`}
                      type={f.kind}
                      placeholder={f.placeholder}
                      value={fields[f.key] ?? ''}
                      onInput={(e) => updateField(f.key, (e.target as HTMLInputElement).value)}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </form>

        <details class="gen__design" open>
          <summary>Style &amp; export settings</summary>
          <div class="gen__designgrid">
            <div class="gen__field gen__field--half">
              <label for="d-fg">Foreground</label>
              <div class="gen__color">
                <input id="d-fg" type="color" value={design.fg} onInput={(e) => setDesign({ ...design, fg: (e.target as HTMLInputElement).value })} />
                <input
                  aria-label="Foreground hex"
                  value={fgHex}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    setFgHex(v);
                    if (parseHex(v)) {
                      setDesign((d) => {
                        const next = normalizeHex(v, d.fg);
                        // Only arm the skip: if the typed value normalises to the SAME colour
                        // already in `design` (e.g. "#f00" -> "#ff0000" when fg is already
                        // "#ff0000"), design.fg never changes, so the echo-back effect below never
                        // fires to consume the flag — leaving it armed to wrongly swallow the
                        // *next* external change (colour picker, restored link). See audit-2 N-3.
                        if (next !== d.fg) skipFgSync.current = true;
                        return { ...d, fg: next };
                      });
                    }
                  }}
                  onBlur={() => setFgHex(design.fg)}
                />
              </div>
            </div>
            <div class="gen__field gen__field--half">
              <label for="d-bg">Background</label>
              <div class="gen__color">
                <input id="d-bg" type="color" value={design.bg} onInput={(e) => setDesign({ ...design, bg: (e.target as HTMLInputElement).value })} disabled={design.transparent} />
                <input
                  aria-label="Background hex"
                  value={bgHex}
                  disabled={design.transparent}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    setBgHex(v);
                    if (parseHex(v)) {
                      setDesign((d) => {
                        const next = normalizeHex(v, d.bg);
                        // See the matching comment on the foreground field (audit-2 N-3).
                        if (next !== d.bg) skipBgSync.current = true;
                        return { ...d, bg: next };
                      });
                    }
                  }}
                  onBlur={() => setBgHex(design.bg)}
                />
              </div>
            </div>
            <div class="gen__field gen__field--half gen__field--check">
              <label class="gen__checklabel">
                <input type="checkbox" checked={design.transparent} onChange={(e) => setDesign({ ...design, transparent: (e.target as HTMLInputElement).checked })} />
                Transparent background (PNG/SVG)
              </label>
            </div>
            <div class="gen__field gen__field--half">
              <label for="d-ecc">Error correction</label>
              <select id="d-ecc" value={effectiveEcc} disabled={Boolean(logo)} onChange={(e) => setEcc((e.target as HTMLSelectElement).value as Ecc)}>
                {ECC_LEVELS.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.label} (recovers {l.recovers})
                  </option>
                ))}
              </select>
              {logo && <p class="gen__hint">Locked to H while a logo is set, so scanners can still read the code.</p>}
            </div>
            <div class="gen__field gen__field--half">
              <label for="d-module">Module style</label>
              <select id="d-module" value={design.moduleStyle} onChange={(e) => setDesign({ ...design, moduleStyle: (e.target as HTMLSelectElement).value as Design['moduleStyle'] })}>
                {MODULE_STYLES.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div class="gen__field gen__field--half">
              <label for="d-eye">Eye style</label>
              <select id="d-eye" value={design.eyeStyle} onChange={(e) => setDesign({ ...design, eyeStyle: (e.target as HTMLSelectElement).value as Design['eyeStyle'] })}>
                {EYE_STYLES.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div class="gen__field gen__field--half">
              <label for="d-margin">Quiet zone: {design.margin} modules</label>
              <input
                id="d-margin"
                type="range"
                min={LIMITS.margin.min}
                max={LIMITS.margin.max}
                value={design.margin}
                onInput={(e) => setDesign({ ...design, margin: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
            <div class="gen__field gen__field--half">
              <label for="d-size">Export size: {design.size}px</label>
              <input
                id="d-size"
                type="range"
                min={LIMITS.size.min}
                max={LIMITS.size.max}
                step={64}
                value={design.size}
                onInput={(e) => setDesign({ ...design, size: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
            <div class="gen__field">
              <label for="d-logo">Logo overlay (optional)</label>
              <input
                id="d-logo"
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={(e) => onLogoFile((e.target as HTMLInputElement).files?.[0])}
              />
              {logo && (
                <p class="gen__hint">
                  Logo covers ~{Math.round(logoHidden * 100)}% of the data modules.{' '}
                  <button type="button" class="gen__linklike" onClick={removeLogo}>
                    Remove logo
                  </button>
                </p>
              )}
              {logoError && <p class="gen__error" role="alert">{logoError}</p>}
            </div>
          </div>
        </details>
      </div>

      <div class="gen__preview">
        <div class={`gen__canvas${design.transparent ? ' gen__canvas--transparent' : ''}`} aria-live="polite">
          {matrixResult.matrix && svg ? (
            <img src={svgDataUrl(svg)} width={280} height={280} alt="Generated QR code preview" />
          ) : (
            <p class="gen__empty">{matrixResult.error || 'Fill in the form to generate a QR code.'}</p>
          )}
        </div>

        {matrixResult.matrix && (built.error) && <p class="gen__error" role="alert">{built.error}</p>}
        {lowContrast && (
          <p class="gen__warning" role="status">
            Contrast is {contrast.toFixed(1)}:1 (minimum recommended {MIN_SCAN_CONTRAST}:1) — some scanners may struggle.
          </p>
        )}
        {inverted && !lowContrast && (
          <p class="gen__warning" role="status">Light modules on a dark background can be unreliable on older scanners.</p>
        )}

        <p class="gen__static-note">This is a static code: the data is inside the pattern. It works forever and never depends on a server.</p>

        <div class="gen__actions">
          <button type="button" class="btn" onClick={exportSvg} disabled={!svg}>
            Download SVG
          </button>
          <button type="button" class="btn btn--secondary" onClick={exportPng} disabled={!svg}>
            Download PNG
          </button>
          <button type="button" class="btn btn--secondary" onClick={copyPng} disabled={!svg}>
            Copy image
          </button>
        </div>
        {copyStatus && <p class="gen__status" role="status">{copyStatus}</p>}

        <div class="gen__link">
          {showIncludeToggle && (
            <label class="gen__checklabel gen__checklabel--small">
              <input type="checkbox" checked={includeContent} onChange={(e) => setIncludeContent((e.target as HTMLInputElement).checked)} />
              Include content in the link{isPrivate(type) ? ' (off by default: this content type can be private)' : ''}
            </label>
          )}
          <button type="button" class="btn btn--secondary" onClick={copyLink}>
            Copy link to this design
          </button>
          {linkStatus && <span class="gen__status" role="status">{linkStatus}</span>}
        </div>
      </div>
    </div>
  );
}
