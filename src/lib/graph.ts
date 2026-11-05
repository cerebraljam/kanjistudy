// Read-only index over a Dataset: lookups, neighbors, and the links each theme is scored on.

import { hasKatakana } from './kana';
import type { Dataset, EdgeType, Theme, ThemeId, Word, WordId } from './types';

export interface Neighbor {
  to: WordId;
  type: EdgeType;
}

/** A scored unit of knowledge: a word's meaning, its reading, or one edge. */
export type LinkKey = string;

export const meaningKey = (w: WordId): LinkKey => `m:${w}`;
export const readingKey = (w: WordId): LinkKey => `r:${w}`;
export const edgeKey = (type: EdgeType, a: WordId, b: WordId): LinkKey =>
  a < b ? `${type}:${a}~${b}` : `${type}:${b}~${a}`;

export class Graph {
  readonly words = new Map<WordId, Word>();
  readonly themes = new Map<ThemeId, Theme>();
  readonly themeList: Theme[];
  private readonly adj = new Map<WordId, Neighbor[]>();
  private readonly themesByWord = new Map<WordId, ThemeId[]>();
  private readonly categoriesByWord = new Map<WordId, Set<string>>();
  private readonly linksByTheme = new Map<ThemeId, LinkKey[]>();
  private readonly linksByWordInTheme = new Map<string, LinkKey[]>();

  /** `hidden` themes can be played and scored but are not listed (the map's "Play this area"). */
  constructor(readonly data: Dataset, hidden: Theme[] = []) {
    for (const w of data.words) {
      this.words.set(w.id, w);
      this.adj.set(w.id, []);
      this.themesByWord.set(w.id, []);
    }
    for (const e of data.edges) {
      this.adj.get(e.a)?.push({ to: e.b, type: e.type });
      this.adj.get(e.b)?.push({ to: e.a, type: e.type });
    }
    this.themeList = data.themes;
    for (const t of [...data.themes, ...hidden]) {
      this.themes.set(t.id, t);
      for (const w of t.words) {
        this.themesByWord.get(w)?.push(t.id);
        if (t.category && this.words.has(w)) {
          const c = this.categoriesByWord.get(w) ?? new Set<string>();
          c.add(t.category);
          this.categoriesByWord.set(w, c);
        }
      }
      this.indexThemeLinks(t);
    }
  }

  word(id: WordId): Word {
    const w = this.words.get(id);
    if (!w) throw new Error(`unknown word ${id}`);
    return w;
  }

  neighbors(id: WordId): Neighbor[] {
    return this.adj.get(id) ?? [];
  }

  edgeBetween(a: WordId, b: WordId): EdgeType | undefined {
    return this.neighbors(a).find((n) => n.to === b)?.type;
  }

  themesOf(id: WordId): ThemeId[] {
    return this.themesByWord.get(id) ?? [];
  }

  sharesTheme(a: WordId, b: WordId): boolean {
    const tb = this.themesOf(b);
    return this.themesOf(a).some((t) => tb.includes(t));
  }

  /** Whether the two words have a theme category in common (both in 言葉 themes, say). */
  sharesCategory(a: WordId, b: WordId): boolean {
    const ca = this.categoriesByWord.get(a);
    const cb = this.categoriesByWord.get(b);
    if (!ca || !cb) return false;
    for (const c of ca) if (cb.has(c)) return true;
    return false;
  }

  /** Words written in kanji get a reading question; pure-kana words do not. English words get a
   * spelling question when they have wrong spellings to offer. */
  hasReading(id: WordId): boolean {
    const w = this.word(id);
    if (w.spell) return w.spell.length >= 2;
    return !!w.kana && !w.noRead && !hasKatakana(w.jp) && w.kana !== w.jp;
  }

  /** Links that make up a theme's score: each word's meaning and reading, and edges inside the theme. */
  themeLinks(t: ThemeId): LinkKey[] {
    return this.linksByTheme.get(t) ?? [];
  }

  /** The links of a theme that involve one word. */
  wordLinksInTheme(t: ThemeId, w: WordId): LinkKey[] {
    return this.linksByWordInTheme.get(`${t}/${w}`) ?? [];
  }

  /** The word's own links (meaning, reading), independent of theme. */
  ownLinks(w: WordId): LinkKey[] {
    return this.hasReading(w) ? [meaningKey(w), readingKey(w)] : [meaningKey(w)];
  }

  private indexThemeLinks(t: Theme) {
    const inTheme = new Set(t.words);
    const all = new Set<LinkKey>();
    const add = (w: WordId, k: LinkKey) => {
      all.add(k);
      const key = `${t.id}/${w}`;
      const list = this.linksByWordInTheme.get(key) ?? [];
      if (!list.includes(k)) list.push(k);
      this.linksByWordInTheme.set(key, list);
    };
    for (const w of t.words) {
      if (!this.words.has(w)) continue;
      for (const k of this.ownLinks(w)) add(w, k);
      for (const n of this.neighbors(w)) {
        if (!inTheme.has(n.to)) continue;
        const k = edgeKey(n.type, w, n.to);
        add(w, k);
        add(n.to, k);
      }
    }
    this.linksByTheme.set(t.id, [...all]);
  }
}
