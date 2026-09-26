#!/usr/bin/env python3
"""Per-footprint ground / eave / ridge heights and a 2 m ground grid from cache/points.npz.

Run after fetch_potree.py --download:  .venv/bin/python compute_heights.py
Writes heights.json and ground_grid.json next to this script.
"""
import json, os
import numpy as np
from shapely.geometry import shape, box
from shapely import contains_xy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GRPK = os.path.join(ROOT, "shadows-of-vilnius-seed", "grpk", "grpk_pastat_oldtown_epsg3346.geojson")
BOX = (582700.0, 6060650.0, 583300.0, 6061250.0)
OX, OY = 583000.0, 6061000.0  # project local origin
CELL = 2.0

p = np.load(os.path.join(HERE, "cache", "points.npz"))
X = p["x"] / 100.0 + OX
Y = p["y"] / 100.0 + OY
Z = p["z"] / 100.0
C = p["c"]
print("points", len(C))

# ---------- ground grid ----------
nx = int(round((BOX[2] - BOX[0]) / CELL))
ny = int(round((BOX[3] - BOX[1]) / CELL))
g = C == 2
ix = np.clip(((X[g] - BOX[0]) / CELL).astype(int), 0, nx - 1)
iy = np.clip(((Y[g] - BOX[1]) / CELL).astype(int), 0, ny - 1)
flat = iy * nx + ix
order = np.lexsort((Z[g], flat))
fs, zs = flat[order], Z[g][order]
starts = np.searchsorted(fs, np.arange(nx * ny))
ends = np.searchsorted(fs, np.arange(nx * ny), side="right")
grid = np.full(nx * ny, np.nan)
cnt = ends - starts
has = cnt > 0
mid = starts + (cnt - 1) // 2
grid[has] = zs[mid[has]]  # median of class-2 z per cell
grid = grid.reshape(ny, nx)
measured = ~np.isnan(grid)
# fill holes (under buildings etc.) by repeated neighbour averaging
filled = grid.copy()
for _ in range(400):
    nan = np.isnan(filled)
    if not nan.any():
        break
    pad = np.pad(filled, 1, constant_values=np.nan)
    nb = np.stack([pad[1:-1, :-2], pad[1:-1, 2:], pad[:-2, 1:-1], pad[2:, 1:-1],
                   pad[:-2, :-2], pad[:-2, 2:], pad[2:, :-2], pad[2:, 2:]])
    with np.errstate(invalid="ignore"):
        s = np.nansum(nb, axis=0)
        k = np.sum(~np.isnan(nb), axis=0)
    upd = nan & (k > 0)
    filled[upd] = s[upd] / k[upd]
print(f"ground grid {nx}x{ny}, measured cells {measured.mean() * 100:.1f}%")


def ground_at(xs, ys):
    jx = np.clip(((np.asarray(xs) - BOX[0]) / CELL).astype(int), 0, nx - 1)
    jy = np.clip(((np.asarray(ys) - BOX[1]) / CELL).astype(int), 0, ny - 1)
    return filled[jy, jx]


# ---------- spatial buckets for points ----------
B = 10.0
bx = ((X - BOX[0]) // B).astype(int)
by = ((Y - BOX[1]) // B).astype(int)
nbx, nby = int((BOX[2] - BOX[0]) // B) + 1, int((BOX[3] - BOX[1]) // B) + 1
bid = np.clip(bx, 0, nbx - 1) * nby + np.clip(by, 0, nby - 1)
border = np.argsort(bid, kind="stable")
bsorted = bid[border]
bstart = np.searchsorted(bsorted, np.arange(nbx * nby))
bend = np.searchsorted(bsorted, np.arange(nbx * nby), side="right")


def pts_in_bbox(minx, miny, maxx, maxy):
    x0 = max(0, int((minx - BOX[0]) // B)); x1 = min(nbx - 1, int((maxx - BOX[0]) // B))
    y0 = max(0, int((miny - BOX[1]) // B)); y1 = min(nby - 1, int((maxy - BOX[1]) // B))
    if x1 < x0 or y1 < y0:
        return np.empty(0, dtype=int)
    parts = [border[bstart[i * nby + y0]:bend[i * nby + y1]] for i in range(x0, x1 + 1)]
    return np.concatenate(parts) if parts else np.empty(0, dtype=int)


# ---------- footprints ----------
fc = json.load(open(GRPK))
area = box(*BOX)
buildings = {}
for f in fc["features"]:
    poly = shape(f["geometry"])
    if not poly.is_valid:
        poly = poly.buffer(0)
    if not poly.intersects(area):
        continue
    tid = f["properties"]["TOP_ID"]
    ring = poly.buffer(3.0).difference(poly)
    idx = pts_in_bbox(*ring.bounds)
    xs, ys, zs, cs = X[idx], Y[idx], Z[idx], C[idx]
    inside = contains_xy(poly, xs, ys)
    inring = contains_xy(ring, xs, ys)
    gz = zs[inring & (cs == 2)]
    bz = zs[inside & (cs == 6)]
    rec = {}
    if len(gz) >= 5:
        rec["ground"] = round(float(np.percentile(gz, 10)), 2)
        rec["ground_src"] = "ring"
    else:  # enclosed yards etc.: fall back to the interpolated ground grid at the ring
        c = poly.centroid
        rec["ground"] = round(float(ground_at([c.x], [c.y])[0]), 2)
        rec["ground_src"] = "grid"
    if len(bz) >= 10:
        rec["eave"] = round(float(np.percentile(bz, 25)), 2)
        rec["ridge"] = round(float(np.percentile(bz, 95)), 2)
        rec["max"] = round(float(bz.max()), 2)
    else:
        rec["eave"] = rec["ridge"] = rec["max"] = None
    rec["n"] = int(len(bz))
    rec["n_ground"] = int(len(gz))
    rec["area"] = round(poly.area, 1)
    if not area.contains(poly.buffer(3.0)):
        rec["partial"] = True  # footprint or its 3 m ring runs past the box edge
    buildings[tid] = rec

ok = [b for b in buildings.values() if b["ridge"] is not None]
print(f"footprints in box {len(buildings)}, with >=10 building points {len(ok)}")
hs = np.array([b["ridge"] - b["ground"] for b in ok])
es = np.array([b["eave"] - b["ground"] for b in ok])
print("ridge above ground: median %.1f  p10 %.1f  p90 %.1f" % tuple(np.percentile(hs, [50, 10, 90])))
print("eave above ground:  median %.1f  p10 %.1f  p90 %.1f" % tuple(np.percentile(es, [50, 10, 90])))

src = json.load(open(os.path.join(HERE, "cache", "source_manifest.json")))
source = {
    "data": "Lithuanian national LiDAR (Lidar_DR_LT), LKS-94 sheet 76/32 (VILNIUS centras); "
            f"source files dated {src['sourceFileDateRange']['from']}..{src['sourceFileDateRange']['to']}, "
            "classified by NZT (TerraScan), LAS point format 6",
    "owner": "Nacionaline zemes tarnyba prie Aplinkos ministerijos (NZT)",
    "licence": "CC BY 4.0 (open data per NZT Order D1-395)",
    "attribution": "© Nacionalinė žemės tarnyba prie Aplinkos ministerijos, 2025",
    "access": "Potree 2.0 mirror used by github.com/gmacev/lidar-lt (MIT): "
              "https://lidar.chgf.vu.lt/lt-lidar-data/76_32/potree_output/",
    "box": list(BOX),
    "method": "ground = 10th pct of class-2 z within 3 m outside footprint (else 2 m grid); "
              "eave = 25th pct, ridge = 95th pct, max = max of class-6 z inside footprint; n = class-6 count",
}
out = {
    "source": source,
    "crs": "EPSG:3346",
    "vertical_datum": "LAS07 (Lithuanian Height System, normal heights, EVRF2007 realisation) - "
                      "as NZT delivers its LiDAR; Potree conversion dropped the LAS CRS records, not re-verified",
    "units": "metres, absolute heights (subtract ground for heights above ground)",
    "buildings": buildings,
}
json.dump(out, open(os.path.join(HERE, "heights.json"), "w"), ensure_ascii=False, separators=(",", ":"))

gg = {
    "source": source["attribution"] + " - national LiDAR class 2 (ground), CC BY 4.0",
    "crs": "EPSG:3346",
    "vertical_datum": out["vertical_datum"],
    "origin": [BOX[0], BOX[1]],
    "cell": CELL,
    "nx": nx,
    "ny": ny,
    "layout": "row-major; row 0 is the southern edge (y = origin.y .. origin.y+cell), column 0 the western edge; "
              "value = median class-2 z in the cell; cells with no ground points (under buildings) are filled "
              "by neighbour averaging and listed as 0 in 'measured'",
    "values": [round(float(v), 2) for v in filled.ravel()],
    "measured": "".join("1" if m else "0" for m in measured.ravel()),
}
json.dump(gg, open(os.path.join(HERE, "ground_grid.json"), "w"), separators=(",", ":"))
print("zmin/zmax ground", np.nanmin(filled), np.nanmax(filled))
