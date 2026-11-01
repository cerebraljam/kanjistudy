import { describe, expect, it } from 'vitest';
import { fakeReadings, morae, seeded, toHiragana, toRomaji } from '../src/lib/kana';

describe('toRomaji', () => {
  it.each([
    ['しゅうせい', 'shuusei'],
    ['じっそう', 'jissou'],
    ['ちょうさ', 'chousa'],
    ['しゅっちょう', 'shutchou'],
    ['げんいん', "gen'in"],
    ['ぜいじゃくせい', 'zeijakusei'],
    ['パスワード', 'pasuwaado'],
    ['ウイルス', 'uirusu'],
    ['ファイル', 'fairu'],
    ['きっぷ', 'kippu'],
  ])('%s → %s', (kana, ro) => expect(toRomaji(kana)).toBe(ro));
});

describe('kana basics', () => {
  it('converts katakana to hiragana', () => expect(toHiragana('バグ')).toBe('ばぐ'));
  it('keeps small kana with their mora', () => expect(morae('しゅっちょう')).toEqual(['しゅ', 'っ', 'ちょ', 'う']));
});

describe('fakeReadings', () => {
  const words = ['ぜいじゃくせい', 'ふぐあい', 'たいさく', 'しよう', 'きっぷ', 'ふくろ', 'ぶか', 'ちえん'];
  it.each(words)('makes distinct near-misses for %s', (kana) => {
    const fakes = fakeReadings(kana, 5, seeded(1));
    expect(fakes.length).toBeGreaterThanOrEqual(3);
    expect(fakes).not.toContain(kana);
    expect(new Set(fakes).size).toBe(fakes.length);
    for (const f of fakes) {
      expect(f).toMatch(/^[ぁ-ゖ]+$/);
      expect(f[0]).not.toBe('っ');
    }
  });
  it('is deterministic for a seed', () => {
    expect(fakeReadings('ふぐあい', 3, seeded(7))).toEqual(fakeReadings('ふぐあい', 3, seeded(7)));
  });
});
