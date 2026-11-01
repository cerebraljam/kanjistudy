import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.json';
import { Graph, meaningKey } from '../src/lib/graph';
import { emptyProgress, FIRST_SIGHT_BOX, mastery, record, SOLID, wordsToMaster } from '../src/lib/progress';
import type { Dataset } from '../src/lib/types';

const g = new Graph(sample as Dataset);

describe('record', () => {
  it('right on first sight lands below solid', () => {
    const p = emptyProgress();
    expect(record(p, 'k', true).box).toBe(FIRST_SIGHT_BOX);
    expect(FIRST_SIGHT_BOX).toBeLessThan(SOLID);
  });
  it('one more right makes it solid; a miss drops one box', () => {
    const p = emptyProgress();
    record(p, 'k', true);
    expect(record(p, 'k', true).box).toBe(SOLID);
    expect(record(p, 'k', false).box).toBe(SOLID - 1);
  });
  it('wrong on first sight is box 0', () => expect(record(emptyProgress(), 'k', false).box).toBe(0));
});

describe('theme math', () => {
  it('mastery is the share of solid words', () => {
    const p = emptyProgress();
    expect(mastery(g, p, 'konbini')).toBe(0);
    const words = g.themes.get('konbini')!.words;
    for (const k of g.ownLinks(words[0])) p.links[k] = { box: 5, n: 3, ok: 3, last: 0 };
    expect(mastery(g, p, 'konbini')).toBeCloseTo(1 / words.length);
    for (const w of words) for (const k of g.ownLinks(w)) p.links[k] = { box: 5, n: 3, ok: 3, last: 0 };
    expect(mastery(g, p, 'konbini')).toBe(1);
  });

  it('a word with a shaky reading is not solid', () => {
    const p = emptyProgress();
    p.links[meaningKey('kippu')] = { box: 5, n: 3, ok: 3, last: 0 };
    p.links['r:kippu'] = { box: 1, n: 3, ok: 1, last: 0 };
    expect(mastery(g, p, 'station')).toBe(0);
  });

  it('words to master shrinks as words become solid, and respects the goal', () => {
    const p = emptyProgress();
    const all = wordsToMaster(g, p, 'station', 1);
    const most = wordsToMaster(g, p, 'station', 0.8);
    expect(most.length).toBeLessThanOrEqual(all.length);
    for (const w of most.slice(0, -1)) for (const k of g.ownLinks(w)) p.links[k] = { box: 4, n: 2, ok: 2, last: 0 };
    expect(wordsToMaster(g, p, 'station', 0.8).length).toBe(1);
  });

  it('a word in two themes counts for both', () => {
    expect(g.themeLinks('infosec')).toContain(meaningKey('taisaku'));
    expect(g.themeLinks('incident')).toContain(meaningKey('taisaku'));
  });
});
