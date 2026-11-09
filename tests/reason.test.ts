import { describe, expect, it } from 'vitest';
import { linkReason } from '../src/lib/display';
import { Graph } from '../src/lib/graph';
import type { Dataset } from '../src/lib/types';

const ds: Dataset = {
  version: 1,
  words: [
    { id: 'eki', jp: '駅', kana: 'えき', en: ['station'] },
    { id: 'kippu', jp: '切符', kana: 'きっぷ', en: ['ticket'] },
    { id: 'ken', jp: '券', kana: 'けん', en: ['ticket', 'coupon'] },
    { id: 'tabi', jp: '旅', kana: 'たび', en: ['trip'] },
    { id: 'ue', jp: '上', kana: 'うえ', en: ['above'] },
    { id: 'shita', jp: '下', kana: 'した', en: ['below'] },
  ],
  edges: [
    { a: 'eki', b: 'kippu', type: 'rel' },
    { a: 'kippu', b: 'ken', type: 'syn' },
    { a: 'eki', b: 'tabi', type: 'rel' },
    { a: 'ue', b: 'shita', type: 'ant' },
  ],
  themes: [
    { id: 'station', jp: '駅', en: 'Station', words: ['eki', 'kippu', 'ken'] },
    { id: 'travel', jp: '旅行', en: 'Travel', words: ['tabi', 'ue', 'shita'] },
  ],
};
const g = new Graph(ds);

describe('why two words are linked', () => {
  it('names the theme they share', () => expect(linkReason(g, 'eki', 'kippu')).toBe('Both in Station'));
  it('names the meaning synonyms share', () => expect(linkReason(g, 'kippu', 'ken')).toBe('Both mean “ticket”'));
  it('explains links across themes', () => expect(linkReason(g, 'eki', 'tabi')).toBe('Often used together (Station, Travel)'));
  it('needs no reason for opposites, or for words not linked', () => {
    expect(linkReason(g, 'ue', 'shita')).toBeNull();
    expect(linkReason(g, 'eki', 'ue')).toBeNull();
  });
});

import { diffChars } from '../src/lib/display';
describe('typed answers, compared', () => {
  it('marks what differs', () => {
    const d = diffChars('かいさく', 'かいさつ');
    expect(d.typed.map((c) => c.ok)).toEqual([true, true, true, false]);
    expect(d.right.map((c) => c.ok)).toEqual([true, true, true, false]);
    const e = diffChars('recieve', 'receive');
    expect(e.right.filter((c) => !c.ok).length).toBe(1);
  });
});
