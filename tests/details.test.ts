import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kanjiIn, splitKun, wordsWith } from '../src/lib/details.svelte';
import { Graph } from '../src/lib/graph';
import type { Dataset } from '../src/lib/types';

describe('word details', () => {
  it('lists a word\'s kanji once each, without 々 or kana', () => {
    expect(kanjiIn('人々')).toEqual(['人']);
    expect(kanjiIn('地下鉄')).toEqual(['地', '下', '鉄']);
    expect(kanjiIn('食べ物')).toEqual(['食', '物']);
    expect(kanjiIn('コンビニ')).toEqual([]);
  });

  it('splits kun readings into reading and okurigana', () => {
    expect(splitKun('い.く')).toEqual(['い', 'く']);
    expect(splitKun('みち')).toEqual(['みち', '']);
  });

  it('finds the words written with a kanji, easiest first', () => {
    const g = new Graph({
      version: 1,
      words: [
        { id: 'a', jp: '鉄道', kana: 'てつどう', en: ['railway'], jlpt: 3 },
        { id: 'b', jp: '地下鉄', kana: 'ちかてつ', en: ['subway'], jlpt: 5 },
        { id: 'c', jp: '駅', kana: 'えき', en: ['station'], jlpt: 5 },
      ],
      edges: [],
      themes: [],
    });
    expect(wordsWith(g, '鉄')).toEqual(['b', 'a']);
    expect(wordsWith(g, '猫')).toEqual([]);
  });
});

const KANJI = 'public/data/kanji.json';
describe.runIf(existsSync(KANJI))('the shipped kanji file', () => {
  it('covers every kanji of the dataset', () => {
    const k = JSON.parse(readFileSync(KANJI, 'utf8')) as Record<string, [string[], string[], string[], number]>;
    const ds = JSON.parse(readFileSync('public/data/dataset.json', 'utf8')) as Dataset;
    const missing = [...new Set(ds.words.flatMap((w) => kanjiIn(w.jp)))].filter((c) => !k[c]);
    expect(missing).toEqual([]);
    expect(k['駅'][0]).toContain('エキ');
  });
});
