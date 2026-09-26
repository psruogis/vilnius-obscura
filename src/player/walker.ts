import * as THREE from 'three';
import type { Input } from './input';
import type { WallGrid } from '../world/collision';

const WALK_SPEED = 1.8;   // m/s
const JOG_SPEED = 4.2;    // m/s
const ACCEL = 9;          // how quickly speed follows intent (1/s)
const TURN_RATE = 10;     // how quickly the body turns towards travel (1/s)
const RADIUS = 0.32;      // collision radius, m

const CAM_DISTANCE = 4.2;
const CAM_SHOULDER = 0.45; // right-shoulder offset
const CAM_HEIGHT = 1.65;   // look-at height above the feet
const PITCH_MIN = THREE.MathUtils.degToRad(-12);
const PITCH_MAX = THREE.MathUtils.degToRad(55);
const LOOK_SENS = 0.0022;

/** The walker (placeholder capsule for now) and its third-person follow camera. */
export class Walker {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  yaw = 0;          // camera yaw; 0 looks towards -Z (grid north)
  pitch = 0.18;
  private facing = 0;
  private velocity = new THREE.Vector2();
  private camDist = CAM_DISTANCE;

  private readonly move = { x: 0, y: 0 };
  private readonly look = { dx: 0, dy: 0 };
  private readonly desired = new THREE.Vector2();
  private readonly target = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly pos2 = { x: 0, z: 0 };

  constructor(
    private readonly input: Input,
    private readonly walls: WallGrid,
    private readonly bounds: { cx: number; cz: number; radius: number },
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.1, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#5b4f45', roughness: 0.85 }),
    );
    body.position.y = 0.85;
    body.castShadow = true;
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.32, 12),
      new THREE.MeshStandardMaterial({ color: '#4d433b', roughness: 0.9 }),
    );
    hood.position.set(0, 1.72, 0.02);
    hood.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), new THREE.MeshStandardMaterial({ color: '#a38f7c' }));
    nose.position.set(0, 1.5, -0.3);
    this.object.add(body, hood, nose);
  }

  place(x: number, z: number, yaw: number): void {
    this.position.set(x, this.groundAt(x, z), z);
    this.yaw = yaw;
    this.facing = yaw;
    this.velocity.set(0, 0);
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    // Look
    this.input.consumeLook(this.look);
    this.yaw -= this.look.dx * LOOK_SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.look.dy * LOOK_SENS, PITCH_MIN, PITCH_MAX);

    // Move, relative to the camera yaw
    this.input.moveAxis(this.move);
    const len = Math.hypot(this.move.x, this.move.y);
    const speed = len > 0 ? (this.input.jog ? JOG_SPEED : WALK_SPEED) : 0;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos) in XZ; right = (cos, -sin)
    const ix = len > 0 ? (this.move.x * cos - this.move.y * sin) / len : 0;
    const iz = len > 0 ? (-this.move.x * sin - this.move.y * cos) / len : 0;
    this.desired.set(ix * speed, iz * speed);
    const a = 1 - Math.exp(-ACCEL * dt);
    this.velocity.lerp(this.desired, a);

    this.pos2.x = this.position.x + this.velocity.x * dt;
    this.pos2.z = this.position.z + this.velocity.y * dt;
    this.walls.resolveCircle(this.pos2, RADIUS);
    this.keepInBounds(this.pos2);
    this.position.x = this.pos2.x;
    this.position.z = this.pos2.z;
    this.position.y = this.groundAt(this.position.x, this.position.z);

    // Body turns towards travel direction
    if (this.velocity.lengthSq() > 0.04) {
      const want = Math.atan2(-this.velocity.x, -this.velocity.y);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * (1 - Math.exp(-TURN_RATE * dt));
    }
    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;

    this.updateCamera(dt, camera);
  }

  private keepInBounds(p: { x: number; z: number }): void {
    const dx = p.x - this.bounds.cx, dz = p.z - this.bounds.cz;
    const d = Math.hypot(dx, dz);
    if (d > this.bounds.radius) {
      p.x = this.bounds.cx + (dx / d) * this.bounds.radius;
      p.z = this.bounds.cz + (dz / d) * this.bounds.radius;
    }
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera): void {
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.target.set(this.position.x + cos * CAM_SHOULDER, this.position.y + CAM_HEIGHT, this.position.z - sin * CAM_SHOULDER);
    const horiz = Math.cos(this.pitch);
    const bx = sin * horiz, bz = cos * horiz, by = Math.sin(this.pitch);
    // Shorten the arm if a wall is between the walker and the camera.
    const hit = this.walls.castSegment(
      this.target.x, this.target.z,
      this.target.x + bx * CAM_DISTANCE, this.target.z + bz * CAM_DISTANCE,
    );
    const wanted = Math.max(0.6, hit * CAM_DISTANCE - 0.25);
    const k = wanted < this.camDist ? 1 : 1 - Math.exp(-4 * dt); // snap in, ease out
    this.camDist += (wanted - this.camDist) * k;
    this.camPos.set(
      this.target.x + bx * this.camDist,
      this.target.y + by * this.camDist,
      this.target.z + bz * this.camDist,
    );
    camera.position.copy(this.camPos);
    camera.lookAt(this.target);
  }
}
