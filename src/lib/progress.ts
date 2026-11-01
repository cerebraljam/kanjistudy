// What the player knows: one strength box per link, and the theme math built on it.

import type { Graph, LinkKey } from './graph';
import type { ThemeId, WordId } from './types';

/** Leitner-style box: 0 = just missed … 5 = very solid. SOLID and above count as known. A miss drops one box. */
export interface LinkStat {
  box: number;
  /** Times asked, and times right. */
  n: number;
  ok: number;
  /** Recent accuracy, 0–1: a running average where each new answer counts for RECENT_WEIGHT. */
  acc?: number;
  /** Global question counter when last asked. */
  last: number;
}

export interface Progress {
  links: Record<LinkKey, LinkStat>;
  /** Global question counter, across runs. */
  step: number;
  /** Best mastery reached per theme, to spot themes that are slipping. */
  best: Record<ThemeId, number>;
}

export const SOLID = 3;
export const MAX_BOX = 5;
/** Right on first sight: probably already known, but a 1-in-4 guess is possible, so not solid yet. */
export const FIRST_SIGHT_BOX = 2;

export const emptyProgress = (): Progress => ({ links: {}, step: 0, best: {} });

export function record(p: Progress, key: LinkKey, correct: boolean): LinkStat {
  const prev = p.links[key];
  p.step += 1;
  let box: number;
  if (!prev) box = correct ? FIRST_SIGHT_BOX : 0;
  else box = correct ? Math.min(MAX_BOX, prev.box + 1) : Math.max(0, prev.box - 1);
  const hit = correct ? 1 : 0;
  const acc = prev && prev.n > 0 ? recentAccuracy(prev) * (1 - RECENT_WEIGHT) + hit * RECENT_WEIGHT : hit;
  const next: LinkStat = { box, n: (prev?.n ?? 0) + 1, ok: (prev?.ok ?? 0) + hit, acc, last: p.step };
  p.links[key] = next;
  return next;
}

export const boxOf = (p: Progress, key: LinkKey): number | undefined => p.links[key]?.box;

/** Right often enough lately, once asked a few times: a lucky streak alone does not make a link solid. */
export const MIN_ACCURACY = 0.7;
export const RECENT_WEIGHT = 0.35;

/** Saves from before `acc` existed fall back to lifetime accuracy. */
const recentAccuracy = (st: LinkStat) => st.acc ?? (st.n > 0 ? st.ok / st.n : 1);

export function isSolid(p: Progress, key: LinkKey): boolean {
  const st = p.links[key];
  if (!st || st.box < SOLID) return false;
  return st.n < 3 || recentAccuracy(st) >= MIN_ACCURACY;
}

export type WordStatus = 'unseen' | 'shaky' | 'solid';

/** A word's status from its own links (meaning, reading). */
export function wordStatus(g: Graph, p: Progress, w: WordId): WordStatus {
  const keys = g.ownLinks(w);
  if (keys.every((k) => !p.links[k])) return 'unseen';
  return keys.every((k) => isSolid(p, k)) ? 'solid' : 'shaky';
}

/** A word's status inside a theme, counting its theme edges too. */
export function wordStatusInTheme(g: Graph, p: Progress, t: ThemeId, w: WordId): WordStatus {
  const keys = g.wordLinksInTheme(t, w);
  if (keys.every((k) => !p.links[k])) return 'unseen';
  return keys.every((k) => isSolid(p, k)) ? 'solid' : 'shaky';
}

/** Share of a theme's words that are solid (meaning and reading both known). */
export function mastery(g: Graph, p: Progress, t: ThemeId): number {
  const words = g.themes.get(t)?.words ?? [];
  if (words.length === 0) return 0;
  return words.filter((w) => wordStatus(g, p, w) === 'solid').length / words.length;
}

/** How far a word is from solid: the sum of missing boxes over its own links. */
function distance(g: Graph, p: Progress, w: WordId): number {
  return g.ownLinks(w).reduce((d, k) => d + Math.max(0, SOLID - (p.links[k]?.box ?? -1)), 0);
}

/** The fewest words to make solid for the theme to reach `goal`, closest to solid first. */
export function wordsToMaster(g: Graph, p: Progress, t: ThemeId, goal: number): WordId[] {
  const words = g.themes.get(t)?.words ?? [];
  const needed = Math.ceil(goal * words.length - 1e-9);
  const solid = words.filter((w) => wordStatus(g, p, w) === 'solid');
  if (solid.length >= needed) return [];
  return words
    .filter((w) => !solid.includes(w))
    .sort((a, b) => distance(g, p, a) - distance(g, p, b))
    .slice(0, needed - solid.length);
}

/**
 * Credit without asking: a meaning never asked before is set just below solid.
 * Used when a 関/同/反 answer shows the player knows both words.
 */
export function infer(p: Progress, key: LinkKey) {
  if (!p.links[key]) p.links[key] = { box: FIRST_SIGHT_BOX, n: 0, ok: 0, last: p.step };
}

/** Links of a theme that were asked and are still weak, weakest first. */
export function weakLinks(g: Graph, p: Progress, t: ThemeId, limit = 5): { key: LinkKey; stat: LinkStat }[] {
  return g.themeLinks(t)
    .filter((k) => p.links[k] && p.links[k].box < SOLID)
    .map((k) => ({ key: k, stat: p.links[k] }))
    .sort((a, b) => a.stat.box - b.stat.box || a.stat.ok / a.stat.n - b.stat.ok / b.stat.n)
    .slice(0, limit);
}

export function noteBest(p: Progress, g: Graph, t: ThemeId) {
  const m = mastery(g, p, t);
  if (m > (p.best[t] ?? 0)) p.best[t] = m;
}
