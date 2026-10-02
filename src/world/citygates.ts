/**
 * The ten gates of the city wall (1503-22, ten gates by the early 17th c.), where each stood, for the map. Local
 * frame (X = E - 583000, Z = -(N - 6061000), metres). Sources and the reasoning for each site: docs/gates.md §2.
 * By 1900 only the Gate of Dawn stood; the rest came down with the wall, 1799-1805, a few later. [V]
 * `within`: about how far the true site may lie from the point, in metres. Where a source says the site was never
 * found (the heritage register, KVR 39), the map draws a ring of that size instead of a point.
 */
export interface CityGate {
  /** English name, as the map labels it. */ name: string;
  /** Lithuanian name. */ lt: string;
  x: number; z: number;
  /** standing in 1900; gone; or gone, but built standing in the walk (the Subačius Gate, world/subacius.ts) */
  state: 'standing' | 'gone' | 'built';
  within: number;
}

export const CITY_GATES: CityGate[] = [
  // the gatehouse itself (OSM way 112746030); the chapel over it saved it [V]
  { name: 'Gate of Dawn', lt: 'Aušros (Medininkų) vartai', x: 170.9, z: 468.9, state: 'standing', within: 0 },
  // Rūdninkų x Pylimo; the gate's lower part lies under the street (VSAA) [V]
  { name: 'Rūdninkai Gate', lt: 'Rūdninkų vartai', x: -239.3, z: 346.7, state: 'gone', within: 10 },
  // in the gap still left between Pylimo g. 22 and Trakų g. 2 (KVR 39) [V]
  { name: 'Trakai Gate', lt: 'Trakų vartai', x: -575, z: -181, state: 'gone', within: 10 },
  // Benediktinių x Šv. Ignoto (lt.wikipedia); the English article has it elsewhere [U]
  { name: 'Vilija Gate', lt: 'Vilijos (Vilniaus) vartai', x: -381, z: -462, state: 'gone', within: 15 },
  // east of the Benediktinių x Totorių crossing (KVR 39, lt.wikipedia) [V]
  { name: 'Tatar Gate', lt: 'Totorių vartai', x: -284, z: -513, state: 'gone', within: 10 },
  // by L. Stuokos-Gucevičiaus x Universiteto (lt.wikipedia); never found on the ground (KVR 39). Walled up 1677
  { name: 'Wet Gate', lt: 'Šv. Marijos Magdalenos (Šlapieji) vartai', x: -87, z: -714, state: 'gone', within: 40 },
  // the head of Pilies g., at the bridge over the Vilnia's channel, where the wall met the Lower Castle's; granite
  // blocks mark it (LNDM, KVR 642) [V]. Pulled down c. 1837, with the courts building beside it (KVR 642, LNDM)
  { name: 'Castle Gate', lt: 'Pilies vartai', x: 144, z: -692, state: 'gone', within: 10 },
  // by the bridge over the Vilnia south of the Bernardine church: where Mickiewicz's monument is now (Drėma, via
  // lt.wikipedia), or some 60 m east, where the register's strip along the wall ends (KVR 39); never found, though
  // a tower that guarded its east side was dug up in 2004 (KVR 39). The ring takes in both [U]
  { name: 'Bernardine Gate', lt: 'Bernardinų vartai', x: 425, z: -463, state: 'gone', within: 40 },
  // by the Užupis bridge, at the end of Išganytojo g. (lt.wikipedia; Wikidata Q97215086, unsourced); not
  // investigated (KVR 39) [U]
  { name: "Saviour's Gate", lt: 'Išganytojo (Spaso) vartai', x: 320.8, z: -228.8, state: 'gone', within: 30 },
  // modelled and standing in the walk, as before 1801 (docs/gates.md §8)
  { name: 'Subačius Gate', lt: 'Subačiaus vartai', x: 328, z: 239.5, state: 'built', within: 0 },
];
