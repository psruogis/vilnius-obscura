# Vilnius Obscura

A browser walk through **Vilnius Town Hall Square around 1900**, in the rain, built from real map
data. It is to grow into a history-based game later. Live at **https://vilnius.gg**.

The repo started as "Vilnius Town Hall Walk". `SHADOWS-OF-VILNIUS-MASTER.md` and `prompts/` describe
an earlier stealth-game concept and are **superseded**. Don't follow them.

## The owner

A product designer, not an engineer. Make the engineering calls yourself and bring opinionated
defaults. Ask only about art direction and feel (mood, light, silhouette, pacing). Verify your work
yourself and show screenshots rather than asking the owner to check. Say plainly when something
looks bad. Their design hours are the scarce resource.

## Run, build, ship

```bash
node tools/dev-server.mjs      # http://localhost:5173 ; ?weather=clear for the dry morning, ?gate=solid
node tools/build-static.mjs    # dist/ (about 41 MB, 8 of it music)
```

- **No npm.** three.js, suncalc and meshoptimizer are vendored in `public/vendor/`. Node ≥ 22.18
  (for `stripTypeScriptTypes`). See `README.md`.
- **Deploy = push to `main`.** Vercel project `vilnius-obscura` builds with `vercel.json` and
  publishes to vilnius.gg. Every push goes live in about two minutes.
- **Domain:** `vilnius.gg` is registered at Spaceship, and DNS points at Vercel. The apex is
  canonical and `www` redirects to it. `vilniusobscura.com` is owned but not attached yet.

## Two machines

The owner builds mostly on a **Mac**; there is also a Windows clone. **GitHub
(`psruogis/vilnius-obscura`) is the source of truth: pull before you push.** The Windows clone also
has a `mac` remote (a git daemon at `git://172.20.10.2/vilnius-town-hall-walk`), which only works on
the same hotspot.

## Rules

- **Assets:** CC0 or permissive only, each one recorded in `CREDITS.md`. Never use Google Maps,
  Street View, Earth or 3D Tiles, not even as reference.
- **Map data:** credit OpenStreetMap (ODbL) and GRPK / LiDAR (CC BY 4.0), as the site already does.
- **History:** cite a source for every claim and tag it **[V]** (verified) or **[U]** (unverified or
  a design choice), as in `docs/REFERENCES.md`. Check dates against the setting: the game is
  c. 1900, and much of the old city (the walls, nine of the ten gates) was already gone by 1804.
- **Third-party dashboards** (Vercel, Spaceship): check the vendor's current docs before giving a
  click-path. Don't recite one from memory.

## Where things are

| Doc | What it is |
|---|---|
| `docs/ROADMAP.md` | What's done, what's next, open questions. **Start here.** |
| `docs/characters/` | Character roster (`README.md`) and briefs (`knygnesys.md`, with route data) |
| `docs/gates.md` | The ten city gates, ghost gates, the courier's ways in; the Subačius Gate as built (§8) |
| `docs/research/city-1900.md` | Researched facts: population, city limits, the Lithuanian community, landmarks |
| `docs/REFERENCES.md` | Visual and architectural references for the square |
| `docs/FIDELITY-PLAN.md` | The seven-stream visual fidelity pass. **Complete**, all merged |
| `TOWN-HALL-WALK-BUILD-PROMPT.md` | The original build brief (written for c. 1800; the game is now c. 1900) |
