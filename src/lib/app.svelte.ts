// App-wide state: the save (progress, settings, custom themes) and the word graph.

import { Graph } from './graph';
import { load, persist, recoverable, type Save } from './storage';
import type { Dataset, Theme, WordId } from './types';
import { toWordMap, type WordMap, type WordMapFile } from './wordmap';

// The dataset is its own file (public/data/dataset.json), so app updates do not re-download it
// and data updates do not re-download the app. __DATA_VERSION__ changes when the file does.
declare const __DATA_VERSION__: string;
declare const __MAP_VERSION__: string;

export let dataset: Dataset = { version: 0, words: [], edges: [], themes: [] };
let known = new Set<string>();

/** Custom themes keep only words the current dataset still has (ids can change between data builds). */
function buildGraph(custom: Theme[], area: Theme | null) {
  const keep = (t: Theme) => ({ ...t, words: t.words.filter((w) => known.has(w)) });
  const kept = custom.map(keep).filter((t) => t.words.length > 0);
  const hidden = area ? [keep(area)].filter((t) => t.words.length > 0) : [];
  return new Graph({ ...dataset, themes: [...dataset.themes, ...kept] }, hidden);
}

/** Id of the theme made from a map area: one slot, replaced each time. */
export const AREA_THEME = 'map-area';

const initial = load();

export const app = $state<{ save: Save; graph: Graph; ready: boolean; error: string; saveFailed: boolean }>({
  save: initial,
  graph: new Graph(dataset),
  ready: false,
  error: '',
  /** The browser refused the last save (private window, storage blocked or full). */
  saveFailed: false,
});

/** A copy with progress set aside earlier, offered when the current save is empty. */
export const rescue = Object.keys(initial.progress.links).length === 0 ? (recoverable()[0] ?? null) : null;

export async function loadData() {
  try {
    const res = await fetch(`./data/dataset.json?v=${__DATA_VERSION__}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    dataset = (await res.json()) as Dataset;
    known = new Set(dataset.words.map((w) => w.id));
    rebuild();
    app.ready = true;
  } catch (err) {
    app.error = `Could not load the word list (${(err as Error).message}). Check the connection and reload.`;
  }
}

/** Rebuilds the graph after the dataset, custom themes or the area theme change. */
function rebuild() {
  const s = $state.snapshot(app.save) as Save;
  app.graph = buildGraph(s.customThemes, s.areaTheme);
}

/** Writes the save to localStorage. Call after every change. */
export function save() {
  app.saveFailed = !persist($state.snapshot(app.save) as Save);
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
  return (mapPromise ??= fetch(`./data/map.json?v=${__MAP_VERSION__}`)
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

export const isCustom = (id: string) => app.save.customThemes.some((t) => t.id === id);
