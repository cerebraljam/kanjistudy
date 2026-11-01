"""Downloads the raw sources into raw/. Safe to rerun: skips files already there.

Sources (all CC-BY-SA 4.0 or CC-BY; credit them in the app):
- JMdict (EDRDG), English glosses, as JSON by scriptin/jmdict-simplified.
- JMdict example sentences (from Tatoeba, CC-BY 2.0 FR), same project.
- JLPT word lists by Jonathan Waller (tanos.co.uk), matched to JMdict ids by stephenmk/yomitan-jlpt-vocab.
"""

import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

RAW = Path(__file__).parent / "raw"
RELEASES = "https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest"
JLPT = "https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/main/original_data/n{}.csv"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "kanjistudy-pipeline"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def fetch_jmdict() -> None:
    release = json.loads(get(RELEASES))
    # Exact names: "jmdict-eng-common-…" (a smaller edition) must not match "jmdict-eng-".
    wanted = {r"jmdict-eng-\d": "jmdict-eng.json", r"jmdict-examples-eng-\d": "jmdict-examples-eng.json"}
    for asset in release["assets"]:
        name = asset["name"]
        for pattern, out in wanted.items():
            if re.match(pattern, name) and name.endswith(".json.zip"):
                target = RAW / out
                if target.exists():
                    print(f"have {out}")
                    continue
                print(f"downloading {name} ({asset['size'] // 1_000_000} MB)")
                with zipfile.ZipFile(io.BytesIO(get(asset["browser_download_url"]))) as z:
                    member = next(m for m in z.namelist() if m.endswith(".json"))
                    target.write_bytes(z.read(member))
    (RAW / "jmdict-version.txt").write_text(release["tag_name"])


def fetch_jlpt() -> None:
    for level in range(1, 6):
        target = RAW / f"jlpt-n{level}.csv"
        if target.exists():
            print(f"have {target.name}")
            continue
        print(f"downloading JLPT N{level}")
        target.write_bytes(get(JLPT.format(level)))


if __name__ == "__main__":
    RAW.mkdir(exist_ok=True)
    fetch_jmdict()
    fetch_jlpt()
    print("done")
