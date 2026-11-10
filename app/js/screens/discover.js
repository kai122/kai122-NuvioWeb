import { h, icon, fill } from "../dom.js";
import { listCatalogs, fetchCatalog, search, typeLabel, catalogSupportsExtra } from "../addons.js";
import { posterCard, skeletonPosters, pageHeader } from "../components.js";
import { openSheet, optionList } from "../sheet.js";
import { store } from "../store.js";
import { pref } from "../prefs.js";

const PAGE_SIZE = 100;

function chip(label, onClick, disabled = false) {
  return h(
    "button.chip",
    { type: "button", disabled, onclick: onClick },
    h("span", {}, label),
    icon("chevronDown", 18)
  );
}

export function renderDiscover([presetKey] = []) {
  const grid = h("div.poster-grid");
  const sentinel = h("div.grid-sentinel");
  const source = h("div.discover-source");
  const chips = h("div.chip-row");
  const input = h("input.search-input", {
    type: "search",
    placeholder: "Search movies & series",
    enterkeyhint: "search",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false"
  });
  const searchBar = h("div.search-bar.is-hidden", {}, icon("search", 20), input);
  let searching = false;
  const searchButton = h(
    "button.icon-button",
    { type: "button", "aria-label": "Search", onclick: () => toggleSearch(!searching) },
    icon("search", 26)
  );
  const header = pageHeader("Discover", searchButton);
  const browse = h("div.discover-browse", {}, chips, source, grid, sentinel);
  const results = h("div.search-results.is-hidden");
  const recent = h("div.recent-searches.is-hidden");
  const root = h("div.screen.screen-discover", {}, header, searchBar, recent, browse, results);

  // Recent Searches: shown while the search bar is focused and empty.
  function drawRecent() {
    const list = pref("search.recent", true) ? store.recentSearches() : [];
    const visible = searching && !input.value.trim() && list.length > 0;
    recent.classList.toggle("is-hidden", !visible);
    if (!visible) return;
    fill(
      recent,
      h(
        "div.recent-head",
        {},
        h("h2.row-title", {}, "Recent Searches"),
        h(
          "button.link-button",
          {
            type: "button",
            onclick: () => {
              store.clearRecentSearches();
              drawRecent();
            }
          },
          "Clear"
        )
      ),
      h(
        "div.recent-chips",
        {},
        list.map((query) =>
          h(
            "button.chip",
            {
              type: "button",
              onclick: () => {
                input.value = query;
                input.dispatchEvent(new Event("input"));
              }
            },
            icon("search", 16),
            h("span", {}, query)
          )
        )
      )
    );
  }

  let catalogs = [];
  let type = "movie";
  let current = null;
  let genre = "";
  let items = [];
  let loading = false;
  let done = false;
  let generation = 0;

  function catalogsOfType(t) {
    return catalogs.filter((entry) => entry.catalog.type === t);
  }

  function genreOptions(entry) {
    const extra = (entry?.catalog.extra || []).find((e) => e.name === "genre");
    return extra?.options || entry?.catalog.genres || [];
  }

  function renderChips() {
    const types = [...new Set(catalogs.map((entry) => entry.catalog.type))];
    const genres = genreOptions(current);
    fill(
      chips,
      chip(typeLabel(type), () =>
        pick(
          "Select Type",
          types.map((t) => ({ value: t, label: typeLabel(t) })),
          type,
          (value) => {
            type = value;
            current = catalogsOfType(type)[0] || null;
            genre = "";
            reload();
          }
        )
      ),
      chip(current ? current.catalog.name || current.addon.manifest.name : "Catalog", () =>
        pick(
          "Select Catalog",
          catalogsOfType(type).map((entry) => ({
            value: entry.key,
            label: `${entry.catalog.name || entry.addon.manifest.name}`
          })),
          current?.key,
          (value) => {
            current = catalogs.find((entry) => entry.key === value) || current;
            genre = "";
            reload();
          }
        )
      ),
      chip(
        genre || "All Genres",
        () =>
          pick(
            "Select Genre",
            [{ value: "", label: "All Genres" }, ...genres.map((g) => ({ value: g, label: g }))],
            genre,
            (value) => {
              genre = value;
              reload();
            }
          ),
        !genres.length
      )
    );
    source.textContent = current
      ? `${current.addon.manifest.name} • ${typeLabel(current.catalog.type)}`
      : "";
  }

  function pick(title, options, selected, onSelect) {
    const sheet = openSheet({
      title,
      content: optionList(options, {
        selected,
        onSelect: (value) => {
          sheet.close();
          if (value !== selected) onSelect(value);
        }
      })
    });
  }

  async function loadMore() {
    if (!current || loading || done) return;
    loading = true;
    const gen = generation;
    const extra = {};
    if (genre) extra.genre = genre;
    if (items.length && catalogSupportsExtra(current.catalog, "skip")) extra.skip = items.length;
    else if (items.length) {
      done = true;
      loading = false;
      return;
    }
    try {
      const page = await fetchCatalog(current, extra);
      if (gen !== generation) return;
      grid.querySelectorAll(".is-skeleton").forEach((el) => el.remove());
      const seen = new Set(items.map((item) => item.id));
      const fresh = page.filter((item) => !seen.has(item.id));
      items.push(...fresh);
      grid.append(...fresh.map((item) => posterCard(item)));
      if (!fresh.length || page.length < PAGE_SIZE / 5) done = true;
    } catch (_) {
      done = true;
      grid.querySelectorAll(".is-skeleton").forEach((el) => el.remove());
    } finally {
      if (gen === generation) loading = false;
    }
  }

  function reload() {
    generation += 1;
    items = [];
    done = false;
    loading = false;
    fill(grid, ...skeletonPosters(10));
    renderChips();
    loadMore();
  }

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), {
          rootMargin: "800px 0px"
        })
      : null;
  observer?.observe(sentinel);

  // Search
  let searchTimer = null;
  let searchGen = 0;
  // Search mode: the native app turns the page into "Search" with an X.
  function toggleSearch(on) {
    searching = on;
    searchBar.classList.toggle("is-hidden", !on);
    header.querySelector(".page-title").textContent = on ? "Search" : "Discover";
    fill(searchButton, icon(on ? "close" : "search", 26));
    searchButton.setAttribute("aria-label", on ? "Close search" : "Search");
    if (on) {
      input.focus();
    } else {
      input.value = "";
      results.classList.add("is-hidden");
      browse.classList.remove("is-hidden");
    }
    drawRecent();
  }
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = input.value.trim();
    drawRecent();
    if (query.length < 2) {
      results.classList.add("is-hidden");
      browse.classList.remove("is-hidden");
      return;
    }
    searchTimer = setTimeout(async () => {
      const gen = ++searchGen;
      browse.classList.add("is-hidden");
      results.classList.remove("is-hidden");
      fill(results, h("div.poster-grid", {}, skeletonPosters(10)));
      const groups = await search(query);
      if (gen !== searchGen) return;
      if (pref("search.recent", true) && groups.some((g) => g.items.length))
        store.addRecentSearch(query);
      const filled = groups.filter((group) => group.items.length);
      fill(
        results,
        ...(filled.length
          ? filled.map((group) =>
              h(
                "section.search-group",
                {},
                h(
                  "h2.row-title",
                  {},
                  `${group.catalog.name || group.addon.manifest.name} - ${typeLabel(group.catalog.type)}`
                ),
                h(
                  "div.poster-grid",
                  {},
                  group.items.map((item) => posterCard(item))
                )
              )
            )
          : [
              h(
                "div.empty-card",
                {},
                icon("search", 28),
                h("div.empty-title", {}, "No results"),
                h("div.empty-text", {}, `Nothing matched “${query}”.`)
              )
            ])
      );
    }, 350);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });

  listCatalogs().then((list) => {
    catalogs = list;
    current = catalogs.find((entry) => entry.key === presetKey) || catalogs[0] || null;
    if (current) type = current.catalog.type;
    reload();
  });

  return {
    el: root,
    destroy() {
      observer?.disconnect();
      clearTimeout(searchTimer);
    }
  };
}
