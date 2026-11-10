import { h, icon, fill } from "../dom.js";
import { store } from "../store.js";
import { posterCard, pageHeader, emptyState } from "../components.js";
import { openSheet, optionList } from "../sheet.js";

const SORTS = [
  { value: "added", label: "Recently added" },
  { value: "name", label: "Title A–Z" },
  { value: "year", label: "Release year" }
];
const FILTER_KEY = "nuvioTouch.libraryView";

function readView() {
  try {
    return {
      filter: "all",
      sort: "added",
      ...(JSON.parse(sessionStorage.getItem(FILTER_KEY) || "null") || {})
    };
  } catch (_) {
    return { filter: "all", sort: "added" };
  }
}

export function renderLibrary() {
  const view = readView();
  const segments = h("div.segmented");
  const sortButton = h("button.chip", { type: "button" });
  const content = h("div");
  const root = h(
    "div.screen.screen-library",
    {},
    pageHeader("Library"),
    h("div.library-bar", {}, segments, sortButton),
    content
  );

  function remember() {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(view));
    } catch (_) {
      /* ignore */
    }
  }

  function draw() {
    const all = store.library();
    const watched = store.watchedSet();
    const tabs = [
      ["all", "All"],
      ["movie", "Movies"],
      ["series", "Series"],
      ["watched", "Watched"]
    ];
    fill(
      segments,
      tabs.map(([value, label]) =>
        h(
          "button.segment",
          {
            type: "button",
            class: view.filter === value ? "is-selected" : "",
            onclick: () => {
              view.filter = value;
              remember();
              draw();
            }
          },
          label
        )
      )
    );
    fill(
      sortButton,
      icon("sort", 18),
      h("span", {}, SORTS.find((s) => s.value === view.sort)?.label),
      icon("chevronDown", 18)
    );
    sortButton.onclick = () => {
      const sheet = openSheet({
        title: "Sort by",
        content: optionList(SORTS, {
          selected: view.sort,
          onSelect: (value) => {
            view.sort = value;
            remember();
            sheet.close();
            draw();
          }
        })
      });
    };
    let items = all.filter((item) => {
      if (view.filter === "watched") return watched.has(item.id);
      if (view.filter === "movie" || view.filter === "series") return item.type === view.filter;
      return true;
    });
    if (view.sort === "name")
      items = [...items].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else if (view.sort === "year")
      items = [...items].sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
    fill(
      content,
      items.length
        ? h(
            "div.poster-grid",
            {},
            items.map((item) => posterCard(item))
          )
        : all.length
          ? emptyState("Nothing here", "No saved titles match this filter.")
          : emptyState(
              "Your library is empty",
              "Saved titles will appear here when you tap + on a details screen."
            )
    );
  }

  return { el: root, onShow: draw };
}
