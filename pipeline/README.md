# Data pipeline

Builds `public/data/dataset.json`, the words, links and themes the app ships. Runs once before
deploying; the app itself never needs any of this.

```bash
npm run data         # fetch → vocab → embed → build (first run downloads ~250 MB of sources and a 2 GB model)
npm run candidates   # list candidate words for each theme in curation/themes.json
```

Needs [uv](https://docs.astral.sh/uv/). The embedding step uses the GPU when there is one
(PyTorch's CUDA 12.8 build: the default PyPI build crashes on WSL when it probes the GPU).

## Steps

| Script | Does | Writes |
|---|---|---|
| `fetch.py` | Downloads JMdict (+ example sentences) and the JLPT lists | `raw/` |
| `vocab.py` | Picks ~21,700 words: JLPT lists, frequent words, regular compounds (脆弱→脆弱性), `curation/extra-words.txt` | `build/vocab.json` |
| `embed.py` | Meaning vectors: each word (form, reading, meanings) with multilingual-e5-large. Used for synonyms | `build/embeddings.npy` |
| `topic.py` | Topic vectors from fastText (`raw/cc.ja.300.vec.gz`, 1.3 GB, CC BY-SA 3.0). Used for 関 links | `build/topic.npy` |
| `candidates.py` | For each theme facet, the closest words, for picking theme words | `build/candidates/<theme>.txt` |
| `build.py` | Themes from `curation/`, links inside each theme, hand fixes | `../public/data/dataset.json` |
| `map.py` | Fixed 2D position of every word (UMAP on topic vectors) and named areas, for the Map screen. Rerun after `build.py` | `../public/data/map.json` |
| `english.py` | The English dataset, for Japanese speakers (see below). Rerun after `map.py` | `../public/data/dataset-en.json`, `map-en.json` |

## Curation: what a person (or Claude) decides

Two kinds of vectors, two jobs. Meaning vectors (e5) find words that **mean** the same
(不具合 → 欠陥, 不都合). Topic vectors (fastText, learned from which words appear together) find words
that **belong together** (改札 → 駅員, 番線; 弁当 → おにぎり, 惣菜) and even do analogies
(男:女 :: 王:女王). Themes are still named by hand; vectors help fill and link them:

- `curation/themes.json`: each theme's names and facets (what the scenario covers).
- `curation/theme-words/<theme>.txt`: the words of a theme, picked from its candidates.
- `curation/extra-words.txt`: compounds to include that the frequency filter misses.
- `curation/meanings.txt`: meaning overrides when JMdict's first sense is the wrong one (ホーム = platform).
- `curation/edge-fixes.txt`: links to add (`+ 温める 電子レンジ`, `+反 乗る 降りる`) or remove (`- 箸 お釣り`).

`build.py` reports anything it cannot apply, and words left with too few links. `npm test` then
checks the dataset and plays runs in every theme.

## English for Japanese speakers

`english.py` mirrors the Japanese data instead of building a second one from scratch. Words come
from the CEFR-J and Octanove lists (A1–C2, `MAX_LEVEL`). Each gets Japanese meanings from JMdict
read backwards, and an anchor, the Japanese dataset word that translates it (train → 電車).
Through the anchors it inherits the Japanese themes (names swapped: English first) and their
関 links; JLPT lists and Japanese-grammar themes are left out. A word whose translation is not in
the dataset (象 for elephant) anchors in the larger vocabulary instead: no theme to inherit, so it
goes to a level list ("B2 nouns"), linked to the words closest in topic anywhere. Two English words on one anchor are synonyms when WordNet agrees (big, large → 大きい),
and WordNet adds opposites. The map places each word at its anchor's spot.

The reading question becomes a spelling question (綴): wrong spellings by the confusions Japanese
speakers meet (L/R first, then B/V, TH/S, silent letters, doubled consonants), none of them a real
word.

Curation, in `curation/en/`:

- `meanings.txt`: `step = 一歩; 段階; 手順` sets a word's meanings (and its anchor, the first meaning
  the Japanese dataset has).
- `theme-drops.txt`: `infosec step` takes a word out of a theme it reached through another sense.

## Sources and licenses

JMdict (EDRDG, CC BY-SA 4.0) via jmdict-simplified; JLPT lists by Jonathan Waller (CC BY) via
yomitan-jlpt-vocab; example sentences from Tatoeba (CC BY 2.0 FR); wordfreq for frequencies.
The dataset is therefore CC BY-SA 4.0. Credits are shown in the app's Settings.

English: the CEFR-J Wordlist 1.5 (Tono Laboratory, TUFS; free with citation) and the Octanove
Vocabulary Profile C1/C2 (CC BY-SA 4.0), both via
[olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj); WordNet for synonyms,
opposites and checking that a wrong spelling is not a real word.
