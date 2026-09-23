/** Base-path aware URL helpers (GitHub Pages project sites live under /<repo>/). */
const RAW_BASE = import.meta.env.BASE_URL || '/';
export const BASE = RAW_BASE.replace(/\/+$/, ''); // '' for root, '/slug' for project sites
export const SITE = (import.meta.env.SITE || 'https://rouraroble.github.io').replace(/\/+$/, '');

/** Prefix an app-relative path ('/about/') with the deployment base. */
export function withBase(path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('mailto:') || path.startsWith('#')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

/** Absolute URL for canonical / Open Graph. Accepts app-relative or base-relative paths. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const p = BASE && path.startsWith(BASE + '/') ? path : withBase(path);
  return `${SITE}${p}`;
}

/** Strip the base from a pathname (useful for route matching). */
export function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) return pathname.slice(BASE.length) || '/';
  return pathname;
}

/**
 * Prefix every root-relative href="/..." inside an HTML string with the deployment base, so
 * hand-written internal links in content data (e.g. src/data/usecases.json, rendered with
 * set:html) resolve correctly on a project site served under /<repo>/ instead of 404ing.
 * Leaves protocol-relative ("//") and already-based ("/<repo>/...") links untouched.
 */
export function fixInternalLinks(html: string): string {
  if (!BASE) return html;
  return html.replace(/href="(\/(?!\/)[^"]*)"/g, (full, path: string) => {
    if (path.startsWith(BASE + '/') || path === BASE) return full; // already based; avoid doubling it
    return `href="${BASE}${path}"`;
  });
}
