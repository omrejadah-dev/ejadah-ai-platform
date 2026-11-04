"""Match our normalised districts (every city, all 13 regions) to the open polygon dataset and write data/geo/district_shapes.csv.

Matching is automatic only: same region, same normalised city name, then same normalised district name
(spaces ignored, optional "ال" prefix). Unmatched districts get no shape and are simply not drawn.
usage: python tools/geo/build_district_shapes.py
needs data/geo/{districts,cities,regions}.json from github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts
and data/geo/ours.txt = our districts busiest-first, "region|city_name|city_norm|district_name|district_norm|n_deals".
ours.txt is written from the database when it is missing (or with --refresh-ours); container from PG_CONTAINER.
The output is keyed by region + city name_norm + district name_norm (market.cities / market.districts natural keys), never by
district id: ids belong to one database, db/reload/03_geo.sql resolves them at load time.
"""
import csv, json, os, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "data" / "geo"
# our region text → dataset region_id
REGION = {"الرياض": 1, "مكة المكرمة": 2, "المدينة المنورة": 3, "القصيم": 4, "الشرقية": 5, "عسير": 6, "تبوك": 7,
          "حايل": 8, "الحدود الشمالية": 9, "جيزان": 10, "نجران": 11, "الباحة": 12, "الجوف": 13}
# our city name → dataset city names when they differ (the MOJ data reports Al-Ahsa as one city)
CITY_ALIASES = {"الاحساء": ["الهفوف", "المبرز"]}
SKIP = {"حكومي", "صناعي", "المنطقهالصناعيه"}
OURS_SQL = """
select c.region, c.name, c.name_norm, d.name, d.name_norm, count(x.deal_id)
from market.districts d join market.cities c on c.id = d.city_id
left join market.deals x on x.district_id = d.id and x.is_market_deal
where not d.is_unknown
group by c.region, c.name, c.name_norm, d.name, d.name_norm
order by count(x.deal_id) desc, c.region, c.name_norm, d.name_norm
"""


def export_ours():
    container = os.environ.get("PG_CONTAINER", "ejadah-ai-postgres")
    out = subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "ejadah", "-d", "ejadah_ai", "-tA", "-F", "|", "-c", OURS_SQL],
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    (ROOT / "ours.txt").write_text(out, encoding="utf-8", newline="\n")


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


def to_geometry(boundaries):
    polys = json.loads(boundaries) if isinstance(boundaries, str) else boundaries
    rings = [thin(r) for r in polys if len(r) >= 3]
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": [rings[0]]}
    return {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}


def merge(geoms):
    if len(geoms) == 1:
        return geoms[0]
    parts = []
    for g in geoms:
        parts += [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    return {"type": "MultiPolygon", "coordinates": parts}


def centroid(geom):
    rings = geom["coordinates"] if geom["type"] == "Polygon" else [p[0] for p in geom["coordinates"]]
    pts = [p for r in rings for p in r]
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    geo = json.load(open(ROOT / "districts.json", encoding="utf-8"))
    gcities = json.load(open(ROOT / "cities.json", encoding="utf-8"))
    city_key = {}                                            # (region_id, norm name) → dataset city ids
    for c in gcities:
        city_key.setdefault((c["region_id"], norm(c["name_ar"])), []).append(c["city_id"])
    by_city = defaultdict(lambda: defaultdict(list))        # dataset city → norm district → polygons
    for g in geo:
        k = norm(g["name_ar"])
        if k not in SKIP:
            by_city[g["city_id"]][k].append(g)

    if "--refresh-ours" in sys.argv or not (ROOT / "ours.txt").exists():
        export_ours()
    ours = [l.split("|") for l in (ROOT / "ours.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
    rows, seen, per_city = [], set(), defaultdict(lambda: [0, 0, 0])   # city → [deals, deals with shape, districts with shape]
    for region, city_name, city_norm, dname, dnorm, n in ours:
        n = int(n)
        stats = per_city[(region, city_name)]
        stats[0] += n
        rid = REGION.get(region)
        if rid is None:
            continue
        names = CITY_ALIASES.get(city_name, [city_name])
        gids = [g for nm in names for g in city_key.get((rid, norm(nm)), [])]
        if not gids:
            continue
        k = norm(dnorm)
        cand = []
        for gid in gids:
            idx = by_city[gid]
            cand += idx.get(k) or idx.get("ال" + k) or (idx.get(k[2:]) if k.startswith("ال") else None) or []
        if not cand:
            continue
        key = tuple(sorted(c["district_id"] for c in cand))
        if key in seen:                                     # one polygon → one of our districts (input is busiest-first)
            continue
        seen.add(key)
        geom = merge([to_geometry(c["boundaries"]) for c in cand])
        lat, lng = centroid(geom)
        rows.append([region, city_norm, dnorm, cand[0]["name_ar"], json.dumps(geom, separators=(",", ":")), f"{lat:.6f}", f"{lng:.6f}"])
        stats[1] += n
        stats[2] += 1

    with open(ROOT / "district_shapes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["region", "city", "district", "geo_name", "geometry", "center_lat", "center_lng"])
        w.writerows(rows)

    covered = [(k, v) for k, v in per_city.items() if v[2] >= 3]
    covered.sort(key=lambda kv: -kv[1][0])
    tot = sum(v[0] for v in per_city.values()); hit = sum(v[1] for v in per_city.values())
    print(f"wrote {len(rows)} shapes for {len(covered)} cities (>=3 districts); {100*hit/tot:.1f}% of all market deals have a shape")
    for (reg, name), (n, h, d) in covered[:25]:
        print(f"  {reg:16} {name:18} districts={d:4} coverage={100*h/max(n,1):5.1f}%")


if __name__ == "__main__":
    sys.exit(main())
