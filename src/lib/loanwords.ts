// Skipping easy loanwords (Settings): katakana words that sound like their English meaning
// (コンピューター), marked `loan` by the pipeline (pipeline/loanwords.py). False friends stay.

import type { Dataset } from './types';

/** A theme with fewer words left than this, once easy loanwords are skipped, is hidden. */
export const MIN_THEME = 6;

/**
 * The dataset without easy loanwords, their links, and the themes they made up (and so the words
 * only those themes had). A few words lose all their links: they still get meaning and reading
 * questions, and a run jumps on from them.
 */
export function withoutLoanwords(ds: Dataset): Dataset {
  const easy = new Set(ds.words.filter((w) => w.loan).map((w) => w.id));
  const themes = ds.themes.map((t) => ({ ...t, words: t.words.filter((w) => !easy.has(w)) })).filter((t) => t.words.length >= MIN_THEME);
  const keep = new Set(themes.flatMap((t) => t.words));
  return {
    ...ds,
    words: ds.words.filter((w) => keep.has(w.id)),
    edges: ds.edges.filter((e) => keep.has(e.a) && keep.has(e.b)),
    themes,
  };
}
