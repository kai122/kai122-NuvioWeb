import { h, prefersReducedMotion, fill } from "./dom.js";
import { store } from "./store.js";
import { navigate, onRoute, parseRoute } from "./router.js";
import { createTabBar, setActiveTab, refreshTabAvatar } from "./tabbar.js";
import { renderHome } from "./screens/home.js";
import { renderDiscover } from "./screens/discover.js";
import { renderLibrary } from "./screens/library.js";
import { renderProfile } from "./screens/profile.js";
import { renderStreams } from "./screens/streams.js";
import { renderDetail } from "./screens/detail.js";
import { renderPlayer } from "./screens/player.js";
import { renderProfiles, showSplash } from "./screens/profiles.js";
import { closeAllSheets } from "./sheet.js";

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
      return renderProfile(route.params);
    case "addons":
      return renderProfile(["addons"]);
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

// Rebuild Home's rows when add-ons are added, removed, reordered or toggled.
window.addEventListener("nuvio:addons-changed", () => {
  homeScreen?.destroy?.();
  homeScreen = null;
});

async function boot() {
  let firstLaunch = true;
  try {
    const remembered = sessionStorage.getItem("nuvioTouch.activeProfile");
    const profile = store.profiles().find((p) => p.id === remembered);
    if (profile) {
      setActiveProfile(profile);
      firstLaunch = false;
    }
  } catch (_) {
    /* ignore */
  }
  if (firstLaunch) await showSplash();
  show(parseRoute(), "forward");
}

boot();
