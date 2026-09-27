import * as THREE from 'three';

/**
 * Lawns for the Town Hall garden, c.1900: scythed municipal grass inside stone kerbs.
 *
 * Near the walker the grass is shell-textured: fourteen stacked copies of the lawn surface, each cut
 * down to the cross-sections of a field of tapering blades at its height, so the lawn has depth,
 * tufts and a ragged edge against the kerb, and the tips lean in the wind. The shells are opaque and
 * drawn top first, so a pixel is shaded about once: the layers under a blade fail the depth test.
 * With distance the blades shorten into the base surface, which carries the same colour field (fresh and lush patches, drier and
 * yellowing ones, clover, a worn margin where people step over the kerb) at its average brightness.
 * Panel outlines are signed-distance shapes evaluated per pixel (rounded rectangles, optionally with a
 * round hole for a basin), so the curves are exact at any distance without dense geometry.
 * The materials chain onto the lawn material main.ts passes in, so wet() still darkens and glosses
 * the grass in rain.
 */

/** A rounded-rectangle lawn in promenade coordinates (s along the axis, t across). */
export interface LawnPanel { s0: number; s1: number; t0: number; t1: number; r: number; hole?: [number, number, number] } // hole: s, t, radius

const LAYERS = 14;
const LOWEST = 0.16;        // the first shell's height (as a share of HEIGHT): below it the blades are a closed sward
const HEIGHT = 0.075;       // grass height, metres
const DENSITY = 80;         // blade cells per metre
const CELL = 2;             // grid cell, metres
const LIFT = 0.075;         // lawn surface above the ground (the kerbs stand 0.13)
const PAD = 0.08;           // grid margin past the lawn edge, for the blades that lean over the kerb

const GLSL = /* glsl */ `
  float lw_h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lw_noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(lw_h(i), lw_h(i + vec2(1.0, 0.0)), f.x), mix(lw_h(i + vec2(0.0, 1.0)), lw_h(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float lw_fbm(vec2 p) { return 0.55 * lw_noise(p) + 0.3 * lw_noise(p * 2.13 + 3.7) + 0.15 * lw_noise(p * 4.37 + 9.1); }
  // rounded rectangle (centre-relative p, half extents h, corner radius r), minus an optional round hole
  float lw_sdf(vec4 a, vec4 b) {
    vec2 q = abs(a.xy) - a.zw + b.x;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - b.x;
    if (b.w > 0.0) d = max(d, b.w - length(a.xy - b.yz));
    return d;
  }
  // linear-space grass colour at world xz; d: signed distance to the kerb (negative inside)
  vec3 lw_grass(vec2 p, float d) {
    float n0 = lw_fbm(p * 0.07 + 1.3), n1 = lw_fbm(p * 0.22), n2 = lw_fbm(p * 0.9 + 7.0), n3 = lw_noise(p * 3.3 + 2.0);
    vec3 c = mix(vec3(0.034, 0.074, 0.016), vec3(0.090, 0.140, 0.030), smoothstep(0.2, 0.8, n1 * 0.7 + n0 * 0.3)); // deep lush .. fresh
    c = mix(c, vec3(0.150, 0.150, 0.052), smoothstep(0.52, 0.8, n2 * 0.6 + n0 * 0.4) * 0.55); // dry, yellowing patches
    c = mix(c, vec3(0.050, 0.108, 0.036), smoothstep(0.62, 0.78, n3) * 0.35);         // clover
    c = mix(c, vec3(0.120, 0.112, 0.058), smoothstep(-0.6, -0.1, d) * 0.3);                 // a paler margin by the kerb
    return c;
  }
`;

export function buildLawn(panels: LawnPanel[], world: (s: number, t: number) => THREE.Vector3, lawn: THREE.MeshStandardMaterial, clock: { value: number }): THREE.Group {
  // --- grid: 2 m cells over each panel's box; every cell has its own four vertices and its centre --
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], la: number[] = [], lb: number[] = [], cell: number[] = [], idx: number[] = [];
  for (const P of panels) {
    const cs = (P.s0 + P.s1) / 2, ct = (P.t0 + P.t1) / 2, hs = (P.s1 - P.s0) / 2, ht = (P.t1 - P.t0) / 2;
    const [hS, hT, hR] = P.hole ?? [0, 0, 0];
    const ls = 2 * (hs + PAD), lt = 2 * (ht + PAD), ns = Math.ceil(ls / CELL), nt = Math.ceil(lt / CELL);
    for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
      const sa = P.s0 - PAD + (ls * i) / ns, sb = P.s0 - PAD + (ls * (i + 1)) / ns, ta = P.t0 - PAD + (lt * j) / nt, tb = P.t0 - PAD + (lt * (j + 1)) / nt;
      // cells wholly inside the hole (all four corners in the circle) draw nothing
      if (hR > 0 && [[sa, ta], [sb, ta], [sa, tb], [sb, tb]].every(([s, t]) => Math.hypot(s - cs - hS, t - ct - hT) < hR - 0.05)) continue;
      const c = world((sa + sb) / 2, (ta + tb) / 2);
      const base = pos.length / 3;
      for (const [s, t] of [[sa, ta], [sb, ta], [sb, tb], [sa, tb]]) {
        const p = world(s, t);
        pos.push(p.x, p.y + LIFT, p.z); nor.push(0, 1, 0); uv.push(p.x, p.z);
        la.push(s - cs, t - ct, hs, ht); lb.push(P.r, hS, hT, hR);
        cell.push(c.x, c.y + LIFT, c.z);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2); // (s, t) runs clockwise seen from above
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLawn', new THREE.Float32BufferAttribute(la, 4));
  g.setAttribute('aLawn2', new THREE.Float32BufferAttribute(lb, 4));
  g.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 3));
  g.setIndex(idx);
  // the shells: the same grid drawn once per layer
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = g.index;
  for (const k of Object.keys(g.attributes)) ig.setAttribute(k, g.getAttribute(k));
  ig.setAttribute('aLayer', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: LAYERS }, (_, k) => 1 - ((1 - LOWEST) * k) / (LAYERS - 1))), 1)); // top first
  ig.instanceCount = LAYERS;
  g.computeBoundingSphere(); g.computeBoundingBox();
  ig.boundingSphere = g.boundingSphere!.clone(); ig.boundingSphere.radius += HEIGHT;
  ig.boundingBox = g.boundingBox!.clone(); ig.boundingBox.max.y += HEIGHT;

  // --- materials -------------------------------------------------------------------------------
  const wetHook = lawn.onBeforeCompile, wetKey = lawn.customProgramCacheKey();
  const patch = (shader: THREE.WebGLProgramParametersWithUniforms, shell: boolean) => {
    shader.uniforms.uLawnTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aLawn; attribute vec4 aLawn2; attribute vec3 aCell;
        ${shell ? 'attribute float aLayer; varying float vLayer;' : ''}
        uniform float uLawnTime;
        varying vec4 vLawn; varying vec4 vLawn2; varying vec3 vLawnW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLawn = aLawn; vLawn2 = aLawn2;
        vLawnW = (modelMatrix * vec4(transformed, 1.0)).xyz;     // the blade roots: the pattern is anchored here
        ${shell ? `
        vLayer = aLayer;
        transformed.y += aLayer * ${HEIGHT.toFixed(3)};
        // wind: slow gusts rolling across the lawn and a quicker flutter; the tips move, the roots don't
        float lwGust = 0.5 + 0.5 * sin(uLawnTime * 0.8 - dot(vLawnW.xz, vec2(0.21, 0.13)));
        float lwFlut = sin(uLawnTime * 2.9 + dot(vLawnW.xz, vec2(1.9, 1.3)));
        transformed.xz += vec2(0.8, 0.6) * (0.35 + lwGust * 0.65 + lwFlut * 0.2) * 0.016 * aLayer * aLayer;
        if (distance(cameraPosition, (modelMatrix * vec4(aCell, 1.0)).xyz) > 18.5) transformed = aCell; // far: collapsed, nothing drawn` : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vLawn; varying vec4 vLawn2; varying vec3 vLawnW;
        ${shell ? 'varying float vLayer;' : ''}
        ${GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lwD = lw_sdf(vLawn, vLawn2);
        if (lwD > ${shell ? '0.05 * smoothstep(0.65, 1.0, vLayer)' : '0.0'}) discard;   // the tallest blades lean over the kerb
        float lwCam = distance(cameraPosition, vLawnW);
        vec2 lwTilt = vec2(0.0);
        ${shell ? `
        // the blade under this pixel: cut away everything else as early as possible
        vec2 lwQ = vLawnW.xz * ${DENSITY.toFixed(1)};
        vec2 lwC = floor(lwQ), lwF = fract(lwQ) - 0.5;
        float lwR1 = lw_h(lwC), lwR2 = lw_h(lwC + 13.7), lwR3 = lw_h(lwC + 31.1);
        float lwTall = mix(0.3, 1.0, lwR1) * (0.55 + 0.6 * lw_noise(vLawnW.xz * 4.0));  // tufts and thinner patches
        lwTall *= 1.0 + 0.3 * smoothstep(-0.3, 0.0, lwD);                                   // shaggier where the scythe misses, at the kerb
        lwTall *= 1.0 - smoothstep(8.0, 16.0, lwCam);                                       // blades sink into the base lawn with distance
        float lwHt = vLayer;
        if (lwHt >= lwTall) discard;
        // blades are thicker seen edge-on, which hides the gaps between the shells at low angles
        float lwGraze = 1.0 - abs(normalize(cameraPosition - vLawnW).y);
        float lwRad = 0.42 * (1.0 - lwHt / lwTall) * (1.0 + 1.2 * lwGraze * lwGraze);
        if (length(lwF - (vec2(lwR2, lwR3) - 0.5) * 0.4) > lwRad) discard;
        vec3 lwG = lw_grass(vLawnW.xz, lwD);
        lwG *= mix(0.45, 1.2, lwHt);                                                   // dark at the roots, lit at the tips
        lwG = mix(lwG, lwG * vec3(1.25, 1.15, 0.6), lwHt * lwHt * lwR2 * 0.7);         // some tips drying
        // daisies in a few patches, heads a little below the grass tops
        float lwDaisy = step(0.9965, lwR1) * smoothstep(0.55, 0.75, lw_noise(vLawnW.xz * 0.6 + 4.0)) * step(0.45, lwHt) * step(lwHt, 0.62);
        lwG = mix(lwG, lwR3 > 0.3 ? vec3(0.62, 0.6, 0.52) : vec3(0.55, 0.42, 0.06), lwDaisy);
        diffuseColor.rgb = lwG;
        lwTilt = (vec2(lwR2, lwR3) - 0.5) * 1.4 * lwHt;` : `
        vec3 lwG = lw_grass(vLawnW.xz, lwD);
        // the closed sward under the shells near the walker; the blades' average colour far off
        float lwFar = smoothstep(9.0, 17.0, lwCam);
        diffuseColor.rgb = mix(lwG * 0.5 + vec3(0.01, 0.008, 0.003), lwG * 0.92, lwFar);`}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (viewMatrix * vec4(lwTilt.x, 0.0, lwTilt.y, 0.0)).xyz);`);
  };
  lawn.map = null;
  lawn.color.set('#ffffff');
  lawn.roughness = 0.95;
  lawn.onBeforeCompile = (s, r) => { wetHook.call(lawn, s, r); patch(s, false); };
  lawn.customProgramCacheKey = () => `${wetKey}|lawn-base`;
  lawn.needsUpdate = true;
  const shellMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  shellMat.onBeforeCompile = (s, r) => { wetHook.call(shellMat, s, r); patch(s, true); };
  shellMat.customProgramCacheKey = () => `${wetKey}|lawn-shell`;

  const group = new THREE.Group();
  group.name = 'lawn';
  const base = new THREE.Mesh(g, lawn);
  base.receiveShadow = true;
  const shells = new THREE.Mesh(ig, shellMat);
  shells.receiveShadow = true;
  group.add(base, shells);
  return group;
}
