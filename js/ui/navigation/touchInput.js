import { Router } from "./routerState.js";

// Touch support for tablets (iPad Safari / Home Screen). The UI was built for
// TV remotes, so this module only adds what a finger needs and leaves the
// remote/D-pad paths untouched.
const TOUCH_CLASS = "touch-input";
const HOVER_GUARD_MS = 800;
// Must exceed the focus engine's Back debounce so the second press is not dropped.
const PLAYER_BACK_REPEAT_MS = 320;
const SIMULATED_MOUSE_EVENTS = ["mouseover", "mouseenter", "mousemove"];
// Routes that already provide their own way back (or must not be covered).
const ROUTES_WITHOUT_BACK_BUTTON = new Set([
  "home",
  "authQrSignIn",
  "profileSelection",
  "experienceModeSelection",
  "essentialAddonSetup"
]);
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]";
const ROOT_NAV_SELECTOR = ".root-sidebar, .home-sidebar";
const BACK_ICON =
  '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let installed = false;
let lastTouchAt = 0;
let backButton = null;

function markTouchMode() {
  document.documentElement.classList.add(TOUCH_CLASS);
}

function dispatchBackKey() {
  // Reuse the normal Back handling (modals, per-screen consumeBackRequest,
  // history) by sending the key the browser adapter already treats as Back.
  ["keydown", "keyup"].forEach((type) => {
    const event = new KeyboardEvent(type, {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, "keyCode", { get: () => 27 });
    Object.defineProperty(event, "which", { get: () => 27 });
    document.dispatchEvent(event);
  });
}

function playerControlsVisible() {
  return Boolean(document.querySelector("#playerUiRoot.controls-visible"));
}

function handleBackTap() {
  const leavingPlayerControls = Router.current === "player" && playerControlsVisible();
  dispatchBackKey();
  // In the player, Back first hides the controls and only leaves once they are
  // hidden. Press it again so one tap leaves, but only if the first press hid
  // the controls rather than closing a dialog or panel.
  if (leavingPlayerControls) {
    setTimeout(() => {
      if (Router.current === "player" && !playerControlsVisible()) {
        dispatchBackKey();
      }
    }, PLAYER_BACK_REPEAT_MS);
  }
}

function shouldShowBackButton() {
  if (!document.documentElement.classList.contains(TOUCH_CLASS)) {
    return false;
  }
  const route = Router.current;
  if (!route || ROUTES_WITHOUT_BACK_BUTTON.has(route)) {
    return false;
  }
  // The player has no chrome of its own for leaving: offer Back together with
  // its controls overlay so it never covers the picture during playback.
  if (route === "player") {
    return playerControlsVisible();
  }
  if (
    document.querySelector(ROOT_NAV_SELECTOR) ||
    document.querySelector(".nuvio-dialog-backdrop")
  ) {
    return false;
  }
  return true;
}

function ensureBackButton() {
  if (backButton) {
    return backButton;
  }
  backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "touch-back-btn";
  backButton.setAttribute("aria-label", "Back");
  backButton.innerHTML = BACK_ICON;
  backButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleBackTap();
  });
  document.body.appendChild(backButton);
  return backButton;
}

function syncBackButton() {
  const visible = shouldShowBackButton();
  if (!visible && !backButton) {
    return;
  }
  ensureBackButton().classList.toggle("is-visible", visible);
}

export function installTouchInput() {
  if (installed || typeof document === "undefined") {
    return;
  }
  installed = true;

  if (globalThis.matchMedia?.("(pointer: coarse)")?.matches) {
    markTouchMode();
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        lastTouchAt = Date.now();
        markTouchMode();
      }
    },
    true
  );

  // After a tap, browsers synthesize mouseover/mousemove. The TV hover logic
  // reacts by focusing and expanding the card under the finger, which moves it
  // so the click lands elsewhere and the tap appears to do nothing. Drop those
  // synthesized events so a single tap activates the item.
  SIMULATED_MOUSE_EVENTS.forEach((type) => {
    document.addEventListener(
      type,
      (event) => {
        if (Date.now() - lastTouchAt < HOVER_GUARD_MS) {
          event.stopImmediatePropagation();
        }
      },
      true
    );
  });

  // The browser also focuses the tapped element on the synthesized mousedown,
  // which triggers the same expand-on-focus reflow. Keep focus where it is for
  // taps on anything that is not a text field.
  document.addEventListener(
    "mousedown",
    (event) => {
      if (Date.now() - lastTouchAt >= HOVER_GUARD_MS) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && !target.closest(EDITABLE_SELECTOR)) {
        event.preventDefault();
      }
    },
    true
  );

  window.addEventListener("popstate", syncBackButton);
  setInterval(syncBackButton, 300);
  syncBackButton();
}
