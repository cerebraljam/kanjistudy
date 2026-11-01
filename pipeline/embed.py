"""Step 2: embeds every word (written form, reading and meanings) with a multilingual model.
Writes build/embeddings.npy (float16, unit length, one row per word in build/vocab.json order).
"""

import json
from pathlib import Path

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

HERE = Path(__file__).parent
BUILD = HERE / "build"
MODEL = "intfloat/multilingual-e5-large"


def text(w: dict) -> str:
    # e5 models expect a "query: " prefix for symmetric similarity.
    reading = f"（{w['kana']}）" if w["kana"] else ""
    return f"query: {w['jp']}{reading}: {'; '.join(w['en'])}"


def main() -> None:
    words = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SentenceTransformer(MODEL, device=device)
    if device == "cuda":
        model.half()
    emb = model.encode([text(w) for w in words], batch_size=256, normalize_embeddings=True, show_progress_bar=True)
    np.save(BUILD / "embeddings.npy", emb.astype(np.float16))
    print(f"{emb.shape[0]} words × {emb.shape[1]} dims on {device}")


if __name__ == "__main__":
    main()
