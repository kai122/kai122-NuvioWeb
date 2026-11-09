import { h, icon, img, prefersReducedMotion, fill } from "../dom.js";
import { listCatalogs, fetchCatalog, typeLabel } from "../addons.js";
import { store } from "../store.js";
import { navigate } from "../router.js";
import { posterCard, rowSection, skeletonPosters, cwCard, openDetail } from "../components.js";
import { resumeEntry } from "./streams.js";

const HERO_COUNT = 8;
const HERO_INTERVAL_MS = 8000;

function heroMeta(item) {
  const parts = [
    typeLabel(item.type).replace(/s$/, "") || "",
    (item.genres || [])[0],
    item.runtime,
    item.year
  ].filter(Boolean);
  return parts.join(" • ");
}

function buildHero(items) {
  let index = 0;
  let timer = null;
  const layers = [h("div.hero-layer"), h("div.hero-layer")];
  let front = 0;
  const logoSlot = h("div.hero-logo-slot");
  const meta = h("div.hero-meta");
  const badges = h("div.hero-badges");
  const synopsis = h("p.hero-synopsis");
  const dots = h("div.hero-dots", { role: "tablist" });
  const copy = h("div.hero-copy", {}, logoSlot, meta, badges, synopsis, dots);
  const hero = h(
    "section.hero",
    { onclick: () => openDetail(items[index]) },
    ...layers,
    h("div.hero-shade"),
    copy
  );

  items.forEach((_, i) =>
    dots.append(
      h("button.hero-dot", {
        type: "button",
        "aria-label": `Show item ${i + 1}`,
        onclick: (event) => {
          event.stopPropagation();
          show(i);
          restart();
        }
      })
    )
  );

  function setLogo(item) {
    const fallback = h("div.hero-title", {}, item.name);
    if (!item.logo) return fill(logoSlot, fallback);
    const logo = img(item.logo, "hero-logo", item.name);
    logo.loading = "eager";
    logo.addEventListener("error", () => fill(logoSlot, fallback), { once: true });
    fill(logoSlot, logo);
  }

  function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index];
    const back = layers[1 - front];
    back.style.backgroundImage = item.background
      ? `url("${item.background.replace(/"/g, "%22")}")`
      : "";
    back.classList.add("is-front");
    layers[front].classList.remove("is-front");
    front = 1 - front;
    setLogo(item);
    meta.textContent = heroMeta(item);
    fill(
      badges,
      item.imdbRating
        ? h(
            "span.imdb-chip",
            {},
            h("span.imdb-mark", {}, "IMDb"),
            h("span.imdb-score", {}, item.imdbRating)
          )
        : null
    );
    synopsis.textContent = item.description || "";
    dots
      .querySelectorAll(".hero-dot")
      .forEach((dot, d) => dot.classList.toggle("is-active", d === index));
  }

  function restart() {
    clearInterval(timer);
    if (!prefersReducedMotion() && items.length > 1)
      timer = setInterval(() => show(index + 1), HERO_INTERVAL_MS);
  }

  // Horizontal swipe changes the item.
  let startX = null;
  hero.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
  hero.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    startX = null;
    if (Math.abs(dx) > 50) {
      show(index + (dx < 0 ? 1 : -1));
      restart();
      hero.dataset.swiped = "1";
      setTimeout(() => delete hero.dataset.swiped, 0);
    }
  });
  hero.addEventListener(
    "click",
    (e) => {
      if (hero.dataset.swiped) e.stopImmediatePropagation();
    },
    true
  );

  show(0);
  restart();
  return { el: hero, stop: () => clearInterval(timer) };
}

function heroSkeleton() {
  return h(
    "section.hero.is-loading",
    {},
    h(
      "div.hero-copy",
      {},
      h("div.skel-block.shimmer", { style: { width: "320px", height: "90px" } }),
      h("div.skel-line.shimmer", { style: { width: "260px" } }),
      h("div.skel-line.shimmer", { style: { width: "520px" } })
    )
  );
}

function continueWatchingRow() {
  const entries = store.continueWatching();
  if (!entries.length) return null;
  const { section, track } = rowSection("Continue Watching", { className: "row-cw" });
  entries.forEach((entry) => track.append(cwCard(entry, resumeEntry)));
  return section;
}

export function renderHome() {
  const root = h("div.screen.screen-home");
  const heroSlot = h("div.hero-slot", {}, heroSkeleton());
  const cwSlot = h("div");
  const rows = h("div.rows");
  root.append(heroSlot, cwSlot, rows);
  let hero = null;

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              observer.unobserve(entry.target);
              entry.target.__load?.();
            }
          },
          { rootMargin: "600px 0px" }
        )
      : null;

  listCatalogs()
    .then((catalogs) => {
      if (!catalogs.length) {
        fill(heroSlot);
        rows.append(
          h(
            "div.empty-card",
            {},
            icon("puzzle", 28),
            h("div.empty-title", {}, "No catalogs yet"),
            h("div.empty-text", {}, "Add an add-on in Profile → Add-ons to fill Home."),
            h(
              "button.pill-button",
              { type: "button", onclick: () => navigate("addons") },
              "Manage add-ons"
            )
          )
        );
        return;
      }
      catalogs.forEach((entry, i) => {
        const title = `${entry.catalog.name || entry.addon.manifest.name} - ${typeLabel(entry.catalog.type)}`;
        const { section, track } = rowSection(title, {
          onMore: () => navigate(`search/${encodeURIComponent(entry.key)}`)
        });
        track.append(...skeletonPosters());
        rows.append(section);
        const load = () =>
          fetchCatalog(entry)
            .then((items) => {
              if (!items.length) {
                section.remove();
                return;
              }
              fill(track, ...items.slice(0, 30).map((item) => posterCard(item)));
              if (!hero) {
                const heroItems = items.filter((item) => item.background).slice(0, HERO_COUNT);
                if (heroItems.length) {
                  hero = buildHero(heroItems);
                  fill(heroSlot, hero.el);
                }
              }
            })
            .catch(() => section.remove());
        if (i < 2 || !observer) load();
        else {
          section.__load = load;
          observer.observe(section);
        }
      });
    })
    .catch(() => fill(heroSlot));

  return {
    el: root,
    onShow() {
      fill(cwSlot, continueWatchingRow() || "");
    },
    destroy() {
      hero?.stop();
      observer?.disconnect();
    }
  };
}
