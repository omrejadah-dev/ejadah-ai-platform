"""Search quality check for the legal assistant: runs every question in eval_questions.csv through legal.search and
counts how often the expected article comes up first, in the top 3, and in the top 6 (the 6 articles Haiku is given).
Off-topic questions pass only when the search finds nothing. Run after any change to legal.search or the library.
usage: python tools/legal/eval_search.py                 scores + the questions that missed
       python tools/legal/eval_search.py --all           every question with its first result
       python tools/legal/eval_search.py --xlsx FILE     also write the review sheet for the lawyer (needs openpyxl)
The database runs in Docker (infra/docker-compose.yml); set PG_CONTAINER if the container name differs.
"""
import csv, io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARTICLES = HERE.parents[1] / "data/legal/legal_articles.csv"
CONTAINER = os.environ.get("PG_CONTAINER", "ejadah-ai-postgres")
TOP = 6

sys.stdout.reconfigure(encoding="utf-8")


def load_cases():
    lines = [l for l in (HERE / "eval_questions.csv").read_text(encoding="utf-8").splitlines() if l and not l.startswith("#")]
    cases = list(csv.DictReader(lines))
    for c in cases:
        c["articles"] = {int(s) for s in c["articles"].split()}
    return cases


def load_articles():
    with open(ARTICLES, encoding="utf-8") as f:
        return {(r["title"], int(r["seq"])): r for r in csv.DictReader(f)}


def check_cases(cases, articles):
    laws = {t for t, _ in articles}
    bad = [f"{c['id']}: unknown law" for c in cases if c["law"] and c["law"] not in laws]
    bad += [f"{c['id']}: no article {s}" for c in cases for s in c["articles"] if (c["law"], s) not in articles]
    if bad:
        sys.exit("eval_questions.csv does not match the library:\n  " + "\n  ".join(bad))


def run_search(cases):
    values = ",\n".join("('{}', '{}')".format(c["id"], c["question"].replace("'", "''")) for c in cases)
    sql = f"""
WITH q(id, question) AS (VALUES {values})
SELECT q.id, s.pos, s.title, a.seq
FROM q CROSS JOIN LATERAL legal.search(q.question, {TOP})
       WITH ORDINALITY AS s(article_id, document_id, title, label, chapter, text, amendments, source_url, rank, pos)
JOIN legal.articles a ON a.id = s.article_id
ORDER BY q.id, s.pos;"""
    out = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-U", "ejadah", "-d", "ejadah_ai", "--csv", "-v", "ON_ERROR_STOP=1"],
                         input=sql.encode("utf-8"), capture_output=True)
    if out.returncode:
        sys.exit(out.stderr.decode("utf-8", "replace"))
    results = {}
    for r in csv.DictReader(io.StringIO(out.stdout.decode("utf-8"))):
        results.setdefault(r["id"], []).append((r["title"], int(r["seq"])))
    return results


def position(case, found):
    """1-based rank of the first expected article in the results, or None."""
    for i, (title, seq) in enumerate(found, 1):
        if title == case["law"] and (not case["articles"] or seq in case["articles"]):
            return i
    return None


def report(cases, results, articles, show_all):
    label = lambda title, seq: f"{title} / {articles[(title, seq)]['label']}"
    in_scope = [c for c in cases if c["law"]]
    off_topic = [c for c in cases if not c["law"]]
    hits = {1: 0, 3: 0, TOP: 0}
    rows = []
    for c in in_scope:
        found = results.get(c["id"], [])
        p = position(c, found)
        for k in hits:
            hits[k] += p is not None and p <= k
        ok = p is not None and p <= 3
        if show_all or not ok:
            first = label(*found[0]) if found else "(nothing found)"
            rows.append(f"  {c['id']}  {'top-3' if ok else ('#' + str(p) if p else 'MISS ')}  {c['question']}\n"
                        f"         first: {first}")
    quiet = sum(not results.get(c["id"]) for c in off_topic)
    for c in off_topic:
        found = results.get(c["id"], [])
        if show_all or found:
            rows.append(f"  {c['id']}  {'none ' if not found else 'FOUND'}  {c['question']}"
                        + (f"\n         first: {label(*found[0])}" if found else ""))

    n = len(in_scope)
    print(f"Legal search: {n} questions with a known answer, {len(off_topic)} off-topic\n")
    print(f"  right article first        {hits[1]:3} / {n}  ({hits[1] / n:.0%})")
    print(f"  right article in top 3     {hits[3]:3} / {n}  ({hits[3] / n:.0%})")
    print(f"  right article in top {TOP}     {hits[TOP]:3} / {n}  ({hits[TOP] / n:.0%})   <- what Haiku gets to read")
    print(f"  off-topic, nothing found   {quiet:3} / {len(off_topic)}")
    if rows:
        print("\n" + ("All questions:" if show_all else "Missed (not in top 3, or off-topic that found something):"))
        print("\n".join(rows))


def write_review_sheet(cases, articles, path):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "الأسئلة"
    ws.sheet_view.rightToLeft = True
    head = ["الرقم", "السؤال", "النظام", "المادة المتوقعة", "نص المادة", "صحيحة؟ (نعم / لا)", "المادة الصحيحة إن كانت غيرها", "ملاحظات"]
    ws.append(head)
    for c in cases:
        if not c["law"]:
            ws.append([c["id"], c["question"], "خارج الأنظمة العقارية", "المتوقع: «لم أجد»", "", "", "", ""])
        elif not c["articles"]:
            ws.append([c["id"], c["question"], c["law"], "أي مادة من النظام", "", "", "", ""])
        else:
            seqs = sorted(c["articles"])
            ws.append([c["id"], c["question"], c["law"],
                       "\n".join(articles[(c["law"], s)]["label"] for s in seqs),
                       "\n\n".join(f"{articles[(c['law'], s)]['label']}: {articles[(c['law'], s)]['text']}" for s in seqs),
                       "", "", ""])
    for col, width in zip("ABCDEFGH", (8, 40, 30, 24, 90, 14, 26, 30)):
        ws.column_dimensions[col].width = width
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="DDEBF7")
    for row in ws.iter_rows():
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top", horizontal="right")
    ws.freeze_panes = "C2"
    wb.save(path)
    print(f"\nReview sheet: {path}")


if __name__ == "__main__":
    cases, articles = load_cases(), load_articles()
    check_cases(cases, articles)
    report(cases, run_search(cases), articles, "--all" in sys.argv)
    if "--xlsx" in sys.argv:
        write_review_sheet(cases, articles, sys.argv[sys.argv.index("--xlsx") + 1])
