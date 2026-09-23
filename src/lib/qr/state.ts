/**
 * Design links: the generator state is encoded in the URL hash (#d=…) with lz-string so a link
 * reproduces the design (and, when the user opts in, the content). Decoding validates and clamps
 * every field, so a malicious link can never hang the page or inject markup.
 */
// lz-string ships as a CJS/UMD bundle with no ESM named exports; import the default and
// destructure at call time so both the browser bundle and Astro's Node-based prerender work.
import LZString from 'lz-string';
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString;
import { isContentType, type ContentType, type Fields } from './payloads';
import { isEcc, type Ecc } from './matrix';
import { sanitizeDesign, type Design } from './render';

export interface DesignState {
  v: 1;
  type: ContentType;
  ecc: Ecc;
  design: Design;
  /** Present only when the author ticked "include content in link". */
  fields?: Fields;
}

export const MAX_HASH_LENGTH = 8000;
const MAX_FIELDS = 24;
const MAX_FIELD_LENGTH = 2000;

export function encodeState(state: DesignState): string {
  const payload: Record<string, unknown> = { v: 1, t: state.type, e: state.ecc, d: state.design };
  if (state.fields) {
    const clean: Fields = {};
    for (const [k, v] of Object.entries(state.fields).slice(0, MAX_FIELDS)) if (typeof v === 'string' && v !== '') clean[k] = v.slice(0, MAX_FIELD_LENGTH);
    payload.c = clean;
  }
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeState(encoded: string | null | undefined): DesignState | null {
  if (!encoded || encoded.length > MAX_HASH_LENGTH) return null;
  let raw: unknown;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isContentType(o.t)) return null;
  const state: DesignState = {
    v: 1,
    type: o.t,
    ecc: isEcc(o.e) ? o.e : 'M',
    design: sanitizeDesign(o.d),
  };
  if (o.c && typeof o.c === 'object' && !Array.isArray(o.c)) {
    const fields: Fields = {};
    for (const [k, v] of Object.entries(o.c as Record<string, unknown>).slice(0, MAX_FIELDS)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(k)) continue;
      if (typeof v === 'string') fields[k] = v.slice(0, MAX_FIELD_LENGTH);
      else if (typeof v === 'boolean' || typeof v === 'number') fields[k] = String(v);
    }
    state.fields = fields;
  }
  return state;
}

/** Read #d=… from a URL hash string ('#d=abc' or 'd=abc'). */
export function stateFromHash(hash: string): DesignState | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return decodeState(params.get('d'));
}

export function hashForState(state: DesignState): string {
  return '#d=' + encodeState(state);
}
