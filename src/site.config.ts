/**
 * Product-level configuration. Every product edits this file.
 * Keep values honest: they end up in metadata, structured data and legal pages.
 */
export const site = {
  name: 'EverQR',
  slug: 'everqr',
  tagline: 'Free QR code generator that never expires',
  description:
    'Free QR code generator with no expiry: static QR codes for URLs, Wi-Fi, vCards and more, styled and exported as SVG or PNG. No account, nothing uploaded.',
  locale: 'en',
  ogLocale: 'en_US',
  themeColor: '#0b3d2e',
  backgroundColor: '#ffffff',
  accent: '#0e7a54',
  author: { name: 'RouraRoble', url: 'https://github.com/RouraRoble' },
  contactEmail: 'roura.roble@gmail.com',
  launched: '2026-09-23',
  /** Visible "Last updated" date on content pages. Bump when content changes. */
  updated: '2026-09-23',
  category: 'UtilitiesApplication', // schema.org SoftwareApplication applicationCategory
  keywords: [
    'qr code generator',
    'free qr code generator',
    'qr code generator no expiration',
    'static qr code',
    'wifi qr code generator',
    'vcard qr code',
    'bulk qr code generator',
    'qr code checker',
  ] as string[],
  social: { twitter: '' },
  nav: [
    { href: '/', label: 'Generator' },
    { href: '/bulk/', label: 'Bulk' },
    { href: '/check/', label: 'Checker' },
    { href: '/guide/', label: 'Guides' },
  ],
  /**
   * Affiliate placeholders (no partner signed yet: URLs stay '#').
   * Rendered with rel="sponsored noopener" and a visible "affiliate" label.
   */
  affiliate: {
    enabled: true,
    disclosure: 'Links marked "affiliate" may earn us a commission at no extra cost to you. No partner is active yet; these are placeholders.',
    items: [
      { name: 'Label printer (thermal, 4×6 and 2×1)', url: '#', note: 'For sticker rolls of QR labels', partner: 'to be confirmed' },
      { name: 'Weatherproof vinyl sticker paper', url: '#', note: 'Outdoor menus, signage, equipment tags', partner: 'to be confirmed' },
      { name: 'Table tent / acrylic sign holders', url: '#', note: 'Restaurant and event display', partner: 'to be confirmed' },
    ],
  },
  // Monetization / analytics hooks (all optional, env-driven at build time)
  adsenseClient: import.meta.env.PUBLIC_ADSENSE_CLIENT || '',
  beaconUrl: import.meta.env.PUBLIC_BEACON_URL || '',
  plausibleDomain: import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN || '',
};
export type SiteConfig = typeof site;
