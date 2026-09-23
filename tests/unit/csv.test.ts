import { describe, expect, it } from 'vitest';
import { parseCsv, rowsToItems, linesToItems, BULK_ROW_CAP } from '../../src/lib/qr/csv';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
  it('handles quoted fields with embedded commas and escaped quotes', () => {
    expect(parseCsv('"hello, world","she said ""hi"""')).toEqual([['hello, world', 'she said "hi"']]);
  });
  it('handles CRLF and bare CR line endings', () => {
    expect(parseCsv('a,b\r\nc,d\re,f')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });
  it('strips a leading BOM and skips blank lines', () => {
    expect(parseCsv('﻿a,b\n\n\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('rowsToItems', () => {
  it('maps column 1/2 to content/label with no header', () => {
    const { items } = rowsToItems([
      ['https://a.test', 'Label A'],
      ['https://b.test', 'Label B'],
    ]);
    expect(items).toEqual([
      { content: 'https://a.test', label: 'Label A' },
      { content: 'https://b.test', label: 'Label B' },
    ]);
  });
  it('honours a header row naming content/label columns in any order', () => {
    const { items } = rowsToItems([
      ['label', 'content'],
      ['Label A', 'https://a.test'],
    ]);
    expect(items).toEqual([{ content: 'https://a.test', label: 'Label A' }]);
  });
  it('auto-generates a label when missing', () => {
    const { items } = rowsToItems([['https://a.test']]);
    expect(items[0].label).toBe('qr-001');
  });
  it('caps at the given row limit and reports truncation', () => {
    const rows = Array.from({ length: 5 }, (_, i) => [`item-${i}`]);
    const { items, truncated } = rowsToItems(rows, 3);
    expect(items).toHaveLength(3);
    expect(truncated).toBe(true);
  });
  it('defaults to BULK_ROW_CAP', () => {
    expect(BULK_ROW_CAP).toBe(500);
  });
  it('skips rows with empty content', () => {
    const { items } = rowsToItems([['', 'Label'], ['https://a.test', 'B']]);
    expect(items).toHaveLength(1);
  });
  it('flags an over-long row as an error instead of silently truncating it (P2-11)', () => {
    const long = 'x'.repeat(1600);
    const { items } = rowsToItems([[long, 'Label']]);
    expect(items).toHaveLength(1);
    expect(items[0].error).toMatch(/too long/i);
    expect(items[0].content.length).toBe(1500); // still capped for safety, but the row is marked as errored, not "ready"
  });
  it('does not flag a row at or under the limit', () => {
    const ok = 'x'.repeat(1500);
    const { items } = rowsToItems([[ok, 'Label']]);
    expect(items[0].error).toBeUndefined();
  });
});

describe('linesToItems', () => {
  it('parses plain pasted lines the same way as CSV', () => {
    const { items } = linesToItems('https://example.com/1,Table 1\nhttps://example.com/2,Table 2');
    expect(items).toEqual([
      { content: 'https://example.com/1', label: 'Table 1' },
      { content: 'https://example.com/2', label: 'Table 2' },
    ]);
  });
  it('returns no items for empty input', () => {
    expect(linesToItems('').items).toEqual([]);
  });
  it('keeps a comma inside the content itself, splitting only on the last comma (P2-11)', () => {
    const { items } = linesToItems('https://example.com/?a=1,2,label3');
    expect(items[0].content).toBe('https://example.com/?a=1,2');
    expect(items[0].label).toBe('label3');
  });
  it('a stray quote on one line does not swallow the following lines (P2-11)', () => {
    const { items } = linesToItems('a "stray quote,Row A\nhttps://example.com/2,Row B\nhttps://example.com/3,Row C');
    expect(items).toHaveLength(3);
    expect(items[1].content).toBe('https://example.com/2');
    expect(items[2].content).toBe('https://example.com/3');
  });
  it('still honours quoted commas within a single pasted line', () => {
    const { items } = linesToItems('"hello, world",Greeting');
    expect(items[0]).toEqual({ content: 'hello, world', label: 'Greeting' });
  });
});
