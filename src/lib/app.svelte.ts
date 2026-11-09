// App-wide state: the save (progress, settings, custom themes) and the word graph.

import { useStudy } from './display';
import { Graph } from './graph';
import { withoutLoanwords } from './loanwords';
import { load, loadStudy, persist, persistStudy, recoverable, saveKey, STORAGE_KEY, type Save } from './storage';
import type { Dataset, Study, Theme, WordId } from './types';
import { toWordMap, type WordMap, type WordMapFile } from './wordmap';

// The dataset is its own file (public/data/dataset.json), so app updates do not re-download it
// and data updates do not re-download the app. __DATA_VERSION__ changes when the file does.
declare const __DATA_VERSION__: Record<Study, string>;
declare const __MAP_VERSION__: Record<Study, string>;

/** The language studied, chosen in Settings. Switching reloads the app with the other dataset and save. */
export const study: Study = loadStudy();
const KEY = saveKey(study);
const file = (name: string) => (study === 'ja' ? `./data/${name}.json` : `./data/${name}-${study}.json`);

export let dataset: Dataset = { version: 0, words: [], edges: [], themes: [] };

/**
 * The graph the app plays on: the dataset (less easy loanwords, if skipped), plus custom themes.
 * Custom themes keep only words still there (ids can change between data builds). Progress is
 * never touched: turning the skip off brings everything back as it was.
 */
function buildGraph(custom: Theme[], area: Theme | null, skipLoanwords: boolean) {
  const ds = skipLoanwords && study === 'ja' ? withoutLoanwords(dataset) : dataset;
  const has = new Set(ds.words.map((w) => w.id));
  const keep = (t: Theme) => ({ ...t, words: t.words.filter((w) => has.has(w)) });
  const kept = custom.map(keep).filter((t) => t.words.length > 0);
  const hidden = area ? [keep(area)].filter((t) => t.words.length > 0) : [];
  return new Graph({ ...ds, themes: [...ds.themes, ...kept] }, hidden);
}

/** Id of the theme made from a map area or a kanji ("Play words with 駅"): one slot, replaced each time. */
export const AREA_THEME = 'map-area';

const initial = load(localStorage, KEY);
// A first visit to the other language keeps the look already chosen.
if (study !== 'ja' && initial.settings.look === null) {
  const other = load(localStorage, STORAGE_KEY).settings;
  initial.settings.look = other.look;
  initial.settings.palette = other.palette;
}

export const app = $state<{ save: Save; graph: Graph; ready: boolean; error: string; saveFailed: boolean }>({
  save: initial,
  graph: new Graph(dataset),
  ready: false,
  error: '',
  /** The browser refused the last save (private window, storage blocked or full). */
  saveFailed: false,
});

/** A copy with progress set aside earlier, offered when the current save is empty. */
export const rescue = Object.keys(initial.progress.links).length === 0 ? (recoverable(localStorage, KEY)[0] ?? null) : null;

export async function loadData() {
  try {
    const res = await fetch(`${file('dataset')}?v=${__DATA_VERSION__[study]}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    dataset = (await res.json()) as Dataset;
    useStudy(dataset);
    rebuild();
    app.ready = true;
  } catch (err) {
    app.error = `Could not load the word list (${(err as Error).message}). Check the connection and reload.`;
  }
}

/** Rebuilds the graph after the dataset, custom themes or the area theme change. */
function rebuild() {
  const s = $state.snapshot(app.save) as Save;
  app.graph = buildGraph(s.customThemes, s.areaTheme, s.settings.skipLoanwords);
}

/** Writes the save to localStorage. Call after every change. */
export function save() {
  app.saveFailed = !persist($state.snapshot(app.save) as Save, localStorage, KEY);
}

export function replaceSave(next: Save) {
  app.save = next;
  rebuild();
  save();
}

export function addCustomTheme(t: Theme) {
  app.save.customThemes = [...app.save.customThemes.filter((x) => x.id !== t.id), t];
  rebuild();
  save();
}

export function removeCustomTheme(id: string) {
  app.save.customThemes = app.save.customThemes.filter((x) => x.id !== id);
  if (app.save.lastTheme === id) app.save.lastTheme = null;
  rebuild();
  save();
}

/** Makes the words around a map spot the "area" theme, ready to play. */
export function setAreaTheme(words: WordId[], jp: string, en: string) {
  app.save.areaTheme = { id: AREA_THEME, jp, en, words };
  rebuild();
  save();
}

let mapPromise: Promise<WordMap> | null = null;
/** The word positions, fetched the first time the map opens. */
export function loadMap(): Promise<WordMap> {
  return (mapPromise ??= fetch(`${file('map')}?v=${__MAP_VERSION__[study]}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json() as Promise<WordMapFile>;
    })
    .then((f) => toWordMap(f, dataset))
    .catch((e) => {
      mapPromise = null;
      throw e;
    }));
}

/** Studies the other language: its own words and its own progress. */
export function switchStudy(next: Study) {
  if (next === study) return;
  persistStudy(next);
  location.reload();
}

export function setSkipLoanwords(skip: boolean) {
  app.save.settings.skipLoanwords = skip;
  rebuild();
  save();
}

export const isCustom = (id: string) => app.save.customThemes.some((t) => t.id === id);
