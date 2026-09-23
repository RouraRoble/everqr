import { describe, expect, it } from 'vitest';
import { classifyPayload, detectKind, findService, normalizeHost, urlFlags, verdictSummary, REDIRECT_DOMAINS } from '../../src/lib/qr/classify';

describe('detectKind', () => {
  it('recognises non-url payload prefixes', () => {
    expect(detectKind('WIFI:T:WPA;S:x;P:y;;')).toBe('wifi');
    expect(detectKind('BEGIN:VCARD\nEND:VCARD')).toBe('vcard');
    expect(detectKind('BEGIN:VEVENT\nEND:VEVENT')).toBe('vevent');
    expect(detectKind('mailto:a@b.com')).toBe('mailto');
    expect(detectKind('sms:+15550000000')).toBe('sms');
    expect(detectKind('tel:+15550000000')).toBe('tel');
    expect(detectKind('geo:1,2')).toBe('geo');
    expect(detectKind('just some plain text')).toBe('text');
  });
  it('detects WhatsApp links', () => {
    expect(detectKind('https://wa.me/15550000000')).toBe('whatsapp');
    expect(detectKind('https://api.whatsapp.com/send?phone=1')).toBe('whatsapp');
  });
  it('treats other http(s) links as url', () => {
    expect(detectKind('https://example.com')).toBe('url');
  });
});

describe('normalizeHost / findService', () => {
  it('lowercases, strips trailing dot and www.', () => {
    expect(normalizeHost('WWW.Example.com.')).toBe('example.com');
  });
  it('finds an exact or subdomain match in the redirect list', () => {
    expect(REDIRECT_DOMAINS.length).toBeGreaterThanOrEqual(40);
    const svc = findService('bit.ly');
    expect(svc?.domain).toBe('bit.ly');
    const sub = findService('go.bit.ly');
    expect(sub?.domain).toBe('bit.ly');
    expect(findService('definitely-not-a-known-service.example')).toBeUndefined();
  });
  it('prefers the more specific (longest) matching domain over a shorter parent domain', () => {
    // maps.app.goo.gl is a subdomain of goo.gl, but has its own dedicated entry (P1-4): it must
    // win over the broader "goo.gl" (discontinued shortener) match.
    const svc = findService('maps.app.goo.gl');
    expect(svc?.domain).toBe('maps.app.goo.gl');
    expect(svc?.type).toBe('platform-shortener');
    // A plain goo.gl link still falls back to the discontinued-shortener entry.
    expect(findService('goo.gl')?.domain).toBe('goo.gl');
  });
});

describe('urlFlags', () => {
  it('flags http, ip hosts, userinfo and punycode', () => {
    expect(urlFlags(new URL('http://example.com')).some((f) => f.code === 'http')).toBe(true);
    expect(urlFlags(new URL('http://192.168.0.1')).some((f) => f.code === 'ip-host')).toBe(true);
    expect(urlFlags(new URL('https://user@example.com')).some((f) => f.code === 'userinfo')).toBe(true);
    expect(urlFlags(new URL('https://xn--pypal-4ve.com')).some((f) => f.code === 'punycode')).toBe(true);
  });
  it('flags a brand name stuffed into a subdomain', () => {
    const flags = urlFlags(new URL('https://paypal.secure-login.example.com'));
    expect(flags.some((f) => f.code === 'brand-in-subdomain')).toBe(true);
  });
  it('does not flag a clean https url', () => {
    expect(urlFlags(new URL('https://example.com/page'))).toEqual([]);
  });
  it('does not flag genuine multi-part-TLD sites as lookalikes (P1-5 regression)', () => {
    expect(urlFlags(new URL('https://www.amazon.co.uk/dp/1')).some((f) => f.code === 'brand-in-subdomain')).toBe(false);
    expect(urlFlags(new URL('https://www.paypal.co.uk/')).some((f) => f.code === 'brand-in-subdomain')).toBe(false);
    expect(urlFlags(new URL('https://santander.co.uk/')).some((f) => f.code === 'brand-in-subdomain')).toBe(false);
  });
  it('does not flag a brand name that only appears as a substring of another word', () => {
    expect(urlFlags(new URL('https://groups.google.com/')).some((f) => f.code === 'brand-in-subdomain')).toBe(false);
    expect(urlFlags(new URL('https://purchase.example.com/')).some((f) => f.code === 'brand-in-subdomain')).toBe(false);
  });
  it('still flags a real lookalike that uses a multi-part TLD as the disguise', () => {
    // "amazon" in the subdomain, but the actual registrable domain is a lookalike, not amazon.co.uk.
    const flags = urlFlags(new URL('https://amazon.secure-verify.example.co.uk/'));
    expect(flags.some((f) => f.code === 'brand-in-subdomain')).toBe(true);
  });
});

describe('classifyPayload', () => {
  it('marks non-url content as static ("cannot expire")', () => {
    const v = classifyPayload('WIFI:T:WPA;S:x;P:y;;');
    expect(v.status).toBe('static');
    expect(v.headline).toMatch(/cannot expire/i);
  });
  it('marks a known dynamic-QR/shortener domain as dynamic', () => {
    const v = classifyPayload('https://qrco.de/abc123');
    expect(v.status).toBe('dynamic');
    expect(v.service?.domain).toBe('qrco.de');
  });
  it('marks a plain unknown domain as direct', () => {
    const v = classifyPayload('https://example.com/page');
    expect(v.status).toBe('direct');
    expect(v.host).toBe('example.com');
  });
  it('marks a WhatsApp link as direct with an explanation', () => {
    const v = classifyPayload('https://wa.me/15550000000');
    expect(v.status).toBe('direct');
    expect(v.kind).toBe('whatsapp');
  });
  it('falls back to static text for an unparsable "url"-shaped payload', () => {
    const v = classifyPayload('not a url at all but detected as text');
    expect(v.status).toBe('static');
  });
  it('classifies a Google Maps share link as direct, not the discontinued goo.gl shortener (P1-4)', () => {
    const v = classifyPayload('https://maps.app.goo.gl/AbCdEf123');
    expect(v.status).toBe('direct');
    expect(v.service?.name).toBe('Google Maps');
    expect(v.explanation).not.toMatch(/discontinued/i);
  });
});

describe('verdictSummary', () => {
  it('produces a short line per status', () => {
    expect(verdictSummary(classifyPayload('plain text'))).toMatch(/cannot expire/i);
    expect(verdictSummary(classifyPayload('https://qrco.de/x'))).toMatch(/depends on/i);
    expect(verdictSummary(classifyPayload('https://example.com'))).toMatch(/points directly/i);
  });
});
