// The dataset the app ships, built by pipeline/build.py. Same checks as the sample, plus full runs in every theme.
import { describe, expect, it } from 'vitest';
import data from '../public/data/dataset.json';
import { Graph } from '../src/lib/graph';
import { seeded } from '../src/lib/kana';
import { emptyProgress } from '../src/lib/progress';
import { Session } from '../src/lib/session';
import type { Dataset } from '../src/lib/types';
import { validate } from '../src/lib/validate';

const ds = data as Dataset;
const g = new Graph(ds);

describe('shipped dataset', () => {
  it('has no errors', () => expect(validate(ds)).toEqual([]));

  it('every word has a link', () => {
    expect(ds.words.filter((w) => g.neighbors(w.id).length === 0).map((w) => w.jp)).toEqual([]);
  });

  // A fixed sample of themes keeps the suite fast; the hand-made pilots are always included.
  const pick = seeded(2026);
  const sample = ds.themes.filter((t, i) => i < 3 || pick() < 40 / ds.themes.length);
  for (const t of sample) {
    it(`plays valid runs in ${t.id}`, () => {
      const p = emptyProgress();
      for (let run = 0; run < 5; run++) {
        const rng = seeded(run);
        const s = new Session(g, p, t.id, { length: 20, rng: seeded(run + 99), now: () => 0 });
        while (!s.done) {
          const q = s.question!;
          expect(q.options.filter((o) => o.correct)).toHaveLength(1);
          expect(new Set(q.options.map((o) => o.label)).size).toBe(q.options.length);
          if (q.q === 'read') expect(g.word(q.word).noRead).not.toBe(true);
          if (q.target) for (const o of q.options.filter((x) => !x.correct)) expect(g.edgeBetween(q.word, o.id)).toBeUndefined();
          const pick = rng() < 0.7 ? q.options.find((o) => o.correct)! : q.options.find((o) => !o.correct)!;
          s.answer(pick.id);
          s.next();
        }
      }
    });
  }
});
