"""Build market.district_adjacency from the district polygons: two districts of the same city are neighbours when their
borders touch or come within ~150 m (the stored polygons are thinned, so true neighbours can show small gaps).
Districts without a polygon get no neighbours. Writes data/geo/district_adjacency.csv (both directions).
usage: python tools/geo/build_adjacency.py   (needs data/geo/district_shapes.csv and the ejadah-ai-postgres container)
"""
import csv, json, subprocess, sys
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2] / "data" / "geo"
GAP_DEG = 0.0015          # ~150 m at Saudi latitudes

csv.field_size_limit(sys.maxsize if sys.maxsize < 2**31 else 2**31 - 1)

# district -> city from the database (the shapes file has no city column)
out = subprocess.run(["docker", "exec", "ejadah-ai-postgres", "psql", "-U", "ejadah", "-d", "ejadah_ai", "-tA", "-F", "|",
                      "-c", "select id, city_id from market.districts"], capture_output=True, text=True, check=True).stdout
city_of = {int(a): int(b) for a, b in (l.split("|") for l in out.splitlines() if l.strip())}

by_city = defaultdict(list)
with open(ROOT / "district_shapes.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        did = int(r["district_id"])
        g = shape(json.loads(r["geometry"]))
        if not g.is_valid:
            g = g.buffer(0)
        by_city[city_of[did]].append((did, g))

pairs = set()
for city, items in by_city.items():
    ids = [d for d, _ in items]
    geoms = [g for _, g in items]
    tree = STRtree(geoms)
    for i, g in enumerate(geoms):
        for j in tree.query(g.buffer(GAP_DEG)):
            if j != i and g.distance(geoms[j]) <= GAP_DEG:
                pairs.add((ids[i], ids[j]))
                pairs.add((ids[j], ids[i]))

with open(ROOT / "district_adjacency.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["district_id", "neighbor_id"])
    w.writerows(sorted(pairs))

deg = defaultdict(int)
for a, _ in pairs:
    deg[a] += 1
n = sum(len(v) for v in by_city.values())
vals = sorted(deg.values())
print(f"{len(pairs)} directed pairs; {len(deg)}/{n} districts have neighbours; "
      f"median {vals[len(vals)//2] if vals else 0}, max {vals[-1] if vals else 0}")
