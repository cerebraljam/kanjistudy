// One run: picks each question, builds its options, scores answers and moves the chain.
// UI-agnostic, so the same code drives the app and the simulated learner in tests.

import { fakeReadings, shuffle, toKana } from './kana';
import { edgeKey, meaningKey, readingKey, type Graph, type LinkKey } from './graph';
import { infer, mastery, noteBest, record, SOLID, wordStatus, type Progress, confirm, neverMissed } from './progress';
import { isMove, type EdgeType, type QType, type ThemeId, type Word, type WordId } from './types';

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
  /** A word this answer made solid. */
  settled?: WordId;
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
  /** One entry per question, right or wrong, in order. */
  results?: boolean[];
  /** Solid words over the whole dataset before and after the run (for the level). */
  solidBefore?: number;
  solidAfter?: number;
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
/** A run is "on a roll" after ROLL_MIN answers with at least ROLL_ACCURACY right: known words then move faster. */
const ROLL_MIN = 6;
const ROLL_ACCURACY = 0.9;
/** On a roll, how much more the chain favors theme words not seen yet. */
const ROLL_NEW = 2.5;
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
  private readonly solidBefore: number;
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
    this.solidBefore = this.countSolid();
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
    return this.settle(q, picked);
  }

  /**
   * A typed answer to a reading (romaji or kana) or spelling question. Right counts exactly like
   * picking the right option; wrong is recorded with what was typed, shown in the trail.
   */
  answerTyped(text: string): Answered {
    const q = this.question;
    if (!q || q.q !== 'read') throw new Error('only readings and spellings are typed');
    const right = q.options.find((o) => o.correct)!;
    if (typedMatches(this.g.word(q.word), text)) return this.settle(q, right);
    // The label is what the trail shows: for Japanese, the typed romaji as kana.
    const raw = text.trim();
    const shown = (this.g.word(q.word).spell ? raw.toLowerCase() : toKana(raw)) || '—';
    return this.settle(q, { id: `typed:${raw}`, label: shown, gloss: 'what you typed', correct: false });
  }

  private settle(q: Question, picked: Option): Answered {
    const correct = picked.correct;
    const learn = q.target ?? q.word;
    const wasUnseen = wordStatus(this.g, this.p, learn) === 'unseen';
    const touched = q.target ? [q.word, q.target] : [q.word];
    const solidBefore = touched.map((w) => wordStatus(this.g, this.p, w) === 'solid');

    // The two-choice check right after a new word is for learning, not measuring: a coin flip
    // would get it right half the time. A miss still counts.
    const firstSight = !this.p.links[q.key];
    const roll = this.onARoll();
    if (!(q.check && correct)) record(this.p, q.key, correct);
    // On a roll, a link right on first sight is taken as known: no need to ask it twice.
    if (roll && correct && firstSight && !q.check) this.p.links[q.key].box = SOLID;
    this.asked.set(q.key, { at: this.history.length, correct });
    if (wasUnseen) this.fresh.add(learn);

    // Picking the right partner of a word you know well says you know the partner too.
    // Only then: a lucky guess from an unknown word must not earn free credit.
    if (correct && q.target && wordStatus(this.g, this.p, q.word) === 'solid') infer(this.p, meaningKey(q.target));

    // Fast track: meaning and reading both right first time (or never missed) make the word solid.
    // A kana-only word has no reading question: picking it right as a partner confirms its meaning.
    if (correct && !q.check) {
      if (q.q === 'mean' || q.q === 'read') {
        const own = this.g.ownLinks(q.word);
        if (own.length > 1) confirm(this.p, own);
      } else if (q.target && !wasUnseen) {
        confirm(this.p, [meaningKey(q.target)]);
      } else if (q.target && roll) {
        // Picking a never-asked word out of four as the right partner counts as a first-sight
        // answer for its meaning (not solid yet), but only while the run shows the player knows
        // this ground: for someone struggling, a right pick is too often a guess.
        record(this.p, meaningKey(q.target), true);
        this.p.links[meaningKey(q.target)].box = SOLID;
      }
    }

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

    const settled = touched.find((w, i) => !solidBefore[i] && wordStatus(this.g, this.p, w) === 'solid');
    const entry: Answered = { question: q, picked, correct, peek, settled };
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

  /** Theme words not solid yet, other than the current one. */
  private unsettled(): number {
    let n = 0;
    for (const w of this.themeWords) if (w !== this.current && wordStatus(this.g, this.p, w) !== 'solid') n++;
    return n;
  }

  /** The run so far shows easy ground: enough answers, nearly all right (two-choice checks aside). */
  private onARoll(): boolean {
    const counted = this.history.filter((h) => !h.question.check);
    return counted.length >= ROLL_MIN && counted.filter((h) => h.correct).length / counted.length >= ROLL_ACCURACY;
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
      results: this.history.map((h) => h.correct),
      solidBefore: this.solidBefore,
      solidAfter: this.countSolid(),
    };
  }

  /** Whether the run is going well enough for known words to count faster (shown in the UI). */
  get rolling(): boolean {
    return this.onARoll();
  }

  private countSolid(): number {
    let n = 0;
    for (const w of this.g.words.keys()) if (wordStatus(this.g, this.p, w) === 'solid') n++;
    return n;
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
    let stayCount = 0;
    if (inTheme(w) || this.lastStay !== w) {
      const stays: ('mean' | 'read')[] = this.g.hasReading(w) ? ['mean', 'read'] : ['mean'];
      for (const q of stays) {
        const key = q === 'mean' ? meaningKey(w) : readingKey(w);
        // Ask what is still unproven: a known meaning with an unasked reading wants the reading,
        // which settles the word in one question.
        const other = q === 'mean' ? readingKey(w) : meaningKey(w);
        const gap = stays.length > 1 && !this.p.links[key] && neverMissed(this.p, other) ? 3 : stays.length > 1 && neverMissed(this.p, key) && !this.p.links[other] ? 0.3 : 1;
        cands.push({ weight: this.linkWeight(key) * stayMult * gap, make: () => this.makeStay(q, w, this.optionCount(key), false, jumped) });
        stayCount++;
      }
    }

    // On a roll, new ground is worth more than re-checking words just proven.
    const roll = this.onARoll();
    const recent = this.visited.slice(-2);
    for (const n of this.g.neighbors(w)) {
      let mult = tired(n.to);
      if (roll && inTheme(n.to) && wordStatus(this.g, this.p, n.to) === 'unseen') mult *= ROLL_NEW;
      if (recent.includes(n.to)) mult *= 0.2;
      if (!inTheme(n.to)) {
        if (!inTheme(w)) continue; // at most one step outside the theme
        mult *= DRIFT * m;
      } else if (!inTheme(w)) {
        mult *= 2; // pull back in
      }
      // The new-word budget counts words actually being learned (missed and shown), not words
      // the player turned out to know already: those should flow freely.
      if (wordStatus(this.g, this.p, n.to) === 'unseen' && this.learned.size >= this.maxNew) continue;
      const key = edgeKey(n.type, w, n.to);
      const weight = this.linkWeight(key) * mult;
      if (weight <= 0) continue;
      cands.push({ weight, make: () => this.makeMove(n.type, w, n.to, this.optionCount(key), jumped) });
    }

    // Just arrived at a theme word that is not solid: usually ask about it (two times in three)
    // before moving on, so each move is followed up and the word can be settled.
    const stayCands = cands.slice(0, stayCount);
    const moveTotal = cands.slice(stayCount).reduce((a, c) => a + c.weight, 0);
    const stayTotal = stayCands.reduce((a, c) => a + c.weight, 0);
    if (this.lastStay !== w && inTheme(w) && wordStatus(this.g, this.p, w) !== 'solid' && stayTotal > 0 && stayTotal < 2 * moveTotal) {
      const k = (2 * moveTotal) / stayTotal;
      for (const c of stayCands) c.weight *= k;
    }

    // Try candidates in weighted order until one can be built (some lack enough distractors).
    let pool = cands.filter((c) => c.weight > 0.05);
    if (pool.length === 0 && !jumped) return this.jump();
    // Nothing near needs work (only solid links around) while the theme still has words that do:
    // usually jump there rather than circle through known words.
    const best = Math.max(...pool.map((c) => c.weight));
    if (!jumped && best <= BOX_WEIGHT[SOLID] * STAY_BOOST && this.o.rng() < 0.6 && this.unsettled() > 0) return this.jump();
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
    const roll = this.onARoll();
    const weights = words.map((w) => {
      const keys = this.g.ownLinks(w);
      const fresh = roll && wordStatus(this.g, this.p, w) === 'unseen' ? ROLL_NEW : 1;
      return Math.max(...keys.map((k) => this.linkWeight(k))) * fresh;
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
    if (!b) return a;
    return /[a-z]/i.test(a) ? (a.length + b.length <= 26 ? `${a}, ${b}` : a) : a.length + b.length <= 8 ? `${a}、${b}` : a;
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
    if (q === 'read' && word.spell) {
      const fakes = shuffle(word.spell, this.o.rng).slice(0, n - 1);
      if (fakes.length === 0) return null;
      const options: Option[] = [
        { id: word.jp, label: word.jp, gloss: word.en[0], correct: true },
        ...fakes.map((f) => ({ id: f, label: f, gloss: `not how ${word.jp} is spelled`, correct: false })),
      ];
      return { q, word: w, key: readingKey(w), options: shuffle(options, this.o.rng), check, jump };
    }
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
    // Close calls for 関: words from the same area (言葉 for 書く) make the player think about
    // the meaning, rather than rule out what looks far away.
    const close = type === 'rel' ? (d: WordId) => this.g.sharesCategory(w, d) || this.g.sharesCategory(t, d) : null;
    const distractors = this.pickDistractors(ok, n - 1, hard, t, close);
    if (distractors.length === 0) return null;
    const options = [this.wordOption(t, true), ...distractors.map((d) => this.wordOption(d, false))];
    return { q: type, word: w, target: t, key: edgeKey(type, w, t), options: shuffle(options, this.o.rng), check: false, jump };
  }

  /**
   * Up to n words passing `ok`. Two distractors never share a meaning. In order of preference:
   * - when the answer is a word the player has seen, other words they have seen: if only the answer
   *   looked familiar, "pick the one I recognise" would win without knowing anything;
   * - words passing `near` (a theme's neighbours, few enough to check in full);
   * - words passing `close` (a whole category, too many to list), found by sampling;
   * - any word, sampled at the answer's level: an N1 word among N5 options gives itself away.
   */
  private pickDistractors(
    ok: (d: WordId) => boolean,
    n: number,
    near: ((d: WordId) => boolean) | null,
    like?: WordId,
    close: ((d: WordId) => boolean) | null = null,
  ): WordId[] {
    const out: WordId[] = [];
    const take = (d: WordId) => {
      if (out.length < n && !out.includes(d) && ok(d) && !out.some((x) => this.enOverlap(x, d))) out.push(d);
    };
    const level = (w: WordId) => this.g.word(w).jlpt ?? 1;
    const target = like ? level(like) : null;
    const levelOk = (d: WordId) => target === null || this.o.rng() <= (LEVEL_ACCEPT[Math.abs(level(d) - target)] ?? 0.05);

    if (like && wordStatus(this.g, this.p, like) !== 'unseen') {
      const seen = shuffle(this.seenWords(), this.o.rng);
      const pref = near ?? close;
      if (pref) for (const d of seen) { if (out.length >= n) break; if (pref(d)) take(d); }
      for (const d of seen) { if (out.length >= n) break; if (levelOk(d)) take(d); }
    }
    if (near) {
      const set = new Set<WordId>();
      for (const t of this.g.themeList) if (t.words.some((w) => near(w))) for (const w of t.words) if (near(w)) set.add(w);
      for (const d of shuffle([...set], this.o.rng)) take(d);
    }
    const all = this.allWords ??= [...this.g.words.keys()];
    for (let tries = 0; out.length < n && tries < 600; tries++) {
      const d = all[Math.floor(this.o.rng() * all.length)];
      if (tries < 450 && !levelOk(d)) continue;
      if (close && tries < 300 && !close(d)) continue;
      take(d);
    }
    return out;
  }

  /** Words the player has met (their meaning has a record), refreshed as the run goes. */
  private seenWords(): WordId[] {
    const step = this.history.length;
    if (this.seenCache?.step !== step) {
      const words = Object.keys(this.p.links).filter((k) => k.startsWith('m:')).map((k) => k.slice(2)).filter((w) => this.g.words.has(w));
      this.seenCache = { step, words };
    }
    return this.seenCache.words;
  }

  private seenCache: { step: number; words: WordId[] } | null = null;

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

/** Whether a typed answer is the word's reading (Japanese, romaji or kana) or its spelling (English). */
export function typedMatches(w: Word, text: string): boolean {
  if (w.spell) return text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ') === w.jp;
  return !!w.kana && toKana(text) === w.kana;
}
