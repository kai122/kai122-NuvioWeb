// Hash router. Routes look like #/home, #/detail/movie/tt0111161.
const listeners = new Set();
let depth = 0; // how many in-app pages we can go back through

export function parseRoute(hash = location.hash) {
  const [name = "home", ...params] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return { name: name || "home", params };
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#/${path.replace(/^#?\/?/, "")}`;
  if (replace) {
    history.replaceState(history.state, "", hash);
  } else {
    depth += 1;
    history.pushState({ depth }, "", hash);
  }
  notify("forward");
}

export function back(fallback = "home") {
  if (depth > 0) {
    history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

export function onRoute(listener) {
  listeners.add(listener);
}

function notify(direction) {
  const route = parseRoute();
  listeners.forEach((listener) => listener(route, direction));
}

window.addEventListener("popstate", (event) => {
  const newDepth = Number(event.state?.depth || 0);
  const direction = newDepth < depth ? "back" : "forward";
  depth = newDepth;
  notify(direction);
});
