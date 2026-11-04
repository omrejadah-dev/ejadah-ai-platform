"""Build market.district_adjacency from the district polygons: two districts of the same city are neighbours when their
borders touch or come within ~150 m (the stored polygons are thinned, so true neighbours can show small gaps).
Districts without a polygon get no neighbours. Writes data/geo/district_adjacency.csv (both directions), keyed like the
shapes file by region + city name_norm + district name_norm (db/reload/03_geo.sql resolves the ids).
usage: python tools/geo/build_adjacency.py   (needs data/geo/district_shapes.csv only)
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2] / "data" / "geo"
GAP_DEG = 0.0015          # ~150 m at Saudi latitudes

csv.field_size_limit(sys.maxsize if sys.maxsize < 2**31 else 2**31 - 1)

by_city = defaultdict(list)
with open(ROOT / "district_shapes.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        g = shape(json.loads(r["geometry"]))
        if not g.is_valid:
            g = g.buffer(0)
        by_city[(r["region"], r["city"])].append((r["district"], g))

pairs = set()
for city, items in by_city.items():
    ids = [d for d, _ in items]
    geoms = [g for _, g in items]
    tree = STRtree(geoms)
    for i, g in enumerate(geoms):
        for j in tree.query(g.buffer(GAP_DEG)):
            if j != i and g.distance(geoms[j]) <= GAP_DEG:
                pairs.add((*city, ids[i], ids[j]))
                pairs.add((*city, ids[j], ids[i]))

with open(ROOT / "district_adjacency.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["region", "city", "district", "neighbor"])
    w.writerows(sorted(pairs))

deg = defaultdict(int)
for reg, city, a, _ in pairs:
    deg[(reg, city, a)] += 1
n = sum(len(v) for v in by_city.values())
vals = sorted(deg.values())
print(f"{len(pairs)} directed pairs; {len(deg)}/{n} districts have neighbours; "
      f"median {vals[len(vals)//2] if vals else 0}, max {vals[-1] if vals else 0}")
