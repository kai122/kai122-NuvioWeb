// Service worker: keeps a copy of this app's own files on the device so the
// Home Screen app always opens, even on a slow or missing connection.
// - Only the app's own files (this folder and ../assets) are handled; add-on,
//   TMDB, Nuvio account and video requests go straight to the network and are
//   never stored here.
// - Every file is fetched fresh first, so a new version arrives on the next
//   launch and old and new files are never mixed. The saved copy is used only
//   if the network fails or takes longer than a few seconds.
// The deploy replaces "dev" with the commit, so each release starts clean.
const VERSION = "dev";
const CACHE = `nuvio-touch-${VERSION}`;
const SHELL = ["./", "styles.css", "tokens.css", "env.js", "manifest.json", "js/main.js"];
const TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("nuvio-touch-") && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

const scopeUrl = new URL(self.registration.scope);
const appRoot = new URL("../", scopeUrl).href; // the app plus ../assets (icons, logo, fonts)

function isOwnFile(url) {
  return (
    url.origin === scopeUrl.origin &&
    url.href.startsWith(appRoot) &&
    !url.pathname.endsWith("/sw.js")
  );
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (request.mode === "navigate" ? await cache.match("./") : undefined)
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  });
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(async () => resolve(await fromCache(request)), TIMEOUT_MS);
  });
  try {
    const first = await Promise.race([network, slow]);
    if (first) return first;
    return await network; // slow, but nothing saved yet: keep waiting
  } catch (error) {
    const cached = await fromCache(request);
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (!isOwnFile(url)) return;
  event.respondWith(networkFirst(request));
});
