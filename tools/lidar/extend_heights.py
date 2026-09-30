#!/usr/bin/env python3
"""Grow heights.json and ground_grid.json with points fetched for more boxes, keeping everything already there.

Run after:  .venv/bin/python fetch_potree.py --box ... --out points_east.npz --download
Then:       .venv/bin/python extend_heights.py cache/points_east.npz 583250,6060550,583450,6061250 582900,6060550,583250,6060650

The ground grid grows to the bounding box of the old grid and the new boxes. Cells of the old grid keep their values;
new cells take the median class-2 z, holes are filled by neighbour averaging as in compute_heights.py. A footprint
gets new heights when it (with its 3 m ring) lies inside the new boxes and had none, or only partial ones, before.
Where old and new data overlap, the ground medians are compared and the difference printed as a check.
"""
import json, os, sys
import numpy as np
from shapely.geometry import shape, box
from shapely.ops import unary_union
from shapely import contains_xy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GRPK = os.path.join(ROOT, "shadows-of-vilnius-seed", "grpk", "grpk_pastat_oldtown_epsg3346.geojson")
OX, OY = 583000.0, 6061000.0

pts_file = sys.argv[1]
new_boxes = [tuple(float(v) for v in a.split(",")) for a in sys.argv[2:]]
p = np.load(pts_file if os.path.isabs(pts_file) else os.path.join(HERE, pts_file))
X, Y, Z, C = p["x"] / 100.0 + OX, p["y"] / 100.0 + OY, p["z"] / 100.0, p["c"]
print("new points", len(C))

gg = json.load(open(os.path.join(HERE, "ground_grid.json")))
hj = json.load(open(os.path.join(HERE, "heights.json")))
cell = gg["cell"]
old_box = tuple(hj["source"]["box"]) if "box" in hj["source"] else (gg["origin"][0], gg["origin"][1],
                                                                      gg["origin"][0] + gg["nx"] * cell, gg["origin"][1] + gg["ny"] * cell)
ox0, oy0, onx, ony = gg["origin"][0], gg["origin"][1], gg["nx"], gg["ny"]
old = np.array(gg["values"], dtype=float).reshape(ony, onx)
old_meas = np.array([c == "1" for c in gg["measured"]]).reshape(ony, onx)

# ---------- grown ground grid ----------
x0 = min(ox0, *(b[0] for b in new_boxes)); y0 = min(oy0, *(b[1] for b in new_boxes))
x1 = max(ox0 + onx * cell, *(b[2] for b in new_boxes)); y1 = max(oy0 + ony * cell, *(b[3] for b in new_boxes))
nx, ny = int(round((x1 - x0) / cell)), int(round((y1 - y0) / cell))
g = C == 2
ix = np.clip(((X[g] - x0) / cell).astype(int), 0, nx - 1)
iy = np.clip(((Y[g] - y0) / cell).astype(int), 0, ny - 1)
flat = iy * nx + ix
order = np.lexsort((Z[g], flat))
fs, zs = flat[order], Z[g][order]
starts = np.searchsorted(fs, np.arange(nx * ny)); ends = np.searchsorted(fs, np.arange(nx * ny), side="right")
cnt = ends - starts
fresh = np.full(nx * ny, np.nan)
fresh[cnt > 0] = zs[(starts + (cnt - 1) // 2)[cnt > 0]]
fresh = fresh.reshape(ny, nx)

grid = np.full((ny, nx), np.nan)
meas = np.zeros((ny, nx), dtype=bool)
ox, oy = int(round((ox0 - x0) / cell)), int(round((oy0 - y0) / cell))
# overlap check: cells measured in both
both = old_meas & ~np.isnan(fresh[oy:oy + ony, ox:ox + onx])
if both.any():
    d = fresh[oy:oy + ony, ox:ox + onx][both] - old[both]
    print(f"overlap check: {both.sum()} cells, new - old median {np.median(d):+.3f} m, p95 |d| {np.percentile(np.abs(d), 95):.3f} m")
new_meas = ~np.isnan(fresh)
grid[new_meas] = fresh[new_meas]; meas |= new_meas
grid[oy:oy + ony, ox:ox + onx] = old          # the old grid wins where it exists
meas[oy:oy + ony, ox:ox + onx] = old_meas
for _ in range(600):
    nan = np.isnan(grid)
    if not nan.any():
        break
    pad = np.pad(grid, 1, constant_values=np.nan)
    nb = np.stack([pad[1:-1, :-2], pad[1:-1, 2:], pad[:-2, 1:-1], pad[2:, 1:-1],
                   pad[:-2, :-2], pad[:-2, 2:], pad[2:, :-2], pad[2:, 2:]])
    with np.errstate(invalid="ignore"):
        s = np.nansum(nb, axis=0); k = np.sum(~np.isnan(nb), axis=0)
    upd = nan & (k > 0)
    grid[upd] = s[upd] / k[upd]
print(f"ground grid {onx}x{ony} -> {nx}x{ny}, origin ({x0:.0f}, {y0:.0f}), measured {meas.mean() * 100:.1f}%")


def ground_at(xs, ys):
    jx = np.clip(((np.asarray(xs) - x0) / cell).astype(int), 0, nx - 1)
    jy = np.clip(((np.asarray(ys) - y0) / cell).astype(int), 0, ny - 1)
    return grid[jy, jx]


# ---------- footprints in the new boxes ----------
B = 10.0
bx = ((X - x0) // B).astype(int); by = ((Y - y0) // B).astype(int)
nbx, nby = int((x1 - x0) // B) + 1, int((y1 - y0) // B) + 1
bid = np.clip(bx, 0, nbx - 1) * nby + np.clip(by, 0, nby - 1)
border = np.argsort(bid, kind="stable"); bsorted = bid[border]
bstart = np.searchsorted(bsorted, np.arange(nbx * nby)); bend = np.searchsorted(bsorted, np.arange(nbx * nby), side="right")


def pts_in_bbox(minx, miny, maxx, maxy):
    a0 = max(0, int((minx - x0) // B)); a1 = min(nbx - 1, int((maxx - x0) // B))
    b0 = max(0, int((miny - y0) // B)); b1 = min(nby - 1, int((maxy - y0) // B))
    if a1 < a0 or b1 < b0:
        return np.empty(0, dtype=int)
    return np.concatenate([border[bstart[i * nby + b0]:bend[i * nby + b1]] for i in range(a0, a1 + 1)])


covered = unary_union([box(*b) for b in new_boxes])
everything = unary_union([covered, box(*old_box)])
added = replaced = 0
for f in json.load(open(GRPK))["features"]:
    poly = shape(f["geometry"])
    if not poly.is_valid:
        poly = poly.buffer(0)
    if not poly.intersects(covered):
        continue
    tid = f["properties"]["TOP_ID"]
    prev = hj["buildings"].get(tid)
    if prev and not prev.get("partial"):
        continue
    if not covered.contains(poly.buffer(3.0)):
        continue  # straddles old and new data: keep what there is
    ring = poly.buffer(3.0).difference(poly)
    idx = pts_in_bbox(*ring.bounds)
    xs, ys, zs, cs = X[idx], Y[idx], Z[idx], C[idx]
    gz = zs[contains_xy(ring, xs, ys) & (cs == 2)]
    bz = zs[contains_xy(poly, xs, ys) & (cs == 6)]
    rec = {}
    if len(gz) >= 5:
        rec["ground"] = round(float(np.percentile(gz, 10)), 2); rec["ground_src"] = "ring"
    else:
        c = poly.centroid
        rec["ground"] = round(float(ground_at([c.x], [c.y])[0]), 2); rec["ground_src"] = "grid"
    if len(bz) >= 10:
        rec["eave"] = round(float(np.percentile(bz, 25)), 2)
        rec["ridge"] = round(float(np.percentile(bz, 95)), 2)
        rec["max"] = round(float(bz.max()), 2)
    else:
        rec["eave"] = rec["ridge"] = rec["max"] = None
    rec["n"] = int(len(bz)); rec["n_ground"] = int(len(gz)); rec["area"] = round(poly.area, 1)
    if not everything.contains(poly.buffer(3.0)):
        rec["partial"] = True
    replaced += bool(prev); added += not prev
    hj["buildings"][tid] = rec
print(f"footprints: {added} added, {replaced} partial ones redone; {len(hj['buildings'])} in all")

hj["source"]["box"] = list(old_box)
hj["source"]["extra_boxes"] = sorted(set(map(tuple, hj["source"].get("extra_boxes", []))) | set(new_boxes))
json.dump(hj, open(os.path.join(HERE, "heights.json"), "w"), ensure_ascii=False, separators=(",", ":"))
gg.update(origin=[x0, y0], nx=nx, ny=ny, values=[round(float(v), 2) for v in grid.ravel()],
          measured="".join("1" if m else "0" for m in meas.ravel()))
json.dump(gg, open(os.path.join(HERE, "ground_grid.json"), "w"), separators=(",", ":"))
print("ground z range", float(np.nanmin(grid)), float(np.nanmax(grid)))
