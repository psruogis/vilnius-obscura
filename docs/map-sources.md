# Sources of the in-game map

The map (corner plan and full-screen view, `src/ui/map.ts`) draws `public/data/area.json`, so it shows
exactly what stands in the 3D world. Its "About this map" panel is the short, player-facing version of
this page. **Keep the two in step**: `ABOUT_HTML` in `src/ui/map.ts` and the table below.

Tags follow `docs/REFERENCES.md`: **[V]** verified, **[U]** unverified or a design choice.

## The look

Vellum and ink: outlines wobble a little as a hand's do, houses are hatched, names are set in Almendra
(streets), Cinzel (places) and UnifrakturCook (the title). It is a design choice, not a claim about how any
1900 plan looked. [U] The map has three looks, chosen with a switch on the full map (and remembered):
**Pastel** (the default: a dark dusky ground with faded, see-through sand, powder blue and dusty rose; the corner map lets the scene show through a little), **Dark**
(dark vellum, gold ink) and **Glow** (Dark with a soft light behind the ink and the landmarks). Every colour
of a look is one table, `THEMES` in `src/ui/map.ts`; the legend swatches and the full-screen panels follow it
(`src/style.css`). The legend in the panel is one colour and a few words per row; the sources are listed under it.

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
| Subačius and Rūdninkai gates (vermilion, gold-edged, like the Town Hall; with `?gate=ghost`, a faint fill, dashed, labelled "site"). The Rūdninkai Gate: its tower and barbican as modelled (`src/world/rudninkai.ts`, `RUDNINKAI_GATE`), `docs/gates.md` §9 | The city wall's east gate, pulled down in 1801–02: the block and its two towers as modelled (`src/world/subacius.ts`, `SUBACIUS_GATE`), in the gap between the two surviving stretches of wall (OpenStreetMap). See `docs/gates.md` §8. | Before 1801 (the gate); the wall lines today | Size and shape read off P. Smuglevičius's drawing of 1785–86. In the street it stands, a century out of its time (the owner's choice); the ghost is an option. | The site [V]; the outline [U]. |
| City gates (a ring of ink and a name in small capitals: open where the gate was gone by 1900, filled for the Gate of Dawn; a dotted ring where the site was never found) | The ten gates of the city wall, `src/world/citygates.ts`. Sites from the heritage register (KVR 39), Wikipedia (lt), the LNDM, VSAA, Wikidata and V. Drėma's *Dingęs Vilnius*; each gate's sources in `docs/gates.md` §2. The Subačius Gate is drawn as its plan (above). | The wall and gates: 1503 to the early 17th c.; pulled down 1799–1805, two perhaps later | Street corners and landmarks read off OpenStreetMap; the ring's size is how far the site may be off. | Per gate in `docs/gates.md` §2: six [V], four [U] (Vilija, Wet, Bernardine, Saviour's). |
| Line of the city wall (a faint vermilion band) | The strip of ground the heritage register protects along the wall: KVR 39, "Vilniaus miesto gynybinių įtvirtinimų liekanų kompleksas", Kultūros paveldo departamentas (CC BY 4.0), polygon in `shadows-of-vilnius-seed/kvr/`. Built into `public/data/oldtown.json` by `tools/build-oldtown.mjs`. | The register's record, 2019–22 | Drawn as it is, over the veil. It is a protected strip, wider than the wall, and takes in whole plots in places. | The strip [V]; that the wall ran inside it [V] ⁷ of `docs/gates.md`; the wall's own width is not drawn. |
| The castles (a darker vermilion line round the castle site; the Upper Castle's standing walls in cream; "Upper Castle", "Lower Castle"; the Bernardine monastery's line from the Bernardine Gate to the castle site, dashed, labelled "Bernardines") | The edge of the castle site, KVR 141 "Vilniaus piliavietė" (Kultūros paveldo departamentas, CC BY 4.0), and the Upper Castle's walls (OpenStreetMap barrier=city_wall inside it). For the Bernardines: the east side of the ensemble's territory (KVR 766) and a standing wall from its northern tip to the castle site (OpenStreetMap way 111764028); the church was built into the city wall in the early 16th c. (en.wikipedia). In `public/data/oldtown.json`. | The register's record; the walls today | Drawn as they are. The site's edge follows the Vilnia's old channel on the south, where the Wet and Castle gates stood; the Lower Castle's own walls ran inside it and are not drawn. | The site [V]; that its edge is the castles' wall line [U]. See `docs/gates.md` §2. |
| The rest of the Old Town (outlines past the walk's houses, unhatched) | OpenStreetMap building outlines, squares and street names (ODbL), inside the Old Town boundary (KVR 16073) and the box round the gates, where `area.json` has no house: `public/data/oldtown.json`, built by `tools/build-oldtown.mjs`, fetched only when the full map is first opened. | Today (snapshot 2026-09-26) | Outlines as they are, roughened like the rest; faded under the veil like the town past the walk. | Today's outlines [V]; that they show the town of 1900 is [U]. |
| Edge of the walk (dotted gold line) | The walker's limit (`meta.walk` in `area.json`, `WALK_SHAPES` in `tools/build-area.mjs`): the square, 110 m around the Town Hall (`WALK_RADIUS`), and the road out to the Subačius Gate along Didžioji g., Subačiaus g. and a little of Šv. Dvasios g. | n/a | The town beyond is drawn faded, more so the further from the walk: it is only to be seen. Buildings are loaded out to 450 m from the Town Hall (`contextRadius`) and 120 m from the rest of the walk. | [V] (a game rule) |

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
