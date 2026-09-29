# Sources of the in-game map

The map (corner plan and full-screen view, `src/ui/map.ts`) draws `public/data/area.json`, so it shows
exactly what stands in the 3D world. Its "About this map" panel is the short, player-facing version of
this page. **Keep the two in step**: `ABOUT_HTML` in `src/ui/map.ts` and the table below.

Tags follow `docs/REFERENCES.md`: **[V]** verified, **[U]** unverified or a design choice.

## The look

Dark vellum, gold ink: outlines wobble a little as a hand's do, houses are hatched, names are set in Almendra
(streets), Cinzel (places) and UnifrakturCook (the title). It is a design choice, not a claim about how any
1900 plan looked. [U] A "Glow" switch on the full map adds a soft light behind the ink and the landmarks. The
legend in the panel is one colour and a few words per row; the sources are listed under it.

## What the map is

A plan of the walk as built, set about 1900. It is **not a reproduction of any one historical map.** No
survey or plan made around 1900 is used. The world is put together from modern data, altered towards
1900, and redrawn from an 1842 plan where today's buildings are post-war. [V] (this is how
`tools/build-area.mjs` works)

## Layers

| On the map | Source | Date of the source | What was done to it | Status |
|---|---|---|---|---|
| Houses on today's plots (gold hatching) | GRPK PASTAT building footprints, Nacionalinė žemės tarnyba (CC BY 4.0). `shadows-of-vilnius-seed/grpk/` | Harvested 2026-09-26. The cadastre shows today's state. | Footprints are kept as they are. A handful of post-war buildings are dropped (`tools/reconstruction/*remove_modern.json`; the count is `meta.stats.removedModern` in `area.json`). | Footprints [V]. That an older house of about 1900 stood on each plot is [U], a design assumption. |
| Houses from the 1842 plan (grey-green cross-hatching) | *Plan of Vilnius, 1842*, National Library of Poland, via Polona. `tools/reconstruction/src/vilnia_1842_BN_ZZK3501.jpg`. Recorded as public domain in `CREDITS.md`. | 1842 | Building blocks traced from the plan after georeferencing it to LKS94 (affine fit on surviving building corners, residual about 2–4 m), then split into plots of about 13 m frontage. 419 plots at the last build; 46 of them inside the walk. See `tools/reconstruction/README.md`. | Block outlines: grade B [V, traced]. Plot lines and storeys: grade C, conjecture [U]. That the 1842 blocks still stood in 1900 is [U]. |
| Town Hall and St Casimir's (vermilion, gold-edged) | The Town Hall: KVR 678, see `docs/REFERENCES.md` §4. The church: `docs/research/city-1900.md` §6. | Town Hall as finished in 1799. Church as rebuilt in 1864–68. | Modelled by hand (`src/world/townhall.ts`, `src/world/stcasimir.ts`). The map shows the GRPK or OSM footprint. | [V] for the dates. See the references for the modelling. |
| Streets (the gaps between houses; footways dotted), names | OpenStreetMap contributors (ODbL 1.0). `shadows-of-vilnius-seed/osm/overpass_oldtown_bbox_2026-09-26T1341Z.json`, `osm_base` 2026-09-26T13:41Z. | Today | Lines drawn as they are. Tunnels are left out; footways are dashed and carry no name. | Today's layout and today's names [V]. Around 1900 many streets carried Russian imperial names [V] (*Urban History*, see `docs/characters/knygnesys.md` note 9). Which name each street had is not researched (`docs/ROADMAP.md`, open question 4) [U]. Where post-war rebuilding changed a street line, the map shows today's line [U]. |
| Edge of the walk (dotted gold ring) | The walker's limit: `walkRadius` = 110 m around the Town Hall (`tools/build-area.mjs`, `WALK_RADIUS`). | n/a | The town beyond, out to `contextRadius` = 450 m, is drawn faded: it is only to be seen. | [V] (a game rule) |

## Not used

- **The 1866 plan** (`tools/reconstruction/src/vilnia_1866_BN_ZZK8170.jpg`) is in the repository to check
  against. Nothing is traced from it yet. [V]
- **Heights and terrain** (LiDAR) shape the 3D world but are not drawn on the map.
- **Any plan made around 1900.** None is used. Finding one would let the map be checked against the
  period it claims. [U]

## Known gaps

- **The 1842 tracing cannot be re-run from the repository.** `tools/reconstruction/trace_walkzone.py`
  reads the georeference (`A2.json`), the helper module `vec.py` and a KVR extract from a scratch folder
  outside the repository. The traced output (`walkzone_historic.geojson`) is committed, so the world
  builds, but the georeference cannot be audited or redone until those files are added.
- **Attribution.** The panel carries the short credit line. Full attribution is in `CREDITS.md`.

## Adding a layer

If a new source joins the map (an 1866 tracing, a c. 1900 plan), add: its swatch and text in `ABOUT_HTML`,
its draw pass in `drawMap` (`src/ui/map.ts`), a row here, and a row in `CREDITS.md`.
