// Kana helpers: romaji, script detection, and plausible wrong readings.

const ROMAJI: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const SMALL_V = 'ぁぃぅぇぉ';

export function toHiragana(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

export const isKana = (s: string) => /^[ぁ-ゖァ-ヺー]+$/.test(s);
export const hasKatakana = (s: string) => /[ァ-ヺ]/.test(s);

/** Splits hiragana into morae: a kana plus any small kana attached to it. */
export function morae(kana: string): string[] {
  const out: string[] = [];
  for (const ch of kana) {
    if ((ch in SMALL_Y || SMALL_V.includes(ch)) && out.length > 0) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

function moraRomaji(m: string): string {
  const base = ROMAJI[m[0]] ?? m[0];
  if (m.length === 1) return base;
  const small = m[1];
  if (small in SMALL_Y) {
    const stem = base.slice(0, -1);
    const v = SMALL_Y[small];
    return stem === 'sh' || stem === 'ch' || stem === 'j' ? stem + v : stem + 'y' + v;
  }
  // ふぁ fa, てぃ ti, うぃ wi …
  const v = ROMAJI[small];
  if (m[0] === 'う') return 'w' + v;
  return base.replace(/[aeiou]$/, '') + v;
}

/** Wapuro-style romaji (long vowels kept as written: しゅうせい → shuusei). */
export function toRomaji(input: string): string {
  const ms = morae(toHiragana(input));
  let out = '';
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m === 'っ') {
      const next = i + 1 < ms.length ? moraRomaji(ms[i + 1]) : '';
      out += next.startsWith('ch') ? 't' : next[0] ?? '';
    } else if (m === 'ー') {
      out += out.match(/[aeiou]$/)?.[0] ?? '';
    } else if (m === 'ん') {
      const next = i + 1 < ms.length ? moraRomaji(ms[i + 1]) : '';
      out += /^[aeiouy]/.test(next) ? "n'" : 'n';
    } else {
      out += moraRomaji(m);
    }
  }
  return out;
}

// Voicing pairs used to make near-miss readings.
const VOICING: Record<string, string[]> = {};
for (const pair of 'かが きぎ くぐ けげ こご さざ しじ すず せぜ そぞ ただ てで とど はばぱ ひびぴ ふぶぷ へべぺ ほぼぽ'.split(' ')) {
  for (const ch of pair) VOICING[ch] = [...pair].filter((c) => c !== ch);
}
const YOON_FLIP: Record<string, string> = { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ' };
const SOKUON_BEFORE = /^[かきくけこさしすせそたちつてとぱぴぷぺぽ]/;

function singleMutations(kana: string): string[] {
  const ms = morae(kana);
  const out = new Set<string>();
  const join = (xs: string[]) => xs.join('');
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    // ゛/゜ on the first kana of the mora
    for (const alt of VOICING[m[0]] ?? []) {
      const c = ms.slice();
      c[i] = alt + m.slice(1);
      out.add(join(c));
    }
    // ょ ↔ よ
    if (m.length === 2 && m[1] in YOON_FLIP) {
      const c = ms.slice();
      c.splice(i, 1, m[0], YOON_FLIP[m[1]]);
      out.add(join(c));
    }
    // add or drop っ
    if (m === 'っ') out.add(join(ms.filter((_, k) => k !== i)));
    else if (i > 0 && ms[i - 1] !== 'っ' && ms[i - 1] !== 'ん' && SOKUON_BEFORE.test(m)) {
      const c = ms.slice();
      c.splice(i, 0, 'っ');
      out.add(join(c));
    }
    // long vowel: drop or add う / い
    const r = moraRomaji(m);
    const next = ms[i + 1];
    if (next === 'う' && /[ou]$/.test(r)) out.add(join(ms.filter((_, k) => k !== i + 1)));
    else if (next === 'い' && /e$/.test(r)) out.add(join(ms.filter((_, k) => k !== i + 1)));
    else if (/[ou]$/.test(r) && next !== 'う' && m !== 'ん' && m !== 'っ' && m !== 'う') {
      const c = ms.slice();
      c.splice(i + 1, 0, 'う');
      out.add(join(c));
    } else if (/e$/.test(r) && next !== 'い') {
      const c = ms.slice();
      c.splice(i + 1, 0, 'い');
      out.add(join(c));
    }
    // drop ん, or turn a final vowel into a long one with ん
    if (m === 'ん' && i > 0) out.add(join(ms.filter((_, k) => k !== i)));
  }
  out.delete(kana);
  return [...out];
}

/**
 * Plausible wrong readings: one or two small changes (voicing, っ, long vowel, ょ/よ).
 * `avoid` holds readings that must never appear (the real one, and its homophones if wanted).
 */
export function fakeReadings(kana: string, n: number, rng: () => number, avoid: Set<string> = new Set()): string[] {
  const bad = (s: string) => s === kana || avoid.has(s) || s.startsWith('っ') || s.startsWith('ん');
  let pool = singleMutations(kana).filter((s) => !bad(s));
  if (pool.length < n) {
    const seen = new Set(pool);
    for (const s of pool.slice()) for (const t of singleMutations(s)) if (!bad(t) && !seen.has(t)) { seen.add(t); pool.push(t); }
  }
  pool = shuffle(pool, rng);
  return pool.slice(0, n);
}

export function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Small deterministic RNG for tests and simulations. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- typing: romaji to kana, as a Japanese keyboard does ----

const TYPED: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  const rows: [string, string][] = [
    ['', 'あいうえお'], ['k', 'かきくけこ'], ['s', 'さしすせそ'], ['t', 'たちつてと'], ['n', 'なにぬねの'],
    ['h', 'はひふへほ'], ['m', 'まみむめも'], ['r', 'らりるれろ'], ['g', 'がぎぐげご'], ['z', 'ざじずぜぞ'],
    ['d', 'だぢづでど'], ['b', 'ばびぶべぼ'], ['p', 'ぱぴぷぺぽ'], ['x', 'ぁぃぅぇぉ'], ['l', 'ぁぃぅぇぉ'],
  ];
  for (const [c, kana] of rows) [...'aiueo'].forEach((v, i) => (t[c + v] = kana[i]));
  Object.assign(t, {
    ya: 'や', yu: 'ゆ', yo: 'よ', wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
    shi: 'し', chi: 'ち', tsu: 'つ', fu: 'ふ', ji: 'じ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ', ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
    xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', xtsu: 'っ', ltsu: 'っ', xtu: 'っ', ltu: 'っ',
    thi: 'てぃ', dhi: 'でぃ', "n'": 'ん', nn: 'ん',
  });
  // Contracted sounds: kya, sya, tya, nya, hya, mya, rya, gya, zya, dya, bya, pya; and cya, jya.
  const small: Record<string, string> = { a: 'ゃ', u: 'ゅ', o: 'ょ' };
  for (const [c, i] of Object.entries({ k: 'き', s: 'し', t: 'ち', c: 'ち', n: 'に', h: 'ひ', m: 'み', r: 'り', g: 'ぎ', z: 'じ', j: 'じ', d: 'ぢ', b: 'び', p: 'ぴ' }))
    for (const [v, y] of Object.entries(small)) t[`${c}y${v}`] ??= i + y;
  return t;
})();
const TYPED_PREFIXES = new Set(Object.keys(TYPED).flatMap((k) => [...k].map((_, i) => k.slice(0, i + 1))));

/**
 * Converts typed romaji to hiragana as it is typed: "kaisats" → { kana: "かいさ", pending: "ts" }.
 * Kana typed directly (a Japanese keyboard) pass through. A final "n" stays pending until it is
 * clear (なん → "nan" + "a" would be なな): toKana() settles it.
 */
export function typeKana(input: string): { kana: string; pending: string } {
  const s = input.toLowerCase();
  let kana = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (!/[a-z']/.test(c)) {
      kana += c === '-' ? 'ー' : c;
      i++;
      continue;
    }
    // A doubled consonant is っ: kitte, matcha.
    if (c === s[i + 1] && /[bcdfghjkmpqrstvwxyz]/.test(c) || (c === 't' && s[i + 1] === 'c')) {
      kana += 'っ';
      i++;
      continue;
    }
    // ん before a consonant (kanji, sanpo), however it is typed.
    if (c === 'n' && s[i + 1] && /[bcdfghjklmpqrstvwxz]/.test(s[i + 1])) {
      kana += 'ん';
      i++;
      continue;
    }
    let hit = '';
    for (let len = 4; len >= 1 && !hit; len--) if (TYPED[s.slice(i, i + len)]) hit = s.slice(i, i + len);
    if (hit) {
      kana += TYPED[hit];
      i += hit.length;
    } else if (TYPED_PREFIXES.has(s.slice(i))) {
      return { kana, pending: input.slice(i) };
    } else {
      kana += input[i];
      i++;
    }
  }
  return { kana, pending: '' };
}

/** A typed answer as hiragana, everything settled: a final n is ん, katakana become hiragana. */
export function toKana(input: string): string {
  const { kana, pending } = typeKana(input.trim());
  return toHiragana(kana + (pending.toLowerCase() === 'n' ? 'ん' : pending)).replace(/\s+/g, '');
}
