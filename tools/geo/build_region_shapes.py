"""Simplify the 13 region boundaries (github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts) for the Kingdom view.
Drops small islands, keeps <= 350 points per ring, writes data/geo/region_shapes.csv keyed by OUR region names.
usage: python tools/geo/build_region_shapes.py   (needs data/geo/regions_full.json)
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "geo"
OURS = {1: "الرياض", 2: "مكة المكرمة", 3: "المدينة المنورة", 4: "القصيم", 5: "الشرقية", 6: "عسير", 7: "تبوك",
        8: "حايل", 9: "الحدود الشمالية", 10: "جيزان", 11: "نجران", 12: "الباحة", 13: "الجوف"}


def thin(ring, max_pts=350):
    step = max(1, len(ring) // max_pts)
    pts = ring[::step]
    if pts[-1] != ring[-1]:
        pts.append(ring[-1])
    return [[round(lng, 4), round(lat, 4)] for lat, lng in pts]


rows = []
for r in json.load(open(ROOT / "regions_full.json", encoding="utf-8")):
    b = r["boundaries"]
    b = json.loads(b) if isinstance(b, str) else b
    big = max(len(x) for x in b)
    rings = [thin(x) for x in b if len(x) >= max(50, big * 0.02)]          # mainland + sizeable islands only
    geom = {"type": "Polygon", "coordinates": [rings[0]]} if len(rings) == 1 else {"type": "MultiPolygon", "coordinates": [[x] for x in rings]}
    lat, lng = r["center"][0], r["center"][1]   # [lat, lng]
    rows.append([OURS[r["region_id"]], r["name_ar"], json.dumps(geom, separators=(",", ":")), f"{lat:.5f}", f"{lng:.5f}"])
    print(r["name_ar"], len(rings), "rings", sum(len(x) for x in rings), "pts")

with open(ROOT / "region_shapes.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["region", "display_name", "geometry", "center_lat", "center_lng"])
    w.writerows(rows)
print("wrote", ROOT / "region_shapes.csv", (ROOT / "region_shapes.csv").stat().st_size // 1024, "KB")
