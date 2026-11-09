// Floating glass tab bar: expanded with labels at the top of a page, compact
// (icons only) once the page scrolls. The selected pill moves with a spring.
import { h, icon, springEasing, prefersReducedMotion, fill } from "./dom.js";
import { navigate } from "./router.js";
import { store } from "./store.js";

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "search", label: "Search", icon: "search" },
  { id: "library", label: "Library", icon: "library" },
  { id: "profile", label: "Profile", icon: "avatar" }
];

let bar = null;
let pill = null;
let current = "home";
const spring = springEasing({ stiffness: 300, damping: 24 });

// Letter avatar in the native style: dark tinted disc, coloured letter, thin ring.
export function avatarEl(profile, size = 24) {
  const color = profile?.color || "#3185F5";
  const el = h("span.avatar", {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      background: `color-mix(in srgb, ${color} 20%, #0b0b0c)`,
      color,
      boxShadow: `inset 0 0 0 ${Math.max(1, Math.round(size / 50))}px color-mix(in srgb, ${color} 55%, transparent)`,
      fontSize: `${Math.round(size * 0.42)}px`
    }
  });
  el.textContent = (profile?.name || "?").trim().charAt(0).toUpperCase();
  return el;
}

export function createTabBar() {
  pill = h("span.tabbar-pill");
  bar = h("nav.tabbar", { "aria-label": "Main" }, pill);
  for (const tab of TABS) {
    const button = h(
      "button.tab",
      { type: "button", dataset: { tab: tab.id }, onclick: () => navigate(tab.id) },
      tab.icon === "avatar" ? h("span.tab-avatar") : icon(tab.icon, 24),
      h("span.tab-label", {}, tab.label)
    );
    bar.append(button);
  }
  document.body.append(bar);
  window.addEventListener("scroll", syncCompact, { passive: true });
  window.addEventListener("resize", () => movePill(false));
  // The bar resizes with a CSS transition; place the pill on its final size.
  bar.addEventListener("transitionend", (event) => {
    if (event.target === bar && event.propertyName === "width") movePill(false);
  });
  return bar;
}

export function refreshTabAvatar() {
  const slot = bar?.querySelector(".tab-avatar");
  if (!slot) return;
  fill(slot, avatarEl(store.activeProfile(), 26));
}

function syncCompact() {
  if (!bar) return;
  const compact = window.scrollY > 60;
  if (compact !== bar.classList.contains("is-compact")) {
    bar.classList.toggle("is-compact", compact);
    requestAnimationFrame(() => movePill(true));
  }
}

function movePill(animate) {
  const target = bar?.querySelector(`.tab[data-tab="${current}"]`);
  if (!target || !pill) return;
  const barBox = bar.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const to = { transform: `translateX(${box.left - barBox.left}px)`, width: `${box.width}px` };
  if (!animate || prefersReducedMotion() || !pill.animate) {
    Object.assign(pill.style, to);
    return;
  }
  const from = {
    transform: getComputedStyle(pill).transform,
    width: `${pill.getBoundingClientRect().width}px`
  };
  Object.assign(pill.style, to);
  pill.animate([from, to], { duration: 520, easing: spring });
}

export function setActiveTab(id, visible) {
  if (!bar) return;
  bar.classList.toggle("is-hidden", !visible);
  if (!visible) return;
  const changed = id !== current;
  current = id;
  bar
    .querySelectorAll(".tab")
    .forEach((tab) => tab.classList.toggle("is-selected", tab.dataset.tab === id));
  syncCompact();
  requestAnimationFrame(() => movePill(changed));
}
