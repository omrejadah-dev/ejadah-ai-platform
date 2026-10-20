"""Render Jeddah's districts as a static SVG for the login page: gold intensity = land price/m² (last 24 months).

usage: python tools/geo/build_login_map.py   (reads from the local Postgres container, writes frontend/apps/web/public/brand/jeddah-districts.svg)
The file is decorative and public: it carries shapes and a colour only, no numbers.
"""
import json, math, subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "frontend/apps/web/public/brand/jeddah-districts.svg"
SQL = """
with asof as (select data_as_of d from market.v_meta),
st as (select district_id, percentile_cont(0.5) within group (order by ppm) p
       from market.deals where is_market_deal and city_id = 223 and type_group = 'land'
         and deal_date > (select d from asof) - interval '24 months' group by district_id having count(*) >= 5)
select json_agg(json_build_object('g', s.geometry, 'p', st.p))
from market.district_shapes s join market.districts d on d.id = s.district_id and d.city_id = 223
left join st on st.district_id = d.id
"""

rows = json.loads(subprocess.run(
    ["docker", "exec", "-i", "ejadah-ai-postgres", "psql", "-U", "ejadah", "-d", "ejadah_ai", "-tA", "-c", SQL],
    capture_output=True, text=True, encoding="utf-8", check=True).stdout)

def rings(g):
    return g["coordinates"] if g["type"] == "Polygon" else [r for poly in g["coordinates"] for r in poly]

pts = [p for r in rows for ring in rings(r["g"]) for p in ring]
lat0 = sum(p[1] for p in pts) / len(pts)
k = math.cos(math.radians(lat0))
xs = [p[0] * k for p in pts]; ys = [p[1] for p in pts]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
W = 600; H = W * (maxy - miny) / (maxx - minx); pad = 12
sx = (W - 2 * pad) / (maxx - minx)

prices = sorted(r["p"] for r in rows if r["p"])
def level(p):
    if not p: return None
    i = sum(1 for q in prices if q < p)
    return i / max(1, len(prices) - 1)

paths = []
for r in rows:
    d = " ".join(
        "M" + " L".join(f"{pad + (x * k - minx) * sx:.1f},{pad + (maxy - y) * sx:.1f}" for x, y in ring) + " Z"
        for ring in rings(r["g"]))
    lv = level(r["p"])
    if lv is None:
        paths.append(f'<path d="{d}" fill="#ffffff" fill-opacity="0.03" stroke="#c8b591" stroke-opacity="0.18"/>')
    else:
        paths.append(f'<path d="{d}" fill="#c8b591" fill-opacity="{0.08 + 0.62 * lv:.2f}" stroke="#c8b591" stroke-opacity="0.45"/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H + 2 * pad:.0f}" stroke-width="0.6" stroke-linejoin="round">'
       + "".join(paths) + "</svg>")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(svg, encoding="utf-8")
print(f"wrote {OUT} ({len(svg)//1024} KB, {len(rows)} districts, viewBox {W}x{H + 2*pad:.0f})")
