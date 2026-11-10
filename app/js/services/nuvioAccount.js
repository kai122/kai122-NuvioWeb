// Nuvio account: code sign-in (like the TV apps) and a download of your
// profiles, add-ons, Continue Watching, watched history and library.
// Download only: nothing here writes to your Nuvio account.
import { store, PROFILE_COLORS } from "../store.js";
import { fetchMeta } from "../addons.js";

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

// Downloads everything and writes it into this app's local store.
// Returns a summary { profiles, addons, progress, watched, library }.
export async function downloadAccount() {
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

  const summary = { profiles: profiles.length, addons: 0, progress: 0, watched: 0, library: 0 };
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
    const [addonRows, progressRows, watchedRows, libraryRows] = await Promise.all([
      authed(
        `/rest/v1/addons?${ownerFilter}profile_id=eq.${p.index}&select=url,sort_order,enabled&order=sort_order.asc`,
        {
          method: "GET"
        }
      ).catch(() => []),
      authed("/rest/v1/rpc/sync_pull_watch_progress", { body: { p_profile_id: p.index } }).catch(
        () => []
      ),
      authed("/rest/v1/rpc/sync_pull_watched_items", { body: { p_profile_id: p.index } }).catch(
        () => []
      ),
      authed("/rest/v1/rpc/sync_pull_library", { body: { p_profile_id: p.index } }).catch(() => [])
    ]);

    // Add-ons (per profile, in the account's order)
    const urls = (addonRows || [])
      .map((r) => String(r.url || "").trim())
      .filter((u) => /^https?:\/\//i.test(u));
    const disabled = (addonRows || [])
      .filter((r) => r.enabled === false)
      .map((r) => String(r.url).trim());
    if (urls.length) store.saveProfileAddons(profileId, urls, disabled);
    summary.addons += urls.length;

    // Watched
    const watched = (watchedRows || []).map((r) => videoIdOf(r)).filter(Boolean);
    store.mergeForProfile(profileId, "watched", [...new Set(watched)]);
    summary.watched += watched.length;

    // Library
    const library = (libraryRows || [])
      .filter((r) => r.content_id)
      .map((r) => ({
        id: r.content_id,
        type: r.content_type || "movie",
        name: r.name || r.title || "",
        poster: r.poster || "",
        background: r.background || "",
        year: String(r.release_info || "").match(/\d{4}/)?.[0] || "",
        addedAt: timeOf(r.added_at || r.updated_at || r.created_at)
      }))
      .sort((a, b) => b.addedAt - a.addedAt);
    store.mergeForProfile(profileId, "library", library);
    summary.library += library.length;

    // Continue Watching: add titles and artwork from the add-ons.
    const rows = (progressRows || []).filter((r) => r.content_id);
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
        time: positionMs / 1000,
        duration: durationMs / 1000,
        updatedAt: timeOf(r.updated_at ?? r.last_watched)
      };
    }
    store.mergeForProfile(profileId, "progress", progress);
    summary.progress += Object.keys(progress).length;
  }

  const a = readAccount();
  if (a) writeAccount({ ...a, lastSync: Date.now(), lastSummary: summary });
  window.dispatchEvent(new Event("nuvio:addons-changed"));
  return summary;
}
