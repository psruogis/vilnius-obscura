# SHADOWS OF VILNIUS — Master Handoff Document

**An Assassin's Creed–inspired third-person stealth-parkour game, built in three.js for the browser, art-directed to read as console-quality, set in Vilnius Old Town.**

Version 1.0 · created 2026-09-26 · single-file portable handoff

---

## HOW TO USE THIS DOCUMENT

This file is self-contained. Upload or paste it into any Claude session, on any account, and the project can start or resume with no other context.

**To start the project from zero:**
1. Create an empty folder for the project and open a Claude Code session in it.
2. Give the session this whole file, and say: *"Read this, then execute §8 (the Level 0 prompt). Everything else in the document is your reference material."*

**To resume mid-project:** give the session this file plus the repo, and say which level tag (`L0`…`L12`) the repo is currently at. The session reads §5 for what's next.

**To just get the kickoff prompt:** copy the block between the `=== BEGIN LEVEL 0 PROMPT ===` and `=== END LEVEL 0 PROMPT ===` markers in §8. That block stands alone and needs nothing else.

**Paths in this document** are written as `<project-root>`. The original project lived at `C:\Users\IDOMUSPC\CCode\shadows-of-vilnius` on Windows 11 with Node 24 / npm 11 / git 2.53. Adjust freely.

---

## TABLE OF CONTENTS

1. [The north star](#1-the-north-star)
2. [The method — why this is a prompt ladder](#2-the-method--why-this-is-a-prompt-ladder)
3. [Who the human is, and how to work with them](#3-who-the-human-is-and-how-to-work-with-them)
4. [Locked technical decisions](#4-locked-technical-decisions)
5. [The 13-level ladder](#5-the-13-level-ladder)
6. [Performance budget](#6-performance-budget)
7. [Art Bible v0 — the seed](#7-art-bible-v0--the-seed)
8. [**THE LEVEL 0 PROMPT**](#8-the-level-0-prompt)
9. [Vilnius reference — the city that matters](#9-vilnius-reference--the-city-that-matters)
10. [Asset sourcing & pipeline](#10-asset-sourcing--pipeline)
11. [Gameplay design brief (L8–L11)](#11-gameplay-design-brief-l8l11)
12. [Known risks and their mitigations](#12-known-risks-and-their-mitigations)

---

## 1. THE NORTH STAR

One sentence: *a hooded figure crosses the wet slate rooftops of Vilnius Old Town at 2 a.m. in October rain, moonlight breaking through torn cloud, lantern light pooling in the cobbles below, and it looks like a captured frame from a AAA console game.*

The reference bar:

| Reference | What we take from it |
|---|---|
| **Assassin's Creed Unity** | Architectural density, façade detail, parkour fluidity |
| **AC Syndicate** | Night-city lighting, lantern pools, window warmth |
| **Ghost of Tsushima** | Wind, weather as a character, colour grading confidence |
| **The Last of Us Part II** | Wet material response, character shading, silhouette |

We will not match their polygon counts. We *will* match their **lighting discipline, material response, and post-processing taste** — which is where most of the perceived quality actually lives.

### The five things that make or break this project, in order

1. **Lighting** — baked GI + one disciplined moonlight + fake-but-convincing lantern pools
2. **Post-processing stack and colour grading**
3. **Material response, especially wetness**
4. **Silhouette and animation of the player**
5. **Density of environmental detail** — props, decals, birds, steam, laundry lines, puddles

Raw triangle count is nowhere on that list. **Never trade framerate for triangles.**

### The single highest-leverage idea in the whole project

One global `wetness` uniform, injected into every material via `onBeforeCompile`, driven against per-material porosity masks. As wetness rises: albedo darkens and saturates, roughness drops toward a smooth floor, F0 rises toward ~0.05, and a puddle mask floods the cavity-map lows. Rain then becomes a single `weather.rainIntensity` 0→1 call that drives rain particles, wetness, ripples, sky coverage and audio together.

That one uniform is what will make the entire game look expensive. Treat it as a headline feature, not a detail.

---

## 2. THE METHOD — WHY THIS IS A PROMPT LADDER

A single "build me an AAA-looking game" prompt fails. "Make the wetness system excellent, given this working renderer" succeeds. So the project is **thirteen levels**, each a single paste-ready prompt for a fresh session, each assuming the previous level shipped, is committed, and is tagged.

**Two rules:**

- **Never skip a level, and never start one until the previous level's Definition of Done is actually met.** The compounding is the point — L3's rain looks expensive only because L0's wetness uniform and L2's porosity masks exist.
- **Each level's session writes the next level's prompt**, based on what it actually learned building its own. Every level's Definition of Done ends with a recommendation for what the next level should attack first. The ladder sharpens as the project gets real, instead of being a guess written on day one.

**Two documents carry coherence across session boundaries**, and every level appends to both:

- `docs/ART_BIBLE.md` — palette in HDR linear values, lighting rules, material conventions, the wetness curve, LUT rationale, and every faked technique with a note on why the fake is invisible.
- `docs/DECISIONS.md` — anything chosen that a future level might want to revisit, with the reasoning.

---

## 3. WHO THE HUMAN IS, AND HOW TO WORK WITH THEM

The human on this project is a **product designer, not an engineer**. This shapes everything:

- **Make the engineering calls yourself.** Do not ask them to choose libraries, folder names, or math. Bring opinionated defaults.
- **Ask them only about art direction and feel** — mood, palette, pacing, silhouette — and only when the answer would genuinely change what gets built.
- **Every visual parameter must end up as a labelled slider in the debug panel.** They art-direct through that panel, not through code. A parameter that only exists in source is a parameter they cannot use.
- **Presets are project assets, not debug junk.** Save/load to committed JSON, so a look can be captured, compared and returned to.
- **Never ask them to check whether something works.** Run it, screenshot it, show them.
- **Say plainly when a technique looks bad.** They would rather hear "screen-space reflections break up on the cobbles at grazing angles, here is the planar-puddle approach instead" than receive a quiet compromise.
- **Their design hours are the scarce resource.** Protect them: do the grinding yourself, and bring decisions pre-chewed down to a visual choice.

---

## 4. LOCKED TECHNICAL DECISIONS

Do not relitigate these without cause. If a level finds a genuine reason to change one, record it in `docs/DECISIONS.md` with the reasoning.

| Area | Decision |
|---|---|
| Language / build | TypeScript strict, Vite 7, ESM only |
| Engine | three.js latest (r18x), `WebGLRenderer` for v1. All renderer setup behind `src/core/Renderer.ts` so a WebGPU swap is a one-file change later. |
| Post-processing | `postprocessing` (pmndrs) — its effect quality is the whole point. Plus `n8ao` for ambient occlusion. |
| Colour | Linear-sRGB working space, `ACESFilmicToneMapping`, `renderer.outputColorSpace = SRGBColorSpace`, exposure as a graded knob. Never author a colour by eye in sRGB hex and assume it is right. |
| Units | 1 unit = 1 metre. Y-up. Character faces −Z. Real-world scale everywhere, always. |
| Shadows | Cascaded shadow maps (3 cascades) for moonlight. VSM or PCSS soft filter. Only the moon and at most 4 nearby dynamic lights cast shadows, ever. |
| **Lighting model** | **Baked lightmaps + light probes for the city; realtime only for the player and hero lights. No realtime GI.** This is the single most important decision in the project — browser realtime GI at city scale is not happening, and faking it badly is why most three.js projects look like three.js projects. |
| Textures | KTX2 (UASTC for normals/ORM, ETC1S for albedo), 2K tiling sets, **ORM-packed** (AO=R, Roughness=G, Metal=B). Never ship a PNG. |
| Meshes | glTF 2.0 + Meshopt compression. Instance everything repeatable. |
| Asset processing | `gltf-transform` CLI in an `npm run assets` pipeline. Source art in `art/` (gitignored), processed output in `public/assets/` (committed). |
| Debug panel | Tweakpane, with preset save/load to JSON in `src/art/presets/`. |
| State | Plain classes and a small typed event bus. No Redux, no ECS library, no React in the game loop. |
| Physics | Rapier (WASM) for character controller, ragdolls, prop collisions. **Kinematic** character controller, not dynamic. |
| Animation | glTF clips + three's `AnimationMixer`, driven by a hand-rolled state machine in `src/player/LocomotionSM.ts`. |
| Audio | Howler for 2D/UI, three's `PositionalAudio` for world. Deferred to L12. |
| Target | 60fps at 1440p on an RTX 3060 laptop / M2 Pro. 1080p/60 on integrated graphics with the quality preset dropped. |

### The lantern trick — document it early, use it everywhere

Lantern and window light is **baked into the lightmaps**, plus an emissive mesh, plus a single billboarded volumetric cone per lantern. At most **4 real `PointLight`s**, pooled and reassigned to the nearest lanterns each frame. Forty lanterns for the cost of four. This pattern generalises to every light source in the city.

---

## 5. THE 13-LEVEL LADDER

| Level | Title | What it attacks |
|---|---|---|
| **L0** | **Foundation & the look-dev room** | Stack, render core, post stack, night sky v1, moonlight, the wetness system, rain v1, one calibrated Pilies St corner, third-person controller, the Art Director panel. **Full prompt in §8.** |
| L1 | Night sky & moonlight mastery | Real-ephemeris moon for Vilnius' latitude, volumetric clouds with moon shafts, light-pollution dome, CSM seam elimination, PCSS contact shadows, night IBL, aurora (plausible at 54°N) |
| L2 | Material & texture authority | Full Vilnius material library, ORM/KTX2 pipeline hardened, POM tuning, triplanar blends, decal system (grime, moss, posters, soot), detail normals, cavity-driven weathering |
| L3 | Rain, storm & wetness mastery | Rain v2, puddle accumulation over time, surface flow, gutter streams, roof drips, lens droplets, lightning with one-frame light bursts, thunder timing, wet cloth and wet skin on the player |
| L4 | The Vilnia & the Neris | Gerstner + FFT water, screen-space reflection and depth refraction, foam from depth difference, flow maps under the Bernardine bridge, shore wetting, moon glint, rain interaction |
| L5 | Old Town blockout from real data | OSM footprints + LiDAR heights → procedural façades, the real street network, district chunks, streaming, occlusion culling, LOD system, lightmap bake pipeline at city scale |
| L6 | Hero landmarks | Gediminas' Tower, Cathedral + Bell Tower, St. Anne's, Bernardine complex, Gates of Dawn, Town Hall Square, University courtyards, Užupis, Three Crosses Hill — hand-sculpted, each a synchronisation viewpoint |
| L7 | The hero | Meshy/Tripo character through the pipeline, retopo, rig, Mixamo + custom animation set, hood and cape secondary motion, cloth, wet shading, silhouette pass |
| L8 | Traversal & parkour | Ledge detection, climb/vault/shimmy/swing, roof-running network, leap of faith, foot IK, camera choreography, the "never breaks flow" tuning pass |
| L9 | Combat & assassination | Hidden blade, counter-parry system, weapon set from Meshy, hit reactions, ragdolls, air assassination, haystacks, kill cams |
| L10 | A city that is alive | Guard FSM + navmesh, light-and-line-of-sight detection, noise propagation, social blend, crowds with schedules, market stalls, cats, pigeons, laundry, chimney smoke, tavern light and sound |
| L11 | The boss | Tripo3D boss model, Cathedral Square in full storm as the arena, three phases, custom mechanics, cinematic framing |
| L12 | Cinematic polish & ship | Final LUT grade, DOF, motion blur, photo mode, full audio pass, HUD and menus, eagle vision, optimisation pass, build and deploy |

### Running a level

1. Open a fresh session in the project root.
2. Paste that level's prompt file. Nothing else — each file carries its own context.
3. Review against that level's Definition of Done.
4. Have the session write the *next* level's prompt file based on what it learned.
5. Commit, and tag `L0` / `L1` / …

---

## 6. PERFORMANCE BUDGET

Treat these as failing tests. Print them live in the debug HUD and colour them red when breached.

| Metric | Budget |
|---|---|
| Frame time (ultra, 1440p, RTX 3060) | ≤ 16.6 ms |
| Draw calls | ≤ 900 |
| Visible triangles | ≤ 2.5 M |
| Texture VRAM | ≤ 400 MB |
| JS heap after 10 min | stable, no growth |
| Initial load to playable | ≤ 8 s on 50 Mbit |
| Per-frame allocations in the hot loop | zero, enforced |

**Quality tiers** `low | medium | high | ultra` scale render resolution, shadow map size, cascade count, AO samples, particle counts and post effects. Auto-detect on first boot by benchmarking the first 90 frames; always allow manual override in the panel. **Dynamic resolution scaling** holds 60fps by scaling render scale 0.6–1.0 *before* it ever drops effects.

---

## 7. ART BIBLE v0 — THE SEED

The receiving session should expand this into `docs/ART_BIBLE.md` and maintain it from L0 onward.

### The palette

Authored as intent, not as hex to be pasted into sRGB fields. Convert to linear and tune in the panel.

| Role | Start value | Intent |
|---|---|---|
| Moonlight | `#8FA8C8` @ ~0.6 | Cool but **not** cartoon-blue. Let the LUT do the heavy colour lifting. |
| Ambient / night IBL | Deep desaturated blue-grey, intensity linked to moon elevation | Never black shadows — the sky is a light source |
| Lantern / window warmth | `#FFB877` → `#FF9D4D` | Sodium and candle, warm enough to fight the moon |
| Light pollution glow | Warm amber, tinted toward the city centre | The horizon is never neutral in a real city at night |
| Wet cobble specular | Near-white, tight | The moon's reflection in a puddle is the money shot |
| Copper patina | That specific Vilnius oxidised green | Domes and spires only — it must read as rare |

**Grading intent:** cool shadows, warm highlights, crushed-but-not-black blacks, a slight teal push in the midtones. The LUT is doing real work — do not try to achieve the grade with light colours.

### Lighting rules

1. One directional light is the moon, and the **moon disc in the sky is its parent**. Moving the moon in the panel moves the shadows. Non-negotiable — it is what keeps the sky and the lighting honest to each other.
2. City light is baked. Player light is realtime. Nothing else gets a shadow-casting light without justification.
3. No black shadows, ever. The night sky is a hemispherical light source.
4. Every light pool on the ground should have a reason — a lantern, a window, a brazier, the moon through a gap.
5. Contrast comes from *placement*, not intensity. A dark street next to a lit doorway reads as expensive; a uniformly lit street reads as a tech demo.

### The wetness curve

| Wetness | Albedo | Roughness | F0 | Puddle mask |
|---|---|---|---|---|
| 0.0 | unchanged | material default | 0.04 | none |
| 0.3 | darken ~15%, saturate slightly | drop toward 0.45 | 0.045 | damp in cavity lows only |
| 0.7 | darken ~30% | drop toward 0.2 | 0.05 | standing water in lows |
| 1.0 | darken ~40%, max saturation | floor at ~0.08 | 0.05 | flooded lows, sheet flow on slopes |

Per-material **porosity masks** modulate the whole curve: plaster soaks and darkens a lot, glazed tile barely changes, metal goes straight to mirror.

### Post stack — order matters

```
N8AO
→ SSR (ground only, mask-driven)
→ Bloom (threshold-selective, 6 mips)
→ DOF (cinematic camera only)
→ Motion blur (velocity buffer, subtle)
→ Chromatic aberration (0.0008, edges only)
→ LUT grade
→ ACES tonemap
→ Film grain (animated, 0.015)
→ Vignette (0.25)
→ SMAA
```

Every effect gets an on/off toggle and its key params exposed. Ship three committed presets: `cinematic-rain.json`, `clear-moonlit.json`, `performance.json`.

---

## 8. THE LEVEL 0 PROMPT

Everything between the markers below is a standalone prompt. Paste it as the first message of a fresh session in an empty project folder.

```
=== BEGIN LEVEL 0 PROMPT ===

# LEVEL 0 — FOUNDATION & THE LOOK-DEV ROOM

Project: SHADOWS OF VILNIUS — an Assassin's Creed–inspired third-person stealth-parkour
game running in the browser on three.js, art-directed to read as console-quality.

This is Level 0 of a 13-level prompt ladder. Do not skip ahead — L0 builds the machine
every later level tunes.

## 1. YOUR ROLE

You are the technical director and lead graphics engineer on this project. I am a product
designer, not an engineer — so:

- Make the engineering calls yourself. Do not ask me to choose libraries, folder names, or math.
- Ask me only about art direction and feel (mood, palette, pacing, silhouette), and only when
  the answer would genuinely change what you build.
- Every visual parameter you invent must end up as a labelled slider in the debug panel,
  because I art-direct through that panel, not through code.
- Write code a competent engineer would recognise as idiomatic three.js. No
  frameworks-on-frameworks.

## 2. THE NORTH STAR

One sentence: a hooded figure crosses the wet slate rooftops of Vilnius Old Town at 2 a.m. in
October rain, moonlight breaking through torn cloud, lantern light pooling in the cobbles
below, and it looks like a captured frame from a AAA console game.

The reference bar is: Assassin's Creed Unity (architectural density, parkour fluidity),
AC Syndicate (night-city lighting), Ghost of Tsushima (wind, weather, colour grading),
The Last of Us Part II (wet material response, character shading). We will not match their
polygon counts. We will match their lighting discipline, material response, and
post-processing taste — which is where most of the perceived quality actually lives.

The five things that will make or break this project, in order:

1. Lighting (baked GI + one disciplined moonlight + fake-but-convincing lantern pools)
2. Post-processing stack and colour grading
3. Material response, especially wetness
4. Silhouette and animation of the player
5. Density of environmental detail (props, decals, birds, steam, laundry lines, puddles)

Raw triangle count is nowhere on that list. Never trade framerate for triangles.

## 3. LOCKED TECHNICAL DECISIONS — do not relitigate these

- Language / build: TypeScript strict, Vite 7, ESM only.
- Engine: three.js latest (r18x), WebGLRenderer for v1. Keep all renderer setup behind
  src/core/Renderer.ts so a WebGPU swap is a one-file change later.
- Post-processing: `postprocessing` (pmndrs) — its effect quality is the whole point.
  Plus `n8ao` for ambient occlusion.
- Colour: Linear-sRGB working space, ACESFilmicToneMapping, outputColorSpace = SRGBColorSpace,
  exposure as a graded knob. Never author a colour by eye in sRGB hex and assume it is right.
- Units: 1 unit = 1 metre. Y-up. Character faces -Z. Real-world scale everywhere, always.
- Shadows: cascaded shadow maps (3 cascades) for moonlight. VSM or PCSS soft filter. Only the
  moon and at most 4 nearby dynamic lights cast shadows, ever.
- Lighting model: baked lightmaps + light probes for the city; realtime for the player and
  hero lights. No realtime GI. This is the single most important decision in the project.
- Textures: KTX2 (UASTC for normals/ORM, ETC1S for albedo), 2K tiling sets, ORM-packed
  (AO=R, Roughness=G, Metal=B). Never ship a PNG.
- Meshes: glTF 2.0 + Meshopt compression. Instance everything repeatable.
- Asset processing: gltf-transform CLI in an `npm run assets` pipeline. Source art in art/
  (gitignored), processed output in public/assets/ (committed).
- Debug panel: Tweakpane, with preset save/load to JSON in src/art/presets/. Presets are
  project assets, not debug junk.
- State: plain classes and a small typed event bus. No Redux, no ECS library, no React in the
  game loop.
- Physics: Rapier (WASM) for the character controller, ragdolls, prop collisions. Kinematic
  character controller, not dynamic.
- Animation: glTF clips + three's AnimationMixer, driven by a hand-rolled state machine in
  src/player/LocomotionSM.ts.
- Audio: Howler for 2D/UI, three's PositionalAudio for world. Deferred to L12.
- Target: 60fps at 1440p on an RTX 3060 laptop / M2 Pro. 1080p/60 on integrated graphics with
  the quality preset dropped.

## 4. WHAT LEVEL 0 MUST DELIVER

L0 is not a game. L0 is the look-dev room: a single, beautifully-lit Vilnius street corner
that proves every pipeline the rest of the project depends on, plus the console I use to
art-direct it. Build these, in this order.

### 4.1 Project skeleton

    art/                      # gitignored: raw Meshy/Tripo/Blender/texture sources
    public/assets/
      env/                    # HDRIs, sky LUTs
      tex/                    # processed KTX2 texture sets
      models/                 # processed .glb
      lut/                    # colour grading .cube converted to 3D texture
    src/
      core/                   # Renderer, Loop, Time, ResourceManager, Stats
      render/                 # PostStack, ShadowRig, ToneMap, QualityTiers
      world/                  # Scene assembly, streaming stubs, Sky, Weather
      mat/                    # material factories + shader chunks (wetness, POM, detail-normal)
      player/                 # CharacterController, CameraRig, LocomotionSM, Input
      art/                    # ArtDirector (tweakpane), presets/*.json
      util/
      main.ts
    prompts/                  # the ladder
    docs/ART_BIBLE.md         # you write and maintain this
    tools/                    # asset pipeline scripts

### 4.2 Render core

- Fixed-timestep simulation (60Hz) with decoupled render and interpolation. Frame-rate
  independence is not optional.
- Quality tiers low | medium | high | ultra that scale render resolution, shadow map size,
  cascade count, AO samples, particle counts, and post effects. Auto-detect on first boot by
  benchmarking the first 90 frames; let me override in the panel.
- Dynamic resolution scaling that holds 60fps by scaling render scale 0.6-1.0 before it ever
  drops effects.

### 4.3 The post-processing stack (get the order right)

N8AO -> SSR (ground only, mask-driven) -> Bloom (threshold-selective, 6 mips) -> DOF
(cinematic cam only) -> Motion blur (velocity buffer, subtle) -> Chromatic aberration (0.0008,
edges only) -> LUT grade -> ACES tonemap -> Film grain (animated, 0.015) -> Vignette (0.25)
-> SMAA

Every effect gets an on/off toggle and its key params exposed. Ship with a Cinematic preset
and a Performance preset committed as JSON.

### 4.4 The night sky — first pass

- Procedural night sky shader: horizon gradient authored in HDR values (not sRGB),
  light-pollution glow warm-tinted toward the city centre.
- Real star field: roughly 2,000 stars from an actual catalogue at correct positions for
  Vilnius (54.687 N, 25.283 E), apparent magnitude driving size and brightness, subtle
  scintillation.
- Moon: a real disc with an albedo texture, a driveable phase, a soft halo, and — critically —
  it is the parent of the directional light. Moving the moon in the panel moves the shadows.
- Two scrolling cloud layers, raymarched at quarter-res, with the moon able to break through gaps.
- Expose: time-of-night, moon azimuth/elevation/phase, cloud coverage/speed/density, star
  intensity, light-pollution colour and strength.

### 4.5 Moonlight and the lighting bible

- One DirectionalLight as the moon. Cool but not cartoon-blue: start at #8FA8C8, around 0.6
  intensity, and let the LUT do the heavy colour lifting.
- CSM with tuned cascade splits for a 300m view distance. No visible cascade seams. No
  peter-panning.
- Lantern and window light: baked into the lightmaps, plus emissive meshes, plus a single
  billboarded volumetric cone per lantern. At most 4 real PointLights, pooled and reassigned to
  the nearest lanterns each frame. Document this trick in ART_BIBLE.md — it is how we get 40
  lights for the cost of 4.
- A night IBL environment map for ambient specular, intensity-linked to moon elevation.

### 4.6 Materials and the wetness system

Author these as reusable factories in src/mat/:

- Cobblestone with parallax-occlusion mapping (8-24 adaptive steps) — the ground must have real
  depth when the camera is low, and puddles must sit IN the depressions, not on top of them.
- Lime plaster (Vilnius baroque render) with edge-wear masks revealing brick beneath.
- Red brick (St. Anne's gothic) with deep mortar normals.
- Weathered timber, oxidised copper roofing (that specific Vilnius green patina), slate and tin
  roofing.
- A shared `wetness` chunk injected into every material via onBeforeCompile, driven by one
  global uniform plus a per-material porosity mask: as wetness rises, albedo darkens and
  saturates, roughness drops toward a smooth floor, F0 rises to around 0.05, and a puddle mask
  floods cavity-map lows. This one uniform is what will make the whole game look expensive.
  Make it excellent.

### 4.7 Rain — first pass

- GPU-instanced rain streaks spawning in a camera-relative volume, wind-sheared, length scaled
  by velocity, brightening when they cross the moon vector.
- Ripple rings on wet surfaces via an animated normal flipbook, density linked to rain intensity.
- Screen-space lens droplets that accumulate and streak, aware of camera motion.
- Splash sprites where rain meets ground, and roof-edge drip emitters.
- weather.rainIntensity 0->1 drives rain, wetness, ripples, sky coverage, and (later) audio in
  one call.

### 4.8 The look-dev street corner

Hand-build one real corner: the junction of Pilies Street and Sv. Mykolo Street — three
grey-boxed-but-properly-materialed 3-4 storey baroque facades, an arched gateway, cobbled
street with camber and a real puddle in the low point, three wall lanterns, a first-floor
window with warm interior light, a wrought-iron balcony, drainpipes, and a cat. 1:1 scale,
roughly 40m of street.

This corner is the calibration reference for the entire city. It gets a baked lightmap from
Blender Cycles so I can see exactly what the baked pipeline buys us.

### 4.9 Player and camera

- Rapier kinematic capsule: walk 1.6 m/s, jog 3.6, sprint 6.2, with proper acceleration curves.
- A placeholder GLB (Mixamo Y-Bot is fine for L0) with idle/walk/jog/sprint/turn clips blended
  by LocomotionSM. Foot-lock IK is not required at L0, but leave the hook.
- Third-person spring-arm camera: right-shoulder offset, collision-aware arm that shortens
  against geometry, FOV 50 idle rising to 68 at sprint, positional lag and rotational damping
  tuned so it feels weighty rather than floaty. Mouse+keyboard and gamepad both work.
- A separate free-fly cinematic camera on a hotkey — I need it to compose screenshots.

### 4.10 The Art Director panel

Tweakpane, collapsible, toggled with `~`. Every knob above, grouped:
Camera / Sky & Moon / Lighting / Weather / Materials / Post / Quality / Debug.

Plus: FPS graph, frame-time breakdown, draw calls, triangles, texture memory, and
"Copy preset to clipboard" and "Save preset" buttons. Ship three committed presets:
cinematic-rain.json, clear-moonlit.json, performance.json.

## 5. PERFORMANCE BUDGET — treat these as failing tests

- Frame time (ultra, 1440p, RTX 3060): <= 16.6 ms
- Draw calls: <= 900
- Visible triangles: <= 2.5 M
- Texture VRAM: <= 400 MB
- JS heap after 10 min: stable, no growth
- Initial load to playable: <= 8 s on 50 Mbit
- Per-frame allocations in the hot loop: zero, enforced

Print these live in the debug HUD and colour them red when breached.

## 6. ART BIBLE — you write it as you go

Create and maintain docs/ART_BIBLE.md from L0 onward. It holds the palette (in HDR linear
values), the lighting rules, the material conventions, the wetness curve, the LUT rationale,
and every faked technique with a note on why the fake is invisible. Every later level appends
to it. This document is how the project stays coherent across 13 levels.

## 7. OUT OF SCOPE FOR L0 — do not build these yet

Parkour, climbing, combat, hidden blade, guards, AI, navmesh, crowds, the full city, hero
landmarks, water, the boss, quests, UI/HUD beyond debug, audio, save system, menus.

If you find yourself writing any of it, stop and finish L0 properly instead. Later levels are
far easier if L0 is genuinely solid.

## 8. ASSET SOURCING FOR LATER LEVELS — build the pipeline for it now

Characters, weapons, and the boss will come from Meshy and Tripo3D as GLB exports. So the
`npm run assets` pipeline must already handle the specific mess those tools produce: unwelded
vertices, 4K PNG texture sets, triangle counts over 100k, no LODs, arbitrary scale and
orientation, and no rig.

Write the pipeline in L0 with a --from-genai flag that normalises scale and orientation, welds,
decimates to LOD0/1/2, repacks textures to ORM+KTX2, and emits a report. Test it on any one
free GLB so I know it works before I start paying for generations.

## 9. WORKING AGREEMENT

- git init and commit per meaningful unit. Conventional commits. Tag the end of each level L0,
  L1, and so on.
- Run the app yourself and verify it in the browser. Never ask me to check whether it works —
  screenshot it and show me.
- If a technique you try looks bad, say so plainly and propose the alternative. I would rather
  hear "screen-space reflections break up on the cobbles at grazing angles, here is the
  planar-puddle approach instead" than get a quiet compromise.
- Keep a running docs/DECISIONS.md of anything you chose that a future level might want to
  revisit.

## 10. DEFINITION OF DONE FOR L0

Report back with, in this order:

1. Four screenshots of the Pilies St corner: clear moonlit, light rain, heavy rain, and a
   low-angle ground shot showing cobble parallax and puddle reflection.
2. The measured numbers against every row of the section 5 budget table, on my machine's tier.
3. A one-paragraph honest assessment of how close the look is to the north star, and the single
   biggest visual weakness remaining.
4. Your recommendation for what L1 should attack first, given what you learned building L0.
5. `npm run dev` working, `npm run assets` working, and ART_BIBLE.md and DECISIONS.md started.

Start by restating your plan for L0 as a task list, then build it. Go.

=== END LEVEL 0 PROMPT ===
```

---

## 9. VILNIUS REFERENCE — THE CITY THAT MATTERS

Verify details against photos and OSM before modelling. This section is orientation, not gospel.

### The playable footprint

Roughly **600 × 500 m**: Cathedral Square in the north → Pilies Street → Didžioji Street → Town Hall Square → Aušros Vartų Street → the Gates of Dawn in the south. **Gediminas' Hill** to the north-east, the **Vilnia river and Užupis** to the east, the **Neris** bounding the north. That footprint contains every landmark worth climbing and is small enough to build at real density.

Coordinates for sky and ephemeris: **54.687° N, 25.283° E**.

### The two rivers

- **Neris** — the large river along the northern edge, beyond the Cathedral and the Palace.
- **Vilnia (Vilnelė)** — the small, fast, shallow river that loops through Užupis and joins the Neris near Gediminas' Hill. This is the L4 hero water: narrow, stony bed, visible flow, crossed by the Bernardine and Užupis bridges. Much more interesting to render than the Neris, and much more useful for gameplay.

### Hero landmarks — the L6 list

| Landmark | Notes for modelling |
|---|---|
| **Gediminas' Tower** | Red brick tower of the Upper Castle, on a ~48m hill. The dominant silhouette. Funicular on the flank. Highest natural viewpoint in the core. |
| **Vilnius Cathedral** | Neoclassical, white, six-column Doric portico, three roofline statues. The domed Chapel of St Casimir on the south side. Faces a large open square — the L11 boss arena. |
| **Cathedral Bell Tower** | Freestanding, ~57m, round lower stage (originally a Lower Castle defensive tower), clock face. Great isolated climb. |
| **Palace of the Grand Dukes** | Reconstructed Renaissance palace behind the Cathedral, large courtyards. |
| **St. Anne's Church** | Late/flamboyant Gothic, red brick, extraordinarily ornate façade built from dozens of custom brick profiles. Small footprint, huge visual payoff. The single best argument for a hand-sculpted hero asset. |
| **Bernardine Church & Monastery** | Gothic brick, immediately beside St. Anne's, much larger, heavy buttresses. The two together are the signature pairing. |
| **St. Johns' Church & Bell Tower** | Inside the Vilnius University courtyards. The bell tower at ~68m is the tallest structure in the Old Town — the natural "final viewpoint". |
| **Vilnius University courtyards** | Great Courtyard with arcades, Observatory Courtyard, Sarbievijus Courtyard. Arcades, multiple roof levels, connected rooftops — the best parkour playground in the city. |
| **Gates of Dawn (Aušros Vartai)** | The only surviving gate of the city wall, with the Madonna chapel above the arch. Anchors the south end of the main street spine. |
| **Town Hall & Town Hall Square** | Neoclassical town hall with a Doric portico, open square. Natural market and crowd space for L10. |
| **St. Casimir's Church** | The earliest Baroque church in Vilnius, Jesuit, large dome topped with a crown. Distinctive silhouette on the skyline. |
| **Užupis** | Self-declared "Republic of Užupis" across the Vilnia. Hillier, scrappier, more varied architecture, the Angel of Užupis on its column. A deliberate tonal contrast to the grand baroque core. |
| **Three Crosses Hill** | White crosses on the wooded hill east of Gediminas' Hill. A silhouette landmark and a viewpoint looking back over everything. |
| **Bastion of the Defensive Wall (Barbakanas)** | Round artillery bastion on Bokšto Street with a tunnel. Good for an underground or escape route. |
| **Pilies Street** | The cobbled main artery running south from Cathedral Square, becoming Didžioji then Aušros Vartų. Narrow, curved, dense with façades. |
| **Literatų Street** | Small side street covered in metal artist plaques. A detail-density showcase. |

### Material vocabulary of the city

- **Roofs:** red clay tile, sheet metal and tin (red-brown, grey-green), some slate. Copper patina on domes and spires only — it must read as rare.
- **Walls:** lime plaster in ochre, pale yellow, terracotta, white, pale green — plus exposed red brick on the Gothic churches. Edge-wear revealing brick under plaster is the signature weathering.
- **Ground:** cobblestone almost everywhere, with real camber and drainage low points. Granite setts on the main streets, rougher fieldstone in Užupis.
- **Details:** wrought-iron balconies and signs, arched carriage gateways into interior courtyards, drainpipes, wooden shutters, deep window reveals.

The **arched gateway into a hidden courtyard** is the most Vilnius architectural motif there is. Use it constantly — it also solves streaming and occlusion beautifully.

---

## 10. ASSET SOURCING & PIPELINE

| Source | Use |
|---|---|
| **Meshy** | Character, weapons, hero props. GLB export. |
| **Tripo3D** | The boss, larger sculpted assets. GLB export. |
| **Blender** | Retopo, rigging, and **all lightmap bakes**. Non-negotiable for the baked-GI pipeline. |
| **Mixamo** | Base locomotion and combat animation, then hand-tuned. |
| **Polyhaven / ambientCG** | CC0 base PBR texture sets to build the Vilnius material library on top of. |
| **OSM + Lithuanian Geoportal** | Real building footprints and LiDAR elevation for L5. |
| **Higgsfield** | Can generate 3D/GLB, textures, music and SFX — a useful second source alongside Meshy/Tripo. Needs authorising in an interactive session before its tools are available. |

### The `--from-genai` pipeline flag

Meshy and Tripo output has a predictable set of problems. Build the normaliser in L0, before paying for generations:

1. Normalise scale to metres and orientation to Y-up / −Z forward
2. Weld vertices, recompute normals, fix winding
3. Decimate to LOD0 / LOD1 / LOD2
4. Repack textures to ORM + KTX2, resize to budget
5. Meshopt compress
6. Emit a report: before/after triangles, texture memory, draw calls

Test it on any one free GLB so it is proven before real assets arrive.

---

## 11. GAMEPLAY DESIGN BRIEF (L8–L11)

The AC pillars, scoped to what a browser game can actually deliver well.

**Traversal (L8) — the most important system.** Free-running that never breaks flow: ledge detection with generous forgiveness, vault / climb / shimmy / swing, a hand-authored **roof-running network** across the Old Town, leap of faith into hay, foot IK. Camera choreography matters as much as the movement — the camera pulling back and widening FOV during a sprint across rooftops *is* the feeling.

**Stealth (L10).** Detection driven by **light level and line of sight**, with noise propagation. Guards on patrol routes with an FSM: patrol → suspicious → searching → alerted → combat, with proper decay back down. Social blend in crowds. Rain reduces both guard sight range and footstep noise — weather as a mechanic, not just a look. Hiding spots: haystacks, carriage gateways, rooftop shadows, the bastion tunnel.

**Combat (L9).** Counter-and-parry rhythm rather than combo depth: light attack, heavy, parry with a real window, counter-kill. Hidden blade for assassinations from behind, above, and out of hay. Ragdolls on death. Kill cams that use the cinematic camera rig from L0.

**Viewpoints (L6/L8).** Synchronise from the top of the Cathedral Bell Tower, St. Johns' Bell Tower, Gediminas' Tower, Three Crosses Hill, St. Casimir's dome. Each reveals a district. The climb *to* each one is hand-authored — this is the AC ritual and it must feel earned.

**The boss (L11).** Cathedral Square in full storm, three phases, the Tripo3D boss model. Phase transitions move the fight through the square's geography — the portico, the bell tower base, the open ground with standing water. Lightning as a mechanic and as a lighting event.

---

## 12. KNOWN RISKS AND THEIR MITIGATIONS

| Risk | Mitigation |
|---|---|
| **The look never gets past "nice three.js demo."** | This is what L0 exists to de-risk. If the Pilies St corner does not look genuinely good at the end of L0, stop and fix L0 rather than proceeding. One corner that looks expensive proves the whole thing; a whole city that looks cheap proves nothing. |
| **Lightmap baking at city scale becomes a bottleneck.** | L5 must build the bake pipeline as automation, not as manual Blender work. Per-chunk bakes, deterministic UV packing, committed atlases, a single command. |
| **Scope collapse around L5–L7.** | The city, the hero, and the parkour are each large. Cut ruthlessly: a smaller Old Town at full density beats a larger one at half. The 600×500m footprint is already the cut. |
| **Meshy/Tripo assets do not match the art direction.** | Generate against the Art Bible palette and material vocabulary, and always run a wetness pass on incoming characters. Budget for regeneration; the first output is rarely the one you ship. |
| **Performance dies quietly across levels.** | The budget table is in every level's Definition of Done, measured, not estimated. A level that breaches budget is not done. |
| **Coherence lost across 13 sessions.** | `ART_BIBLE.md` and `DECISIONS.md`, appended every level. Any session that does not read them first will drift. |

---

*End of master handoff document. The Level 0 prompt in §8 is the only thing needed to begin.*
