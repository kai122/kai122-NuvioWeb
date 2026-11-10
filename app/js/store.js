// Everything is kept on this device (localStorage). All access is guarded so
// private mode or blocked storage never breaks the app.
const PREFIX = "nuvioTouch.";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

// Tells the sync service that a profile's data changed (it uploads Nuvio
// account profiles' changes).
const SYNCED_KINDS = new Set([
  "progress",
  "watched",
  "library",
  "addons",
  "addonsDisabled",
  "collections"
]);
function announce(kind, profileId) {
  if (!SYNCED_KINDS.has(kind) || !profileId) return;
  const k = kind === "addonsDisabled" ? "addons" : kind;
  try {
    window.dispatchEvent(new CustomEvent("nuvio:data", { detail: { kind: k, profileId } }));
  } catch (_) {
    /* ignore */
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (_) {
    /* storage full or blocked: keep working in memory */
  }
}

export const PROFILE_COLORS = ["#9C3B5B", "#3185F5", "#22D37C", "#E8A91C", "#B75AFF", "#EC70A9"];
export const DEFAULT_ADDONS = ["https://v3-cinemeta.strem.io/manifest.json"];

export const store = {
  profiles() {
    return read("profiles", []);
  },
  saveProfiles(list) {
    write("profiles", list);
  },
  addProfile(name) {
    const list = this.profiles();
    const profile = {
      id: `p${Date.now().toString(36)}`,
      name: String(name || "").trim() || `Profile ${list.length + 1}`,
      color: PROFILE_COLORS[list.length % PROFILE_COLORS.length]
    };
    list.push(profile);
    this.saveProfiles(list);
    return profile;
  },
  removeProfile(id) {
    this.saveProfiles(this.profiles().filter((p) => p.id !== id));
    for (const key of [
      "library",
      "progress",
      "watched",
      "nextUp",
      "links",
      "recentSearches",
      "seenEpisodes",
      "watchedInfo",
      "addons",
      "addonsDisabled",
      "collections"
    ]) {
      try {
        localStorage.removeItem(`${PREFIX}${key}.${id}`);
      } catch (_) {
        /* ignore */
      }
    }
  },
  activeProfileId: null,
  // Last chosen profile, kept across launches when "Remember Last Profile" is on.
  lastProfileId() {
    return read("lastProfile", null);
  },
  rememberProfile(id) {
    write("lastProfile", id);
  },
  forgetActiveProfile() {
    this.activeProfileId = null;
    try {
      localStorage.removeItem(`${PREFIX}lastProfile`);
      sessionStorage.removeItem(`${PREFIX}activeProfile`);
    } catch (_) {
      /* ignore */
    }
  },
  activeProfile() {
    return this.profiles().find((p) => p.id === this.activeProfileId) || null;
  },

  // Add-ons are per profile when the profile has its own list (Nuvio account
  // profiles do); otherwise the device-wide list is used.
  addonKey() {
    const id = this.activeProfileId;
    return id && read(`addons.${id}`, null) ? `addons.${id}` : "addons";
  },
  disabledKey() {
    return this.addonKey() === "addons"
      ? "addonsDisabled"
      : `addonsDisabled.${this.activeProfileId}`;
  },
  addonUrls() {
    return read(this.addonKey(), DEFAULT_ADDONS);
  },
  saveAddonUrls(list) {
    write(this.addonKey(), [...new Set(list)]);
    if (this.addonKey() !== "addons") announce("addons", this.activeProfileId);
  },
  disabledAddons() {
    return new Set(read(this.disabledKey(), []));
  },
  setAddonEnabled(url, enabled) {
    const set = this.disabledAddons();
    if (enabled) set.delete(url);
    else set.add(url);
    write(this.disabledKey(), [...set]);
    if (this.addonKey() !== "addons") announce("addons", this.activeProfileId);
  },
  saveProfileAddons(profileId, urls, disabled = []) {
    write(`addons.${profileId}`, [...new Set(urls)]);
    write(`addonsDisabled.${profileId}`, [...new Set(disabled)]);
  },

  // Merge downloaded data into a profile, keeping anything newer done here.
  mergeForProfile(profileId, key, incoming) {
    const current = read(`${key}.${profileId}`, null);
    let next = incoming;
    if (key === "progress" && current) {
      next = { ...incoming };
      for (const [id, entry] of Object.entries(current)) {
        if (!next[id] || (entry.updatedAt || 0) > (next[id].updatedAt || 0)) next[id] = entry;
      }
    } else if (key === "watched" && current) {
      next = [...new Set([...incoming, ...current])];
    } else if (key === "library" && current) {
      const ids = new Set(incoming.map((x) => x.id));
      next = [...incoming, ...current.filter((x) => !ids.has(x.id))];
    }
    write(`${key}.${profileId}`, next);
  },
  moveAddon(url, delta) {
    const list = this.addonUrls();
    const from = list.indexOf(url);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    this.saveAddonUrls(list);
  },
  clearContinueWatching() {
    this.saveScoped("progress", {});
    this.saveScoped("nextUp", {});
  },
  resetDevice() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(PREFIX))
        .forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();
    } catch (_) {
      /* ignore */
    }
  },

  // Per-profile data
  scoped(key, fallback) {
    return read(`${key}.${this.activeProfileId}`, fallback);
  },
  saveScoped(key, value) {
    write(`${key}.${this.activeProfileId}`, value);
    announce(key, this.activeProfileId);
  },
  readForProfile(profileId, key, fallback) {
    return read(`${key}.${profileId}`, fallback);
  },
  saveForProfile(profileId, key, value) {
    write(`${key}.${profileId}`, value);
  },
  watchedInfo(profileId = this.activeProfileId) {
    return read(`watchedInfo.${profileId}`, {});
  },
  mergeWatchedInfo(profileId, info) {
    write(`watchedInfo.${profileId}`, { ...this.watchedInfo(profileId), ...info });
  },
  collections() {
    return read(`collections.${this.activeProfileId}`, []);
  },
  saveCollections(list) {
    write(`collections.${this.activeProfileId}`, list);
  },

  library() {
    return this.scoped("library", []);
  },
  saveLibrary(list) {
    this.saveScoped("library", list);
  },
  isSaved(id) {
    return this.library().some((item) => item.id === id);
  },
  toggleSaved(item) {
    const list = this.library();
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list.splice(index, 1);
    else
      list.unshift({
        id: item.id,
        type: item.type,
        name: item.name,
        poster: item.poster,
        background: item.background,
        logo: item.logo,
        year: item.year,
        addedAt: Date.now()
      });
    this.saveScoped("library", list);
    return index < 0;
  },

  progressMap() {
    return this.scoped("progress", {});
  },
  setProgress(entry) {
    const map = this.progressMap();
    map[entry.videoId] = { ...entry, updatedAt: Date.now() };
    this.saveScoped("progress", map);
  },
  removeProgress(videoId) {
    const map = this.progressMap();
    delete map[videoId];
    this.saveScoped("progress", map);
  },
  continueWatching() {
    return Object.values(this.progressMap())
      .filter((entry) => entry.duration > 0 && entry.time / entry.duration < 0.95)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  },

  // Next Up: one entry per series, pointing at the episode to watch next.
  nextUpMap() {
    return this.scoped("nextUp", {});
  },
  setNextUp(metaId, entry) {
    const map = this.nextUpMap();
    if (entry) map[metaId] = { ...entry, updatedAt: Date.now() };
    else delete map[metaId];
    this.saveScoped("nextUp", map);
  },

  // The last stream link that played for each movie or episode.
  lastLink(videoId) {
    return this.scoped("links", {})[videoId] || null;
  },
  saveLink(videoId, link) {
    const map = this.scoped("links", {});
    map[videoId] = { ...link, savedAt: Date.now() };
    const keys = Object.keys(map).sort((a, b) => map[b].savedAt - map[a].savedAt);
    for (const key of keys.slice(200)) delete map[key];
    this.saveScoped("links", map);
  },

  recentSearches() {
    return this.scoped("recentSearches", []);
  },
  addRecentSearch(query) {
    const q = String(query || "").trim();
    if (q.length < 2) return;
    const list = this.recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase());
    list.unshift(q);
    this.saveScoped("recentSearches", list.slice(0, 10));
  },
  clearRecentSearches() {
    this.saveScoped("recentSearches", []);
  },

  // Latest released episode seen per saved series (for release alerts).
  seenEpisodes() {
    return this.scoped("seenEpisodes", {});
  },
  saveSeenEpisodes(map) {
    this.saveScoped("seenEpisodes", map);
  },

  watchedSet() {
    return new Set(this.scoped("watched", []));
  },
  isWatched(id) {
    return this.watchedSet().has(id);
  },
  // info: { contentId, type, season, episode, title } so it can be uploaded.
  setWatched(id, value, info = null) {
    const set = this.watchedSet();
    if (value) set.add(id);
    else set.delete(id);
    if (value && info)
      this.mergeWatchedInfo(this.activeProfileId, { [id]: { ...info, at: Date.now() } });
    this.saveScoped("watched", [...set]);
  }
};
