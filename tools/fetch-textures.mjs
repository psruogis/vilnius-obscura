// Downloads CC0 PBR textures from Poly Haven into public/assets/tex/<id>/.
// Maps: diff (colour), nor (OpenGL normal), rough (roughness) or arm (AO, roughness, metal packed in R, G, B),
// height (Poly Haven 'Displacement', for parallax occlusion mapping: src/render/pom.ts).
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
    const dest = path.join(OUT, id, `${NAMES[key]}.jpg`);
    if (fs.existsSync(dest)) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`${id}/${NAMES[key]}.jpg ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
