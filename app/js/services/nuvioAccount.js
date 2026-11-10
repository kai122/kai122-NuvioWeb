// Nuvio account: code sign-in (like the TV apps) and a download of your
// profiles, add-ons, Continue Watching, watched history and library.
// Download only: nothing here writes to your Nuvio account.
import { store, PROFILE_COLORS } from "../store.js";
import { fetchMeta } from "../addons.js";
import { pref } from "../prefs.js";

const BASE = "https://api.nuvio.tv";
const KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN"; // Nuvio's public client key
const LOGIN_PAGE = "https://nuvio.tv/tv-login";
const ACCOUNT_KEY = "nuvioTouch.account";
const EPISODE_PREFIX = "__nuvio_episode__:";
const MAX_SECONDS_VALUE = 8 * 60 * 60;

export const CLOUD_PREFIX = "nuvio-";

function readAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function writeAccount(value) {
  try {
    if (value) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(value));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch (_) {
    /* storage blocked */
  }
}

export function account() {
  const a = readAccount();
  return a?.accessToken ? a : null;
}

function emailOf(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).email || "";
  } catch (_) {
    return "";
  }
}

async function call(path, { method = "POST", body, token = KEY } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(BASE + path, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: KEY,
        Authorization: `Bearer ${token}`
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }
    if (!response.ok) {
      const error = new Error(
        data?.message || data?.msg || `Nuvio server error ${response.status}`
      );
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function refresh() {
  const a = readAccount();
  if (!a?.refreshToken) throw new Error("Signed out");
  const data = await call("/auth/v1/token?grant_type=refresh_token", {
    body: { refresh_token: a.refreshToken }
  });
  const next = {
    ...a,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || a.refreshToken
  };
  writeAccount(next);
  return next;
}

// Authenticated call with one token refresh on 401.
async function authed(path, options = {}) {
  let a = account();
  if (!a) throw new Error("Signed out");
  try {
    return await call(path, { ...options, token: a.accessToken });
  } catch (error) {
    if (error.status !== 401) throw error;
    a = await refresh();
    return call(path, { ...options, token: a.accessToken });
  }
}

// --- Sign-in ------------------------------------------------------------------
// Returns { code, url, expiresAt, finish(): Promise<boolean>, cancel() }.
export async function startSignIn() {
  let anon;
  try {
    anon = await call("/auth/v1/signup", { body: { data: { tv_client: "web" } } });
  } catch (_) {
    anon = await call("/auth/v1/token?grant_type=anonymous", { body: {} });
  }
  const anonToken = anon?.access_token;
  if (!anonToken) throw new Error("The Nuvio server didn't start a sign-in");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const res = await call("/rest/v1/rpc/start_tv_login_session", {
    token: anonToken,
    body: {
      p_device_nonce: nonce,
      p_redirect_base_url: LOGIN_PAGE,
      p_device_name: "Nuvio Touch (iPad web)"
    }
  });
  const row = Array.isArray(res) ? res[0] : res;
  const code = String(row?.code || row?.user_code || "");
  if (!code) throw new Error("The Nuvio server didn't return a code");
  const url = row.qr_content || row.web_url || `${LOGIN_PAGE}?code=${encodeURIComponent(code)}`;
  let cancelled = false;
  async function finish() {
    const until = new Date(row.expires_at || Date.now() + 10 * 60000).getTime();
    while (!cancelled && Date.now() < until) {
      const poll = await call("/rest/v1/rpc/poll_tv_login_session", {
        token: anonToken,
        body: { p_code: code, p_device_nonce: nonce }
      }).catch(() => null);
      const status = (Array.isArray(poll) ? poll[0] : poll)?.status;
      if (status === "approved") {
        const tokens = await call("/functions/v1/tv-logins-exchange", {
          token: anonToken,
          body: { code, device_nonce: nonce }
        });
        if (!tokens?.access_token) throw new Error("Sign-in was approved but no session came back");
        writeAccount({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          email: emailOf(tokens.access_token),
          signedInAt: Date.now()
        });
        return true;
      }
      if (status && status !== "pending") throw new Error(`Sign-in ${status}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  }
  return { code, url, expiresAt: row.expires_at, finish, cancel: () => (cancelled = true) };
}

export async function signOut() {
  const a = account();
  if (a)
    await call("/auth/v1/logout?scope=local", { token: a.accessToken, body: {} }).catch(() => {});
  writeAccount(null);
}

// --- Download -----------------------------------------------------------------
function toMs(row, field) {
  const ms = row[`${field}_ms`];
  if (ms != null) return Number(ms) || 0;
  const raw = Number(row[field] || 0);
  const pairIsMs = Number(row.duration || 0) > MAX_SECONDS_VALUE;
  return pairIsMs || raw > MAX_SECONDS_VALUE ? raw : raw * 1000;
}

function timeOf(value) {
  if (value == null) return Date.now();
  const n = Number(value);
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function videoIdOf(row) {
  const contentId = String(row.content_id || "");
  const raw = String(row.video_id || "");
  const season = row.season ?? row.season_number;
  const episode = row.episode ?? row.episode_number;
  if (raw && raw !== contentId && raw !== "main" && !raw.startsWith(EPISODE_PREFIX)) return raw;
  if (season != null && episode != null && Number(episode) > 0)
    return `${contentId}:${Number(season)}:${Number(episode)}`;
  return contentId;
}

async function withLimit(items, limit, task) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const index = i++;
        out[index] = await task(items[index]).catch(() => null);
      }
    })
  );
  return out;
}

// What downloaded completely this session, per profile. Uploads that send a
// full list (watched, library, add-ons, collections) only run for parts that
// came down whole, so an upload can never drop things the app didn't see.
const complete = new Map(); // profileId -> Set of kinds
export function downloadedKinds(profileId) {
  return complete.get(profileId) || new Set();
}
let downloading = false;
export function isDownloading() {
  return downloading;
}

async function pullPaged(fn, profileIndex, pageParams) {
  const all = [];
  for (let page = 0; page < 50; page += 1) {
    const { size, ...params } = pageParams(page); // size is ours, not sent
    const rows = await authed(`/rest/v1/rpc/${fn}`, {
      body: { p_profile_id: profileIndex, ...params }
    });
    if (!Array.isArray(rows)) throw new Error(`${fn} returned an invalid page`);
    all.push(...rows);
    if (rows.length < size) return all;
  }
  return all;
}

// Downloads everything and writes it into this app's local store.
// Returns a summary { profiles, addons, progress, watched, library, collections }.
export async function downloadAccount() {
  downloading = true;
  try {
    return await downloadAll();
  } finally {
    downloading = false;
  }
}

async function downloadAll() {
  const owner = await authed("/rest/v1/rpc/get_sync_owner", { body: {} });
  const remoteProfiles = (await authed("/rest/v1/rpc/sync_pull_profiles", { body: {} })) || [];
  const profiles = remoteProfiles
    .map((p) => ({
      index: Number(p.profile_index || p.id || 1),
      name: p.name || `Profile ${p.profile_index || 1}`,
      color: /^#[0-9a-f]{6}$/i.test(p.avatar_color_hex || "") ? p.avatar_color_hex : null
    }))
    .sort((a, b) => a.index - b.index);
  if (!profiles.length) profiles.push({ index: 1, name: "Profile 1", color: null });

  const summary = {
    profiles: profiles.length,
    addons: 0,
    progress: 0,
    watched: 0,
    library: 0,
    collections: 0
  };
  const local = store.profiles().filter((p) => !String(p.id).startsWith(CLOUD_PREFIX));
  const cloud = profiles.map((p, i) => ({
    id: `${CLOUD_PREFIX}${p.index}`,
    name: p.name,
    color: p.color || PROFILE_COLORS[i % PROFILE_COLORS.length],
    cloud: true
  }));
  store.saveProfiles([...cloud, ...local]);

  const ownerFilter = owner ? `user_id=eq.${encodeURIComponent(owner)}&` : "";
  for (const p of profiles) {
    const profileId = `${CLOUD_PREFIX}${p.index}`;
    const done = new Set();
    const attempt = (kind, promise) =>
      promise.then(
        (value) => {
          done.add(kind);
          return value;
        },
        () => null
      );
    const [addonRows, progressRows, watchedRows, libraryRows, collectionRows] = await Promise.all([
      attempt(
        "addons",
        authed(
          `/rest/v1/addons?${ownerFilter}profile_id=eq.${p.index}&select=url,sort_order,enabled,name&order=sort_order.asc`,
          {
            method: "GET"
          }
        )
      ),
      attempt(
        "progress",
        authed("/rest/v1/rpc/sync_pull_watch_progress", { body: { p_profile_id: p.index } })
      ),
      attempt(
        "watched",
        pullPaged("sync_pull_watched_items", p.index, (page) => ({
          p_page: page + 1,
          p_page_size: 900,
          size: 900
        }))
      ),
      attempt(
        "library",
        pullPaged("sync_pull_library", p.index, (page) => ({
          p_limit: 500,
          p_offset: page * 500,
          size: 500
        }))
      ),
      attempt(
        "collections",
        authed("/rest/v1/rpc/sync_pull_collections", { body: { p_profile_id: p.index } })
      )
    ]);
    complete.set(profileId, done);

    // Add-ons (per profile, in the account's order)
    if (addonRows) {
      const urls = addonRows
        .map((r) => String(r.url || "").trim())
        .filter((u) => /^https?:\/\//i.test(u));
      const disabled = addonRows
        .filter((r) => r.enabled === false)
        .map((r) => String(r.url).trim());
      if (urls.length) store.saveProfileAddons(profileId, urls, disabled);
      summary.addons += urls.length;
    }

    // Watched (with the details needed to upload it again)
    if (watchedRows) {
      const info = {};
      for (const r of watchedRows) {
        if (!r.content_id) continue;
        const id = videoIdOf(r);
        info[id] = {
          contentId: r.content_id,
          type: r.content_type || "movie",
          season: r.season == null ? null : Number(r.season),
          episode: r.episode == null ? null : Number(r.episode),
          title: r.title || "",
          at: timeOf(r.watched_at)
        };
      }
      store.mergeForProfile(profileId, "watched", Object.keys(info));
      store.mergeWatchedInfo(profileId, info);
      rememberWatched(profileId, store.readForProfile(profileId, "watched", []));
      summary.watched += Object.keys(info).length;
    }

    // Library
    if (libraryRows) {
      const library = libraryRows
        .filter((r) => r.content_id)
        .map((r) => ({
          id: r.content_id,
          type: r.content_type || "movie",
          name: r.name || r.title || "",
          poster: r.poster || "",
          background: r.background || "",
          description: r.description || "",
          year: String(r.release_info || "").match(/\d{4}/)?.[0] || "",
          releaseInfo: r.release_info || "",
          posterShape: r.poster_shape || "",
          addonBaseUrl: r.addon_base_url || "",
          addedAt: timeOf(r.added_at || r.updated_at || r.created_at)
        }))
        .sort((a, b) => b.addedAt - a.addedAt);
      store.mergeForProfile(profileId, "library", library);
      summary.library += library.length;
    }

    // Collections
    if (collectionRows) {
      const blob = Array.isArray(collectionRows) ? collectionRows[0] : collectionRows;
      let list = blob?.collections_json ?? blob?.collectionsJson ?? [];
      if (typeof list === "string") {
        try {
          list = JSON.parse(list);
        } catch (_) {
          list = [];
        }
      }
      if (Array.isArray(list) && list.length) {
        store.saveForProfile(profileId, "collections", list);
        summary.collections += list.length;
      }
    }

    // Continue Watching: add titles and artwork from the add-ons.
    if (progressRows) {
      const rows = progressRows.filter((r) => r.content_id);
      const metas = new Map();
      const ids = [...new Set(rows.map((r) => `${r.content_type || "movie"}|${r.content_id}`))];
      await withLimit(ids, 4, async (key) => {
        const [type, id] = key.split("|");
        metas.set(key, await fetchMeta(type, id));
      });
      const progress = {};
      for (const r of rows) {
        const type = r.content_type || "movie";
        const meta = metas.get(`${type}|${r.content_id}`) || {};
        const videoId = videoIdOf(r);
        const season = r.season ?? r.season_number;
        const episode = r.episode ?? r.episode_number;
        const video = (meta.videos || []).find((v) => v.id === videoId);
        const durationMs = toMs(r, "duration");
        const positionMs = toMs(r, "position");
        if (!(durationMs > 0) || positionMs <= 0) continue;
        progress[videoId] = {
          type,
          metaId: r.content_id,
          videoId,
          name: meta.name || r.name || r.content_id,
          poster: meta.poster || "",
          background: meta.background || "",
          logo: meta.logo || "",
          year: meta.year || "",
          description: meta.description || "",
          season: season != null && Number(episode) > 0 ? Number(season) : undefined,
          episode: season != null && Number(episode) > 0 ? Number(episode) : undefined,
          episodeTitle: video?.title || video?.name || "",
          thumbnail: video?.thumbnail || "",
          remoteVideoId: r.video_id || "",
          time: positionMs / 1000,
          duration: durationMs / 1000,
          updatedAt: timeOf(r.updated_at ?? r.last_watched)
        };
      }
      store.mergeForProfile(profileId, "progress", progress);
      rememberProgressKeys(profileId, Object.values(progress));
      summary.progress += Object.keys(progress).length;
    }
  }

  const a = readAccount();
  if (a) writeAccount({ ...a, lastSync: Date.now(), lastSummary: summary });
  window.dispatchEvent(new Event("nuvio:addons-changed"));
  window.dispatchEvent(new Event("nuvio:collections-changed"));
  return summary;
}

// --- Upload (two-way sync) ------------------------------------------------------
// Mirrors what Nuvio's own apps send. Rules:
// - never send an empty list (an empty list must never mean "delete all");
// - progress deletions go through Nuvio's delete function, per item;
// - full-list uploads (watched, library, add-ons) only after that list was
//   downloaded completely this session.
const MIN_PROGRESS_SYNC_MS = 60000;

function clientId() {
  try {
    let id = localStorage.getItem("nuvioTouch.clientId");
    if (!/^[A-Za-z0-9_-]{16,96}$/.test(id || "")) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = `nuvio-touch-${[...bytes].map((b) => (b % 36).toString(36)).join("")}`;
      localStorage.setItem("nuvioTouch.clientId", id);
    }
    return id;
  } catch (_) {
    return "nuvio-touch-volatile-client";
  }
}

const profileIndex = (profileId) => Number(String(profileId).slice(CLOUD_PREFIX.length)) || 1;

function progressKey(entry) {
  const season = Number(entry.season);
  const episode = Number(entry.episode);
  if (entry.metaId && Number.isInteger(season) && season >= 0 && episode > 0)
    return `${entry.metaId}_s${season}e${episode}`;
  return String(entry.metaId || "");
}

function baselineKey(profileId) {
  return `nuvioTouch.syncBaseline.${profileId}`;
}
function rememberProgressKeys(profileId, entries) {
  try {
    const keys = [...new Set(entries.map(progressKey).filter(Boolean))];
    localStorage.setItem(baselineKey(profileId), JSON.stringify(keys));
  } catch (_) {
    /* ignore */
  }
}
function baselineKeys(profileId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(baselineKey(profileId)) || "[]"));
  } catch (_) {
    return new Set();
  }
}

async function pushProgress(profileId) {
  const p = profileIndex(profileId);
  const entries = Object.values(store.readForProfile(profileId, "progress", {})).filter(
    (e) => e?.metaId
  );
  const currentKeys = new Set(entries.map(progressKey));
  const removed = [...baselineKeys(profileId)].filter((k) => k && !currentKeys.has(k));
  if (removed.length) {
    await authed("/rest/v1/rpc/sync_delete_watch_progress", {
      body: { p_profile_id: p, p_keys: removed, p_origin_client_id: clientId() }
    });
  }
  const rows = entries
    .filter((e) => !(e.duration > 0) || e.duration * 1000 >= MIN_PROGRESS_SYNC_MS)
    .map((e) => {
      const episodic = Number(e.episode) > 0 && e.season != null;
      return {
        content_id: e.metaId,
        content_type: e.type || "movie",
        video_id: e.remoteVideoId || (e.videoId && e.videoId !== e.metaId ? e.videoId : e.metaId),
        season: episodic ? Number(e.season) : null,
        episode: episodic ? Number(e.episode) : null,
        position: Math.max(0, Math.trunc((e.time || 0) * 1000)),
        duration: Math.max(0, Math.trunc((e.duration || 0) * 1000)),
        last_watched: Number(e.updatedAt || Date.now()),
        progress_key: progressKey(e)
      };
    });
  if (rows.length) {
    await authed("/rest/v1/rpc/sync_push_watch_progress", {
      body: { p_profile_id: p, p_entries: rows, p_origin_client_id: clientId() }
    });
  }
  rememberProgressKeys(profileId, entries);
}

function watchedBaseline(profileId) {
  try {
    return new Set(
      JSON.parse(localStorage.getItem(`nuvioTouch.watchedBaseline.${profileId}`) || "[]")
    );
  } catch (_) {
    return new Set();
  }
}
function rememberWatched(profileId, ids) {
  try {
    localStorage.setItem(
      `nuvioTouch.watchedBaseline.${profileId}`,
      JSON.stringify([...new Set(ids)])
    );
  } catch (_) {
    /* ignore */
  }
}

async function pushWatched(profileId) {
  if (!downloadedKinds(profileId).has("watched")) return;
  const info = store.watchedInfo(profileId);
  const ids = store.readForProfile(profileId, "watched", []);
  // Un-marked since the last sync: delete those on the account.
  const current = new Set(ids);
  const removed = [...watchedBaseline(profileId)]
    .filter((id) => !current.has(id) && info[id]?.contentId)
    .map((id) => {
      const key = { content_id: info[id].contentId };
      if (info[id].season != null) key.season = Number(info[id].season);
      if (info[id].episode != null) key.episode = Number(info[id].episode);
      return key;
    });
  if (removed.length) {
    await authed("/rest/v1/rpc/sync_delete_watched_items", {
      body: { p_profile_id: profileIndex(profileId), p_keys: removed }
    });
  }
  rememberWatched(profileId, ids);
  const items = ids
    .map((id) => {
      const i = info[id];
      if (i?.contentId) return i;
      const m = String(id).match(/^(tt\d+):(\d+):(\d+)$/);
      if (m)
        return {
          contentId: m[1],
          type: "series",
          season: Number(m[2]),
          episode: Number(m[3]),
          title: "",
          at: Date.now()
        };
      return null;
    })
    .filter(Boolean)
    // A whole series marked watched has no single episode to send.
    .filter((i) => i.type !== "series" || i.episode != null);
  if (!items.length) return;
  await authed("/rest/v1/rpc/sync_push_watched_items", {
    body: {
      p_profile_id: profileIndex(profileId),
      p_items: items.map((i) => ({
        content_id: i.contentId,
        content_type: i.type || "movie",
        title: i.title || "",
        season: i.season == null ? null : Number(i.season),
        episode: i.episode == null ? null : Number(i.episode),
        watched_at: Number(i.at || Date.now())
      }))
    }
  });
}

async function pushLibrary(profileId) {
  if (!downloadedKinds(profileId).has("library")) return;
  const items = store.readForProfile(profileId, "library", []).filter((i) => i?.id);
  if (!items.length) return;
  await authed("/rest/v1/rpc/sync_push_library", {
    body: {
      p_profile_id: profileIndex(profileId),
      p_items: items.map((i) => ({
        content_id: i.id,
        content_type: i.type || "movie",
        name: i.name || "Untitled",
        poster: i.poster || null,
        poster_shape: i.posterShape || "POSTER",
        background: i.background || null,
        description: i.description || "",
        release_info: i.releaseInfo || i.year || "",
        imdb_rating: null,
        genres: [],
        addon_base_url: i.addonBaseUrl || null,
        added_at: Number(i.addedAt || Date.now())
      }))
    }
  });
}

async function pushAddons(profileId) {
  if (!downloadedKinds(profileId).has("addons")) return;
  const urls = store.readForProfile(profileId, "addons", []);
  if (!urls.length) return;
  const disabled = new Set(store.readForProfile(profileId, "addonsDisabled", []));
  await authed("/rest/v1/rpc/sync_push_addons", {
    body: {
      p_profile_id: profileIndex(profileId),
      p_addons: urls.map((url, index) => ({ url, sort_order: index, enabled: !disabled.has(url) })),
      p_origin_client_id: clientId()
    }
  });
}

export async function pushCollections(profileId) {
  const list = store.readForProfile(profileId, "collections", []);
  if (!account() || !String(profileId).startsWith(CLOUD_PREFIX) || !list.length) return false;
  await authed("/rest/v1/rpc/sync_push_collections", {
    body: { p_profile_id: profileIndex(profileId), p_collections_json: list }
  });
  return true;
}

const PUSHERS = {
  progress: pushProgress,
  watched: pushWatched,
  library: pushLibrary,
  addons: pushAddons
};
const timers = new Map();
export const syncStatus = { lastPush: 0, lastError: "" };

// Changes on a Nuvio profile are uploaded a few seconds later.
window.addEventListener("nuvio:data", (event) => {
  const { kind, profileId } = event.detail || {};
  const push = PUSHERS[kind];
  if (!push || downloading || !account() || !String(profileId || "").startsWith(CLOUD_PREFIX))
    return;
  if (!pref("nuvio.upload", true)) return;
  const key = `${profileId}|${kind}`;
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      push(profileId)
        .then(() => {
          syncStatus.lastPush = Date.now();
          syncStatus.lastError = "";
        })
        .catch((error) => {
          syncStatus.lastError = `${kind}: ${error.message}`;
        });
    }, 4000)
  );
});
