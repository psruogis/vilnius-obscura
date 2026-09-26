#!/usr/bin/env python3
"""Fetch the part of a Potree 2.0 (BROTLI) point cloud that covers a box.

Source: the public point-cloud mirror behind the open-source viewer
github.com/gmacev/lidar-lt (MIT), https://lidar.chgf.vu.lt/lt-lidar-data/<cell>/potree_output/
The points themselves are NZT national LiDAR (CC BY 4.0).

Usage: .venv/bin/python fetch_potree.py            (plan only, prints byte totals)
       .venv/bin/python fetch_potree.py --download (fetch and decode to cache/points.npz)
"""
import json, os, struct, sys, urllib.request
import numpy as np
import brotli

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
CELL = "76_32"
BASE = f"https://lidar.chgf.vu.lt/lt-lidar-data/{CELL}/potree_output"
BOX = (582700.0, 6060650.0, 583300.0, 6061250.0)  # EPSG:3346 xmin, ymin, xmax, ymax
UA = {"User-Agent": "vilnius-town-hall-walk lidar spike (one-off, small area)"}

meta = json.load(open(os.path.join(CACHE, "metadata.json")))
hier = open(os.path.join(CACHE, "hierarchy.bin"), "rb").read()
BMIN = np.array(meta["boundingBox"]["min"])
BMAX = np.array(meta["boundingBox"]["max"])
SCALE = np.array(meta["scale"])
OFFSET = np.array(meta["offset"])


def child_box(bmin, bmax, i):
    size = (bmax - bmin) / 2
    mn = bmin.copy()
    mx = bmax.copy()
    for axis, bit in ((2, 1), (1, 2), (0, 4)):
        if i & bit:
            mn[axis] += size[axis]
        else:
            mx[axis] -= size[axis]
    return mn, mx


def intersects(bmin, bmax):
    return not (bmax[0] < BOX[0] or bmin[0] > BOX[2] or bmax[1] < BOX[1] or bmin[1] > BOX[3])


def parse_chunk(offset, size, root):
    """root: dict(name, bmin, bmax). Returns list of real nodes found; recurses into proxies."""
    out = []
    n = size // 22
    nodes = [root]
    for i in range(n):
        cur = nodes[i]
        typ, mask, npts, boff, bsize = struct.unpack_from("<BBIqq", hier, offset + i * 22)
        if cur.get("proxy"):
            cur.pop("proxy")
            cur.update(npts=npts, boff=boff, bsize=bsize, type=typ)
        elif typ == 2:
            cur.update(proxy=True, hoff=boff, hsize=bsize, npts=npts)
        else:
            cur.update(npts=npts, boff=boff, bsize=bsize, type=typ)
        if cur.get("proxy"):
            continue
        out.append(cur)
        for c in range(8):
            if mask & (1 << c):
                mn, mx = child_box(cur["bmin"], cur["bmax"], c)
                nodes.append({"name": cur["name"] + str(c), "bmin": mn, "bmax": mx})
    # follow proxies only where they touch the box
    for nd in nodes:
        if nd.get("proxy") and intersects(nd["bmin"], nd["bmax"]):
            out.extend(parse_chunk(nd["hoff"], nd["hsize"], nd))
    return out


def plan():
    root = {"name": "r", "bmin": BMIN.copy(), "bmax": BMAX.copy()}
    fc = meta["hierarchy"]["firstChunkSize"]
    allnodes = parse_chunk(0, fc, root)
    sel = [n for n in allnodes if intersects(n["bmin"], n["bmax"]) and n["npts"] > 0]
    sel.sort(key=lambda n: n["boff"])
    return sel


def merge_ranges(sel, gap=64 * 1024):
    groups = []
    for n in sel:
        if groups and n["boff"] - (groups[-1]["end"]) <= gap:
            groups[-1]["end"] = max(groups[-1]["end"], n["boff"] + n["bsize"])
            groups[-1]["nodes"].append(n)
        else:
            groups.append({"start": n["boff"], "end": n["boff"] + n["bsize"], "nodes": [n]})
    return groups


def deinterleave3(v, shift):
    """Take bits shift, shift+3, shift+6... (16 of them) of uint64 array v."""
    out = np.zeros(v.shape, dtype=np.uint64)
    for k in range(16):
        out |= ((v >> np.uint64(3 * k + shift)) & np.uint64(1)) << np.uint64(k)
    return out


def decode_node(raw, npts):
    buf = brotli.decompress(raw)
    need = npts * (16 + 2 + 1)
    assert len(buf) == need, (len(buf), need)
    pos = np.frombuffer(buf, dtype="<u8", count=npts * 2).reshape(npts, 2)
    upper, lower = pos[:, 0], pos[:, 1]
    xyz = np.empty((npts, 3), dtype=np.float64)
    for a in range(3):
        v = deinterleave3(lower, a) | (deinterleave3(upper, a) << np.uint64(16))
        xyz[:, a] = v.astype(np.float64) * SCALE[a] + OFFSET[a]
    o = npts * 16
    inten = np.frombuffer(buf, dtype="<u2", count=npts, offset=o)
    o += npts * 2
    cls = np.frombuffer(buf, dtype="u1", count=npts, offset=o)
    return xyz, inten, cls


def get_range(start, end):
    req = urllib.request.Request(f"{BASE}/octree.bin", headers={**UA, "Range": f"bytes={start}-{end - 1}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    assert len(data) == end - start, (len(data), end - start)
    return data


def main():
    sel = plan()
    groups = merge_ranges(sel)
    tot = sum(n["bsize"] for n in sel)
    fetch = sum(g["end"] - g["start"] for g in groups)
    print(f"nodes={len(sel)} points={sum(n['npts'] for n in sel):,} node_bytes={tot/1e6:.1f}MB "
          f"requests={len(groups)} fetch_bytes={fetch/1e6:.1f}MB")
    if "--download" not in sys.argv:
        return
    xs, cs, ints = [], [], []
    from concurrent.futures import ThreadPoolExecutor

    def fetch(g):
        for attempt in range(4):
            try:
                return g, get_range(g["start"], g["end"])
            except Exception as e:  # retry transient errors
                err = e
        raise err

    with ThreadPoolExecutor(max_workers=6) as ex:
        results = ex.map(fetch, groups)
        for gi, (g, data) in enumerate(results):
            _decode_group(g, data, xs, cs, ints)
            if gi % 50 == 0:
                print(f"  group {gi + 1}/{len(groups)}", flush=True)
    finish(xs, cs, ints)


def _decode_group(g, data, xs, cs, ints):
    if True:
        for n in g["nodes"]:
            a = n["boff"] - g["start"]
            xyz, inten, cls = decode_node(data[a:a + n["bsize"]], n["npts"])
            m = (xyz[:, 0] >= BOX[0]) & (xyz[:, 0] <= BOX[2]) & (xyz[:, 1] >= BOX[1]) & (xyz[:, 1] <= BOX[3])
            xs.append(xyz[m].astype(np.float64))
            cs.append(cls[m])
            ints.append(inten[m])


def finish(xs, cs, ints):
    xyz = np.concatenate(xs)
    cls = np.concatenate(cs)
    inten = np.concatenate(ints)
    np.savez_compressed(os.path.join(CACHE, "points.npz"),
                        x=np.round((xyz[:, 0] - 583000) * 100).astype(np.int32),
                        y=np.round((xyz[:, 1] - 6061000) * 100).astype(np.int32),
                        z=np.round(xyz[:, 2] * 100).astype(np.int32),
                        c=cls, i=inten)
    print("points kept", len(cls), "class histogram", np.bincount(cls, minlength=13).tolist())
    print("z range", xyz[:, 2].min(), xyz[:, 2].max())


if __name__ == "__main__":
    main()
