/**
 * QR expiry checker logic: classify a decoded payload as
 *  - static   : data lives inside the pattern (text, Wi-Fi, vCard…) -> cannot expire
 *  - dynamic  : URL on a dynamic-QR / link-shortener service -> depends on that account/subscription
 *  - direct   : URL pointing straight at a site -> works while the site exists
 * plus safety flags (http, punycode, IP hosts, brand-in-subdomain lookalikes, userinfo tricks).
 */
import domainsJson from '../../data/redirect-domains.json';

export type ServiceType = 'dynamic-qr' | 'shortener' | 'link-in-bio' | 'platform-shortener';
export interface RedirectService {
  domain: string;
  name: string;
  type: ServiceType;
  note: string;
}
export const REDIRECT_DOMAINS: RedirectService[] = domainsJson as RedirectService[];

export type PayloadKind = 'url' | 'whatsapp' | 'wifi' | 'vcard' | 'mecard' | 'vevent' | 'mailto' | 'sms' | 'tel' | 'geo' | 'text';
export type Status = 'static' | 'dynamic' | 'direct';

export interface Flag {
  level: 'warn' | 'info';
  code: 'http' | 'punycode' | 'ip-host' | 'brand-in-subdomain' | 'userinfo' | 'port' | 'platform-shortener' | 'long-url' | 'url-like-text';
  message: string;
}

export interface Verdict {
  status: Status;
  kind: PayloadKind;
  kindLabel: string;
  headline: string;
  explanation: string;
  host?: string;
  service?: RedirectService;
  flags: Flag[];
}

export const KIND_LABELS: Record<PayloadKind, string> = {
  url: 'a web link',
  whatsapp: 'a WhatsApp chat link',
  wifi: 'Wi-Fi network credentials',
  vcard: 'a contact card (vCard)',
  mecard: 'a contact card (MeCard)',
  vevent: 'a calendar event',
  mailto: 'an email address',
  sms: 'an SMS message',
  tel: 'a phone number',
  geo: 'a map location',
  text: 'plain text',
};

export function detectKind(payload: string): PayloadKind {
  const p = payload.trim();
  const u = p.toUpperCase();
  if (u.startsWith('WIFI:')) return 'wifi';
  if (u.startsWith('BEGIN:VCARD')) return 'vcard';
  if (u.startsWith('MECARD:')) return 'mecard';
  if (u.startsWith('BEGIN:VEVENT') || u.startsWith('BEGIN:VCALENDAR')) return 'vevent';
  if (u.startsWith('MAILTO:') || u.startsWith('MATMSG:')) return 'mailto';
  if (u.startsWith('SMS:') || u.startsWith('SMSTO:') || u.startsWith('MMS:')) return 'sms';
  if (u.startsWith('TEL:')) return 'tel';
  if (u.startsWith('GEO:')) return 'geo';
  if (/^HTTPS?:\/\//.test(u)) {
    try {
      const host = normalizeHost(new URL(p).hostname);
      if (host === 'wa.me' || host === 'api.whatsapp.com') return 'whatsapp';
    } catch {
      /* fallthrough */
    }
    return 'url';
  }
  return 'text';
}

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

/**
 * Find the redirect service matching a host (exact or parent-domain match). When more than one
 * list entry matches (e.g. both "goo.gl" and the more specific "maps.app.goo.gl"), the longest
 * (most specific) domain wins, so a dedicated exact entry always overrides its own parent domain.
 */
export function findService(host: string, list: RedirectService[] = REDIRECT_DOMAINS): RedirectService | undefined {
  const h = normalizeHost(host);
  let best: RedirectService | undefined;
  for (const s of list) {
    if ((h === s.domain || h.endsWith('.' + s.domain)) && (!best || s.domain.length > best.domain.length)) best = s;
  }
  return best;
}

const BRANDS = ['paypal', 'google', 'apple', 'microsoft', 'amazon', 'facebook', 'instagram', 'whatsapp', 'netflix', 'bank', 'dhl', 'ups', 'fedex', 'usps', 'chase', 'wellsfargo', 'hsbc', 'santander'];
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Public-suffix labels that are themselves two parts (registrable domains under these end in
 * three labels, not two: "amazon.co.uk", not "co.uk"). Not exhaustive, but covers the common
 * ccTLD-with-category suffixes that would otherwise be misread as "brand.co" + ".uk".
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'gov.uk', 'ac.uk',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'co.nz', 'org.nz', 'co.za', 'org.za', 'co.in', 'net.in',
  'com.au', 'net.au', 'org.au', 'com.br', 'net.br', 'com.mx', 'com.sg', 'com.hk', 'co.kr',
  'com.tr', 'com.ar', 'com.tw', 'co.il', 'co.th', 'com.co', 'com.my',
]);

/** The registrable domain (eTLD+1) for a dot-split host, aware of common two-label public suffixes. */
function registrableDomain(labels: string[]): string {
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

export function urlFlags(url: URL): Flag[] {
  const flags: Flag[] = [];
  const host = normalizeHost(url.hostname);
  if (url.protocol === 'http:') flags.push({ level: 'warn', code: 'http', message: 'Plain http link (not https): the destination is not encrypted and could be tampered with in transit.' });
  if (host.split('.').some((l) => l.startsWith('xn--'))) flags.push({ level: 'warn', code: 'punycode', message: 'Internationalised (punycode) domain: characters may imitate a well-known brand. Check it carefully.' });
  if (IPV4.test(host) || host.startsWith('[')) flags.push({ level: 'warn', code: 'ip-host', message: 'Links to a raw IP address rather than a domain name, which is unusual for legitimate services.' });
  if (url.username || url.password) flags.push({ level: 'warn', code: 'userinfo', message: 'Contains "user@" before the domain, a trick that makes the link look like it goes somewhere else.' });
  const labels = host.split('.');
  const reg = registrableDomain(labels);
  const regLabelCount = reg.split('.').length;
  if (labels.length > regLabelCount) {
    const sub = labels.slice(0, labels.length - regLabelCount).join('.');
    // Match on whole label boundaries (start/end or a "." / "-" neighbour) so a brand name that
    // merely appears as a substring — "ups" inside "groups", "chase" inside "purchase" — does not
    // trigger a false lookalike warning; the real site check (`!reg.includes(b)`) then excludes
    // genuine domains where the brand *is* the registrable domain, e.g. amazon.co.uk.
    const hit = BRANDS.find((b) => new RegExp(`(^|[.-])${b}([.-]|$)`).test(sub) && !reg.includes(b));
    if (hit) flags.push({ level: 'warn', code: 'brand-in-subdomain', message: `"${hit}" appears in the subdomain but the real site is ${reg}. This is a common lookalike pattern.` });
  }
  if (url.port && url.port !== '80' && url.port !== '443') flags.push({ level: 'info', code: 'port', message: `Uses a non-standard port (${url.port}).` });
  if (url.href.length > 1200) flags.push({ level: 'info', code: 'long-url', message: 'Very long URL: a denser code that is harder to scan when printed small.' });
  return flags;
}

export function classifyPayload(payload: string, list: RedirectService[] = REDIRECT_DOMAINS): Verdict {
  const kind = detectKind(payload);
  const kindLabel = KIND_LABELS[kind];
  if (kind !== 'url' && kind !== 'whatsapp') {
    const flags: Flag[] = [];
    if (kind === 'text' && /^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(payload.trim())) {
      flags.push({ level: 'info', code: 'url-like-text', message: 'Looks like a web address without http(s)://. Some scanners will treat it as plain text instead of opening it.' });
    }
    return {
      status: 'static',
      kind,
      kindLabel,
      headline: 'This QR code cannot expire',
      explanation: `It stores ${kindLabel} directly inside the pattern. No server or subscription is involved, so nothing can switch it off: it will scan for as long as the print is legible.`,
      flags,
    };
  }
  let url: URL;
  try {
    url = new URL(payload.trim());
  } catch {
    return { status: 'static', kind: 'text', kindLabel: KIND_LABELS.text, headline: 'This QR code cannot expire', explanation: 'It stores plain text inside the pattern.', flags: [] };
  }
  const host = normalizeHost(url.hostname);
  const flags = urlFlags(url);
  if (kind === 'whatsapp') {
    return {
      status: 'direct',
      kind,
      kindLabel,
      host,
      headline: 'This QR code opens a WhatsApp chat directly',
      explanation: 'It is a WhatsApp click-to-chat link (wa.me). It works as long as WhatsApp and that phone number exist; no QR service sits in between.',
      flags,
    };
  }
  const service = findService(host, list);
  if (service && service.type === 'platform-shortener') {
    flags.push({ level: 'info', code: 'platform-shortener', message: `${service.name}: ${service.note}` });
    return {
      status: 'direct',
      kind,
      kindLabel,
      host,
      service,
      headline: `This QR code points to ${host}`,
      explanation: `${host} is a short link owned by ${service.name}, not a QR subscription. It will keep working for as long as ${service.name} keeps the destination online.`,
      flags,
    };
  }
  if (service) {
    const what = service.type === 'dynamic-qr' ? 'a dynamic QR code service' : service.type === 'shortener' ? 'a link-shortening service' : 'a link-in-bio service';
    return {
      status: 'dynamic',
      kind,
      kindLabel,
      host,
      service,
      headline: `This QR code depends on ${service.name}`,
      explanation: `It does not contain the final destination. It points to ${host}, ${what}, which redirects each scan. The code only works while the account behind it is active: if the plan lapses, the link is deleted or the service shuts down, scans stop working. ${service.note}`,
      flags,
    };
  }
  return {
    status: 'direct',
    kind,
    kindLabel,
    host,
    headline: `This QR code points directly to ${host}`,
    explanation: `The full address is stored inside the pattern and leads straight to ${host}. It works for as long as that page exists. No QR service or subscription sits in between.`,
    flags,
  };
}

/** Short, shareable summary line for the verdict card. */
export function verdictSummary(v: Verdict): string {
  if (v.status === 'static') return `This QR code cannot expire: it stores ${v.kindLabel} inside the pattern.`;
  if (v.status === 'dynamic') return `This QR code depends on ${v.service?.name ?? v.host}: if that subscription lapses, it stops working.`;
  return `This QR code points directly to ${v.host}: it works for as long as the page exists.`;
}
