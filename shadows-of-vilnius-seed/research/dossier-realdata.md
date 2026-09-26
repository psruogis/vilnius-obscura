# Real-data dossier: Vilnius Old Town (state as of 2026-09-26)

"(unverified)" means no primary source confirmed the claim. "(secondary)" means the source is Wikipedia or the press. The OSM figures come from one live Overpass snapshot (2026-09-26T13:41Z) and were not re-checked independently. During synthesis I checked these directly: the data.gov.lt licences, the GRPK counts, the KVR polygon, the EPSG codes and the LKS94 coordinates.

## 1. Source matrix

| Source | What it gives | Resolution / year | Licence | Ship derived geometry? | Friction | Role |
|---|---|---|---|---|---|---|
| **OpenStreetMap** | Footprints, streets, 204 gateway passages, rivers, landmark `building:part`s, trees | Live; edits mostly 2023–26 | ODbL 1.0 | Yes. Attribution required, and the derived database (or the method) must be published | Low. Overpass rate-limits; build from a pinned Geofabrik extract | Street graph, passages, surfaces, landmark blockouts |
| **GRPK open data** (NŽT, data.gov.lt/datasets/1302) | `PASTAT` building polygons, transport, water, spot heights. **No building heights** | 2,051 footprints in the Old Town polygon; 80% digitised from orthophoto; edited through 2026 | CC BY 4.0 | Yes | Medium (geoportal.lt order) | Footprint master, avoids share-alike |
| **Registrų centras building outlines** (datasets/2838) | Outlines from the real-property register, JSON | Files dated 2024-11-18 | CC BY 4.0 | Yes | Low | Cross-check. Floor-count attribute unverified |
| **Lidar_DR** (NŽT, county centres, datasets/2567) | Classified point cloud with RGB | 2017; >30 (average 45) pts/m²; RMSE <30 cm horizontal, <10 cm vertical | CC BY 4.0 | Yes | Medium | Heights, roofs, terrain. Vilnius coverage presumed (unverified) |
| **Lidar_DR_LT** (datasets/3987) | National point cloud | 2019–22 ≥6.5 pts/m²; 2025–26 ≥15 pts/m², partial coverage | CC BY 4.0 via order D1-395 §21. The portal entry shows no licence | Yes | Medium (LAZ with RIEGL extra dimensions) | Newer heights, if Vilnius is covered (unverified) |
| **ORT10LT** (datasets/2564); ORT2LT | Orthophoto | GSD 0.2 m, RMSE ~0.4 m, 3-year cycle 2024–26. ORT2LT resolution unverified | CC BY 4.0 | Yes | Medium | Roof colours, courtyards, canopy |
| **KVR heritage register** (kvr.kpd.lt, datasets/2192) | Heritage codes; **Vilniaus senamiestis 16073 polygon** | Polygon: 152 vertices, 350.6 ha, 2.14 × 2.42 km | CC BY 4.0. Whether the polygon is in the open dataset is unverified | Yes | Medium | Boundary; heritage code per building |
| 3D Lietuvos žemėlapis (2024-12-17) | LOD1 in some areas; LOD2 only for Telšiai, Kaunas, Marijampolė, Alytus | n/a | Unverified | Unverified | n/a | Gives no Vilnius LOD2 |
| ID Vilnius 3D mesh; Vilniaus DNR | 2020 photogrammetry (72 flights, 30,000 images); georeferenced plans for 1808/1845/1911/1938/1977 with per-year building polygons | T1845 down to 0.053 m/px | **None stated** | No, unless licensed | High (request) | Reference, historical layout |
| Commons | Plans 1646–1898; historic photos and views | Up to 21165×14771 px | Plans PD; photos ~60–72% share-alike | Plans yes; photos per file | Low | Era and façade reference |
| Mapillary (Panoramax and KartaView are negligible) | Street photos, SfM | "Dense" judged visually, not counted (unverified) | CC BY-SA 4.0 + §11 logo | Measurements yes; textures from its pixels become CC BY-SA | Medium (token) | Façade measurement |
| Sketchfab scans (St Anne's, Gediminas Hill) | Drone photogrammetry, 0.8–1.5M faces | 2015–24 | All rights reserved, view-only | No | High | Only if the creator licenses them |
| **Google 3D Tiles, Earth, Street View**; Cesium ion | Photogrammetry; OSM extrusions | n/a | Google ToS; Cesium Community is non-commercial | **Never**, not even as a reference | New EEA projects get HTTP 403 | Forbidden / not needed |

## 2. OSM coverage of Old Town, in numbers

- **Snapshot:** bbox 54.672–54.690 N, 25.278–25.305 E. The bbox clips the edges of the KVR polygon (54.670–54.692 N, 25.2726–25.3060 E) and takes in some districts outside Old Town. Inside the polygon, 1,792 OSM buildings have their centroid, and 527 of them (29%) have a height or level count.
- **Buildings:** 2,065 in the bbox, 93.6 ha, 64% with addresses. Any vertical data: 28.2% by count, 38.9% by area (height 6.9%, levels 21.7%). roof:shape 17.8%, roof:colour 16.3%, material under 0.5%. 116 courtyard rings.
- **3D parts:** 584 parts in 62 buildings. Cathedral 82, Town Hall 60, Palace of the Grand Dukes 44, St Johns' bell tower 22. **St Anne's and St Casimir's have none.** 308 parts have no roof shape. St Johns' bell tower is **48 m in OSM against 69 m on Wikipedia** (secondary).
- **Streets:** 3,034 highway ways, about 134 km. Named streets (74.6 km): asphalt 51.6%, paving stones 18.7%, sett 11.8%, cobblestone 3.7%. Width tagged on 1.6%. Only **37 street lamps** mapped, although 45.7% of ways are tagged lit. 168 flights of steps; area:highway used 0 times.
- **Passages and courtyards:** 204 `building_passage` ways, none with a width. 14 courtyard polygons, all at Vilnius University.
- **Water:** the Vilnia and Neris exist as centrelines and as water areas. 23 bridges, 6 bridge-deck polygons. No water or bank levels.
- **Other:** 3,364 trees (2 with species), 254 benches, 10.2 km of walls (25 with a height), city-wall relation 20288139.
- **Heritage:** `ref:lt:kpd` on 41 elements. No Old Town boundary. No terrain: only 9 `ele` nodes.

## 3. Recommended data stack for "real skeleton" fidelity

| Layer | Source | Notes |
|---|---|---|
| Boundary | KVR 16073 polygon plus a backdrop buffer | Not the eldership relation 968951 |
| Footprints | **A (recommended): GRPK** (CC BY). **B (the brief's L5): OSM** | A keeps buildings free of share-alike; B makes the building table an ODbL derivative. Diff both first |
| Heights and roofs | Building-class LiDAR points per footprint | Taking *all* heights from LiDAR keeps them outside ODbL (Collective Database guideline) |
| Terrain | LiDAR ground class → DTM at 0.25–0.5 m | Interpolate under arcades |
| Streets | OSM graph (surface, steps, passages). Street surface = block minus footprints | GRPK transport is a CC BY alternative; its Old Town quality is unverified |
| Rivers | OSM water polygons, banks from the DTM | Beds hand-authored |
| Landmarks | Positions from OSM/KVR; LiDAR plus OSM parts as blockout; photos as reference | Hand-modelled |

**No data covers these, so they must be hand-authored:**
- Façade openings, cornices, balconies, dormers and chimneys
- Arcade interiors and passage profiles
- Camber and sett patterns
- Lamps
- Wall heights
- Riverbeds
- Tree species
- Era substitutions (§6)
- St Anne's and St Casimir's

The ID Vilnius night orthophoto covers only **Žvėrynas and Naujamiestis, not Old Town**. No real night-lighting reference exists for Old Town.

## 4. Licence rules

**OpenStreetMap (ODbL)**
- Show "© OpenStreetMap contributors", linked to https://www.openstreetmap.org/copyright, on the splash screen and in a persistent credits or menu entry. ODbL 4.3 also allows: "Contains information from OpenStreetMap, which is made available here under the Open Database License (ODbL)".
- The extract has more than 100 features, so it counts as Substantial and is a Derivative Database. Publish it, or the pipeline script plus the pinned extract date (§4.6).
- Filtering and reprojection are trivial transformations. Corrected or added heights and parts are not trivial, and must be published.
- If assets are obfuscated, an unrestricted copy must be offered alongside (§4.7b).
- Mixing OSM and non-OSM data inside one feature type makes that layer share-alike.

**NŽT data (LiDAR, orthophotos) under order D1-395 (2024-11-20)**
- §21 licenses reuse under CC BY 4.0.
- §22 attribution: "[NŽT logo] [dataset name] © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, [year of creation]".
- §23 short form: "[short name] © Nacionalinė žemės tarnyba, [year]".
- D1-395 was **amended on 2026-09-23 (D1-172)**. Re-read it before shipping.

**GRPK, Registrų centras and KVR (CC BY 4.0):** credit the source, link the licence and state what you changed. There is no share-alike.

**Forbidden: Google**
- ToS §3.2.3 bans scraping, caching and creating content, including 3D models and terrain.
- The Map Tiles policies ban offline use and any 3D object "extracted, traced, or otherwise derived by hand or machine" from the tiles.
- The Geo guidelines ban reconstructing models from Google Earth, Earth Pro or Earth Studio output. The EEA terms add Street View tracing.
- EEA projects created after 8 July 2025, or that have left the "Unmodified State", get HTTP 403 for Photorealistic 3D Tiles.
- **No contributor may use Google imagery as a modelling reference.**

**Forbidden: Cesium ion.** The Community plan is non-commercial. Google content cannot be clipped. Clips keep their attribution duty.

**Share-alike from photos**
- Textures made from the pixels of Mapillary, Panoramax, KartaView or most Commons photos must be released under CC BY-SA 4.0 with per-image credit.
- Mapillary also requires its logo and a link back.
- Using photos only for measurement arguably carries no such duty (unverified).

**Freedom of panorama.** Lithuanian Copyright Law Art. 28(2) has no commercial exception. Clearance may be needed (whether this applies to games is unverified) for:
- the Palace reconstruction (2002–18)
- the Gediminas monument (1996)
- the Cathedral statues (1997)
- possibly the 1933 rebuild of Gediminas Tower

## 5. Corrections to the brief's geographic claims

| Brief claim | Corrected value | Source |
|---|---|---|
| Footprint "roughly 600 × 500 m", Cathedral Square to Gates of Dawn | Cathedral to Gates of Dawn is **1.29 km**; Cathedral to Town Hall 0.86 km. The heritage Old Town is 350.6 ha | Centroids of OSM ways 4870323 and 112746030; KVR polygon |
| 54.687 N, 25.283 E | This is the OSM `place=city` node for Vilnius, about 334 m WNW of the Cathedral and off the spine. Fine for ephemeris, not usable as a map origin | OSM |
| "Cobblestone almost everywhere" | Named streets are about half asphalt; sett plus cobblestone is about 16%. Pilies g. is sett | OSM surface tags |
| St Johns' bell tower "~68 m" | 69 m (secondary). OSM's 48 m is wrong. Measure from LiDAR | Wikipedia; way 531861485 |
| Cathedral Bell Tower "~57 m" | 52 m, or 57 m with the cross (secondary) | Wikipedia, Go Vilnius |
| Gediminas' Tower on a "~48 m hill" | Summit is 141 m above sea level. Height above the surroundings unverified; measure from the DTM | OSM `ele` |
| Pilies/Šv. Mykolo corner: "3–4 storey baroque, arched gateway" | Junction node 59971618 exists. Adjacent buildings (Pilies 13–22) are 10–15 m tall with hipped roofs. A passage is 9 m away and St Johns' church 34 m away. The nearest mapped lamp is ~250 m away. "Baroque" unverified | OSM |
| Vilnia joins the Neris near Gediminas' Hill | Confirmed: confluence ~290 m NNE of the tower | OSM way 8659069 |
| Three Crosses Hill east of Gediminas' Hill | Confirmed: ~440 m east, on Plikasis kalnas (163.6 m). Date of the present monument unverified | OSM node 325083016 |
| Neoclassical Cathedral (statues) and Town Hall (portico) | True today, but both date from after 1783/1785; the statues are 1997 replicas | §6 |

## 6. Era conflicts (for a 17th–18th-century setting)

| Landmark | Present form | Before 1800 |
|---|---|---|
| Cathedral | Neoclassical, 1783–1801; statues re-made 1997 | Baroque, with two towers; south tower collapsed 1769 |
| Town Hall | Neoclassical, 1785–99, no tower | Gothic/Baroque with the Glaubitz tower of 1749–69 (secondary) |
| Palace of the Grand Dukes | Rebuilt 2002–18 | Demolished 1801; present before then |
| City wall | Demolished 1799–1805 | Complete, with gates (secondary) |
| Gate of Dawn chapel | Rebuilt 1828–30 | Chapel of c. 1713–15 (secondary) |
| St Anne's | Church of 1495–1500 unchanged | Remove the **1870s belfry** (secondary) |
| Gediminas Tower | Rebuilt 1933 | Ruin (secondary) |
| Bell Tower top stage | Early 19th century | Exact date unverified |
| Great Synagogue | Absent from modern data | Stood from 1633 to the 1940s (secondary) |
| Skyline | Baroque rebuilding after the fires of 1737 and 1748–49 | The 1737 plan predates it |

**Historical map sources**
- **Vilniaus DNR** (ID Vilnius): 1808 and 1845 plans already georeferenced in EPSG:3346; building polygons for each year from 1808 to 2026; 8,561 historical street polylines in a queryable service. **No licence stated: request it.**
- **Commons, Old maps of Vilnius** (133 files, public domain):
  - Getkant 1648: 6313×8842
  - Padhorje 1794: 21165×14771
  - Kunicki 1805: 8137×6230
  - 1842: 16106×13339
  - 1866: 20323×23173
  - 1737 plan: only 2048 px
- The MAB "1808" scan (InC) is a 20th-century copy annotated by Raulinaitis.
- Public-domain views: Bułhak (778 files), Album Wileńskie (201), Smuglewicz (80).

## 7. Recommended toolchain

1. **Pin inputs.** Dated Geofabrik `.osm.pbf` (osmium), GRPK, LiDAR tiles, ORT10LT/ORT2LT and the KVR polygon. Log download dates for attribution.
2. **Reproject** to EPSG:3346 plus LAS07 (GDAL, PROJ, PDAL). Clip to the polygon plus a buffer.
3. **Terrain.** PDAL on ground class 2, a DTM raster, a simplified mesh per chunk. **Hard:** ground under arcades and trees.
4. **Footprint cleanup.** Snap party walls, remove slivers. **Hard:** GRPK and OSM disagree.
5. **Heights.** Per-footprint LiDAR percentiles for eave and ridge (LOD1.5).
6. **Roofs to LOD2.** Template fitting, or a reconstruction tool such as 3D BAG's geoflow (suitability unverified). **Hard:** Baroque roofs, domes, towers. Budget for manual fixes.
7. **Streets.** Block minus footprints, OSM surfaces, draped on the DTM; camber hand-authored.
8. **Passages.** Cut the 204 `building_passage` ways through the footprints. **Hard:** no widths exist.
9. **Façades.** Procedural: storeys from LiDAR height, bays measured from photos. **Hard:** no opening data exists.
10. **Landmarks.** LiDAR plus OSM parts as a blockout, then hand-modelled in Blender.
11. **Blender** (bpy): lightmap UVs, Cycles bake per chunk, then `gltf-transform` (Meshopt, KTX2). **Hard:** bake time at city scale; automate it.
12. **Chunks.** Cells aligned to the LKS94 grid (e.g. 100 m).
13. **Compliance.** Generate the credits, the ODbL extract and the list of CC BY sources automatically on every build.

## 8. Coordinate frame

- **Horizontal:** EPSG:3346, LKS94 / Lithuania TM (lon_0 24°, k 0.9998, x_0 500 000, GRS80).
- **Vertical:** EPSG:9666, LAS07 normal heights. It replaced Baltic 1977 (EPSG:5705) in January 2016. Check each LiDAR vintage's header to confirm which it uses.
- **Distortion at Vilnius** (my computation; verify with PROJ): scale factor ≈0.999885 (−115 ppm, ~15 cm over 1.3 km). Grid convergence ≈**1.05°**, so rotate the moon/sun ephemeris if −Z is grid north.
- **Origin:** E₀ 583 000, N₀ 6 061 000, about 40 m north of the Town Hall. The Cathedral (583 038, 6 061 816) and the Gates of Dawn (583 170, 6 060 531) both lie within 0.9 km.
- **three.js mapping:** X = E−E₀, Z = −(N−N₀), Y = H−H₀. Choose H₀ after the DTM exists.

## 9. Risks and open questions

**Risks**
- Only 28–31% of OSM buildings have height data, so the real 3D depends on LiDAR, whose Vilnius coverage and vintage are unverified.
- The "only real data" claim can hold for the skeleton, not the skin: façades, lamps, widths and riverbeds are invented.
- How far ODbL reaches into shipped glTF chunks is unsettled.
- D1-395 changed three days ago.
- A single Google-referenced asset taints the set.
- The ID Vilnius data is unlicensed; scraping its tiles is off-limits.
- Freedom of panorama exposes modern works in a commercial release.

**Open questions for the owner**
1. Which era: present day, or a specific year (1737, around 1794, 1808)?
2. Playable area: 600 × 500 m (too small for the named landmarks), the 1.3 km spine, or the full 350 ha?
3. Commercial or not? Is the billing entity in the EEA?
4. Footprints: A (GRPK) or B (OSM plus a published extract)? Push fixes back to OSM?
5. Accept clearly labelled hand-authored elements where no data exists?
6. May we request ID Vilnius data and license Sketchfab scans?
7. Allow share-alike textures, or measurement only?
8. Will assets be obfuscated? If so, the ODbL parallel copy is required.
9. Who does legal review for freedom of panorama?

### Appendix: Overpass queries

`curl -s -A 'ShadowsOfVilnius/0.1' --data-urlencode 'data=<Q>' https://overpass-api.de/api/interpreter`. Without `-A` the server returns HTTP 406. For BBOX use `54.670,25.272,54.692,25.306` to cover the whole KVR polygon.
- `[out:json];(way["building"](BBOX);relation["building"](BBOX););out count;`
- `[out:json];way(4870323);map_to_area->.a;(way["building:part"](area.a););out count;`
- `[out:json];way["tunnel"="building_passage"](BBOX);out count;`
- `[out:json];node["highway"="street_lamp"](BBOX);out count;`
- `[out:json];nwr["ref:lt:kpd"](BBOX);out tags center;`
- `[out:json][timeout:240];nwr(BBOX);out meta qt;`