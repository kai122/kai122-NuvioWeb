// Stremio add-on protocol client: manifests, catalogs, metadata and streams.
import { store } from "./store.js";

const responseCache = new Map();

async function getJSON(url, { timeout = 15000, cache = true } = {}) {
  if (cache && responseCache.has(url)) return responseCache.get(url);
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  })();
  if (cache) {
    responseCache.set(url, request);
    request.catch(() => responseCache.delete(url));
  }
  return request;
}

export function normalizeManifestUrl(input) {
  let url = String(input || "").trim();
  if (!url) return "";
  if (url.startsWith("stremio://")) url = `https://${url.slice("stremio://".length)}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  } catch (_) {
    return "";
  }
  if (!/\/manifest\.json(\?.*)?$/i.test(url)) url = `${url.replace(/\/+$/, "")}/manifest.json`;
  return url;
}

function baseOf(manifestUrl) {
  return manifestUrl.replace(/\/manifest\.json(\?.*)?$/i, "");
}

export async function fetchManifest(manifestUrl) {
  const manifest = await getJSON(manifestUrl);
  if (!manifest || !manifest.id) throw new Error("Not an add-on manifest");
  return { url: manifestUrl, base: baseOf(manifestUrl), manifest };
}

let addonsPromise = null;
export function loadAddons({ refresh = false } = {}) {
  if (!addonsPromise || refresh) {
    addonsPromise = Promise.all(
      store
        .addonUrls()
        .map((url) =>
          fetchManifest(url).catch((error) => ({ url, base: baseOf(url), manifest: null, error }))
        )
    );
  }
  return addonsPromise;
}

function resourceEntry(manifest, name) {
  for (const resource of manifest?.resources || []) {
    if (resource === name) return { name, types: manifest.types, idPrefixes: manifest.idPrefixes };
    if (resource && resource.name === name) {
      return {
        name,
        types: resource.types || manifest.types,
        idPrefixes: resource.idPrefixes || manifest.idPrefixes
      };
    }
  }
  return null;
}

export function supports(addon, resourceName, type, id) {
  const entry = resourceEntry(addon.manifest, resourceName);
  if (!entry) return false;
  if (entry.types && type && !entry.types.includes(type)) return false;
  if (entry.idPrefixes && id && !entry.idPrefixes.some((prefix) => String(id).startsWith(prefix)))
    return false;
  return true;
}

function extraPath(extra = {}) {
  const parts = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return parts.length ? `/${parts.join("&")}` : "";
}

export function catalogRequiresExtra(catalog) {
  if (Array.isArray(catalog.extraRequired) && catalog.extraRequired.length) return true;
  return (catalog.extra || []).some((extra) => extra.isRequired);
}

export function catalogSupportsExtra(catalog, name) {
  return (
    (catalog.extra || []).some((extra) => extra.name === name) ||
    (catalog.extraSupported || []).includes(name)
  );
}

export function typeLabel(type) {
  if (type === "movie") return "Movies";
  if (type === "series") return "Series";
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
}

// Home/Discover catalogs: everything that can be listed without input.
export async function listCatalogs() {
  const addons = await loadAddons();
  const out = [];
  for (const addon of addons) {
    if (!addon.manifest) continue;
    for (const catalog of addon.manifest.catalogs || []) {
      if (catalogRequiresExtra(catalog)) continue;
      out.push({ addon, catalog, key: `${addon.manifest.id}:${catalog.type}:${catalog.id}` });
    }
  }
  return out;
}

export async function fetchCatalog({ addon, catalog }, extra = {}) {
  const url = `${addon.base}/catalog/${catalog.type}/${encodeURIComponent(catalog.id)}${extraPath(extra)}.json`;
  const data = await getJSON(url);
  return (data?.metas || []).map(normalizeMeta);
}

export async function search(query) {
  const addons = await loadAddons();
  const jobs = [];
  for (const addon of addons) {
    if (!addon.manifest) continue;
    for (const catalog of addon.manifest.catalogs || []) {
      if (!catalogSupportsExtra(catalog, "search")) continue;
      jobs.push(
        fetchCatalog({ addon, catalog }, { search: query })
          .then((items) => ({ addon, catalog, items }))
          .catch(() => ({ addon, catalog, items: [] }))
      );
    }
  }
  return Promise.all(jobs);
}

export async function fetchMeta(type, id) {
  const addons = (await loadAddons()).filter(
    (addon) => addon.manifest && supports(addon, "meta", type, id)
  );
  for (const addon of addons) {
    try {
      const data = await getJSON(`${addon.base}/meta/${type}/${encodeURIComponent(id)}.json`);
      if (data?.meta) return normalizeMeta(data.meta);
    } catch (_) {
      /* try the next add-on */
    }
  }
  return null;
}

// Calls onResult({ addon, streams, error }) as each add-on answers.
export async function fetchStreams(type, videoId, onResult) {
  const addons = (await loadAddons()).filter(
    (addon) => addon.manifest && supports(addon, "stream", type, videoId)
  );
  await Promise.all(
    addons.map(async (addon) => {
      try {
        const data = await getJSON(
          `${addon.base}/stream/${type}/${encodeURIComponent(videoId)}.json`,
          {
            timeout: 25000,
            cache: false
          }
        );
        onResult({ addon, streams: data?.streams || [] });
      } catch (error) {
        onResult({ addon, streams: [], error });
      }
    })
  );
  return addons.length;
}

const METAHUB = "https://images.metahub.space";

export function normalizeMeta(meta = {}) {
  const imdb = /^tt\d+/.test(String(meta.id || "")) ? String(meta.id).match(/^tt\d+/)[0] : "";
  const year = String(meta.releaseInfo || meta.year || "").match(/\d{4}/)?.[0] || "";
  return {
    ...meta,
    year,
    poster: meta.poster || (imdb ? `${METAHUB}/poster/medium/${imdb}/img` : ""),
    background: meta.background || (imdb ? `${METAHUB}/background/medium/${imdb}/img` : ""),
    logo: meta.logo || (imdb ? `${METAHUB}/logo/medium/${imdb}/img` : "")
  };
}
