// MDBList ratings (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, ...).
// Needs the user's own API key from mdblist.com.
import { pref } from "../prefs.js";

const cache = new Map();

export function mdblistEnabled() {
  return !!pref("mdb.on", false) && !!String(pref("mdb.key", "") || "").trim();
}

const LABELS = {
  imdb: "IMDb",
  tmdb: "TMDB",
  trakt: "Trakt",
  letterboxd: "Letterboxd",
  tomatoes: "Rotten Tomatoes",
  popcorn: "Audience",
  metacritic: "Metacritic",
  rogerebert: "Roger Ebert",
  myanimelist: "MAL"
};

// Returns [{ source, label, value }] or [].
export async function fetchRatings(type, id) {
  if (!mdblistEnabled()) return [];
  const imdb = String(id || "").match(/^tt\d+/)?.[0];
  if (!imdb) return [];
  const key = String(pref("mdb.key", "")).trim();
  const url = `https://api.mdblist.com/imdb/${type === "series" ? "show" : "movie"}/${imdb}?apikey=${encodeURIComponent(key)}`;
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  const data = await cache.get(url);
  return (Array.isArray(data?.ratings) ? data.ratings : [])
    .filter((r) => r && LABELS[r.source] && (r.value || r.score))
    .map((r) => ({
      source: r.source,
      label: LABELS[r.source],
      value:
        r.source === "tomatoes" || r.source === "popcorn" || r.source === "metacritic"
          ? `${Math.round(r.value ?? r.score)}${r.source === "metacritic" ? "" : "%"}`
          : String(r.value ?? (r.score / 10).toFixed(1))
    }));
}
