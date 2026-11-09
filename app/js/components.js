import { h, icon, img } from "./dom.js";
import { navigate } from "./router.js";

export function openDetail(item) {
  navigate(`detail/${item.type}/${encodeURIComponent(item.id)}`);
}

export function posterCard(item, { width } = {}) {
  return h(
    "button.poster-card",
    {
      type: "button",
      onclick: () => openDetail(item),
      style: width ? { width: `${width}px` } : null,
      "aria-label": item.name
    },
    h(
      "div.poster-frame",
      {},
      img(item.poster, "poster-img", ""),
      h("span.poster-fallback", {}, item.name)
    ),
    h("div.poster-title", {}, item.name || ""),
    h("div.poster-year", {}, item.year || item.releaseInfo || "")
  );
}

export function rowSection(title, { onMore, className = "" } = {}) {
  const track = h("div.row-track");
  const section = h(
    "section.row",
    { class: className },
    h(
      "div.row-head",
      {},
      h("h2.row-title", {}, title),
      onMore
        ? h(
            "button.row-more",
            { type: "button", onclick: onMore, "aria-label": `See all ${title}` },
            icon("chevronRight", 20)
          )
        : null
    ),
    track
  );
  return { section, track };
}

export function skeletonPosters(count = 9) {
  return Array.from({ length: count }, () =>
    h(
      "div.poster-card.is-skeleton",
      {},
      h("div.poster-frame.shimmer"),
      h("div.skel-line.shimmer"),
      h("div.skel-line.short.shimmer")
    )
  );
}

export function cwCard(entry, onOpen) {
  const remaining = Math.max(0, Math.round((entry.duration - entry.time) / 60));
  const label = entry.season ? `S${entry.season} E${entry.episode}` : entry.year || "";
  return h(
    "button.cw-card",
    { type: "button", onclick: () => onOpen(entry), "aria-label": entry.name },
    img(entry.thumbnail || entry.background || entry.poster, "cw-img", ""),
    h("span.cw-shade"),
    h("span.cw-chip", {}, remaining > 0 ? `${remaining}m left` : "Resume"),
    h(
      "span.cw-copy",
      {},
      label ? h("span.cw-label", {}, label) : null,
      h("span.cw-title", {}, entry.name),
      entry.episodeTitle ? h("span.cw-sub", {}, entry.episodeTitle) : null
    ),
    h(
      "span.cw-progress",
      {},
      h("span.cw-progress-fill", {
        style: { width: `${Math.min(100, (entry.time / entry.duration) * 100)}%` }
      })
    )
  );
}

export function pageHeader(title, trailing) {
  return h("header.page-header", {}, h("h1.page-title", {}, title), trailing || null);
}

export function emptyState(title, text, iconName = "bookmark") {
  return h(
    "div.empty-card",
    {},
    icon(iconName, 28),
    h("div.empty-title", {}, title),
    h("div.empty-text", {}, text)
  );
}
