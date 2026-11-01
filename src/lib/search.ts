// Theme search without a model: match the query against theme names and word meanings,
// then grow a theme from the matching words along their links.

import { toHiragana } from './kana';
import type { Graph } from './graph';
import type { Theme, ThemeId, WordId } from './types';

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'at', 'with']);

/** Lowercased word stems: "engineering" → "engineer", "tests" → "test". Crude, but enough to match glosses. */
export function terms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9぀-ヿ一-鿿]+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => (/^[a-z]+$/.test(t) ? t.replace(/(ing|ers|er|ed|es|s)$/, '') || t : t));
}

function wordMatches(g: Graph, w: WordId, ts: string[]): boolean {
  const x = g.word(w);
  const hay = [x.jp, x.kana ?? '', ...x.en].join(' ').toLowerCase();
  return ts.some((t) => (t.length >= 3 || /[^\x00-\x7f]/.test(t)) && hay.includes(t));
}

export interface ThemeHit {
  theme: Theme;
  /** How many of its words match, plus a bonus when its name matches. */
  score: number;
}

export function searchThemes(g: Graph, q: string): ThemeHit[] {
  const ts = terms(q);
  if (ts.length === 0) return [];
  return g.themeList
    .map((theme) => {
      const name = `${theme.jp} ${theme.en}`.toLowerCase();
      const nameHit = ts.some((t) => name.includes(t)) ? 5 : 0;
      const wordHits = theme.words.filter((w) => g.words.has(w) && wordMatches(g, w, ts)).length;
      return { theme, score: nameHit + wordHits };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Words for a theme built from a search: words whose meaning matches, the words of
 * themes whose name matches, then their neighbors, up to `max`.
 */
export function buildFromSearch(g: Graph, q: string, max = 24): WordId[] {
  const ts = terms(q);
  if (ts.length === 0) return [];
  const seeds = new Set<WordId>();
  for (const w of g.words.keys()) if (wordMatches(g, w, ts)) seeds.add(w);
  for (const h of searchThemes(g, q)) {
    const name = `${h.theme.jp} ${h.theme.en}`.toLowerCase();
    if (ts.some((t) => name.includes(t))) for (const w of h.theme.words) seeds.add(w);
  }
  const out = [...seeds];
  for (let i = 0; i < out.length && out.length < max; i++) {
    for (const n of g.neighbors(out[i])) {
      if (out.length >= max) break;
      if (!out.includes(n.to)) out.push(n.to);
    }
  }
  return out.slice(0, max);
}

export interface ImportResult {
  words: WordId[];
  unmatched: string[];
}

/** Matches a pasted list (one word per line, or separated by commas or tabs) against the dictionary. */
export function importList(g: Graph, text: string): ImportResult {
  const byForm = new Map<string, WordId>();
  for (const w of g.words.values()) {
    byForm.set(w.jp, w.id);
    if (w.kana && !byForm.has(w.kana)) byForm.set(w.kana, w.id);
  }
  const words: WordId[] = [];
  const unmatched: string[] = [];
  // Several lines with separators look like a CSV export: one word per line, first field only.
  // Otherwise, any separator splits words.
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const csv = lines.length > 1 && lines.some((l) => /[,\t]/.test(l));
  const tokens = csv ? lines.map((l) => l.split(/[,\t]/)[0]) : text.split(/[\n,\t、]+/);
  for (const raw of tokens) {
    const token = raw.trim().replace(/^"|"$/g, '').split(/\s+/)[0];
    if (!token) continue;
    const id = byForm.get(token) ?? byForm.get(toHiragana(token));
    if (id) {
      if (!words.includes(id)) words.push(id);
    } else if (!unmatched.includes(token)) unmatched.push(token);
  }
  return { words, unmatched };
}

export function customThemeId(name: string, taken: (id: ThemeId) => boolean): ThemeId {
  const base = 'my-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'list');
  let id = base;
  for (let i = 2; taken(id); i++) id = `${base}-${i}`;
  return id;
}
