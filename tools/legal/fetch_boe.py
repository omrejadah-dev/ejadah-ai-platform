"""Download the real-estate laws from the Bureau of Experts (laws.boe.gov.sa) and split them into articles.

PDFs are not usable for text (REGA's are scanned images, others come out with reversed ligatures), so the official
web pages are the source. Each law page lists its articles as div.article_item with an h3 label ("المادة الأولى").
Amended articles ("changed-article") show the ORIGINAL text and keep every amendment (decree, date, new wording)
in a hidden popup; both are kept, so an answer can quote the amendment, not only the original.

usage: python tools/legal/fetch_boe.py     (needs lxml)
       → data/legal/raw/<id>.html (download cache) and data/legal/articles.jsonl
"""
import html as htmllib
import json, re, sys, time, urllib.request
from pathlib import Path

import lxml.html

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/legal/raw"
OUT = ROOT / "data/legal/articles.jsonl"
BASE = "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/{}/1"

# latest version of each law (older versions of the same law on BOE are left out)
LAWS = [
    ("655fdb42-8c96-422b-b8c4-b04f0095c94c", "نظام المعاملات المدنية"),
    ("d19fbfe8-6517-4e8b-b06a-b09000cefe1b", "نظام ملكية الوحدات العقارية وفرزها وإدارتها"),
    ("99613e6a-6b85-423c-87af-b0ec00b4633e", "نظام بيع وتأجير مشروعات عقارية على الخارطة"),
    ("c9756bfb-ff81-4226-a820-ae8200dc074c", "نظام التسجيل العيني للعقار"),
    ("5efb6f40-d859-47e6-9c8a-b04500943ecc", "نظام المساهمات العقارية"),
    ("a1bdadb5-c518-48bb-a1d0-b33000e66fd1", "نظام تملك غير السعوديين للعقار"),
    ("a98158eb-927b-4f8c-a9ff-a9a700f21e78", "تنظيم الهيئة العامة للعقار"),
    ("eef585a5-c63a-4906-a951-b208009b3eff", "نظام ضريبة التصرفات العقارية"),
    ("6932e745-0f61-4f25-9e4a-a9a700f21d6b", "نظام رسوم الأراضي البيضاء والعقارات الشاغرة"),
    ("bf568515-eef9-4356-9d52-a9a700f2d8c3", "نظام الرهن العقاري المسجل"),
    ("88254f6b-0311-4ed2-be96-a9a700f2d6f2", "نظام التمويل العقاري"),
    ("3c547223-8703-41cf-a850-b35c00d3ab9a", "نظام نزع ملكية العقارات للمصلحة العامة ووضع اليد المؤقت على العقارات"),
    ("220f5444-31ee-4132-8712-aeee00ac1ba3", "نظام استئجار الدولة للعقار"),
    ("81bd35e9-ee8d-47bf-97c7-a9a700f2100a", "نظام التصرف في العقارات البلدية"),
    ("40754577-f250-47f6-8a5a-abf600af7d72", "نظام التوثيق"),
    ("2d8aa57a-3b29-438e-a686-acae00b6728d", "نظام صندوق التنمية العقارية"),
    ("3ab82e3c-de46-4463-a939-a9a700f1b2af", "نظام المشاركة بالوقت في الوحدات العقارية السياحية"),
    ("9537b1e5-bfb5-499e-b0f9-accd0142beda", "تنظيم الهيئة العامة لعقارات الدولة"),
]


def fetch(law_id: str) -> str:
    f = RAW / f"{law_id}.html"
    if f.exists() and f.stat().st_size > 10_000:
        return f.read_text(encoding="utf-8")
    req = urllib.request.Request(BASE.format(law_id), headers={"User-Agent": "Mozilla/5.0 (ejadah-legal-fetch)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        h = r.read().decode("utf-8", errors="replace")
    f.write_text(h, encoding="utf-8")
    time.sleep(1.5)   # be polite to a government site
    return h


def text_of(fragment: str) -> str:
    """HTML fragment → text with paragraphs and list items on their own lines."""
    t = re.sub(r"<\s*(br|/p|/li|/div)\s*/?>", "\n", fragment, flags=re.I)
    t = re.sub(r"<li[^>]*>", "\n- ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmllib.unescape(t).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n")]
    return "\n".join(l for l in lines if l)


def html_of(el) -> str:
    return lxml.html.tostring(el, encoding="unicode")


def parse(h: str):
    """Yield (chapter, label, text, amendments) in page order. Chapter headings are h3.center outside any article."""
    root = lxml.html.fromstring(h)
    chapter = ""
    for el in root.iter("h3", "div"):
        cls = (el.get("class") or "").split()
        if el.tag == "h3":
            if "center" in cls and not el.xpath("ancestor::div[contains(concat(' ',@class,' '),' article_item ')]"):
                chapter = text_of(html_of(el)).replace("\n", " ")
            continue
        if "article_item" not in cls:
            continue
        head = el.xpath("./h3")
        if not head:
            continue
        label = text_of(html_of(head[0])).replace("\n", " ").rstrip(" :")
        main = [c for c in el.xpath(".//div[contains(@class,'HTMLContainer')]")
                if not c.xpath("ancestor::div[contains(@class,'popup-list')]")]
        amendments = [text_of(html_of(c)) for c in el.xpath(".//div[contains(@class,'popup-list')]//div[contains(@class,'HTMLContainer')]")]
        body = "\n".join(text_of(html_of(c)) for c in main).strip()
        if label.startswith("المادة") and body:
            yield chapter, label, body, [a for a in amendments if a]


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    n_total = n_amended = 0
    with OUT.open("w", encoding="utf-8") as out:
        for law_id, title in LAWS:
            rows = list(parse(fetch(law_id)))
            for i, (chapter, label, body, amendments) in enumerate(rows, 1):
                out.write(json.dumps({"doc_key": law_id, "title": title, "authority": "هيئة الخبراء بمجلس الوزراء",
                                      "source_url": BASE.format(law_id), "seq": i, "chapter": chapter,
                                      "label": label, "text": body, "amendments": amendments}, ensure_ascii=False) + "\n")
            amended = sum(1 for r in rows if r[3])
            n_total += len(rows); n_amended += amended
            print(f"{len(rows):4} articles ({amended:2} amended)  {title}")
    print(f"total {n_total} articles, {n_amended} amended -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
