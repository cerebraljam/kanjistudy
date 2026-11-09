"""Step 4: builds the app's dataset from the curated themes. Writes ../public/data/dataset.json.

Links inside each theme:
- 同 synonym: very similar words (embedding cosine >= SYN_COS) that share one of their two main meanings;
- 反 opposite: JMdict's antonym cross-references;
- 関 related: by topic (fastText vectors, topic.py), pairs that are among each other's REL_K closest
  theme-mates (mutual), at least
  MIN_DEGREE per word, at most MAX_DEGREE (weakest dropped), plus JMdict's "see also" references.
curation/meanings.txt overrides a word's meanings, for when JMdict's first sense is not the one
the theme means (ホーム = platform, not home):
    ホーム = platform; station platform
Essentials: JLPT N5–N3 words that no theme took (general words like する, 好き, 必要 belong to every
topic, so topic grouping cannot place them) get themes of their own by level and part of speech
("N5 verbs"), in the 言葉 category, at most ESSENTIALS_SIZE words each.
Drift links join each word to its closest topic neighbours in other themes (DRIFT_COS, at most
DRIFT_PER_WORD): the bridges a run follows out of its theme as the theme gets mastered.
Then curation/edge-fixes.txt adds or removes links by hand:
    + 温める 電子レンジ        add a 関 link   (+同 / +反 for the other kinds)
    - 箸 お釣り                remove any link between the two
"""

import json
import re
import sys
from pathlib import Path

import numpy as np

from loanwords import is_transliteration

HERE = Path(__file__).parent
BUILD = HERE / "build"
CURATION = HERE / "curation"
OUT = HERE.parent / "public" / "data" / "dataset.json"  # served as its own file, fetched at startup

SYN_COS = 0.93
REL_K = 5
MIN_DEGREE = 2
MAX_DEGREE = 6
DRIFT_COS = 0.55
MIN_THEME = 6
ESSENTIALS_SIZE = 30
ESSENTIAL_REL_COS = 0.45
ESSENTIAL_LEVELS = (5, 4, 3)
POS_NAMES = {"verb": ("動詞", "verbs"), "adj": ("形容詞", "adjectives"), "noun": ("名詞", "nouns"), "adv": ("副詞・表現", "adverbs and expressions"), "exp": ("副詞・表現", "adverbs and expressions")}
DRIFT_PER_WORD = 2
LATIN = re.compile(r"[A-Za-zＡ-Ｚａ-ｚ]")  # digits are fine (５月)
HIRAGANA = re.compile(r"^[ぁ-ゖー]+$")


def norm(g: str) -> str:
    return re.sub(r"\(.*?\)", "", g).strip().lower()


def read_list(path: Path) -> list[str]:
    return [l.split("#")[0].strip() for l in path.read_text(encoding="utf-8").splitlines() if l.split("#")[0].strip()]


def main() -> int:
    vocab = json.loads((BUILD / "vocab.json").read_text(encoding="utf-8"))
    emb = np.load(BUILD / "embeddings.npy").astype(np.float32)  # meaning (e5): synonyms
    topic = np.load(BUILD / "topic.npy").astype(np.float32)  # topic (fastText): related words
    # Words without a topic vector fall back to their meaning vector, scaled to the topic range.
    missing = ~topic.any(axis=1)
    row = {w["id"]: i for i, w in enumerate(vocab)}
    by_jp = {w["jp"]: w for w in vocab}
    themes_meta = json.loads((CURATION / "themes.json").read_text(encoding="utf-8"))

    problems: list[str] = []
    themes = []
    # Hand-made scenario themes (word lists in theme-words/), then themes from discovered groups.
    sources = []
    for t in themes_meta:
        path = CURATION / "theme-words" / f"{t['id']}.txt"
        if path.exists():
            sources.append((t, read_list(path)))
    discovered = CURATION / "discovered-themes.json"
    if discovered.exists():
        sources += [(t, t["words"]) for t in json.loads(discovered.read_text(encoding="utf-8"))]
    for t, listed in sources:
        ids = []
        for jp in listed:
            w = by_jp.get(jp)
            if not w:
                problems.append(f"{t['id']}: {jp} is not in the vocabulary")
            elif LATIN.search(w["jp"]) or (w["kana"] and not HIRAGANA.match(w["kana"])):
                problems.append(f"{t['id']}: {jp} is written in Latin letters or has an odd reading; left out")
            elif w["id"] not in ids:
                ids.append(w["id"])
        if len(ids) < MIN_THEME:
            problems.append(f"{t['id']}: only {len(ids)} usable words left; theme dropped")
            continue
        themes.append({"id": t["id"], "jp": t["jp"], "en": t["en"], "category": t.get("category", "暮らし"), "words": ids})

    # Essentials: leftover core words, by level and part of speech.
    themed = {i for t in themes for i in t["words"]}
    by_id = {w["id"]: w for w in vocab}
    for level in ESSENTIAL_LEVELS:
        buckets: dict[str, list[dict]] = {}
        for w in vocab:
            if w["jlpt"] != level or w["id"] in themed:
                continue
            if LATIN.search(w["jp"]) or (w["kana"] and not HIRAGANA.match(w["kana"])):
                continue
            if len(w["jp"]) == 1 and not w["kana"]:  # lone kana: particles and interjections (と, か, お)
                continue
            buckets.setdefault(POS_NAMES[w["pos"]][1], []).append(w)
        for en, ws in buckets.items():
            jp = next(v[0] for v in POS_NAMES.values() if v[1] == en)
            ws.sort(key=lambda w: -w["zipf"])
            chunks = [ws[k:k + ESSENTIALS_SIZE] for k in range(0, len(ws), ESSENTIALS_SIZE)]
            if len(chunks) > 1 and len(chunks[-1]) < MIN_THEME:
                last = chunks.pop()  # pop first: `chunks[-2] += chunks.pop()` would target the wrong chunk
                chunks[-1] = chunks[-1] + last
            for n, chunk in enumerate(chunks, 1):
                if len(chunk) < MIN_THEME:
                    continue
                suffix = f" {n}" if len(chunks) > 1 else ""
                themes.append({
                    "essentials": True,
                    "id": f"n{level}-{en.split()[0]}-{n}",
                    "jp": f"N{level}の{jp}{suffix}",
                    "en": f"N{level} {en}{suffix}",
                    "category": "言葉",
                    "words": [w["id"] for w in chunk],
                })

    used = {i for t in themes for i in t["words"]}
    words = {w["id"]: w for w in vocab if w["id"] in used}

    edges: dict[tuple[str, str], str] = {}

    def link(a: str, b: str, kind: str) -> None:
        key = (a, b) if a < b else (b, a)
        # A stronger kind wins: opposite > synonym > related.
        order = {"rel": 0, "syn": 1, "ant": 2}
        if a != b and order[kind] >= order.get(edges.get(key, "rel"), 0):
            edges[key] = kind

    for w in words.values():
        for other in w["ant"]:
            if other in words:
                link(w["id"], other, "ant")
        for other in w["see"]:
            if other in words:
                link(w["id"], other, "rel")

    for t in themes:
        ids = t["words"]
        essentials = t.get("essentials", False)
        rows = [row[i] for i in ids]
        m = emb[rows]
        sims = m @ m.T  # meaning similarity
        tp = topic[rows]
        rel = tp @ tp.T  # topic similarity
        for a, r in enumerate(rows):
            if missing[r]:
                rel[a, :] = rel[:, a] = sims[a] - 0.4
        np.fill_diagonal(sims, -1)
        np.fill_diagonal(rel, -1)
        top = [set(np.argsort(-rel[a])[:REL_K]) for a in range(len(ids))]
        for a in range(len(ids)):
            wa = words[ids[a]]
            main_a = {norm(g) for g in wa["en"][:2]}
            for b in range(a + 1, len(ids)):
                wb = words[ids[b]]
                if sims[a, b] >= SYN_COS and main_a & {norm(g) for g in wb["en"][:2]}:
                    link(ids[a], ids[b], "syn")
                elif b in top[a] and a in top[b] and (not essentials or rel[a, b] >= ESSENTIAL_REL_COS):
                    link(ids[a], ids[b], "rel")
            # Every word needs a way in and out of the chain. Essentials themes group words by type,
            # not topic, so there a link needs a real topic connection; drift links do the rest.
            if not essentials:
                for b in np.argsort(-rel[a])[:MIN_DEGREE]:
                    link(ids[a], ids[b], "rel")

    # Cap hubs: keep a word's strongest related links (synonyms and opposites always stay).
    cos = lambda a, b: float(topic[row[a]] @ topic[row[b]])
    for w in words:
        rel = [(k, cos(*k)) for k, v in edges.items() if v == "rel" and w in k]
        for k, _ in sorted(rel, key=lambda x: -x[1])[MAX_DEGREE:]:
            other = k[0] if k[1] == w else k[1]
            if sum(1 for kk, v in edges.items() if other in kk) > MIN_DEGREE:
                del edges[k]

    # Drift: bridges to the closest words of other themes.
    theme_sets = {}
    for t in themes:
        for i in t["words"]:
            theme_sets.setdefault(i, set()).add(t["id"])
    ids_all = list(words)
    rows_all = [row[i] for i in ids_all]
    tp_all = topic[rows_all]
    drift = 0
    for a, ia in enumerate(ids_all):
        if missing[row[ia]]:
            continue
        sims_a = tp_all @ tp_all[a]
        added = 0
        for b in np.argsort(-sims_a):
            if added >= DRIFT_PER_WORD or sims_a[b] < DRIFT_COS:
                break
            ib = ids_all[b]
            if ib == ia or theme_sets[ia] & theme_sets[ib]:
                continue
            key = (ia, ib) if ia < ib else (ib, ia)
            if key not in edges:
                edges[key] = "rel"
                drift += 1
            added += 1

    fixes = CURATION / "edge-fixes.txt"
    kinds = {"": "rel", "関": "rel", "同": "syn", "反": "ant"}
    for line in read_list(fixes) if fixes.exists() else []:
        m = re.match(r"^([+-])(関|同|反)?\s+(\S+)\s+(\S+)$", line)
        a, b = (by_jp.get(m.group(3)), by_jp.get(m.group(4))) if m else (None, None)
        if not m or not a or not b or a["id"] not in words or b["id"] not in words:
            problems.append(f"edge-fixes: cannot apply “{line}”")
            continue
        key = (a["id"], b["id"]) if a["id"] < b["id"] else (b["id"], a["id"])
        if m.group(1) == "-":
            edges.pop(key, None)
        else:
            edges[key] = kinds[m.group(2) or ""]

    # Nobody left stranded: a word with no link at all gets its closest word anywhere.
    linked = {w for k in edges for w in k}
    for a, ia in enumerate(ids_all):
        if ia in linked:
            continue
        sims_a = tp_all @ tp_all[a] if not missing[row[ia]] else emb[rows_all] @ emb[row[ia]]
        b = next(int(j) for j in np.argsort(-sims_a) if ids_all[j] != ia)
        edges[(ia, ids_all[b]) if ia < ids_all[b] else (ids_all[b], ia)] = "rel"

    degree = {w: sum(1 for k in edges if w in k) for w in words}
    for w, n in degree.items():
        if n < MIN_DEGREE:
            problems.append(f"{words[w]['jp']} has only {n} link(s); add one in edge-fixes.txt")

    overrides = {}
    path = CURATION / "meanings.txt"
    for line in read_list(path) if path.exists() else []:
        jp, _, rest = line.partition("=")
        glosses = [g.strip() for g in rest.split(";") if g.strip()]
        if not glosses or by_jp.get(jp.strip(), {}).get("id") not in words:
            problems.append(f"meanings: cannot apply “{line}”")
        else:
            overrides[by_jp[jp.strip()]["id"]] = glosses

    out_words = []
    for w in words.values():
        o = {"id": w["id"], "jp": w["jp"], "en": overrides.get(w["id"], w["en"])}
        if w["kana"]:
            o["kana"] = w["kana"]
        if w["jlpt"]:
            o["jlpt"] = w["jlpt"]
        if w["noRead"]:
            o["noRead"] = True
        if is_transliteration(w["jp"], o["en"]):  # コンピューター = computer: skippable (Settings)
            o["loan"] = True
        if w["ex"]:
            o["ex"] = w["ex"]
        out_words.append(o)

    for t in themes:
        t.pop("essentials", None)
    dataset = {
        "version": 1,
        "source": f"JMdict {(HERE / 'raw' / 'jmdict-version.txt').read_text().strip()}",
        "words": out_words,
        "edges": [{"a": a, "b": b, "type": k} for (a, b), k in sorted(edges.items())],
        "themes": themes,
    }
    OUT.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    kinds = {k: sum(1 for v in edges.values() if v == k) for k in ("rel", "syn", "ant")}
    print(f"{len(out_words)} words, {len(themes)} themes, edges {kinds} ({drift} drift), {OUT.stat().st_size // 1024} KB")
    for p in problems:
        print("  !", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
