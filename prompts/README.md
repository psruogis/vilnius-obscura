# SHADOWS OF VILNIUS — the prompt ladder

Thirteen levels. Each one is a single paste-ready prompt for a fresh Claude Code session. Each assumes the previous level shipped and is committed and tagged. The ladder exists because "build me an AAA-looking game" fails as one prompt, but "make the wetness system excellent, given this working renderer" succeeds.

**Rule: never skip a level, and never start a level until the previous one's Definition of Done is actually met.** The compounding is the whole point — L3's rain looks expensive only because L0's wetness uniform and L2's porosity masks exist.

| Level | Title | What it attacks | Status |
|---|---|---|---|
| **L0** | [Foundation & the look-dev room](L0-foundation.md) | Stack, render core, post stack, night sky v1, moonlight, wetness system, rain v1, one calibrated Pilies St corner, third-person controller, the Art Director panel | **ready** |
| L1 | Night sky & moonlight mastery | Real ephemeris moon, volumetric clouds with moon shafts, light-pollution dome, CSM seam elimination, PCSS contact shadows, night IBL, aurora (plausible at 54°N) | |
| L2 | Material & texture authority | Full Vilnius material library, ORM/KTX2 pipeline hardened, POM tuning, triplanar blends, decal system (grime, moss, posters, soot), detail normals, cavity-driven weathering | |
| L3 | Rain, storm & wetness mastery | Rain v2, puddle accumulation over time, surface flow, gutter streams, roof drips, lens droplets, lightning with one-frame light bursts, thunder timing, wet cloth and wet skin on the player | |
| L4 | The Vilnia & the Neris | Gerstner + FFT water, screen-space reflection and depth refraction, foam from depth difference, flow maps under the Bernardine bridge, shore wetting, moon glint, rain interaction | |
| L5 | Old Town blockout from real data | OSM footprints + LiDAR heights → procedural façades, the real street network, district chunks, streaming, occlusion culling, LOD system, lightmap bake pipeline at city scale | |
| L6 | Hero landmarks | Gediminas' Tower, Cathedral + Bell Tower, St. Anne's, Bernardine complex, Gates of Dawn, Town Hall Square, University courtyards, Užupis, Three Crosses Hill — hand-sculpted, each a synchronisation viewpoint | |
| L7 | The hero | Meshy/Tripo character through the pipeline, retopo, rig, Mixamo + custom animation set, hood and cape secondary motion, cloth, wet shading, silhouette pass | |
| L8 | Traversal & parkour | Ledge detection, climb/vault/shimmy/swing, roof-running network, leap of faith, foot IK, camera choreography, the "never breaks flow" tuning pass | |
| L9 | Combat & assassination | Hidden blade, counter-parry system, weapon set from Meshy, hit reactions, ragdolls, air assassination, haystacks, kill cams | |
| L10 | A city that is alive | Guard FSM + navmesh, light-and-line-of-sight detection, noise propagation, social blend, crowds with schedules, market stalls, cats, pigeons, laundry, chimney smoke, tavern light and sound | |
| L11 | The boss | Tripo3D boss model, Cathedral Square in full storm as the arena, three phases, custom mechanics, cinematic framing | |
| L12 | Cinematic polish & ship | Final LUT grade, DOF, motion blur, photo mode, full audio pass, HUD and menus, eagle vision, optimisation pass, build and deploy | |

## How to run a level

1. Open a fresh Claude Code session in `C:\Users\IDOMUSPC\CCode\shadows-of-vilnius`.
2. Paste the level file. Nothing else — the file carries its own context.
3. At the end, review against that level's Definition of Done, then have the session write the *next* level's prompt file based on what it actually learned. That is the key move: **each level writes the next level's prompt**, so the ladder sharpens as the project gets more real.
4. Commit and tag.

## Asset sourcing

- **Meshy** and **Tripo3D** — character, weapons, boss, hero props. Export GLB, drop in `art/genai/`, run `npm run assets -- --from-genai`.
- **Blender** — retopo, rigging, and all lightmap bakes. Non-negotiable for the baked-GI pipeline.
- **Mixamo** — base locomotion and combat animation, then hand-tuned.
- **Polyhaven / ambientCG** — CC0 base PBR texture sets to build the Vilnius material library on top of.
- **OSM + Lithuanian Geoportal** — real building footprints and LiDAR elevation for L5.
- **Higgsfield** (already installed here as skills + MCP) can generate 3D/GLB, textures, music, and SFX — a useful second source alongside Meshy/Tripo once it's authorised in an interactive session.

## Reference: the Vilnius that matters

The playable slice for L5–L6 is roughly 600 × 500 m: Cathedral Square → Pilies Street → Town Hall Square, with Gediminas' Hill to the north, the Gates of Dawn to the south, and the Vilnia river and Užupis to the east. That footprint contains every landmark worth climbing and is small enough to build at real density.
