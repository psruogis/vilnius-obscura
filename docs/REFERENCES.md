# References and assets for later milestones

Compiled 2026-09-26 for M2–M5: the player character, textures, sound, the Town Hall model, St Casimir's, and period mood references.

Nothing was downloaded into the project. I fetched only small preview images, API metadata, and the headers of GLB and zip files (HTTP range requests) to read triangle counts, animation names and file lists.

**Status tags:** **[V]** checked at the source on 2026-09-26 · **[P]** partly checked · **[U]** unverified, inferred, or my own estimate.

**Rules followed:** no Google Maps, Street View, Earth or 3D Tiles were used for anything here. Some Quaternius packs are hosted on Google Drive. That is file hosting, not map imagery, and itch.io mirrors exist.

---

## 0. Quick picks

| Need | Pick | Licence |
|---|---|---|
| Player character | Quaternius Universal Base Character + "Peasant" outfit + Universal Animation Library (Standard). See §1. | CC0 on the pack and itch pages. Read the caveat in §1.3. |
| Fallback character (one file, no assembly) | Quaternius "Adventurer" GLB from Poly Pizza, with the `Backpack` mesh hidden | CC0 (Poly Pizza listing) |
| Cobbles | ambientCG `PavingStones141` | CC0 |
| Ordinary house walls | Poly Haven `painted_plaster_wall`, tinted | CC0 |
| Town Hall walls | Poly Haven `white_stucco` | CC0 |
| Roofs | Poly Haven `clay_roof_tiles_03` | CC0 |
| Timber | Poly Haven `rough_pine_door`, `wood_shutter`, `weathered_planks` | CC0 |
| Plinth and portico stone | Poly Haven `stone_tile_wall` | CC0 |
| Footsteps | Freesound Nox_Sound #558472 (20 single steps) + Kenney Impact Sounds `footstep_concrete_*` | CC0 |
| Horses and carts | Freesound craigsmith #479730, #437103, #437078, #437075 | CC0 |
| Market voices | Freesound bolkmar #424790 + craigsmith #486191 | CC0 |
| Birds | Freesound straget #404663 (sparrows), bruno.auzet #690331 (swifts) | CC0 |
| Distant bell | Freesound mikewest #411489 | CC0 |

---

## 1. Animated character

### 1.1 Top 3

| Rank | Asset | Why it fits c.1800 | Format and rig | Idle / walk / run | Triangles | Download | Licence |
|---|---|---|---|---|---|---|---|
| **1** | **Quaternius Universal Base Characters** (Regular male) + **Modular Character Outfits – Fantasy**, `Peasant_Male` + **Universal Animation Library (UAL) Standard** | The most realistic proportions of the CC0 options. The peasant shirt, laced tunic, trousers and boots pass for a labourer or carter. The three packs share one humanoid rig, so no retargeting. The `Male_Noble` outfit is a long coat (paid Source tier only, $20+). | glTF, FBX, OBJ, Blend. "Humanoid rig, retargeting in any engine" [V]. UAL: "universal humanoid rig", 65 bones per a third-party project [P]. | UAL Standard (free) has 45 clips, including idle, walk, jog and sprint, in in-place and root-motion versions [V]. `Jog_Fwd_Loop` is confirmed in third-party use [P]. `Idle_Loop`, `Walk_Loop` and `Sprint_Loop` are the expected names [U]. | Base characters "average 13k" (stated) [V]. Outfit counts are not stated. | itch.io, name your own price ($0 works). There is no static file URL. Outfits: https://quaternius.itch.io/modular-character-outfits-fantasy (Standard zip 280 MB, free; Source 724 MB, $20+). Base: https://quaternius.com/packs/universalbasecharacters.html (links to itch). UAL: https://quaternius.itch.io/universal-animation-library (Standard 15 MB). | "CC0" on the pack pages; "Creative Commons Zero v1.0 Universal" on itch [V]. See §1.3. |
| **2** | **Quaternius Ultimate Modular Men – "Adventurer"** (also "Farmer"); **Ultimate Modular Women – "Hooded Adventurer"** | One ready GLB with idle, walk and run. Materials are flat colours with no textures, so recolouring to period browns and greys is trivial. The backpack and sword are separate meshes you can hide. The Hooded Adventurer's hood reads as a cloak. | GLB (FBX2glTF). Skeleton `CharacterArmature`, 62 joints (`Root, Body, Hips, Abdomen, Torso, Chest, Neck, Head, Shoulder.L, UpperArm.L …`) [V]. | 24 clips: `CharacterArmature\|Idle`, `\|Idle_Neutral`, `\|Walk`, `\|Run`, `\|Run_Back`, `\|Run_Left`, `\|Run_Right`, `\|Interact`, `\|Wave`, `\|Roll`, plus combat clips [V]. | Adventurer 10,198 (8,450 without `Backpack`). Farmer 5,476. Hooded Adventurer 7,276 (6,404 without `Sword`). Counted from the GLB index buffers [V]. | Direct GLBs: Adventurer https://static.poly.pizza/bbe369ee-a686-42c7-adad-14356f5f2f15.glb (1.9 MB; page https://poly.pizza/m/5EGWBMpuXq). Farmer https://static.poly.pizza/81f2f0cf-6f53-4b57-92ea-dba0928620f2.glb (1.4 MB; https://poly.pizza/m/7pn3R6hPvE). Hooded Adventurer https://static.poly.pizza/3186b8e9-afd5-4d48-846c-b2b530cd23e2.glb (1.6 MB; https://poly.pizza/m/y9KWOVG21R). Full packs in FBX, OBJ, glTF and Blend: https://quaternius.com/packs/ultimatemodularcharacters.html and https://quaternius.com/packs/ultimatemodularwomen.html (Google Drive folders linked there). | Poly Pizza: "Public Domain (CC0)" [V]. Pack pages: "CC0" [V]. |
| **3** | **KayKit Character Pack: Adventurers** (Kay Lousberg), `Rogue_Hooded` or `Mage` | Hooded cloak or long robe silhouette. The cleanest licence file of the three, plus a very large CC0 animation library on the same rig. | GLB + one 1024² gradient-atlas PNG. 41 joints (`root, hips, spine, chest, upperarm.l, lowerarm.l, wrist.l, hand.l, handslot.l …`) [V]. | 76 clips, including `Idle`, `Unarmed_Idle`, `Walking_A`, `Walking_B`, `Walking_C`, `Running_A`, `Running_B`, `Sit_Chair_Idle` [V]. The KayKit Character Animations pack adds 161 more (CC0): https://kaylousberg.itch.io/kaykit-character-animations | Mage 5,683. Rogue_Hooded 6,035 [V]. | https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb (3.6 MB), with `rogue_texture.png` in the same folder. `Mage.glb` and `mage_texture.png` sit beside it. | CC0. Licence text: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/main/LICENSE.txt [V] |

**Drawbacks.**
- **Rank 1:** you have to assemble a head and outfit parts. The Standard zip is large, although each part is small. The laced tunic reads more "medieval fantasy" than 1800, so use darker, duller colours and no weapon.
- **Rank 2:** the Adventurer's tunic is modern-ish. The Farmer's overalls and straw hat look 19th or 20th century.
- **Rank 3:** chibi proportions (a large head) clash with a realistic town.

### 1.2 Also looked at

| Asset | Notes | Licence |
|---|---|---|
| Quaternius Animated Men / Women (2019): "Man in Long Sleeves", "Woman in Dress" | 2,058 and 1,786 triangles. 11 clips (`HumanArmature\|Man_Idle`, `…Man_Walk`, `…Man_Run`, …) [V]. Modern clothes and very low-poly, but usable for distant M5 passers-by. GLBs: https://static.poly.pizza/66b57880-bcb0-479a-8d72-5c3e88afaa39.glb and https://static.poly.pizza/a642af96-e239-4c5f-b50d-7661ff51deec.glb | CC0 [V] |
| Kenney Animated Characters (Protagonists, Retro, Survivors) https://kenney.nl/assets/animated-characters-protagonists | One shared rig with paintable skins, so it could take a hand-painted 1800 coat skin. Blocky style [P]. | CC0 [V] (https://kenney.nl/support) |
| Poly Pizza "Pleasant peasant", "Food Worker", "Generic Male" | Rejected: CC-BY 3.0, and some are unrigged [V]. | CC-BY 3.0 |
| Mixamo, Sketchfab | Rejected: not CC0 (Adobe terms; mostly CC-BY on Sketchfab). | — |

### 1.3 Licence caveat for Quaternius

- **The site licence changed.** https://quaternius.com/license.html, updated 2026-08-28, now shows the **Quaternius Asset License (QAL) v1.0**. It allows free commercial use with no credit, but forbids redistributing the assets themselves as assets. Its §7 says changes are not retroactive. [V]
- **The pack pages have not changed.** The pack pages and the itch pages still say CC0 as of 2026-09-26.
- **What to do:** keep the licence file inside each downloaded zip, and record the download date and the licence shown in `CREDITS.md`. Prefer the Poly Pizza copies where possible, since they are explicitly marked CC0. Both licences allow a public website that incorporates the models.

### 1.4 three.js notes

- **Clip names:** the Poly Pizza GLBs prefix clip names with the armature (`CharacterArmature|Walk`), so match clips by suffix.
- **Hiding parts:** hide the `Backpack` and `Sword` nodes by name. The Adventurer's mesh nodes are `Adventurer_Feet`, `_Legs`, `_Body`, `_Head` and `Backpack` [V].
- **File size:** strip unused clips, for example with gltf-transform. Every candidate is under 4 MB before compression.

---

## 2. CC0 PBR textures

Both libraries are CC0: https://polyhaven.com/license and https://docs.ambientcg.com/license/ [V].

- **Resolutions** were read from the Poly Haven API (`https://api.polyhaven.com/files/<id>`) and the ambientCG API on 2026-09-26 [V]. I judged the look from preview renders only.
- **Poly Haven maps:** each map comes as JPG, PNG or EXR, and there is a glTF bundle at every resolution. Per-map URLs follow `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_diff_1k.jpg`. A 1k diffuse JPG is about 0.3–1 MB.
- **ambientCG zips:** `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`. The 1K zips are 4–9 MB because they include every map.
- **Budget:** 1K for most materials and 2K for the cobbles and the Town Hall, converted to KTX2, fits the 40 MB target.

### 2.1 Rounded fieldstone cobbles (plus mud)

| Asset | Source | Resolutions | Look / use | Link |
|---|---|---|---|---|
| **PavingStones141** | ambientCG | 1K, 2K, 4K, 8K | Rounded fieldstones in mixed colours (tags "medieval, old, rocks"). Closest match to Baltic fieldstone paving. **Top pick.** | https://ambientcg.com/view?id=PavingStones141 |
| cobblestone_floor_001 | Poly Haven | 1k–8k | Irregular rounded stones with mud between (tags "mud, uneven, medieval"). | https://polyhaven.com/a/cobblestone_floor_001 |
| large_pebbles | Poly Haven | 1k–8k | Large rounded pebbles, tightly set and dark. Lighten with a tint. | https://polyhaven.com/a/large_pebbles |
| rock_embedded_floor | Poly Haven | 1k–8k | Rounded stones in a dark matrix. Good for gutters and edges. | https://polyhaven.com/a/rock_embedded_floor |
| cobblestone_floor_13 | Poly Haven | 1k–8k | Rural, irregular and dusty. Good for side lanes. | https://polyhaven.com/a/cobblestone_floor_13 |
| Ground109 | ambientCG | 1K–8K | Dry mud with scattered pebbles, for street edges and the gutter margins. | https://ambientcg.com/view?id=Ground109 |

### 2.2 Lime plaster or limewash walls (tint for whites, creams, ochres, greys)

| Asset | Source | Resolutions | Look / use | Link |
|---|---|---|---|---|
| **painted_plaster_wall** | Poly Haven | 1k–16k | Weathered, discoloured exterior plaster with a pale base. Takes tints well. **Top pick.** | https://polyhaven.com/a/painted_plaster_wall |
| white_plaster_02 | Poly Haven | 1k–8k | Flat, with soft stains. | https://polyhaven.com/a/white_plaster_02 |
| grey_plaster_03 | Poly Haven | 1k–8k | Rough, uneven and hand-applied. Suits grey and cream tints. | https://polyhaven.com/a/grey_plaster_03 |
| plaster_grey_04 | Poly Haven | 1k–8k | Rough but even. | https://polyhaven.com/a/plaster_grey_04 |
| yellow_plaster | Poly Haven | 1k–8k | Worn ochre, already coloured. | https://polyhaven.com/a/yellow_plaster |
| white_rough_plaster | Poly Haven | 1k–8k | Chipped and broken. Accent only, for the odd shabby wall. | https://polyhaven.com/a/white_rough_plaster |
| Plaster003 / Plaster006 | ambientCG | 1K–8K | Clean, rough white plaster. | https://ambientcg.com/view?id=Plaster003 · https://ambientcg.com/view?id=Plaster006 |

### 2.3 Red clay roof tiles (hand-made, pantile or beaver-tail)

| Asset | Source | Resolutions | Look / use | Link |
|---|---|---|---|---|
| **clay_roof_tiles_03** | Poly Haven | 1k–8k | Flat, hand-made, weathered plain tiles in overlapping courses ("traditional roofing"). Closest to beaver-tail. **Top pick.** | https://polyhaven.com/a/clay_roof_tiles_03 |
| clay_roof_tiles | Poly Haven | 1k–8k | Small, dark red, very weathered hand-made tiles. | https://polyhaven.com/a/clay_roof_tiles |
| clay_roof_tiles_02 | Poly Haven | 1k–8k | Orange-red, old and "traditional". Tagged "interlocking", so check the profile. | https://polyhaven.com/a/clay_roof_tiles_02 |
| roof_09 | Poly Haven | 1k–8k | S-profile pantiles, old and grey-streaked. | https://polyhaven.com/a/roof_09 |
| ceramic_roof_01 | Poly Haven | 1k–8k | Old tiles with moss. For variety. | https://polyhaven.com/a/ceramic_roof_01 |
| RoofingTiles014A / 014B | ambientCG | 1K–8K | Clay tiles with rounded ends that look like beaver-tail [U]. 014B is the dirty, old variant. | https://ambientcg.com/view?id=RoofingTiles014A · https://ambientcg.com/view?id=RoofingTiles014B |

### 2.4 Weathered timber (doors, shutters, stalls)

| Asset | Source | Resolutions | Look / use | Link |
|---|---|---|---|---|
| **rough_pine_door** | Poly Haven | 1k–8k | Rough-hewn barn-style plank door with battens. | https://polyhaven.com/a/rough_pine_door |
| **wood_shutter** | Poly Haven | 1k–8k | Vertical plank shutter with nails. | https://polyhaven.com/a/wood_shutter |
| **weathered_planks** | Poly Haven | 1k–8k | Grey-brown, cracked and stained. For stalls and crates. | https://polyhaven.com/a/weathered_planks |
| old_planks_02 | Poly Haven | 1k–8k | Worn, grey. | https://polyhaven.com/a/old_planks_02 |
| planks_brown_10 | Poly Haven | 1k–8k | Horizontal, discoloured planks. For stall sides and sheds. | https://polyhaven.com/a/planks_brown_10 |
| rough_wood | Poly Haven | 1k–8k | Cracked, aged timber for posts, beams and cart frames. | https://polyhaven.com/a/rough_wood |
| Wood035 | ambientCG | 1K–8K | Dark, old and rough. | https://ambientcg.com/view?id=Wood035 |

### 2.5 Rough stone for the plinth and portico

| Asset | Source | Resolutions | Look / use | Link |
|---|---|---|---|---|
| **stone_tile_wall** | Poly Haven | 1k–8k | Light dressed ashlar blocks. For the Town Hall plinth, steps and portico podium. | https://polyhaven.com/a/stone_tile_wall |
| granite_tile_04 | Poly Haven | 1k–8k | Weathered granite slabs. Today's plinth is granite-clad, but that may be 20th-century [U]. | https://polyhaven.com/a/granite_tile_04 |
| medieval_blocks_03 | Poly Haven | 1k–8k | Large, old, rough blocks. For house plinths and church bases. | https://polyhaven.com/a/medieval_blocks_03 |
| stone_block_wall | Poly Haven | 1k–16k | Darker ashlar. | https://polyhaven.com/a/stone_block_wall |
| granite_wall | Poly Haven | 1k–8k | Rough coursed granite. | https://polyhaven.com/a/granite_wall |
| Tiles143 | ambientCG | 1K–8K | Beige limestone blocks. | https://ambientcg.com/view?id=Tiles143 |

### 2.6 Whitish plaster for a neoclassical façade

| Asset | Source | Resolutions | Look / use | Link |
|---|---|---|---|---|
| **white_stucco** | Poly Haven | 1k–8k | Fine, granular, matte white stucco. **Top pick for the Town Hall walls and columns.** | https://polyhaven.com/a/white_stucco |
| Plaster001 | ambientCG | 1K–8K | Clean, matte white exterior stucco. | https://ambientcg.com/view?id=Plaster001 |
| PaintedPlaster017 | ambientCG | 1K–16K | White painted plaster. | https://ambientcg.com/view?id=PaintedPlaster017 |

The Town Hall walls are rusticated plaster with incised rectangular "blocks" (KVR; VLE). Model the block joints as geometry or a procedural normal map on top of the stucco texture.

---

## 3. CC0 sounds

- **Licence:** every Freesound entry below was found with the Creative Commons 0 filter, and each page shows that licence. CC0 deed: https://creativecommons.org/publicdomain/zero/1.0/
- **Not auditioned:** I have not listened to any of them. "Modern elements" notes come from the uploaders' descriptions [U].
- **craigsmith:** this uploader digitised vintage sound-effect records, with many horse and carriage takes on cobbles [P]. They are usually free of engines, but check each one.

### 3.1 Footsteps on stone and cobbles

| Sound | Uploader | URL | Notes |
|---|---|---|---|
| accented steps .wav | Jess_Weddle_6121 | https://freesound.org/people/Jess_Weddle_6121/sounds/695945/ | Footsteps on a cobbled street (per the description) |
| Footsteps_Mountain_Boots_Rock_Walk_Sequence_Mono.wav | Nox_Sound | https://freesound.org/people/Nox_Sound/sounds/558472/ | 20 separate boot steps on rock (48 kHz, 24-bit). Ideal for per-step triggering. |
| FPS Footsteps Loop | qubodup | https://freesound.org/people/qubodup/sounds/816019/ | Loopable shoe steps on stone |
| Dry Footsteps Loop | qubodup | https://freesound.org/people/qubodup/sounds/816017/ | Loopable boot steps on stone |
| Footsteps - Stone, Rock, Concrete, Cement | SecureSubset | https://freesound.org/people/SecureSubset/sounds/813622/ | Foley pit recording |
| Walking on dirt and a few cobble country side path | Sadiquecat | https://freesound.org/people/Sadiquecat/sounds/802067/ | Dirt and cobble mix, for lane edges |
| Kenney **Impact Sounds** | Kenney | https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip | 0.8 MB zip. Contains `footstep_concrete_000–004.ogg`, plus wood, grass, snow and carpet variants [V, zip listing] |
| Kenney **RPG Audio** | Kenney | https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip | 0.96 MB zip. Contains `footstep00–09.ogg` [V] |

### 3.2 Horse and cart on cobbles

| Sound | Uploader | URL | Notes |
|---|---|---|---|
| R13-59-Horses Approach and By.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/479730/ | Carriage and horses on cobblestone, a long approach, people talking |
| G38-10-Horse Walks on Pavement.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/437103/ | Single horse walking on paving or cobbles. Can be layered with a carriage rattle. |
| G52-05-Ox Cart.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/437078/ | Wooden wheels: slow rumble, squeak and rattle. Good for peasant carts. |
| G52-08-Rattling Carriage.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/437075/ | Rattle and squeak on hard ground |
| G18-12-Horses on Cobblestones.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/438190/ | Carriages trotting by; a voice, thuds and doors slamming |
| R23-54-Horse Carriage in Distance.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/479797/ | Team of horses on cobbles, in the distance |
| G52-20-Milk Wagon.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/437092/ | Wagon on cobbles, trots away |
| clatter of hooves.wav | skitchscharff | https://freesound.org/people/skitchscharff/sounds/204961/ | Carriage and people in a small paved street. May have a modern background [U]. |
| horse_arches.wav | giddykipper | https://freesound.org/people/giddykipper/sounds/53488/ | Bruges archway, cobbles. May have a modern background [U]. |

Avoid guynoland #549882: the description mentions ambient street noise.

### 3.3 Market crowd murmur

| Sound | Uploader | URL | Notes |
|---|---|---|---|
| **Crowded street at medieval market** | bolkmar | https://freesound.org/people/bolkmar/sounds/424790/ | From the uploader's "Ambient: Town Pack". Check for PA or music [U]. |
| R08-42-Market Scene.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/486191/ | Women and men talking, men shouting. Suggested by the uploader for a market scene. |
| S13-06 Crowd walla at outdoor farmers' market.wav | craigsmith | https://freesound.org/people/craigsmith/sounds/675026/ | Outdoor walla |
| urbanmarket1 | kayaker25 | https://freesound.org/people/kayaker25/sounds/849929/ | Fish market: vendors calling prices, crates, water. Language unknown [U]. |
| Esperaza market crowd binaural (France) | Sadiquecat | https://freesound.org/people/Sadiquecat/sounds/704777/ | French speech, bar nearby. Keep low in the mix. |

Recognisable modern languages are a risk. Keep voices low and blurred (low-pass filter) so words aren't intelligible.

### 3.4 Birds in a town

| Sound | Uploader | URL | Notes |
|---|---|---|---|
| House sparrow.wav | straget | https://freesound.org/people/straget/sounds/404663/ | House sparrows in bushes, recorded with a shotgun mic |
| FXSaSc Sparrows Close Chirp Exterior Birds.wav | Profispiesser | https://freesound.org/people/Profispiesser/sounds/543827/ | Close sparrows |
| Sparrows.WAV | otad | https://freesound.org/people/otad/sounds/266601/ | Sparrows on a Ukrainian campus, spring. Check the background [U]. |
| swifts birds.wav | bruno.auzet | https://freesound.org/people/bruno.auzet/sounds/690331/ | Swifts (calls and wings) and blackbirds, with distant voices. A summer town sound. |
| blackbird | Andy_Gardner | https://freesound.org/people/Andy_Gardner/sounds/346529/ | Blackbird song with sparrows |

### 3.5 Distant church bell

| Sound | Uploader | URL | Notes |
|---|---|---|---|
| **Italian bells mid distant.wav** | mikewest | https://freesound.org/people/mikewest/sounds/411489/ | Bell tolling at mid distance |
| Distant_Church_Bells.wav | uniuniversal | https://freesound.org/people/uniuniversal/sounds/663380/ | Ghent, Sunday morning, with birdsong. Check for traffic [U]. |
| Distant Church Bells | XPLOman | https://freesound.org/people/XPLOman/sounds/390120/ | Portable-recorder capture |
| Church Bell | mrspivey | https://freesound.org/people/mrspivey/sounds/805156/ | Distant chiming |

Avoid kyles #451777, TRP #717443, tferrino #634976 and Cheeseheadburger #244517: their descriptions mention traffic.

### 3.6 Sonniss GDC bundles (not CC0)

- **Where:** https://sonniss.com/gameaudiogdc lists the 2015–2024 bundles, each tens of GB in several parts. Don't download them wholesale.
- **Licence:** https://sonniss.com/gdc-bundle-license/. Royalty-free and commercial use are allowed, and no attribution is required. You may not redistribute the sounds as standalone files or libraries, and AI/ML training is forbidden [V, summary page].
- **Use:** only if Freesound lacks something. Record the file name and "Sonniss #GameAudioGDC licence" in `CREDITS.md`. I did not check which files the bundles contain.

---

## 4. Vilnius Town Hall (Rotušė, Didžioji g. 31) as finished in 1799

### 4.1 The KVR heritage record (seed file, queried with a script)

`shadows-of-vilnius-seed/kvr/kvr_objects_polygons_details.json`, record `4598bbe4-16c4-42d7-b282-37c9fc059a16`:

- **Identity:** KVR code **678**, "Vilniaus rotušė". Status *Paminklas* (monument), of national significance, registered 1992-04-28. Old codes S136P and AtR34.
- **Style:** "brandžiojo klasicizmo stilius" (mature classicism).
- **Authors:** architects Laurynas Gucevičius (1753–1798) and Stefanas Narembskis (1892–1966).
- **Chronology:** "statyta XIV a., rekonstruota XV a., XVI a. vid., XVIII a. vid., 1785-1799 m., XIX a. vid., 1936-1939 m."
- **Protected territory area:** 1,493 m². This is the register polygon, not the building.
- **Register text licence:** CC BY 4.0 (data.gov.lt dataset 2192, per the seed README). KVR photos are reference-only.

### 4.2 Facts and dimensions

| Item | Value | Source | Status |
|---|---|---|---|
| Plan | Compact, near-square: "kompaktinis, artimo kvadratui plano" | KVR 678 §7.1.1.1. VLE and the KPD brochure also describe a nearly square plan. | [V] |
| Storeys | **2 storeys** + cellar. The KVR adds "daline mansarda, pastoge" (partial mansard and attic). OSM `building:levels=3` counts the attic. | KVR §7.1.1.1. VLE and KPD also say two storeys; VLE mentions cellars. | [V] |
| Portico | **6 Doric columns**, entablature, **triangular pediment**, and a ceiling with relief rosettes: "Š fasado 6 kolonų dorėninis portikas su antablementu, trikampiu frontonu, sufito reljefinėmis rozetėmis". The portico is vaulted ("vad. vienuolyno skliautas"). | KVR §7.1.1.3, §7.1.1.4 | [V] |
| Pediment | Low. lt.wikipedia: "gana žemas trikampis frontonas" (a fairly low triangular pediment). The KPD brochure also calls it low. Slope measured on a photo: about 17° (§4.4). | KPD brochure; lt.wikipedia; photo | [V] / [U] slope |
| Column type | Unfluted shafts with bases and a Doric capital (Roman Doric), and a triglyph frieze across the portico entablature | Photos (§4.6) | [V] visual |
| Which way the portico faces | The **north** façade ("portiku Š fasade"). The KPD brochure says the main façade faces **Didžioji gatvė**. In GRPK the portico projects towards an azimuth of about **25° (NNE)**. | KVR §7.1.1.1; KPD brochure; GRPK geometry | [V] |
| Roof shape | Main roof **hipped** ("valminė"); the portico roof is **gabled** ("dvišlaitė"). The timber roof structure dates from the late 18th century ("XVIII a. pab. medinė stogo konstrukcija"), so the roof form is original. | KVR §7.1.1.1, §7.1.1.4 | [V] |
| Roof covering in 1800 | Today it is sheet metal. However, "**1802 m. inventoriuje minima molio čerpių stogo danga**": the 1802 inventory records a **clay-tile roof**. Peszka 1797 and 1808 and Zaleski c.1846 show a reddish roof. | KVR §7.1.1.1; period views §6 | [V] text / [U] colour reading |
| Roof extras today | A mezzanine on the S façade ("mezoninas P fasade"), 5 timber tin-clad dormers, a skylight, and plastered brick chimneys. Their dates are not given, so treat the dormers and mezzanine as uncertain for 1799. | KVR §7.1.1.1 | [V] text / [U] date |
| Walls | Late-18th-century red-brick walls with older fragments, on stone-and-brick foundations with a **granite-slab-clad plinth**. The cladding date is not given. | KVR §7.1.1.4 | [V] |
| Façade finish | **Rusticated plaster** ("rustuotas tinkas"). VLE describes rectangular rustication imitated in the plaster, window and door surrounds, and straight cornice hoods over the windows. lt.wikipedia: the main cornice has "stambūs modiljonai" (large modillions). | KVR §7.1.1.3; VLE; lt.wikipedia | [V] |
| North façade bays | **5 window bays behind the portico** on both floors: 5 windows above, and 5 openings below (3 doors, the central one widest, and 2 covered by posters). Plain corner piers on each side. | Photo "Vilniaus Rotuse by Augustas Didzgalvis.jpg" | [V] visual |
| Side façades | The Gucevičius side elevation (design) shows **6 bays** on 2 floors, with **2 large ground-floor gateways**. The KPD brochure says carts could drive in from the sides to the ground-floor scales hall. In 1936–39 "P ir šoninių fasadų durų ir įvažiavimų angos perdirbtos į … langus": the door and drive-in openings on the S and side façades became windows. So **in 1799 each side façade had drive-through gateways.** I have not checked the bay count of the built building against a modern photo. | KPD brochure; KVR §7.5; Gucevičius drawing (§4.7) | [V] text / [U] bay count |
| Front steps | Today's granite steps date from 1936–39 ("Prie pagrindinio įėjimo įrengti nauji granito laiptai"). The 1799 steps are unknown. Use simpler, lower stone steps. | KVR §7.5 | [V] |
| Later damage | The 1845 conversion to a theatre "gerokai suniokojo" (badly damaged) Gucevičius's interior and exterior. The 1936–39 works by S. Narembskis rebuilt it partly to Gucevičius's drawings. | KVR §7.5; LNDM Didžioji 31 page | [V] |
| History (for info points) | First written mention 1432. The wooden tower burned in 1749. The octagonal masonry tower was rebuilt from 1753 (J. K. Glaubitz, then T. Russel), finished 1769, and leaned about ten years later. It collapsed in **1781** while Gucevičius was strengthening its foundations. In **1785** Gucevičius submitted 3 designs, and the rebuild of **1785–1799** followed the 3rd. It was built on the old foundations and cellars (VLE). | KVR §7.5; VLE | [V] |
| Footprint (GRPK) | Polygon of **1,375 m²** including the portico. Main block about **37.1 m** (N side, including the returns beside the portico) or 35.5 m (S side) × **34.1 m** (E and W sides). **Portico outline 28.0 m wide × 5.0 m deep.** Minimum bounding rectangle 39.1 × 37.1 m. The GRPK edit source is `ORT` (orthophoto), so the portico outline is probably the roof or cornice edge, not the column line. | GRPK TOP_ID `F37142D2-DC0C-48E1-9904-16D254357E29`, computed | [V] geometry / [U] interpretation |
| Footprint (OSM way 111866535) | 1,867 m²: larger, because it includes the front steps. `roof:shape=pyramidal`, `building:levels=3`, no `height` tag. | OSM snapshot in the seed | [V] |
| Height | **No published height found** (VLE, lt.wikipedia, KPD, LNDM and Wikidata checked). Photo estimates are in §4.4. | — | [U] |

### 4.3 GRPK footprint in local coordinates

Local frame: X = E − 583 000, Z = −(N − 6 061 000), in metres. The polygon centroid is E 582 991.6, N 6 060 944.4 (X −8.37, Z 55.64). That matches the brief's E 582 993, N 6 060 944.

| # | X | Z | Edge to next vertex |
|---|---|---|---|
| 1 | 12.23 | 43.14 | 5.03 m, portico east return (inward) |
| 2 | 10.14 | 47.71 | 4.66 m, main block N wall (east part) |
| 3 | 14.37 | 49.65 | 34.11 m, E side wall |
| 4 | 0.16 | 80.67 | 35.45 m, S wall |
| 5 | −32.02 | 65.79 | 34.03 m, W side wall |
| 6 | −19.33 | 34.21 | 4.45 m, main block N wall (west part) |
| 7 | −15.29 | 36.06 | 5.03 m, portico west return (outward) |
| 8 | −13.19 | 31.50 | 27.96 m, portico front, back to #1 |

Source: GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, CC BY 4.0.

### 4.4 Estimates from photos (my own, ±10–15%) [U]

Method: I measured the near-orthographic drone photo [Vilniaus Rotuse by Augustas Didzgalvis.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_Rotuse_by_Augustas_Didzgalvis.jpg) (CC BY-SA 4.0). I scaled it by setting the portico width to the GRPK 28.0 m, first taken as the cornice span and then as the column span; the range below covers both. I checked the result against the Gucevičius side elevation.

| Item | Estimate |
|---|---|
| Column height (base to top of capital) | 9.6–10.3 m |
| Column lower diameter | about 1.4–1.5 m |
| Top of the horizontal cornice above the portico floor | 12.2–13.2 m. The main cornice runs round the block at the same level. |
| Pediment apex above the portico floor | 16.6–17.9 m |
| Pediment slope | about 17° |
| Column spacing (centre to centre) | Outer bays about 4.5 m. **The central bay is wider, about 6.0 m** (ratio about 1.32). The outer column centres are about 24 m apart. |
| Portico floor above the square | about 1.0–1.3 m (today's steps) |
| Eaves height above ground | about 13–14.5 m. The design drawing gives eaves ≈ 0.40 × side length ≈ 13.7 m. |
| Main roof pitch | about 22° in the Gucevičius side elevation. The photo from St John's tower looks similar. |

Confirm with LiDAR if it becomes available.

### 4.5 What to leave out or change for 1799

- **Remove:** the flagpole and flags, the metal flag holders on the S façade (KVR), banners and posters, plaques, modern lamps, downpipes and gutters, and the antenna masts on neighbouring roofs.
- **Pediment relief (St Christopher arms):** no relief is visible in Peszka 1797 or in the Gucevičius elevation at their scale, so leave the pediment plain [U].
- **Replace the granite steps** (1936–39) with plainer, lower stone steps.
- **Roof** in red clay tile, not grey metal. Leave out the dormers and the S mezzanine unless evidence turns up [U].
- **Side façades:** add the two drive-through gateways on each side (see §4.2).
- **Wall colour:** Peszka 1797 shows pale cream-grey walls, and 1808 and Zaleski c.1846 look warmer ochre-cream [U, visual]. The façade colour was studied in 1997 (Bėčienė and Valainienė, "fasadų žvalgomieji polichrominiai tyrimai", PRI archive f. 5, b. 7192, cited in the KVR), but the report is not online.

### 4.6 Openly licensed photos on Wikimedia Commons

Main category: https://commons.wikimedia.org/wiki/Category:Town_hall_in_Vilnius (156 members). Licences were read from the Commons API (extmetadata) on 2026-09-26 [V].

| View | File | Licence | Author | Pixels | Notes |
|---|---|---|---|---|---|
| Front (N), elevated, near-orthographic | [Vilniaus Rotuse by Augustas Didzgalvis.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_Rotuse_by_Augustas_Didzgalvis.jpg) | CC BY-SA 4.0 | Augustas Didžgalvis | 1800×1200 | Best for proportions; used in §4.4 |
| Front (N) | [Town hall in Vilnius 20180810.jpg](https://commons.wikimedia.org/wiki/File:Town_hall_in_Vilnius_20180810.jpg) | CC BY-SA 4.0 | Suicasmo | 5184×3456 | From ground level |
| Front (N) | [Vilniaus rotušė.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_rotu%C5%A1%C4%97.jpg) | CC BY-SA 4.0 | Terminator216 | 6000×4000 | 2024 series; (2)–(6) are the same series with modern clutter |
| Front (N) | [Vilnius Vilniaus Rotušes 2.jpg](https://commons.wikimedia.org/wiki/File:Vilnius_Vilniaus_Rotu%C5%A1es_2.jpg) | CC BY-SA 4.0 | Zairon | 4488×2997 | Frontal |
| Front (N) | [Lithuania Vilnius Town Hall.jpg](https://commons.wikimedia.org/wiki/File:Lithuania_Vilnius_Town_Hall.jpg) | CC BY-SA 3.0 | Wojsyl | 2560×1705 | Frontal, 2005 |
| NW oblique, W side | [Vilnius city hall.jpg](https://commons.wikimedia.org/wiki/File:Vilnius_city_hall.jpg) | **CC0** | Ypsilon from Finland | 3024×4032 | Portico depth, W side windows and cornice. The only CC0 modern photo found. |
| NE oblique, E side | [Hôtel de Ville Vilnius..jpg](https://commons.wikimedia.org/wiki/File:H%C3%B4tel_de_Ville_Vilnius..jpg) | CC BY-SA 4.0 | Pierre André Leclercq | 2339×1839 | Corner piers, side rustication |
| NE oblique with St Casimir's | [Rathaus+Kasimir-Kirche.jpg](https://commons.wikimedia.org/wiki/File:Rathaus%2BKasimir-Kirche.jpg) | CC BY-SA 4.0 | Barnos | 4828×3277 | Side window hoods, entablature |
| Oblique | [Vilnius, Rotušė.jpg](https://commons.wikimedia.org/wiki/File:Vilnius,_Rotu%C5%A1%C4%97.jpg) | CC BY-SA 4.0 | Terminator216 | 6000×4000 | Also (2) |
| Portico close-up | [Vilniaus rotušės fasadas.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_rotu%C5%A1%C4%97s_fasadas.jpg) | CC BY-SA 4.0 | Jodkovska | 2736×3648 | Columns, central door, windows, steps |
| Pediment close-up | [Vilnius - Rathaus - Stadtwappen.jpg](https://commons.wikimedia.org/wiki/File:Vilnius_-_Rathaus_-_Stadtwappen.jpg) | CC BY-SA 4.0 | HaSt | 5184×3456 | St Christopher relief, possibly later than 1799 |
| Between the columns | [VILNIUS, AB. 023.JPG](https://commons.wikimedia.org/wiki/File:VILNIUS,_AB._023.JPG) | **CC0** | Antekbojar | 1067×800 | Column pair framing St Casimir's dome |
| Roof from St John's belfry | [Vilnius Universitetas Šv. Jono Bažnycios Bokštas Blick auf das Rotuše.jpg](https://commons.wikimedia.org/wiki/File:Vilnius_Universitetas_%C5%A0v._Jono_Ba%C5%BEnycios_Bok%C5%A1tas_Blick_auf_das_Rotu%C5%A1e.jpg) | CC BY-SA 4.0 | Zairon | 4554×2831 | Hipped roof, portico gable, E side, dormers |
| Aerial of the square | [Rotuses aikste by Augustas Didzgalvis.jpg](https://commons.wikimedia.org/wiki/File:Rotuses_aikste_by_Augustas_Didzgalvis.jpg) | CC BY-SA 4.0 | BigHead | 1800×1200 | Drone view along the square |
| Aerial | [Vilnius - view3.jpg](https://commons.wikimedia.org/wiki/File:Vilnius_-_view3.jpg) | CC BY-SA 3.0 | Albert040397 | 695×401 | Small |
| Panorama of the square | [Vilniaus Rotušė.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_Rotu%C5%A1%C4%97.jpg) | CC BY-SA 4.0 | Jodkovska | 9856×2752 | Wide context |
| Front | [Vilniaus City Hall.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_City_Hall.jpg) | Public domain (uploader release) | arz | 954×731 | 2007 |

Using a CC BY-SA photo only as a measuring reference does not put its licence on the model [U, general understanding, not legal advice]. If a photo is shown on the site, for example beside progress screenshots, credit it with author, licence and link.

### 4.7 Gucevičius's design drawings, 1785–86 (public domain)

| File | What | Pixels |
|---|---|---|
| [Vilenskaja ratuša. Віленская ратуша (Ł. Gucevič, 1785-86) (6).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28%C5%81._Gucevi%C4%8D,_1785-86%29_%286%29.jpg) | Front elevation, described on Commons as the **third project**, which is the built variant | 500×321 |
| [Vilenskaja ratuša. Віленская ратуша (Ł. Gucevič, 1785-86).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28%C5%81._Gucevi%C4%8D,_1785-86%29.jpg) | Front elevation | 1024×689 |
| [Vilenskaja ratuša. Віленская ратуша (Ł. Gucevič, 1785-86) (2).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28%C5%81._Gucevi%C4%8D,_1785-86%29_%282%29.jpg) | **Side elevation**: 6 bays, 2 gateways, hipped roof; the old tower is ghosted behind | 1024×687 |
| [Vilenskaja ratuša. Віленская ратуша (Ł. Gucevič, 1785-86) (3).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28%C5%81._Gucevi%C4%8D,_1785-86%29_%283%29.jpg), [Vilenskaja ratuša. Віленская ратуша (Ł. Gucevič, 1785-86) (4).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28%C5%81._Gucevi%C4%8D,_1785-86%29_%284%29.jpg), [Vilenskaja ratuša. Віленская ратуша (Ł. Gucevič, 1785-86) (5).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28%C5%81._Gucevi%C4%8D,_1785-86%29_%285%29.jpg) | Sections | 1024×~690 |
| [The first project of Vilnius City Hall by Lithuanian architect Laurynas Gucevičius.jpg](https://commons.wikimedia.org/wiki/File:The_first_project_of_Vilnius_City_Hall_by_Lithuanian_architect_Laurynas_Gucevi%C4%8Dius.jpg) | First project (not built) | 512×443 |

Which variant each of files 1–5 belongs to is not stated [U]. The P. de Rossi drawings of 1785 and 1799 in the same category are unbuilt proposals with a tower. Don't use them for the model.

---

## 5. St Casimir's Church (Didžioji g. 34), simplified model

### 5.1 Facts

| Item | Value | Source | Status |
|---|---|---|---|
| KVR | Code **27304**, "Vilniaus jėzuitų vienuolyno pastatų ansamblio Šv. Kazimiero bažnyčia", state-protected (seed `kvr_objects_points_details.json`, id `e8c331f8-…`). Ensemble code 680. | KVR | [V] |
| Chronology | "pastatyta 1604–1618 m., rekonstruota 1749–1755 m., restauruota 1814 m., pertvarkyta į cerkvę 1836–1840 m., rekonstruota 1863–1868 m., restauruota 1925, 1955–1957, 1991–1995 m." | KVR Century field | [V] |
| Volume | Latin-cross plan, **twin-towered**, three-aisled basilica with a **dome over the crossing** and a semicircular apse | KVR §7.1.1.2 | [V] |
| Roofs | Nave gabled, aisles lean-to. The W-façade towers have hipped roofs with **octagonal cupolas**. The central dome carries a helm shaped like a **ducal crown or mitre, designed in 1942 by Jonas Mulokas**. Today's covering is sheet metal. | KVR §7.1.1.2 | [V] |
| Dome | A drum, a dome shell and a lantern. In 1749–55 the Jesuit architect T. Žebrauskas "kupolui suteikė laiptuotą formą" (gave the dome a stepped form). A 1773–74 document describes the lantern with a decorated metal gallery. | KVR §7.1.1.4, §7.5 | [V] |
| Crown | Rebuilt in 1942–43 ("atstatyta kupolo karūna"), which means a crown existed before. In 1864–68 onion helms replaced it. The **1836** Januszewicz view and the **1840** survey drawing both show a crown on the lantern, so a crown fits 1800. | KVR §7.5; lt.wikipedia; drawings in §5.2 | [V] text / [P] visual |
| West towers | "V fasado bokšteliai kvadratiniais pagrindais (**šoniniai bokšteliai pažeminti**, centrinis bokštelis pristatytas 1863-1868 m. …, XX a. vid. sugriautas …)": the towers stand on square bases; the **side towers were lowered**; a central turret was added in 1863–68 and destroyed in the mid-20th century. lt.wikipedia: helms and lanterns were set on the towers by 1755. Views from 1834, 1836 and 1840 show square belfry stages with clock faces and domed caps with lanterns, **so the towers were taller in 1800 than today.** | KVR §7.1.1.4; lt.wikipedia; §5.2 | [V] text / [P] visual |
| West porch | Rebuilt in 1863–68, so the 1800 entrance was simpler (compare the 1836 view) | KVR §7.1.1.4 | [V] |
| Façade | Faces **west onto Didžioji g.** Plastered brick. Three horizontal tiers with pilasters. Gables on the E, N and S façades. | KVR; lt.wikipedia | [V] |
| Dimensions | Dome **55 m high, 17 m in diameter**; crown about 6 m across | lt.wikipedia only | [U] |
| Footprint (OSM way 29503660) | About 1,750 m². Minimum bounding rectangle about **69 × 30 m**, long axis about 80° (E–W). The GRPK polygon merges church and monastery (3,918 m²). | Computed from the seed OSM and GRPK | [V] geometry |

### 5.2 Photos and drawings on Commons

Category: https://commons.wikimedia.org/wiki/Category:Church_of_St._Casimir_in_Vilnius

| View | File | Licence | Author | Pixels |
|---|---|---|---|---|
| W façade | [Crkva svetog Kazimira.jpg](https://commons.wikimedia.org/wiki/File:Crkva_svetog_Kazimira.jpg) | **CC0** | August Dominus | 3060×4080 |
| W façade | [Church of St. Casimir in Vilnius01.JPG](https://commons.wikimedia.org/wiki/File:Church_of_St._Casimir_in_Vilnius01.JPG) | CC BY-SA 3.0 | Alma Pater | 1536×2048 |
| W façade | [Church-Casimir-Vilnius.jpg](https://commons.wikimedia.org/wiki/File:Church-Casimir-Vilnius.jpg) | CC BY 4.0 | acediscovery | 2300×2904 |
| W façade at dusk | [St Casimir Church Exterior At Dusk, Vilnius, Lithuania - Diliff.jpg](https://commons.wikimedia.org/wiki/File:St_Casimir_Church_Exterior_At_Dusk,_Vilnius,_Lithuania_-_Diliff.jpg) | CC BY-SA 3.0 | Diliff | 4500×4425 |
| N (left) side | [Church of St. Casimir in Vilnius1.JPG](https://commons.wikimedia.org/wiki/File:Church_of_St._Casimir_in_Vilnius1.JPG) | CC BY-SA 3.0 | Alma Pater | 2592×1944 |
| N (left) side | [Church of St. Casimir in Vilnius2.JPG](https://commons.wikimedia.org/wiki/File:Church_of_St._Casimir_in_Vilnius2.JPG) | CC BY-SA 3.0 | Alma Pater | 2592×1944 |
| Crown and lantern | [Church of St. Casimir in Vilnius (Wilno) - crown.JPG](https://commons.wikimedia.org/wiki/File:Church_of_St._Casimir_in_Vilnius_%28Wilno%29_-_crown.JPG) | CC BY-SA 3.0 | Pudelek (Marcin Szala) | 1907×2511 |
| Dome | [Cupola of St. Casimir, Vilnius LT.jpg](https://commons.wikimedia.org/wiki/File:Cupola_of_St._Casimir,_Vilnius_LT.jpg) | CC BY-SA 4.0 | Stefano Vigorelli | 2048×1536 |
| Dome | [Vilniaus Šv. Kazimiero bažnyčios kupolas 1.jpg](https://commons.wikimedia.org/wiki/File:Vilniaus_%C5%A0v._Kazimiero_ba%C5%BEny%C4%8Dios_kupolas_1.jpg) | CC BY-SA 4.0 | Stela | 3000×4000 |
| Crown | [Crown (4729577844).jpg](https://commons.wikimedia.org/wiki/File:Crown_%284729577844%29.jpg) | CC BY 2.0 | Chad Kainz | 3000×4000 |
| Dome from the east | [StCasimirVilnius.jpg](https://commons.wikimedia.org/wiki/File:StCasimirVilnius.jpg) | Public domain | Alma Pater | 3072×2304 |
| Elevated, from Gediminas Tower | [Vilnius Gedimino Pilies Bokštas Blick auf Šv. Kazimiero Bažnycia.jpg](https://commons.wikimedia.org/wiki/File:Vilnius_Gedimino_Pilies_Bok%C5%A1tas_Blick_auf_%C5%A0v._Kazimiero_Ba%C5%BEnycia.jpg) | CC BY-SA 4.0 | Zairon | 4582×3087 |
| 1832 plan and elevation | [Vilnia, Jezuicki. Вільня, Езуіцкі (1832).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Jezuicki._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%95%D0%B7%D1%83%D1%96%D1%86%D0%BA%D1%96_%281832%29.jpg) | Public domain | unknown | 965×757 |
| **1836 elevation before the Russian rebuild** | [Vilnia, Vialikaja, Jezuicki. Вільня, Вялікая, Езуіцкі (M. Januševič, 1836).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vialikaja,_Jezuicki._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F,_%D0%95%D0%B7%D1%83%D1%96%D1%86%D0%BA%D1%96_%28M._Janu%C5%A1evi%C4%8D,_1836%29.jpg) | Public domain | Marceli Januszewicz | 621×587 |
| 1837 survey | [Vilnia, Jezuicki. Вільня, Езуіцкі (1837).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Jezuicki._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%95%D0%B7%D1%83%D1%96%D1%86%D0%BA%D1%96_%281837%29.jpg) | Public domain | unknown | 1000×661 |
| **1840 façade survey** (crown, clock towers) | [Vilnia, Vialikaja, Jezuicki. Вільня, Вялікая, Езуіцкі (1840).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vialikaja,_Jezuicki._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F,_%D0%95%D0%B7%D1%83%D1%96%D1%86%D0%BA%D1%96_%281840%29.jpg) | Public domain | unknown | 720×1161 |
| **1870s, the west front after the 1864–68 rebuild** | [Vilnia, Vialikaja, Jezuicki. Вільня, Вялікая, Езуіцкі (1870-79).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vialikaja,_Jezuicki._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F,_%D0%95%D0%B7%D1%83%D1%96%D1%86%D0%BA%D1%96_%281870-79%29.jpg) (State Museum of the History of St Petersburg, 190793) | Public Domain Mark | unknown | 800×596 |
| **20 June 1889, the porch close up** (looking west from the church steps) | [Vilnia, Vialikaja, Jezuicki. Вільня, Вялікая, Езуіцкі (20.06.1889).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vialikaja,_Jezuicki._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F,_%D0%95%D0%B7%D1%83%D1%96%D1%86%D0%BA%D1%96_%2820.06.1889%29.jpg) (*Widoki Wilna i okolic*, Vilnius University Library F46-1537) | PD-old-100 | unknown | 4757×3721 |

Not yet looked at (Commons rate-limited the download): *(S. Fleury, 1896)* and *(M. Butkoŭski, 1896-1914)*, same title pattern.

### 5.3 The c.1900 west front as modelled (rebuilt 30 Sep 2026)

From four owner-supplied images (sources not recorded): **(a)** a c.1900 frontal view from the square; **(b)** a c.1900 view
of the square from the south-west, the church at an angle; **(c)** a German postcard of 1915–18, *Die griechisch-katholische
Kirche in Wilna*, hand-tinted; **(d)** a 3D model of today's church; **(e)** a sharp view from the square,
[pastvu.com/915912](https://pastvu.com/915912) (uploaded by Goharskiy; date and licence not checked, used as reference only);
**(f)** a winter view from the south-west (source not recorded). Checked against the 1870s and 1889 photos above.
`src/world/stcasimir.ts`, variant `photos` (the default).

| Feature | Evidence | Status |
|---|---|---|
| An attic storey across the whole front on the upper cornice (about 3 m): over each tower a block with pedestals on the pilaster lines, a framed panel and a cartouche with an oval window; between the towers and the turret a lower block with a balustrade; a cornice round it | (e), (f): the layer between the towers and the main storeys | [V] |
| Tower tops, on the attic: a narrower stage (about 2 m) with scroll brackets at the corners, garlands and urns; a bell dome about 6 m across; a small open lantern, a ribbed bulb, the cross at about 43 m | 1870s photo, (a), (b), (c), (e); heights scaled from (e) | [V] forms / [U] sizes |
| The towers' upper-storey openings are belfries with bells hanging in them, a balustrade across each | 1870s photo: bells visible in both; (c): the balustrades | [V] |
| The north tower looks taller in the 1870s photo and (a) | (b) shows why: from the square the crossing dome's lantern stands just behind the north tower. The towers are modelled alike | [V] |
| The three middle niches hold painted icons (saints on gold), not statues | (c) shows them in colour; the Orthodox conversion would have removed the Catholic statues. The saints themselves are drawn generically | [V] icons / [U] subjects |
| Central turret (1864–68): square stage about 8 m wide standing forward through the attic, cornice at about 39 m, a tall glazed arched window under a segmental hood between corner pilasters, S-scrolls from the attic up its sides; a dome straight on the cornice with round dormers, a **clock** in the one facing the square, corner urns; lantern, bulb, cross at about 52 m, the highest point of the front | 1870s photo, (a), (e) (heights scaled from the 30 m façade) | [V] forms / [U] sizes |
| Upper-storey arches crowned with small cartouches; composite volutes on the pilaster capitals; garland drops under the lower capitals | (e) | [V] |
| Porch: paired Tuscan columns against a front wall with an arched door and a radiating fanlight, a cartouche over the door | 1889 photo | [V] |
| Porch entablature Doric, with triglyphs | 1889 photo | [V] |
| Porch pediment: broken segmental, a round clock in a scrolled frame rising through the break | 1889 photo (the face is blank there; hands added, set to ten past ten) | [V] form / [U] hands |
| Porch dome: ribbed, a festoon of swags round its base, an open lantern, bulb and cross reaching the first cornice | 1889 and 1870s photos | [V] |
| Ground storey: tower bays blind, with a tall moulded panel and at its head a large cartouche framing an oval window; the bays either side of the porch have tall glazed windows under a smaller such cartouche | 1870s and 1889 photos, (b), (c) | [V] |
| A base of banded rustication in grey stone (`#a39c94`) up to the porch cornice (about 8 m): across the whole front, pilasters included, and round the tower sides, capped by a continuous band | (b), (c): a separate grey banded layer below the pink | [V] form / [U] colour |
| Porch: an arched window in each side wall; on the dome a short lantern under a ribbed, crown-like bulb | (b), (c) | [V] |
| Crossing dome: an open octagonal lantern with tall arched openings under a ribbed bulb and cross (was a plain drum) | (b) | [V] form / [U] sizes |
| Colour, after (c) at the owner's direction: rose walls and pilaster shafts (`#cc958a`); cornices, capitals, frames, cartouches, lanterns and the porch pale (`#ece2d6`); the porch dome near white with darker ribs; helms silver-grey (`#a9b2b7`). (c) is hand-tinted; the black-and-white photos show walls and dressings in one tone, which orthochromatic film of the time would not do for pink on white, so treat the colours as the postcard's, not proven | (c); (a), (b) against | [U] |
| (d), the 3D model of today's church | Used only to check the 18th-century attic stage above the upper cornice; nothing from it is in the game. It shows the post-1942 crown and the lowered towers, so it is not a guide to 1900 | [U] |

---

## 6. Public-domain period views, 1785–1850 (mood only, not for tracing)

- **Licence:** all are tagged on Commons as public domain (mostly `PD-old-100`, or `PD-Art` for paintings); the authors died more than 100 years ago [V, from the API and wikitext].
- **Smuglewicz:** his 1785–86 Vilnius watercolours on Commons do not include a Town Hall view (category checked) [P]. The Town Hall is covered by Peszka, Oziębłowski, Zaleski and others.

| Year | Artist | Subject | File | Pixels | Use |
|---|---|---|---|---|---|
| **1797** | Józef Peszka | **Town Hall and market square** (Vilnius University Library) | [Vilenskaja ratuša. Віленская ратуша (J. Pieška, 1797).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28J._Pie%C5%A1ka,_1797%29.jpg) | 4124×2685 | Finished portico, reddish roof, low market shed, young trees, carriage. Dated 1797 on Commons although works ran to 1799. |
| **1808** | Józef Peszka | **Town Hall and square** | [Vilenskaja ratuša. Віленская ратуша (J. Pieška, 1808).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28J._Pie%C5%A1ka,_1808%29.jpg) | 3950×2572 | Warmer façade colour, row of trees, carriage |
| 1808 | Józef Peszka | Didžioji (Wielka) street | [Vilnia, Vialikaja. Вільня, Вялікая (J. Pieška, 1808) (2).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vialikaja._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F_%28J._Pie%C5%A1ka,_1808%29_%282%29.jpg) · [Vilnia, Vialikaja. Вільня, Вялікая (J. Pieška, 1808).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vialikaja._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F_%28J._Pie%C5%A1ka,_1808%29.jpg) | 4233×2767 · 2000×1616 | Street façades, tile roofs, paving |
| 1785 | Franciszek Smuglewicz | Gate of Dawn | [Vilnia, Vostraja Brama. Вільня, Вострая Брама (F. Smuglevič, 1785-86).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Vostraja_Brama._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%92%D0%BE%D1%81%D1%82%D1%80%D0%B0%D1%8F_%D0%91%D1%80%D0%B0%D0%BC%D0%B0_%28F._Smuglevi%C4%8D,_1785-86%29.jpg) | 3893×2501 | Street life, colours |
| 1785 | Franciszek Smuglewicz | Rūdninkai Gate | [Vilnia, Rudnickaja brama. Вільня, Рудніцкая брама (F. Smuglevič, 1785).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rudnickaja_brama._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%83%D0%B4%D0%BD%D1%96%D1%86%D0%BA%D0%B0%D1%8F_%D0%B1%D1%80%D0%B0%D0%BC%D0%B0_%28F._Smuglevi%C4%8D,_1785%29.jpg) | 3884×2568 | Houses, roofs |
| 1785–86 | Franciszek Smuglewicz | Bernardine street | [Vilnia, Bernardynskaja. Вільня, Бэрнардынская (F. Smuglevič, 1785-86).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Bernardynskaja._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%91%D1%8D%D1%80%D0%BD%D0%B0%D1%80%D0%B4%D1%8B%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%28F._Smuglevi%C4%8D,_1785-86%29.jpg) | 833×555 | Lane character |
| 1785–86 | Franciszek Smuglewicz | Subačius Gate | [Vilnia, Subackaja brama. Вільня, Субацкая брама (F. Smuglevič, 1785-86).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Subackaja_brama._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A1%D1%83%D0%B1%D0%B0%D1%86%D0%BA%D0%B0%D1%8F_%D0%B1%D1%80%D0%B0%D0%BC%D0%B0_%28F._Smuglevi%C4%8D,_1785-86%29.jpg) | 800×573 | Edge of town |
| 1785–86 | Franciszek Smuglewicz | University great courtyard | [Universiteto kiemas.jpg](https://commons.wikimedia.org/wiki/File:Universiteto_kiemas.jpg) | 579×328 | Plaster and arcades |
| 1812 (painted before 1840) | Jan Damel | French retreat on the Town Hall square | [Ян Дамель. Отступление французов через Вильно.jpg](https://commons.wikimedia.org/wiki/File:%D0%AF%D0%BD_%D0%94%D0%B0%D0%BC%D0%B5%D0%BB%D1%8C._%D0%9E%D1%82%D1%81%D1%82%D1%83%D0%BF%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5_%D1%84%D1%80%D0%B0%D0%BD%D1%86%D1%83%D0%B7%D0%BE%D0%B2_%D1%87%D0%B5%D1%80%D0%B5%D0%B7_%D0%92%D0%B8%D0%BB%D1%8C%D0%BD%D0%BE.jpg) · [French Army in the Town Hall Square of Vilnius.Lithuania.1812.jpg](https://commons.wikimedia.org/wiki/File:French_Army_in_the_Town_Hall_Square_of_Vilnius.Lithuania.1812.jpg) | 800×534 · 456×330 | Square and buildings c.1812 |
| 1812 (19th c.) | Vasily Timm | Same subject | [Vilnia, Rynak. Вільня, Рынак (V. Timm, 1812).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rynak._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%8B%D0%BD%D0%B0%D0%BA_%28V._Timm,_1812%29.jpg) | 821×616 | — |
| 1834 | Józef Oziębłowski | Didžioji from the square, St Casimir's towers | [Vilnia, Rynak-Vialikaja. Вільня, Рынак-Вялікая (J. Aziambłoŭski, 1834).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rynak-Vialikaja._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%8B%D0%BD%D0%B0%D0%BA-%D0%92%D1%8F%D0%BB%D1%96%D0%BA%D0%B0%D1%8F_%28J._Aziamb%C5%82o%C5%ADski,_1834%29.jpg) | 1261×508 | Tall pre-1864 towers |
| c.1835 | Józef Oziębłowski | Town Hall (4 versions) | [Vilenskaja ratuša. Віленская ратуша (J. Aziambłoŭski, 1835) (4).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28J._Aziamb%C5%82o%C5%ADski,_1835%29_%284%29.jpg) | 3401×2389 | Paving, trees, fence |
| 1835 (after 1763) | Marceli Januszewicz after P. de Rossi | The **pre-1781** Town Hall with its tower. Not the 1799 look. | [Vilenskaja ratuša. Віленская ратуша (P. Rossi, 1763).jpg](https://commons.wikimedia.org/wiki/File:Vilenskaja_ratu%C5%A1a._%D0%92%D1%96%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%D0%B0%D1%8F_%D1%80%D0%B0%D1%82%D1%83%D1%88%D0%B0_%28P._Rossi,_1763%29.jpg) | 2008×1612 | Info-point history only |
| 1836 | Marceli Januszewicz | St Casimir's before the rebuild | see §5.2 | 621×587 | — |
| 1845 | anonymous lithograph (Lithuanian National Museum) | Town Hall and market | [Vilnia, Rynak. Вільня, Рынак (1845).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rynak._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%8B%D0%BD%D0%B0%D0%BA_%281845%29.jpg) | 2078×1281 | Possibly an *Album Wileńskie* plate [U] |
| before 1862 | anonymous (Biblioteka Narodowa G.66766) | Town Hall | [Vilnia, Rynak. Вільня, Рынак (1845, 1862).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rynak._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%8B%D0%BD%D0%B0%D0%BA_%281845,_1862%29.jpg) | 1648×2480 | — |
| c.1846 | Marcin Zaleski | Town Hall, oil (National Museum, Warsaw) | [Zaleski Town Hall in Vilnius.jpg](https://commons.wikimedia.org/wiki/File:Zaleski_Town_Hall_in_Vilnius.jpg) · [Zaleski Town Hall in Vilnius (detail).jpg](https://commons.wikimedia.org/wiki/File:Zaleski_Town_Hall_in_Vilnius_%28detail%29.jpg) | 765×550 · 1224×1632 | Colour: ochre walls, red roof, St Casimir's towers |
| 1846 | Victor Adam | French retreat of 1812 at the Town Hall, lithograph | [Vilnia, Rynak. Вільня, Рынак (V. Adam, 1846) (2).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rynak._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%8B%D0%BD%D0%B0%D0%BA_%28V._Adam,_1846%29_%282%29.jpg) | 6176×4824 | Highest resolution; also two other versions |
| 1851 | William Floyd | Town Hall, engraving | [Vilnia, Rynak. Вільня, Рынак (W. Floyd, 1851).jpg](https://commons.wikimedia.org/wiki/File:Vilnia,_Rynak._%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F,_%D0%A0%D1%8B%D0%BD%D0%B0%D0%BA_%28W._Floyd,_1851%29.jpg) | 1243×916 | Just outside the range |
| 1845–1875 | ed. Jan Kazimierz Wilczyński | ***Album Wileńskie*** (3 vols of plates) | Polona: https://polona.pl/item/album-wilenskie,NTU1Mjg4NA/ · Commons: https://commons.wikimedia.org/wiki/Category:Album_Wilenskie_(1845-1875) (231 scans, `PD-anon-expired`) | up to about 6800 px | I have not picked out the Town Hall plates [U] |

---

### 6.1 The rendering guide: four views of the square supplied by the user (26 Sep 2026)

All four look at the portico from the north-west, down the square towards St Casimir's and the Gate of Dawn.
They are the visual reference for everything rendered around the square. The 1842 plan
(`tools/reconstruction/README.md`) fixes positions; the views fix the look.

| # | View | Identified as | Date weight |
|---|---|---|---|
| 1 | Oil, warm evening light, stone posts with rails, steps to the portico | **Marcin Zaleski, c.1846**, National Museum, Warsaw (`Zaleski Town Hall in Vilnius.jpg`, §6) | Later: use for colour and materials |
| 2 | Engraving, same viewpoint, open square, post-and-rail fence | Mid-19th-century print, probably the 1845 lithograph or W. Floyd 1851 (§6) [U] | Later |
| 3 | Watercolour: fenced walk with **young trees**, a **long low booth** with a tiled hip roof west of the portico, a carriage | **Józef Peszka, 1797**, Vilnius University Library (§6) | **Closest to 1800: wins any conflict** |
| 4 | Oil copy after Zaleski, signed, undated | Later copy; mood only (may still be in copyright, not to be reproduced) | — |

What the scene takes from them, and where it is implemented:
- **Promenade in front of the portico** (`src/world/promenade.ts`). The enclosure is as wide as the portico and runs
  straight on from it for about 140 m, with a rounded north end and a well (1842 plan). It has **stone posts with
  two timber rails** (views 1, 2, 4), **one row of young trees inside each fence** (view 3; the 1842 plan shows them
  grown), and a sandy gravel walk.
- **Market booth** west of the portico (view 3): long, low, limewashed, tiled hip roof, open timber front facing
  the promenade. Position is conjecture (grade C).
- **Colours:** warm cream-to-ochre plaster and red-brown tile roofs (1, 3); the Town Hall pale warm stone (3) to
  golden in low sun (1). Paving is dusty and sandy, not grey (all four): ground tint `#f2e2c4`.
- **St Casimir's** reads above the east side of the square with its dome, crown and two towers (1, 4), as modelled.
- **Still to do from the views:**
  - arcaded ground-floor shops on the east side of the square (1, 4);
  - people and carriages (all four; M5);
  - warm late-afternoon light as a preset (1).

## 7. Credit lines ready for CREDITS.md

- **Poly Haven textures:** "<asset name> by Poly Haven (polyhaven.com), CC0". Credit is optional; list them anyway.
- **ambientCG:** "<ID> from ambientCG.com, CC0".
- **Freesound:** "<title> by <user> (freesound.org/s/<id>/), CC0".
- **Kenney:** "Impact Sounds / RPG Audio by Kenney (kenney.nl), CC0".
- **Quaternius:** "<pack> by Quaternius (quaternius.com), <licence shown at download: CC0 or QAL v1.0>, downloaded <date>".
- **KayKit:** "KayKit Adventurers by Kay Lousberg (kaylousberg.com), CC0".
- **Commons photos:** these are only needed if a photo is displayed. Use "<file> by <author>, <licence>, via Wikimedia Commons".
- **GRPK:** "GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, 2026", CC BY 4.0.
- **KVR text:** "Kultūros vertybių registras (kvr.kpd.lt)", CC BY 4.0 (assumed, per data.gov.lt dataset 2192).

## 8. Open questions and things to check

1. **Town Hall height:** no published figure. Confirm the eaves (about 13–14.5 m) and the ridge with LiDAR.
2. **Side façades:** the design shows 6 bays with 2 gateways. Count the bays of the built building on a clear side photo.
3. **Steps and pediment:** the form of the 1799 front steps is unknown, and so is whether the pediment relief existed in 1799.
4. **Roof extras:** find the dates of the S mezzanine and the 5 dormers.
5. **St Casimir's towers:** establish their exact height in 1800 from Peszka 1808 and Oziębłowski 1834 at full resolution.
6. **UAL clip names:** check them after downloading. Record the Quaternius licence shown on the day of download.
7. **Sounds:** audition each one for engines, music, PA and intelligible modern speech before use.

## 9. Sources consulted

| Short name | What | URL |
|---|---|---|
| KVR | Kultūros vertybių registras, records 678 (Town Hall) and 27304 (St Casimir's), from the seed JSON | kvr.kpd.lt (search by unique code) |
| VLE | Visuotinė lietuvių enciklopedija, "Vilniaus rotušė" | https://www.vle.lt/straipsnis/vilniaus-rotuse/ |
| KPD brochure | Kultūros paveldo departamentas, *Lietuvos klasicistinė architektūra / Classicism in Lithuanian Architecture* (PDF, LT and EN) | https://www.kpd.lt/uploads/EN/Heritage%20in%20Lithuania/Heritage%20in%20Lithuania/1_CLASSICISM_IN_LITHUANIAN_ARCHITECTURE.pdf |
| lt.wikipedia | "Vilniaus rotušė"; "Vilniaus šv. Kazimiero bažnyčia" | https://lt.wikipedia.org/wiki/Vilniaus_rotu%C5%A1%C4%97 · https://lt.wikipedia.org/wiki/Vilniaus_%C5%A1v._Kazimiero_ba%C5%BEny%C4%8Dia |
| LNDM | Lithuanian National Museum of Art, "31 Didžioji Street – Vilnius Town Hall" | https://www.lndm.lt/en/didzioji-street/31-didzioji-street-vilnius-town-hall/ |
| Wikidata | Q1257109 (Town Hall) and Q1539380 (St Casimir's). They hold no dimensions. | https://www.wikidata.org/wiki/Q1257109 · https://www.wikidata.org/wiki/Q1539380 |
| GRPK / OSM | Seed files `grpk/grpk_pastat_oldtown_epsg3346.geojson` and `osm/overpass_oldtown_bbox_2026-09-26T1341Z.json` | — |
| Quaternius licence | QAL v1.0 page | https://quaternius.com/license.html |
| Poly Haven / ambientCG APIs | Resolution lists | https://api.polyhaven.com/files/<id> · https://ambientcg.com/api/v2/full_json?id=<ID>&include=downloadData |
| Commons API | File licences, authors, sizes | https://commons.wikimedia.org/w/api.php (prop=imageinfo, extmetadata) |
