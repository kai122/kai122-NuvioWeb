// Skip intro / recap / credits / preview. Sources, in order of preference:
// - IntroDB, through an optional relay (its servers only answer introdb.app;
//   see relay/README.md and Settings > Playback > Skip segments);
// - TheIntroDB (theintrodb.org): TV and movies by TMDB id, works from any
//   website, no key (30 requests per 10 s);
// - AniSkip for anime, with the MyAnimeList id from arm.haglund.dev.
// Each kind (intro, recap, credits, preview) comes from the first source
// that has it.
import { pref } from "../prefs.js";
import { tmdbAvailable, tmdbIdFor } from "./tmdb.js";

const ARM = "https://arm.haglund.dev/api/v2";
const ANISKIP = "https://api.aniskip.com/v2";
const THEINTRODB = "https://api.theintrodb.org/v2/media";
const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(url, request);
  return request;
}

// end may be Infinity: "until the end of the video".
const segment = (start, end, kind) =>
  Number.isFinite(start) && (Number.isFinite(end) || end === Infinity) && end > start && start >= 0
    ? { start, end, kind }
    : null;

// TheIntroDB: { intro: [{ start_ms, end_ms }], recap, credits, preview };
// start_ms null = from the start, end_ms null = to the end.
async function fromTheIntroDb({ metaId, season, episode, isMovie }) {
  if (!tmdbAvailable()) return [];
  const tmdbId = await tmdbIdFor(isMovie ? "movie" : "series", metaId).catch(() => null);
  if (!tmdbId) return [];
  const params = new URLSearchParams({ tmdb_id: String(tmdbId) });
  if (!isMovie) {
    if (!(season >= 0) || !(episode > 0)) return [];
    params.set("season", String(season));
    params.set("episode", String(episode));
  }
  const data = await getJSON(`${THEINTRODB}?${params}`);
  if (!data || data.error || (data.type && data.type !== (isMovie ? "movie" : "tv"))) return [];
  const out = [];
  for (const kind of ["intro", "recap", "credits", "preview"]) {
    const first = (Array.isArray(data[kind]) ? data[kind] : [])[0];
    if (!first) continue;
    const start = first.start_ms == null ? 0 : Number(first.start_ms) / 1000;
    const end = first.end_ms == null ? Infinity : Number(first.end_ms) / 1000;
    // An open-ended intro or recap would cover the whole video: skip those.
    if (end === Infinity && (kind === "intro" || kind === "recap")) continue;
    const seg = segment(start, end, kind);
    if (seg) out.push(seg);
  }
  return out;
}

// IntroDB: { intro, recap, outro, post_credits } with start_sec/end_sec.
async function fromIntroDb({ imdbId, season, episode, isMovie }) {
  const relay = String(pref("pb.skipRelay", "") || "")
    .trim()
    .replace(/\/+$/, "");
  if (!relay || !/^https:\/\//i.test(relay) || !imdbId) return [];
  const params = new URLSearchParams({ imdb_id: imdbId });
  if (isMovie) params.set("is_movie", "true");
  else {
    params.set("season", String(season));
    params.set("episode", String(episode));
  }
  const data = await getJSON(`${relay}/segments?${params}`);
  if (!data) return [];
  const pick = (s, kind) => (s ? segment(Number(s.start_sec), Number(s.end_sec), kind) : null);
  return [pick(data.intro, "intro"), pick(data.recap, "recap"), pick(data.outro, "credits")].filter(
    Boolean
  );
}

// Which MyAnimeList entry (and episode number in it) this episode belongs to.
async function animeTarget({ imdbId, kitsuId, season, episode, absoluteEpisode }) {
  if (kitsuId) {
    const entry = await getJSON(`${ARM}/ids?source=kitsu&id=${encodeURIComponent(kitsuId)}`);
    return entry?.myanimelist ? { mal: entry.myanimelist, episode } : null;
  }
  if (!imdbId) return null;
  const list = await getJSON(`${ARM}/imdb?id=${encodeURIComponent(imdbId)}`);
  const entries = (Array.isArray(list) ? list : []).filter(
    (e) => e?.myanimelist && (!e.media || e.media === "TV")
  );
  if (!entries.length) return null;
  const bySeason = entries.find(
    (e) => Number(e["thetvdb-season"] ?? e["themoviedb-season"]) === Number(season)
  );
  if (bySeason) return { mal: bySeason.myanimelist, episode };
  // One long-running entry (e.g. One Piece, Naruto Shippuden): MAL counts
  // episodes from the start, so use the absolute episode number.
  if (entries.length === 1 || season === 1)
    return {
      mal: entries[0].myanimelist,
      episode: season === 1 ? episode : absoluteEpisode || episode
    };
  return { mal: entries[0].myanimelist, episode: absoluteEpisode || episode };
}

async function fromAniSkip(ids) {
  const target = await animeTarget(ids).catch(() => null);
  if (!target?.mal || !(target.episode > 0)) return [];
  const types = ["op", "ed", "recap", "mixed-op", "mixed-ed"].map((t) => `types[]=${t}`).join("&");
  const data = await getJSON(
    `${ANISKIP}/skip-times/${target.mal}/${target.episode}?${types}&episodeLength=0`
  );
  if (!data?.found || !Array.isArray(data.results)) return [];
  const kindOf = {
    op: "intro",
    "mixed-op": "intro",
    ed: "credits",
    "mixed-ed": "credits",
    recap: "recap"
  };
  return data.results
    .map((r) =>
      segment(Number(r.interval?.startTime), Number(r.interval?.endTime), kindOf[r.skipType])
    )
    .filter((s) => s && s.kind);
}

// playback: { type, metaId, videoId, season, episode }, absoluteEpisode optional.
// Returns [{ start, end, kind: "intro" | "recap" | "credits" | "preview" }],
// one per kind; end may be Infinity (to the end of the video).
export async function fetchSkipSegments(playback, { absoluteEpisode = 0 } = {}) {
  if (!pref("pb.skipIntro", true)) return [];
  const imdbId = String(playback.metaId || "").match(/^tt\d+/)?.[0] || "";
  const kitsuId =
    String(playback.metaId || playback.videoId || "").match(/^kitsu:(\d+)/)?.[1] || "";
  const isMovie = playback.type === "movie";
  const season = Number(playback.season) || 0;
  const episode = Number(playback.episode) || 0;
  const [introDb, theIntroDb, aniSkip] = await Promise.all([
    kitsuId ? [] : fromIntroDb({ imdbId, season, episode, isMovie }),
    kitsuId ? [] : fromTheIntroDb({ metaId: playback.metaId, season, episode, isMovie }),
    isMovie || !episode ? [] : fromAniSkip({ imdbId, kitsuId, season, episode, absoluteEpisode })
  ]);
  const chosen = new Map();
  for (const s of [...introDb, ...theIntroDb, ...aniSkip])
    if (!chosen.has(s.kind)) chosen.set(s.kind, s);
  return [...chosen.values()].sort((a, b) => a.start - b.start);
}
