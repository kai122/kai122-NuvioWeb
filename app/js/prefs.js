// App preferences (settings). Stored per device in localStorage and applied to
// the page through CSS variables so every screen picks them up at once.
import { THEMES } from "./settings/schema.js";

const PREFIX = "nuvioTouch.pref.";

export function pref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (_) {
    /* storage blocked: the change still applies for this session */
  }
  applyDisplayPrefs();
  window.dispatchEvent(new CustomEvent("nuvio:pref", { detail: { key, value } }));
}

export function clearPrefs(prefixes) {
  try {
    for (const name of Object.keys(localStorage)) {
      if (!name.startsWith(PREFIX)) continue;
      if (prefixes.some((p) => name.startsWith(PREFIX + p))) localStorage.removeItem(name);
    }
  } catch (_) {
    /* ignore */
  }
  applyDisplayPrefs();
  window.dispatchEvent(new CustomEvent("nuvio:pref", { detail: { key: "*", value: null } }));
}

export function allPrefs() {
  const out = {};
  try {
    for (const name of Object.keys(localStorage)) {
      if (name.startsWith(PREFIX))
        out[name.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(name));
    }
  } catch (_) {
    /* ignore */
  }
  return out;
}

export function importPrefs(data) {
  if (!data || typeof data !== "object") return 0;
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (!/^[\w.]{1,60}$/.test(key)) continue;
    if (typeof value === "object" && value !== null) continue; // only plain values
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      count += 1;
    } catch (_) {
      /* ignore */
    }
  }
  applyDisplayPrefs();
  window.dispatchEvent(new CustomEvent("nuvio:pref", { detail: { key: "*", value: null } }));
  return count;
}

// Widths come from the app's presets (104 to 140 dp, default 126). Height is
// always 3/2 of the width, exactly like the native card.
export function applyDisplayPrefs() {
  const root = document.documentElement;
  const width = Number(pref("poster.width", 126)) || 126;
  const radius = Number(pref("poster.radius", 12));
  root.style.setProperty("--poster-w", `${width}px`);
  root.style.setProperty("--poster-h", `${Math.round((width * 3) / 2)}px`);
  root.style.setProperty("--poster-r", `${Number.isFinite(radius) ? radius : 12}px`);
  root.classList.toggle("hide-poster-labels", !!pref("poster.hideLabels", false));
  root.classList.toggle("no-glass", !pref("liquidGlass", true));
  const depth = !!pref("depth.on", false);
  root.classList.toggle("depth-on", depth);
  const edge = { subtle: 0.1, balanced: 0.18, bold: 0.32 }[pref("depth.edge", "balanced")] ?? 0.18;
  const sheen = { off: 0, soft: 0.07, bright: 0.16 }[pref("depth.sheen", "soft")] ?? 0.07;
  root.style.setProperty("--depth-edge", String(edge));
  root.style.setProperty("--depth-sheen", String(sheen));

  const theme =
    THEMES.find((t) => t.id === pref("theme", "White")) || THEMES.find((t) => t.id === "White");
  const amoled = !!pref("amoled", false);
  if (theme) {
    root.style.setProperty("--bg", amoled ? "#000000" : theme.bg);
    root.style.setProperty("--surface", theme.surface);
    root.style.setProperty("--surface-card", theme.card);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--on-accent", theme.onAccent);
    if (theme.focus) root.style.setProperty("--focus-bg", theme.focus);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", amoled ? "#000000" : theme.bg);
  }
}

applyDisplayPrefs();
