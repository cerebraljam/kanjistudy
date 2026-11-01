// A simulated learner plays many runs. This tunes the picker: does a theme get mastered in a
// reasonable number of runs, without the same word coming back over and over?
// Run with `npm run simulate` to see the table.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.json';
import { Graph, type LinkKey } from '../src/lib/graph';
import { seeded } from '../src/lib/kana';
import { emptyProgress, mastery } from '../src/lib/progress';
import { Session } from '../src/lib/session';
import type { Dataset, ThemeId } from '../src/lib/types';

const sampleGraph = new Graph(sample as Dataset);
const DATA = 'public/data/dataset.json';
/** Questions per run, as in the app's default (about two minutes). */
const RUN = 20;

interface Learner {
  name: string;
  /** Chance of already knowing a word, by JLPT level (0 = on no list). */
  knows: Record<number, number>;
  /** How much one answer with feedback teaches: after a miss, after a hit. */
  learnMiss: number;
  learnHit: number;
  /** Knowledge kept between runs (forgetting). */
  keep: number;
}

const LEARNERS: Learner[] = [
  // Roughly the author: N5/N4 known, a good part of N3, little N2/N1.
  { name: 'advanced', knows: { 5: 1, 4: 0.95, 3: 0.7, 2: 0.35, 1: 0.15, 0: 0.15 }, learnMiss: 0.45, learnHit: 0.15, keep: 0.97 },
  { name: 'beginner', knows: { 5: 0.6, 4: 0.3, 3: 0.1, 2: 0.02, 1: 0, 0: 0 }, learnMiss: 0.35, learnHit: 0.1, keep: 0.95 },
];

function simulate(l: Learner, theme: ThemeId, runs: number, seed: number, g: Graph = sampleGraph) {
  const rng = seeded(seed);
  const p = emptyProgress();
  const know = new Map<LinkKey, number>();
  const hits = new Map<LinkKey, number>();
  const start = (k: LinkKey, words: string[]) => {
    if (!know.has(k)) {
      const ps = words.map((w) => l.knows[g.word(w).jlpt ?? 0] ?? 0);
      know.set(k, rng() < Math.min(...ps) ? 0.95 : 0);
    }
    return know.get(k)!;
  };
  const rows: { run: number; mastery: number; knownWords: number; knows: number; right: number; maxSameWord: number; learned: number; offTheme: number }[] = [];
  for (let run = 1; run <= runs; run++) {
    const s = new Session(g, p, theme, { length: RUN, rng: seeded(seed * 100 + run), now: () => 0 });
    const seenWords = new Map<string, number>();
    let offTheme = 0;
    const themeWords = new Set(g.themes.get(theme)!.words);
    while (!s.done) {
      const q = s.question!;
      seenWords.set(q.word, (seenWords.get(q.word) ?? 0) + 1);
      if (!themeWords.has(q.word)) offTheme++;
      const words = q.target ? [q.word, q.target] : [q.word];
      const pk = start(q.key, words);
      const n = q.options.length;
      const correct = rng() < pk + (1 - pk) / n;
      const pick = correct ? q.options.find((o) => o.correct)! : q.options.filter((o) => !o.correct)[Math.floor(rng() * (n - 1))];
      const a = s.answer(pick.id);
      const learn = (k: LinkKey, rate: number) => {
        const cur = start(k, [k.slice(2)]);
        know.set(k, Math.min(0.97, cur + rate * (1 - cur)));
      };
      learn(q.key, correct ? l.learnHit : l.learnMiss);
      if (correct) hits.set(q.key, (hits.get(q.key) ?? 0) + 1);
      // Feedback shows the answer word's meaning; the new-word card shows meaning and reading.
      if (q.target) learn(`m:${q.target}`, l.learnHit);
      if (a.peek) for (const k of g.ownLinks(a.peek)) learn(k, l.learnMiss);
      s.next();
    }
    // Between runs, knowledge fades; each successful review makes it fade more slowly (spacing effect).
    for (const [k, v] of know) {
      if (v >= 0.9) continue;
      const h = hits.get(k) ?? 0;
      know.set(k, v * (1 - (1 - l.keep) / (1 + h)));
    }
    const sum = s.summary();
    // What the learner truly knows of the theme's meanings and readings, whatever the app thinks.
    const own = g.themes.get(theme)!.words.flatMap((w) => g.ownLinks(w));
    const knows = Math.round((own.reduce((a, k) => a + start(k, [k.slice(2)]), 0) / own.length) * 100);
    // Same unit as mastery: share of words whose meaning and reading the learner knows well.
    const tw = g.themes.get(theme)!.words;
    const knownWords = Math.round((tw.filter((w) => g.ownLinks(w).every((k) => start(k, [w]) >= 0.7)).length / tw.length) * 100);
    rows.push({ run, mastery: Math.round(mastery(g, p, theme) * 100), knownWords, knows, right: sum.right, maxSameWord: Math.max(...seenWords.values()), learned: sum.learned.length, offTheme });
  }
  return rows;
}

describe('simulated learners', () => {
  const g = sampleGraph;
  for (const l of LEARNERS) {
    for (const theme of ['infosec', 'incident']) {
      it(`${l.name} makes steady progress in ${theme}`, () => {
        const rows = simulate(l, theme, 30, 42);
        if (process.env.SHOW_SIM || process.argv.some((a) => a.includes('simulate'))) {
          console.log(`\n${l.name} / ${theme} (${g.themeLinks(theme).length} links)`);
          console.table(rows.filter((r) => r.run <= 5 || r.run % 5 === 0));
        }
        const firstAt = (pct: number) => rows.find((r) => r.mastery >= pct)?.run ?? Infinity;
        // A train-ride player should see real movement within a week of daily runs…
        expect(rows[6].mastery).toBeGreaterThan(rows[0].mastery);
        // …and an advanced learner should reach the default goal in about a month.
        if (l.name === 'advanced') expect(firstAt(80)).toBeLessThanOrEqual(30);
        // No word should dominate a run.
        expect(Math.max(...rows.map((r) => r.maxSameWord))).toBeLessThanOrEqual(6);
        // Progress must mean something: across all runs and several seeds (one is too noisy), the
        // app's mastery does not run ahead of what the learner really knows by more than 10 points.
        const all = [42, 7, 99, 1234, 5].flatMap((seed) => simulate(l, theme, 30, seed));
        const ahead = all.reduce((a, r) => a + (r.mastery - r.knownWords), 0) / all.length;
        if (process.env.SHOW_SIM) console.log(l.name, theme, `app ahead of real knowledge by ${ahead.toFixed(1)} points on average`);
        expect(ahead).toBeLessThanOrEqual(10);
      });
    }
  }
});

// The real data: someone who already knows N5 should not be held back on it.
describe.runIf(existsSync(DATA))('simulated learners on the real dataset', () => {
  const real = new Graph(JSON.parse(readFileSync(DATA, 'utf8')) as Dataset);
  it('an advanced learner masters an N5 theme they already know within about a week of runs', () => {
    const advanced = LEARNERS.find((l) => l.name === 'advanced')!;
    for (const theme of ['n5-verbs-1', 'n5-nouns-1']) {
      const rows = simulate(advanced, theme, 12, 42, real);
      const at = rows.find((r) => r.mastery >= 80)?.run ?? Infinity;
      if (process.env.SHOW_SIM) console.log(theme, 'mastery by run:', rows.map((r) => r.mastery).join(' '));
      expect(at).toBeLessThanOrEqual(10);
    }
  });
});
