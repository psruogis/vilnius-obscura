import * as THREE from 'three';

/**
 * Young lindens for the promenade (the 1797 watercolour shows them newly planted): a tapered trunk
 * with a few limbs, and a canopy of alpha-cut leaf-cluster cards. Card normals point out from the
 * canopy centre, so the crown shades as one soft mass the way foliage does, not card by card.
 * The canopy sways gently in the wind (vertex shader).
 */

function leafTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const greens = ['#4f6b2c', '#5d7a33', '#6c8a3c', '#3f5a24', '#7a9444', '#566f30'];
  for (let i = 0; i < 260; i++) {
    // denser towards the middle of the card
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.46;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const len = 9 + r() * 9, wid = len * 0.62, rot = r() * Math.PI * 2;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = greens[Math.floor(r() * greens.length)];
    g.beginPath();
    g.moveTo(0, -len);
    g.quadraticCurveTo(wid, -len * 0.2, 0, len * 0.55);
    g.quadraticCurveTo(-wid, -len * 0.2, 0, -len);
    g.fill();
    g.strokeStyle = 'rgba(30,40,15,0.35)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, -len * 0.9); g.lineTo(0, len * 0.5); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface TreeMaterials { bark: THREE.Material; leaves: THREE.MeshStandardMaterial }

export function createTreeMaterials(bark: THREE.Material): TreeMaterials {
  const leaves = new THREE.MeshStandardMaterial({
    map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
  });
  const clock = { value: 0 };
  leaves.userData.time = clock;
  const own = leaves.onBeforeCompile;
  leaves.onBeforeCompile = (shader, renderer) => {
    own.call(leaves, shader, renderer);
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpos = modelMatrix * vec4(transformed, 1.0);
        float ph = wpos.x * 0.37 + wpos.z * 0.29;
        transformed.x += aSway * (sin(uTime * 1.3 + ph) * 0.05 + sin(uTime * 3.1 + ph * 2.0) * 0.015);
        transformed.z += aSway * (cos(uTime * 1.1 + ph) * 0.04);`);
    // light passing through the leaves: a little warm-green glow on the shaded side
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.07, 0.02);');
  };
  leaves.customProgramCacheKey = () => 'linden-leaves';
  return { bark, leaves };
}

/** Geometry for one tree (trunk+limbs, leaf cards), scaled by `size`, variation from `seed`. */
export function treeGeometry(seed: number, size = 1): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const woodParts: THREE.BufferGeometry[] = [];
  const H = 2.4 * size;
  woodParts.push(new THREE.CylinderGeometry(0.06 * size, 0.1 * size, H, 7).translate(0, H / 2, 0));
  const crownY = H + 1.0 * size, crownR = 1.25 * size;
  const limbs: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const tip = new THREE.Vector3(Math.cos(a) * crownR * 0.6, crownY + (r() - 0.3) * 0.6 * size, Math.sin(a) * crownR * 0.6);
    const base = new THREE.Vector3(0, H * (0.75 + 0.2 * r()), 0);
    const dir = tip.clone().sub(base);
    const len = dir.length();
    const limb = new THREE.CylinderGeometry(0.025 * size, 0.045 * size, len, 5).translate(0, len / 2, 0);
    limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    limb.translate(base.x, base.y, base.z);
    woodParts.push(limb);
    limbs.push(tip);
  }
  const wood = mergeSimple(woodParts);

  // Leaf cards
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], sway: number[] = [];
  const centre = new THREE.Vector3(0, crownY, 0);
  const N = 70;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const tip = limbs[i % limbs.length];
    // points in an ellipsoidal crown, biased towards the limb tips
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = Math.cbrt(r());
    const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u * 0.8, Math.sqrt(1 - u * u) * Math.sin(th))
      .multiplyScalar(crownR * rad).add(centre).lerp(tip, 0.25);
    const w = (0.75 + r() * 0.5) * size;
    q.setFromEuler(e.set(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(a * w / 2, b * w / 2, 0).applyQuaternion(q).add(p));
    const nrm = p.clone().sub(centre).normalize(); // canopy normal: soft, whole-crown shading
    const idx = [0, 1, 2, 0, 2, 3], uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const sw = Math.max(0, (p.y - H) / (crownR * 2));
    for (const k of idx) {
      pos.push(corners[k].x, corners[k].y, corners[k].z);
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(uvs[k][0], uvs[k][1]);
      sway.push(sw);
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  leaves.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  return { wood, leaves };
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    pos.push(...(p.getAttribute('position').array as Float32Array));
    nor.push(...(p.getAttribute('normal').array as Float32Array));
    uv.push(...(p.getAttribute('uv').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
