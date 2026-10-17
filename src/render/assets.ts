/**
 * Downloads on a worker thread. Building the world keeps the page's own thread busy for seconds, and a download
 * that needs that thread waits for it; on a worker, the textures and models arrive while the world is still being
 * built (main.ts starts them before it builds anything). Images come back as files and are decoded with
 * img.decode(), which browsers do off the page's thread. (Decoding to an ImageBitmap on the worker was tried and
 * made the upload to the GPU three times slower in software WebGL.) Each file is fetched once: asking again
 * returns the same promise.
 */

const WORKER = `
onmessage = async ({ data: { id, url, image } }) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status + ' ' + url);
    if (image) { postMessage({ id, blob: await res.blob() }); return; }
    const buf = await res.arrayBuffer();
    postMessage({ id, buf }, [buf]);
  } catch (e) { postMessage({ id, error: String(e) }); }
};`;

type Reply = { id: number; buf?: ArrayBuffer; blob?: Blob; error?: string };

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (r: Reply) => void>();
const files = new Map<string, Promise<unknown>>();

function ask(url: string, image: boolean): Promise<Reply> {
  if (!worker) {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
    worker.onmessage = ({ data }: MessageEvent<Reply>) => { waiting.get(data.id)?.(data); waiting.delete(data.id); };
  }
  const id = nextId++;
  return new Promise(res => {
    waiting.set(id, res);
    worker!.postMessage({ id, url: new URL(url, location.href).href, image });
  });
}

/** A decoded image, ready to upload. */
export function fetchImage(url: string): Promise<HTMLImageElement> {
  let p = files.get(url) as Promise<HTMLImageElement> | undefined;
  if (!p) {
    p = ask(url, true).then(async r => {
      if (r.error) throw new Error(r.error);
      const img = new Image(), src = URL.createObjectURL(r.blob!);
      img.src = src;
      try { await img.decode(); } finally { URL.revokeObjectURL(src); }
      return img;
    });
    files.set(url, p);
  }
  return p;
}

/** A file's bytes (models: GLTFLoader.parse reads .glb or .gltf JSON from an ArrayBuffer). */
export function fetchBuffer(url: string): Promise<ArrayBuffer> {
  let p = files.get(url) as Promise<ArrayBuffer> | undefined;
  if (!p) {
    p = ask(url, false).then(r => { if (r.error) throw new Error(r.error); return r.buf!; });
    files.set(url, p);
  }
  return p;
}
