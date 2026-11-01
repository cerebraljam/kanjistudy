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

## Sources and licenses

JMdict (EDRDG, CC BY-SA 4.0) via jmdict-simplified; JLPT lists by Jonathan Waller (CC BY) via
yomitan-jlpt-vocab; example sentences from Tatoeba (CC BY 2.0 FR); wordfreq for frequencies.
The dataset is therefore CC BY-SA 4.0. Credits are shown in the app's Settings.
