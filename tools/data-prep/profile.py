import sys, glob, os, csv, json, time
import openpyxl
d, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
summary = {}
all_csv = open(os.path.join(out, "all_deals.csv"), "w", newline="", encoding="utf-8")
w = None
for f in sorted(glob.glob(os.path.join(d, "*.xlsx"))):
    t = time.time(); name = os.path.basename(f)
    wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
    info = {"sheets": []}
    for ws in wb.worksheets:
        ws.reset_dimensions()
        header = None; n = 0
        for row in ws.iter_rows(values_only=True):
            if header is None:
                header = [str(c).strip() if c is not None else "" for c in row]
                if w is None:
                    w = csv.writer(all_csv); w.writerow(["_file"] + header)
                info["header"] = header
                continue
            if all(c in (None, "") for c in row): continue
            n += 1
            w.writerow([name] + [("" if c is None else c) for c in row[:len(header)]])
        info["sheets"].append({"name": ws.title, "rows": n})
    wb.close()
    info["seconds"] = round(time.time()-t, 1)
    summary[name] = info
    print(name, info, flush=True)
all_csv.close()
json.dump(summary, open(os.path.join(out, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("DONE")
