import * as THREE from 'three';

/**
 * Two-bone IK (shoulder-elbow-hand), solved in world space so it works whatever the bones' local axes:
 * the upper bone is swung so the elbow lands where the triangle (upper length, lower length, target
 * distance) puts it, bent towards the pole; then the lower bone is swung to reach the target.
 * Call after the animation mixer has posed the skeleton; `weight` blends from the animated pose.
 */
const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3();
const _e2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function swing(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, weight: number): void {
  _a.copy(from).normalize(); _b.copy(to).normalize();
  _q.setFromUnitVectors(_a, _b);
  if (weight < 1) _q.slerp(_qi.identity(), 1 - weight);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  if (bone.parent) { bone.parent.getWorldQuaternion(_qp); _qp.invert(); _qw.premultiply(_qp); }
  bone.quaternion.copy(_qw);
  bone.updateMatrixWorld(true);
}

export function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, weight = 1): void {
  upper.getWorldPosition(_s); lower.getWorldPosition(_e); end.getWorldPosition(_w);
  const a = _s.distanceTo(_e), b = _e.distanceTo(_w);
  _u.subVectors(target, _s);
  const d = THREE.MathUtils.clamp(_u.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  _u.normalize();
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0);
  _p.normalize();
  _e2.copy(_s).addScaledVector(_u, x).addScaledVector(_p, h);   // where the elbow should be
  swing(upper, _a.subVectors(_e, _s).clone(), _b.subVectors(_e2, _s).clone(), weight);
  lower.getWorldPosition(_e); end.getWorldPosition(_w);
  swing(lower, _a.subVectors(_w, _e).clone(), _b.subVectors(target, _e).clone(), weight);
}
