// What to show above and under words, given what the player can read.

import { hasKatakana, isKana, toHiragana, toRomaji } from './kana';
import type { Graph, LinkKey } from './graph';
import type { WordStatus } from './progress';
import type { Furigana, Settings } from './storage';
import { Q_META, type QType, type Word } from './types';

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
    return { from: w.jp, glyph: Q_META.read.glyph, to: w.kana ?? w.jp };
  }
  const [a, b] = rest.split('~');
  return { from: g.word(a).jp, glyph: Q_META[kind as QType].glyph, to: g.word(b).jp };
}

/** "N3"-style label from the average JLPT level of a theme's words. Words on no list count as N1. */
export function levelLabel(words: Word[]): string {
  if (words.length === 0) return '';
  const avg = words.reduce((a, w) => a + (w.jlpt ?? 1), 0) / words.length;
  return `N${Math.min(5, Math.max(1, Math.round(avg)))}`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
