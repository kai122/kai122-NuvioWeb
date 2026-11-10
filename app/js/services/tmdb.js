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

// --- Collections (Nuvio's collection sources) ------------------------------------
// Source: { tmdbSourceType: DISCOVER|NETWORK|COMPANY|COLLECTION|DIRECTOR|PERSON|LIST,
//           tmdbId, mediaType: MOVIE|TV, sortBy, filters }
// Returns { items: [{ tmdbId, type, name, poster, background, year, rating }], hasMore }.
function setParam(params, key, value) {
  if (value !== undefined && value !== null && value !== "") params[key] = String(value);
}

function discoverFilters(params, filters = {}, isTv) {
  setParam(params, "with_genres", filters.withGenres);
  setParam(params, "without_genres", filters.withoutGenres);
  setParam(
    params,
    isTv ? "first_air_date.gte" : "primary_release_date.gte",
    filters.releaseDateGte
  );
  setParam(
    params,
    isTv ? "first_air_date.lte" : "primary_release_date.lte",
    filters.releaseDateLte
  );
  setParam(params, "vote_average.gte", filters.voteAverageGte);
  setParam(params, "vote_average.lte", filters.voteAverageLte);
  setParam(params, "vote_count.gte", filters.voteCountGte);
  setParam(params, "with_original_language", filters.withOriginalLanguage);
  setParam(params, "with_origin_country", filters.withOriginCountry);
  setParam(params, "with_keywords", filters.withKeywords);
  setParam(params, "without_keywords", filters.withoutKeywords);
  setParam(params, "with_companies", filters.withCompanies);
  setParam(params, "without_companies", filters.withoutCompanies);
  if (isTv) setParam(params, "with_networks", filters.withNetworks);
  if (Number(filters.year) > 0)
    params[isTv ? "first_air_date_year" : "year"] = String(Math.trunc(Number(filters.year)));
  if (filters.withWatchProviders || filters.withoutWatchProviders)
    setParam(params, "watch_region", filters.watchRegion || "US");
  if (filters.withWatchProviders) {
    setParam(params, "with_watch_providers", filters.withWatchProviders);
    params.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
  }
  setParam(params, "without_watch_providers", filters.withoutWatchProviders);
}

function listItem(item, mediaType) {
  const media = item.media_type || mediaType;
  if (!item?.id || (media !== "movie" && media !== "tv")) return null;
  const name = item.title || item.name || item.original_title || item.original_name;
  if (!name) return null;
  return {
    tmdbId: item.id,
    type: media === "tv" ? "series" : "movie",
    name,
    poster: image(item.poster_path, "w342"),
    background: image(item.backdrop_path, "w780"),
    year: String(item.release_date || item.first_air_date || "").slice(0, 4),
    rating: typeof item.vote_average === "number" ? item.vote_average : null,
    votes: item.vote_count || 0,
    popularity: item.popularity || 0
  };
}

function sortItems(items, sortBy) {
  const list = [...items];
  if (sortBy === "vote_average.desc")
    return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  if (sortBy === "vote_count.desc") return list.sort((a, b) => b.votes - a.votes);
  if (sortBy === "popularity.desc") return list.sort((a, b) => b.popularity - a.popularity);
  if (sortBy === "primary_release_date.desc" || sortBy === "first_air_date.desc")
    return list.sort((a, b) => String(b.year).localeCompare(String(a.year)));
  return list;
}

export async function tmdbSourceItems(source = {}, page = 1) {
  if (!tmdbAvailable()) throw new Error("TMDB key needed");
  const lang = language();
  const type = String(source.tmdbSourceType || "DISCOVER").toUpperCase();
  const mediaType =
    type === "NETWORK" || String(source.mediaType || "MOVIE").toUpperCase() === "TV"
      ? "tv"
      : "movie";
  const isTv = mediaType === "tv";
  const dedupe = (items) => {
    const seen = new Set();
    return items.filter(
      (i) => i && !seen.has(`${i.type}:${i.tmdbId}`) && seen.add(`${i.type}:${i.tmdbId}`)
    );
  };
  if (type === "COLLECTION") {
    if (page > 1) return { items: [], hasMore: false };
    const data = await get(`/collection/${source.tmdbId}`, { language: lang });
    const parts = (data.parts || []).sort((a, b) =>
      String(a.release_date || "9999").localeCompare(String(b.release_date || "9999"))
    );
    return {
      items: sortItems(dedupe(parts.map((p) => listItem(p, "movie"))), source.sortBy),
      hasMore: false
    };
  }
  if (type === "LIST") {
    const data = await get(`/list/${source.tmdbId}`, { language: lang, page });
    return {
      items: sortItems(
        dedupe((data.items || []).map((i) => listItem(i, mediaType))),
        source.sortBy
      ),
      hasMore: Number(data.page || page) < Number(data.total_pages || page)
    };
  }
  if (type === "PERSON" || type === "DIRECTOR") {
    if (page > 1) return { items: [], hasMore: false };
    const data = await get(`/person/${source.tmdbId}/combined_credits`, { language: lang });
    const entries =
      type === "DIRECTOR"
        ? (data.crew || []).filter((c) => String(c.job).toLowerCase() === "director")
        : data.cast || [];
    return {
      items: sortItems(dedupe(entries.map((i) => listItem(i, mediaType))), source.sortBy),
      hasMore: false
    };
  }
  const params = {
    language: lang,
    page,
    sort_by:
      source.sortBy && source.sortBy !== "original"
        ? source.sortBy
        : isTv
          ? "first_air_date.desc"
          : "popularity.desc"
  };
  const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
  discoverFilters(params, filters, isTv);
  if (type === "COMPANY" && source.tmdbId) params.with_companies = String(source.tmdbId);
  if (type === "NETWORK" && source.tmdbId) {
    params.with_networks = String(source.tmdbId);
    params["first_air_date.lte"] = filters.releaseDateLte || new Date().toISOString().slice(0, 10);
    params.with_status = "0|3|4";
  }
  const data = await get(`/discover/${mediaType}`, params);
  return {
    items: dedupe((data.results || []).map((i) => listItem(i, mediaType))),
    hasMore: Number(data.page || page) < Math.min(Number(data.total_pages || 1), 500)
  };
}
