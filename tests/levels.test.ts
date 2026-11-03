import { describe, expect, it } from 'vitest';
import { LEVEL_AT, levelFor, MAX_LEVEL, TABLE_WORDS } from '../src/lib/levels';

describe('levels', () => {
  it('start at 1 and reach 100 with every word', () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(TABLE_WORDS).level).toBe(MAX_LEVEL);
    expect(levelFor(TABLE_WORDS + 500)).toEqual({ level: MAX_LEVEL, toNext: 0, progress: 1 });
  });

  it('come quickly at first, then need more words each time', () => {
    expect(levelFor(1).level).toBe(2);
    expect(levelFor(25).level).toBeGreaterThanOrEqual(5);
    for (let l = 3; l <= MAX_LEVEL; l++) expect(LEVEL_AT[l] - LEVEL_AT[l - 1]).toBeGreaterThanOrEqual(LEVEL_AT[l - 1] - LEVEL_AT[l - 2]);
  });

  it('put the JLPT milestones where the design says', () => {
    expect(levelFor(645).level).toBe(22); // all of N5
    expect(levelFor(1263).level).toBe(31); // N5 + N4
  });

  it('report the words left to the next level', () => {
    const info = levelFor(LEVEL_AT[10] + 3);
    expect(info.level).toBe(10);
    expect(info.toNext).toBe(LEVEL_AT[11] - LEVEL_AT[10] - 3);
    expect(info.progress).toBeGreaterThan(0);
    expect(info.progress).toBeLessThan(1);
  });
});
