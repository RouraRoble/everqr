/** Minimal RFC 4180 CSV parser plus the bulk row mapper (content,label). */

export const BULK_ROW_CAP = 500;
export const BULK_CONTENT_MAX = 1500;
export const BULK_LABEL_MAX = 80;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface BulkItem {
  content: string;
  label: string;
  /** Set when the row could not be used as-is (e.g. content too long); the row is still listed so the user can see and fix it, but is excluded from render/export. */
  error?: string;
}

/**
 * Map CSV rows to bulk items. A header row containing "content" (and optionally "label") is
 * honoured; otherwise column 1 = content, column 2 = label. Capped at BULK_ROW_CAP rows.
 * A row whose content exceeds BULK_CONTENT_MAX is kept (so the user can see and fix it) but
 * flagged with `error` instead of being silently truncated and reported as ready.
 */
export function rowsToItems(rows: string[][], cap = BULK_ROW_CAP): { items: BulkItem[]; truncated: boolean } {
  if (!rows.length) return { items: [], truncated: false };
  let ci = 0;
  let li = 1;
  let start = 0;
  const head = rows[0].map((c) => c.trim().toLowerCase());
  const hc = head.indexOf('content');
  const hu = head.indexOf('url');
  if (hc >= 0 || hu >= 0) {
    ci = hc >= 0 ? hc : hu;
    const hl = head.findIndex((h) => h === 'label' || h === 'name' || h === 'title');
    li = hl >= 0 ? hl : -1;
    start = 1;
  }
  const items: BulkItem[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const raw = (r[ci] ?? '').trim();
    if (!raw) continue;
    const tooLong = raw.length > BULK_CONTENT_MAX;
    const content = tooLong ? raw.slice(0, BULK_CONTENT_MAX) : raw;
    const label = (li >= 0 ? (r[li] ?? '') : '').trim().slice(0, BULK_LABEL_MAX) || `qr-${String(items.length + 1).padStart(3, '0')}`;
    items.push(tooLong ? { content, label, error: `Too long (${raw.length} > ${BULK_CONTENT_MAX} characters) — shorten it.` } : { content, label });
    if (items.length >= cap) return { items, truncated: i < rows.length - 1 };
  }
  return { items, truncated: false };
}

/**
 * Plain "one item per line" input: `content` or `content,label`. Unlike CSV upload, this does not
 * run the whole pasted block through the RFC-4180 parser — a single stray `"` there would swallow
 * every following newline and merge unrelated rows together. Each line is parsed independently: a
 * line containing a quote is parsed as its own tiny CSV row (so quoted commas inside content still
 * work); an unquoted line is split on the *last* comma only, so a comma inside the content itself
 * (a URL query string, "Hello, world") stays part of the content instead of truncating it or
 * being misread as the start of the label.
 */
export function linesToItems(text: string, cap = BULK_ROW_CAP): { items: BulkItem[]; truncated: boolean } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== '');
  const rows: string[][] = lines.map((line) => {
    if (line.includes('"')) {
      const parsed = parseCsv(line);
      return parsed[0] ?? [line];
    }
    const idx = line.lastIndexOf(',');
    return idx === -1 ? [line] : [line.slice(0, idx), line.slice(idx + 1)];
  });
  return rowsToItems(rows, cap);
}
