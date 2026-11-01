// One run: picks each question, builds its options, scores answers and moves the chain.
// UI-agnostic, so the same code drives the app and the simulated learner in tests.

import { fakeReadings, shuffle } from './kana';
import { edgeKey, meaningKey, readingKey, type Graph, type LinkKey } from './graph';
import { infer, mastery, noteBest, record, SOLID, wordStatus, type Progress } from './progress';
import { isMove, type EdgeType, type QType, type ThemeId, type WordId } from './types';

export interface Option {
  id: string;
  label: string;
  /** Shown under the option once answered. */
  gloss: string;
  /** Hiragana for furigana, when the label is a word written in kanji or katakana. */
  reading?: string;
  correct: boolean;
}

export interface Question {
  q: QType;
  word: WordId;
  /** For 関/同/反: the word the chain moves to. */
  target?: WordId;
  key: LinkKey;
  options: Option[];
  /** A two-choice check right after a new word was shown. */
  check: boolean;
  /** The chain hit a dead end and restarted from another word. */
  jump: boolean;
}

export interface Answered {
  question: Question;
  picked: Option;
  correct: boolean;
  /** Set when the player missed a word they had never seen: show it before moving on. */
  peek?: WordId;
}

export interface RunSummary {
  theme: ThemeId;
  at: number;
  ms: number;
  asked: number;
  right: number;
  longest: number;
  learned: WordId[];
  missed: LinkKey[];
  before: number;
  after: number;
}

export interface SessionOptions {
  length: number;
  rng: () => number;
  /** Most unseen words a run may bring in. */
  maxNew?: number;
  now?: () => number;
}

/** How much a link wants to be asked, by box. Unseen links sit between box 1 and 2. */
const BOX_WEIGHT = [3, 2.6, 2, 1, 0.45, 0.2];
const UNSEEN_WEIGHT = 1.6;
/** Leaving the theme gets likelier as the theme is mastered. */
const DRIFT = 0.6;
/** Meanings and readings decide mastery, so they are favored right after the chain moves. */
const STAY_BOOST = 2.5;
/** Chance to accept a random distractor, by JLPT level distance from the right answer. */
const LEVEL_ACCEPT = [1, 0.5, 0.15, 0.05, 0.05];
/** Questions about one word in a run before the chain prefers others. */
const MAX_VISITS = 3;

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').trim();

export class Session {
  readonly history: Answered[] = [];
  question: Question | null = null;
  done = false;
  chain = 0;
  longest = 0;
  right = 0;

  private current: WordId;
  private readonly themeWords: Set<WordId>;
  private readonly asked = new Map<LinkKey, { at: number; correct: boolean }>();
  private readonly visited: WordId[] = [];
  /** Words met for the first time this run. */
  private readonly fresh = new Set<WordId>();
  private readonly learned = new Set<WordId>();
  private pendingCheck: { word: WordId; q: 'mean' | 'read' } | null = null;
  private lastStay: WordId | null = null;
  private readonly before: number;
  private readonly startedAt: number;
  private readonly maxNew: number;
  private readonly now: () => number;

  constructor(private readonly g: Graph, private readonly p: Progress, readonly theme: ThemeId, private readonly o: SessionOptions) {
    const t = g.themes.get(theme);
    if (!t) throw new Error(`unknown theme ${theme}`);
    this.themeWords = new Set(t.words.filter((w) => g.words.has(w)));
    this.maxNew = o.maxNew ?? 4;
    this.now = o.now ?? Date.now;
    this.startedAt = this.now();
    this.before = mastery(g, p, theme);
    this.current = this.pickStart();
    this.question = this.build(false);
  }

  get length() {
    return this.o.length;
  }

  answer(optionId: string): Answered {
    const q = this.question;
    if (!q) throw new Error('no question');
    const picked = q.options.find((x) => x.id === optionId);
    if (!picked) throw new Error(`no option ${optionId}`);
    const correct = picked.correct;
    const learn = q.target ?? q.word;
    const wasUnseen = wordStatus(this.g, this.p, learn) === 'unseen';

    // The two-choice check right after a new word is for learning, not measuring: a coin flip
    // would get it right half the time. A miss still counts.
    if (!(q.check && correct)) record(this.p, q.key, correct);
    this.asked.set(q.key, { at: this.history.length, correct });
    if (wasUnseen) this.fresh.add(learn);

    // Picking the right partner of a word you know well says you know the partner too.
    // Only then: a lucky guess from an unknown word must not earn free credit.
    if (correct && q.target && wordStatus(this.g, this.p, q.word) === 'solid') infer(this.p, meaningKey(q.target));

    if (correct) {
      this.chain += 1;
      this.right += 1;
      this.longest = Math.max(this.longest, this.chain);
    } else {
      this.chain = 0;
    }

    let peek: WordId | undefined;
    if (!correct && !q.check && wasUnseen) {
      peek = learn;
      this.learned.add(learn);
      this.pendingCheck = { word: learn, q: q.q === 'read' ? 'read' : 'mean' };
    }

    const entry: Answered = { question: q, picked, correct, peek };
    this.history.push(entry);
    if (isMove(q.q) && q.target) {
      this.visited.push(q.word);
      this.current = q.target;
      this.lastStay = null;
    } else {
      this.lastStay = q.word;
    }
    return entry;
  }

  /** Moves to the next question, or ends the run. A pending check may run one past the length. */
  next() {
    if (this.history.length >= this.o.length && !this.pendingCheck) {
      this.finish();
      return;
    }
    this.question = this.build(false);
  }

  summary(): RunSummary {
    const missed = [...this.asked.entries()].filter(([, v]) => !v.correct).map(([k]) => k);
    return {
      theme: this.theme,
      at: this.startedAt,
      ms: this.now() - this.startedAt,
      asked: this.history.length,
      right: this.right,
      longest: this.longest,
      learned: [...this.learned],
      missed,
      before: this.before,
      after: mastery(this.g, this.p, this.theme),
    };
  }

  private finish() {
    this.done = true;
    this.question = null;
    noteBest(this.p, this.g, this.theme);
  }

  // ---- choosing what to ask ----

  private linkWeight(key: LinkKey): number {
    const a = this.asked.get(key);
    if (a) {
      // A missed link may come back a few questions later; anything else waits for the next run.
      return !a.correct && this.history.length - a.at >= 3 ? 1.5 : 0.03;
    }
    const st = this.p.links[key];
    return st ? BOX_WEIGHT[st.box] : UNSEEN_WEIGHT;
  }

  private optionCount(key: LinkKey): number {
    const box = this.p.links[key]?.box;
    return box !== undefined && box >= SOLID ? 6 : 4;
  }

  private pickStart(): WordId {
    const words = [...this.themeWords];
    const seen = words.filter((w) => wordStatus(this.g, this.p, w) !== 'unseen');
    if (seen.length > 0) {
      const weights = seen.map((w) => {
        const boxes = this.g.ownLinks(w).map((k) => this.p.links[k]?.box ?? 1);
        return BOX_WEIGHT[Math.min(...boxes)];
      });
      return this.weighted(seen, weights);
    }
    // Nothing seen yet: start from the easiest words.
    const easiest = Math.max(...words.map((w) => this.g.word(w).jlpt ?? 0));
    return this.weighted(words.filter((w) => (this.g.word(w).jlpt ?? 0) === easiest), null);
  }

  private build(jumped: boolean): Question {
    if (this.pendingCheck) {
      const c = this.pendingCheck;
      this.pendingCheck = null;
      this.current = c.word;
      const q = this.makeStay(c.q, c.word, 2, true, false);
      if (q) return q;
    }

    const w = this.current;
    const inTheme = (x: WordId) => this.themeWords.has(x);
    const m = mastery(this.g, this.p, this.theme);
    const cands: { make: () => Question | null; weight: number }[] = [];

    // Alternate: after moving to a word, check that word; after a check, move on.
    // A word asked about often this run steps aside, so no word takes over a run.
    const visits = (x: WordId) => this.history.filter((h) => h.question.word === x).length;
    const tired = (x: WordId) => (visits(x) >= MAX_VISITS ? 0.08 : 1);
    const stayMult = (this.lastStay === w ? 0.15 : STAY_BOOST) * tired(w);
    if (inTheme(w) || this.lastStay !== w) {
      const stays: ('mean' | 'read')[] = this.g.hasReading(w) ? ['mean', 'read'] : ['mean'];
      for (const q of stays) {
        const key = q === 'mean' ? meaningKey(w) : readingKey(w);
        cands.push({ weight: this.linkWeight(key) * stayMult, make: () => this.makeStay(q, w, this.optionCount(key), false, jumped) });
      }
    }

    const recent = this.visited.slice(-2);
    for (const n of this.g.neighbors(w)) {
      let mult = tired(n.to);
      if (recent.includes(n.to)) mult *= 0.2;
      if (!inTheme(n.to)) {
        if (!inTheme(w)) continue; // at most one step outside the theme
        mult *= DRIFT * m;
      } else if (!inTheme(w)) {
        mult *= 2; // pull back in
      }
      if (wordStatus(this.g, this.p, n.to) === 'unseen' && this.fresh.size >= this.maxNew) continue;
      const key = edgeKey(n.type, w, n.to);
      const weight = this.linkWeight(key) * mult;
      if (weight <= 0) continue;
      cands.push({ weight, make: () => this.makeMove(n.type, w, n.to, this.optionCount(key), jumped) });
    }

    // Try candidates in weighted order until one can be built (some lack enough distractors).
    let pool = cands.filter((c) => c.weight > 0.05);
    if (pool.length === 0 && !jumped) return this.jump();
    if (pool.length === 0) pool = cands;
    while (pool.length > 0) {
      const pick = this.weighted(pool, pool.map((c) => c.weight));
      const q = pick.make();
      if (q) return q;
      pool = pool.filter((c) => c !== pick);
    }
    if (!jumped) return this.jump();
    // Last resort: a meaning question on whatever word we are on.
    return this.makeStay('mean', w, 4, false, true)!;
  }

  /** Dead end: restart the chain from a weak word of the theme that was not just visited. */
  private jump(): Question {
    const recent = new Set([...this.visited.slice(-3), this.current]);
    const words = [...this.themeWords].filter((w) => !recent.has(w));
    const weights = words.map((w) => {
      const keys = this.g.ownLinks(w);
      return Math.max(...keys.map((k) => this.linkWeight(k)));
    });
    this.current = words.length ? this.weighted(words, weights) : this.current;
    this.lastStay = null;
    return this.build(true);
  }

  // ---- building options ----

  private readonly meanings = new Map<WordId, Set<string>>();

  private meaningSet(w: WordId): Set<string> {
    let m = this.meanings.get(w);
    if (!m) {
      m = new Set(this.g.word(w).en.map(norm));
      this.meanings.set(w, m);
    }
    return m;
  }

  private enOverlap(a: WordId, b: WordId): boolean {
    const ma = this.meaningSet(a);
    for (const e of this.meaningSet(b)) if (ma.has(e)) return true;
    return false;
  }

  /** A short meaning for an option: the first gloss, plus the second when both fit. */
  private meaningLabel(w: WordId) {
    const short = (g: string) => (g.length > 28 ? g.replace(/\s*\(.*?\)\s*/g, ' ').trim() : g);
    const [a, b] = this.g.word(w).en.map(short);
    return b && a.length + b.length <= 26 ? `${a}, ${b}` : a;
  }

  private wordGloss(w: WordId) {
    const x = this.g.word(w);
    return x.kana && x.kana !== x.jp ? `${x.kana} · ${x.en[0]}` : x.en[0];
  }

  private wordOption(w: WordId, correct: boolean): Option {
    const x = this.g.word(w);
    return { id: w, label: x.jp, gloss: this.wordGloss(w), reading: x.kana, correct };
  }

  private makeStay(q: 'mean' | 'read', w: WordId, n: number, check: boolean, jump: boolean): Question | null {
    const word = this.g.word(w);
    if (q === 'read') {
      if (!word.kana) return null;
      const fakes = fakeReadings(word.kana, n - 1, this.o.rng);
      if (fakes.length === 0) return null;
      const options: Option[] = [
        { id: word.kana, label: word.kana, gloss: `${word.jp} · ${word.en[0]}`, correct: true },
        ...fakes.map((f) => ({ id: f, label: f, gloss: `not a reading of ${word.jp}`, correct: false })),
      ];
      return { q, word: w, key: readingKey(w), options: shuffle(options, this.o.rng), check, jump };
    }
    const solid = (this.p.links[meaningKey(w)]?.box ?? 0) >= SOLID;
    const ok = (d: WordId) => d !== w && this.g.edgeBetween(w, d) !== 'syn' && !this.enOverlap(w, d);
    const distractors = this.pickDistractors(ok, n - 1, solid ? (d) => this.g.sharesTheme(w, d) : null, w);
    if (distractors.length === 0) return null;
    const options: Option[] = [
      { id: w, label: this.meaningLabel(w), gloss: word.kana && word.kana !== word.jp ? `${word.jp} ${word.kana}` : word.jp, correct: true },
      ...distractors.map((d) => {
        const x = this.g.word(d);
        return { id: d, label: this.meaningLabel(d), gloss: x.kana && x.kana !== x.jp ? `${x.jp} ${x.kana}` : x.jp, correct: false };
      }),
    ];
    return { q, word: w, key: meaningKey(w), options: shuffle(options, this.o.rng), check, jump };
  }

  private makeMove(type: EdgeType, w: WordId, t: WordId, n: number, jump: boolean): Question | null {
    const ok = (d: WordId) => {
      if (d === w || d === t) return false;
      if (this.g.edgeBetween(w, d)) return false; // linked in any way: could be read as correct
      if (this.enOverlap(d, t) || this.enOverlap(d, w)) return false;
      if (type === 'rel' && this.g.sharesTheme(w, d)) return false;
      if (type === 'syn' && this.g.edgeBetween(t, d) === 'syn') return false;
      return true;
    };
    // Opposites and synonyms get harder distractors once known: related words that are not the answer.
    const hard = type !== 'rel' && (this.p.links[edgeKey(type, w, t)]?.box ?? 0) >= SOLID
      ? (d: WordId) => this.g.sharesTheme(w, d)
      : null;
    const distractors = this.pickDistractors(ok, n - 1, hard, t);
    if (distractors.length === 0) return null;
    const options = [this.wordOption(t, true), ...distractors.map((d) => this.wordOption(d, false))];
    return { q: type, word: w, target: t, key: edgeKey(type, w, t), options: shuffle(options, this.o.rng), check: false, jump };
  }

  /**
   * Up to n words passing `ok`, taken from `prefer` first when given. Two distractors never share a meaning.
   * Preferred words are few (a theme's neighbours), so they are checked in full; the rest of the
   * dictionary is sampled at random until enough pass, rather than filtering every word.
   */
  private pickDistractors(ok: (d: WordId) => boolean, n: number, prefer: ((d: WordId) => boolean) | null, like?: WordId): WordId[] {
    const out: WordId[] = [];
    const take = (d: WordId) => {
      if (out.length < n && !out.includes(d) && ok(d) && !out.some((x) => this.enOverlap(x, d))) out.push(d);
    };
    if (prefer) {
      const near = new Set<WordId>();
      for (const t of this.g.themeList) if (t.words.some((w) => prefer(w))) for (const w of t.words) if (prefer(w)) near.add(w);
      for (const d of shuffle([...near], this.o.rng)) take(d);
    }
    // Wrong options at the answer's level: an N1 word among N5 options gives itself away.
    const all = this.allWords ??= [...this.g.words.keys()];
    const level = (w: WordId) => this.g.word(w).jlpt ?? 1;
    const target = like ? level(like) : null;
    for (let tries = 0; out.length < n && tries < 600; tries++) {
      const d = all[Math.floor(this.o.rng() * all.length)];
      const gap = target === null ? 0 : Math.abs(level(d) - target);
      if (tries < 450 && this.o.rng() > (LEVEL_ACCEPT[gap] ?? 0.05)) continue;
      take(d);
    }
    return out;
  }

  private allWords: WordId[] | null = null;

  private weighted<T>(xs: T[], weights: number[] | null): T {
    if (!weights) return xs[Math.floor(this.o.rng() * xs.length)];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.o.rng() * total;
    for (let i = 0; i < xs.length; i++) {
      r -= weights[i];
      if (r <= 0) return xs[i];
    }
    return xs[xs.length - 1];
  }
}
