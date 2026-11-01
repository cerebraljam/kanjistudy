"""Step 3: for each theme in curation/themes.json, lists candidate words by embedding similarity
to each of its facets. Writes build/candidates/<theme>.txt for review; the chosen words go in
curation/theme-words/<theme>.txt.
"""

import json
from pathlib import Path

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from embed import MODEL

HERE = Path(__file__).parent
BUILD = HERE / "build"
PER_FACET = 40


def main() -> None:
    words = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    emb = np.load(BUILD / "embeddings.npy").astype(np.float32)
    themes = json.loads((HERE / "curation" / "themes.json").read_text(encoding="utf-8"))
    model = SentenceTransformer(MODEL, device="cuda" if torch.cuda.is_available() else "cpu")
    out = BUILD / "candidates"
    out.mkdir(exist_ok=True)
    for t in themes:
        q = model.encode([f"query: {f}" for f in t["facets"]], normalize_embeddings=True)
        sims = emb @ q.T  # words × facets
        seen: dict[int, float] = {}
        lines = []
        for fi, facet in enumerate(t["facets"]):
            lines.append(f"## {facet}")
            for i in np.argsort(-sims[:, fi])[:PER_FACET]:
                if i in seen:
                    continue
                seen[i] = float(sims[i, fi])
                w = words[i]
                level = f"N{w['jlpt']}" if w["jlpt"] else "--"
                lines.append(f"{w['jp']}\t{w['kana'] or ''}\t{level}\t{'; '.join(w['en'][:2])}")
        (out / f"{t['id']}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"{t['id']}: {len(seen)} candidates")


if __name__ == "__main__":
    main()
