"""English for Japanese speakers: builds ../public/data/dataset-en.json from the Japanese dataset.

The English data mirrors the Japanese data. Each English word gets an anchor: the Japanese
dataset word that translates it (train → 電車). Through the anchors the English side inherits
the hand-curated themes (駅・電車 → train, station, ticket), the 関 links between theme words, and
synonyms (two English words with the same anchor: big, large → 大きい).

- Words: the CEFR-J Vocabulary Profile (A1–B2, Tono Laboratory, TUFS) and the Octanove profile
  (C1–C2, CC BY-SA 4.0), content words only, up to MAX_LEVEL.
- Japanese meanings: JMdict read backwards (entries that gloss the English word), ranked by part
  of speech, sense order, commonness and whether the Japanese dataset has the word.
- 反 opposites: WordNet antonyms between words of the same theme.
- 綴 spelling: wrong spellings made by the confusions Japanese speakers meet (L/R, B/V, TH/S,
  silent letters, doubled consonants), none of which is a real English word.

In the dataset, as on the Japanese side, `jp` is the word studied (here English) and `en` its
meanings in the learner's language (here Japanese). Run after build.py.
"""

import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import nltk
import numpy as np
from wordfreq import tokenize, zipf_frequency

HERE = Path(__file__).parent
RAW = HERE / "raw"
CURATION = HERE / "curation" / "en"
DATA = HERE.parent / "public" / "data"
OUT = DATA / "dataset-en.json"
nltk.data.path.insert(0, str(RAW / "nltk"))
from nltk.corpus import wordnet as wn  # noqa: E402

CEFR_FILES = ["cefrj-vocabulary-profile-1.5.csv", "octanove-vocabulary-profile-c1c2-1.0.csv"]
CEFR_URL = "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
MAX_LEVEL = "C2"
CONTENT_POS = {"noun": "n", "verb": "v", "adjective": "adj", "adverb": "adv"}
MEANINGS = 3
KATAKANA = re.compile(r"[ァ-ヺー・]+")
MIN_THEME = 6
MIN_DEGREE = 2
# Japanese themes with no meaning in English: JLPT word lists and Japanese grammar.
# The level lists made here for words no theme took: "a1-adjectives-1".
LIST = re.compile(r"^(a1|a2|b1|b2|c1|c2)-")
LIST_REL_COS = 0.45
JA_ONLY = re.compile(r"^(n[1-5]-.*|formal-nouns|teki-adjectives)$")
MAX_DEGREE = 6
ESSENTIALS_SIZE = 30
KANJI = {chr(c) for c in range(0x4E00, 0x9FFF)}
LATIN = re.compile(r"[A-Za-zＡ-Ｚａ-ｚ]")
POS_NAMES = {"v": ("verbs", "動詞"), "n": ("nouns", "名詞"), "adj": ("adjectives", "形容詞"), "adv": ("adverbs", "副詞")}


def fetch() -> None:
    import urllib.request

    for name in CEFR_FILES:
        target = RAW / name
        if not target.exists():
            print(f"downloading {name}")
            target.write_bytes(urllib.request.urlopen(CEFR_URL + name, timeout=60).read())


def jm_pos(tags: list[str]) -> set[str]:
    """JMdict part-of-speech tags as noun / verb / adjective / adverb."""
    out = set()
    for t in tags:
        if t.startswith("v") and t != "vs":
            out.add("v")
        if t in ("n", "n-adv", "n-t", "n-suf", "vs"):
            out.add("n")
        if t.startswith("adj"):
            out.add("adj")
        if t in ("adj-no", "adj-na"):
            out.add("n")
        if t.startswith("adv"):
            out.add("adv")
    return out


def gloss_key(g: str) -> str:
    g = re.sub(r"\s*\(.*?\)\s*", " ", g.lower()).strip()
    return re.sub(r"^(to|a|an|the) ", "", g)


def english_words() -> list[dict]:
    """CEFR words up to MAX_LEVEL, one entry per headword (the parts of speech merged)."""
    words: dict[str, dict] = {}
    top = LEVELS.index(MAX_LEVEL)
    for name in CEFR_FILES:
        for r in csv.DictReader((RAW / name).open(encoding="utf-8")):
            level = r["CEFR"].strip()
            pos = CONTENT_POS.get(r["pos"].strip())
            if level not in LEVELS or LEVELS.index(level) > top or not pos:
                continue
            head = r["headword"].split("/")[0].strip()
            if not re.fullmatch(r"[a-z][a-z' -]*[a-z]", head):  # proper nouns, abbreviations
                continue
            w = words.setdefault(head, {"jp": head, "level": level, "pos": []})
            if LEVELS.index(level) < LEVELS.index(w["level"]):
                w["level"] = level
            if pos not in w["pos"]:
                w["pos"].append(pos)
    return list(words.values())


def main() -> int:
    fetch()
    ja = json.loads((DATA / "dataset.json").read_text(encoding="utf-8"))
    ja_words = {w["id"]: w for w in ja["words"]}
    ja_by_form = {w["kana"]: w["id"] for w in ja["words"] if w.get("kana")}  # おもちゃ finds 玩具
    ja_by_form.update({w["jp"]: w["id"] for w in ja["words"]})
    # The pipeline's larger vocabulary: anchors outside the dataset still give topic vectors.
    vocab = json.loads((HERE / "build" / "vocab.json").read_text(encoding="utf-8"))
    topic_all = np.load(HERE / "build" / "topic.npy").astype(np.float32)
    # Only anchors with a topic vector: without one a word's links would be random.
    vocab_form = {v["id"]: v["jp"] for v in vocab}
    vocab_ids = {v["id"] for v, t in zip(vocab, topic_all) if t.any()}
    vocab_by_form = {v["kana"]: v["id"] for v in vocab if v.get("kana")}
    vocab_by_form.update({v["jp"]: v["id"] for v in vocab})
    jm = json.loads((RAW / "jmdict-eng.json").read_text(encoding="utf-8"))["words"]

    # The reverse dictionary: English gloss → Japanese entries that give it.
    reverse: dict[str, list[tuple]] = defaultdict(list)
    for e in jm:
        forms = e["kanji"] or e["kana"]
        if not forms:
            continue
        form = forms[0]["text"]
        common = any(f.get("common") for f in forms)
        for si, s in enumerate(e["sense"][:4]):
            pos = jm_pos(s["partOfSpeech"])
            for gi, g in enumerate(s["gloss"][:5]):
                reverse[gloss_key(g["text"])].append((e["id"], form, si, gi, pos, common))

    def score(c: tuple, pos: list[str]) -> float:
        jid, form, si, gi, cpos, common = c
        s = -1.2 * si - 0.5 * gi
        s += 2.5 if si == 0 and gi == 0 else 1 if si == 0 else 0  # the entry's main meaning
        s += 1.5 if common else 0
        jw = ja_words.get(jid)
        if jw:
            s += 1.5 + 0.3 * (jw.get("jlpt") or 0)
        z = zipf_frequency(form, "ja")
        s += 0.9 * (z if len(tokenize(form, "ja")) == 1 else z - 2)
        if KATAKANA.fullmatch(form):  # a loanword gives the answer away: ミステリー for mystery
            s -= 2.5
        s += 1 if cpos & set(pos) else -2.5
        return s

    words = english_words()
    meaning_fixes, anchor_fixes = read_fixes()
    kept = []
    for w in words:
        cands = [c for c in reverse.get(w["jp"], []) if not LATIN.search(c[1])]
        if not cands:
            continue
        ranked = sorted(cands, key=lambda c: -score(c, w["pos"]))
        meanings: list[str] = []
        for c in ranked:
            if c[1] not in meanings:
                meanings.append(c[1])
        if meaning_fixes.get(w["jp"]) == ["-"]:  # "word = -": left out
            continue
        w["en"] = meaning_fixes.get(w["jp"], meanings[:MEANINGS])
        # The anchor: the best-ranked meaning that the Japanese dataset has.
        top = set(w["en"])
        w["anchor"] = next((c[0] for c in ranked if c[0] in ja_words and c[1] in top), None)
        # Not in the Japanese dataset (象 for elephant): the larger vocabulary still places it by topic.
        w["anchor"] = w["anchor"] or next((c[0] for c in ranked if c[0] in vocab_ids and c[1] in top), None)
        # Or the vocabulary word written the same (topic vectors go by the written form: 象).
        w["anchor"] = w["anchor"] or next((vocab_by_form[c[1]] for c in ranked if c[1] in top and vocab_by_form.get(c[1]) in vocab_ids), None)
        if w["jp"] in meaning_fixes:  # fixed meanings: the first that the Japanese dataset has
            auto = w["anchor"]
            forms = [f for m in w["en"] for f in dictionary_forms(m)]
            w["anchor"] = next((ja_by_form[f] for f in forms if f in ja_by_form), None)
            w["anchor"] = w["anchor"] or next((vocab_by_form[f] for f in forms if f in vocab_by_form and vocab_by_form[f] in vocab_ids), None)
            # Or the dictionary entry the fixed meaning comes from (鯨 is the entry stored as クジラ).
            w["anchor"] = w["anchor"] or next((c[0] for c in ranked if c[1] in forms and (c[0] in ja_words or c[0] in vocab_ids)), None)
            # Or the automatic anchor, when it shares a kanji with the fixed meanings (猿 for 猿).
            if not w["anchor"] and auto and set(vocab_form[auto]) & set("".join(w["en"])) & KANJI:
                w["anchor"] = auto
        if w["jp"] in anchor_fixes:
            w["anchor"] = anchor_fixes[w["jp"]]
        kept.append(w)
    anchored = [w for w in kept if w["anchor"]]
    print(f"{len(kept)} of {len(words)} words have Japanese meanings; {len(anchored)} anchored")

    if "--sample" in sys.argv:
        import random

        random.seed(int(sys.argv[-1]) if sys.argv[-1].isdigit() else 1)
        for w in random.sample(kept, 60):
            a = ja_words[w["anchor"]]["jp"] if w["anchor"] else "-"
            print(f"  {w['level']} {w['jp']:16} {'/'.join(w['pos']):8} {' · '.join(w['en']):30} anchor {a}")
        return 0

    for w in anchored:
        w["id"] = w["jp"].replace(" ", "_")
    by_anchor: dict[str, list[dict]] = defaultdict(list)
    for w in anchored:
        by_anchor[w["anchor"]].append(w)

    # Themes: each Japanese theme's words, through their anchors. Names swap sides: the studied
    # language first.
    drops = read_drops()
    themes = []
    for t in ja["themes"]:
        if JA_ONLY.match(t["id"]):
            continue
        ids: list[str] = []
        for a in t["words"]:
            ids += [w["id"] for w in by_anchor.get(a, []) if w["id"] not in ids and w["jp"] not in drops.get(t["id"], ())]
        if len(ids) >= MIN_THEME:
            themes.append({"id": t["id"], "jp": t["en"], "en": t["jp"], "category": t.get("category", "暮らし"), "words": ids})
    themed = {i for t in themes for i in t["words"]}
    # Essentials: core words no theme took, by level and part of speech.
    for level in LEVELS[: LEVELS.index(MAX_LEVEL) + 1]:
        buckets: dict[str, list[dict]] = defaultdict(list)
        for w in anchored:
            if w["level"] == level and w["id"] not in themed:
                buckets[w["pos"][0]].append(w)
        for pos, ws in buckets.items():
            ws.sort(key=lambda w: -zipf_frequency(w["jp"], "en"))
            chunks = [ws[k : k + ESSENTIALS_SIZE] for k in range(0, len(ws), ESSENTIALS_SIZE)]
            if len(chunks) > 1 and len(chunks[-1]) < MIN_THEME:
                last = chunks.pop()
                chunks[-1] = chunks[-1] + last
            for n, chunk in enumerate(chunks, 1):
                if len(chunk) < MIN_THEME:
                    continue
                en, jp = POS_NAMES[pos]
                suffix = f" {n}" if len(chunks) > 1 else ""
                themes.append({
                    "id": f"{level.lower()}-{en}-{n}",
                    "jp": f"{level} {en}{suffix}",
                    "en": f"{level}の{jp}{suffix}",
                    "category": "言葉",
                    "words": [w["id"] for w in chunk],
                })
    used = {i for t in themes for i in t["words"]}
    words_out = {w["id"]: w for w in anchored if w["id"] in used}

    # Topic vectors: each word's anchor's (fastText, from the Japanese side).
    vrow = {v["id"]: i for i, v in enumerate(vocab)}
    vec = {i: topic_all[vrow[w["anchor"]]] for i, w in words_out.items()}

    edges: dict[tuple[str, str], str] = {}
    order = {"rel": 0, "syn": 1, "ant": 2}

    def link(a: str, b: str, kind: str) -> None:
        key = (a, b) if a < b else (b, a)
        if a != b and order[kind] >= order.get(edges.get(key, "rel"), 0):
            edges[key] = kind

    def same_pos(a: dict, b: dict) -> bool:
        return bool(set(a["pos"]) & set(b["pos"]))

    synsets = {i: {s.name() for s in wn.synsets(w["jp"].replace(" ", "_"))} for i, w in words_out.items()}
    # The Japanese links, carried over.
    for e in ja["edges"]:
        for wa in by_anchor.get(e["a"], []):
            for wb in by_anchor.get(e["b"], []):
                if wa["id"] in words_out and wb["id"] in words_out:
                    kind = e["type"] if e["type"] == "rel" or same_pos(wa, wb) else "rel"
                    if kind == "syn" and not synsets[wa["id"]] & synsets[wb["id"]]:
                        kind = "rel"
                    link(wa["id"], wb["id"], kind)
    # Same anchor: synonyms when WordNet agrees (big, large), related otherwise (hot, heat).
    for ws in by_anchor.values():
        ws = [w for w in ws if w["id"] in words_out]
        for i, wa in enumerate(ws):
            for wb in ws[i + 1 :]:
                syn = same_pos(wa, wb) and synsets[wa["id"]] & synsets[wb["id"]]
                link(wa["id"], wb["id"], "syn" if syn else "rel")
    # Opposites from WordNet.
    by_head = {w["jp"].replace(" ", "_"): i for i, w in words_out.items()}
    for i, w in words_out.items():
        for s in wn.synsets(w["jp"].replace(" ", "_")):
            for lemma in s.lemmas():
                if lemma.name() != w["jp"].replace(" ", "_"):
                    continue
                for ant in lemma.antonyms():
                    if ant.name() in by_head:
                        link(i, by_head[ant.name()], "ant")
    # Every theme word gets at least MIN_DEGREE links inside its theme, to its closest theme-mates.
    def degree(i: str) -> int:
        return sum(1 for k in edges if i in k)

    for t in themes:
        if LIST.match(t["id"]):
            continue
        ids = t["words"]
        m = np.stack([vec[i] for i in ids])
        sims = m @ m.T
        np.fill_diagonal(sims, -9)
        for a, ia in enumerate(ids):
            members = set(ids)
            inside = sum(1 for k in edges if ia in k and (k[0] if k[1] == ia else k[1]) in members)
            for b in np.argsort(-sims[a]):
                if inside >= MIN_DEGREE:
                    break
                key = (ia, ids[b]) if ia < ids[b] else (ids[b], ia)
                if key not in edges:
                    link(ia, ids[b], "rel")
                    inside += 1
    # Words in the level lists ("A1 adjectives") share no topic with their list-mates: their
    # links go to the closest words anywhere, and only to close ones (social → society, not new).
    weak: list[str] = []
    all_ids = list(words_out)
    all_vecs = np.stack([vec[i] for i in all_ids])
    for t in themes:
        if not LIST.match(t["id"]):
            continue
        for ia in t["words"]:
            sims = all_vecs @ vec[ia]
            for b in np.argsort(-sims):
                if degree(ia) >= MIN_DEGREE or sims[b] < LIST_REL_COS:
                    break
                ib = all_ids[b]
                key = (ia, ib) if ia < ib else (ib, ia)
                if ib != ia and key not in edges and vec[ib].any():
                    link(ia, ib, "rel")
    # Cap hubs (a theme word with many English words on its anchor's partners): keep the strongest.
    cos = lambda a, b: float(vec[a] @ vec[b])
    for i in words_out:
        rel = [(k, cos(*k)) for k, v in edges.items() if v == "rel" and i in k]
        for k, _ in sorted(rel, key=lambda x: -x[1])[MAX_DEGREE:]:
            other = k[0] if k[1] == i else k[1]
            if degree(other) > MIN_DEGREE:
                del edges[k]

    # Nobody stranded: a word with no link at all gets its closest word anywhere.
    for ia in all_ids:
        if degree(ia) == 0:
            sims = all_vecs @ vec[ia]
            ib = next(all_ids[int(j)] for j in np.argsort(-sims) if all_ids[int(j)] != ia)
            link(ia, ib, "rel")
            weak.append(f"{words_out[ia]['jp']} ~ {words_out[ib]['jp']} ({float(sims[all_ids.index(ib)]):.2f})")

    # Examples: a Tatoeba sentence of the anchor's entry that uses the English word.
    examples: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for e in json.loads((RAW / "jmdict-examples-eng.json").read_text(encoding="utf-8"))["words"]:
        if e["id"] in vrow or e["id"] in ja_words:
            for s in e["sense"]:
                for ex in s.get("examples", []):
                    tx = {x["lang"]: x["text"] for x in ex["sentences"]}
                    if "jpn" in tx and "eng" in tx:
                        examples[e["id"]].append((tx["eng"], tx["jpn"]))

    real = real_words(words)
    out_words = []
    spelled = 0
    for i, w in words_out.items():
        o = {"id": i, "jp": w["jp"], "en": w["en"], "jlpt": 5 - LEVELS.index(w["level"])}
        fakes = misspellings(w["jp"], real)
        if len(fakes) >= 2:
            o["spell"] = fakes
            spelled += 1
        form = re.compile(rf"\b{re.escape(w['jp'])}(s|es|d|ed|ing)?\b", re.I)
        found = sorted((x for x in examples.get(w["anchor"], []) if form.search(x[0]) and len(x[0]) <= 80), key=lambda x: len(x[0]))
        if found:
            o["ex"] = {"jp": found[0][0], "en": found[0][1]}
        out_words.append(o)

    dataset = {
        "version": 1,
        "lang": "en",
        "levels": ["C2", "C1", "B2", "B1", "A2", "A1"],
        "source": "CEFR-J 1.5 · JMdict " + (RAW / "jmdict-version.txt").read_text().strip(),
        "words": out_words,
        "edges": [{"a": a, "b": b, "type": k} for (a, b), k in sorted(edges.items())],
        "themes": themes,
    }
    OUT.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kinds = {k: sum(1 for v in edges.values() if v == k) for k in ("rel", "syn", "ant")}
    print(f"{len(out_words)} words, {len(themes)} themes, edges {kinds}, {spelled} with spelling, "
          f"{sum(1 for o in out_words if 'ex' in o)} with examples, {OUT.stat().st_size // 1024} KB")
    if weak:
        print(f"  {len(weak)} words had nothing close; linked to their closest anyway: {', '.join(weak[:12])}")
    low = [words_out[i]["jp"] for i in words_out if degree(i) < MIN_DEGREE]
    if low:
        print(f"  ! {len(low)} words with fewer than {MIN_DEGREE} links: {', '.join(low[:20])}")
    # On the map, a word sits at its anchor; an anchor outside the Japanese dataset, at the
    # dataset word closest in topic.
    ja_ids = [w["id"] for w in ja["words"]]
    ja_vecs = topic_all[[vrow[i] for i in ja_ids]]
    for w in words_out.values():
        w["place"] = w["anchor"] if w["anchor"] in ja_words else ja_ids[int(np.argmax(ja_vecs @ vec[w["id"]]))]
    write_map(ja, dataset, words_out)
    return 0


def read_fixes() -> tuple[dict[str, list[str]], dict[str, str]]:
    """curation/en/meanings.txt: "hometown = 故郷; ふるさと" sets the meanings ("ow = -" leaves the
    word out); "→ 故郷" after them
    (or alone) sets the anchor by its JMdict id: "hometown = 故郷 → 1270520"."""
    meanings, anchors = {}, {}
    path = CURATION / "meanings.txt"
    for line in path.read_text(encoding="utf-8").splitlines() if path.exists() else []:
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        head, _, rest = line.partition("=")
        rest, _, anchor = rest.partition("→")
        if rest.strip():
            meanings[head.strip()] = [m.strip() for m in rest.split(";") if m.strip()]
        if anchor.strip():
            anchors[head.strip()] = anchor.strip()
    return meanings, anchors


def dictionary_forms(m: str) -> list[str]:
    """A meaning as written in a word list, then the forms the Japanese dataset may hold it in:
    同意する → 同意, 疲れた → 疲れる, 外国の → 外国, 〜様 → 様."""
    m = re.sub(r"[(（].*?[)）]", "", m).replace("〜", "").strip()
    out = [m]
    for suffix, repl in (("する", ""), ("の", ""), ("な", ""), ("に", ""), ("で", ""), ("った", "る"), ("った", "う"), ("った", "つ"),
                         ("んだ", "む"), ("いた", "く"), ("た", "る"), ("ている", "る"), ("ている", "")):
        if m.endswith(suffix) and len(m) > len(suffix):
            out.append(m[: -len(suffix)] + repl)
    return out


def read_drops() -> dict[str, set[str]]:
    """curation/en/theme-drops.txt: "hot-and-cold interested" takes a word out of a theme (an
    anchor with several senses brings words of the wrong one: interested via 熱い)."""
    out: dict[str, set[str]] = defaultdict(set)
    path = CURATION / "theme-drops.txt"
    for line in path.read_text(encoding="utf-8").splitlines() if path.exists() else []:
        parts = line.split("#")[0].split(None, 1)
        if len(parts) == 2:
            out[parts[0]].add(parts[1].strip())
    return out


def real_words(words: list[dict]) -> set[str]:
    out = set()
    for name in CEFR_FILES:
        for r in csv.DictReader((RAW / name).open(encoding="utf-8")):
            out.update(x.strip().lower() for x in r["headword"].split("/"))
    return out


def is_real(s: str, real: set[str]) -> bool:
    return any(t in real or wn.synsets(t) or zipf_frequency(t, "en") >= 3.3 for t in s.split())


# Confusions Japanese speakers meet in English spelling, most typical first. Each is
# (pattern, replacement, weight).
CONFUSIONS = [
    (r"l", "r", 4), (r"r", "l", 4),  # one Japanese sound for both
    (r"(?<!r)ll", "rr", 2), (r"rr", "ll", 2),
    (r"b", "v", 3), (r"v", "b", 3),
    (r"th", "s", 2), (r"th", "z", 1),
    (r"(?<=[aeiou])([bdfgklmnprst])(?=[aeiouy])", r"\1\1", 2),  # doubling: apartment → appartment
    (r"([bcdfgklmnprstz])\1", r"\1", 2),  # undoubling: letter → leter
    (r"^kn", "n", 2), (r"^wr", "r", 2), (r"mb$", "m", 2), (r"wh", "w", 1), (r"gh", "", 1),
    (r"ie", "ei", 2), (r"ei", "ie", 2), (r"ea", "ee", 1), (r"ee", "ea", 1), (r"ou", "o", 1),
    (r"or$", "er", 2), (r"er$", "ar", 1), (r"ar$", "er", 1),
    (r"tion$", "sion", 1), (r"sion$", "tion", 1), (r"ph", "f", 1), (r"ck", "k", 1),
    (r"(?<=[^aeioucgv])e$", "", 1), (r"^si", "shi", 1), (r"(?<![a-z])fu", "hu", 1), (r"(?<![a-z])hu", "fu", 1),
]
MAX_FAKES = 5


def misspellings(word: str, real: set[str]) -> list[str]:
    """Up to MAX_FAKES wrong spellings, one change each, different kinds of mistake first."""
    if len(word) < 4:
        return []
    found: list[tuple[float, str]] = []
    seen = {word}
    for n, (pat, rep, weight) in enumerate(CONFUSIONS):
        for m in re.finditer(pat, word):
            fake = word[: m.start()] + m.expand(rep) + word[m.end() :]
            if fake in seen or len(fake) < 3:
                continue
            seen.add(fake)
            if not is_real(fake, real):
                # A mistake late in the word is harder to spot; spread the kinds of mistake.
                found.append((weight + 0.3 * m.start() / len(word), fake, n))
    found.sort(key=lambda x: -x[0])
    out, kinds = [], set()
    for _, fake, n in found:  # one per kind first
        if n not in kinds and len(out) < MAX_FAKES:
            out.append(fake)
            kinds.add(n)
    for _, fake, _n in found:
        if fake not in out and len(out) < MAX_FAKES:
            out.append(fake)
    return out


def ids_hash(ids: list[str]) -> str:
    return hashlib.sha256("\n".join(ids).encode()).hexdigest()[:16]


def write_map(ja: dict, ds: dict, words: dict[str, dict]) -> None:
    """The English map: each word at its anchor's place on the Japanese map, a little apart."""
    m = json.loads((DATA / "map.json").read_text(encoding="utf-8"))
    at = {w["id"]: k for k, w in enumerate(ja["words"])}
    grid = m["grid"]
    xs, ys = [], []
    for o in ds["words"]:
        k = at[words[o["id"]]["place"]]
        h = hashlib.sha256(o["id"].encode()).digest()
        xs.append(min(grid, max(0, m["x"][k] + h[0] % 25 - 12)))
        ys.append(min(grid, max(0, m["y"][k] + h[1] % 25 - 12)))
    themes = {t["id"]: t for t in ds["themes"]}
    areas = [{**a, "jp": themes[a["theme"]]["jp"], "en": themes[a["theme"]]["en"]} for a in m["areas"] if a["theme"] in themes]
    out = {"version": 1, "ids": ids_hash([o["id"] for o in ds["words"]]), "grid": grid, "x": xs, "y": ys, "areas": areas}
    path = DATA / "map-en.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"map: {len(xs)} words, {len(areas)} of {len(m['areas'])} areas, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
