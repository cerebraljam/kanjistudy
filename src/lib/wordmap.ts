// The vocabulary map: every word at a fixed position (computed by pipeline/map.py), colored by the
// player's progress. This module loads the positions and holds the math the Map screen uses.

import type { Graph } from './graph';
import type { WordStatus } from './progress';
import type { MapLabels } from './storage';
import type { Dataset, WordId } from './types';

export type { MapLabels };

export interface MapArea {
  theme: string;
  jp: string;
  en: string;
  x: number;
  y: number;
}

export interface WordMapFile {
  version: number;
  /** Hash of the dataset's word ids: a map made for another data build is ignored. */
  ids: string;
  grid: number;
  x: number[];
  y: number[];
  areas: MapArea[];
}

/** Positions in 0–1, in dataset word order. */
export interface WordMap {
  ids: WordId[];
  x: Float32Array;
  y: Float32Array;
  areas: (MapArea & { fx: number; fy: number })[];
}

export async function idsHash(ids: WordId[]): Promise<string> {
  const bytes = new TextEncoder().encode(ids.join('\n'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function toWordMap(file: WordMapFile, ds: Dataset): Promise<WordMap> {
  const ids = ds.words.map((w) => w.id);
  if (file.x.length !== ids.length || (await idsHash(ids)) !== file.ids) throw new Error('the map was made for another version of the word list');
  const g = file.grid;
  return {
    ids,
    x: Float32Array.from(file.x, (v) => v / g),
    y: Float32Array.from(file.y, (v) => v / g),
    areas: file.areas.map((a) => ({ ...a, fx: a.x / g, fy: a.y / g })),
  };
}

/** Indices of the k words nearest to (px, py), nearest first. */
export function nearest(m: WordMap, px: number, py: number, k: number): number[] {
  const best: { i: number; d: number }[] = [];
  for (let i = 0; i < m.ids.length; i++) {
    const dx = m.x[i] - px;
    const dy = m.y[i] - py;
    const d = dx * dx + dy * dy;
    if (best.length < k) {
      best.push({ i, d });
      if (best.length === k) best.sort((a, b) => a.d - b.d);
    } else if (d < best[k - 1].d) {
      let j = k - 1;
      while (j > 0 && best[j - 1].d > d) j--;
      best.splice(j, 0, { i, d });
      best.pop();
    }
  }
  return best.sort((a, b) => a.d - b.d).map((b) => b.i);
}

/** A short English label: the first meaning, without notes in parentheses. */
export function shortEn(en: string): string {
  const s = en.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^to /, 'to ').trim();
  return s.length > 18 ? `${s.slice(0, 17).trimEnd()}…` : s;
}

/**
 * Japanese or English, by the player's choice. "mix": words met already (learning or solid) in
 * Japanese, words not met yet in English, so a beginner can still read the map and every word
 * learned turns Japanese.
 */
export function wordLabel(g: Graph, w: WordId, status: WordStatus, mode: MapLabels): { text: string; jp: boolean } {
  const word = g.word(w);
  const jp = mode === 'jp' || (mode === 'mix' && status !== 'unseen');
  return jp ? { text: word.jp, jp: true } : { text: shortEn(word.en[0]), jp: false };
}

/** Area labels: in "mix", Japanese once the area's theme is mastered. */
export function areaLabel(a: MapArea, mastered: boolean, mode: MapLabels): { text: string; jp: boolean } {
  const jp = mode === 'jp' || (mode === 'mix' && mastered);
  return jp ? { text: a.jp, jp: true } : { text: a.en, jp: false };
}

/** The map has two zoom levels: everything, and one close-up. */
export const ZOOM = 6;

/** Keeps the close-up's center so the view never leaves the map. */
export function clampCenter(c: number, scale: number): number {
  const half = 0.5 / scale;
  return Math.min(1 - half, Math.max(half, c));
}
