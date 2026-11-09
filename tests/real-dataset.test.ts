// The datasets the app ships: Japanese (pipeline/build.py) and English (pipeline/english.py).
// Same checks as the sample, plus full runs in a sample of themes.
import { describe, expect, it } from 'vitest';
import ja from '../public/data/dataset.json';
import en from '../public/data/dataset-en.json';
import { Graph } from '../src/lib/graph';
import { seeded } from '../src/lib/kana';
import { emptyProgress } from '../src/lib/progress';
import { Session } from '../src/lib/session';
import type { Dataset } from '../src/lib/types';
import { validate } from '../src/lib/validate';
import { withoutLoanwords } from '../src/lib/loanwords';

const skipped = withoutLoanwords(ja as Dataset);
for (const [ds, name] of [[ja as Dataset, 'ja'], [skipped, 'ja, easy loanwords skipped'], [en as Dataset, 'en']] as const) describe(`shipped dataset (${name})`, () => {
  const g = new Graph(ds);

  it('has no errors', () => expect(validate(ds)).toEqual([]));

  it('every word has a link', () => {
    const alone = ds.words.filter((w) => g.neighbors(w.id).length === 0).map((w) => w.jp);
    // Skipping easy loanwords leaves a few words with no link left: few enough not to matter.
    if (ds === skipped) expect(alone.length).toBeLessThan(ds.words.length / 100);
    else expect(alone).toEqual([]);
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
          if (q.q === 'read' && ds.lang === 'en') expect(q.options.find((o) => o.correct)!.label).toBe(g.word(q.word).jp);
          if (q.target) for (const o of q.options.filter((x) => !x.correct)) expect(g.edgeBetween(q.word, o.id)).toBeUndefined();
          if (q.q === 'read' && rng() < 0.5) {
            // Typed: the reading (or spelling) itself must count as right, anything else as wrong.
            const w = g.word(q.word);
            const right = rng() < 0.7;
            expect(s.answerTyped(right ? (w.kana ?? w.jp) : 'zzz').correct).toBe(right);
          } else {
            const pick = rng() < 0.7 ? q.options.find((o) => o.correct)! : q.options.find((o) => !o.correct)!;
            s.answer(pick.id);
          }
          s.next();
        }
      }
    });
  }
});
