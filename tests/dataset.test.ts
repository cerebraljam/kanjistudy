import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.json';
import { Graph } from '../src/lib/graph';
import { validate } from '../src/lib/validate';
import type { Dataset } from '../src/lib/types';

const ds = sample as Dataset;

describe('sample dataset', () => {
  it('has no errors', () => expect(validate(ds)).toEqual([]));

  it('every theme word can be reached by at least one link', () => {
    const g = new Graph(ds);
    const lonely = ds.words.filter((w) => g.neighbors(w.id).length === 0).map((w) => w.id);
    expect(lonely).toEqual([]);
  });

  it('catches broken data', () => {
    const broken: Dataset = {
      version: 1,
      words: [{ id: 'a', jp: '安全', en: ['safe'] }, { id: 'b', jp: 'バグ', kana: 'ばぐ', en: [] }],
      edges: [{ a: 'a', b: 'zz', type: 'rel' }, { a: 'a', b: 'a', type: 'syn' }],
      themes: [{ id: 't', jp: 'テ', en: 'T', words: ['a', 'missing'] }],
    };
    const errors = validate(broken).join('\n');
    expect(errors).toMatch(/kanji but no reading/);
    expect(errors).toMatch(/b has no meaning/);
    expect(errors).toMatch(/katakana; leave out its reading/);
    expect(errors).toMatch(/unknown word zz/);
    expect(errors).toMatch(/linked to itself/);
    expect(errors).toMatch(/unknown word missing/);
    expect(errors).toMatch(/b is in no theme/);
  });
});
