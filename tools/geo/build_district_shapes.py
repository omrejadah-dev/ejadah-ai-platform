"""Match our normalised districts (Jeddah, Riyadh) to the open polygon dataset and write data/geo/district_shapes.csv.

Matching is automatic only: same normalised name (spaces ignored, optional "ال" prefix). Unmatched districts get no shape.
usage: python tools/geo/build_district_shapes.py   (needs data/geo/districts.json and data/geo/ours.txt)
ours.txt = psql export "city_id|id|name|name_norm|n_deals" for the enabled cities.
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "geo"
CITY_MAP = {223: 18, 44: 3}          # our city id → dataset city id (جدة, الرياض)
SKIP = {"حكومي", "صناعي", "المنطقه الصناعيه"}


def norm(t: str) -> str:
    t = re.sub(r"^\s*ح[يى]\s+", "", t or "")
    t = re.sub("[ً-ْـ]", "", t)
    t = t.translate(str.maketrans("أإآٱةىئؤ", "ااااهييو"))
    return re.sub(r"[\s\-_/\\.,،]+", "", t)       # spaces dropped: "عبد المجيد" == "عبدالمجيد"


def thin(ring, max_pts=160):
    step = max(1, len(ring) // max_pts)
    pts = ring[::step]
    if pts[-1] != ring[-1]:
        pts.append(ring[-1])
    return [[round(lng, 5), round(lat, 5)] for lat, lng in pts]   # dataset is [lat, lng]; GeoJSON wants [lng, lat]


def to_geometry(boundaries: str):
    polys = json.loads(boundaries) if isinstance(boundaries, str) else boundaries   # [[ [lat,lng], ... ], ...]
    rings = [thin(r) for r in polys if len(r) >= 3]
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": [rings[0]]}
    return {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}


def centroid(geom):
    pts = [p for ring in (geom["coordinates"] if geom["type"] == "Polygon" else [r[0] for r in geom["coordinates"]]) for p in ring]
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


def main():
    geo = json.load(open(ROOT / "districts.json", encoding="utf-8"))
    ours = [l.split("|") for l in (ROOT / "ours.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
    rows, report = [], {}
    for our_city, geo_city in CITY_MAP.items():
        idx = {}
        for g in geo:
            if g["city_id"] == geo_city and norm(g["name_ar"]) not in SKIP:
                idx.setdefault(norm(g["name_ar"]), []).append(g)
        tot = hit = 0
        for city_id, did, name, name_norm, n in ours:
            if int(city_id) != our_city:
                continue
            tot += int(n)
            k = norm(name_norm)
            cand = idx.get(k) or idx.get("ال" + k) or (idx.get(k[2:]) if k.startswith("ال") else None)
            if not cand:
                continue
            geoms = [to_geometry(c["boundaries"]) for c in cand]
            if len(geoms) == 1:
                geom = geoms[0]
            else:
                parts = []
                for g in geoms:
                    parts += [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
                geom = {"type": "MultiPolygon", "coordinates": parts}
            lat, lng = centroid(geom)
            rows.append([did, cand[0]["name_ar"], json.dumps(geom, separators=(",", ":")), f"{lat:.6f}", f"{lng:.6f}"])
            hit += int(n)
        report[our_city] = f"{100 * hit / max(tot, 1):.1f}% of market deals have a shape"
    # one shape per polygon: if two of our districts hit the same polygon keep the busier (first in input order is not guaranteed)
    seen, final = set(), []
    for r in rows:
        key = r[1] + r[3]
        if key in seen:
            continue
        seen.add(key)
        final.append(r)
    with open(ROOT / "district_shapes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["district_id", "geo_name", "geometry", "center_lat", "center_lng"])
        w.writerows(final)
    print(f"wrote {len(final)} shapes", report)


if __name__ == "__main__":
    sys.exit(main())
