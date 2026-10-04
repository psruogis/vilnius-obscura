# Roadmap

Updated 2026-09-30. The order of "Next" is **a proposal**. The owner hasn't ranked it yet, so
reorder freely.

## Done

- **The walk (M1–M4):** real footprints and heights, period façades and roofs, cobbles, the Town Hall
  and St Casimir's (in its c. 1900 Orthodox form), townsfolk, cabs, the market, rain, sound, the
  title screen, credits. See `README.md` and the git log.
- **The road to the Subačius Gate:** the walk now runs from the square down Didžioji g. and along Subačiaus g. to
  the Bokšto corner, where the city wall's east gate stood until 1801, and a few steps outside it. The gate stands
  there whole, with the wall either side, as it was before 1801, after P. Smuglevičius's drawing of 1785–86: a
  century out of its time, the owner's choice (`src/world/subacius.ts`, `docs/gates.md` §8). `?gate=ghost` shows it
  instead as a ghost in pale ink over the street, rising from ragged remnants of the wall. `gate.html` shows the
  model on its own, in clear daylight, to be turned round (published as a claude.ai artifact). The
  walk's edge is now a shape, not a circle (`src/world/zone.ts`, `WALK_SHAPES` in `tools/build-area.mjs`): barriers,
  street furniture, water, townsfolk and the map follow it, so growing the walk street by street is a data change.
  The LiDAR was extended east to cover the gate site (`tools/lidar/README.md`). Cost: about 7% more draw calls and
  14% more triangles when the road is in view (the houses along Subačiaus are big blocks, windowed on every side).
- **St Casimir's west front, c.1900:** rebuilt from the owner's photos and postcard and the 1870s and 1889 photos: tower
  attics with cartouches and urns under bell domes and open lanterns, bells in the belfries, painted icons in the niches,
  the 1864–68 turret with its scrolls and dormered dome, the porch with its broken pediment and clock, rustication below
  (`src/world/stcasimir.ts`, `docs/REFERENCES.md` §5.3).
- **The Rūdninkai Gate:** the west gate modelled after P. Smuglevičius's drawing of 1785 and the descriptions: the
  tall tower, the two-storey barbican of 1675–79 with its gateway, round cannon ports, the guard's niche, the wall
  along Pylimo g. to the houses on its line (`src/world/rudninkai.ts`, `docs/gates.md` §9). It stands at its site, at
  the end of Rūdninkų g., outside the walk for now; `gate.html#rudninkai` shows it on its own. Next: a road to it.
- **The seven other lost gates:** the Trakai, Vilija, Tatar, Wet, Castle, Bernardine and Saviour's gates, built on one
  tower-gate kit from what the sources say of each (`src/world/towergate.ts`, `src/world/lostgates.ts`,
  `docs/gates.md` §10); the Rūdninkai Gate now runs on the same kit. Much is conjecture: no picture survives of any
  but the Wet Gate's north side. All nine lost gates are at `vilnius.gg/gates`; the Saviour's Gate also stands in the
  walk's world, at its far edge by the Užupis bridge, and on the map. The rest wait for the world to reach them.
- **The city gates on the map:** all ten gates of the city wall are drawn where they stood, from the heritage
  register (KVR 39), Wikipedia, the LNDM and V. Drėma; a dotted ring where the site was never found
  (`src/world/citygates.ts`, `docs/gates.md` §2). The register's strip along the wall is drawn as the wall's line,
  the castles the wall met at the Castle Gate are drawn from the register's castle site (KVR 141) and OSM, and the
  full map now reaches the whole Old Town out to the gates and the castle hill, from OpenStreetMap outlines that load only when
  the map opens (`tools/build-oldtown.mjs`, `public/data/oldtown.json`, 156 KB).
- **Street title:** the name of the street you are walking on shows at the top for a few seconds, then fades
  (`src/ui/place.ts`). Today's names from OpenStreetMap, like the map's: what each street was called around 1900 is
  not researched (open question 4), so the title will need a second source when it is.
- **The menu:** title and pause screens in the "iron and oxblood" style (`src/ui/overlay.ts`, `options.ts`,
  `settings.ts`; the approved artboards are in the Design canvas "Main menu styles", set A), with Options and Credits, for
  desktop, phone upright and phone on its side. The 1900s "gilt and green" set B was not chosen.
- **The map:** a round plan in the corner that follows the walker (north up, with the view cone), and
  a full-screen view (Tab, or a tap on the corner map) with pan, zoom, street names and an "About this
  map" note on what each layer is and from when. Three looks: pastel (default), dark, glow. `src/ui/map.ts`, `docs/map-sources.md`.
- **Fidelity pass:** seven parallel streams covering surfaces, house geometry, wet reflections,
  cabs, people, street props and landmarks, all merged (`docs/FIDELITY-PLAN.md`).
- **Shipping:** GitHub → Vercel. Every push to `main` goes live at https://vilnius.gg.

## Next (proposed order)

1. **Mobile.** The owner is building the touch controls. After that: an add-to-home-screen manifest
   (`"display": "fullscreen"`, the only real fullscreen on iPhone); `requestFullscreen()` on the
   "Click to walk" button (Android); keeping the screen awake (Wake Lock); viewport and CSS hardening
   (`viewport-fit=cover`, `touch-action: none` on the canvas, `overscroll-behavior: none`, no pinch
   zoom); and a lighter phone quality tier (fewer shadow cascades, AO off, capped pixel ratio). Keep
   touch controls out of the bottom ~20 px on iPhone. As the walk grows, build or hide the façade chunks by
   distance to the walker, not to the walk, for phones.
2. **The knygnešys**, the book courier. The brief is ready: `docs/characters/knygnesys.md`. Needs a
   scripted route-follower NPC; St Nicholas' Church modelled (or the walk extended west); and,
   optionally, a November-dusk light preset.
3. **More characters.** The roster is in `docs/characters/README.md`.
4. **The other gates.** `docs/gates.md`. All nine lost gates are modelled (§8–10); the Subačius, Rūdninkai and
   Saviour's gates stand in the world. Next: roads to the Rūdninkai and Saviour's gates in `WALK_SHAPES`, the Gate of
   Dawn (the one gate still standing, a careful pass of its own), and the world grown to reach the northern gates.
   The 1648 Getkant and 1740 Fürstenhoff plans would firm up the lost gates' footprints. The Tatar Gate now follows
   J. Kamarauskas's paintings of 1894–97 (`docs/gates.md` §10); he also painted the Trakai, Vilija and Saviour's
   gates (1892–98), the next to refine the same way.
5. **The Great Synagogue and the Shulhoyf.** No model exists to import; it would be built from
   archives (`docs/research/city-1900.md` §6). It sits inside the existing map frame.
6. **The crowd, balanced to the 1897 census.** Mix in `docs/research/city-1900.md` §2.
7. **Info points and Lithuanian (README M5).**

## Small jobs

- **Faded plaster on the other houses** (about half an hour). St Casimir's has a faded, uneven limewash (`fade` in
  `age()`, `src/world/ageing.ts`, after the tinted 1915-18 postcard). Turn it on for the plain house walls
  (`main.ts`, `wallMat`), the hero houses' plaster (`houseMaterials.ts`) and the Town Hall, tuned per material: the
  houses are cream, ochre and grey, and the Town Hall should stay the cleanest. Check in rain and dry weather.
- **Music:** klezmer (Harry Kandel's Orchestra, 1921) that drifts in near the west and north edges of the walk, where
  the German Street meets the Jewish quarter, and nowhere else: there is no music everywhere. See `docs/music.md`. Free
  in Europe, not only in the US. Open: more places with their own music (a German Street zone), a piece by Čiurlionis or
  Moniuszko.
- **Map:** the 1842 tracing cannot be re-run from the repo (its georeference and helper module live in
  a scratch folder; see `docs/map-sources.md`, Known gaps). Trace the 1866 plan into a second layer, or
  find a plan from about 1900, and let the map show which era each block comes from.

- **Web Analytics.** There is currently no visitor counting. The owner enables it under the
  project's Analytics in Vercel, which gives a unique script path; then add the two-line HTML
  snippet to `index.html`. Until then, Observability shows edge requests and data transfer.
  Data transfer ÷ 33.5 MB ≈ the number of full first-time loads.
- **Attach `vilniusobscura.com`** to the Vercel project as a second domain.
- **Lighting presets** are all dated 1800 (`LIGHTS` in `src/main.ts`). The sun is the same in 1900,
  but a new dusk preset should be dated to the setting.

## Open research questions

1. How did smuggled books actually reach the city: rail, cart or on foot, and by which road?
2. Were there police or toll posts on the roads into the city around 1902?
3. Were street lamps in the Old Town lit by hand in 1902, and at what time?
4. What were the 1902 (Russian imperial) names of the streets on the courier's routes?
5. Where exactly were the Tatar, Vilija and Subačius gates? The English and Lithuanian sources
   disagree.
6. What did the lost gates look like? Modelled from the descriptions (`docs/gates.md` §10); pictures, if any survive
   (the Getkant and Fürstenhoff plans, Smuglevičius's panorama), would replace the guesswork.
7. Where did ordinary Lithuanian-speaking servants and workers live? Nothing found so far.

## Superseded

`SHADOWS-OF-VILNIUS-MASTER.md` and `prompts/`: the earlier stealth-game plan. Kept for history only.
