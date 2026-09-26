# Shadows of Vilnius: seed data

Harvested on **2026-09-26** during the research for `SHADOWS-OF-VILNIUS-PLANNING-PROMPT.md`.

This data is for research and planning. Each file keeps its source's licence, and **nothing here is cleared for shipping as-is**. Follow the prompt's authenticity charter (§6) and Appendix B4.

Coordinates are **EPSG:3346 (LKS94 / Lithuania TM)** unless noted otherwise. The KVR point geometry and the OSM data use WGS84.

| Path | What it is | Source | Licence |
|---|---|---|---|
| `boundary/kvr_16073_oldtown_epsg3346.geojson` | Official protected-area polygon for **Vilniaus senamiestis, KVR code 16073** (UNESCO site 541): 152 vertices, about 352 ha. | KVR ArcGIS service (kvr.kpd.lt) | Register data is CC BY 4.0 (data.gov.lt dataset 2192). The service itself states no licence. |
| `grpk/grpk_pastat_oldtown_epsg3346.geojson` | **3,808 GRPK building footprints (PASTAT layer)**. Clip: the bounding box of the Old Town polygon plus 150 m, i.e. E 581 918–584 369, N 6 059 903–6 062 651. Fields: TOP_ID, GKODAS, META, PASK, GRAKTAS, SHAPE_Area, Suk_DATA, Red_DATA. **No heights.** Text decoded as cp1257. | Georeferencing base cadastre (GRPK), Nacionalinė žemės tarnyba; national Shapefile download | **CC BY 4.0.** Attribution per order D1-395 §22: "[NŽT logo] GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, [year]". Re-read the order as amended on 2026-09-23 (D1-172). |
| `kvr/kvr_objects_points_details.json` | **244 KVR heritage objects** (point layer) in the spine bbox 54.673–54.687 N, 25.284–25.292 E. Each carries its ArcGIS attributes plus the full `GetStaticHeritageDetails` record: dating and alteration chronology ("Century"), style, authors, and protected features ("ObjectFeatures") with dated alteration notes and photo and iconography references. | KVR ArcGIS layer 0 plus the undocumented JSON service `kvr.kpd.lt/KvrWcf/LabbisServiceKvr.svc` | Register text CC BY 4.0 (assumed from dataset 2192; the services state no licence). **Photos are reference-only until the heritage department (KPD) confirms a licence.** |
| `kvr/kvr_objects_polygons_details.json` | **226 KVR objects** (polygon layer) in the same bbox, with the same detail records. | KVR ArcGIS layer 1 plus the JSON service | As above |
| `osm/overpass_oldtown_bbox_2026-09-26T1341Z.json` | Full Overpass dump (`nwr(bbox); out meta qt`) for bbox 54.672–54.690 N, 25.278–25.305 E: 42,087 nodes, 7,138 ways, 453 relations. osm_base timestamp 2026-09-26T13:41:20Z. | OpenStreetMap via overpass-api.de | **ODbL 1.0**, © OpenStreetMap contributors. Use for research and crosswalk only. If any derived geometry ships, the ODbL derivative-database duties apply. |
| `research/dossier-realdata.md` | The real-data dossier. | Research workflow, 2026-09-26 | — |
| `research/dossier-1794.md` | The synthesised, fact-checked 1794 dossier. | Research workflow, 2026-09-26 | — |
| `research/research-1794-raw.md` | Raw 1794 research findings, before fact-checking. | Research workflow, 2026-09-26 | — |
| `research/reports-*.json` | Structured reports and the fact-checkers' verdicts. | Research workflow, 2026-09-26 | — |
| `research/moon_phases_meeus_1794.py` | Moon phases for 1794 using Meeus's formulae. Local mean time is UT + 1 h 41 m. | — | — |

The files under `research/` contain some claims that the fact-checkers later corrected. **The planning prompt wins wherever they disagree.**

## Known caveats

- **GRPK download:** the national zip the research agents downloaded was truncated (no central directory). The PASTAT layer read completely (2,154,683 records), so this clip is sound, but re-download GRPK before production use.
- **GRPK:** the clip is a rectangle, not the polygon, so it includes buildings outside the protected area. Filter against `boundary/` if needed. The data is the current state, so it contains post-1794 and post-war buildings, and back-dating decides what existed.
- **KVR bbox:** the harvest bbox (54.673–54.687 N) stops short of the north end of the Castle precinct. The Old Arsenal (about 54.6879 N) and the Lower Castle remains are missing. Extend the harvest north to about 54.690 N.
- **KVR:** objects are not one-to-one with footprints. Complexes, wing parts and territories all appear. Hand-check the joins for the roughly 100 street-front buildings.
- **KVR service:** it is undocumented and may change. Cache everything and keep request rates low. Its POST calls need `Content-Length: 0`. Act PDFs use a font encoding shifted by 29 code points.
- **OSM:** landmark heights are unreliable (St John's belfry shows 48 m against 68–69 m in reality). Only 28% of buildings have any height data.

## Not included

These are too large, unlicensed, or better fetched fresh:

- **LiDAR tiles** (Lidar_DR 2017, sheet 76/32 "VILNIUS (centras)")
- **Orthophotos** (ORT2LT / ORT10LT)
- **KVR photos and act PDFs**
- **ID Vilnius / Vilniaus DNR data**: no licence stated, so request it first
- **Historical plan scans**: Kunicki 1805 and others are on Wikimedia Commons (public domain); fetch them fresh
