// "Episode release alerts": when the app opens, check saved series for
// episodes released since the last check. A web app can't schedule alerts
// while it's closed, so this runs at launch.
import { pref } from "../prefs.js";
import { store } from "../store.js";
import { fetchMeta } from "../addons.js";
import { toast } from "../sheet.js";

const MAX_SHOWS = 25;

function latestReleased(meta) {
  const now = Date.now();
  let best = null;
  for (const v of meta.videos || []) {
    const t = new Date(v.released || v.firstAired || "").getTime();
    if (!Number.isFinite(t) || t > now || !(Number(v.season) > 0)) continue;
    if (!best || t > best.t)
      best = { t, id: v.id, season: v.season, episode: v.episode ?? v.number };
  }
  return best;
}

export async function checkReleaseAlerts() {
  if (!pref("notif.episodes", false)) return;
  const shows = store
    .library()
    .filter((item) => item.type === "series")
    .slice(0, MAX_SHOWS);
  if (!shows.length) return;
  const seen = store.seenEpisodes();
  const fresh = [];
  for (const show of shows) {
    try {
      const meta = await fetchMeta("series", show.id);
      const latest = meta && latestReleased(meta);
      if (!latest) continue;
      const before = seen[show.id];
      if (before && before !== latest.id) fresh.push({ name: show.name, ...latest });
      seen[show.id] = latest.id;
    } catch (_) {
      /* skip this show */
    }
  }
  store.saveSeenEpisodes(seen);
  if (!fresh.length) return;
  const text =
    fresh.length === 1
      ? `New episode: ${fresh[0].name} S${fresh[0].season} E${fresh[0].episode}`
      : `New episodes for ${fresh.length} of your shows`;
  toast(text);
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      for (const item of fresh.slice(0, 3)) {
        new Notification("New episode", {
          body: `${item.name} · S${item.season} E${item.episode}`
        });
      }
    }
  } catch (_) {
    /* iPadOS only allows notifications for Home Screen apps */
  }
}
