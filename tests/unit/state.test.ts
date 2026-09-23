import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { encodeState, decodeState, stateFromHash, hashForState, type DesignState } from '../../src/lib/qr/state';
import { DEFAULT_DESIGN } from '../../src/lib/qr/render';

function baseState(overrides: Partial<DesignState> = {}): DesignState {
  return { v: 1, type: 'url', ecc: 'M', design: DEFAULT_DESIGN, ...overrides };
}

describe('encodeState / decodeState round trip', () => {
  it('round-trips type, ecc and design with no fields', () => {
    const state = baseState({ design: { ...DEFAULT_DESIGN, fg: '#112233', size: 900 } });
    const decoded = decodeState(encodeState(state));
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe('url');
    expect(decoded?.ecc).toBe('M');
    expect(decoded?.design.fg).toBe('#112233');
    expect(decoded?.design.size).toBe(900);
    expect(decoded?.fields).toBeUndefined();
  });

  it('round-trips fields only when included', () => {
    const withFields = baseState({ type: 'wifi', fields: { ssid: 'Home', password: 'secret123' } });
    const decoded = decodeState(encodeState(withFields));
    expect(decoded?.fields).toEqual({ ssid: 'Home', password: 'secret123' });
  });

  it('drops empty-string field values on encode', () => {
    const s = baseState({ fields: { ssid: 'Home', password: '' } });
    const decoded = decodeState(encodeState(s));
    expect(decoded?.fields).toEqual({ ssid: 'Home' });
  });
});

describe('decodeState robustness', () => {
  it('returns null for garbage, empty or oversized input', () => {
    expect(decodeState(null)).toBeNull();
    expect(decodeState('')).toBeNull();
    expect(decodeState('not-valid-lzstring!!')).toBeNull();
    expect(decodeState('a'.repeat(9000))).toBeNull();
  });

  it('rejects a payload with no valid content type', () => {
    const encoded = encodeState(baseState());
    // Corrupt by encoding a state with a bogus type directly via JSON (bypassing the type system).
    const raw = JSON.stringify({ v: 1, t: 'not-a-type', e: 'M', d: DEFAULT_DESIGN });
    expect(decodeState(compressToEncodedURIComponent(raw))).toBeNull();
  });

  it('sanitizes an out-of-range design and falls back to defaults for bad ecc', () => {
    const raw = JSON.stringify({ v: 1, t: 'url', e: 'nope', d: { size: 99999, margin: -5, fg: 'garbage' } });
    const decoded = decodeState(compressToEncodedURIComponent(raw));
    expect(decoded?.ecc).toBe('M');
    expect(decoded?.design.size).toBeLessThanOrEqual(4096);
    expect(decoded?.design.margin).toBeGreaterThanOrEqual(0);
    expect(decoded?.design.fg).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('ignores malformed field keys and caps field count/length', () => {
    const fields: Record<string, string> = { 'bad key!': 'x', okKey: 'y'.repeat(3000) };
    for (let i = 0; i < 30; i++) fields[`f${i}`] = 'v';
    const raw = JSON.stringify({ v: 1, t: 'text', e: 'M', d: DEFAULT_DESIGN, c: fields });
    const decoded = decodeState(compressToEncodedURIComponent(raw));
    expect(decoded?.fields?.['bad key!']).toBeUndefined();
    expect(decoded?.fields?.okKey.length).toBeLessThanOrEqual(2000);
    expect(Object.keys(decoded?.fields ?? {}).length).toBeLessThanOrEqual(24);
  });
});

describe('hashForState / stateFromHash', () => {
  it('produces a #d=... hash that stateFromHash can read back', () => {
    const state = baseState({ type: 'text', fields: { text: 'hello world' } });
    const hash = hashForState(state);
    expect(hash.startsWith('#d=')).toBe(true);
    const decoded = stateFromHash(hash);
    expect(decoded?.type).toBe('text');
    expect(decoded?.fields?.text).toBe('hello world');
  });

  it('accepts a hash with or without the leading #', () => {
    const state = baseState();
    const hash = hashForState(state).slice(1);
    expect(stateFromHash(hash)?.type).toBe('url');
    expect(stateFromHash('#' + hash)?.type).toBe('url');
  });
});
