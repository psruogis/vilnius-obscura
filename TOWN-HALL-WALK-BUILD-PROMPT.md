# Vilnius Town Hall Walk — Build Prompt

Version 1.1 · 2026-09-26 · working title from the "Shadows of Vilnius" project · setting: about 1800

## How to use

1. Make an empty project folder.
2. Put this file and the `shadows-of-vilnius-seed/` folder in it.
3. Open a fresh Claude Code session there and say: *"Read TOWN-HALL-WALK-BUILD-PROMPT.md and build it."*

You don't need the master brief or the long planning prompt for this.

---

```
=== BEGIN BUILD PROMPT ===
```

# Build: a walk-through of Vilnius Town Hall Square around 1800, in the browser

## What I want

A website where I can **walk around Vilnius Town Hall Square as it was around 1800, in daytime and clear weather**.

- **Viewpoint:** a simple character seen from behind (third-person).
- **Real map data:** the streets and building shapes come from real data, so it feels like the real place.
- **The one landmark:** the **Town Hall** is modelled well, **as finished in 1799**, which is essentially the building standing today. It's the thing people come to see.
- **The surroundings:** a **believable late-1700s Vilnius**. It is not researched house by house.
- **Tone:** calm and pleasant. Not a game with goals: no missions, no climbing, no combat.

## Who I am, and how to work with me

I'm a product designer, not an engineer.

- **Engineering:** make the technical calls yourself.
- **Questions:** ask me **at most three**, and only about look and feel. Offer each as a choice with your recommendation, and keep working on the recommended option while you wait.
- **Progress:** show me screenshots at every milestone. Never ask me to check whether something works.
- **Bad results:** tell me plainly when something looks bad, and propose the fix.
- **Scope:** keep it simple. If a feature isn't needed for "walk around the Town Hall and enjoy it", cut it and tell me.

## Scope

**Must have:**

1. **The area.** Town Hall Square plus the streets around it, about 150–250 m out: Didžioji down to St Casimir's, and the lanes opening onto the square.
   - Draw the walkable boundary so it ends naturally: a street turn, a gate, a narrow lane.
   - Beyond it, show simple low-detail buildings so there is never a void on the horizon.
2. **Buildings from real data.**
   - **Footprints:** GRPK, from the seed file `shadows-of-vilnius-seed/grpk/grpk_pastat_oldtown_epsg3346.geojson`.
   - **Heights:**
     - **Try the national LiDAR, for 30 minutes at most.** Try the anonymous data.gov.lt downloads (datasets 2567, 3987), or the public point-cloud endpoint used by the open-source viewer *gmacev/lidar-lt*.
     - If both fail: ordering LiDAR needs a Lithuanian e-ID, which only I have. Tell me, and use the fallbacks meanwhile.
     - **Fallbacks:** OSM `height` / `building:levels` where tagged, else a default of three storeys (about 11 m), tuned by eye against photos.
   - **Turning today's buildings into about 1800.** Apply simple automatic rules; there is no research per house.
     - **Height:** many houses gained storeys in the 1800s and 1900s. Cap ordinary houses at **three storeys**; palaces and big corner houses may keep more.
     - **Mansards:** remove them.
     - **Heritage-register dates:** if the heritage records in `kvr/` give a machine-readable date for an added storey, use it.
   - **Roofs:** procedural, **steep (about 45°) hip and gable roofs in hand-made red clay tile**, with the odd glazed accent. No tin or zinc on ordinary houses.
   - **Façades:** procedural, late-baroque and early-neoclassical.
     - Limewashed plaster in whites, creams, ochres and greys.
     - **Small-paned windows**, timber shutters.
     - **Vaulted ground-floor openings** with wooden doors and shutters, instead of shop windows.
     - Plain cornices; the occasional carved portal or courtyard gateway.
     - Vary them so no two neighbours match.
     - **Nothing modern:** no shop windows, signs, lamp posts, balconies, satellite dishes, gutters or downpipes in plastic, or cars.
   - **Ground:** **rounded fieldstone cobbles**, with open drainage gutters and a little mud at the edges. No raised pavements or kerbs, and no asphalt. Use the OSM pedestrian areas and roads for the layout. Town Hall Square is OSM way 54055201.
   - **Terrain:** use the LiDAR ground if you have it; otherwise flat ground is fine for v1.
3. **The Town Hall, modelled properly.**
   - **What it is:** a neoclassical building with a **six-column Doric portico**, rebuilt by Laurynas Gucevičius and finished in 1799 on older walls and cellars.
   - **Footprint:** from GRPK / OSM (Town Hall centroid about E 582 993, N 6 060 944 in EPSG:3346; OSM way 111866535).
   - **Proportions:** measured from **openly licensed photos** only: Wikimedia Commons, or the heritage register photos in the seed (`kvr/`) for measurement.
   - **Approach:** build it as a clean parametric model from its real proportions. Show me progress screenshots beside a reference photo.
   - **Leave out modern additions:** plaques, flagpoles, modern lamps and signage.
4. **St Casimir's Church** (the crown-domed church at the south end of the square) as a **simpler model**: correct shape and silhouette, less detail. Its crown cupola dates from about 1755, so today's silhouette is broadly right for 1800.
5. **The square around 1800: a market place.**
   - **Add:** wooden market stalls, carts, barrels, crates, hay and a **public water cistern** (a wooden-lidded well box fed by wooden pipes).
   - **Remove** today's trees, benches, fountain and garden. The planted square came later, in the 1800s.
   - **Leave out** punishment structures and the Russian guardhouse. Evidence for them in 1800 is thin; they are optional and conjectural.
6. **Walking.**
   - **Controls:** WASD plus mouse, and shift to jog. A smooth follow camera that never clips through walls.
   - **Collisions:** you can't walk through buildings.
   - **Character:** a CC0 animated character in **clothes that could pass for about 1800**, e.g. a long coat or cloak, from a CC0 medieval or historical pack such as Quaternius's. Idle, walk and jog animations.
7. **Look.**
   - **Light:** daytime sun and sky. Use the **real sun position for Vilnius** (54.68° N; e.g. the suncalc library) on a nice afternoon with long shadows. You pick the date and time.
   - **Rendering:** soft shadows, ambient occlusion, light haze, good tone mapping. Keep the post-processing modest.
   - **Textures:** CC0 only (Poly Haven, ambientCG).
   - **Mood reference:** public-domain views of Vilnius on Wikimedia Commons, such as Smuglewicz's watercolours of 1785–86 and the later *Album Wileńskie* lithographs. **The vibe only, not tracing.**
8. **Sound.** A light daytime ambience from CC0 sounds, with **no engines**: footsteps on stone, horses and carts, market voices, birds, an occasional church bell.
9. **The website.**
   - **Start screen:** a title and "Click to walk", with a loading bar.
   - **Credits page**, with the attributions below.
   - **Phones:** a friendly "open on a desktop" message, with a screenshot.
   - **Hosting:** a static site on free or cheap hosting. You choose.
   - **Performance targets:** about 40 MB or less to first walk, and 60 fps on a mid-range laptop.

**Nice to have, only after the must-haves are live:**
- 5–8 **info points** with short, sourced notes on the Town Hall's history, e.g. the tower that collapsed in 1781, Gucevičius's rebuild, and 24–25 April 1794 on the square.
- A few **people walking around**.
- A **Lithuanian** language option.

**Out of scope:** night, rain, seasons, missions, climbing, combat, interiors, other districts, save games, accounts, and per-house historical research.

## Rules

- **Never use Google Street View, Google Earth, Google Maps imagery or Google's 3D Tiles**, not even as a reference. Their terms forbid creating models or data from them, so the project keeps clear of them entirely.
- **Licences:**
  - Record the source and licence of every asset in `CREDITS.md`, and show it on the credits page.
  - GRPK footprints and national LiDAR are CC BY 4.0. Credit "© Nacionalinė žemės tarnyba prie Aplinkos ministerijos, [year]".
  - If you use any OpenStreetMap data, credit "© OpenStreetMap contributors" and publish the small derived data table alongside the site (ODbL).
  - Use CC0 assets wherever possible.
- **Tech:** Vite + TypeScript + three.js, with no heavy frameworks. Keep the code simple and readable.
- **Git:** commit at every milestone.
- **Coordinates:** EPSG:3346 with a local origin at **E 583 000, N 6 061 000**, about 56 m north of the Town Hall. 1 unit = 1 metre, Y-up: X = E − 583 000, Z = −(N − 6 061 000).
- **Seed files:** don't open the big ones directly (they are MBs of JSON). Read them with small scripts.

## Milestones

End each one with screenshots and a short note to me.

| # | What you deliver | Rough time, part-time |
|---|---|---|
| **M1** | A project where I can already walk: extruded buildings from the real footprints, ground, sky, sun shadows, a placeholder character, the follow camera | about 1–2 weeks |
| **M2** | The area looks like Vilnius around 1800: heights (real, or fallback with the three-storey cap), tile roofs, period façades, cobbles and gutters, backdrop, lighting polish | about 2–4 weeks |
| **M3** | The Town Hall (the full model, as in 1799) and St Casimir's (simplified), plus the market square: stalls, cistern, carts, barrels | about 2–3 weeks |
| **M4** | The real character and animations, collision polish, sound, start screen, credits, the phone message, **deployed at a live URL** | about 1–2 weeks |
| **M5** | Optional: info points, people, Lithuanian | about 1–2 weeks |

**Start** by restating the plan as a short task list, then build M1.

## Reference

- **Seed folder** (`shadows-of-vilnius-seed/`):
  - `grpk/`: 3,808 building footprints, EPSG:3346, CC BY 4.0
  - `osm/`: the OpenStreetMap snapshot of the Old Town, with the street layout, pedestrian areas and passages (ODbL). Ignore its modern furniture.
  - `kvr/`: heritage-register records with descriptions and photo lists. Photos are for reference and measurement only.
  - `research/`: optional background, including more 1790s detail on roofs, colours, streets and water
  - If `SHADOWS-OF-VILNIUS-PLANNING-PROMPT.md` is present, its Appendix A3 and A4 hold the fuller period rules. Optional.
- **Around 1800** (secondary sources):
  - The square was the city's main market, with shops inside the Town Hall and merchants' warehouses around it.
  - Water came from wooden-lidded public cisterns fed by wooden pipes.
  - Roofs were steep clay tile; metal only on churches and palaces.
  - Streets were fieldstone with open gutters.
  - Street lighting was minimal.
  - Most façades around the square were late-baroque rebuilds after the fires of 1737–49.
- **The Town Hall** (secondary sources):
  - A Gothic town hall stood here from at least 1503.
  - Its tall baroque tower collapsed on 19 Jun 1781.
  - Laurynas Gucevičius rebuilt it in neoclassical style (designed 1785–86, built about 1788–1799) on the old walls and cellars.
  - The rebuild has a six-column Doric portico and no tower.
  - On 24–25 Apr 1794 the Act of Insurrection was read on the square, and Hetman Szymon Kossakowski was hanged in front of the building.
  - Keep any info-point text factual and respectful.
- **Period views: the rendering guide.** Four views of the square supplied by the user (Peszka 1797 watercolour,
  Zaleski c.1846 oil, a mid-19th-century engraving, a later copy after Zaleski), catalogued with what to take from
  each in `docs/REFERENCES.md` §6.1. Match the look to them whenever rendering anything around the square. Where
  they disagree, the 1797 Peszka wins. Positions still come from real data and the 1842 plan.
- **St Casimir's:** Didžioji g. 34, early baroque. Its crown-shaped cupola dates from about 1755 and was restored in 1942.

```
=== END BUILD PROMPT ===
```
