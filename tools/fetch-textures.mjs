// Downloads CC0 PBR textures from Poly Haven into public/assets/tex/<id>/.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'tex');

// id -> resolution
const TEXTURES = {
  cobblestone_floor_08: '2k', // rounded fieldstone cobbles (streets, square)
  clay_roof_tiles: '1k',      // hand-made red clay tiles
  plastered_wall_04: '1k',    // lime plaster, tinted per house
  weathered_planks: '1k',     // doors, shutters, stalls
};
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough' };

for (const [id, res] of Object.entries(TEXTURES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  for (const [key, short] of Object.entries(MAPS)) {
    const url = files[key]?.[res]?.jpg?.url;
    if (!url) { console.warn(`${id}: no ${key} ${res} jpg`); continue; }
    const dest = path.join(OUT, id, `${short}.jpg`);
    if (fs.existsSync(dest)) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`${id}/${short}.jpg ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
