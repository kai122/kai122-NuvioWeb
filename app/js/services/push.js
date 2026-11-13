// New-episode notifications that arrive while the app is closed (Web Push).
// Needs the small alerts service from relay/alerts-worker.js; its address is
// set in Settings → System → Notifications. On iPhone and iPad, Apple only
// allows this for the Home Screen app.
import { pref, setPref } from "../prefs.js";
import { store } from "../store.js";
import { isStandalone } from "../install.js";

const CONFIG_CACHE = "nuvio-config";
const MAX_SHOWS = 60;

export function relayUrl() {
  const raw = String(pref("notif.relay", "") || "")
    .trim()
    .replace(/\/+$/, "");
  return /^https:\/\/[^\s/?#]+$/.test(raw) ? raw : "";
}

const appleTouch = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function pushSupport() {
  if (appleTouch() && !isStandalone()) return "homescreen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  return "ok";
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (pushSupport() !== "ok") return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch (_) {
    return null;
  }
}

// Series saved or in progress on any profile on this device.
export function watchedShows() {
  const out = new Map();
  for (const profile of store.profiles()) {
    for (const item of store.readForProfile(profile.id, "library", []) || []) {
      if (item?.type === "series" && /^tt\d+$/.test(item.id || ""))
        out.set(item.id, item.name || "");
    }
    for (const entry of Object.values(store.readForProfile(profile.id, "progress", {}) || {})) {
      const id = entry?.metaId || "";
      if (entry?.season != null && /^tt\d+$/.test(id) && !out.has(id))
        out.set(id, entry.name || "");
    }
  }
  return [...out].slice(0, MAX_SHOWS).map(([id, name]) => ({ id, name }));
}

async function post(path, body) {
  const response = await fetch(`${relayUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Alerts service error ${response.status}`);
  return data;
}

function keyBytes(base64url) {
  const s = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// The service worker reads the address from here when a push arrives.
async function saveRelayForWorker() {
  const cache = await caches.open(CONFIG_CACHE);
  await cache.put("alerts-relay", new Response(relayUrl()));
}

export async function enablePush() {
  const support = pushSupport();
  if (support === "homescreen")
    throw new Error("Add Nuvio to your Home Screen first, then turn this on from there.");
  if (support !== "ok") throw new Error("This browser can't receive notifications.");
  if (!relayUrl()) throw new Error("Set the alerts service address first.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notifications are turned off for Nuvio in Settings.");
  const response = await fetch(`${relayUrl()}/vapid`);
  const { key } = await response.json().catch(() => ({}));
  if (!response.ok || !key) throw new Error("The alerts service isn't set up yet.");
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub)
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key)
    });
  await saveRelayForWorker();
  const result = await post("/subscribe", { subscription: sub.toJSON(), shows: watchedShows() });
  setPref("notif.push", true);
  return result.shows;
}

export async function disablePush() {
  const sub = await currentSubscription();
  setPref("notif.push", false);
  if (!sub) return;
  await post("/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function testPush() {
  const sub = await currentSubscription();
  if (!sub) throw new Error("Turn on notifications first.");
  const result = await post("/test", { endpoint: sub.endpoint });
  if (!result.ok)
    throw new Error("The test didn't go through. Try turning notifications off and on.");
}

// Keeps the alerts service's list of shows up to date (at launch and after
// the library changes).
let syncTimer = null;
export function syncPushShows({ delay = 0 } = {}) {
  if (!pref("notif.push", false) || !relayUrl()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const sub = await currentSubscription();
    if (!sub) return;
    await saveRelayForWorker().catch(() => {});
    post("/subscribe", { subscription: sub.toJSON(), shows: watchedShows() }).catch(() => {});
  }, delay);
}

window.addEventListener("nuvio:data", (event) => {
  if (event.detail?.kind === "library") syncPushShows({ delay: 5000 });
});
