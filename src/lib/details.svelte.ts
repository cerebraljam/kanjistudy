// The word details panel: what a word means, its links, and for Japanese each kanji's readings
// and the other words written with it. A bottom sheet on phones, a side panel on wide screens.
//
// It never helps with the question on screen: Play sets `asking` to the word being asked about
// until it is answered, and the panel hides what would give the answer away.

import type { Graph } from './graph';
import type { WordId } from './types';

declare const __KANJI_VERSION__: string;

export const details = $state<{
  /** The word shown, or null when closed. */
  word: WordId | null;
  /** The word of the unanswered question, if any. */
  asking: WordId | null;
  /** Set by Play while an answer waits for Continue: the sheet offers it, so closing costs no tap. */
  next: (() => void) | null;
  /** Wide screens: the panel sits beside the run and follows each answer. */
  docked: boolean;
}>({ word: null, asking: null, next: null, docked: false });

export const showWord = (id: WordId) => (details.word = id);
export const closeDetails = () => (details.word = null);

export interface KanjiInfo {
  on: string[];
  kun: string[];
  en: string[];
  strokes: number;
}

let kanjiPromise: Promise<Map<string, KanjiInfo>> | null = null;
/** Readings and meanings of each kanji (public/data/kanji.json, from KANJIDIC2), fetched on first use. */
export function loadKanji(): Promise<Map<string, KanjiInfo>> {
  return (kanjiPromise ??= fetch(`./data/kanji.json?v=${__KANJI_VERSION__}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json() as Promise<Record<string, [string[], string[], string[], number]>>;
    })
    .then((o) => new Map(Object.entries(o).map(([k, [on, kun, en, strokes]]) => [k, { on, kun, en, strokes }])))
    .catch((e) => {
      kanjiPromise = null;
      throw e;
    }));
}

/** The kanji of a word, each once, in order (々 repeats the one before: not a kanji of its own). */
export const kanjiIn = (text: string) => [...new Set([...text].filter((c) => c >= '一' && c <= '鿿'))];

const byKanji = new WeakMap<Graph, Map<string, WordId[]>>();
/** Words written with a kanji, easiest first. */
export function wordsWith(g: Graph, k: string): WordId[] {
  let index = byKanji.get(g);
  if (!index) {
    index = new Map();
    for (const w of g.words.values()) for (const c of kanjiIn(w.jp)) (index.get(c) ?? index.set(c, []).get(c)!).push(w.id);
    for (const ids of index.values()) ids.sort((a, b) => (g.word(b).jlpt ?? 0) - (g.word(a).jlpt ?? 0));
    byKanji.set(g, index);
  }
  return index.get(k) ?? [];
}

/** "い.く" → ["い", "く"]: the reading, and the okurigana that follows it in writing. */
export function splitKun(r: string): [string, string] {
  const [stem, oku = ''] = r.split('.');
  return [stem, oku];
}
