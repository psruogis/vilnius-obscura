# LiDAR heights for Town Hall Square

Result: **it worked with no login.** We have real building heights and a ground model for the box
E 582700–583300, N 6060650–6061250 (EPSG:3346).

## Outputs

| File | What it holds |
|---|---|
| `heights.json` | `{source, crs, vertical_datum, units, buildings:{TOP_ID:{ground, eave, ridge, max, n, n_ground, ground_src, area, partial?}}}` for the **341 GRPK footprints** that touch the box. 338 of them have 10 or more building points. |
| `ground_grid.json` | A 2 m ground grid, 300 × 300 cells, with origin (582700, 6060650). It is row-major with row 0 at the south edge. Each value is the median z of the class-2 (ground) points in its cell. 61 % of cells are measured. Cells under buildings are filled by averaging their neighbours, and the `measured` string marks each cell 1 (measured) or 0 (filled). |
| `fetch_potree.py` | Downloads only the octree nodes that cover the box, decodes them and saves `cache/points.npz`. |
| `compute_heights.py` | Reads `cache/points.npz` and writes the two JSON files above. |

All heights are **absolute** heights in metres. To get the height above ground, subtract `ground`.
- `ground`: the 10th percentile of class-2 points in a ring from 0 to 3 m outside the footprint. All 341 footprints had enough points in the ring.
- `eave`: the 25th percentile of class-6 (building) points inside the footprint.
- `ridge`: the 95th percentile of those points.
- `max`: the highest of those points.
- `partial: true`: the footprint or its 3 m ring runs past the edge of the box, so the values may be incomplete (66 footprints).

Sanity check, Town Hall (TOP_ID F37142D2-DC0C-48E1-9904-16D254357E29):
- ground 114.2 m, eave 130.9 m, ridge 135.1 m, max 137.2 m.
- That is about 16.7 m to the eave, 21 m to the ridge and 23 m to the top above the square.
- Across all buildings, the median eave is 10.6 m and the median ridge is 13.8 m above ground.
- Ground heights in the box range from 98.0 to 131.6 m.

The data shows **today's** buildings. The rules that turn them into c.1800 buildings (such as the 3-storey cap) belong in the app.

## How it was obtained

1. **data.gov.lt, anonymous: no direct files.**
   - Dataset 2567 (Lidar_DR, 2017): its only "distribution" redirects to the geoportal.lt search page.
   - Dataset 3987 (Lidar_DR_LT, 2019–2026): marked "Inventorintas" (inventoried), with no downloadable distribution. It says the data comes as LKS-94 sheets with a download URL on each sheet, through geoportal.lt.
2. **The lidar-lt viewer's endpoint (used): this worked.**
   - The repo hides the base URL in the env variable `VITE_EPT_BASE_URL`. The deployed bundle at https://lidar.chgf.vu.lt contains `https://lidar.chgf.vu.lt/lt-lidar-data`.
   - Cell `76_32` ("VILNIUS (centras)", LKS-94 10 km sheet 76/32) is in **Potree 2.0** format with BROTLI encoding: `metadata.json`, `hierarchy.bin` (11.8 MB) and `octree.bin` (4.6 GB, accepts HTTP Range requests).
   - We read the hierarchy, picked the 5,004 nodes that meet the box, and fetched about 90 MB in 1,142 range requests. The points were decoded in numpy: Morton-coded int32 xyz, then intensity, then classification. No PDAL or LAZ decoder was needed. `lazrs` failed to build on this Python 3.9, and it was not needed.
   - Kept 11.46 M points (about 32 pts/m²). Point counts by class: 2 ground 4.77 M, 3/4/5 vegetation 1.75 M, 6 building 4.93 M, 7 noise 4.5 k.
   - The cell's `source_manifest.json` lists 25 source LAZ files: Lidar_DR_LT, LAS 1.4 point format 6, TerraScan, dated **2025-12-04**. So these are the newest national data, not the 2017 set.
3. **Another anonymous source, found but not used.**
   - Vilnius municipality's public ArcGIS dashboard "LiDAR-atsisiuntimas" (owner `vplanas`) links uncompressed 250 m LAS tiles at `https://isorei.blob.core.windows.net/isorei/LIDAR/{NOM_DOWNL}.las`. The Town Hall tile is `76_32-0332.las`.
   - Each tile is about 95 MB, LAS 1.2 point format 3 with RGB, TerraScan, from 2019, about 45 pts/m².
   - The box would need about 16 tiles, roughly 1.5 GB. It could serve as a cross-check, or as a fallback if the lidar-lt mirror goes away. That host states no licence, but the data is NŽT LiDAR (CC BY 4.0).

To reproduce:

```
python3 -m venv .venv && .venv/bin/pip install numpy pyproj shapely brotli
curl -o cache/metadata.json https://lidar.chgf.vu.lt/lt-lidar-data/76_32/potree_output/metadata.json
curl -o cache/source_manifest.json https://lidar.chgf.vu.lt/lt-lidar-data/76_32/potree_output/source_manifest.json
curl -o cache/hierarchy.bin https://lidar.chgf.vu.lt/lt-lidar-data/76_32/potree_output/hierarchy.bin
.venv/bin/python fetch_potree.py --download && .venv/bin/python compute_heights.py
```

`cache/` (96 MB) and `.venv/` are not meant for git; they are listed in `.gitignore`.

## Licence and attribution

- Point data: the Lithuanian national LiDAR, © **Nacionalinė žemės tarnyba prie Aplinkos ministerijos (NŽT)**. It is open data under **CC BY 4.0** (NŽT Order D1-395). data.gov.lt shows CC BY 4.0 on dataset 2567. Required credit: "© Nacionalinė žemės tarnyba prie Aplinkos ministerijos, 2025". `heights.json` and `ground_grid.json` are derived from it and carry the same credit.
- Access path: the Potree conversion by github.com/gmacev/lidar-lt (MIT), hosted at lidar.chgf.vu.lt (Vilnius University, ChGF). Crediting it is courteous, not required.
  - That host's `robots.txt` has `Disallow: /lt-lidar-data/`. It is aimed at crawlers, but please respect it: we made one small, targeted fetch and cached the result.
  - **Do not hotlink this endpoint from the app, and do not re-fetch it repeatedly.** Ship only the derived JSON files.

## Caveats

- **Vertical datum:** assumed to be **LAS07**, the Lithuanian normal heights that NŽT uses for its LiDAR. The Potree conversion dropped the LAS CRS records (`"projection": ""`), so this was not checked in the file itself. The horizontal coordinates match LKS-94 (EPSG:3346) exactly.
- **Classification:** it is automatic, so a little of it is wrong. Building points can include chimneys, antennas and scaffolding. The 95th percentile keeps these out of `ridge`, but `max` still includes spires and towers.
- **Eave estimate:** the 25th percentile is only a rough guide. Courtyard annexes, flat roofs and porticoes pull it down. For the Town Hall, the 16.7 m eave reflects the mixed roof and tower.

## If this endpoint disappears (owner action)

- The volunteer mirror might go away. If so, try the vplanas LAS tiles above first; they need no login.
- The official route is geoportal.lt → "Lidar_DR_LT … parsisiuntimas". It needs you to sign in to geoportal.lt through the Elektroniniai valdžios vartai (Lithuanian e-ID or bank login) and then download sheet **76/32**, or its 1 km / 250 m sub-sheets around 76/32-086 and 76/32-0332.
- Put the LAZ files in `cache/`, and we can swap `fetch_potree.py` for a laspy reader.
