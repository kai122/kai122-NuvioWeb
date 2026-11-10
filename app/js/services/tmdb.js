// TMDB enrichment: artwork, descriptions, cast with photos, companies,
// trailers, recommendations, collections and episode details. Every module can
// be switched off in Settings > Services > Integrations > TMDB Enrichment.
import { pref } from "../prefs.js";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const cache = new Map();

function apiKey() {
  const own = String(pref("tmdb.key", "") || "").trim();
  if (own) return own;
  return String(window.NUVIO_TOUCH_ENV?.tmdbKey || "").trim();
}

export function tmdbAvailable() {
  return !!pref("tmdb.on", true) && !!apiKey();
}

export function tmdbModule(name) {
  return tmdbAvailable() && !!pref(`tmdb.m.${name}`, true);
}

function language() {
  const raw = String(pref("tmdb.lang", "") || "").trim();
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(raw)) return raw;
  const nav = navigator.language || "en-US";
  return /^[a-z]{2}-[A-Z]{2}$/.test(nav) ? nav : "en-US";
}

export function image(path, size = "w500") {
  return path ? `${IMG}/${size}${path}` : "";
}

async function get(path, params = {}) {
  const key = apiKey();
  if (!key) throw new Error("No TMDB key");
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  // v4 read access tokens are JWTs; v3 keys go in the query string.
  const bearer = key.startsWith("eyJ");
  if (!bearer) url.searchParams.set("api_key", key);
  const cacheKey = url.href;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url.href, {
        signal: controller.signal,
        headers: bearer ? { Authorization: `Bearer ${key}` } : {}
      });
      if (!response.ok) throw new Error(`TMDB ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(cacheKey, request);
  request.catch(() => cache.delete(cacheKey));
  return request;
}

const kindOf = (type) => (type === "series" ? "tv" : "movie");

// Finds the TMDB id for an add-on id (tt1234567, tmdb:123 or tt123:1:2).
export async function tmdbIdFor(type, id) {
  const text = String(id || "");
  const direct = text.match(/^tmdb:(\d+)/);
  if (direct) return Number(direct[1]);
  const imdb = text.match(/^tt\d+/)?.[0];
  if (!imdb) return null;
  const found = await get(`/find/${imdb}`, { external_source: "imdb_id" });
  const list = type === "series" ? found.tv_results : found.movie_results;
  return list?.[0]?.id ?? null;
}

export async function imdbIdFor(type, tmdbId) {
  const data = await get(`/${kindOf(type)}/${tmdbId}/external_ids`);
  return data?.imdb_id || null;
}

function pickLogo(logos, lang) {
  const short = lang.slice(0, 2);
  const list = logos || [];
  return (
    list.find((l) => l.iso_639_1 === short) ||
    list.find((l) => l.iso_639_1 === "en") ||
    list.find((l) => !l.iso_639_1) ||
    list[0] ||
    null
  );
}

function certificationOf(data, type) {
  if (type === "series") {
    const ratings = data.content_ratings?.results || [];
    const r = ratings.find((x) => x.iso_3166_1 === "US") || ratings.find((x) => x.rating);
    return r?.rating || "";
  }
  const all = data.release_dates?.results || [];
  const pick = (entry) => entry?.release_dates?.find((d) => d.certification)?.certification || "";
  return pick(all.find((x) => x.iso_3166_1 === "US")) || pick(all.find((x) => pick(x))) || "";
}

function runtimeText(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Returns a new meta object with TMDB data merged in (or the original meta if
// TMDB is off, has no key, or doesn't know the title).
export async function enrichMeta(meta) {
  if (!meta || !tmdbAvailable()) return meta;
  const type = meta.type;
  const lang = language();
  const tmdbId = await tmdbIdFor(type, meta.id);
  if (!tmdbId) return meta;
  const data = await get(`/${kindOf(type)}/${tmdbId}`, {
    language: lang,
    append_to_response: [
      "credits",
      "videos",
      "images",
      "recommendations",
      type === "series" ? "content_ratings" : "release_dates"
    ].join(","),
    include_image_language: `${lang.slice(0, 2)},en,null`,
    include_video_language: `${lang.slice(0, 2)},en`
  });
  const out = { ...meta, tmdbId };

  if (tmdbModule("artwork")) {
    const logo = pickLogo(data.images?.logos, lang);
    if (logo) out.logo = image(logo.file_path, "w500");
    if (data.backdrop_path) out.background = image(data.backdrop_path, "w1280");
    if (!meta.poster && data.poster_path) out.poster = image(data.poster_path, "w500");
  }
  if (tmdbModule("basic_info")) {
    if (data.overview) out.description = data.overview;
    if (data.genres?.length) out.genres = data.genres.map((g) => g.name);
    if (data.vote_average) out.tmdbRating = data.vote_average.toFixed(1);
    if (data.title || data.name) out.localName = data.title || data.name;
  }
  if (tmdbModule("details")) {
    const minutes = data.runtime || data.episode_run_time?.[0];
    if (minutes) out.runtime = runtimeText(minutes);
    if (data.status) out.status = data.status;
    const countries = (data.production_countries || []).map((c) => c.name);
    if (countries.length) out.country = countries;
    const langs = (data.spoken_languages || []).map((l) => l.english_name || l.name);
    if (langs.length) out.language = langs;
    if (data.release_date || data.first_air_date)
      out.released = data.release_date || data.first_air_date;
  }
  const cert = certificationOf(data, type);
  if (cert) out.certification = cert;
  if (tmdbModule("credits") && data.credits) {
    out.castFull = (data.credits.cast || []).slice(0, 20).map((c) => ({
      name: c.name,
      character: c.character || "",
      photo: image(c.profile_path, "w185")
    }));
    const crew = data.credits.crew || [];
    const directors = crew.filter((c) => c.job === "Director").map((c) => c.name);
    const writers = crew.filter((c) => c.department === "Writing").map((c) => c.name);
    const creators = (data.created_by || []).map((c) => c.name);
    if (directors.length) out.director = directors;
    if (writers.length) out.writer = [...new Set(writers)];
    if (creators.length) out.creators = creators;
  }
  if (tmdbModule("production_companies")) {
    out.companies = (data.production_companies || []).map((c) => ({
      name: c.name,
      logo: image(c.logo_path, "w185")
    }));
  }
  if (tmdbModule("networks") && data.networks?.length) {
    out.networks = data.networks.map((n) => ({ name: n.name, logo: image(n.logo_path, "w185") }));
  }
  if (tmdbModule("trailers")) {
    const videos = (data.videos?.results || []).filter(
      (v) => v.site === "YouTube" && /^[\w-]{6,20}$/.test(v.key)
    );
    const ordered = [
      ...videos.filter((v) => v.type === "Trailer" && v.official),
      ...videos.filter((v) => v.type === "Trailer" && !v.official),
      ...videos.filter((v) => v.type === "Teaser")
    ];
    if (ordered.length)
      out.trailers = ordered.slice(0, 5).map((v) => ({ ytId: v.key, name: v.name }));
  }
  if (tmdbModule("more_like_this")) {
    out.recommendations = (data.recommendations?.results || [])
      .filter((r) => r.poster_path)
      .slice(0, 20)
      .map((r) => ({
        tmdbId: r.id,
        type,
        name: r.title || r.name,
        poster: image(r.poster_path, "w342"),
        background: image(r.backdrop_path, "w780"),
        year: String(r.release_date || r.first_air_date || "").slice(0, 4)
      }));
  }
  if (tmdbModule("collections") && data.belongs_to_collection?.id) {
    try {
      const col = await get(`/collection/${data.belongs_to_collection.id}`, { language: lang });
      const parts = (col.parts || [])
        .filter((p) => p.poster_path)
        .sort((a, b) =>
          String(a.release_date || "9999").localeCompare(String(b.release_date || "9999"))
        )
        .map((p) => ({
          tmdbId: p.id,
          type: "movie",
          name: p.title,
          poster: image(p.poster_path, "w342"),
          year: String(p.release_date || "").slice(0, 4)
        }));
      if (parts.length > 1) out.collection = { name: col.name, parts };
    } catch (_) {
      /* collection is optional */
    }
  }
  if (type === "series" && tmdbModule("season_posters")) {
    out.seasonPosters = Object.fromEntries(
      (data.seasons || [])
        .filter((s) => s.poster_path)
        .map((s) => [s.season_number, image(s.poster_path, "w185")])
    );
  }
  return out;
}

// Episode titles, overviews, stills and runtimes for one season.
export async function seasonDetails(tmdbId, season) {
  if (!tmdbId || !tmdbModule("episodes")) return null;
  const data = await get(`/tv/${tmdbId}/season/${season}`, { language: language() });
  const map = new Map();
  for (const ep of data.episodes || []) {
    map.set(ep.episode_number, {
      title: ep.name,
      overview: ep.overview,
      thumbnail: image(ep.still_path, "w500"),
      runtime: runtimeText(ep.runtime),
      rating: ep.vote_average ? ep.vote_average.toFixed(1) : "",
      released: ep.air_date
    });
  }
  return map;
}
