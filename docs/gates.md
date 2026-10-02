# The Vilnius city gates — research brief

Version 0.6 · 2026-10-02 · status: **research brief; all ten gates are on the map (§2); all nine lost gates are modelled (§8–10), three of them standing in the walk's world**

The old city wall and its gates, meant to be rebuilt in the game. Tags follow `docs/REFERENCES.md`:
**[V]** verified against a cited source, **[U]** unverified or a design choice.

## 1. The wall

- Built **1503–1522**, against Crimean Tatar raids. [V] ¹ ²
- Almost **2.5 km** long ("beveik pustrečio kilometro"), **up to 10–12 m** high, with **five towers**
  at first. [V] ¹
- Russian-appointed city administrators demolished it bit by bit from **1799**. The last gate on
  the list below came down in **1804**. [V] ¹ The Castle Gate came down later, c. 1837 (⁸ ¹⁴, §2), and one source
  puts the Bernardine Gate at 1869 ¹⁰; either way, all but the Gate of Dawn were gone by 1900 (§2).
- **Only the Gate of Dawn survives**, together with the 17th-century **artillery bastion** (Bastėja)
  by the Subačius Gate, restored 1966 and a museum since 1987. [V] ¹ ²
- Number of gates: the Lithuanian article gives **ten** ¹, the English one **nine** ². The difference
  is probably the Wet Gate, walled up in 1677 [U, inference].

## 2. The gates, clockwise from the Gate of Dawn

Every gate is drawn on the in-game map (2026-10-02): `src/world/citygates.ts` holds the sites, `src/ui/map.ts`
draws them. Frame: `X = E − 583000, Z = −(N − 6061000)`, metres, +Z south; the Town Hall is at (−7, 56).
"Within" is about how far the true site may lie from the point. Where the heritage register says the site has
never been found ⁷, the map draws a dotted ring of that size round it, not a point.

| # | Gate | Where it stood | Fate | On the map (x, z), within |
|---|---|---|---|---|
| 1 | **Aušros (Medininkų) vartai**: Gate of Dawn, Aštrieji (Sharp), Krėvos | Aušros Vartų g.: the gatehouse stands (OSM way 112746030) [V] | **Standing**, saved by the chapel over it ¹ ⁷ | (170.9, 468.9), exact. Filled |
| 2 | **Rūdninkų vartai** | Rūdninkų × Pylimo ¹; its lower part survives under the street ¹³ [V] | Pulled down 1800 ¹ ¹³ | (−239.3, 346.7), 10 m. **Built, standing (§9)**: drawn as its plan |
| 3 | **Trakų vartai** (the main gate ²) | In the gap still left between Pylimo g. 22 and Trakų g. 2, where the wall ran and the Kačerga stream flowed ⁷ [V]. Near Trakų × Pylimo ¹ | 1803–04: its icon was moved in 1803 ⁷; the tower was pulled down in 1804 ¹ | (−575, −181), 10 m. Modelled (§10) |
| 4 | **Vilijos (Vilniaus) vartai** | Benediktinių × Šv. Ignoto ¹. The English article ² says "Vilnius and Bernardinai", a street pair that doesn't meet; read as a slip [U]. The wall stretches Totorių–Vilijos and Vilijos–Trakų are registered ⁷ | Pulled down 24 Nov 1802 ¹; its icon went to the Subačius g. orphanage chapel ⁷ | (−381, −462), 15 m. Modelled (§10) |
| 5 | **Totorių vartai** (Tatar) | East side of the Benediktinių × Totorių crossing ¹ ⁷ [V]. ² says Liejyklos × Totorių, 30 m away | Ordered down 1802 ¹ | (−284, −513), 10 m. Modelled (§10) |
| 6 | **Šv. Marijos Magdalenos (Šlapieji) vartai**: the Wet Gate | L. Stuokos-Gucevičiaus × Universiteto ¹, by Cathedral Square ²; **never located on the ground** ⁷ [U]. Small, one storey, hipped roof; served Lukiškės and Puškarnė and the bridge over the Kačerga ⁷ | **Walled up 1677** ¹ ⁷; gone with the wall | (−87, −714), 40 m ring. The register's strip along the wall ends here. Modelled (§10) |
| 7 | **Pilies vartai** (Castle) | The head of Pilies g., at the bridge over the Vilnia's channel (now Šventaragio g.), where the city wall met the Lower Castle's; granite blocks at the edge of Cathedral Square mark it ⁸ ¹⁴ [V] | **c. 1837** ⁸, with the courts building beside it ¹⁴, when the castle site was cleared for the fortress (1831–37) ¹⁴ [V]; "early 19th c." ¹ | (144, −692), 10 m. On the castle site's south edge (below). Modelled (§10) |
| 8 | **Bernardinų vartai** | South of the Bernardine church, by the bridge over the Vilnia, where Mickiewicz's monument stands ¹⁰ (after Drėma); **exact site never established** ⁷. In 2004 a tower that guarded its east side was dug up in the SW part of the church's outbuilding ⁷. The register's strip ends some 60 m east of the monument [U] | Early 19th c. ¹; 1869, for Maironio g. ¹⁰. Sources differ [U] | (425, −463), 40 m ring, taking in both. Modelled (§10) |
| 9 | **Išganytojo (Spaso) vartai**: Saviour's | By the Užupis bridge, beside a small church of the Saviour near the Orthodox cathedral, on the road to Polotsk ¹¹; at the end of Išganytojo g. Wikidata's point ¹² (no source given) is 24 m from the bridge. **Not investigated** ⁷ [U] | 1801 ¹; its round tower c. 1806 ⁷ | (320.8, −228.8), 30 m. **Built, standing at the world's edge (§10)**: drawn as its plan |
| 10 | **Subačiaus vartai** | Bokšto × Subačiaus × Strazdelio ¹ [V] | Pulled down from **27 May 1801** ³ | (328, 239.5). **Built, standing, at the end of the walk (§8)**: drawn as its plan |

**A check:** the register protects a strip of ground along the whole wall (KVR 39 ⁷, its polygon is in the seed).
Drawn on the map, it runs through the Trakai, Vilija, Tatar, Rūdninkai, Dawn, Subačius and Saviour's sites as
placed above from street corners and articles, and ends at the Wet Gate and by the Bernardine site. The map shows it
as the line of the wall [V for the strip; that it is the wall's exact width is not claimed]. The register says the
wall can be traced almost all the way round, except from O. Šimaitės g. to the Bernardine Gate ⁷.

**The castles.** The city wall closed on the castles. The Lower Castle and the Upper Castle on the hill stood on
their own ground beyond the Vilnia's left channel (filled in in the 19th c.; now Šventaragio g.) ⁸, the Lower Castle
"at least in part" walled with towers, in a large and a small enclosure, from the 14th c.; its outline is marked
in Cathedral Square's paving with reddish granite ¹⁴. [V] The register's castle site (KVR 141 ¹⁵) has the Wet Gate
on its south-west corner, where the city wall's strip ends, and the Castle Gate on its south edge. The map draws
that site's edge as the castles' line [V for the site; the walls themselves ran inside it, U], and what stands of
the Upper Castle's walls (OpenStreetMap barrier=city_wall) firmer. The Bernardine monastery, in the Vilnia's loop,
was fortified and built into the city's and the castles' defences ¹⁴: it closed the ring between the Bernardine
Gate and the castles. Its church was built into the city wall in the early 16th century and has gun-ports in its
walls ¹⁶ [V]. The register's strip along the city wall ends at the Bernardine Gate, against the south-east corner of
the Bernardine ensemble's territory ⁷ ¹⁷; the map carries the line on along that territory's east side, the side
facing the Vilnia, to its northern tip, and from there along a wall that still stands (OpenStreetMap way
111764028) to the castle site's edge (`tools/build-oldtown.mjs`). That the monastery's defence ran on its river side
and along that wall is [U], about 25–30% likely as drawn: the line follows today's enclosure (a modern protection
boundary) and a wall OpenStreetMap tags only as barrier=wall, undated, not a survey of the 16th-century defence. So
the map draws this stretch dashed, "about here". The 1648 Getkant and 1740 Fürstenhoff plans would settle it. (The stretch the register says it cannot locate is a different one, from O.
Šimaitės g. to the Bernardine Gate; its strip there follows the route schemes of Katilius, Klimavičienė and
Bitovtas, 1998 and 2006 ⁷.)

**The sources disagree** on the Tatar and Vilija gates (above); the Lithuanian article and the register agree on
the Tatar Gate, so that one is settled. The Subačius corner is settled too: the two surviving stretches of wall in
OpenStreetMap (ways 194601579 and 1386286057) end either side of Subačiaus g. at the Bokšto corner, 12 m apart, and
the gate's remains lie under the street there ¹ ⁵. [V]
The register counts the gates of the early 17th c. as ten: Pilies, Marijos Magdalietės, Totorių, Vilijos, Trakų,
Rūdninkų, Medininkų (Aušros), Subačiaus, Išganytojo, Bernardinų ⁷ ⁹. Five were built first (1503–22) ⁷. [V]

## 3. The problem with 1900

The game is set around 1900. By then **nine of the ten gates had been gone for about a century**.
Only the Gate of Dawn and the bastion stood. Rebuilding all the gates in the c. 1900 square would put
them in the wrong century. The same applies to the budelis, whose Subačius Gate came down in 1801.

Two honest ways to do it. Both use the same models:

1. **Ghost gates (recommended first).** Keep 1900, and show each lost gate as a faint reconstruction
   where it stood, like a glass-plate image laid over the present. This fits *Vilnius Obscura* and the
   documentary angle, and it gives the budelis's gate a place in the 1900 city.
2. **A pre-1799 era.** A second version of the city in which the wall and gates really stand. The
   light presets are already dated 1800, and `stcasimir.ts` has an `'1800'` variant, so part of the
   ground is laid. [U, design]

Build the geometry once and render it both ways.

**Decided for the Subačius Gate (owner, 2026-09-30):** neither of the two. It stands whole in the 1900 city, with
the wall either side, as it was before 1801: a deliberate anachronism, for the look of the thing. The ghost is kept
as an option (`?gate=ghost`). [U, design]

## 4. Scale

Every gate sits on the edge of the Old Town. The nearest ones are about 370–380 m from the Town Hall,
and the northern ones are beyond the map data. Rebuilding the gates really means extending the city
from a 110 m walk to the whole Old Town: new map data north of Cathedral Square, more buildings,
longer draw distances. The gates are the smaller part of that job.

## 5. Evidence to find

- The 1842 and 1866 plans in `tools/reconstruction/src/` **postdate the demolition**. At best they
  show where the wall ran.
- Needed: pre-1799 city views and 18th-century plans showing the gates themselves. [U, research]
- The Gate of Dawn and the bastion survive and can be surveyed. They give the scale, materials and
  detailing for the lost gates. [U, design]

## 6. The knygnešys and the gates

**The gates and the book ban never overlapped.** The last gate came down in 1804 (by most sources, §1) and the ban began in
1864. [V] ¹ ⁴ In 1902 the only gate the courier can walk under is the Gate of Dawn. But the roads into
the Old Town still run through the old gate sites, so the story is **which gate road he comes in by**.
[U, design]

With ghost gates, the player sees the gate that used to stand at each of those points. The overlay
then becomes part of the story, not decoration.

Measured on the game's street graph to the St Nicholas attic (see `docs/characters/knygnesys.md`):

| Gate road | To the attic | Through the square | Character |
|---|---|---|---|
| **Trakai** (the main gate ²) | ~249 m, 3.5 min | 0 m | Shortest, and it comes from the west, the direction the books travel from. So it's the obvious way in, and the one worth watching. [U] Measured before the site was placed (§2: the gap between Pylimo g. 22 and Trakų g. 2); recheck |
| **Rūdninkai** | 383 m, 5.3 min | 0 m | The quiet one, along the edge of the Jewish quarter |
| **Subačius** | 810 m, 11.3 min | 170 m | The budelis's gate, gone since 1801 but remembered. Crosses the square |
| **Gate of Dawn** | 841 m, 11.7 min | 170 m | The long way, and the only gate still standing: he passes under the chapel, among pilgrims. Crosses the square |

Times are at 1.2 m/s, walking with a load. The pre-1799 era has no knygnešys at all, because the ban
came 60 years later. The two versions of the city tell separate stories.

## 7. Open questions

1. Settle the Vilija Gate against old plans (the 1648 Getkant plan, the 1808 plan). (Tatar and Subačius: settled, §2.)
2. Narrow the Wet, Bernardine and Saviour's sites, which the register says were never found on the ground. The
   Getkant and Fürstenhoff plans it cites are the place to start.
3. What did each gate look like? Tower gate or plain passage, roofs, heraldry?
4. Ghost gates, the pre-1799 era, or gates standing out of their time? The Subačius Gate stands, with the wall,
   by the owner's choice (§3, §8); `?gate=ghost` shows the ghost. Whether the other gates follow is open.
5. How far should the walkable city grow, and in what order? The walk now reaches the Subačius site. Rūdninkai
   is the next nearest.
6. Were there police or toll posts on the roads into the city around 1902? That decides which gate
   road is dangerous.

## 8. The Subačius Gate as built (2026-09-30)

The walk runs from the square down Didžioji g. and along Subačiaus g. to the Bokšto corner, where the gate
stood, and a few steps down Šv. Dvasios g. outside the wall. The code is `src/world/subacius.ts`; the walk's shape
is `WALK_SHAPES` in `tools/build-area.mjs`.

**What the sources say** [V]:
- Built with the wall in 1503–22, first named in 1528, rebuilt in the 17th century; it stood over a deep,
  spring-fed ravine that served as its moat. On the road to Vitebsk, Polotsk, Smolensk and Moscow. ⁵ ³
- Massive, **rectangular in plan, with a saddle roof and round corner towers, at least three storeys**. Round
  cannon ports on the second floor. Near the top, **two rows of close-set upright loopholes**; the lower row sits
  on a course projecting only 15 cm, long read as machicolations. A cornice, **two rectangular niches** and
  **pilasters beside the barrel-vaulted passage**. ⁵ (from P. Smuglevičius's drawings of 1785 and the archaeology)
- The gate "protruded" from the wall, for frontal and flanking fire. North of it stood the artillery tower,
  rebuilt in the 17th century as the bastion. ⁵
- Demolition was ordered in 1799, began in 1801 (27 May ³) and was complete by September 1802; it gave 48,000
  whole bricks. The lower north-east corner with part of its tower's foundation survives, and a stretch of
  the wall to the south with one loophole. ⁵
- The drawing: P. Smuglevičius, 1785–86, the gate from outside with the wall running off to one side ⁶.

**What is a design choice** [U]:
- Place and size: the block fills the 12 m gap between the two wall stretches (§2), on the street's line, 10 m
  deep and 12 m wide, its west face on the wall line and its two towers (6 m across) on the field corners, clear
  of Subačiaus g. 16 (built 1775, KVR). The passage is 3.6 m wide. Walls 13 m to the eaves, the roof rising 7.2 m,
  the towers 14 m with 5.8 m cones. All read off the drawing; nothing measured.
- The wall either side: 10 m high, 1.8 m thick, with a parapet of loopholes and a lean-to roof over the wall walk
  (the drawing shows a roofed wall; the sources say "covered galleries" ¹). Each stretch is bonded 2.5 m into the
  gate's masonry and leaves it through the gate's side, where a doorway opens onto the wall walk; the gallery roof
  stops against the side. The south stretch is swung by under a metre at the gate (about its far end) so that it
  leaves through the side and not along the west face, as the OSM line would have it.
- The finish: lime render over brick, worn through to the brick in patches and damp at the foot; a fieldstone
  footing; clay tile; plank leaves with iron straps, standing open. A guess from the drawing's light walls and dark
  roofs and from the gate and wall that survive in Vilnius.
- **1900: the gate stands** (owner's choice, 2026-09-30), whole, with the wall either side at full height, as it
  was before 1801. It was not there in 1900: this is a deliberate anachronism, not a claim. It blocks the walker like
  any building; the road goes through the passage.
- `?gate=ghost` (or `#ghost`) shows instead the ghost: the gate drawn in pale ink over the street where it stood (a
  wash on its faces, its lines), rising out of the cobbles, thinning in the mist and when walked into, not stopping
  the walker; the two wall stretches stand as ragged brick remnants about 4 m high, where OpenStreetMap has them
  today (that they stood like this around 1900 is a guess).
- `gate.html` shows the model on its own (the same code and materials, on level ground, in clear daylight, without
  the rain, the mist or the painted look), to be turned round; its caption repeats the sources above.

**Still open:** what the gate's field front looked like in detail (the drawing is small); whether the road
through it ran straight east, as Subačiaus g. does now; the 1900 name of the street (ROADMAP open question 4).

## 9. The Rūdninkai Gate as built (2026-10-02)

At the end of Rūdninkų g., where it meets Pylimo g. ("Rampart Street"); the road through the gate runs on as Šv.
Stepono g. towards the cattle market and the Grodno road. The code is `src/world/rudninkai.ts`. Outside the walk for
now: it is seen from the town round about, and in `gate.html#rudninkai`.

**What the sources say** [V]:
- Built with the wall in 1503–22, first named in 1557; the representative gate of the 16th–18th c., on the road
  from Poland, the rulers' way in along Rūdninkų, Didžioji and Pilies streets ¹³ ⁷ ⁸.
- First like the Gate of Dawn: one block, about three storeys and a roof, the passage on the ground floor; a niche
  for the guard in the passage's south wall (archaeology) ¹³. The tower was three and a half storeys ⁷.
- In 1675–79 a long barbican was built onto its west front, on the rampart of 1648 ⁷; two storeys ⁷ ¹³.
- P. Smuglevičius drew it in 1785 ¹⁸: a massive two-part building, the barbican of two storeys and the tower much
  taller; cornices in rhythm; round cannon ports on the barbican's second floor and the tower's fourth ¹³.
  Loopholes for hand weapons are not drawn: perhaps walled up, as at the Gate of Dawn ¹³.
- Pulled down illegally in 1800, its bricks sold off; the lower part survives under the street ¹³ ¹.

**What is a design choice** [U]:
- Place: the tower at the end of Rūdninkų g., 1 m out from the crossing and 1.5 m south-east of the street's line,
  to clear the house at Pylimo g. 46; the barbican across Pylimo g. into the mouth of Šv. Stepono g., where nothing
  stands today. The road's line is Rūdninkų g.'s last stretch; the wall's, Pylimo g., nearly square to it.
- Sizes read off the drawing: the tower 12 m along the wall and 9.5 m deep, 18.5 m to its eaves, a low hipped roof
  rising 2.4 m; the barbican 15 m long and 10 m wide, 7.2 m to its eaves, hipped at its outer end and running into
  the tower; a passage 3.6 m wide. String courses at 9.5 m and 14.1 m on the tower and 3.6 m on the barbican;
  four round ports a face under the tower's cornice (three on the sides); three a side on the barbican and one over
  its gateway; small windows. Nothing measured.
- The finish is the Subačius Gate's (§8), the render a little more worn (the drawing shows cracks and patches).
- The wall either side runs along Pylimo g. until it meets a house that stands on its line today, as the surviving
  stretches do, or for 24 m and broken off; about 8 m to its parapet (the register gives about 6.5 m ⁷), with the
  gallery roof of §8.
- **1900:** it stands, like the Subačius Gate (§3, §8); `?gate=ghost` draws both as ghosts.

**Still open:** the barbican's length and width (the drawing shows one side, at an angle); whether its gateway was
on the road's line or turned, as barbicans often were; what the tower's town front looked like (not drawn).

## 10. The seven other lost gates as built (2026-10-02)

The Trakai, Vilija, Tatar, Wet, Castle, Bernardine and Saviour's gates, built on one kit: `src/world/towergate.ts`
(a gate block with its passage, a hipped or saddle roof with plain or Baroque gables, string courses, a footing,
ports, windows and icon niches, an optional barbican or flanking tower, a walled-up passage, and the wall either side
with its gallery, as in §8–9) and one specification each in `src/world/lostgates.ts`. The Rūdninkai Gate (§9) is now
a specification on the same kit and looks as before. All are at `vilnius.gg/gates` (`#trakai`, `#vilija`, `#tatar`,
`#wet`, `#castle`, `#bernardine`, `#saviour`). Only the Saviour's Gate stands in the walk: the world loads houses
450 m round the Town Hall, and the others lie beyond that. The map draws it as its plan; the rest keep their open
markers. No picture survives of any of the seven except the Wet Gate's north side in Smuglevičius's panorama, so
far more here is a design choice than at the Subačius and Rūdninkai gates.

**What the sources say** [V]:
- **Trakai:** in the gap still left between Pylimo g. 22 and Trakų g. 2, where the Kačerga ran along the wall; adorned,
  like the Gate of Dawn, with saints' images; the Virgin's hung on the town side and went to the Franciscans in 1803 ⁷.
  Two storeys, Baroque, a saddle roof, few gun ports, rich window surrounds ².
- **Vilija:** named from 1555; led to the Neris and on to Ukmergė; an image of the Virgin, moved in 1802 to the
  orphanage chapel on Subačiaus g. ⁷. Pulled down 24 Nov 1802 ¹.
- **Tatar:** east of the Benediktinių × Totorių crossing; at the end of the 18th c. a tower of three storeys under a
  tiled roof ⁷.
- **Wet:** small, one storey, a hipped roof, an arched gateway with two gun ports either side; served the Lukiškės
  and Puškarnė suburbs and the bridge over the Kačerga; walled up in 1677; its north side is in Smuglevičius's 1785
  panorama; its site never found ⁷ ¹.
- **Castle:** the Lower Castle's south gate tower; given to the district's nobles in 1611, repaired and enlarged for
  the land and castle courts; pulled down in 1837 with the court house built beside it in 1786–1812; granite blocks
  in the paving mark it ¹⁴ ⁸.
- **Bernardine:** first named in 1593; its site never established; in 2004 the footings of a square tower, 6.5 × 8.8 m
  outside, walls 1.7–2 m thick, laid north-east to south-west, were found in the south-west part of the Bernardine
  church's outbuilding: it guarded the gate's east side ⁷.
- **Saviour's:** built in the first stage (1503–22), rebuilt by the burgomaster Jokūbas Gibelis in 1624 ⁷ and again in
  1799; said to be ornate; no picture survives ¹¹.

**What is a design choice** [U]:
- **Sites.** Each stands at its point in §2, square to the register's strip along the wall where that runs straight
  there (Vilija, Tatar), or to the street through it (Trakai, Wet, Castle, Saviour's), and moved where a house stands
  on the point today: the Trakai Gate 13 m east and 4 m south, into the gap between the two houses; the Vilija Gate
  5.5 m along the wall, off the house south-east of Šv. Ignoto g.; the Bernardine Gate onto Šv. Brunono Bonifaco g.,
  some 20 m from its map point, so that its tower falls on the south-west corner of the building at the register
  strip's end, read as the outbuilding where the tower was found. Which building that is, and so where the gate was,
  is a guess.
- **Forms.** Trakai: a two-storey block 15 × 7 m, a steep saddle roof along the wall with plain gables, pilasters,
  rich surrounds, the Virgin's niche on the town front and a saint's on the field front, a cross on the ridge for
  the chapel ². Vilija: a tower 11 × 8.5 m, 14 m to the eaves, the Virgin's niche over the arch on the town side.
  Tatar: a narrower tower, 13 m to the eaves, three storeys between string courses, slits on the field side, a
  steeper tiled hip. Wet: 9 × 6 m, 9.4 m to the eaves, a tall arch walled up in bare brick, two ports either side.
  Castle: a broad block of three floors, 18 × 11 m, rows of windows, a court house more than a tower. Bernardine: a
  small gate block with the found tower beside it on the field side, 12 m to its eaves. Saviour's: a block 12 × 9 m
  under a saddle roof along the road, with Baroque gables front and back (volutes, finials, an oculus), pilasters,
  rich surrounds and an image of the Saviour in a niche over each arch, a design in the manner of 1624, not a record.
- The images in the niches are plain gilt panels: what they showed is known only for Trakai and Vilija (the Virgin).
- The finish is §8's: lime render over brick, worn more or less by gate; the wall either side as in §9, to a house or
  24 m (12 m at the Castle Gate) and broken off.
- **1900:** the Saviour's Gate stands, like the Subačius and Rūdninkai gates (§3); `?gate=ghost` draws all three as
  ghosts.

**Still open:** the 1648 Getkant and 1740 Fürstenhoff plans would give footprints for all seven; the Bernardine
Gate's road (east over the Vilnia, as here, or north to the monastery); whether the Castle Gate's tower kept a roof
of its own or sat under the court house's.

## Sources

1. [Vilniaus gynybinė siena (lt.wikipedia)](https://lt.wikipedia.org/wiki/Vilniaus_gynybin%C4%97_siena)
2. [Wall of Vilnius (en.wikipedia)](https://en.wikipedia.org/wiki/Wall_of_Vilnius)
3. [Subačius Gate (en.wikipedia)](https://en.wikipedia.org/wiki/Suba%C4%8Dius_Gate)
4. [Lithuanian press ban (en.wikipedia)](https://en.wikipedia.org/wiki/Lithuanian_press_ban)
5. [Subačiaus vartai (VSAA, vsaa.lt; the source the English article cites)](https://vsaa.lt/sena/subac_v.html)
6. [P. Smuglevičius, the Subačius Gate, 1785–86 (Wikimedia Commons, public domain)](https://commons.wikimedia.org/wiki/File:Suba%C4%8Dius_gate.Vilnius.Lithuania.jpg)
7. [Vilniaus miesto gynybinių įtvirtinimų liekanų kompleksas, KVR 39 (Kultūros vertybių registras, Kultūros paveldo departamentas; record in `shadows-of-vilnius-seed/kvr/`, harvested 2026-09-26)](https://kvr.kpd.lt/#/static-heritage-detail/332c215a-030d-4760-b867-1c46276a0e80)
8. [The beginning of Pilies Street (Nacionalinis muziejus – Lietuvos Didžiosios Kunigaikštystės valdovų rūmai)](https://www.lndm.lt/en/pilies-street/the-beginning-of-pilies-street)
9. [Vilniaus miesto siena (Visuotinė lietuvių enciklopedija)](https://www.vle.lt/straipsnis/vilniaus-miesto-siena/)
10. [Bernardinų vartai (lt.wikipedia), after V. Drėma, *Dingęs Vilnius*, 2013](https://lt.wikipedia.org/wiki/Bernardin%C5%B3_vartai)
11. [Išganytojo (Spaso) vartai (lt.wikipedia)](https://lt.wikipedia.org/wiki/I%C5%A1ganytojo_(Spaso)_vartai)
12. [Wikidata Q97215086](https://www.wikidata.org/wiki/Q97215086)
13. [Rūdninkų vartai (VSAA)](https://vsaa.lt/sena/rudninku_v.html)
14. Arkikatedros bazilikos, Žemutinės ir Aukštutinės pilių pastatų, jų liekanų ir kitų statinių kompleksas, KVR 642 (Kultūros vertybių registras; record in `shadows-of-vilnius-seed/kvr/`)
15. Vilniaus piliavietė, vad. Gedimino kalnu, Pilies kalnu, Aukštutine ir Žemutine pilimi, KVR 141 (Kultūros vertybių registras; polygon in `shadows-of-vilnius-seed/kvr/`)
16. [Church of St. Francis and St. Bernard, Vilnius (en.wikipedia)](https://en.wikipedia.org/wiki/Church_of_St._Francis_and_St._Bernard,_Vilnius)
17. Vilniaus Šventųjų Pranciškaus Asyžiečio, Bernardino Sieniečio bei Šv. Onos bažnyčių ir bernardinų vienuolyno statinių ansamblis, KVR 766 (Kultūros vertybių registras; polygon in `shadows-of-vilnius-seed/kvr/`)
18. [P. Smuglevičius, the Rūdninkai Gate, 1785 (reproduced by VSAA, vsaa.lt/sena/vaizdai/foto_html/1_rudininku_v.jpg; also Wikimedia Commons, File:Rūdininkai gate.Vilnius.Lithuania.jpg)](https://vsaa.lt/sena/rudninku_v.html)

Map data: streets © OpenStreetMap contributors (ODbL).
