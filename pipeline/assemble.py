"""Turns the review decisions on discovered groups into themes.

Reads build/groups.json (from discover.py) and curation/review/*.jsonl (one decision per group:
keep / split / reject) and curation/theme-renames.json (name fixes by theme id). Writes curation/discovered-themes.json, which build.py uses next to the
hand-made themes in curation/themes.json. Themes that share an id are merged.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
BUILD = HERE / "build"
CURATION = HERE / "curation"
CATEGORIES = {"暮らし", "仕事", "社会", "考え", "言葉"}
MIN_WORDS, MAX_WORDS = 8, 60


def main() -> int:
    groups = {g["id"]: g for g in json.loads((BUILD / "groups.json").read_text(encoding="utf-8"))}
    hand = {t["id"] for t in json.loads((CURATION / "themes.json").read_text(encoding="utf-8"))}
    decisions = {}
    problems = []
    for path in sorted((CURATION / "review").glob("*.jsonl")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                d = json.loads(line)
                decisions[d["group"]] = d
            except (json.JSONDecodeError, KeyError) as e:
                problems.append(f"{path.name}:{n}: {e}")
    missing = sorted(set(groups) - set(decisions))
    if missing:
        problems.append(f"{len(missing)} groups have no decision: {missing[:20]}")

    themes: dict[str, dict] = {}
    counts = {"keep": 0, "split": 0, "reject": 0}

    def add(t: dict, words: list[str], group: int) -> None:
        tid = t["id"] if t["id"] not in hand else f"{t['id']}-2"
        if t.get("category") not in CATEGORIES:
            problems.append(f"group {group}: theme {tid} has category {t.get('category')!r}")
        members = set(groups[group]["words"])
        stray = [w for w in words if w not in members]
        if stray:
            problems.append(f"group {group}: {tid} lists words not in the group: {stray[:5]}")
        words = [w for w in words if w in members]
        if tid in themes:
            themes[tid]["words"] += [w for w in words if w not in themes[tid]["words"]]
            themes[tid]["groups"].append(group)
        else:
            themes[tid] = {"id": tid, "jp": t["jp"], "en": t["en"], "category": t.get("category", "暮らし"), "words": words, "groups": [group]}

    for gid, d in sorted(decisions.items()):
        if gid not in groups:
            problems.append(f"decision for unknown group {gid}")
            continue
        action = d.get("action")
        counts[action] = counts.get(action, 0) + 1
        if action == "keep":
            drop = set(d.get("drop", []))
            add(d, [w for w in groups[gid]["words"] if w not in drop], gid)
        elif action == "split":
            for t in d["themes"]:
                add(t, t["words"], gid)

    out = []
    for t in themes.values():
        if len(t["words"]) < MIN_WORDS:
            problems.append(f"{t['id']} has only {len(t['words'])} words: left out")
            continue
        if len(t["words"]) > MAX_WORDS:
            problems.append(f"{t['id']} has {len(t['words'])} words (merged from groups {t['groups']}): consider splitting")
        out.append(t)
    renames_path = CURATION / "theme-renames.json"
    renames = json.loads(renames_path.read_text(encoding="utf-8")) if renames_path.exists() else {}
    for t in out:
        t.update(renames.pop(t["id"], {}))
    for tid in renames:
        problems.append(f"theme-renames: no theme {tid}")
    out.sort(key=lambda t: (t["category"], t["id"]))
    (CURATION / "discovered-themes.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    by_cat = {c: sum(1 for t in out if t["category"] == c) for c in sorted(CATEGORIES)}
    print(f"decisions {counts}; {len(out)} themes {by_cat}; {sum(len(t['words']) for t in out)} word slots")
    for p in problems:
        print("  !", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
