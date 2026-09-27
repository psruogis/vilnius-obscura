// Builds the townsfolk models from Quaternius' CC0 packs, downloaded separately from itch.io (free tier,
// "No thanks, just take me to the downloads"): Universal Base Characters [Standard], Universal Animation
// Library [Standard] and Universal Animation Library 2 [Standard]. All three share one 65-bone rig.
//
//   node tools/build-folk.mjs <folder holding the three unzipped packs>
//
// Writes public/assets/char/
//   folk_male.glb, folk_female.glb  the base body, eyes, brows and a few hairstyles (all bound to one skin),
//                                   only position/normal/uv/skin attributes, textures downscaled to JPEG
//                                   (macOS `sips`, so this tool runs on a Mac; the site needs nothing of it)
//   folk_anims.glb                  the skeleton and a dozen clips: bone rotations plus the pelvis
//                                   translation (bone lengths come from the body, so one set fits both)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/build-folk.mjs <packs folder>'); process.exit(2); }
const find = (re) => {
  const hits = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (re.test(p)) hits.push(p); } };
  walk(SRC);
  if (!hits.length) throw new Error(`not found: ${re}`);
  return hits.sort((a, b) => a.length - b.length)[0];
};
const OUT = path.join(ROOT, 'public', 'assets', 'char');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'folk-'));

// --- glTF reading ------------------------------------------------------------------------------
function readGltf(file) {
  const buf = fs.readFileSync(file);
  if (file.endsWith('.glb')) {
    const jl = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
    const bl = buf.readUInt32LE(20 + jl);
    return { json, bins: [buf.subarray(28 + jl, 28 + jl + bl)], dir: path.dirname(file) };
  }
  const json = JSON.parse(buf.toString('utf8'));
  return { json, bins: json.buffers.map(b => fs.readFileSync(path.join(path.dirname(file), b.uri))), dir: path.dirname(file) };
}
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], T = COMP[a.componentType], n = NUM[a.type];
  const stride = bv.byteStride ?? T.BYTES_PER_ELEMENT * n, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), b = g.bins[bv.buffer];
  const out = new T(a.count * n);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const get = { 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true), 5120: (o) => dv.getInt8(o) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(base + k * stride + c * T.BYTES_PER_ELEMENT);
  return { array: out, type: a.type, componentType: a.componentType, normalized: a.normalized, count: a.count };
}

// --- glTF writing ------------------------------------------------------------------------------
class Writer {
  constructor() {
    this.json = { asset: { version: '2.0', generator: 'build-folk.mjs' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
    this.chunks = []; this.length = 0;
  }
  view(bytes, target) {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) { this.chunks.push(Buffer.alloc(pad)); this.length += pad; }
    const v = { buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength };
    if (target) v.target = target;
    this.chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); this.length += bytes.byteLength;
    this.json.bufferViews.push(v);
    return this.json.bufferViews.length - 1;
  }
  accessor(acc, target) {
    const a = { bufferView: this.view(acc.array, target), componentType: acc.componentType, count: acc.count, type: acc.type };
    if (acc.normalized) a.normalized = true;
    if (acc.type === 'VEC3' && acc.componentType === 5126 && target === 34962) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < acc.count; k++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], acc.array[k * 3 + c]); max[c] = Math.max(max[c], acc.array[k * 3 + c]); }
      a.min = min; a.max = max;
    }
    if (acc.type === 'SCALAR' && acc.componentType === 5126 && !target) {   // animation input
      let min = Infinity, max = -Infinity;
      for (const t of acc.array) { min = Math.min(min, t); max = Math.max(max, t); }
      a.min = [min]; a.max = [max];
    }
    this.json.accessors.push(a);
    return this.json.accessors.length - 1;
  }
  image(file, mimeType, name) {
    (this.json.images ??= []).push({ bufferView: this.view(fs.readFileSync(file)), mimeType, name });
    (this.json.samplers ??= [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]);
    (this.json.textures ??= []).push({ sampler: 0, source: this.json.images.length - 1 });
    return this.json.textures.length - 1;
  }
  write(file) {
    this.json.buffers[0].byteLength = this.length;
    let js = Buffer.from(JSON.stringify(this.json), 'utf8');
    js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
    let bin = Buffer.concat(this.chunks);
    bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
    const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
    const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
    fs.writeFileSync(file, Buffer.concat([head, c1, js, c2, bin]));
    console.log(`${path.relative(ROOT, file)}: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
  }
}

/** Downscaled JPEG copy of a texture (sips ships with macOS). */
function jpeg(file, size, quality = 82) {
  const out = path.join(TMP, `${path.basename(file, '.png')}_${size}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), '-Z', String(size), file, '--out', out], { stdio: 'ignore' });
  return out;
}

/** Copies the skeleton nodes (Armature, root and bones) of `g` into `w`; returns old -> new node index. */
function copySkeleton(w, g) {
  const map = new Map();
  const arm = g.json.nodes.findIndex(n => n.name === 'Armature');
  const copy = (i) => {
    const n = g.json.nodes[i];
    const o = { name: n.name };
    for (const k of ['translation', 'rotation', 'scale']) if (n[k]) o[k] = n[k];
    w.json.nodes.push(o); map.set(i, w.json.nodes.length - 1);
    const kids = (n.children ?? []).filter(c => g.json.nodes[c].mesh === undefined).map(copy);
    if (kids.length) o.children = kids;
    return map.get(i);
  };
  w.json.scenes[0].nodes.push(copy(arm));
  return map;
}

// --- Bodies ------------------------------------------------------------------------------------
const KEEP = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
function buildBody(sex) {
  const S = sex === 'male' ? 'Male' : 'Female';
  const body = readGltf(find(new RegExp(`Godot - UE/Superhero_${S}_FullBody\\.gltf$`)));
  const hairs = (sex === 'male' ? ['Hair_Beard', 'Hair_SimpleParted', 'Hair_Buzzed'] : ['Hair_Buns'])
    .map(h => ({ name: h, g: readGltf(find(new RegExp(`Rigged to Head Bone/glTF[^/]*/${h}\\.gltf$`))) }));
  const w = new Writer();
  const map = copySkeleton(w, body);
  const skin = body.json.skins[0];
  const joints = skin.joints.map(j => body.json.nodes[j].name);
  w.json.skins = [{ joints: skin.joints.map(j => map.get(j)), inverseBindMatrices: w.accessor(accessor(body, skin.inverseBindMatrices)) }];
  const texDir = path.dirname(find(new RegExp(`Textures/T_Superhero_${S}_Normal\\.png$`)));
  const T = (n) => path.join(texDir, n), B = (n) => path.join(body.dir, n);   // body.dir: normals in the OpenGL convention
  const hairN = sex === 'male' ? 1 : 2;
  w.json.materials = [
    { name: 'Skin', pbrMetallicRoughness: { baseColorTexture: { index: w.image(jpeg(T(sex === 'male' ? 'T_Superhero_Male_Ligh.png' : 'T_Superhero_Female_Light_BaseColor.png'), 1024), 'image/jpeg', 'skin') }, metallicFactor: 0, roughnessFactor: 0.6 },
      normalTexture: { index: w.image(jpeg(B(`T_Superhero_${S}_Normal.png`), 1024, 88), 'image/jpeg', 'skin_n') } },
    { name: 'Eyes', pbrMetallicRoughness: { baseColorTexture: { index: w.image(jpeg(B('T_Eye_Brown.png'), 128, 90), 'image/jpeg', 'eye') }, metallicFactor: 0, roughnessFactor: 0.2 } },
    { name: 'Hair', doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: w.image(jpeg(B(`T_Hair_${hairN}_BaseColor.png`), 512), 'image/jpeg', 'hair') }, metallicFactor: 0, roughnessFactor: 0.7 } },
  ];
  w.json.meshes = [];
  const arm = w.json.scenes[0].nodes[0];
  const addMesh = (g, meshIndex, name, material) => {
    const prim = g.json.meshes[meshIndex].primitives[0];
    // the hair files carry their own copy of the same skeleton: check the joint order before sharing the skin
    const gj = g.json.skins[0].joints.map(j => g.json.nodes[j].name);
    if (gj.join() !== joints.join()) throw new Error(`${name}: joint order differs`);
    const attributes = {};
    for (const k of KEEP) if (prim.attributes[k] !== undefined) attributes[k] = w.accessor(accessor(g, prim.attributes[k]), 34962);
    const idx = accessor(g, prim.indices);
    w.json.meshes.push({ name, primitives: [{ attributes, indices: w.accessor(idx, 34963), material }] });
    w.json.nodes.push({ name, mesh: w.json.meshes.length - 1, skin: 0 });
    (w.json.nodes[arm].children ??= []).push(w.json.nodes.length - 1);
  };
  const mesh = (re) => body.json.nodes.find(n => n.mesh !== undefined && re.test(n.name)).mesh;
  addMesh(body, mesh(/^SuperHero|^Superhero/), 'Body', 0);
  addMesh(body, mesh(/^Eyes$/), 'Eyes', 1);
  addMesh(body, mesh(/^Eyebrows$/), 'Brows', 2);
  for (const h of hairs) addMesh(h.g, h.g.json.nodes.find(n => n.mesh !== undefined).mesh, h.name, 2);
  w.write(path.join(OUT, `folk_${sex}.glb`));
}

// --- Animations ----------------------------------------------------------------------------------
const CLIPS = {
  'Universal Animation Library\\[Standard\\]': ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Interact'],
  'Universal Animation Library 2\\[Standard\\]': ['Idle_FoldArms_Loop', 'Idle_Lantern_Loop', 'Yes', 'Idle_No_Loop', 'Walk_Carry_Loop'],
};
function buildAnims() {
  const w = new Writer();
  let map = null, first = null;
  w.json.animations = [];
  for (const [pack, clips] of Object.entries(CLIPS)) {
    const g = readGltf(find(new RegExp(`${pack}/Unreal-Godot/UAL\\d_Standard\\.glb$`)));
    const byName = new Map(g.json.nodes.map((n, i) => [n.name, i]));
    if (!map) { map = copySkeleton(w, g); first = g; }
    const target = (i) => map.get(first.json.nodes.findIndex(n => n.name === g.json.nodes[i].name));
    for (const name of clips) {
      const a = g.json.animations.find(x => x.name === name);
      if (!a) throw new Error(`clip ${name} missing`);
      const out = { name, channels: [], samplers: [] };
      const inputs = new Map();
      for (const ch of a.channels) {
        const bone = g.json.nodes[ch.target.node].name;
        const keep = ch.target.path === 'rotation' ? bone !== 'root' : ch.target.path === 'translation' && bone === 'pelvis';
        if (!keep || !byName.has(bone)) continue;
        const s = a.samplers[ch.sampler];
        if (!inputs.has(s.input)) inputs.set(s.input, w.accessor(accessor(g, s.input)));
        out.samplers.push({ input: inputs.get(s.input), output: w.accessor(accessor(g, s.output)), interpolation: s.interpolation ?? 'LINEAR' });
        out.channels.push({ sampler: out.samplers.length - 1, target: { node: target(ch.target.node), path: ch.target.path } });
      }
      w.json.animations.push(out);
    }
  }
  w.write(path.join(OUT, 'folk_anims.glb'));
}

buildBody('male');
buildBody('female');
buildAnims();
fs.rmSync(TMP, { recursive: true, force: true });
