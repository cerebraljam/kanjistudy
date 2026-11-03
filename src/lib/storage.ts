// Saved state in localStorage, versioned so updates never wipe progress.
//
// To change the saved shape: bump SCHEMA, and add a migration from the previous
// version to MIGRATIONS. Old saves are upgraded step by step on load.

import { emptyProgress, type Progress } from './progress';
import type { RunSummary } from './session';
import type { Theme, ThemeId } from './types';

export type Furigana = 'auto' | 'always' | 'never';
export type Look = 'paper' | 'night' | 'arcade';

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
}

export interface Save {
  schema: number;
  progress: Progress;
  settings: Settings;
  runs: RunSummary[];
  lastTheme: ThemeId | null;
  /** Themes the player built from a search or imported as a word list. Kept on this device only. */
  customThemes: Theme[];
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
});

export const freshSave = (): Save => ({
  schema: SCHEMA,
  progress: emptyProgress(),
  settings: defaultSettings(),
  runs: [],
  lastTheme: null,
  customThemes: [],
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
  };
}

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Loads the save. A save that cannot be read is copied aside, never deleted. */
export function load(store: Store = localStorage): Save {
  const text = store.getItem(STORAGE_KEY);
  if (!text) return freshSave();
  try {
    return migrate(JSON.parse(text));
  } catch (err) {
    console.warn('kanjistudy: could not read the save, keeping a copy aside', err);
    store.setItem(`${STORAGE_KEY}.unreadable.${Date.now()}`, text);
    return freshSave();
  }
}

export function persist(save: Save, store: Store = localStorage) {
  save.runs = save.runs.slice(-MAX_RUNS);
  store.setItem(STORAGE_KEY, JSON.stringify(save));
}

export const exportSave = (save: Save) => JSON.stringify(save, null, 1);

/** Parses a backup file. Throws with a readable message when it is not one. */
export const importSave = (text: string): Save => migrate(JSON.parse(text));
