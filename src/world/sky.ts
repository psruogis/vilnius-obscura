import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import SunCalc from 'suncalc';

export const VILNIUS = { lat: 54.6785, lon: 25.2872 };
/** True north lies this far west of LKS94 grid north at the origin (pyproj). */
const GRID_CONVERGENCE_DEG = 1.051;

/**
 * Unit vector towards the sun in the local frame (X east, Y up, Z south = -grid north).
 * SunCalc azimuth is measured from south towards west.
 */
export function sunDirection(date: Date, out = new THREE.Vector3()): THREE.Vector3 {
  const { azimuth, altitude } = SunCalc.getPosition(date, VILNIUS.lat, VILNIUS.lon);
  const trueBearing = azimuth + Math.PI;
  const gridBearing = trueBearing - THREE.MathUtils.degToRad(GRID_CONVERGENCE_DEG);
  const c = Math.cos(altitude);
  return out.set(Math.sin(gridBearing) * c, Math.sin(altitude), -Math.cos(gridBearing) * c).normalize();
}

export function createSky(sunDir: THREE.Vector3, scale = 4500): Sky {
  const sky = new Sky();
  sky.scale.setScalar(scale);
  const u = sky.material.uniforms;
  u['turbidity'].value = 3.2;
  u['rayleigh'].value = 1.4;
  u['mieCoefficient'].value = 0.004;
  u['mieDirectionalG'].value = 0.82;
  u['sunPosition'].value.copy(sunDir);
  return sky;
}
