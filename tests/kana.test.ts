import { describe, expect, it } from 'vitest';
import { fakeReadings, morae, seeded, toHiragana, toKana, toRomaji, typeKana } from '../src/lib/kana';

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

describe('typing romaji', () => {
  it('turns romaji into hiragana', () => {
    for (const [typed, kana] of [
      ['kaisatsu', 'かいさつ'], ['kaisatu', 'かいさつ'], ['shinkansen', 'しんかんせん'], ['sinkansen', 'しんかんせん'],
      ['kitte', 'きって'], ['matcha', 'まっちゃ'], ['kyou', 'きょう'], ['jisho', 'じしょ'], ['zyugyou', 'じゅぎょう'],
      ['denwa', 'でんわ'], ['kin\'en', 'きんえん'], ['kinnen', 'きんえん'], ['konnnichiha', 'こんにちは'], ['hon', 'ほん'], ['sanpo', 'さんぽ'],
      ['fuyu', 'ふゆ'], ['huyu', 'ふゆ'], ['chotto', 'ちょっと'], ['KAISATSU', 'かいさつ'], ['かいさつ', 'かいさつ'], ['カイサツ', 'かいさつ'],
    ]) expect(toKana(typed), typed).toBe(kana);
  });

  it('keeps an unfinished syllable pending while typing', () => {
    expect(typeKana('kaisats')).toEqual({ kana: 'かいさ', pending: 'ts' });
    expect(typeKana('hon')).toEqual({ kana: 'ほ', pending: 'n' });
    expect(typeKana('kan')).toEqual({ kana: 'か', pending: 'n' });
  });
});
