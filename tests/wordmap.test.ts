import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.json';
import { Graph } from '../src/lib/graph';
import type { Dataset } from '../src/lib/types';
import { areaLabel, clampCenter, idsHash, nearest, shortEn, toWordMap, wordLabel, ZOOM, type WordMap, type WordMapFile } from '../src/lib/wordmap';

const g = new Graph(sample as Dataset);

describe('word map math', () => {
  const m: WordMap = { ids: ['a', 'b', 'c', 'd'], x: Float32Array.from([0.1, 0.2, 0.9, 0.5]), y: Float32Array.from([0.1, 0.1, 0.9, 0.5]), areas: [] };

  it('finds the nearest words, nearest first', () => {
    expect(nearest(m, 0.12, 0.1, 2)).toEqual([0, 1]);
    expect(nearest(m, 1, 1, 1)).toEqual([2]);
    expect(nearest(m, 0.5, 0.5, 10)).toHaveLength(4);
  });

  it('keeps the close-up inside the map', () => {
    expect(clampCenter(0, ZOOM)).toBeCloseTo(0.5 / ZOOM);
    expect(clampCenter(1, ZOOM)).toBeCloseTo(1 - 0.5 / ZOOM);
    expect(clampCenter(0.5, ZOOM)).toBe(0.5);
  });

  it('shortens English labels', () => {
    expect(shortEn('limited express (train)')).toBe('limited express');
    expect(shortEn('a very long meaning that goes on').length).toBeLessThanOrEqual(18);
  });

  it('shows met words in Japanese and new words in English in mix mode', () => {
    const w = sample.words.find((x) => x.jp !== x.en[0])!;
    expect(wordLabel(g, w.id, 'unseen', 'mix')).toEqual({ text: shortEn(w.en[0]), jp: false });
    expect(wordLabel(g, w.id, 'shaky', 'mix')).toEqual({ text: w.jp, jp: true });
    expect(wordLabel(g, w.id, 'unseen', 'jp').jp).toBe(true);
    expect(wordLabel(g, w.id, 'solid', 'en').jp).toBe(false);
    const area = { theme: 't', jp: '駅', en: 'Station', x: 0, y: 0 };
    expect(areaLabel(area, false, 'mix').text).toBe('Station');
    expect(areaLabel(area, true, 'mix').text).toBe('駅');
  });
});

for (const [DATA, MAP] of [['public/data/dataset.json', 'public/data/map.json'], ['public/data/dataset-en.json', 'public/data/map-en.json']])
describe.runIf(existsSync(DATA) && existsSync(MAP))(`the shipped map ${MAP}`, () => {
  const ds = JSON.parse(readFileSync(DATA, 'utf8')) as Dataset;
  const file = JSON.parse(readFileSync(MAP, 'utf8')) as WordMapFile;

  it('matches the shipped word list (rerun pipeline/map.py, then english.py, after a data build)', async () => {
    expect(file.ids).toBe(await idsHash(ds.words.map((w) => w.id)));
    const m = await toWordMap(file, ds);
    expect(m.x.length).toBe(ds.words.length);
    for (let i = 0; i < m.x.length; i++) {
      expect(m.x[i]).toBeGreaterThanOrEqual(0);
      expect(m.x[i]).toBeLessThanOrEqual(1);
    }
    const themes = new Set(ds.themes.map((t) => t.id));
    expect(file.areas.length).toBeGreaterThanOrEqual(8);
    for (const a of file.areas) expect(themes.has(a.theme)).toBe(true);
  });

  it('puts related words close together', async () => {
    const m = await toWordMap(file, ds);
    const at = new Map(m.ids.map((id, i) => [id, i]));
    const dist = (a: string, b: string) => Math.hypot(m.x[at.get(a)!] - m.x[at.get(b)!], m.y[at.get(a)!] - m.y[at.get(b)!]);
    const rel = ds.edges.filter((e) => e.type === 'rel').slice(0, 2000);
    const linked = rel.reduce((s, e) => s + dist(e.a, e.b), 0) / rel.length;
    const random = rel.reduce((s, e, i) => s + dist(e.a, ds.words[(i * 7919) % ds.words.length].id), 0) / rel.length;
    expect(linked).toBeLessThan(random / 3);
  });
});
