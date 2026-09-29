# Roadmap

Updated 2026-09-28. The order of "Next" is **a proposal**. The owner hasn't ranked it yet, so
reorder freely.

## Done

- **The walk (M1–M4):** real footprints and heights, period façades and roofs, cobbles, the Town Hall
  and St Casimir's (in its c. 1900 Orthodox form), townsfolk, cabs, the market, rain, sound, the
  title screen, credits. See `README.md` and the git log.
- **The map:** a round plan in the corner that follows the walker (north up, with the view cone), and
  a full-screen view (Tab, or a tap on the corner map) with pan, zoom, street names and an "About this
  map" note on what each layer is and from when. Three looks: light (default), dark, glow. `src/ui/map.ts`, `docs/map-sources.md`.
- **Fidelity pass:** seven parallel streams covering surfaces, house geometry, wet reflections,
  cabs, people, street props and landmarks, all merged (`docs/FIDELITY-PLAN.md`).
- **Shipping:** GitHub → Vercel. Every push to `main` goes live at https://vilnius.gg.

## Next (proposed order)

1. **Mobile.** The owner is building the touch controls. After that: an add-to-home-screen manifest
   (`"display": "fullscreen"`, the only real fullscreen on iPhone); `requestFullscreen()` on the
   "Click to walk" button (Android); keeping the screen awake (Wake Lock); viewport and CSS hardening
   (`viewport-fit=cover`, `touch-action: none` on the canvas, `overscroll-behavior: none`, no pinch
   zoom); and a lighter phone quality tier (fewer shadow cascades, AO off, capped pixel ratio). Keep
   touch controls out of the bottom ~20 px on iPhone.
2. **The knygnešys**, the book courier. The brief is ready: `docs/characters/knygnesys.md`. Needs a
   scripted route-follower NPC; St Nicholas' Church modelled (or the walk extended west); and,
   optionally, a November-dusk light preset.
3. **More characters.** The roster is in `docs/characters/README.md`.
4. **Ghost gates.** `docs/gates.md`. Research the pre-1799 appearance first. Showing the gates
   properly means growing the walk towards the whole Old Town.
5. **The Great Synagogue and the Shulhoyf.** No model exists to import; it would be built from
   archives (`docs/research/city-1900.md` §6). It sits inside the existing map frame.
6. **The crowd, balanced to the 1897 census.** Mix in `docs/research/city-1900.md` §2.
7. **Info points and Lithuanian (README M5).**

## Small jobs

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
6. What did the lost gates look like?
7. Where did ordinary Lithuanian-speaking servants and workers live? Nothing found so far.

## Superseded

`SHADOWS-OF-VILNIUS-MASTER.md` and `prompts/`: the earlier stealth-game plan. Kept for history only.
