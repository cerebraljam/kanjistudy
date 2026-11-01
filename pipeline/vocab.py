"""Step 1: picks the vocabulary and cleans each entry. Writes build/vocab.json.

A word is kept if any of these holds:
- it is on a JLPT list;
- it is one token and common in real text (wordfreq Zipf >= MIN_ZIPF);
- JMdict marks it common and Zipf >= MIN_ZIPF_COMMON;
- it is a known word plus 性/化/的 (脆弱 → 脆弱性) and Zipf >= MIN_ZIPF_DERIVED;
- it is listed in curation/extra-words.txt.
wordfreq's estimates for other multi-token compounds are unreliable (交換機能 scores like 脆弱性),
so those only come in through the curated list.
Grammar words (particles, suffixes…) are left out: they do not belong to topics.
"""

import csv
import json
import re
from pathlib import Path

from wordfreq import tokenize, zipf_frequency

HERE = Path(__file__).parent
RAW = HERE / "raw"
BUILD = HERE / "build"

MIN_ZIPF = 3.3
MIN_ZIPF_COMMON = 3.0
MIN_ZIPF_DERIVED = 3.7
DERIVING = ("性", "化", "的")
MAX_LEN = 8
GRAMMAR_POS = {"prt", "aux", "aux-v", "aux-adj", "cop", "conj", "pref", "suf", "ctr", "unc", "int", "pn"}
BAD_MISC = {"arch", "obs", "vulg", "X", "derog", "rare", "dated"}
RARE_FORM = {"rK", "iK", "oK", "sK", "io"}
RARE_KANA = {"ik", "ok", "sk", "rk"}


def load_jlpt() -> dict[str, int]:
    levels: dict[str, int] = {}
    for level in range(5, 0, -1):  # easiest first: a word on two lists keeps the easier level
        with open(RAW / f"jlpt-n{level}.csv", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                levels.setdefault(row["jmdict_seq"], level)
    return levels


def applies(kana: dict, kanji_text: str) -> bool:
    a = kana.get("appliesToKanji", ["*"])
    return "*" in a or kanji_text in a


def forms(entry: dict, preferred: set[str]) -> tuple[str, str | None] | None:
    """(written form, reading). Reading is None for words written in kana.
    A spelling listed in the curation files wins over the automatic choice."""
    first = entry["sense"][0]
    kana = [k for k in entry["kana"] if not set(k["tags"]) & RARE_KANA] or entry["kana"]
    usually_kana = "uk" in first["misc"]
    chosen = [k for k in entry["kanji"] if k["text"] in preferred]
    kanji = chosen or [k for k in entry["kanji"] if not set(k["tags"]) & RARE_FORM]
    if (usually_kana and not chosen) or not kanji:
        return (kana[0]["text"], None) if kana else None
    # Common spellings first, and among those the one written most often (落とし物 over 落し物).
    kanji.sort(key=lambda k: (not k["common"], -zipf_frequency(k["text"], "ja")))
    written = kanji[0]["text"]
    reading = next((k["text"] for k in kana if applies(k, written)), kana[0]["text"])
    return written, reading


def to_hiragana(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def clean_gloss(g: str) -> str:
    return re.sub(r"\s+", " ", g).strip()


# Second senses with these tags are jokes, slang or niche (お釣り: "toilet splashback").
ODD_SENSE = BAD_MISC | {"col", "joc", "sl", "hon", "hum", "pol", "id", "net-sl", "male", "fem", "chn"}


def meanings(entry: dict) -> list[str]:
    """Up to three glosses of the main sense, then the first gloss of a plain second sense."""
    senses = [s for s in entry["sense"] if not set(s["misc"]) & BAD_MISC] or entry["sense"]
    out = [clean_gloss(g["text"]) for g in senses[0]["gloss"][:3]]
    if len(senses) > 1 and not set(senses[1]["misc"]) & ODD_SENSE and not senses[1]["field"]:
        g = clean_gloss(senses[1]["gloss"][0]["text"])
        if g not in out:
            out.append(g)
    return out


def main_pos(entry: dict) -> str:
    p = entry["sense"][0]["partOfSpeech"]
    if any(x.startswith("n") for x in p):  # a noun that can take する is still a noun
        return "noun"
    if any(x.startswith("v") for x in p):
        return "verb"
    if any(x.startswith("adj") for x in p):
        return "adj"
    if "adv" in p or "adv-to" in p:
        return "adv"
    if "exp" in p:
        return "exp"
    return "noun"


def load_examples() -> dict[str, dict]:
    """One short example sentence per entry, from Tatoeba via JMdict."""
    data = json.loads((RAW / "jmdict-examples-eng.json").read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for e in data["words"]:
        best = None
        for s in e["sense"][:2]:
            for ex in s.get("examples", []):
                jp = next((x["text"] for x in ex["sentences"] if x["lang"] == "jpn"), None)
                en = next((x["text"] for x in ex["sentences"] if x["lang"] == "eng"), None)
                if jp and en and len(jp) <= 32 and (best is None or len(jp) < len(best["jp"])):
                    best = {"jp": jp, "en": en}
        if best:
            out[e["id"]] = best
    return out


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    jlpt = load_jlpt()
    examples = load_examples()
    data = json.loads((RAW / "jmdict-eng.json").read_text(encoding="utf-8"))

    extras = {l.split("#")[0].strip() for l in (HERE / "curation" / "extra-words.txt").read_text(encoding="utf-8").splitlines()} - {""}
    derived: list[str] = []
    # Readings of every written form among well-known entries, to spot ambiguous kanji.
    readings: dict[str, set[str]] = {}
    for e in data["words"]:
        if e["id"] in jlpt or any(k["common"] for k in e["kanji"]):
            for k in e["kanji"]:
                for r in e["kana"]:
                    if applies(r, k["text"]):
                        readings.setdefault(k["text"], set()).add(to_hiragana(r["text"]))

    picked: dict[str, dict] = {}  # by written form; homographs keep the better-known entry
    skipped = {"grammar": 0, "rare": 0, "long": 0, "dupe": 0}
    # Spellings named anywhere in the curation files.
    preferred = set(extras)
    for path in (HERE / "curation" / "theme-words").glob("*.txt"):
        preferred |= {l.split("#")[0].strip() for l in path.read_text(encoding="utf-8").splitlines()} - {""}

    for e in data["words"]:
        f = forms(e, preferred)
        if not f:
            continue
        jp, kana = f
        if set(e["sense"][0]["partOfSpeech"]) & GRAMMAR_POS and e["id"] not in jlpt:
            skipped["grammar"] += 1
            continue
        if all(set(s["misc"]) & BAD_MISC for s in e["sense"]):
            skipped["rare"] += 1
            continue
        if len(jp) > MAX_LEN:
            skipped["long"] += 1
            continue
        zipf = zipf_frequency(jp, "ja")
        common = any(k["common"] for k in e["kanji"] + e["kana"])
        tokens = tokenize(jp, "ja")
        if e["id"] in jlpt or jp in extras:
            pass
        elif len(tokens) == 1 and zipf >= MIN_ZIPF:
            pass
        elif common and zipf >= MIN_ZIPF_COMMON:
            pass
        elif len(tokens) == 2 and tokens[1] in DERIVING and zipf >= MIN_ZIPF_DERIVED:
            derived.append(jp)  # kept for now; dropped below if its stem did not make it
        else:
            continue
        word = {
            "id": e["id"],
            "jp": jp,
            "kana": to_hiragana(kana) if kana else None,
            "en": meanings(e),
            "jlpt": jlpt.get(e["id"]),
            "zipf": round(zipf, 2),
            "pos": main_pos(e),
            "ex": examples.get(e["id"]),
            # Cross-references, resolved to ids once the vocabulary is known.
            "antRefs": [r[0] for s in e["sense"][:2] for r in s["antonym"]],
            "relRefs": [r[0] for s in e["sense"][:2] for r in s["related"]],
            "field": sorted({x for s in e["sense"] for x in s["field"]}),
            # A written form with several readings (生: なま, き, せい…) cannot have a fair reading question.
            "noRead": kana is not None and len(readings.get(jp, set())) > 1,
        }
        prev = picked.get(jp)
        rank = lambda w: (w["jlpt"] is not None, w["zipf"])
        if prev is None or rank(word) > rank(prev):
            if prev:
                skipped["dupe"] += 1
            picked[jp] = word
        else:
            skipped["dupe"] += 1

    # A derived word (脆弱性) only stays if its stem (脆弱) is in the vocabulary.
    for jp in derived:
        if jp in picked and jp[:-1] not in picked:
            del picked[jp]
    missing_extras = sorted(x for x in extras if x not in picked)
    if missing_extras:
        print("extra words not found in JMdict (check the spelling):", " ".join(missing_extras))

    words = list(picked.values())
    # Resolve cross-references to words in the vocabulary.
    by_form: dict[str, str] = {}
    for w in words:
        by_form.setdefault(w["jp"], w["id"])
        if w["kana"]:
            by_form.setdefault(w["kana"], w["id"])
    for w in words:
        for key in ("antRefs", "relRefs"):
            ids = {by_form[r] for r in w.pop(key) if r in by_form} - {w["id"]}
            w["ant" if key == "antRefs" else "see"] = sorted(ids)

    words.sort(key=lambda w: (-(w["jlpt"] or 0), -w["zipf"]))
    (BUILD / "vocab.json").write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    on_jlpt = sum(1 for w in words if w["jlpt"])
    print(f"{len(words)} words ({on_jlpt} on JLPT lists, {len(words) - on_jlpt} by frequency); skipped {skipped}")
    print(f"with example: {sum(1 for w in words if w['ex'])}, with antonym: {sum(1 for w in words if w['ant'])}, with see-also: {sum(1 for w in words if w['see'])}, no reading question: {sum(1 for w in words if w['noRead'])}")


if __name__ == "__main__":
    main()
