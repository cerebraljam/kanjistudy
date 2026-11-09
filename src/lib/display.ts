// What to show above and under words, given what the player can read.

import { hasKatakana, isKana, toHiragana, toRomaji } from './kana';
import type { Graph, LinkKey } from './graph';
import type { WordStatus } from './progress';
import type { Furigana, Settings } from './storage';
import { Q_META, SPELLING, type Dataset, type QType, type Theme, type ThemeId, type Word, type WordId } from './types';

/** Text to show above a word, or null. Never on the word a reading question is asking about. */
export function rubyFor(w: Word, status: WordStatus, s: Settings, hideForReading = false): string | null {
  if (hideForReading) return null;
  if (isKana(w.jp)) {
    if (hasKatakana(w.jp) && !s.katakana) return s.hiragana ? toHiragana(w.jp) : toRomaji(w.jp);
    if (!hasKatakana(w.jp) && !s.hiragana) return toRomaji(w.jp);
    return null;
  }
  if (!w.kana) return null;
  if (!wantsFurigana(s.furigana, status)) return null;
  return s.hiragana ? w.kana : toRomaji(w.kana);
}

const wantsFurigana = (f: Furigana, status: WordStatus) => f === 'always' || (f === 'auto' && status !== 'solid');

/** Romaji under a kana label (reading options), when the player does not read that script. */
export function romajiUnder(label: string, s: Settings): string | null {
  if (!isKana(label)) return null;
  const kata = hasKatakana(label);
  return (kata && !s.katakana) || (!kata && !s.hiragana) ? toRomaji(label) : null;
}

/** A reading as the player can read it. */
export const readingText = (kana: string, s: Settings) => (s.hiragana ? kana : toRomaji(kana));

/** Turns a link key into "from —glyph→ to" parts, for trails and weak-link lists. */
export function describeLink(g: Graph, key: LinkKey): { from: string; glyph: string; to: string } {
  const [kind, rest] = key.split(':');
  if (kind === 'm') {
    const w = g.word(rest);
    return { from: w.jp, glyph: Q_META.mean.glyph, to: w.en[0] };
  }
  if (kind === 'r') {
    const w = g.word(rest);
    return { from: w.spell ? w.en[0] : w.jp, glyph: Q_META.read.glyph, to: w.kana ?? w.jp };
  }
  const [a, b] = rest.split('~');
  return { from: g.word(a).jp, glyph: Q_META[kind as QType].glyph, to: g.word(b).jp };
}

let levelNames: string[] | null = null;
let studyLang: Dataset['lang'] = 'ja';

/** Sets up the labels of the language studied (CEFR levels, the spelling question for English). */
export function useStudy(ds: Dataset) {
  levelNames = ds.levels ?? null;
  studyLang = ds.lang ?? 'ja';
  if (ds.lang === 'en') Q_META.read = SPELLING;
}

/** A level's name: "N3", or the dataset's own ("B1"). 0 is "Other" for JLPT. */
export const levelName = (l: number) => (levelNames ? (levelNames[l] ?? '') : l ? `N${l}` : 'Other');

/** "N3"-style label from the average level of a theme's words. Words on no list count as N1. */
export function levelLabel(words: Word[]): string {
  if (words.length === 0) return '';
  const avg = words.reduce((a, w) => a + (w.jlpt ?? 1), 0) / words.length;
  return levelName(Math.min(5, Math.max(levelNames ? 0 : 1, Math.round(avg))));
}

/** A theme's name in the interface language (English for now): `en` when studying Japanese, `jp` when studying English. */
export const themeName = (t: Theme) => (studyLang === 'en' ? t.jp : t.en);

const plain = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').trim();

/**
 * Why two words are linked, in one short line, for after an answer: "Both in Medicine",
 * "Both mean 予約", "Often used together (Cooking methods, Kitchen)". Opposites need no reason.
 * `prefer` is the theme being played, named first when both words are in it.
 */
export function linkReason(g: Graph, a: WordId, b: WordId, prefer?: ThemeId): string | null {
  const type = g.edgeBetween(a, b);
  if (!type || type === 'ant') return null;
  const wa = g.word(a);
  const wb = g.word(b);
  if (type === 'syn') {
    const mb = new Set(wb.en.map(plain));
    const same = wa.en.find((m) => mb.has(plain(m)));
    return same ? `Both mean “${same}”` : null;
  }
  // Listed themes only: the map's area theme is not a reason anyone would recognise.
  const listed = (w: WordId) => g.themesOf(w).filter((id) => g.themeList.some((t) => t.id === id));
  const ta = listed(a);
  const tb = listed(b);
  const shared = ta.filter((t) => tb.includes(t));
  if (shared.length) {
    const id = prefer && shared.includes(prefer) ? prefer : shared[0];
    return `Both in ${themeName(g.themes.get(id)!)}`;
  }
  const names = [...new Set([ta[0], tb[0]].filter(Boolean).map((id) => themeName(g.themes.get(id)!)))];
  return names.length ? `Often used together (${names.join(', ')})` : 'Often used together';
}

/**
 * Lines a wrong typed answer up with the right one, character by character (longest common
 * subsequence): what matches, and what differs on each side. かいさく / かいさつ → the last kana.
 */
export function diffChars(typed: string, right: string): { typed: { ch: string; ok: boolean }[]; right: { ch: string; ok: boolean }[] } {
  const a = [...typed];
  const b = [...right];
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ta = a.map((ch) => ({ ch, ok: false }));
  const tb = b.map((ch) => ({ ch, ok: false }));
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      ta[i++].ok = true;
      tb[j++].ok = true;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return { typed: ta, right: tb };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
