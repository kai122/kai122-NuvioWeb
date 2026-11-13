// Home Screen app: opened from its icon, Nuvio runs full screen with no
// Safari bars, like an installed app. Websites can't add themselves to the
// Home Screen on iPad, so in Safari we show a short guide once in a while.
import { h, icon } from "./dom.js";
import { openSheet } from "./sheet.js";

const DISMISS_KEY = "nuvioTouch.installDismissed";
const DISMISS_DAYS = 14;

export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches
  );
}

// iPhone/iPad. iPadOS Safari reports itself as a Mac, so check for touch too.
function isAppleTouch() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function shareIcon(size = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("install-share-icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute(
    "d",
    "M12 2.6 7.8 6.8l1.4 1.4L11 6.4V15h2V6.4l1.8 1.8 1.4-1.4zM6 10h2v2H6v8h12v-8h-2v-2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"
  );
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function step(n, ...text) {
  return h(
    "li.install-step",
    {},
    h("span.install-step-num", {}, String(n)),
    h("span", {}, ...text)
  );
}

export function openInstallGuide() {
  const apple = isAppleTouch();
  openSheet({
    title: "Add Nuvio to your Home Screen",
    content: h(
      "div.form.install-guide",
      {},
      h(
        "p.form-hint",
        {},
        "Nuvio then opens from its own icon, full screen with no browser bars, like an app."
      ),
      h(
        "ol.install-steps",
        {},
        apple
          ? [
              step(
                1,
                "Tap ",
                shareIcon(18),
                h("b", {}, " Share"),
                " at the top of Safari (next to the address)."
              ),
              step(2, "Scroll down and tap ", h("b", {}, "Add to Home Screen"), "."),
              step(
                3,
                "If you see ",
                h("b", {}, "Open as Web App"),
                ", leave it on. Tap ",
                h("b", {}, "Add"),
                "."
              ),
              step(4, "Open ", h("b", {}, "Nuvio"), " from your Home Screen.")
            ]
          : [
              step(1, "Open your browser's menu."),
              step(
                2,
                "Choose ",
                h("b", {}, "Install app"),
                " or ",
                h("b", {}, "Add to Home Screen"),
                "."
              ),
              step(3, "Open ", h("b", {}, "Nuvio"), " from its icon.")
            ]
      ),
      h(
        "p.form-hint.install-note",
        {},
        "The Home Screen app keeps its own data, separate from Safari. Open Settings → Account there and sign in with Nuvio to bring your profiles, add-ons, library and progress across."
      )
    )
  });
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch (_) {
    return false;
  }
}

function showBanner() {
  if (document.querySelector(".install-banner")) return;
  const banner = h(
    "div.install-banner",
    { role: "region", "aria-label": "Install Nuvio" },
    h("img.install-banner-icon", { src: "../assets/pwa/icon-192.png", alt: "" }),
    h(
      "div.install-banner-text",
      {},
      h("div.install-banner-title", {}, "Get the Nuvio app"),
      h("div.install-banner-sub", {}, "Add it to your Home Screen to open full screen.")
    ),
    h(
      "button.pill-button.install-banner-how",
      {
        type: "button",
        onclick: () => {
          close();
          openInstallGuide();
        }
      },
      "Show me"
    ),
    h(
      "button.round-button.install-banner-close",
      { type: "button", "aria-label": "Not now", onclick: () => close() },
      icon("close", 18)
    )
  );
  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_) {
      /* ignore */
    }
    banner.classList.add("is-leaving");
    setTimeout(() => banner.remove(), 250);
  }
  document.body.append(banner);
  requestAnimationFrame(() => banner.classList.add("is-open"));
}

// Called once at launch.
export function setupAppMode() {
  const standalone = isStandalone();
  document.documentElement.classList.toggle("is-standalone", !!standalone);

  if (
    "serviceWorker" in navigator &&
    (location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1")
  ) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
    });
  }

  // Ask the browser to keep this app's saved data (add-ons, progress) instead
  // of clearing it when space runs low. Home Screen apps are usually granted.
  navigator.storage?.persist?.().catch(() => {});

  if (!standalone && isAppleTouch() && !dismissedRecently()) {
    setTimeout(showBanner, 2500);
  }
}
