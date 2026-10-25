"""Laws that come from the Real Estate General Authority (rega.gov.sa) instead of the Bureau of Experts.

REGA pages show the royal decree, then the articles as plain text: each article starts with a line "المادة ..."
and the law ends where the site's cookie notice begins. The text is stored as HTML entities, so it is unescaped first.

usage: python tools/legal/fetch_rega.py   → data/legal/articles_rega.jsonl
"""
import html as htmllib
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/legal/raw"
OUT = ROOT / "data/legal/articles_rega.jsonl"

LAWS = [
    ("rega_brokerage_law", "نظام الوساطة العقارية",
     "https://rega.gov.sa/الأنظمة-والقرارات/الأنظمة-واللوائح-والأدلة/الأنظمة/نظام-الوساطة-العقارية/"),
]
END = "ملفات تعريف الارتباط"
LABEL = re.compile(r"^المادة [^\n:]{2,40}$")


def fetch(key: str, url: str) -> str:
    f = RAW / f"{key}.html"
    if f.exists() and f.stat().st_size > 10_000:
        return f.read_text(encoding="utf-8")
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/"), headers={"User-Agent": "Mozilla/5.0 (ejadah-legal-fetch)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        h = r.read().decode("utf-8", errors="replace")
    f.write_text(h, encoding="utf-8")
    time.sleep(1.5)
    return h


def lines_of(h: str) -> list[str]:
    t = htmllib.unescape(h)
    t = re.sub(r"<\s*(script|style)[^>]*>.*?</\s*\1\s*>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<\s*(br|/p|/li|/div|/h\d|/tr)\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t).replace("\xa0", " ")
    return [l for l in (re.sub(r"[ \t\r]+", " ", x).strip() for x in t.split("\n")) if l]


def parse(h: str):
    lines = lines_of(h)
    start = next(i for i, l in enumerate(lines) if l == "المادة الأولى")
    rows, label, body = [], None, []
    for l in lines[start:]:
        if l.startswith(END):
            break
        if LABEL.match(l):
            if label: rows.append((label, "\n".join(body)))
            label, body = l, []
        else:
            body.append(l)
    if label: rows.append((label, "\n".join(body)))
    return rows


def main():
    n = 0
    with OUT.open("w", encoding="utf-8") as out:
        for key, title, url in LAWS:
            rows = parse(fetch(key, url))
            for i, (label, body) in enumerate(rows, 1):
                out.write(json.dumps({"doc_key": key, "title": title, "authority": "الهيئة العامة للعقار", "source_url": url,
                                      "seq": i, "chapter": "", "label": label, "text": body, "amendments": []},
                                     ensure_ascii=False) + "\n")
            n += len(rows)
            print(f"{len(rows):4} articles  {title}")
    print(f"total {n} -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
