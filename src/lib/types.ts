// Shapes shared by the dataset (static, built before deploy) and the app.

export type WordId = string;
/** The language studied: Japanese (the original app) or English, for Japanese speakers. */
export type Study = 'ja' | 'en';
export type ThemeId = string;

/** Question types. 関/同/反 move the chain to the answer; 意/読 stay on the word. */
export type QType = 'rel' | 'syn' | 'ant' | 'mean' | 'read';
export type EdgeType = 'rel' | 'syn' | 'ant';

/**
 * A word of the language studied. The field names come from the Japanese dataset; in the English
 * dataset (lang "en") `jp` is the English word and `en` its meanings in Japanese. In both, `jp` is
 * the studied language and `en` the learner's.
 */
export interface Word {
  id: WordId;
  /** Written form, as shown to the player. */
  jp: string;
  /** Reading in hiragana. Omitted for words written only in kana. */
  kana?: string;
  /** Meanings in the learner's language, most common first. */
  en: string[];
  /** Level, 5 the easiest: JLPT N5–N1, or for English A1 (5) to C2 (0). Omitted when on no list. */
  jlpt?: number;
  /** Katakana that sounds like its English meaning (コンピューター): left out when the player skips those. */
  loan?: boolean;
  /** English only: wrong spellings for the spelling question (綴). */
  spell?: string[];
  /** Optional example sentence and its translation. */
  ex?: { jp: string; en: string };
  /** The written form has several common readings (生, 行く): no reading question. */
  noRead?: boolean;
}

/** An undirected link between two words. */
export interface Edge {
  a: WordId;
  b: WordId;
  type: EdgeType;
}

export interface Theme {
  id: ThemeId;
  jp: string;
  en: string;
  /** 暮らし daily life · 仕事 work · 社会 society · 考え ideas · 言葉 the language itself. */
  category?: string;
  words: WordId[];
}

/** Theme categories, in display order. */
export const CATEGORIES: { id: string; en: string }[] = [
  { id: '暮らし', en: 'Daily life' },
  { id: '仕事', en: 'Work' },
  { id: '社会', en: 'Society' },
  { id: '考え', en: 'Ideas' },
  { id: '言葉', en: 'Language' },
];

export interface Dataset {
  version: number;
  /** The language studied. Japanese when omitted. */
  lang?: Study;
  /** Level names by `jlpt` value, when not JLPT: ["C2", "C1", "B2", "B1", "A2", "A1"]. */
  levels?: string[];
  /** Where the words come from, e.g. "JMdict 3.6.2+20261026". */
  source?: string;
  words: Word[];
  edges: Edge[];
  themes: Theme[];
}

export const Q_META: Record<QType, { glyph: string; label: string; prompt: string }> = {
  rel: { glyph: '関', label: 'Related', prompt: 'Which is most related?' },
  syn: { glyph: '同', label: 'Synonym', prompt: 'Which means the same?' },
  ant: { glyph: '反', label: 'Opposite', prompt: 'Which is the opposite?' },
  mean: { glyph: '意', label: 'Meaning', prompt: 'What does it mean?' },
  read: { glyph: '読', label: 'Reading', prompt: 'How is it read?' },
};

/** In English, the reading question is a spelling question. Applied by useStudy(). */
export const SPELLING = { glyph: '綴', label: 'Spelling', prompt: 'Which spelling is right?' };

export const MOVES: QType[] = ['rel', 'syn', 'ant'];
export const isMove = (q: QType) => q === 'rel' || q === 'syn' || q === 'ant';
