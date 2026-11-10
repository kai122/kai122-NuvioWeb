// Nuvio collections: groups of folders (e.g. "Streaming Services" > Netflix),
// each folder holding TMDB lists. Same format as Nuvio's collections export
// and the collections stored in a Nuvio account.
import { h, icon, img, fill } from "../dom.js";
import { store } from "../store.js";
import { navigate, back } from "../router.js";
import { pref } from "../prefs.js";
import { tmdbAvailable, tmdbSourceItems } from "../services/tmdb.js";
import { openTmdbTitle } from "./detail.js";

export function visibleCollections() {
  const hidden = new Set(pref("collections.hidden", []));
  return store
    .collections()
    .filter((c) => c && c.id && Array.isArray(c.folders) && c.folders.length && !hidden.has(c.id));
}

function folderTile(collection, folder) {
  const cover = folder.coverImageUrl || folder.coverImage || "";
  const tile = h(
    "button.collection-tile",
    {
      type: "button",
      class: `${String(folder.tileShape || "LANDSCAPE").toUpperCase() === "POSTER" ? "is-poster" : ""} ${folder.hideTitle && cover ? "hide-title" : ""}`,
      "aria-label": folder.title,
      onclick: () =>
        navigate(`collection/${encodeURIComponent(collection.id)}/${encodeURIComponent(folder.id)}`)
    },
    h("span.collection-tile-title", {}, folder.title)
  );
  if (cover) {
    const art = img(cover, "collection-tile-img", "");
    // A cover that fails to load would leave a blank tile: show the name.
    art.addEventListener("error", () => tile.classList.remove("hide-title"), { once: true });
    tile.prepend(art);
  }
  return tile;
}

// Home rows: one row of folder tiles per collection.
export function collectionSections({ pinned }) {
  return visibleCollections()
    .filter((c) => (c.pinToTop !== false) === pinned)
    .map((c) =>
      h(
        "section.row.row-collection",
        {},
        h("div.row-head", {}, h("h2.row-title", {}, c.title)),
        h(
          "div.row-track.collection-track",
          {},
          c.folders.map((f) => folderTile(c, f))
        )
      )
    );
}

function tmdbPoster(item) {
  return h(
    "button.poster-card",
    { type: "button", "aria-label": item.name, onclick: () => openTmdbTitle(item) },
    h(
      "div.poster-frame",
      {},
      img(item.poster || item.background, "poster-img", ""),
      h("span.poster-fallback", {}, item.name)
    ),
    h("div.poster-title", {}, item.name),
    h("div.poster-year", {}, item.year || "")
  );
}

// Folder page: tabs (All + each source), grid that loads more as you scroll.
export function renderCollectionFolder([collectionId, folderId]) {
  const collection = store.collections().find((c) => c.id === collectionId);
  const folder = collection?.folders?.find((f) => f.id === folderId);
  const root = h("div.screen.screen-folder");
  const backButton = h(
    "button.round-button.glass.page-back",
    { type: "button", "aria-label": "Back", onclick: () => back() },
    icon("back", 26)
  );
  if (!collection || !folder) {
    root.append(backButton, h("div.empty-card", {}, h("div.empty-title", {}, "Folder not found")));
    return { el: root };
  }
  const sources = (folder.sources || []).filter((s) => s && (s.provider || "tmdb") === "tmdb");
  const tabs = h("div.folder-tabs");
  const grid = h("div.poster-grid");
  const status = h("div.folder-status");
  const sentinel = h("div.grid-sentinel");
  const cover = folder.coverImageUrl
    ? img(folder.coverImageUrl, "folder-cover", folder.title)
    : null;
  root.append(
    backButton,
    h(
      "header.folder-header",
      {},
      cover,
      h(
        "div.folder-heading",
        {},
        h("div.folder-kicker", {}, collection.title),
        h("h1.page-title", {}, folder.title)
      )
    ),
    tabs,
    status,
    grid,
    sentinel
  );

  if (!tmdbAvailable()) {
    fill(
      status,
      h(
        "div.empty-card",
        {},
        icon("info", 28),
        h("div.empty-title", {}, "Collections need TMDB"),
        h(
          "div.empty-text",
          {},
          "Add a TMDB key (repo secret TMDB_API_KEY, or Settings → Services → TMDB Enrichment)."
        ),
        h(
          "button.pill-button",
          { type: "button", onclick: () => navigate("profile/tmdb") },
          "TMDB settings"
        )
      )
    );
    return { el: root };
  }

  const showAll = collection.showAllTab !== false && sources.length > 1;
  const tabList = [
    ...(showAll ? [{ key: "all", title: "All" }] : []),
    ...sources.map((s, i) => ({ key: String(i), title: s.title || `List ${i + 1}` }))
  ];
  let active = tabList[0]?.key;
  let generation = 0;
  let loading = false;
  let state = null; // { pages: Map(sourceIndex -> next page), done: Set, seen: Set }

  function drawTabs() {
    fill(
      tabs,
      tabList.length > 1
        ? tabList.map((t) =>
            h(
              "button.season-tab",
              {
                type: "button",
                class: t.key === active ? "is-selected" : "",
                onclick: () => {
                  if (active === t.key) return;
                  active = t.key;
                  drawTabs();
                  reset();
                }
              },
              t.title
            )
          )
        : null
    );
  }

  function activeSources() {
    return active === "all" ? sources.map((s, i) => i) : [Number(active)];
  }

  async function loadMore() {
    if (loading || !state) return;
    const pending = activeSources().filter((i) => !state.done.has(i));
    if (!pending.length) return;
    loading = true;
    const gen = generation;
    const results = await Promise.all(
      pending.map(async (i) => {
        const page = state.pages.get(i) || 1;
        try {
          const r = await tmdbSourceItems(sources[i], page);
          state.pages.set(i, page + 1);
          if (!r.hasMore || !r.items.length) state.done.add(i);
          return r.items;
        } catch (_) {
          state.done.add(i);
          return [];
        }
      })
    );
    if (gen !== generation) return;
    // "All": interleave the lists so each source shows up near the top.
    const merged = [];
    for (let k = 0; results.some((r) => k < r.length); k += 1)
      for (const r of results) if (r[k]) merged.push(r[k]);
    const fresh = merged.filter((item) => {
      const key = `${item.type}:${item.tmdbId}`;
      if (state.seen.has(key)) return false;
      state.seen.add(key);
      return true;
    });
    grid.querySelectorAll(".is-skeleton").forEach((el) => el.remove());
    grid.append(...fresh.map(tmdbPoster));
    fill(
      status,
      !grid.children.length && state.done.size >= activeSources().length
        ? h("div.empty-card", {}, h("div.empty-title", {}, "Nothing here yet"))
        : null
    );
    loading = false;
    // Short first pages: keep filling until the screen is full.
    if (sentinel.getBoundingClientRect().top < window.innerHeight + 600) loadMore();
  }

  function reset() {
    generation += 1;
    loading = false;
    state = { pages: new Map(), done: new Set(), seen: new Set() };
    fill(
      grid,
      Array.from({ length: 10 }, () =>
        h("div.poster-card.is-skeleton", {}, h("div.poster-frame.shimmer"))
      )
    );
    fill(status);
    loadMore();
  }

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), {
          rootMargin: "800px 0px"
        })
      : null;
  observer?.observe(sentinel);
  drawTabs();
  reset();
  return {
    el: root,
    destroy() {
      generation += 1;
      observer?.disconnect();
    }
  };
}

// Nuvio's export format is an array of collections; accept { collections: [] } too.
export function parseCollectionsFile(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.collections)
      ? data.collections
      : null;
  if (!list) throw new Error("This file doesn't contain Nuvio collections");
  const valid = list.filter(
    (c) => c && typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.folders)
  );
  if (!valid.length) throw new Error("No collections found in this file");
  return valid;
}
