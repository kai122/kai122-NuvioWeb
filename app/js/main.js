import "./prefs.js";
import { h, prefersReducedMotion, fill } from "./dom.js";
import { store } from "./store.js";
import { navigate, onRoute, parseRoute } from "./router.js";
import { createTabBar, setActiveTab, refreshTabAvatar } from "./tabbar.js";
import { renderHome } from "./screens/home.js";
import { renderDiscover } from "./screens/discover.js";
import { renderLibrary } from "./screens/library.js";
import { renderSettings } from "./settings/screen.js";
import { renderStreams } from "./screens/streams.js";
import { renderDetail } from "./screens/detail.js";
import { renderPlayer } from "./screens/player.js";
import { renderProfiles, showSplash } from "./screens/profiles.js";
import { closeAllSheets, openSheet } from "./sheet.js";
import { pref } from "./prefs.js";
import { startPlayback } from "./screens/streams.js";
import { checkReleaseAlerts } from "./services/alerts.js";

const TAB_ROUTES = new Set(["home", "search", "library", "profile"]);
const view = h("main.view");
document.body.append(view);
createTabBar();

let current = null; // { key, screen }
let homeScreen = null;
const scrollByKey = new Map();

function routeKey(route) {
  return [route.name, ...route.params].join("/");
}

function setActiveProfile(profile) {
  store.activeProfileId = profile.id;
  store.rememberProfile(profile.id);
  try {
    sessionStorage.setItem("nuvioTouch.activeProfile", profile.id);
  } catch (_) {
    /* ignore */
  }
  homeScreen?.destroy?.();
  homeScreen = null;
  refreshTabAvatar();
}

function build(route) {
  switch (route.name) {
    case "home":
      if (!homeScreen) homeScreen = renderHome();
      return homeScreen;
    case "search":
      return renderDiscover(route.params);
    case "library":
      return renderLibrary();
    case "profile":
      return renderSettings(route.params);
    case "addons":
      return renderSettings(["addons"]);
    case "streams":
      return renderStreams();
    case "detail":
      return renderDetail(route.params);
    case "play":
      return renderPlayer();
    case "profiles":
      return renderProfiles({
        onChosen: (profile) => {
          setActiveProfile(profile);
          navigate("home", { replace: true });
          runLaunchTasks();
        }
      });
    default:
      return null;
  }
}

function show(route, direction) {
  closeAllSheets();
  if (!store.activeProfileId && route.name !== "profiles") {
    navigate("profiles", { replace: true });
    return;
  }
  const screen = build(route);
  if (!screen) {
    navigate("home", { replace: true });
    return;
  }
  const key = routeKey(route);
  if (current) {
    scrollByKey.set(current.key, window.scrollY);
    if (current.screen !== homeScreen) current.screen.destroy?.();
  }

  const swap = () => {
    fill(view, screen.el);
    document.body.dataset.route = route.name;
    setActiveTab(route.name, TAB_ROUTES.has(route.name));
    screen.onShow?.();
    const y = direction === "back" ? scrollByKey.get(key) || 0 : 0;
    window.scrollTo(0, y);
  };
  current = { key, screen };

  const animate = document.startViewTransition && !prefersReducedMotion() && route.name !== "play";
  if (!animate) return swap();
  const kind =
    route.name === "detail" || route.name === "streams" || direction === "back"
      ? direction
      : "fade";
  document.documentElement.dataset.transition =
    TAB_ROUTES.has(route.name) && direction !== "back" ? "fade" : kind;
  const transition = document.startViewTransition(swap);
  transition.finished.finally(() => delete document.documentElement.dataset.transition);
}

onRoute(show);

// Rebuild Home when its layout settings change.
window.addEventListener("nuvio:pref", (event) => {
  const key = String(event.detail?.key || "");
  if (key === "*" || /^(home|cw|poster|depth|tmdb|mdb)\./.test(key)) {
    homeScreen?.destroy?.();
    homeScreen = null;
  }
});

// Rebuild Home's rows when add-ons are added, removed, reordered or toggled.
window.addEventListener("nuvio:addons-changed", () => {
  homeScreen?.destroy?.();
  homeScreen = null;
});

// "Resume prompt on launch": offer to continue when the app was closed
// while a video was playing.
function offerResume() {
  if (!pref("cw.resumePrompt", false)) return;
  let last = null;
  try {
    last = JSON.parse(localStorage.getItem("nuvioTouch.lastPlayer") || "null");
    localStorage.removeItem("nuvioTouch.lastPlayer");
  } catch (_) {
    return;
  }
  if (!last?.url || last.profileId !== store.activeProfileId) return;
  const progress = store.progressMap()[last.videoId];
  if (!progress) return;
  const label = last.season ? `${last.name} · S${last.season} E${last.episode}` : last.name;
  const sheet = openSheet({
    title: "Continue watching?",
    content: h(
      "div.form",
      {},
      h("p.form-hint", {}, label),
      h(
        "div.form-actions",
        {},
        h("button.pill-button", { type: "button", onclick: () => sheet.close() }, "Not now"),
        h(
          "button.play-button",
          {
            type: "button",
            onclick: () => {
              sheet.close();
              startPlayback({ ...last, profileId: undefined, at: undefined });
            }
          },
          "Resume"
        )
      )
    )
  });
}

async function boot() {
  let firstLaunch = true;
  try {
    // This tab's profile, or (with Remember Last Profile on) the last one used.
    let remembered = sessionStorage.getItem("nuvioTouch.activeProfile");
    if (!remembered && pref("adv.rememberProfile", true)) remembered = store.lastProfileId();
    const profile = store.profiles().find((p) => p.id === remembered);
    if (profile) {
      firstLaunch = !sessionStorage.getItem("nuvioTouch.activeProfile");
      setActiveProfile(profile);
    }
  } catch (_) {
    /* ignore */
  }
  if (firstLaunch) await showSplash();
  show(parseRoute(), "forward");
  if (store.activeProfileId) runLaunchTasks();
}

// Once per launch, after a profile is active.
let launchTasksDone = false;
function runLaunchTasks() {
  if (launchTasksDone) return;
  launchTasksDone = true;
  if (parseRoute().name !== "play") setTimeout(offerResume, 600);
  setTimeout(() => checkReleaseAlerts(), 3000);
}

boot();
