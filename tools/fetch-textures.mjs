// Downloads CC0 PBR textures from Poly Haven into public/assets/tex/<id>/.
// Maps: diff (colour), nor (OpenGL normal), rough (roughness) or arm (AO, roughness, metal packed in R, G, B),
// height (Poly Haven 'Displacement', for parallax occlusion mapping: src/render/pom.ts).
// Poly Haven's JPEGs (quality 95-99) are converted to WebP with cwebp (q 85; normal and height maps q 90): a third
// of the bytes, and alike side by side in the shot tool (2026-10-17). Without cwebp on the PATH the JPEGs stay,
// and the walk (which asks for .webp) will not find them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'tex');

const NAMES = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough', arm: 'arm', Displacement: 'height' };
// id -> resolution and the maps it needs.
// Resolutions were A/B tested in the shot tool: a 4k cobble set (+20 MB) is indistinguishable from 2k after the
// oil-paint pass even at 0.6 m eye height; 2k tiles (+7 MB; roofs are 10 m and more from the walker) and 2k
// plaster (+3 MB) are indistinguishable from 1k.
const TEXTURES = {
  cobblestone_floor_08: { res: '2k', maps: ['Diffuse', 'nor_gl', 'arm', 'Displacement'] }, // rounded fieldstone cobbles (streets, square)
  clay_roof_tiles: { res: '1k', maps: ['Diffuse', 'nor_gl', 'arm', 'Displacement'] },      // hand-made barrel tiles, laid at their true 4 m scale
  plastered_wall_04: { res: '1k', maps: ['Diffuse', 'nor_gl', 'Rough'] },                   // lime plaster, tinted per house
  weathered_planks: { res: '1k', maps: ['Diffuse', 'nor_gl', 'Rough'] },                    // doors, shutters, stalls
};

for (const [id, { res, maps }] of Object.entries(TEXTURES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  for (const key of maps) {
    const url = files[key]?.[res]?.jpg?.url;
    if (!url) { console.warn(`${id}: no ${key} ${res} jpg`); continue; }
    const dest = path.join(OUT, id, `${NAMES[key]}.jpg`), webp = dest.replace(/\.jpg$/, '.webp');
    if (fs.existsSync(webp)) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(dest, buf);
    const q = ['nor', 'height'].includes(NAMES[key]) ? '90' : '85';
    const cw = spawnSync('cwebp', ['-quiet', '-metadata', 'none', '-q', q, '-sharp_yuv', dest, '-o', webp]);
    if (cw.status === 0) fs.rmSync(dest); else console.warn(`cwebp failed or missing: ${dest} left as JPEG`);
    console.log(`${id}/${NAMES[key]} ${(fs.statSync(cw.status === 0 ? webp : dest).size / 1024).toFixed(0)} KB`);
  }
}
