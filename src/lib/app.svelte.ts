// App-wide state: the save (progress, settings, custom themes) and the word graph.

import { Graph } from './graph';
import { load, persist, type Save } from './storage';
import type { Dataset, Theme } from './types';

// The dataset is its own file (public/data/dataset.json), so app updates do not re-download it
// and data updates do not re-download the app. __DATA_VERSION__ changes when the file does.
declare const __DATA_VERSION__: string;

export let dataset: Dataset = { version: 0, words: [], edges: [], themes: [] };
let known = new Set<string>();

/** Custom themes keep only words the current dataset still has (ids can change between data builds). */
function buildGraph(custom: Theme[]) {
  const kept = custom.map((t) => ({ ...t, words: t.words.filter((w) => known.has(w)) })).filter((t) => t.words.length > 0);
  return new Graph({ ...dataset, themes: [...dataset.themes, ...kept] });
}

const initial = load();

export const app = $state<{ save: Save; graph: Graph; ready: boolean; error: string }>({
  save: initial,
  graph: new Graph(dataset),
  ready: false,
  error: '',
});

export async function loadData() {
  try {
    const res = await fetch(`./data/dataset.json?v=${__DATA_VERSION__}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    dataset = (await res.json()) as Dataset;
    known = new Set(dataset.words.map((w) => w.id));
    app.graph = buildGraph(app.save.customThemes);
    app.ready = true;
  } catch (err) {
    app.error = `Could not load the word list (${(err as Error).message}). Check the connection and reload.`;
  }
}

/** Writes the save to localStorage. Call after every change. */
export function save() {
  persist($state.snapshot(app.save) as Save);
}

export function replaceSave(next: Save) {
  app.save = next;
  app.graph = buildGraph(next.customThemes);
  save();
}

export function addCustomTheme(t: Theme) {
  app.save.customThemes = [...app.save.customThemes.filter((x) => x.id !== t.id), t];
  app.graph = buildGraph($state.snapshot(app.save.customThemes) as Theme[]);
  save();
}

export function removeCustomTheme(id: string) {
  app.save.customThemes = app.save.customThemes.filter((x) => x.id !== id);
  if (app.save.lastTheme === id) app.save.lastTheme = null;
  app.graph = buildGraph($state.snapshot(app.save.customThemes) as Theme[]);
  save();
}

export const isCustom = (id: string) => app.save.customThemes.some((t) => t.id === id);
