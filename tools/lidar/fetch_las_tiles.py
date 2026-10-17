#!/usr/bin/env python3
"""Ground (class 2) and building (class 6; class 5 in these tiles, see read_las) points from the Vilnius municipality's 250 m LiDAR tiles.

The lidar-lt mirror that fetch_potree.py reads now refuses requests from outside Vilnius University (2026-10-17:
"Direct use of this resource by applications hosted outside VU servers is not permitted"). The city's public
dashboard "LiDAR-atsisiuntimas" (ArcGIS, owner vplanas) offers the same national survey as uncompressed LAS 1.2
tiles of 250 m (2019, about 45 points/m2), named by its "Nomenklatura" index (NOM_DOWNL, e.g. 76_32-0332).

Each tile is streamed to a temporary file, its class 2 and 6 points kept, and the file deleted. The result is
saved in the format extend_heights.py reads: x, y as centimetres from (583000, 6061000), z in centimetres, c class.

    .venv/bin/python fetch_las_tiles.py --out cache/points_gates.npz 76_32-0251 76_32-0252 ...
"""
import argparse, os, ssl, struct, sys, tempfile, time, urllib.request
import numpy as np

URL = "https://isorei.blob.core.windows.net/isorei/LIDAR/{}.las"
OX, OY = 583000.0, 6061000.0
HERE = os.path.dirname(os.path.abspath(__file__))

def read_las(path):
    with open(path, "rb") as f:
        h = f.read(227)
    assert h[:4] == b"LASF", "not a LAS file"
    off_points, = struct.unpack_from("<I", h, 96)
    fmt, rec_len = h[104], struct.unpack_from("<H", h, 105)[0]
    n, = struct.unpack_from("<I", h, 107)
    sx, sy, sz, ox, oy, oz = struct.unpack_from("<6d", h, 131)
    if fmt > 5: raise SystemExit(f"point format {fmt}: only LAS 1.2-style formats 0-5 are read")
    raw = np.memmap(path, dtype=np.uint8, mode="r", offset=off_points, shape=(n, rec_len))
    xyz = raw[:, :12].copy().view("<i4").reshape(n, 3)
    cls = raw[:, 15] & 0x1F
    # The 2019 tiles have no class 6: roofs are classed 5 (high vegetation) with the trees. extend_heights.py reads
    # "building" points only inside each GRPK footprint, where they are roofs, so class 5 is passed on as 6.
    keep = (cls == 2) | (cls == 5) | (cls == 6)
    x = xyz[keep, 0] * sx + ox; y = xyz[keep, 1] * sy + oy; z = xyz[keep, 2] * sz + oz
    return x, y, z, np.where(cls[keep] == 5, 6, cls[keep])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("tiles", nargs="+")
    a = ap.parse_args()
    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
    parts = []
    done_dir = os.path.join(HERE, "cache", "tiles")
    os.makedirs(done_dir, exist_ok=True)
    for t in a.tiles:
        done = os.path.join(done_dir, f"{t}.npz")       # each tile kept once reduced: a rerun skips it
        if not os.path.exists(done):
            for attempt in range(5):
                path = None
                try:
                    with tempfile.NamedTemporaryFile(suffix=".las", delete=False, dir=os.path.join(HERE, "cache")) as tmp:
                        path = tmp.name
                        with urllib.request.urlopen(URL.format(t), context=ctx, timeout=120) as r:
                            while True:
                                b = r.read(1 << 22)
                                if not b: break
                                tmp.write(b)
                    x, y, z, c = read_las(path)
                    break
                except (OSError, AssertionError) as e:
                    print(f"{t}: attempt {attempt + 1} failed ({e}); retrying", flush=True)
                    time.sleep(2 ** attempt)
                finally:
                    if path and os.path.exists(path): os.remove(path)
            else:
                raise SystemExit(f"{t}: gave up")
            np.savez(done, x=np.round((x - OX) * 100).astype(np.int32), y=np.round((y - OY) * 100).astype(np.int32),
                     z=np.round(z * 100).astype(np.int32), c=c.astype(np.uint8))
            print(f"{t}: {len(c):,} points kept (ground {int((c == 2).sum()):,}, building {int((c == 6).sum()):,})", flush=True)
        p = np.load(done)
        parts.append((p["x"], p["y"], p["z"], p["c"]))
    np.savez_compressed(a.out if os.path.isabs(a.out) else os.path.join(HERE, a.out),
                        **{k: np.concatenate([p[i] for p in parts]) for i, k in enumerate("xyzc")})

if __name__ == "__main__":
    main()
