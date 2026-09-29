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
node tools/dev-server.mjs  # http://localhost:5173
```

Needs Node.js 22.18 or newer (for `stripTypeScriptTypes`) and nothing else; runs on macOS,
Windows and Linux. A static copy for any web server: `node tools/build-static.mjs` → `dist/`.

Controls: W A S D to walk, Shift to jog, mouse (or click-drag) to look, mouse wheel to
zoom the camera in and out, Tab opens the full-screen map (Tab or Esc closes it), M to mute,
backtick (`` ` ``) toggles the stats overlay. On a phone, tap the round map in the corner. The full map has a
Glow switch (or `?map=glow`).
`?weather=clear` for the dry morning.

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
- The in-game map draws `area.json`; where each layer of it comes from is in `docs/map-sources.md`.
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
