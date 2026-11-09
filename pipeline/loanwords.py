"""Which katakana words are plain transliterations of their English meaning (コンピューター =
computer), as opposed to false friends (マンション = apartment, コンセント = power outlet) and words
from other languages (アルバイト). Used by build.py to mark transliterations, so the app can skip
them for players who find them too easy.

The test compares sounds roughly: the katakana's romaji and each of the first two English meanings
are reduced to their consonants, with the sounds katakana merges counted as one (r/l, b/v, n/m,
k/c/g …), and compared. Run on its own to see the split: `uv run python loanwords.py`.
"""

import re
from difflib import SequenceMatcher

KATA = {
    "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o", "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
    "ガ": "ga", "ギ": "gi", "グ": "gu", "ゲ": "ge", "ゴ": "go", "サ": "sa", "シ": "shi", "ス": "su", "セ": "se", "ソ": "so",
    "ザ": "za", "ジ": "ji", "ズ": "zu", "ゼ": "ze", "ゾ": "zo", "タ": "ta", "チ": "chi", "ツ": "tsu", "テ": "te", "ト": "to",
    "ダ": "da", "ヂ": "ji", "ヅ": "zu", "デ": "de", "ド": "do", "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
    "ハ": "ha", "ヒ": "hi", "フ": "fu", "ヘ": "he", "ホ": "ho", "バ": "ba", "ビ": "bi", "ブ": "bu", "ベ": "be", "ボ": "bo",
    "パ": "pa", "ピ": "pi", "プ": "pu", "ペ": "pe", "ポ": "po", "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
    "ヤ": "ya", "ユ": "yu", "ヨ": "yo", "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro", "ワ": "wa", "ヲ": "o",
    "ン": "n", "ヴ": "vu", "ァ": "a", "ィ": "i", "ゥ": "u", "ェ": "e", "ォ": "o", "ャ": "ya", "ュ": "yu", "ョ": "yo", "ー": "",
    "ッ": "", "・": " ",
}
THRESHOLD = 0.72


def romaji(kata: str) -> str:
    return "".join(KATA.get(c, "") for c in kata)


def outline(s: str, english: bool = False) -> str:
    """The consonants of a word, with the sounds katakana merges as one: computer → kmpt."""
    s = s.lower()
    if english:
        # Spelling to sound: soft c and g, silent gh, and r after a vowel (computer → コンピューター).
        for a, b in (("tion", "shn"), ("sion", "shn"), ("ph", "f"), ("ck", "k"), ("qu", "kw"), ("x", "ks"), ("gh", ""),
                     ("ce", "se"), ("ci", "si"), ("cy", "si"), ("ge", "je"), ("gi", "ji")):
            s = s.replace(a, b)
        s = re.sub(r"(?<=[aeiou])r(?![aeiou])", "", s)
    for a, b in (("th", "s"), ("ch", "t"), ("sh", "s"), ("ts", "t"), ("j", "s")):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z]", "", s)
    s = re.sub(r"[wy]", "", s.translate(str.maketrans("lvmcgqzd", "rbnkkkst")))
    s = re.sub(r"[aeiou]", "", s)
    return re.sub(r"(.)\1+", r"\1", s)


def is_transliteration(jp: str, en: list[str]) -> bool:
    if not re.fullmatch(r"[ァ-ヺー・]+", jp):
        return False
    k = outline(romaji(jp))
    if not k:
        return False
    for g in en[:2]:
        g = re.sub(r"\(.*?\)", "", g).strip()
        g = re.sub(r"^(to|a|an|the) ", "", g)
        e = outline(g, english=True)
        if e == k or (len(k) >= 2 and e and SequenceMatcher(None, k, e).ratio() >= THRESHOLD):
            return True
    return False


if __name__ == "__main__":
    import json
    import random
    from pathlib import Path

    ds = json.loads((Path(__file__).parent.parent / "public" / "data" / "dataset.json").read_text(encoding="utf-8"))
    kata = [w for w in ds["words"] if re.fullmatch(r"[ァ-ヺー・]+", w["jp"])]
    yes = [w for w in kata if is_transliteration(w["jp"], w["en"])]
    no = [w for w in kata if not is_transliteration(w["jp"], w["en"])]
    print(f"{len(kata)} katakana words: {len(yes)} transliterations, {len(no)} false friends or other")
    random.seed(3)
    print("transliterations:", ", ".join(f"{w['jp']}={w['en'][0]}" for w in random.sample(yes, 25)))
    print("kept:", ", ".join(f"{w['jp']}={w['en'][0]}" for w in random.sample(no, 25)))
