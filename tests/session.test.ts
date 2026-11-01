import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.json';
import { Graph } from '../src/lib/graph';
import { seeded } from '../src/lib/kana';
import { emptyProgress, type Progress } from '../src/lib/progress';
import { Session, type Question } from '../src/lib/session';
import type { Dataset } from '../src/lib/types';

const g = new Graph(sample as Dataset);

/** Plays a run, answering right with probability `skill`, and checks every question on the way. */
function play(theme: string, p: Progress, seed: number, skill: number, check: (q: Question, s: Session) => void) {
  const rng = seeded(seed);
  const s = new Session(g, p, theme, { length: 10, rng: seeded(seed + 1000), now: () => 0 });
  while (!s.done) {
    const q = s.question!;
    check(q, s);
    const right = q.options.find((o) => o.correct)!;
    const wrong = q.options.filter((o) => !o.correct);
    s.answer(rng() < skill ? right.id : wrong[Math.floor(rng() * wrong.length)].id);
    s.next();
  }
  return s;
}

function checkQuestion(q: Question) {
  expect(q.options.filter((o) => o.correct)).toHaveLength(1);
  expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length);
  expect(new Set(q.options.map((o) => o.label)).size).toBe(q.options.length);
  expect(q.options.length).toBeGreaterThanOrEqual(2);
  if (q.check) expect(q.options).toHaveLength(2);
  if (q.target) {
    expect(g.edgeBetween(q.word, q.target)).toBe(q.q);
    for (const o of q.options.filter((x) => !x.correct)) {
      // A distractor linked to the word could be argued correct.
      expect(g.edgeBetween(q.word, o.id), `${q.word} ${q.q} ${o.id}`).toBeUndefined();
      if (q.q === 'rel') expect(g.sharesTheme(q.word, o.id), `${q.word} rel ${o.id}`).toBe(false);
    }
  }
  if (q.q === 'mean') {
    for (const o of q.options.filter((x) => !x.correct)) expect(g.edgeBetween(q.word, o.id)).not.toBe('syn');
  }
}

describe('session', () => {
  for (const theme of g.themeList.map((t) => t.id)) {
    it(`builds valid questions in ${theme}`, () => {
      const p = emptyProgress();
      for (let run = 0; run < 15; run++) play(theme, p, run * 31 + theme.length, 0.7, checkQuestion);
    });
  }

  it('moves the chain to the right answer on 関/同/反', () => {
    play('infosec', emptyProgress(), 3, 0.5, () => {});
    const s = play('infosec', emptyProgress(), 4, 0.5, () => {});
    for (let i = 1; i < s.history.length; i++) {
      const prev = s.history[i - 1].question;
      const cur = s.history[i].question;
      if (prev.target && !cur.jump && !cur.check) expect(cur.word).toBe(prev.target);
    }
  });

  it('shows a missed unseen word, then checks it with two choices', () => {
    const p = emptyProgress();
    const s = new Session(g, p, 'incident', { length: 10, rng: seeded(9), now: () => 0 });
    const q = s.question!;
    const a = s.answer(q.options.find((o) => !o.correct)!.id);
    expect(a.peek).toBe(q.target ?? q.word);
    s.next();
    expect(s.question!.check).toBe(true);
    expect(s.question!.word).toBe(a.peek);
    expect(s.question!.options).toHaveLength(2);
  });

  it('does not repeat a link right after it was answered correctly', () => {
    const s = play('dev', emptyProgress(), 11, 1, () => {});
    const keys = s.history.map((h) => h.question.key);
    for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
  });

  it('summary reports the run', () => {
    const s = play('office', emptyProgress(), 5, 0.6, () => {});
    const sum = s.summary();
    expect(sum.asked).toBeGreaterThanOrEqual(10);
    expect(sum.right).toBe(s.history.filter((h) => h.correct).length);
    expect(sum.after).toBeGreaterThanOrEqual(0);
  });
});
