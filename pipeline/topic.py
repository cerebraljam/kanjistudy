"""Step 2b: topic vectors from fastText (trained on Japanese Common Crawl and Wikipedia).

The e5 embeddings (embed.py) place words by meaning: good for synonyms. fastText learned from
which words appear together, so it places words by topic: 改札 is near 駅員, 番線, 自販機.
That is what 関 links need.

Compounds fastText does not know (脆弱性) get a weighted average of their parts, rarer parts
weighing more (脆弱 counts more than 性): otherwise every X性 would cluster with every other X性.
Writes build/topic.npy (float16, unit length, vocab.json order; zero rows for words not covered)
and build/topic-composed.npy (True for vectors built from parts: never used as theme names).
"""

import gzip
import json
from pathlib import Path

import numpy as np
from wordfreq import tokenize, zipf_frequency

HERE = Path(__file__).parent
RAW = HERE / "raw"
BUILD = HERE / "build"
SOURCE = RAW / "cc.ja.300.vec.gz"
URL = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ja.300.vec.gz"  # CC BY-SA 3.0


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing {SOURCE}: download {URL} (1.3 GB) into raw/")
    words = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    parts = {w["jp"]: tokenize(w["jp"], "ja") for w in words}
    want = set(parts) | {t for ts in parts.values() for t in ts}
    vecs: dict[str, np.ndarray] = {}
    with gzip.open(SOURCE, "rt", encoding="utf-8") as f:
        _, dim = map(int, f.readline().split())
        for line in f:
            word, rest = line.split(" ", 1)
            if word in want:
                vecs[word] = np.asarray(rest.split(), dtype=np.float32)

    out = np.zeros((len(words), dim), dtype=np.float32)
    composed_mask = np.zeros(len(words), dtype=bool)
    direct = composed = 0
    for i, w in enumerate(words):
        if w["jp"] in vecs:
            v = vecs[w["jp"]]
            direct += 1
        elif parts[w["jp"]] and all(t in vecs for t in parts[w["jp"]]):
            ts = parts[w["jp"]]
            weights = [max(0.5, 7.5 - zipf_frequency(t, "ja")) for t in ts]
            v = np.average([vecs[t] / np.linalg.norm(vecs[t]) for t in ts], axis=0, weights=weights)
            composed_mask[i] = True
            composed += 1
        else:
            continue
        out[i] = v / np.linalg.norm(v)
    np.save(BUILD / "topic.npy", out.astype(np.float16))
    np.save(BUILD / "topic-composed.npy", composed_mask)
    missing = len(words) - direct - composed
    print(f"topic vectors: {direct} direct, {composed} from parts, {missing} missing (of {len(words)})")


if __name__ == "__main__":
    main()
