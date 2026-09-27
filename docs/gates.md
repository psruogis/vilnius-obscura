# The Vilnius city gates — research brief

Version 0.1 · 2026-09-28 · status: **research brief, not built**

The old city wall and its gates, meant to be rebuilt in the game. Tags follow `docs/REFERENCES.md`:
**[V]** verified against a cited source, **[U]** unverified or a design choice.

## 1. The wall

- Built **1503–1522**, against Crimean Tatar raids. [V] ¹ ²
- Almost **2.5 km** long ("beveik pustrečio kilometro"), **up to 10–12 m** high, with **five towers**
  at first. [V] ¹
- Russian-appointed city administrators demolished it bit by bit from **1799**. The last gate on
  the list below came down in **1804**. [V] ¹
- **Only the Gate of Dawn survives**, together with the 17th-century **artillery bastion** (Bastėja)
  by the Subačius Gate, restored 1966 and a museum since 1987. [V] ¹ ²
- Number of gates: the Lithuanian article gives **ten** ¹, the English one **nine** ². The difference
  is probably the Wet Gate, walled up in 1677 [U, inference].

## 2. The gates, clockwise from the Gate of Dawn

Locations follow the Lithuanian article ¹. Map positions are the nearest meeting point of the named
modern streets in `public/data/area.json`. They are **approximate**: a street corner, not a gate
footprint [U]. Frame: `X = E − 583000, Z = −(N − 6061000)`, metres, +Z south. The playable radius is
110 m and the backdrop radius 450 m, both around the Town Hall.

| # | Gate | Where it stood | Fate | On the game map |
|---|---|---|---|---|
| 1 | **Aušros vartai**: Gate of Dawn, Medininkų, Aštrieji (Sharp), Krėvos | Aušros Vartų g. | **Standing** | (170.6, 480.3), 460 m, at the south edge of the map data |
| 2 | **Rūdninkų vartai** | Rūdninkų × Pylimo | Demolished 1800 | (−239.3, 346.7), 372 m, backdrop |
| 3 | **Trakų vartai** (the main gate ²) | Near Trakų × Pylimo | Demolished 1804 | Not located. The two streets don't meet in the map data (Trakų g. is clipped); roughly 440 m west |
| 4 | **Vilijos (Vilniaus) vartai** | Benediktinių × Šv. Ignoto | Demolished 1802 | Outside the map data |
| 5 | **Totorių vartai** (Tatar) | East side of Benediktinių × Totorių | Demolished 1802 | Outside the map data |
| 6 | **Šv. Marijos Magdalenos vartai**: the Wet Gate (Šlapieji) | L. Stuokos-Gucevičiaus × Universiteto, by Cathedral Square | **Walled up 1677** | Outside the map data |
| 7 | **Pilies vartai** (Castle) | Top of Pilies g. | Demolished early 1800s | Outside the map data |
| 8 | **Bernardinų vartai** | By the Bernardine church, at the bridge to Užupis | Demolished early 1800s | Not located yet (Užupio tiltas is in the data) |
| 9 | **Išganytojo (Spaso) vartai**: Saviour's | Near the Vilnia, on the road to Užupis | Demolished 1801 | Not located yet |
| 10 | **Subačiaus vartai** | Bokšto × Subačiaus × Strazdelio | Demolished **27 May 1801** ³; about half the foundations survive ¹ | (324.4, 239.4), 379 m, backdrop |

**The sources disagree** on three locations. The English article ² puts the Tatar Gate at
Liejyklos × Totorių, the Vilija Gate at Vilniaus × Bernardinų, and the Subačius Gate at "the end of
what is now Holy Spirit street". The Lithuanian article's Subačius corner matches the gate's own
article ³. Check all three against pre-1799 plans before building. [U]

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

**The gates and the book ban never overlapped.** The last gate came down in 1804 and the ban began in
1864. [V] ¹ ⁴ In 1902 the only gate the courier can walk under is the Gate of Dawn. But the roads into
the Old Town still run through the old gate sites, so the story is **which gate road he comes in by**.
[U, design]

With ghost gates, the player sees the gate that used to stand at each of those points. The overlay
then becomes part of the story, not decoration.

Measured on the game's street graph to the St Nicholas attic (see `docs/characters/knygnesys.md`):

| Gate road | To the attic | Through the square | Character |
|---|---|---|---|
| **Trakai** (the main gate ²) | ~249 m, 3.5 min | 0 m | Shortest, and it comes from the west, the direction the books travel from. So it's the obvious way in, and the one worth watching. [U] The site is approximate because Trakų g. is clipped in the map data |
| **Rūdninkai** | 383 m, 5.3 min | 0 m | The quiet one, along the edge of the Jewish quarter |
| **Subačius** | 810 m, 11.3 min | 170 m | The budelis's gate, gone since 1801 but remembered. Crosses the square |
| **Gate of Dawn** | 841 m, 11.7 min | 170 m | The long way, and the only gate still standing: he passes under the chapel, among pilgrims. Crosses the square |

Times are at 1.2 m/s, walking with a load. The pre-1799 era has no knygnešys at all, because the ban
came 60 years later. The two versions of the city tell separate stories.

## 7. Open questions

1. Settle the three disputed locations (Tatar, Vilija, Subačius) against old plans.
2. Locate the Bernardine and Saviour's gates on the map.
3. What did each gate look like? Tower gate or plain passage, roofs, heraldry?
4. Ghost gates first, or the pre-1799 era?
5. How far should the walkable city grow, and in what order? The Subačius and Rūdninkų sites are the
   nearest.
6. Were there police or toll posts on the roads into the city around 1902? That decides which gate
   road is dangerous.

## Sources

1. [Vilniaus gynybinė siena (lt.wikipedia)](https://lt.wikipedia.org/wiki/Vilniaus_gynybin%C4%97_siena)
2. [Wall of Vilnius (en.wikipedia)](https://en.wikipedia.org/wiki/Wall_of_Vilnius)
3. [Subačius Gate (en.wikipedia)](https://en.wikipedia.org/wiki/Suba%C4%8Dius_Gate)
4. [Lithuanian press ban (en.wikipedia)](https://en.wikipedia.org/wiki/Lithuanian_press_ban)

Map data: streets © OpenStreetMap contributors (ODbL).
