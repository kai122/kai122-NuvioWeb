import { h, icon, img, prefersReducedMotion, fill, safeImageUrl } from "../dom.js";
import { listCatalogs, fetchCatalog, typeLabel } from "../addons.js";
import { store } from "../store.js";
import { navigate } from "../router.js";
import { posterCard, rowSection, skeletonPosters, cwCard, openDetail } from "../components.js";
import { resumeEntry, openStreams } from "./streams.js";
import { pref } from "../prefs.js";
import { collectionSections } from "./collections.js";
import { fetchRatings } from "../services/mdblist.js";

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
    const bgUrl = safeImageUrl(item.background);
    // Decode the next backdrop off the main thread before fading to it, so
    // the swap never stalls scrolling.
    const shown = index;
    const swap = () => {
      if (shown !== index) return;
      const back = layers[1 - front];
      back.style.backgroundImage = bgUrl ? `url("${bgUrl.replace(/"/g, "%22")}")` : "";
      back.classList.add("is-front");
      layers[front].classList.remove("is-front");
      front = 1 - front;
    };
    if (bgUrl) {
      const pre = new Image();
      pre.src = bgUrl;
      (pre.decode ? pre.decode() : Promise.resolve()).then(swap, swap);
    } else swap();
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
    if (pref("mdb.hero", false)) {
      const shown = index;
      fetchRatings(item.type, item.id).then((ratings) => {
        if (shown !== index || !ratings.length) return;
        fill(
          badges,
          ratings
            .slice(0, 4)
            .map((r) =>
              r.source === "imdb"
                ? h(
                    "span.imdb-chip",
                    {},
                    h("span.imdb-mark", {}, "IMDb"),
                    h("span.imdb-score", {}, r.value)
                  )
                : h(
                    "span.rating-chip",
                    {},
                    h("span.rating-source", {}, r.label),
                    h("span.rating-value", {}, r.value)
                  )
            )
        );
      });
    }
    synopsis.textContent = item.description || "";
    dots
      .querySelectorAll(".hero-dot")
      .forEach((dot, d) => dot.classList.toggle("is-active", d === index));
  }

  let onScreen = true;
  function restart() {
    clearInterval(timer);
    if (onScreen && !prefersReducedMotion() && items.length > 1)
      timer = setInterval(() => show(index + 1), HERO_INTERVAL_MS);
  }
  // The carousel rests while it's scrolled out of view or the app is hidden.
  const visibility =
    "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          onScreen = entries[entries.length - 1].isIntersecting;
          restart();
        })
      : null;
  visibility?.observe(hero);
  const onHidden = () => {
    onScreen = !document.hidden;
    restart();
  };
  document.addEventListener("visibilitychange", onHidden);

  // Horizontal swipe changes the item.
  let startX = null;
  let swipedAt = 0;
  hero.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
  hero.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    startX = null;
    if (Math.abs(dx) > 50) {
      show(index + (dx < 0 ? 1 : -1));
      restart();
      swipedAt = Date.now();
    }
  });
  hero.addEventListener(
    "click",
    (e) => {
      // A swipe also ends with a click; don't open the title for it.
      if (Date.now() - swipedAt < 400) e.stopImmediatePropagation();
    },
    true
  );

  show(0);
  restart();
  return {
    el: hero,
    stop: () => {
      clearInterval(timer);
      visibility?.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
    }
  };
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

function airsIn(ms) {
  const days = Math.ceil(ms / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `in ${days} Days`;
}

function openEntry({ kind, upcoming, airDate, isNew, updatedAt, released, ...entry }) {
  if (kind === "next" && upcoming) navigate(`detail/series/${encodeURIComponent(entry.metaId)}`);
  else if (kind === "next") openStreams(entry);
  else resumeEntry(entry);
}

// Continue Watching = in-progress items plus Next Up episodes.
// Sort: default (most recent first), streaming (in progress first, then Next
// Up), split (unaired Next Up episodes get their own "Upcoming" row).
function continueWatchingRows() {
  if (!pref("cw.show", true)) return [];
  const progress = store.continueWatching().map((e) => ({ ...e, kind: "progress" }));
  const inProgressSeries = new Set(progress.filter((e) => e.season).map((e) => e.metaId));
  const showUnaired = !!pref("cw.unaired", false);
  const now = Date.now();
  const nextUp = Object.values(store.nextUpMap())
    .filter((e) => !inProgressSeries.has(e.metaId))
    .map((e) => {
      const air = new Date(e.released || "").getTime();
      const upcoming = Number.isFinite(air) && air > now;
      return {
        ...e,
        kind: "next",
        upcoming,
        airDate: upcoming ? airsIn(air - now) : "",
        isNew: !upcoming && Number.isFinite(air) && now - air < 7 * 86400000
      };
    })
    .filter((e) => showUnaired || !e.upcoming);
  const sort = pref("cw.sort", "default");
  const byRecent = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  let main;
  let upcoming = [];
  if (sort === "streaming")
    main = [
      ...progress.sort(byRecent),
      ...nextUp.filter((e) => !e.upcoming).sort(byRecent),
      ...nextUp.filter((e) => e.upcoming)
    ];
  else if (sort === "split") {
    main = [...progress, ...nextUp.filter((e) => !e.upcoming)].sort(byRecent);
    upcoming = nextUp
      .filter((e) => e.upcoming)
      .sort((a, b) => String(a.released).localeCompare(String(b.released)));
  } else main = [...progress, ...nextUp].sort(byRecent);
  const out = [];
  const style = pref("cw.style", "card");
  for (const [title, entries] of [
    ["Continue Watching", main.slice(0, 20)],
    ["Upcoming", upcoming.slice(0, 20)]
  ]) {
    if (!entries.length) continue;
    const { section, track } = rowSection(title, { className: `row-cw is-${style}` });
    entries.forEach((entry) => track.append(cwCard(entry, openEntry)));
    out.push(section);
  }
  return out;
}

export function renderHome() {
  const root = h("div.screen.screen-home");
  const heroSlot = h("div.hero-slot", {}, heroSkeleton());
  const cwSlot = h("div");
  const rows = h("div.rows");
  // Collections: pinned ones above the catalog rows, the rest below.
  const pinnedCollections = h("div.collection-rows", {}, collectionSections({ pinned: true }));
  const otherCollections = h("div.collection-rows", {}, collectionSections({ pinned: false }));
  root.append(heroSlot, cwSlot, pinnedCollections, rows, otherCollections);
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

  const showHero = !!pref("home.showHero", true);
  const hiddenCatalogs = new Set(pref("home.hiddenCatalogs", []));
  const heroCatalogs = pref("home.heroCatalogs", null);
  const hideUnreleased = !!pref("home.hideUnreleased", false);
  const showType = !!pref("home.catalogType", true);
  const thisYear = new Date().getFullYear();
  if (!showHero) fill(heroSlot);

  listCatalogs()
    .then((all) => {
      const catalogs = all.filter((entry) => !hiddenCatalogs.has(entry.key));
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
        const base = entry.catalog.name || entry.addon.manifest.name;
        const title = showType ? `${base} - ${typeLabel(entry.catalog.type)}` : base;
        const { section, track } = rowSection(title, {
          onMore: () => navigate(`search/${encodeURIComponent(entry.key)}`)
        });
        track.append(...skeletonPosters());
        rows.append(section);
        const load = () =>
          fetchCatalog(entry)
            .then((fetched) => {
              const items = hideUnreleased
                ? fetched.filter(
                    (item) => !(Number.parseInt(item.year || item.releaseInfo, 10) > thisYear)
                  )
                : fetched;
              if (!items.length) {
                section.remove();
                return;
              }
              fill(track, ...items.slice(0, 30).map((item) => posterCard(item)));
              const heroAllowed = showHero && (!heroCatalogs || heroCatalogs.includes(entry.key));
              if (!hero && heroAllowed) {
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
      fill(cwSlot, ...continueWatchingRows());
    },
    destroy() {
      hero?.stop();
      observer?.disconnect();
    }
  };
}
