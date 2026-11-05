// Saved state in localStorage, versioned so updates never wipe progress.
//
// To change the saved shape: bump SCHEMA, and add a migration from the previous
// version to MIGRATIONS. Old saves are upgraded step by step on load.

import { emptyProgress, type Progress } from './progress';
import type { RunSummary } from './session';
import type { Theme, ThemeId } from './types';

export type Furigana = 'auto' | 'always' | 'never';
export type Look = 'paper' | 'night' | 'arcade';
export type MapLabels = 'en' | 'mix' | 'jp';

export interface Settings {
  hiragana: boolean;
  katakana: boolean;
  furigana: Furigana;
  /** Share of a theme's links that must be solid for it to count as mastered. */
  goal: number;
  runLength: number;
  autoAdvance: boolean;
  palette: 'green-red' | 'blue-orange';
  /** Chosen on the first visit; null until then (the app follows the device's light/dark setting). */
  look: Look | null;
  /** Map labels: all English, all Japanese, or "mix" (words met in Japanese, the rest in English). */
  mapLabels: MapLabels;
}

export interface Save {
  schema: number;
  progress: Progress;
  settings: Settings;
  runs: RunSummary[];
  lastTheme: ThemeId | null;
  /** Themes the player built from a search or imported as a word list. Kept on this device only. */
  customThemes: Theme[];
  /** When a backup file was last downloaded (ms), shown in Settings. */
  backupAt: number | null;
  /** The last area picked on the map: playable, not listed with the themes. */
  areaTheme: Theme | null;
}

export const SCHEMA = 1;
export const STORAGE_KEY = 'kanjistudy';
const MAX_RUNS = 200;

export const defaultSettings = (): Settings => ({
  hiragana: true,
  katakana: true,
  furigana: 'auto',
  goal: 0.8,
  runLength: 20,
  autoAdvance: true,
  palette: 'green-red',
  look: null,
  mapLabels: 'mix',
});

export const freshSave = (): Save => ({
  schema: SCHEMA,
  progress: emptyProgress(),
  settings: defaultSettings(),
  runs: [],
  lastTheme: null,
  customThemes: [],
  backupAt: null,
  areaTheme: null,
});

/** MIGRATIONS[n] upgrades a save from schema n to n + 1. */
const MIGRATIONS: Record<number, (old: any) => any> = {};

/** Upgrades and repairs any parsed save. Throws if it is not a save at all. */
export function migrate(raw: unknown): Save {
  if (!raw || typeof raw !== 'object' || typeof (raw as any).schema !== 'number') throw new Error('not a save');
  let s: any = raw;
  if (s.schema > SCHEMA) throw new Error(`save is from a newer version (schema ${s.schema})`);
  while (s.schema < SCHEMA) {
    const step = MIGRATIONS[s.schema];
    if (!step) throw new Error(`no migration from schema ${s.schema}`);
    s = { ...step(s), schema: s.schema + 1 };
  }
  // Fill in anything missing, so new settings get their defaults.
  const base = freshSave();
  return {
    schema: SCHEMA,
    progress: { ...base.progress, ...s.progress },
    settings: { ...base.settings, ...s.settings },
    runs: Array.isArray(s.runs) ? s.runs.slice(-MAX_RUNS) : [],
    lastTheme: s.lastTheme ?? null,
    customThemes: Array.isArray(s.customThemes) ? s.customThemes : [],
    backupAt: typeof s.backupAt === 'number' ? s.backupAt : null,
    areaTheme: s.areaTheme && Array.isArray(s.areaTheme.words) ? s.areaTheme : null,
  };
}

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  readonly length?: number;
  key?(i: number): string | null;
}

/**
 * Loads the save. Nothing is ever deleted:
 * - a save that cannot be read is copied aside (`kanjistudy.unreadable.<time>`);
 * - before a save is upgraded to a newer schema, the old one is copied (`kanjistudy.schema<n>`),
 *   so a faulty migration can be undone.
 */
export function load(store: Store = localStorage): Save {
  let text: string | null;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch (err) {
    // Storage blocked (cookies disabled for the site, some private modes): play without saving.
    console.warn('kanjistudy: storage is not available', err);
    return freshSave();
  }
  if (!text) return freshSave();
  try {
    const raw = JSON.parse(text);
    if (raw && typeof raw.schema === 'number' && raw.schema < SCHEMA) {
      const key = `${STORAGE_KEY}.schema${raw.schema}`;
      if (!store.getItem(key)) store.setItem(key, text);
    }
    return migrate(raw);
  } catch (err) {
    console.warn('kanjistudy: could not read the save, keeping a copy aside', err);
    try {
      store.setItem(`${STORAGE_KEY}.unreadable.${Date.now()}`, text);
    } catch {
      /* full or blocked: the original stays under its key until the next save */
    }
    return freshSave();
  }
}

/** Writes the save. Returns false when the browser refused (storage full or blocked). */
export function persist(save: Save, store: Store = localStorage): boolean {
  save.runs = save.runs.slice(-MAX_RUNS);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch (err) {
    console.warn('kanjistudy: could not save', err);
    return false;
  }
}

/**
 * Copies set aside by load(), newest first, that still hold progress: offered for restoring
 * when the current save is empty.
 */
export function recoverable(store: Store = localStorage): { key: string; save: Save; links: number }[] {
  const out: { key: string; save: Save; links: number }[] = [];
  try {
    const n = store.length ?? 0;
    for (let i = 0; i < n; i++) {
      const key = store.key?.(i);
      if (!key || !key.startsWith(`${STORAGE_KEY}.`)) continue;
      try {
        const save = migrate(JSON.parse(store.getItem(key) ?? ''));
        const links = Object.keys(save.progress.links).length;
        if (links > 0) out.push({ key, save, links });
      } catch {
        /* still unreadable */
      }
    }
  } catch {
    /* storage blocked */
  }
  return out.sort((a, b) => b.links - a.links);
}

export const exportSave = (save: Save) => JSON.stringify(save, null, 1);

/** Parses a backup file. Throws with a readable message when it is not one. */
export const importSave = (text: string): Save => migrate(JSON.parse(text));
