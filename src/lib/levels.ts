// Player level, from the number of solid words: 1 to 100, Lv 100 = every word in the app.
//
// Each level needs a few more words than the last (quadratic), so a beginner levels up in the
// first runs and the long tail of rare words fills the top levels:
// all of N5 ≈ Lv 22, N4 ≈ Lv 31, N3 ≈ Lv 46, N2 ≈ Lv 55, N1 ≈ Lv 66.
//
// The table is fixed: a data update that adds or removes words must not move anyone's level.
// If the dataset grows a lot, extend the table on purpose.

export const MAX_LEVEL = 100;
/** Words in the dataset when the table was set (2026-11). */
export const TABLE_WORDS = 13256;

/** LEVEL_AT[L] = solid words needed to reach level L. */
export const LEVEL_AT: number[] = (() => {
  const at = [0, 0];
  for (let l = 2; l <= MAX_LEVEL; l++) {
    const words = Math.round(TABLE_WORDS * ((l - 1) / (MAX_LEVEL - 1)) ** 2);
    at.push(Math.max(words, at[l - 1] + 1));
  }
  return at;
})();

export interface LevelInfo {
  level: number;
  /** Words still needed for the next level (0 at the top). */
  toNext: number;
  /** Progress through the current level, 0–1. */
  progress: number;
}

export function levelFor(solidWords: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && solidWords >= LEVEL_AT[level + 1]) level++;
  if (level === MAX_LEVEL) return { level, toNext: 0, progress: 1 };
  const from = LEVEL_AT[level];
  const to = LEVEL_AT[level + 1];
  return { level, toNext: to - solidWords, progress: (solidWords - from) / (to - from) };
}
