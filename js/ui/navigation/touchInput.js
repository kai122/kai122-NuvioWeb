import { Router } from "./routerState.js";

// Touch support for tablets (iPad Safari / Home Screen). The UI was built for
// TV remotes, so this module only adds what a finger needs and leaves the
// remote/D-pad paths untouched.
const TOUCH_CLASS = "touch-input";
const HOVER_GUARD_MS = 800;
// The UI is designed for a 1920x1080 canvas. Rendering it at the iPad's native
// CSS width makes everything ~1.6x too large, so lay it out at the design width
// and let the browser scale it down (the same approach the TV builds use).
const DESIGN_WIDTH_LANDSCAPE = 1920;
const DESIGN_WIDTH_PORTRAIT = 1080;
const MIN_TABLET_SHORT_SIDE = 600;
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

function isTouchMode() {
  return document.documentElement.classList.contains(TOUCH_CLASS);
}

// Pick the design width for the current orientation and scale the page to fit.
// Uses the physical screen size, not innerWidth, so changing the viewport tag
// never feeds back into its own calculation.
function applyViewportScale() {
  if (!isTouchMode()) {
    return;
  }
  const screenWidth = Number(globalThis.screen?.width) || 0;
  const screenHeight = Number(globalThis.screen?.height) || 0;
  const longSide = Math.max(screenWidth, screenHeight);
  const shortSide = Math.min(screenWidth, screenHeight);
  if (!shortSide || shortSide < MIN_TABLET_SHORT_SIDE) {
    return;
  }
  const portrait = Boolean(globalThis.matchMedia?.("(orientation: portrait)")?.matches);
  const designWidth = portrait ? DESIGN_WIDTH_PORTRAIT : DESIGN_WIDTH_LANDSCAPE;
  const scale = Math.min(
    1,
    Math.round(((portrait ? shortSide : longSide) / designWidth) * 1000) / 1000
  );
  const content = `width=${designWidth}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no`;
  const meta = document.querySelector("meta[name='viewport']");
  if (meta && meta.getAttribute("content") !== content) {
    meta.setAttribute("content", content);
  }
  // Lets CSS size touch targets in real points: calc(44 * var(--pt)).
  document.documentElement.style.setProperty("--touch-scale", String(scale));
  document.documentElement.style.setProperty("--pt", `${(1 / scale).toFixed(4)}px`);
}

function markTouchMode() {
  const wasTouch = isTouchMode();
  document.documentElement.classList.add(TOUCH_CLASS);
  if (!wasTouch) {
    applyViewportScale();
  }
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

// --- Touch scrolling bridge -------------------------------------------------
// Only the rows area of the Home screen scrolls natively; a drag that starts on
// the hero (or any other non-scrolling area) did nothing, so the page felt stuck
// once you had scrolled down. Forward such drags to the screen's main scroller
// and keep a little momentum so it flows like a native list.
const DRAG_START_PX = 8;
const MOMENTUM_FRICTION = 0.94;
const MOMENTUM_MIN_VELOCITY = 0.03; // px per ms
let bridge = null;
let momentumFrame = 0;

function canScrollY(node) {
  if (!(node instanceof HTMLElement) || node.scrollHeight <= node.clientHeight + 4) {
    return false;
  }
  return /(auto|scroll)/.test(getComputedStyle(node).overflowY);
}

function hasNativeVerticalScroller(start) {
  for (let node = start; node && node !== document.documentElement; node = node.parentElement) {
    if (canScrollY(node)) {
      return true;
    }
  }
  return false;
}

// Screens whose main scroller may not overflow yet when a drag begins (rows
// hydrate lazily), so match them by selector before scanning generically.
const KNOWN_SCROLLER_SELECTORS = [".home-modern-rows-viewport", ".home-main.home-screen-main"];

function findMainScroller() {
  for (const selector of KNOWN_SCROLLER_SELECTORS) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLElement && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
      return node;
    }
  }
  const root = document.querySelector(".screen") || document.body;
  let best = null;
  let bestArea = 0;
  root.querySelectorAll("*").forEach((node) => {
    if (!canScrollY(node)) {
      return;
    }
    const area = node.clientWidth * node.clientHeight;
    if (area > bestArea) {
      best = node;
      bestArea = area;
    }
  });
  return best;
}

function stopMomentum() {
  if (momentumFrame) {
    cancelAnimationFrame(momentumFrame);
    momentumFrame = 0;
  }
}

function startMomentum(scroller, velocity) {
  let v = velocity;
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(48, now - last);
    last = now;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + v * dt;
    v *= Math.pow(MOMENTUM_FRICTION, dt / 16);
    if (Math.abs(v) < MOMENTUM_MIN_VELOCITY || scroller.scrollTop === before) {
      momentumFrame = 0;
      return;
    }
    momentumFrame = requestAnimationFrame(step);
  };
  momentumFrame = requestAnimationFrame(step);
}

function onBridgeTouchStart(event) {
  stopMomentum();
  bridge = null;
  if (event.touches.length !== 1) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element) || target.closest(".touch-back-btn, .nuvio-dialog-backdrop")) {
    return;
  }
  if (hasNativeVerticalScroller(target)) {
    return; // The browser already scrolls this one.
  }
  const touch = event.touches[0];
  bridge = {
    startX: touch.clientX,
    startY: touch.clientY,
    lastY: touch.clientY,
    lastT: event.timeStamp,
    velocity: 0,
    dragging: false,
    scroller: null
  };
}

function onBridgeTouchMove(event) {
  if (!bridge || event.touches.length !== 1) {
    return;
  }
  const touch = event.touches[0];
  if (!bridge.dragging) {
    const dx = touch.clientX - bridge.startX;
    const dy = touch.clientY - bridge.startY;
    if (Math.abs(dy) < DRAG_START_PX && Math.abs(dx) < DRAG_START_PX) {
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      bridge = null; // Horizontal gesture; leave it alone.
      return;
    }
    bridge.scroller = findMainScroller();
    if (!bridge.scroller) {
      bridge = null;
      return;
    }
    bridge.dragging = true;
  }
  const delta = bridge.lastY - touch.clientY;
  bridge.scroller.scrollTop += delta;
  const dt = Math.max(1, event.timeStamp - bridge.lastT);
  // Smooth the velocity so one noisy sample does not decide the fling.
  bridge.velocity = bridge.velocity * 0.6 + (delta / dt) * 0.4;
  bridge.lastY = touch.clientY;
  bridge.lastT = event.timeStamp;
}

function onBridgeTouchEnd(event) {
  const finished = bridge;
  bridge = null;
  if (!finished?.dragging || !finished.scroller) {
    return;
  }
  // A pause before release means the user stopped; do not fling.
  if (event.timeStamp - finished.lastT > 80) {
    return;
  }
  if (Math.abs(finished.velocity) > MOMENTUM_MIN_VELOCITY) {
    startMomentum(finished.scroller, finished.velocity);
  }
}

function installTouchScrollBridge() {
  document.addEventListener("touchstart", onBridgeTouchStart, { passive: true, capture: true });
  document.addEventListener("touchmove", onBridgeTouchMove, { passive: true, capture: true });
  document.addEventListener("touchend", onBridgeTouchEnd, { passive: true, capture: true });
  document.addEventListener("touchcancel", onBridgeTouchEnd, { passive: true, capture: true });
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

  installTouchScrollBridge();
  window.addEventListener("resize", applyViewportScale);
  window.addEventListener("orientationchange", applyViewportScale);
  window.addEventListener("popstate", syncBackButton);
  setInterval(syncBackButton, 300);
  syncBackButton();
}
