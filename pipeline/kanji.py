"""Readings and meanings of every kanji the dataset uses, for the app's word details panel.
Writes ../public/data/kanji.json. Run after build.py.

From KANJIDIC2 (EDRDG, CC BY-SA 4.0), via jmdict-simplified. Each kanji becomes
    "駅": [["エキ"], [], ["station"], 14]
on readings (katakana), kun readings (hiragana, okurigana after a dot: "あ.う"), meanings, strokes.
"""

import json
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE.parent / "public" / "data"
MEANINGS = 4
READINGS = 6


def main() -> None:
    ds = json.loads((DATA / "dataset.json").read_text(encoding="utf-8"))
    used = {c for w in ds["words"] for c in w["jp"] if "一" <= c <= "鿿" or c == "々"}
    kd = json.loads((HERE / "raw" / "kanjidic2-en.json").read_text(encoding="utf-8"))
    out = {}
    for ch in kd["characters"]:
        if ch["literal"] not in used:
            continue
        rm = ch.get("readingMeaning") or {"groups": []}
        on, kun, en = [], [], []
        for g in rm["groups"]:
            for r in g["readings"]:
                if r["type"] == "ja_on" and r["value"] not in on:
                    on.append(r["value"])
                elif r["type"] == "ja_kun" and r["value"] not in kun:
                    kun.append(r["value"])
            en += [m["value"] for m in g["meanings"] if m["lang"] == "en" and m["value"] not in en]
        strokes = (ch["misc"].get("strokeCounts") or [0])[0]
        out[ch["literal"]] = [on[:READINGS], kun[:READINGS], en[:MEANINGS], strokes]
    path = DATA / "kanji.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    missing = sorted(used - out.keys())
    print(f"kanji: {len(out)} of {len(used)}, {path.stat().st_size // 1024} KB" + (f"; not in KANJIDIC2: {''.join(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
