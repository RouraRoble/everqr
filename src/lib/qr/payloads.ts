/**
 * Payload builders: turn form fields into the exact string encoded in the QR pattern.
 * Formats follow the de-facto standards read by phone cameras and ZXing-based scanners:
 *  - Wi-Fi: WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:<true>;;  (ZXing / Android / iOS)
 *  - vCard 3.0 (RFC 2426), calendar events as bare VEVENT (RFC 5545 syntax, ZXing convention)
 *  - mailto: (RFC 6068), sms: (RFC 5724), tel: (RFC 3966), geo: (RFC 5870), WhatsApp click-to-chat (wa.me)
 */

export type ContentType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms' | 'phone' | 'whatsapp' | 'geo' | 'event';

export const CONTENT_TYPES: { id: ContentType; label: string; short: string }[] = [
  { id: 'url', label: 'Website URL', short: 'URL' },
  { id: 'text', label: 'Plain text', short: 'Text' },
  { id: 'wifi', label: 'Wi-Fi network', short: 'Wi-Fi' },
  { id: 'vcard', label: 'Contact card (vCard)', short: 'vCard' },
  { id: 'email', label: 'Email', short: 'Email' },
  { id: 'sms', label: 'SMS', short: 'SMS' },
  { id: 'phone', label: 'Phone call', short: 'Phone' },
  { id: 'whatsapp', label: 'WhatsApp chat', short: 'WhatsApp' },
  { id: 'geo', label: 'Location (map pin)', short: 'Location' },
  { id: 'event', label: 'Calendar event', short: 'Event' },
];

export function isContentType(x: unknown): x is ContentType {
  return typeof x === 'string' && CONTENT_TYPES.some((t) => t.id === x);
}

/** Fields are always strings (form values); booleans are '1' / ''. */
export type Fields = Record<string, string>;

export interface BuildResult {
  payload: string;
  /** Human readable validation problem (payload may still be returned as a best effort). */
  error?: string;
}

const MAX_FIELD = 2000;
const clip = (s: string | undefined) => (s ?? '').slice(0, MAX_FIELD);

/** Escape special characters inside a Wi-Fi payload value: \ ; , : " */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

const HEX_RE = /^[0-9a-fA-F]+$/;

export function buildWifi(f: Fields): BuildResult {
  // SSIDs are not trimmed: a leading/trailing space is unusual but legal in the 802.11 spec, and
  // a network genuinely named " Guest" would otherwise silently become "Guest" and never connect.
  const ssid = clip(f.ssid);
  const password = clip(f.password);
  const enc = f.encryption === 'WEP' ? 'WEP' : f.encryption === 'nopass' ? 'nopass' : 'WPA';
  const hidden = f.hidden === '1';
  if (!ssid.trim()) return { payload: '', error: 'Enter the network name (SSID).' };
  if (enc !== 'nopass' && !password) return { payload: '', error: 'Enter the Wi-Fi password, or choose "No password".' };
  if (enc === 'WPA') {
    // A raw 64-hex-digit PSK (as opposed to an 8-63 character passphrase that gets hashed into one)
    // is a separate, valid IEEE 802.11i format that Android and iOS both accept in a WIFI: QR code —
    // reject anything in between that is neither a passphrase-length string nor a full hex PSK.
    const isHexPsk = password.length === 64 && HEX_RE.test(password);
    if (!isHexPsk) {
      if (password.length < 8) return { payload: '', error: 'WPA passwords are at least 8 characters.' };
      if (password.length > 63) return { payload: '', error: 'WPA passwords are at most 63 characters (or 64 hex digits for a raw PSK).' };
    }
  }
  if (enc === 'WEP') {
    const isValidWep = [5, 13].includes(password.length) || ([10, 26].includes(password.length) && HEX_RE.test(password));
    if (!isValidWep) return { payload: '', error: 'WEP keys are 5 or 13 ASCII characters, or 10 or 26 hex digits.' };
  }
  let p = `WIFI:T:${enc};S:${escapeWifi(ssid)};`;
  if (enc !== 'nopass') p += `P:${escapeWifi(password)};`;
  if (hidden) p += 'H:true;';
  return { payload: p + ';' };
}

/** Escape a vCard / iCalendar text value (RFC 2426 §2.4.2, RFC 5545 §3.3.11). */
export function escapeVText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildVcard(f: Fields): BuildResult {
  const first = clip(f.firstName).trim();
  const last = clip(f.lastName).trim();
  const org = clip(f.org).trim();
  const title = clip(f.title).trim();
  const phone = clip(f.phone).trim();
  const email = clip(f.email).trim();
  const url = clip(f.url).trim();
  const street = clip(f.street).trim();
  const city = clip(f.city).trim();
  const region = clip(f.region).trim();
  const zip = clip(f.zip).trim();
  const country = clip(f.country).trim();
  if (!first && !last && !org) return { payload: '', error: 'Enter at least a name or an organisation.' };
  const fn = [first, last].filter(Boolean).join(' ') || org;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escapeVText(last)};${escapeVText(first)};;;`, `FN:${escapeVText(fn)}`];
  if (org) lines.push(`ORG:${escapeVText(org)}`);
  if (title) lines.push(`TITLE:${escapeVText(title)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${escapeVText(phone)}`);
  if (email) lines.push(`EMAIL:${escapeVText(email)}`);
  // URL is a URI-valued property (RFC 2426 §3.6.8), not a TEXT-valued one: it must not go through
  // the TEXT escaping rules (§2.4.2), which would corrupt a query string like "?a=1,2" into
  // "?a=1\,2" (P3-20). A raw CR/LF would break the line-folding format, so that alone is guarded.
  if (url) lines.push(`URL:${url.replace(/\r?\n/g, ' ')}`);
  if (street || city || region || zip || country) {
    lines.push(
      `ADR;TYPE=WORK:;;${escapeVText(street)};${escapeVText(city)};${escapeVText(region)};${escapeVText(zip)};${escapeVText(country)}`,
    );
  }
  lines.push('END:VCARD');
  return { payload: lines.join('\r\n') };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildEmail(f: Fields): BuildResult {
  const to = clip(f.to).trim();
  const subject = clip(f.subject).trim();
  const body = clip(f.body);
  if (!to) return { payload: '', error: 'Enter the recipient email address.' };
  if (!EMAIL_RE.test(to)) return { payload: '', error: 'That does not look like a valid email address.' };
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return { payload: `mailto:${to}${params.length ? '?' + params.join('&') : ''}` };
}

/** Keep digits and a leading +; strip spaces, dashes, dots and brackets. */
export function normalizePhone(raw: string): string {
  const s = raw.trim();
  const plus = s.startsWith('+') ? '+' : '';
  return plus + s.replace(/[^\d]/g, '');
}

export function buildPhone(f: Fields): BuildResult {
  const n = normalizePhone(clip(f.number));
  if (!n || n.replace('+', '').length < 3) return { payload: '', error: 'Enter a phone number, ideally with the country code (+44 …).' };
  return { payload: `tel:${n}` };
}

export function buildSms(f: Fields): BuildResult {
  const n = normalizePhone(clip(f.number));
  const message = clip(f.message);
  if (!n || n.replace('+', '').length < 3) return { payload: '', error: 'Enter the phone number that will receive the SMS.' };
  return { payload: `sms:${n}${message ? '?body=' + encodeURIComponent(message) : ''}` };
}

export function buildWhatsapp(f: Fields): BuildResult {
  // wa.me needs the number with no leading + and no international "00" trunk-prefix (WhatsApp's
  // own convention: https://wa.me/<countrycode><number>, digits only). Typing "0034 600 000 000"
  // for Spain otherwise produces a broken link ("0034…" is not a valid country calling code).
  let digits = normalizePhone(clip(f.number)).replace('+', '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  const message = clip(f.message);
  if (!digits || digits.length < 6) return { payload: '', error: 'Enter the WhatsApp number in international format, e.g. +34 600 000 000.' };
  return { payload: `https://wa.me/${digits}${message ? '?text=' + encodeURIComponent(message) : ''}` };
}

function fmtCoord(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

export function buildGeo(f: Fields): BuildResult {
  const lat = Number(clip(f.lat).trim());
  const lng = Number(clip(f.lng).trim());
  const label = clip(f.label).trim();
  if (!f.lat?.trim() || !f.lng?.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { payload: '', error: 'Enter latitude and longitude as decimal degrees (e.g. 41.3874, 2.1686).' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { payload: '', error: 'Latitude must be within ±90 and longitude within ±180.' };
  const base = `geo:${fmtCoord(lat)},${fmtCoord(lng)}`;
  return { payload: label ? `${base}?q=${fmtCoord(lat)},${fmtCoord(lng)}(${encodeURIComponent(label)})` : base };
}

export function buildUrl(f: Fields): BuildResult {
  let u = clip(f.url).trim();
  if (!u) return { payload: '', error: 'Enter the web address.' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    // A disallowed scheme (javascript:, data:, file:…) must produce no exportable code at all —
    // returning the raw string as `payload` here used to still let it through to the QR matrix
    // even while an error was shown (P3-21).
    if (!/^https?:$/.test(parsed.protocol)) return { payload: '', error: 'Only http and https links are supported here; use "Plain text" for other schemes.' };
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return { payload: '', error: 'The address needs a domain, e.g. example.com.' };
    // Use the URL object's normalised form so raw spaces and other characters that need
    // percent-encoding (e.g. "https://example.com/a b") are actually encoded, instead of being
    // baked verbatim into the QR code.
    return { payload: parsed.href };
  } catch {
    return { payload: '', error: 'That does not look like a valid web address.' };
  }
}

export function buildText(f: Fields): BuildResult {
  const t = clip(f.text);
  if (!t.trim()) return { payload: '', error: 'Type the text to encode.' };
  return { payload: t };
}

/** 'YYYY-MM-DD' + 'HH:MM' -> '20260923T100000' (floating local time), or '20260923' for all-day. */
export function icsDateTime(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!d) return null;
  const ymd = `${d[1]}${d[2]}${d[3]}`;
  const t = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!t) return ymd;
  return `${ymd}T${t[1]}${t[2]}00`;
}

/** 'YYYYMMDD' -> 'YYYYMMDD' for the next calendar day (used for RFC 5545's exclusive DTEND). */
export function addOneDay(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const next = new Date(Date.UTC(y, mo, d + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function buildEvent(f: Fields): BuildResult {
  const summary = clip(f.summary).trim();
  const location = clip(f.location).trim();
  const description = clip(f.description).trim();
  const allDay = f.allDay === '1';
  if (!summary) return { payload: '', error: 'Enter the event title.' };
  const start = icsDateTime(clip(f.startDate), allDay ? '' : clip(f.startTime));
  if (!start) return { payload: '', error: 'Enter a start date.' };
  const hasExplicitEnd = Boolean(clip(f.endDate).trim() || (!allDay && clip(f.endTime).trim()));
  const endRaw = icsDateTime(clip(f.endDate) || clip(f.startDate), allDay ? '' : clip(f.endTime) || clip(f.startTime));
  const end = endRaw ?? start;
  if (end < start) return { payload: '', error: 'The end must be after the start.' };
  const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeVText(summary)}`];
  if (allDay || !start.includes('T')) {
    // RFC 5545 §3.6.1: DTEND on a DATE-valued event is exclusive (the day *after* the event
    // ends), so the chosen end date itself must be pushed forward by one day. Without this, a
    // single-day event has DTSTART == DTEND (a zero-length event some calendars reject or hide),
    // and a multi-day event's last day is silently dropped.
    lines.push(`DTSTART;VALUE=DATE:${start.slice(0, 8)}`, `DTEND;VALUE=DATE:${addOneDay(end.slice(0, 8))}`);
  } else if (hasExplicitEnd) {
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    // Timed event with no end specified: default to a 1-hour duration instead of a zero-length
    // (DTEND == DTSTART) event, which some calendar apps also reject or render as a blip.
    const startDate = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T${start.slice(9, 11)}:${start.slice(11, 13)}:${start.slice(13, 15)}Z`);
    startDate.setUTCHours(startDate.getUTCHours() + 1);
    const endDefault = `${startDate.getUTCFullYear()}${String(startDate.getUTCMonth() + 1).padStart(2, '0')}${String(startDate.getUTCDate()).padStart(2, '0')}T${String(startDate.getUTCHours()).padStart(2, '0')}${String(startDate.getUTCMinutes()).padStart(2, '0')}00`;
    lines.push(`DTSTART:${start}`, `DTEND:${endDefault}`);
  }
  if (location) lines.push(`LOCATION:${escapeVText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeVText(description)}`);
  lines.push('END:VEVENT');
  return { payload: lines.join('\r\n') };
}

export function buildPayload(type: ContentType, fields: Fields): BuildResult {
  switch (type) {
    case 'url':
      return buildUrl(fields);
    case 'text':
      return buildText(fields);
    case 'wifi':
      return buildWifi(fields);
    case 'vcard':
      return buildVcard(fields);
    case 'email':
      return buildEmail(fields);
    case 'sms':
      return buildSms(fields);
    case 'phone':
      return buildPhone(fields);
    case 'whatsapp':
      return buildWhatsapp(fields);
    case 'geo':
      return buildGeo(fields);
    case 'event':
      return buildEvent(fields);
  }
}

/** Content types whose payload usually contains private data: links exclude content by default. */
export const PRIVATE_TYPES: ContentType[] = ['wifi', 'vcard', 'email', 'sms', 'phone', 'whatsapp'];
