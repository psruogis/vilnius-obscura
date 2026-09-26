# Historic-layout reconstruction

The data tool (`tools/build-area.mjs`) merges every file here automatically:
- `*remove_modern.json`: `{ "remove": [GRPK TOP_ID, ...] }`, post-war footprints dropped from the scene.
- `*_historic.geojson`: EPSG:3346 polygons with `kind: "plot"`, optional `storeys`, `source`, `grade`.

## walkzone (Vokiečių, the SMC block, Rūdninkų)

`trace_walkzone.py` traces the hatched building blocks of the **1842 plan of Vilnius** (National Library of
Poland / Polona, public domain; `src/`, gitignored) after georeferencing it to LKS94 (affine fit on surviving
building corners, residual about 2–4 m). Two kinds of zone:

- **Replace zones** (the SMC block, Rūdninkų south side, the south-west side of Vokiečių): every modern footprint
  is removed unless it contains a KVR heritage point dated before 1800 *and* the plan shows a building there.
  The plan's blocks take their place.
- **Fill-in zones** (the wedge between Vokiečių and Mėsinių, which was cleared after the war for today's wide
  boulevard, and the upper part of Vokiečių): plan blocks are added only where nothing stands. Post-war
  buildings standing mostly on 1842 street or courtyard space are removed.

Blocks are split into plots of about 13 m frontage (Voronoi cells seeded along the street fronts). Plot lines
and storeys (2, or 3 near the square) are conjecture, grade C. Block outlines are grade B.
Check image: `docs/screenshots/recon-walkzone-overlay.jpg` (blue = new plots, red = removed, green = kept).
