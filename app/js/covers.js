// Collection covers are big originals (usually 1600×900) shown as ~207pt
// tiles. Decoding hundreds of megapixel images while the page scrolls is the
// main thing that makes Home stutter compared to the native app, which keeps
// pre-shrunk copies. This does the same: each cover is decoded once, shrunk
// to tile size, and the small copy is kept in the browser's cache. From then
// on every launch shows covers instantly from the small copies.
const CACHE = "nuvio-covers-v1";
const WIDTH = 480; // 2× the 207pt tile, a little extra for larger layouts
const SMALL_ENOUGH = 40000; // bytes; a cover this small is kept as it is

// One object URL per cover for the whole session, so rebuilding Home reuses
// them instead of leaking new ones.
const ready = new Map();

async function shrinkBlob(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { resizeWidth: WIDTH, resizeQuality: "medium" });
  } catch (_) {
    bitmap = await createImageBitmap(blob); // older Safari: no resize options
  }
  const scale = Math.min(1, WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  // PNG sources may have transparency; everything else flattens fine.
  const fallbackType = blob.type === "image/png" ? "image/png" : "image/jpeg";
  for (const type of ["image/webp", fallbackType]) {
    const out = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
    if (out && (out.type === type || type === fallbackType)) return out;
  }
  return null;
}

async function smallCover(url) {
  const cache = await caches.open(CACHE).catch(() => null);
  if (!cache) return url; // e.g. private browsing: use the original
  const hit = await cache.match(url);
  if (hit) return URL.createObjectURL(await hit.blob());
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`cover ${response.status}`);
  let blob = await response.blob();
  if (blob.size > SMALL_ENOUGH) blob = (await shrinkBlob(blob).catch(() => null)) || blob;
  await cache
    .put(url, new Response(blob, { headers: { "Content-Type": blob.type } }))
    .catch(() => {});
  return URL.createObjectURL(blob);
}

// Resolves to a small, session-stable URL for the cover; the original URL if
// anything goes wrong.
export function coverSrc(url) {
  if (!ready.has(url)) {
    ready.set(
      url,
      smallCover(url).catch(() => url)
    );
  }
  return ready.get(url);
}

// After Home settles, quietly convert the remaining covers one at a time, so
// the first scroll through a new collection is already cheap.
let warming = false;
export function warmCovers(urls) {
  if (warming) return;
  warming = true;
  const queue = urls.filter((u) => u && !ready.has(u));
  const step = () => {
    const url = queue.shift();
    if (!url) {
      warming = false;
      return;
    }
    const next = () => setTimeout(step, 150);
    if (document.visibilityState === "hidden") return setTimeout(step, 4000);
    coverSrc(url).then(next, next);
  };
  setTimeout(step, 3500);
}
