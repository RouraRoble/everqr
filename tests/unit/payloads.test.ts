import { describe, expect, it } from 'vitest';
import {
  buildWifi,
  buildVcard,
  buildEmail,
  buildSms,
  buildPhone,
  buildWhatsapp,
  buildGeo,
  buildUrl,
  buildText,
  buildEvent,
  buildPayload,
  escapeWifi,
  escapeVText,
  normalizePhone,
  icsDateTime,
} from '../../src/lib/qr/payloads';

describe('escapeWifi', () => {
  it('escapes backslash, semicolon, comma and quote', () => {
    expect(escapeWifi('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
  });
});

describe('buildWifi', () => {
  it('builds a WPA payload with escaped SSID and password', () => {
    const r = buildWifi({ ssid: 'My;Net', password: 'p@ss;word', encryption: 'WPA' });
    expect(r.error).toBeUndefined();
    expect(r.payload).toBe('WIFI:T:WPA;S:My\\;Net;P:p@ss\\;word;;');
  });
  it('omits the password field for open networks', () => {
    const r = buildWifi({ ssid: 'Open', encryption: 'nopass' });
    expect(r.payload).toBe('WIFI:T:nopass;S:Open;;');
  });
  it('marks hidden networks', () => {
    const r = buildWifi({ ssid: 'Hidden', password: 'password1', encryption: 'WPA', hidden: '1' });
    expect(r.payload).toContain('H:true;');
  });
  it('requires an SSID', () => {
    expect(buildWifi({}).error).toBeTruthy();
  });
  it('requires a password for WPA and rejects short ones', () => {
    expect(buildWifi({ ssid: 'x', encryption: 'WPA' }).error).toBeTruthy();
    expect(buildWifi({ ssid: 'x', encryption: 'WPA', password: 'short' }).error).toBeTruthy();
  });
  describe('P3-19: validation gaps', () => {
    it('rejects a WPA password over 63 characters that is not a valid 64-hex-digit PSK', () => {
      expect(buildWifi({ ssid: 'x', encryption: 'WPA', password: 'z'.repeat(64) }).error).toBeTruthy(); // 64 chars, not hex
      expect(buildWifi({ ssid: 'x', encryption: 'WPA', password: 'a'.repeat(65) }).error).toBeTruthy(); // 65 hex chars: too long either way
      expect(buildWifi({ ssid: 'x', encryption: 'WPA', password: 'a'.repeat(63) }).error).toBeUndefined();
    });
    it('accepts a raw 64-hex-digit WPA PSK (audit-2 N-4)', () => {
      expect(buildWifi({ ssid: 'x', encryption: 'WPA', password: 'a'.repeat(64) }).error).toBeUndefined();
      expect(buildWifi({ ssid: 'x', encryption: 'WPA', password: '0123456789abcdef'.repeat(4) }).error).toBeUndefined();
    });
    it('validates WEP key length (5/13 ASCII or 10/26 hex)', () => {
      expect(buildWifi({ ssid: 'x', encryption: 'WEP', password: 'abcde' }).error).toBeUndefined(); // 5 ASCII
      expect(buildWifi({ ssid: 'x', encryption: 'WEP', password: '0123456789' }).error).toBeUndefined(); // 10 hex
      expect(buildWifi({ ssid: 'x', encryption: 'WEP', password: 'nothex1234' }).error).toBeTruthy(); // 10 chars, not hex
      expect(buildWifi({ ssid: 'x', encryption: 'WEP', password: 'short' + '1' }).error).toBeTruthy(); // 6 chars: invalid length
    });
    it('preserves a leading/trailing space in the SSID instead of trimming it', () => {
      const r = buildWifi({ ssid: ' Guest ', encryption: 'nopass' });
      expect(r.payload).toBe('WIFI:T:nopass;S: Guest ;;');
    });
  });
});

describe('escapeVText / buildVcard', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    expect(escapeVText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
  it('builds a minimal vCard 3.0', () => {
    const r = buildVcard({ firstName: 'Ada', lastName: 'Lovelace', org: 'Analytical Engines' });
    expect(r.payload).toContain('BEGIN:VCARD');
    expect(r.payload).toContain('VERSION:3.0');
    expect(r.payload).toContain('FN:Ada Lovelace');
    expect(r.payload).toContain('N:Lovelace;Ada;;;');
    expect(r.payload).toContain('ORG:Analytical Engines');
    expect(r.payload).toContain('END:VCARD');
  });
  it('requires at least a name or organisation', () => {
    expect(buildVcard({}).error).toBeTruthy();
  });
  it('falls back to org for FN when no name given', () => {
    const r = buildVcard({ org: 'Acme' });
    expect(r.payload).toContain('FN:Acme');
  });
  it('does not text-escape the URL property (it is URI-valued, not TEXT-valued) (P3-20)', () => {
    const r = buildVcard({ firstName: 'A', url: 'https://x.com/a,b;c' });
    expect(r.payload).toContain('URL:https://x.com/a,b;c');
    expect(r.payload).not.toContain('URL:https://x.com/a\\,b\\;c');
  });
});

describe('buildEmail', () => {
  it('builds a mailto link with encoded subject/body', () => {
    const r = buildEmail({ to: 'a@b.com', subject: 'Hi there', body: 'Line one' });
    expect(r.payload).toBe('mailto:a@b.com?subject=Hi%20there&body=Line%20one');
  });
  it('validates the address', () => {
    expect(buildEmail({ to: 'not-an-email' }).error).toBeTruthy();
    expect(buildEmail({}).error).toBeTruthy();
  });
});

describe('normalizePhone', () => {
  it('keeps a leading + and strips other formatting', () => {
    expect(normalizePhone('+1 (555) 000-0000')).toBe('+15550000000');
    expect(normalizePhone('555.000.0000')).toBe('5550000000');
  });
});

describe('buildSms / buildPhone / buildWhatsapp', () => {
  it('builds sms: with an encoded body', () => {
    expect(buildSms({ number: '+1 555 000 0000', message: 'hi there' }).payload).toBe('sms:+15550000000?body=hi%20there');
  });
  it('builds tel:', () => {
    expect(buildPhone({ number: '+44 20 7946 0958' }).payload).toBe('tel:+442079460958');
  });
  it('rejects too-short numbers', () => {
    expect(buildPhone({ number: '12' }).error).toBeTruthy();
  });
  it('builds a wa.me link with digits only', () => {
    const r = buildWhatsapp({ number: '+1 555 000 0000', message: 'hello' });
    expect(r.payload).toBe('https://wa.me/15550000000?text=hello');
  });
  it('strips a leading 00 international trunk prefix (P2-10)', () => {
    const r = buildWhatsapp({ number: '0034 600 000 000' });
    expect(r.payload).toBe('https://wa.me/34600000000');
  });
});

describe('buildGeo', () => {
  it('formats coordinates and an optional label', () => {
    expect(buildGeo({ lat: '41.3874', lng: '2.1686' }).payload).toBe('geo:41.3874,2.1686');
    const withLabel = buildGeo({ lat: '41.3874', lng: '2.1686', label: 'Barcelona' });
    expect(withLabel.payload).toBe('geo:41.3874,2.1686?q=41.3874,2.1686(Barcelona)');
  });
  it('rejects out-of-range coordinates', () => {
    expect(buildGeo({ lat: '999', lng: '0' }).error).toBeTruthy();
  });
  it('rejects missing coordinates', () => {
    expect(buildGeo({}).error).toBeTruthy();
  });
});

describe('buildUrl', () => {
  it('adds https:// when no scheme is given', () => {
    // new URL(...).href normalises a bare-domain URL with a trailing "/" (RFC 3986 ¶ empty path).
    expect(buildUrl({ url: 'example.com' }).payload).toBe('https://example.com/');
  });
  it('keeps an explicit scheme', () => {
    expect(buildUrl({ url: 'http://example.com' }).payload).toBe('http://example.com/');
  });
  it('rejects non-http(s) schemes and missing domains, producing no payload at all (P3-21)', () => {
    expect(buildUrl({ url: 'ftp://example.com' })).toEqual({ payload: '', error: expect.any(String) });
    expect(buildUrl({ url: 'javascript:alert(1)' })).toEqual({ payload: '', error: expect.any(String) });
    expect(buildUrl({}).error).toBeTruthy();
  });
  it('percent-encodes characters like spaces that need it (P3-21)', () => {
    expect(buildUrl({ url: 'https://example.com/a b' }).payload).toBe('https://example.com/a%20b');
  });
});

describe('buildText', () => {
  it('requires non-empty text', () => {
    expect(buildText({ text: '  ' }).error).toBeTruthy();
    expect(buildText({ text: 'hello' }).payload).toBe('hello');
  });
});

describe('icsDateTime / buildEvent', () => {
  it('formats a date + time', () => {
    expect(icsDateTime('2026-09-23', '10:00')).toBe('20260923T100000');
    expect(icsDateTime('2026-09-23', '')).toBe('20260923');
    expect(icsDateTime('bad', '10:00')).toBeNull();
  });
  it('builds a VEVENT with start/end', () => {
    const r = buildEvent({ summary: 'Launch', startDate: '2026-09-23', startTime: '09:00', endTime: '10:00' });
    expect(r.payload).toContain('BEGIN:VEVENT');
    expect(r.payload).toContain('SUMMARY:Launch');
    expect(r.payload).toContain('DTSTART:20260923T090000');
    expect(r.payload).toContain('DTEND:20260923T100000');
  });
  it('rejects an end before the start', () => {
    const r = buildEvent({ summary: 'Bad', startDate: '2026-09-23', startTime: '10:00', endTime: '09:00' });
    expect(r.error).toBeTruthy();
  });
  it('requires a title and a start date', () => {
    expect(buildEvent({}).error).toBeTruthy();
    expect(buildEvent({ summary: 'x' }).error).toBeTruthy();
  });

  describe('P2-9: DTEND is exclusive for all-day / defaults for timed events', () => {
    it('a single-day all-day event spans the whole day, not zero length', () => {
      const r = buildEvent({ summary: 'Party', allDay: '1', startDate: '2026-10-10' });
      expect(r.payload).toContain('DTSTART;VALUE=DATE:20261010');
      expect(r.payload).toContain('DTEND;VALUE=DATE:20261011');
    });
    it('a multi-day all-day event includes its last day', () => {
      const r = buildEvent({ summary: 'Trip', allDay: '1', startDate: '2026-10-10', endDate: '2026-10-12' });
      expect(r.payload).toContain('DTSTART;VALUE=DATE:20261010');
      expect(r.payload).toContain('DTEND;VALUE=DATE:20261013');
    });
    it('an all-day event spanning a month/year boundary rolls over correctly', () => {
      const r = buildEvent({ summary: 'NYE', allDay: '1', startDate: '2026-12-31' });
      expect(r.payload).toContain('DTEND;VALUE=DATE:20270101');
    });
    it('a timed event with no end time defaults to a 1-hour duration, not zero length', () => {
      const r = buildEvent({ summary: 'Call', startDate: '2026-09-23', startTime: '09:00' });
      expect(r.payload).toContain('DTSTART:20260923T090000');
      expect(r.payload).toContain('DTEND:20260923T100000');
    });
  });
});

describe('buildPayload dispatch', () => {
  it('routes to the right builder for every content type', () => {
    expect(buildPayload('url', { url: 'example.com' }).payload).toContain('https://');
    expect(buildPayload('text', { text: 'hi' }).payload).toBe('hi');
    expect(buildPayload('phone', { number: '+15550000000' }).payload).toBe('tel:+15550000000');
  });
});
