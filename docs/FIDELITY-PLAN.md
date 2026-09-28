# Fidelity pass: plan (approved by the owner 2026-09-26, "do all of them")

> **Status: complete.** All seven streams are merged (`c601047`…`05c4625`). Shipping is now a push to
> `main`, which Vercel deploys to https://vilnius.gg. The artifact step under "Ship" is historical.

Owner's complaint: "still a bit boxy". Wanted: console-game / Unreal-like fidelity with the flair of the period paintings — everything old and unique. Stay on three.js.

Baseline (commit 44e7314): `node tools/shot.mjs --bench` → ~44 ms/frame GPU-synced at 2400×1350, ~1560 draw calls, ~4.1 M triangles (headless Chrome on the M4 Pro; compare runs, not absolutes).

## Tooling (already built)

`tools/shot.mjs` drives its own headless GPU Chrome against a dev server and saves JPEGs to `.screens/`:

```
PORT=5181 node tools/dev-server.mjs            # one dev server per worktree/port
node tools/shot.mjs --port 5181 --prefix before_ --views square,street,puddles,cobbles,roofs,aerial --bench
node tools/shot.mjs --view name:ex,ez,h,tx,tz,ty          # free camera (eye x,z,height; target x,z,height)
node tools/shot.mjs --js-view 'name:<js returning {eye:[x,y,z],target:[x,y,z]}>'   # `w` = window.__walk
node tools/shot.mjs --query weather=clear --pre '<js run once after load>'
```

Named views: square, wall, vok, shops, street, puddles, cobbles, roofs, aerial, hotel. Baseline shots: `.screens/base_*.jpg`, `.screens/t_th.jpg` (Town Hall).

## Seven parallel workstreams (one git worktree + one port each)

Common rules for every stream:
- Edit only your own files (below). Chained `onBeforeCompile` + extended `customProgramCacheKey` (see `wet()` in weather.ts, `age()` in ageing.ts).
- CC0 or permissive assets only, each recorded in CREDITS.md. Never Google Maps / Street View / Earth / 3D Tiles.
- No npm. Match the code style. Keep added cost small (aim < +3 ms in the bench; justify more).
- Keep `tools/build-static.mjs` working.
- Before and after screenshots, looked at, zero new console errors, also check `?weather=clear`.
- Commit on the worktree branch.

| Stream | Port | Owns | Goal |
|---|---|---|---|
| **A: Surfaces** | 5181 | `src/render/pom.ts` (new), materials.ts, houseMaterials.ts, fetch-textures.mjs, `public/assets/tex/**` | Parallax occlusion mapping on cobbles and clay roof tiles (Poly Haven height and AO maps; derivative-based tangent frame; distance fade). Also: anti-tiling macro variation across the square, and a decision on 4K vs 2K justified by size and screenshots. Exposes `float gPomHeight` (`#define POM_HEIGHT`) so rain water can fill the joints first. |
| **B: House geometry** | 5182 | facades.ts, buildings.ts | Bevelled boxes for surrounds, sills, quoins and brackets. Richer cornice profiles (cyma, cavetto, torus) with smooth normals. Roof thickness: fascia, soffit, ridge and hip caps. Half-round gutters joined to the downpipes; optional real standing seams. Gentle roof sag and wall irregularity with **no gaps** (one deformation field per wall/roof). Triangle budget reported. E adds an `anchors` export to facades.ts: keep the return shape extendable. |
| **C: Wet reflections** | 5183 | `src/render/ssr.ts` (new), post.ts, weather.ts, main.ts wiring | Screen-space reflections on wet ground. The mask is encoded in the HDR alpha by the ground shader, or rebuilt from world position; verify GTAO keeps it. Ripple and flow normals are shared GLSL with weather.ts. Half-res trace; blurred vertical streaks on wet stone; mirror puddles and gutters; lamps and shop windows reflect. Puddles should read as water, not brown mud. Off in clear weather; R toggles. |
| **D1: Cabs** | 5184 | carriages.ts | Vilnius izvozchik droshky with a folding hood; spoked wheels (larger at the back) that turn with distance; elliptic springs and shafts. Heavier carriages and carts. Harness attached to the horse's bones: collar, duga shaft-bow, blinkers, reins. A seated coachman (man.glb posed; caftan, low hat). Better horse shading, mane and tail. |
| **D2: People** | 5185 | people.ts, character.ts, market.ts, `public/assets/char/**` | Research higher-detail CC0 or permissive rigged humans (Quaternius Universal Base Characters and Universal Animation Library first; no Mixamo, no accounts). Integrate if clearly better, keeping palettes, accessories, umbrella IK, the lamplighter and performance. Either way: smooth shading, frock coats with tails, skirts to the ground, capes, aprons, faces, varied builds. |
| **E: Street props** | 5186 | `src/world/streetprops.ts` (new), props.ts, main.ts wiring, a tiny additive `anchors` in facades.ts | Period-checked: guard stones at gateways, drain grates at flow-map collection points, an advertising column with canvas-drawn posters, a pump or well, hitching posts and a cab stand, garden benches, sparse barrels, crates and sacks, straw and droppings. Instanced, bevelled, wet() in rain, with collision segments. Don't block doors. |
| **F: Landmarks** | 5187 | townhall.ts, stcasimir.ts, promenade.ts, trees.ts | The Town Hall reads as a cardboard box (`.screens/t_th.jpg`). Needed: a round Doric/Tuscan portico with entasis, bases and capitals; a full entablature with triglyphs and mutules; a pediment with a raking cornice; bevelled steps; window surrounds; rustication. Follow Gucevičius's drawings in `reference/`. Garden lawn as real grass (shells or instanced blades), stone lawn kerbs, the basin rim. St Casimir's mouldings. |

The reference images are in `/Users/pauliuss/snbx/vilnius-town-hall-walk/reference/` (gitignored, so read them by absolute path) and `docs/REFERENCES.md`.

## Integration (after the seven return)

1. **Merge.** Merge each branch into `main`, resolving conflicts (CREDITS.md, main.ts, facades.ts between B and E).
2. **Join the streams.**
   - Rain water fills the cobble joints first, using `gPomHeight` in the weather.ts ground branch. Keep the SSR mask formula in sync with it.
   - E's props use B's bevelled helpers where useful.
3. **Check performance.**
   - Bench the merged build.
   - If the total cost grew a lot, run a perf pass. Candidates: 4.1 M triangles now; shadow cascades re-render everything; crowd LOD and culling; tree leaf counts; half-res post passes.
   - Target: the running app holds about 55–60 fps on the owner's Mac through dynamic resolution without dropping below 1.0×.
4. **Final screenshots.** Take the full set, clear and rain, and look at every one. Fix regressions.
5. **Ship.**
   - Commit.
   - `node tools/build-static.mjs`.
   - Republish the private artifact https://claude.ai/artifact/Nx3a9G9auQStcv7ZRb9E2Q: read it first (Artifact action "read"), then publish with `file_path: dist/artifact.html`, `root: dist`, `url` set to that link, and `files` listing every dist file that is new or changed (e.g. all `src/**/*.js`, new textures in `assets/tex/`, new models in `assets/char/*.gltf.json`). Files left out are kept from Version 5. Limits: 15 MB per binary file and 64 MB per version.
   - Send the owner before/after screenshots with a short plain summary.
