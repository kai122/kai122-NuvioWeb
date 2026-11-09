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
    for (const key of ["library", "progress", "watched"]) {
      try {
        localStorage.removeItem(`${PREFIX}${key}.${id}`);
      } catch (_) {
        /* ignore */
      }
    }
  },
  activeProfileId: null,
  activeProfile() {
    return this.profiles().find((p) => p.id === this.activeProfileId) || null;
  },

  addonUrls() {
    return read("addons", DEFAULT_ADDONS);
  },
  saveAddonUrls(list) {
    write("addons", [...new Set(list)]);
  },

  // Per-profile data
  scoped(key, fallback) {
    return read(`${key}.${this.activeProfileId}`, fallback);
  },
  saveScoped(key, value) {
    write(`${key}.${this.activeProfileId}`, value);
  },

  library() {
    return this.scoped("library", []);
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
        year: item.year
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

  watchedSet() {
    return new Set(this.scoped("watched", []));
  },
  isWatched(id) {
    return this.watchedSet().has(id);
  },
  setWatched(id, value) {
    const set = this.watchedSet();
    if (value) set.add(id);
    else set.delete(id);
    this.saveScoped("watched", [...set]);
  }
};
