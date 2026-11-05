"""Step 6: a fixed 2D map of every word, for the app's Map screen. Writes ../public/data/map.json.

Words are placed with UMAP from their topic vectors (fastText), the same ones that build 関 links and
themes, so related words sit together and unrelated ones far apart. The layout is computed once here:
the app only draws dots at fixed positions, so nothing moves on screen.

Areas: the map is cut into regions (k-means on the 2D positions), each named after the theme that
lies most within it. They are the labels shown on the zoomed-out map.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
import umap
from sklearn.cluster import KMeans

HERE = Path(__file__).parent
BUILD = HERE / "build"
DATA = HERE.parent / "public" / "data"
GRID = 4095  # positions are stored as integers 0..GRID
AREAS = 16
SEED = 7


def ids_hash(ids: list[str]) -> str:
    """Ties the map to one dataset build: the app ignores a map made for other words."""
    return hashlib.sha256("\n".join(ids).encode()).hexdigest()[:16]


def main() -> None:
    vocab = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    topic = np.load(BUILD / "topic.npy").astype(np.float32)
    ds = json.loads((DATA / "dataset.json").read_text(encoding="utf-8"))
    row = {w["id"]: i for i, w in enumerate(vocab)}
    ids = [w["id"] for w in ds["words"]]
    x = topic[[row[i] for i in ids]]
    has = x.any(axis=1)
    x = x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)

    xy = np.zeros((len(ids), 2), np.float32)
    xy[has] = umap.UMAP(n_neighbors=30, min_dist=0.08, metric="cosine", random_state=SEED).fit_transform(x[has])
    # A word with no topic vector sits among the words it is linked to.
    index = {w: i for i, w in enumerate(ids)}
    adj: dict[str, list[str]] = {}
    for e in ds["edges"]:
        adj.setdefault(e["a"], []).append(e["b"])
        adj.setdefault(e["b"], []).append(e["a"])
    for i in np.where(~has)[0]:
        near = [index[n] for n in adj.get(ids[i], []) if has[index[n]]]
        xy[i] = xy[near].mean(0) if near else xy[has].mean(0)
    # Fit into a square, keeping the aspect ratio.
    xy -= xy.min(0)
    xy /= xy.max()
    xy += (1 - xy.max(0)) / 2
    q = np.rint(xy * GRID).astype(int)

    # Areas: regions of the map, named after the theme most inside each.
    lab = KMeans(AREAS, n_init=4, random_state=SEED).fit_predict(xy)
    areas = []
    for a in range(AREAS):
        members = set(np.where(lab == a)[0])
        best, score = None, 0.0
        for t in ds["themes"]:
            ws = [index[w] for w in t["words"] if w in index]
            if len(ws) < 8:
                continue
            inside = sum(1 for w in ws if w in members)
            s = inside * inside / len(ws)  # many words, mostly in this area
            if s > score:
                best, score = t, s
        if best is None:
            continue
        ws = [index[w] for w in best["words"] if index.get(w) in members]
        c = xy[ws].mean(0)
        areas.append({"theme": best["id"], "jp": best["jp"], "en": best["en"], "x": int(c[0] * GRID), "y": int(c[1] * GRID)})

    out = {"version": 1, "ids": ids_hash(ids), "grid": GRID, "x": q[:, 0].tolist(), "y": q[:, 1].tolist(), "areas": areas}
    (DATA / "map.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = (DATA / "map.json").stat().st_size
    print(f"map: {len(ids)} words, {len(areas)} areas, {size // 1024} KB")
    for a in areas:
        print(f"  {a['jp']} ({a['en']})")


if __name__ == "__main__":
    main()
