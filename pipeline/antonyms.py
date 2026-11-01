"""Finds candidate opposites (反) through English WordNet.

JMdict marks few antonyms. WordNet knows many English pairs ("safe" ↔ "dangerous").
For each word, its English meanings are looked up in WordNet; the antonyms found there are
matched back to vocabulary words with that meaning. A pair is kept as a candidate when the two
words also appear in similar contexts (fastText topic similarity >= MIN_TOPIC): real opposites
are used about the same things (安全/危険, 上がる/下がる).

Writes build/antonym-candidates.txt, strongest first, for review. Accepted pairs go in
curation/edge-fixes.txt as "+反 A B".
"""

import json
import re
from pathlib import Path

import nltk
import numpy as np

HERE = Path(__file__).parent
BUILD = HERE / "build"
nltk.data.path.insert(0, str(HERE / "raw" / "nltk"))
from nltk.corpus import wordnet as wn  # noqa: E402

MIN_TOPIC = 0.35


def heads(gloss: str) -> list[str]:
    """The lookup forms of a gloss: "to warm (up)" → "warm"; "safe (place)" → "safe"."""
    g = re.sub(r"\(.*?\)", "", gloss).strip().lower()
    g = re.sub(r"^(to|a|an|the|be) ", "", g)
    return [g.replace(" ", "_")] if g and len(g.split()) <= 2 else []


def main() -> None:
    words = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    topic = np.load(BUILD / "topic.npy").astype(np.float32)
    by_head: dict[str, list[int]] = {}
    for i, w in enumerate(words):
        for g in w["en"][:2]:
            for h in heads(g):
                by_head.setdefault(h, []).append(i)

    pairs: dict[tuple[int, int], tuple[float, str]] = {}
    for i, w in enumerate(words):
        for g in w["en"][:2]:
            for h in heads(g):
                for syn in wn.synsets(h):
                    for lemma in syn.lemmas():
                        if lemma.name().lower() != h:
                            continue
                        for ant in lemma.antonyms():
                            for j in by_head.get(ant.name().lower(), []):
                                if i == j or words[i]["pos"] != words[j]["pos"]:
                                    continue
                                sim = float(topic[i] @ topic[j])
                                key = (min(i, j), max(i, j))
                                if sim >= MIN_TOPIC and (key not in pairs or pairs[key][0] < sim):
                                    pairs[key] = (sim, f"{h} ↔ {ant.name()}")

    # Prefer well-known words: a pair is only as useful as its rarer word.
    def known(i: int) -> float:
        return (words[i]["jlpt"] or 0) + words[i]["zipf"] / 2

    ranked = sorted(pairs.items(), key=lambda kv: -(kv[1][0] + 0.1 * min(known(kv[0][0]), known(kv[0][1]))))
    with open(BUILD / "antonym-candidates.txt", "w", encoding="utf-8") as f:
        for (i, j), (sim, why) in ranked:
            f.write(f"{words[i]['jp']}\t{words[j]['jp']}\t{sim:.2f}\t{why}\n")
    print(f"{len(ranked)} candidate pairs")


if __name__ == "__main__":
    main()
