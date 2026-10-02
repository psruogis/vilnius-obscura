# Vilnius Obscura — Town Hall Walk

Live at **https://vilnius.gg**.

A browser walk-through of Vilnius Town Hall Square around 1900, in the rain, built from
real map data: the Town Hall (finished 1799), the square's houses and shops, townsfolk, cabs.
The original brief is in `TOWN-HALL-WALK-BUILD-PROMPT.md`. The current plan is `docs/ROADMAP.md`,
and `CLAUDE.md` holds the working context.

## Run it

```bash
node tools/vendor.mjs      # once: fetch three.js and suncalc from jsDelivr into public/vendor/
node tools/build-area.mjs  # rebuild public/data/area.json from the seed data
node tools/build-oldtown.mjs  # then the map's Old Town out to the city gates (public/data/oldtown.json)
node tools/dev-server.mjs  # http://localhost:5173
```

Needs Node.js 22.18 or newer (for `stripTypeScriptTypes`) and nothing else; runs on macOS,
Windows and Linux. A static copy for any web server: `node tools/build-static.mjs` → `dist/`.

Controls: W A S D to walk, Shift to jog, mouse (or click-drag) to look, mouse wheel to
zoom the camera in and out, Tab opens the full-screen map (Tab or Esc closes it), M to mute,
backtick (`` ` ``) toggles the stats overlay. On a phone, tap the round map in the corner. The full map has a
Pastel / Dark / Glow switch (pastel is the default; or `?map=dark`, `?map=glow`).
`?weather=clear` for the dry morning, `?gate=ghost` for the Subačius Gate as a ghost where it stood; `#gate` starts
the walk on Subačiaus g. by the gate (`#ghost`: the same, with the ghost). `gate.html` (on the site: **vilnius.gg/gates**) shows the gates
on their own, in clear daylight, to be turned round with the mouse or a finger: the Subačius Gate, or any of the nine lost
gates by name (`#rudninkai`, `#saviour`, `#bernardine`, `#castle`, `#wet`, `#tatar`, `#vilija`, `#trakai`; `#field`,
`#city`, `#passage`, `#above` pick a view, and `#trakai-field` and so on).

Music: none, except klezmer that drifts in as you walk west towards the Jewish quarter (`docs/music.md`; the Music
slider is in Options).

The walk is the square and the road out to the Subačius Gate: down Didžioji g., along Subačiaus g. to the Bokšto
corner, where the city wall's east gate stood until 1801. It stands there whole, with the wall, a century out of its
time on purpose (`docs/gates.md` §8).

When you settle onto a new street its name shows at the top for a few seconds and fades (the square's name at the
start); names are today's, as on the map.

The title and pause screens (Esc) have Walk / Continue, Options and Credits. Options (Picture, Sound, Keys; Touch on a
phone) are kept in the browser: weather, brightness, saturation, map look, quality, wet-street reflections and the
volumes. Accept keeps them, Cancel goes back, Default resets; a change of weather reloads the walk. `?quality=low` and
`?weather=` in the address override what was kept.

### Why not `npm run dev`?

The npm registry is blocked on the network this was built on, so the project
runs without npm: dependencies are vendored from the jsDelivr CDN and a small
Node dev server strips TypeScript on the fly (`node:module` `stripTypeScriptTypes`)
and serves an import map. The code is written for Vite, so once npm works:
`npm install three suncalc && npm install -D vite typescript @types/three @types/suncalc`,
then `npm run dev`.

## Data

- `shadows-of-vilnius-seed/`: pinned inputs (see its README): GRPK footprints,
  the heritage register extract, and an OpenStreetMap snapshot.
- The in-game map draws `area.json`, and, once opened, `oldtown.json`: the rest of the Old Town, the city wall's
  line and its ten gates (`src/world/citygates.ts`). Where each layer comes from is in `docs/map-sources.md`.
- `tools/build-area.mjs` turns them into `public/data/area.json` in a local frame:
  X = E − 583000, Z = −(N − 6061000), metres, Y up (EPSG:3346 / LKS94).
- Heights: national LiDAR if `tools/lidar/heights.json` exists, else OSM
  `height` / `building:levels`, else a three-storey default. Ordinary houses
  are capped at three storeys to approximate c. 1800.

## Milestones

- [x] M1: walkable real footprints, sky with the real 1800 sun, shadows, placeholder walker, follow camera, collisions
- [x] M2: roofs, period façades, cobbles, heights, backdrop, lighting polish
- [x] M3: the Town Hall model, St Casimir's, market square props
- [x] M4: character and animations, sound, start screen, credits, deploy
- [ ] M5 (optional): info points, people, Lithuanian
