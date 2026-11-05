// Checks a dataset for errors that would confuse a player. Run by the tests on every dataset.

import { hasKatakana, isKana } from './kana';
import type { Dataset } from './types';

export function validate(ds: Dataset): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const byJp = new Map<string, string>();

  for (const w of ds.words) {
    if (ids.has(w.id)) errors.push(`duplicate word id ${w.id}`);
    ids.add(w.id);
    if (byJp.has(w.jp)) errors.push(`${w.id} and ${byJp.get(w.jp)} are both written ${w.jp}`);
    byJp.set(w.jp, w.id);
    if (!w.en.length || w.en.some((e) => !e.trim())) errors.push(`${w.id} has no meaning`);
    if (ds.lang === 'en') {
      if (!/^[a-z][a-z' -]*$/.test(w.jp)) errors.push(`${w.id} (${w.jp}) is not a plain English word`);
      if (w.kana !== undefined) errors.push(`${w.id} is English: no reading`);
      if (w.spell && (w.spell.includes(w.jp) || new Set(w.spell).size !== w.spell.length)) errors.push(`${w.id} has a wrong spelling that is the word, or one twice`);
      if (w.jlpt !== undefined && !(w.jlpt in (ds.levels ?? []))) errors.push(`${w.id} has level ${w.jlpt}, which has no name`);
      continue;
    }
    if (w.kana !== undefined && !/^[ぁ-ゖー]+$/.test(w.kana)) errors.push(`${w.id} reading ${w.kana} is not hiragana`);
    if (w.kana === undefined && !isKana(w.jp)) errors.push(`${w.id} (${w.jp}) has kanji but no reading`);
    if (w.kana !== undefined && hasKatakana(w.jp) && isKana(w.jp)) errors.push(`${w.id} is katakana; leave out its reading`);
    if (w.jlpt !== undefined && ![1, 2, 3, 4, 5].includes(w.jlpt)) errors.push(`${w.id} has JLPT level ${w.jlpt}`);
  }

  const pairs = new Map<string, string>();
  for (const e of ds.edges) {
    if (!ids.has(e.a)) errors.push(`edge to unknown word ${e.a}`);
    if (!ids.has(e.b)) errors.push(`edge to unknown word ${e.b}`);
    if (e.a === e.b) errors.push(`${e.a} is linked to itself`);
    const k = e.a < e.b ? `${e.a}~${e.b}` : `${e.b}~${e.a}`;
    if (pairs.has(k)) errors.push(`${k} is linked twice (${pairs.get(k)} and ${e.type})`);
    pairs.set(k, e.type);
  }

  const themeIds = new Set<string>();
  for (const t of ds.themes) {
    if (themeIds.has(t.id)) errors.push(`duplicate theme ${t.id}`);
    themeIds.add(t.id);
    if (t.words.length < 5) errors.push(`theme ${t.id} has only ${t.words.length} words`);
    for (const w of t.words) if (!ids.has(w)) errors.push(`theme ${t.id} lists unknown word ${w}`);
    if (new Set(t.words).size !== t.words.length) errors.push(`theme ${t.id} lists a word twice`);
  }

  const themed = new Set(ds.themes.flatMap((t) => t.words));
  for (const w of ds.words) if (!themed.has(w.id)) errors.push(`${w.id} is in no theme`);

  return errors;
}
