import * as THREE from 'three';
import type { Input } from './input';
import type { WallGrid } from '../world/collision';

// Movement tuned like Unreal's CharacterMovement: constant acceleration towards the wanted velocity,
// stronger braking when you let go, the body turning to face its motion at a capped rate.
const WALK_SPEED = 1.45;  // m/s (with the measured strides: a natural ~105 steps/min)
const JOG_SPEED = 4.2;    // m/s: a brisk run (was 3.2); the legs turn over faster still, see RUN_LEG_BOOST in character.ts
const ACCEL_WALK = 5.5;   // m/s^2
const ACCEL_JOG = 10.0;
const BRAKE = 7.5;        // m/s^2 when there is no input
const TURN_MAX = 9.0;     // rad/s, body rotation rate
const RADIUS = 0.32;      // collision radius, m

const CAM_DISTANCE = 4.0;   // default arm length; the mouse wheel sets it between CAM_MIN and CAM_MAX
const CAM_DISTANCE_JOG = 4.8;
const CAM_MIN = 1.8, CAM_MAX = 9;
const CAM_SHOULDER = 0.45; // right-shoulder offset
const CAM_HEIGHT = 1.62;   // look-at height above the feet
const CAM_LAG = 11;        // spring-arm lag (1/s), as UE's CameraLagSpeed
const LOOK_SMOOTH = 30;    // mouse smoothing (1/s)
const PITCH_MIN = THREE.MathUtils.degToRad(-12);
const PITCH_MAX = THREE.MathUtils.degToRad(55);
const LOOK_SENS = 0.0022;

/** The walker (a placeholder capsule until the character model loads) and its third-person follow camera. */
export class Walker {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  yaw = 0;          // camera yaw; 0 looks towards -Z (grid north)
  pitch = 0.18;
  private yawGoal = 0; private pitchGoal = 0.18;
  facing = 0;
  /** Body turn rate (rad/s, + = turning left) and forward acceleration (m/s^2), for leaning. */
  angularVelocity = 0;
  forwardAccel = 0;
  jogging = false;
  private velocity = new THREE.Vector2();
  private camDist = CAM_DISTANCE;
  private armGoal = CAM_DISTANCE;
  private arm = CAM_DISTANCE;
  private readonly pivot = new THREE.Vector3();
  private pivotReady = false;
  private fov = 55;

  private readonly move = { x: 0, y: 0 };
  private readonly look = { dx: 0, dy: 0 };
  private readonly desired = new THREE.Vector2();
  private readonly target = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly pos2 = { x: 0, z: 0 };

  constructor(
    private readonly input: Input,
    private readonly walls: WallGrid,
    /** The walk's limit (world/zone.ts): pulls a point that strayed outside back onto the edge. */
    private readonly bounds: { clamp(p: { x: number; z: number }): unknown },
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

  setPitch(p: number): void { this.pitch = this.pitchGoal = p; }

  /** Ground speed, m/s. */
  get speed(): number {
    return this.velocity.length();
  }

  /** Replaces the placeholder body with the character model. */
  setBody(body: THREE.Object3D): void {
    this.object.clear();
    this.object.add(body);
  }

  place(x: number, z: number, yaw: number): void {
    this.position.set(x, this.groundAt(x, z), z);
    this.yaw = this.yawGoal = yaw;
    this.facing = yaw;
    this.velocity.set(0, 0);
    this.pivotReady = false;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    // Look, lightly smoothed
    this.input.consumeLook(this.look);
    this.yawGoal -= this.look.dx * LOOK_SENS;
    this.pitchGoal = THREE.MathUtils.clamp(this.pitchGoal + this.look.dy * LOOK_SENS, PITCH_MIN, PITCH_MAX);
    const ls = 1 - Math.exp(-LOOK_SMOOTH * dt);
    this.yaw += (this.yawGoal - this.yaw) * ls;
    this.pitch += (this.pitchGoal - this.pitch) * ls;

    // Move, relative to the camera yaw
    this.input.moveAxis(this.move);
    const len = Math.hypot(this.move.x, this.move.y);
    this.jogging = this.input.jog && len > 0;
    const maxSpeed = len > 0 ? (this.jogging ? JOG_SPEED : WALK_SPEED) * Math.min(1, len) : 0; // a half-pushed stick strolls
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos) in XZ; right = (cos, -sin)
    const ix = len > 0 ? (this.move.x * cos - this.move.y * sin) / len : 0;
    const iz = len > 0 ? (-this.move.x * sin - this.move.y * cos) / len : 0;
    this.desired.set(ix * maxSpeed, iz * maxSpeed);
    const prevSpeedFwd = this.velocity.x * -Math.sin(this.facing) + this.velocity.y * -Math.cos(this.facing);
    if (len > 0) {
      // constant acceleration towards the wanted velocity; reversing brakes hard first (a pivot)
      const dvx = this.desired.x - this.velocity.x, dvz = this.desired.y - this.velocity.y, dl = Math.hypot(dvx, dvz);
      const reversing = this.velocity.dot(this.desired) < 0;
      const acc = (this.jogging ? ACCEL_JOG : ACCEL_WALK) * (reversing ? 1.6 : 1);
      const step = Math.min(dl, acc * dt);
      if (dl > 1e-6) { this.velocity.x += (dvx / dl) * step; this.velocity.y += (dvz / dl) * step; }
    } else {
      const sp = this.velocity.length(), ns = Math.max(0, sp - BRAKE * dt);
      if (sp > 1e-6) this.velocity.multiplyScalar(ns / sp);
    }

    this.pos2.x = this.position.x + this.velocity.x * dt;
    this.pos2.z = this.position.z + this.velocity.y * dt;
    this.walls.resolveCircle(this.pos2, RADIUS);
    this.bounds.clamp(this.pos2);
    // what the walls let through is the real velocity (so the feet don't run against a wall)
    if (dt > 0) this.velocity.set((this.pos2.x - this.position.x) / dt, (this.pos2.z - this.position.z) / dt);
    this.position.x = this.pos2.x;
    this.position.z = this.pos2.z;
    this.position.y = this.groundAt(this.position.x, this.position.z);

    // Body turns towards the direction of travel at a capped rate
    const prevFacing = this.facing;
    const sp = this.velocity.length();
    if (sp > 0.12 || len > 0) {
      const want = sp > 0.12 ? Math.atan2(-this.velocity.x, -this.velocity.y) : Math.atan2(-ix, -iz);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turn = THREE.MathUtils.clamp(diff * (1 - Math.exp(-12 * dt)), -TURN_MAX * dt, TURN_MAX * dt);
      this.facing += turn;
    }
    const av = dt > 0 ? Math.atan2(Math.sin(this.facing - prevFacing), Math.cos(this.facing - prevFacing)) / dt : 0;
    this.angularVelocity += (av - this.angularVelocity) * (1 - Math.exp(-10 * dt));
    const speedFwd = this.velocity.x * -Math.sin(this.facing) + this.velocity.y * -Math.cos(this.facing);
    const fa = dt > 0 ? (speedFwd - prevSpeedFwd) / dt : 0;
    this.forwardAccel += (fa - this.forwardAccel) * (1 - Math.exp(-8 * dt));
    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;

    this.updateCamera(dt, camera);
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera): void {
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // spring-arm pivot follows the character with lag (smooth starts, stops and turns)
    this.target.set(this.position.x + cos * CAM_SHOULDER, this.position.y + CAM_HEIGHT, this.position.z - sin * CAM_SHOULDER);
    if (!this.pivotReady) { this.pivot.copy(this.target); this.pivotReady = true; }
    this.pivot.lerp(this.target, 1 - Math.exp(-CAM_LAG * dt));
    this.pivot.y += (this.target.y - this.pivot.y) * (1 - Math.exp(-20 * dt));   // but keep up with steps and slopes
    const horiz = Math.cos(this.pitch);
    const bx = sin * horiz, bz = cos * horiz, by = Math.sin(this.pitch);
    // mouse wheel: about 16% per notch, eased
    const zoom = this.input.consumeZoom();
    if (zoom) this.armGoal = THREE.MathUtils.clamp(this.armGoal * Math.exp(zoom * 0.0015), CAM_MIN, CAM_MAX);
    this.arm += (this.armGoal - this.arm) * (1 - Math.exp(-10 * dt));
    const armLen = this.arm + (this.jogging ? CAM_DISTANCE_JOG - CAM_DISTANCE : 0);
    // Shorten the arm if a wall is between the pivot and the camera; ease back out
    const hit = this.walls.castSegment(this.pivot.x, this.pivot.z, this.pivot.x + bx * armLen, this.pivot.z + bz * armLen);
    const wanted = Math.max(0.6, hit * armLen - 0.25);
    const k = wanted < this.camDist ? 1 - Math.exp(-30 * dt) : 1 - Math.exp(-3 * dt);
    this.camDist += (wanted - this.camDist) * k;
    this.camPos.set(this.pivot.x + bx * this.camDist, this.pivot.y + by * this.camDist, this.pivot.z + bz * this.camDist);
    // a long arm looking up would sink the camera into the street: keep it above the ground
    this.camPos.y = Math.max(this.camPos.y, this.groundAt(this.camPos.x, this.camPos.z) + 0.45);
    camera.position.copy(this.camPos);
    camera.lookAt(this.pivot);
    // a touch wider when jogging
    const fovWant = this.jogging ? 62 : 55;
    this.fov += (fovWant - this.fov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }
}
