"""Finds natural topic groups among all words, and suggests a name for each.

1. Link every word to its K nearest neighbors by topic vector (keep a link only if mutual).
2. Louvain community detection: groups that are densely linked inside, loosely outside.
   Groups that are too big are split again; too small ones are dropped.
3. Members far from their group's centroid are trimmed (TRIM_COS).
4. Each group's centroid (average vector) points at the words that best sum it up:
   those are its name candidates.
5. Words left out of the grouping (compounds whose topic vector was built from parts, so they
   would cluster by their ending: 暗号化 with アニメ化) join the group where their stem or their
   closest meaning neighbours are.

Leaves out stray single kanji that are not on a JLPT list (often a fragment of a split word).

Writes build/groups.json and build/groups.txt (readable) for choosing themes.
"""

import json
from pathlib import Path

import networkx as nx
import numpy as np

HERE = Path(__file__).parent
BUILD = HERE / "build"
K = 12
MIN_SIZE, MAX_SIZE = 8, 45
TRIM_COS = 0.35


def knn_graph(vecs: np.ndarray, nodes: list[int]) -> nx.Graph:
    m = vecs[nodes]
    sims = m @ m.T
    np.fill_diagonal(sims, -1)
    top = np.argsort(-sims, axis=1)[:, :K]
    tops = [set(t) for t in top]
    g = nx.Graph()
    g.add_nodes_from(range(len(nodes)))
    for a in range(len(nodes)):
        for b in top[a]:
            if a in tops[b]:
                g.add_edge(a, int(b), weight=float(max(sims[a, b], 0.01)))
    return g


def communities(vecs: np.ndarray, nodes: list[int], resolution: float, seed: int, depth=0) -> list[list[int]]:
    g = knn_graph(vecs, nodes)
    out = []
    for c in nx.community.louvain_communities(g, weight="weight", resolution=resolution, seed=seed):
        members = [nodes[i] for i in c]
        if len(members) > MAX_SIZE and depth < 3:
            out += communities(vecs, members, resolution * 1.6, seed, depth + 1)
        elif len(members) >= MIN_SIZE:
            out.append(members)
    return out


def main() -> None:
    words = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    vecs = np.load(BUILD / "topic.npy").astype(np.float32)
    meaning = np.load(BUILD / "embeddings.npy").astype(np.float32)
    composed = np.load(BUILD / "topic-composed.npy")
    stray = np.array([len(w["jp"]) == 1 and not w["jlpt"] for w in words])
    nodes = [i for i in range(len(words)) if vecs[i].any() and not composed[i] and not stray[i]]
    groups = communities(vecs, nodes, resolution=1.0, seed=7)

    # Trim each group's tail.
    trimmed = []
    for members in groups:
        c = vecs[members].mean(axis=0)
        c /= np.linalg.norm(c)
        kept = [i for i in members if float(vecs[i] @ c) >= TRIM_COS]
        if len(kept) >= MIN_SIZE:
            trimmed.append(kept)
    groups = trimmed

    # Place the left-out compounds: with their stem's group, else their closest meaning neighbours' group.
    group_of = {i: g for g, members in enumerate(groups) for i in members}
    index = {w["jp"]: i for i, w in enumerate(words)}
    grouped = np.array(sorted(group_of))
    placed = 0
    for i in np.where(composed)[0]:
        jp = words[i]["jp"]
        stem = index.get(jp[:-1])
        if stem in group_of:
            target = group_of[stem]
        else:
            sims = meaning[grouped] @ meaning[i]
            votes: dict[int, float] = {}
            for j in np.argsort(-sims)[:5]:
                votes[group_of[int(grouped[j])]] = votes.get(group_of[int(grouped[j])], 0) + float(sims[j])
            target = max(votes, key=votes.get)
        groups[target].append(int(i))
        placed += 1

    namable = np.where(~composed & ~stray & vecs.any(axis=1))[0]
    result = []
    for members in groups:
        core = [i for i in members if not composed[i]]
        c = vecs[core].mean(axis=0)
        cohesion = float(np.linalg.norm(c))  # 1 = all members identical; higher = tighter group
        c /= np.linalg.norm(c)
        s = vecs[namable] @ c
        names = [words[namable[j]]["jp"] for j in np.argsort(-s)[:6]]
        ordered = sorted(members, key=lambda i: -float(vecs[i] @ c))
        result.append({
            "names": names,
            "cohesion": round(cohesion, 3),
            "size": len(members),
            "jlpt": round(float(np.mean([words[i]["jlpt"] or 1 for i in members])), 1),
            "words": [words[i]["jp"] for i in ordered],
        })
    result.sort(key=lambda r: -r["cohesion"])
    for n, r in enumerate(result):
        r["id"] = n
    (BUILD / "groups.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    with open(BUILD / "groups.txt", "w", encoding="utf-8") as f:
        for r in result:
            f.write(f"#{r['id']} [{'/'.join(r['names'][:3])}] size {r['size']} avgN{r['jlpt']}\n  {' '.join(r['words'])}\n")
    covered = sum(r["size"] for r in result)
    print(f"{len(result)} groups covering {covered} words ({placed} compounds placed by stem or meaning)")


if __name__ == "__main__":
    main()
