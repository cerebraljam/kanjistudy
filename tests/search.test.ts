import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.json';
import { Graph } from '../src/lib/graph';
import { buildFromSearch, customThemeId, importList, searchThemes, terms } from '../src/lib/search';
import type { Dataset } from '../src/lib/types';

const g = new Graph(sample as Dataset);

describe('search', () => {
  it('stems simple English', () => expect(terms('Software engineering tests')).toEqual(['software', 'engineer', 'test']));

  it('finds themes by name and by word meanings', () => {
    const hits = searchThemes(g, 'software');
    expect(hits[0].theme.id).toBe('dev');
    expect(searchThemes(g, 'bug').map((h) => h.theme.id)).toContain('incident');
  });

  it('builds a theme from a search, growing along links', () => {
    const words = buildFromSearch(g, 'software development');
    expect(words).toContain('jissou');
    expect(words.length).toBeGreaterThan(g.themes.get('dev')!.words.length);
    expect(words.length).toBeLessThanOrEqual(24);
  });

  it('finds nothing for noise', () => expect(buildFromSearch(g, 'a of the')).toEqual([]));
});

describe('importList', () => {
  it('matches kanji, kana and katakana, and reports the rest', () => {
    const r = importList(g, '脆弱性、ふぐあい, リリース\t存在しない語、脆弱性');
    expect(r.words).toEqual(['zeijakusei', 'fuguai', 'ririisu']);
    expect(r.unmatched).toEqual(['存在しない語']);
  });

  it('keeps only the first field of each CSV line', () => {
    const r = importList(g, '障害,しょうがい,outage\n"復旧",ふっきゅう,recovery\n');
    expect(r.words).toEqual(['shougai', 'fukkyuu']);
    expect(r.unmatched).toEqual([]);
  });

  it('makes unique ids', () => {
    expect(customThemeId('Work words', (id) => id === 'my-work-words')).toBe('my-work-words-2');
  });
});
