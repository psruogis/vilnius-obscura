import type { XZ } from './area';
import { buildTowerGate, gatePlan, type GateSpec } from './towergate';

/*
 * The Rūdninkai Gate (Rūdninkų vartai), the city wall's west gate on the road to Grodno and Poland, where Rūdninkų g.
 * meets Pylimo g. (docs/gates.md §9). Built with the wall in 1503-22, first named in 1557; in 1675-79 a long barbican
 * of two storeys was built onto its west front, on the rampart of 1648; pulled down in 1800, its bricks sold off. Its
 * lower part survives under the street. (VSAA; KVR 39) [V]
 * Form after P. Smuglevičius's drawing of 1785 (reproduced by VSAA) and the descriptions: a tall gate tower like the
 * Gate of Dawn's, three and a half storeys (KVR 39) with round cannon ports on its fourth floor (VSAA), under a low
 * hipped roof; in front of it the barbican, two storeys, hipped, the gateway in its far end and round ports on its
 * second floor; cornices in rhythm on both; a niche for the guard in the passage's south wall (archaeology, VSAA). [V]
 * Measurements are read off the drawing and are conjecture. [U] Like the Subačius Gate it stands as it was before it
 * came down, in a walk set around 1900 (the owner's choice); `?gate=ghost` draws it as a ghost. [U]
 */

// The road through the gate runs from Rūdninkų g. (north-east) on into Šv. Stepono g. (south-west); the wall followed
// Pylimo g. across it, nearly square. Local frame: x along the road, outwards; z along the wall (north-west); y up.
const U: XZ = (() => { const l = Math.hypot(-58.8, 65.4); return [-58.8 / l, 65.4 / l] as XZ; })();   // Rūdninkų g.'s last stretch

export const RUDNINKAI_SPEC: GateSpec = {
  name: 'Rūdninkai Gate',
  site: [-239.3, 346.7], out: U,                        // Rūdninkų g. meets Pylimo g. (OSM)
  // the tower stands at the end of Rūdninkų g., 1.5 m south-east of the street's line to clear the house at Pylimo g. 46
  shift: [1.0, -1.5],
  tower: { depth: 9.5, hw: 6, eave: 18.5, roof: { kind: 'hip', rise: 2.4 }, bands: [9.5, 14.1], chimney: true },
  passage: { aw: 1.8, spring: 3.2 },
  barbican: { length: 15, hw: 5, eave: 7.2, rise: 1.9, bands: [3.6], pilasters: true },
  holes: [
    // the tower: a row of round ports under the cornice on every face; windows on the third floor
    { on: 'town', kind: 'port', y: 16.7, n: 4 }, { on: 'field', kind: 'port', y: 16.7, n: 4 }, { on: 'sides', kind: 'port', y: 16.7, n: 3 },
    { on: 'sides', kind: 'window', y: 12.0, at: [0] }, { on: 'sides', kind: 'window', y: 6.6, at: [-2.2], w: 0.6, h: 0.9 },
    { on: 'town', kind: 'window', y: 12.0, at: [-2.8, 2.8] }, { on: 'town', kind: 'window', y: 7.2, at: [0], w: 0.9 },
    { on: 'field', kind: 'window', y: 12.4, at: [0], w: 0.5, h: 1.8 },          // the tall slit the drawing shows over the barbican
    // the barbican: round ports on its second floor along both sides, and one over the gateway
    { on: 'bSides', kind: 'port', y: 5.0, n: 3, r: 0.34 }, { on: 'bEnd', kind: 'port', y: 6.1, at: [0], r: 0.36 },
    { on: 'passage', kind: 'niche', y: 1.15, at: [4.2] },                        // the guard's niche (archaeology, VSAA)
  ],
  wall: { x: -2.6, walk: 6.2, max: 24 },                // the wall about 8 m to its parapet (KVR 39: about 6.5 m)
};

/** Where the gate stood, for the map: the tower and the barbican. */
export const RUDNINKAI_GATE = gatePlan(RUDNINKAI_SPEC);

export const buildRudninkaiGate = (o: Parameters<typeof buildTowerGate>[1]) => buildTowerGate(RUDNINKAI_SPEC, o);
