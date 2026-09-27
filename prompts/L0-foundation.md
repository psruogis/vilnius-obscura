# LEVEL 0 — FOUNDATION & THE LOOK-DEV ROOM

**Project: SHADOWS OF VILNIUS** — an Assassin's Creed–inspired third-person stealth-parkour game running in the browser on three.js, art-directed to read as console-quality.

> Paste this whole file as the first message of a fresh Claude Code session in
> `C:\Users\IDOMUSPC\CCode\shadows-of-vilnius`. It is Level 0 of a 13-level prompt ladder
> (see `prompts/README.md`). Do not skip ahead — L0 builds the machine every later level tunes.

---

## 1. YOUR ROLE

You are the **technical director and lead graphics engineer** on this project. I am a product designer, not an engineer — so:

- Make the engineering calls yourself. Do not ask me to choose libraries, folder names, or math.
- Ask me only about **art direction and feel** (mood, palette, pacing, silhouette), and only when the answer would genuinely change what you build.
- Every visual parameter you invent must end up as a labelled slider in the debug panel, because **I art-direct through that panel**, not through code.
- Write code a competent engineer would recognise as idiomatic three.js. No frameworks-on-frameworks.

## 2. THE NORTH STAR

One sentence: *a hooded figure crosses the wet slate rooftops of Vilnius Old Town at 2 a.m. in October rain, moonlight breaking through torn cloud, lantern light pooling in the cobbles below, and it looks like a captured frame from a AAA console game.*

The reference bar is: **Assassin's Creed Unity** (architectural density, parkour fluidity), **AC Syndicate** (night-city lighting), **Ghost of Tsushima** (wind, weather, colour grading), **The Last of Us Part II** (wet material response, character shading). We will not match their polygon counts. We *will* match their **lighting discipline, material response, and post-processing taste** — which is where most of the perceived quality actually lives.

**The five things that will make or break this project**, in order:

1. Lighting (baked GI + one disciplined moonlight + fake-but-convincing lantern pools)
2. Post-processing stack and colour grading
3. Material response, especially **wetness**
4. Silhouette and animation of the player
5. Density of environmental detail (props, decals, birds, steam, laundry lines, puddles)

Raw triangle count is nowhere on that list. Never trade framerate for triangles.

## 3. LOCKED TECHNICAL DECISIONS — do not relitigate these

| Area | Decision |
|---|---|
| Language / build | TypeScript strict, Vite 7, ESM only |
| Engine | three.js latest (r18x), `WebGLRenderer` for v1. Keep all renderer setup behind `src/core/Renderer.ts` so a WebGPU swap is a one-file change later. |
| Post-processing | `postprocessing` (pmndrs) — its effect quality is the whole point. Plus `n8ao` for ambient occlusion. |
| Colour | Linear-sRGB working space, `ACESFilmicToneMapping`, `renderer.outputColorSpace = SRGBColorSpace`, exposure as a graded knob. Never author a colour by eye in sRGB hex and assume it is right. |
| Units | 1 unit = 1 metre. Y-up. Character faces -Z. Real-world scale everywhere, always. |
| Shadows | Cascaded shadow maps (3 cascades) for moonlight. VSM or PCSS soft filter. Only the moon and at most 4 nearby dynamic lights cast shadows, ever. |
| Lighting model | **Baked lightmaps + light probes for the city; realtime for the player and hero lights.** No realtime GI. This is the single most important decision in the project. |
| Textures | KTX2 (UASTC for normals/ORM, ETC1S for albedo), 2K tiling sets, **ORM-packed** (AO=R, Roughness=G, Metal=B). Never ship a PNG. |
| Meshes | glTF 2.0 + Meshopt compression. Instance everything repeatable. |
| Asset processing | `gltf-transform` CLI in an `npm run assets` pipeline. Source art in `art/`, processed output in `public/assets/`. `art/` is gitignored; `public/assets/` is committed. |
| Debug panel | Tweakpane, with **preset save/load to JSON** in `src/art/presets/`. Presets are project assets, not debug junk. |
| State | Plain classes and a small typed event bus. No Redux, no ECS library, no React in the game loop. |
| Physics | Rapier (WASM) for the character controller, ragdolls, and prop collisions. Kinematic character controller, not dynamic. |
| Animation | glTF clips + three's `AnimationMixer`, driven by a hand-rolled state machine in `src/player/LocomotionSM.ts`. |
| Audio | Howler for 2D/UI, three's `PositionalAudio` for world. Deferred to L12. |
| Target | 60fps at 1440p on an RTX 3060 laptop / M2 Pro. 1080p/60 on integrated graphics with the quality preset dropped. |

## 4. WHAT LEVEL 0 MUST DELIVER

L0 is **not** a game. L0 is the **look-dev room**: a single, beautifully-lit Vilnius street corner that proves every pipeline the rest of the project depends on, plus the console I use to art-direct it.

Build these, in this order.

### 4.1 Project skeleton

```
shadows-of-vilnius/
├─ art/                      # gitignored: raw Meshy/Tripo/Blender/texture sources
├─ public/assets/
│  ├─ env/                   # HDRIs, sky LUTs
│  ├─ tex/                   # processed KTX2 texture sets
│  ├─ models/                # processed .glb
│  └─ lut/                   # colour grading .cube converted to 3D texture
├─ src/
│  ├─ core/                  # Renderer, Loop, Time, ResourceManager, Stats
│  ├─ render/                # PostStack, ShadowRig, ToneMap, QualityTiers
│  ├─ world/                 # Scene assembly, streaming stubs, Sky, Weather
│  ├─ mat/                   # material factories + shader chunks (wetness, POM, detail-normal)
│  ├─ player/                # CharacterController, CameraRig, LocomotionSM, Input
│  ├─ art/                   # ArtDirector (tweakpane), presets/*.json
│  ├─ util/
│  └─ main.ts
├─ prompts/                  # this ladder
├─ docs/ART_BIBLE.md         # you write and maintain this
└─ tools/                    # asset pipeline scripts
```

### 4.2 Render core

- Fixed-timestep simulation (60Hz) with decoupled render and interpolation. Frame-rate independence is not optional.
- Quality tiers: `low | medium | high | ultra` that scale render resolution, shadow map size, cascade count, AO samples, particle counts, and post effects. Auto-detect on first boot by benchmarking the first 90 frames; let me override in the panel.
- Dynamic resolution scaling that holds 60fps by scaling render scale 0.6–1.0 before it ever drops effects.

### 4.3 The post-processing stack (get the order right)

`N8AO → SSR (ground only, mask-driven) → Bloom (threshold-selective, 6 mips) → DOF (cinematic cam only) → Motion blur (velocity buffer, subtle) → Chromatic aberration (0.0008, edges only) → LUT grade → ACES tonemap → Film grain (animated, 0.015) → Vignette (0.25) → SMAA`

Every effect gets an on/off toggle and its key params exposed. Ship with a **Cinematic** preset and a **Performance** preset committed as JSON.

### 4.4 The night sky — first pass

- Procedural night sky shader: horizon gradient authored in HDR values (not sRGB), light-pollution glow warm-tinted toward the city centre.
- Real star field: roughly 2,000 stars from an actual catalogue at correct positions for Vilnius (54.687°N, 25.283°E), apparent magnitude driving size and brightness, subtle scintillation.
- Moon: a real disc with an albedo texture, a driveable phase, a soft halo, and — critically — it is the **parent of the directional light**. Moving the moon in the panel moves the shadows.
- Two scrolling cloud layers, raymarched at quarter-res, with the moon able to break through gaps.
- Expose: time-of-night, moon azimuth/elevation/phase, cloud coverage/speed/density, star intensity, light-pollution colour and strength.

### 4.5 Moonlight and the lighting bible

- One `DirectionalLight` as the moon. Cool but not cartoon-blue: start at `#8FA8C8`, around 0.6 intensity, and let the LUT do the heavy colour lifting.
- CSM with tuned cascade splits for a 300m view distance. No visible cascade seams. No peter-panning.
- Lantern and window light: **baked into the lightmaps** plus emissive meshes plus a single billboarded volumetric cone per lantern. At most 4 real `PointLight`s, pooled and reassigned to the nearest lanterns each frame. Document this trick in `ART_BIBLE.md` — it is how we get 40 lights for the cost of 4.
- A night `IBL` environment map for ambient specular, intensity-linked to moon elevation.

### 4.6 Materials and the wetness system

Author these as reusable factories in `src/mat/`:

- **Cobblestone** with parallax-occlusion mapping (8–24 adaptive steps) — the ground must have real depth when the camera is low, and puddles must sit *in* the depressions, not on top of them.
- **Lime plaster** (Vilnius baroque render) with edge-wear masks revealing brick beneath.
- **Red brick** (St. Anne's gothic) with deep mortar normals.
- **Weathered timber**, **oxidised copper roofing** (that specific Vilnius green patina), **slate and tin roofing**.
- A shared **`wetness` chunk** injected into every material via `onBeforeCompile`, driven by one global uniform plus a per-material porosity mask: as wetness rises, albedo darkens and saturates, roughness drops toward a smooth floor, F0 rises to around 0.05, and a puddle mask floods cavity-map lows. **This one uniform is what will make the whole game look expensive.** Make it excellent.

### 4.7 Rain — first pass

- GPU-instanced rain streaks spawning in a camera-relative volume, wind-sheared, length scaled by velocity, brightening when they cross the moon vector.
- Ripple rings on wet surfaces via an animated normal flipbook, density linked to rain intensity.
- Screen-space lens droplets that accumulate and streak, aware of camera motion.
- Splash sprites where rain meets ground, and roof-edge drip emitters.
- `weather.rainIntensity` 0→1 drives rain, wetness, ripples, sky coverage, and (later) audio in one call.

### 4.8 The look-dev street corner

Hand-build one **real** corner: the junction of **Pilies Street and Šv. Mykolo Street** — three grey-boxed-but-properly-materialed 3–4 storey baroque façades, an arched gateway, cobbled street with camber and a real puddle in the low point, three wall lanterns, a first-floor window with warm interior light, a wrought-iron balcony, drainpipes, and a cat. 1:1 scale, roughly 40m of street.

This corner is the **calibration reference** for the entire city. It gets a baked lightmap from Blender Cycles so I can see exactly what the baked pipeline buys us.

### 4.9 Player and camera

- Rapier kinematic capsule: walk 1.6 m/s, jog 3.6, sprint 6.2, with proper acceleration curves.
- A placeholder GLB (Mixamo Y-Bot is fine for L0) with idle/walk/jog/sprint/turn clips blended by `LocomotionSM`. Foot-lock IK is not required at L0, but leave the hook.
- Third-person spring-arm camera: right-shoulder offset, collision-aware arm that shortens against geometry, FOV 50 idle rising to 68 at sprint, positional lag and rotational damping tuned so it feels weighty rather than floaty. Mouse+keyboard and gamepad both work.
- A separate **free-fly cinematic camera** on a hotkey — I need it to compose screenshots.

### 4.10 The Art Director panel

Tweakpane, collapsible, toggled with `~`. Every knob above, grouped: `Camera / Sky & Moon / Lighting / Weather / Materials / Post / Quality / Debug`.

Plus: FPS graph, frame-time breakdown, draw calls, triangles, texture memory, and **Copy preset to clipboard** and **Save preset** buttons. Ship three committed presets: `cinematic-rain.json`, `clear-moonlit.json`, `performance.json`.

## 5. PERFORMANCE BUDGET — treat these as failing tests

| Metric | Budget |
|---|---|
| Frame time (ultra, 1440p, RTX 3060) | ≤ 16.6 ms |
| Draw calls | ≤ 900 |
| Visible triangles | ≤ 2.5 M |
| Texture VRAM | ≤ 400 MB |
| JS heap after 10 min | stable, no growth |
| Initial load to playable | ≤ 8 s on 50 Mbit |
| Per-frame allocations in the hot loop | zero, enforced |

Print these live in the debug HUD and colour them red when breached.

## 6. ART BIBLE — you write it as you go

Create and maintain `docs/ART_BIBLE.md` from L0 onward. It holds the palette (in HDR linear values), the lighting rules, the material conventions, the wetness curve, the LUT rationale, and every faked technique with a note on why the fake is invisible. Every later level appends to it. This document is how the project stays coherent across 13 levels.

## 7. OUT OF SCOPE FOR L0 — do not build these yet

Parkour, climbing, combat, hidden blade, guards, AI, navmesh, crowds, the full city, hero landmarks, water, the boss, quests, UI/HUD beyond debug, audio, save system, menus.

If you find yourself writing any of it, stop and finish L0 properly instead. Later levels are far easier if L0 is genuinely solid.

## 8. ASSET SOURCING FOR LATER LEVELS — build the pipeline for it now

Characters, weapons, and the boss will come from **Meshy** and **Tripo3D** as GLB exports. So the `npm run assets` pipeline must already handle the specific mess those tools produce: unwelded vertices, 4K PNG texture sets, triangle counts over 100k, no LODs, arbitrary scale and orientation, and no rig.

Write the pipeline in L0 with a `--from-genai` flag that normalises scale and orientation, welds, decimates to LOD0/1/2, repacks textures to ORM+KTX2, and emits a report. Test it on any one free GLB so I know it works before I start paying for generations.

## 9. WORKING AGREEMENT

- `git init` and commit per meaningful unit. Conventional commits. Tag the end of each level `L0`, `L1`, and so on.
- Run the app yourself and verify it in the browser. Never ask me to check whether it works — screenshot it and show me.
- If a technique you try looks bad, say so plainly and propose the alternative. I would rather hear "screen-space reflections break up on the cobbles at grazing angles, here is the planar-puddle approach instead" than get a quiet compromise.
- Keep a running `docs/DECISIONS.md` of anything you chose that a future level might want to revisit.

## 10. DEFINITION OF DONE FOR L0

Report back with, in this order:

1. **Four screenshots** of the Pilies St corner: clear moonlit, light rain, heavy rain, and a low-angle ground shot showing cobble parallax and puddle reflection.
2. **The measured numbers** against every row of the §5 budget table, on my machine's tier.
3. **A one-paragraph honest assessment** of how close the look is to the north star, and the single biggest visual weakness remaining.
4. **Your recommendation for what L1 should attack first**, given what you learned building L0.
5. `npm run dev` working, `npm run assets` working, and `ART_BIBLE.md` and `DECISIONS.md` started.

Start by restating your plan for L0 as a task list, then build it. Go.
