"""Render the whole Kingdom as a static SVG for the login page: the 13 region borders, and every mapped district in gold
whose intensity follows its land price/m² (last 24 months, ranked across the Kingdom), so the cities glow.

usage: python tools/geo/build_login_map.py   (reads from the local Postgres container, writes frontend/apps/web/public/brand/kingdom-map.svg)
The file is decorative and public: it carries shapes and a colour only, no numbers.
"""
import json, math, subprocess
from pathlib import Path

from shapely.geometry import shape, mapping

OUT = Path(__file__).resolve().parents[2] / "frontend/apps/web/public/brand/kingdom-map.svg"
SQL_DISTRICTS = """
with asof as (select data_as_of d from market.v_meta),
st as (select district_id, percentile_cont(0.5) within group (order by ppm) p
       from market.deals where is_market_deal and type_group = 'land'
         and deal_date > (select d from asof) - interval '24 months' group by district_id having count(*) >= 5)
select json_agg(json_build_object('g', s.geometry, 'p', st.p))
from market.district_shapes s left join st on st.district_id = s.district_id
"""
SQL_REGIONS = """
select json_agg(json_build_object('g', r.geometry, 'p', y.p))
from market.region_shapes r
left join (select region, sum(ppm_median * n_deals) / nullif(sum(n_deals), 0) p from market.mv_region_year
           where type_group = 'land' and year >= extract(year from (select data_as_of from market.v_meta))::int - 1 group by region) y
  on y.region = r.region
"""


def query(sql):
    return json.loads(subprocess.run(
        ["docker", "exec", "-i", "ejadah-ai-postgres", "psql", "-U", "ejadah", "-d", "ejadah_ai", "-tA", "-c", sql],
        capture_output=True, text=True, encoding="utf-8", check=True).stdout)


def rings(g):
    return g["coordinates"] if g["type"] == "Polygon" else [r for poly in g["coordinates"] for r in poly]


def simplified(g, tol):
    s = shape(g).simplify(tol, preserve_topology=True)
    return mapping(s) if not s.is_empty else None


region_rows = [{"g": simplified(r["g"], 0.02), "p": r["p"]} for r in query(SQL_REGIONS)]
regions = [r["g"] for r in region_rows]
region_prices = sorted(r["p"] for r in region_rows if r["p"])
districts = [{"g": simplified(r["g"], 0.004), "p": r["p"]} for r in query(SQL_DISTRICTS)]
districts = [d for d in districts if d["g"]]

# equirectangular projection around the Kingdom's middle latitude, framed on the region borders
pts = [p for g in regions for ring in rings(g) for p in ring]
k = math.cos(math.radians(sum(p[1] for p in pts) / len(pts)))
minx = min(p[0] for p in pts) * k; maxx = max(p[0] for p in pts) * k
miny = min(p[1] for p in pts); maxy = max(p[1] for p in pts)
W = 1000; pad = 10
s = (W - 2 * pad) / (maxx - minx)
H = (maxy - miny) * s + 2 * pad


def path(g):
    out = []
    for ring in rings(g):
        xy = [(pad + (x * k - minx) * s, pad + (maxy - y) * s) for x, y in ring]
        out.append("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in xy) + "Z")
    return "".join(out)


prices = sorted(d["p"] for d in districts if d["p"])
def level(p):
    if not p:
        return None
    lo, hi = 0, len(prices)
    while lo < hi:
        mid = (lo + hi) // 2
        if prices[mid] < p: lo = mid + 1
        else: hi = mid
    return lo / max(1, len(prices) - 1)


# regions: gold wash ranked by recent land price, so the map reads at a glance; districts glow on top
parts = []
for r in region_rows:
    rank = region_prices.index(r["p"]) / max(1, len(region_prices) - 1) if r["p"] else 0
    parts.append(f'<path d="{path(r["g"])}" fill="#c8b591" fill-opacity="{0.04 + 0.22 * rank:.2f}" '
                 f'stroke="#c8b591" stroke-opacity="0.5" stroke-width="1.2"/>')
for d in districts:
    lv = level(d["p"])
    if lv is None:
        parts.append(f'<path d="{path(d["g"])}" fill="#c8b591" fill-opacity="0.12"/>')
    else:
        parts.append(f'<path d="{path(d["g"])}" fill="#c8b591" fill-opacity="{0.25 + 0.7 * lv:.2f}"/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H:.0f}" stroke-linejoin="round">' + "".join(parts) + "</svg>")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(svg, encoding="utf-8")
print(f"wrote {OUT} ({len(svg)//1024} KB, {len(regions)} regions, {len(districts)} districts, viewBox {W}x{H:.0f})")
