import { h, icon, img, safeImageUrl } from "./dom.js";
import { navigate } from "./router.js";
import { pref } from "./prefs.js";

let posterTransition = "";
// The detail page picks this up to grow the tapped poster into its backdrop.
export function takePosterTransition() {
  const url = posterTransition;
  posterTransition = "";
  return url;
}

export function openDetail(item) {
  posterTransition = pref("meta.posterTransition", true) ? item.poster || "" : "";
  navigate(`detail/${item.type}/${encodeURIComponent(item.id)}`);
}

// Custom poster source: {id}, {id_type} (imdb/tmdb/other), {type}, {imdb_id}, {tmdb_id}.
function customPoster(item) {
  const pattern = String(pref("poster.customUrl", "") || "").trim();
  if (!pattern || !item?.id) return "";
  const id = String(item.id);
  const imdb = id.match(/^tt\d+/)?.[0] || "";
  const tmdb = id.match(/^tmdb:(\d+)/)?.[1] || "";
  const values = {
    id: imdb || tmdb || id,
    id_type: imdb ? "imdb" : tmdb ? "tmdb" : "other",
    type: item.type || "",
    imdb_id: imdb,
    tmdb_id: tmdb
  };
  let missing = false;
  const url = pattern.replace(/\{(id|id_type|type|imdb_id|tmdb_id)\}/g, (_, key) => {
    if (!values[key]) missing = true;
    return encodeURIComponent(values[key]);
  });
  return missing ? "" : safeImageUrl(url);
}

export function posterCard(item, { width } = {}) {
  const landscape = !!pref("poster.landscape", false);
  const withLogo = landscape && !!pref("poster.landscapeLogo", false);
  const custom = landscape ? "" : customPoster(item);
  const art = landscape ? item.background || item.poster : custom || item.poster;
  const image = img(art, "poster-img", "");
  if (custom && item.poster) {
    image.addEventListener(
      "error",
      () => {
        image.classList.remove("is-broken");
        image.src = safeImageUrl(item.poster);
      },
      { once: true }
    );
  }
  return h(
    "button.poster-card",
    {
      type: "button",
      class: landscape ? "is-landscape" : "",
      onclick: () => openDetail({ ...item, poster: art }),
      style: width ? { width: `${width}px` } : null,
      "aria-label": item.name
    },
    h(
      "div.poster-frame",
      {},
      image,
      h("span.poster-fallback", {}, item.name),
      withLogo && item.logo ? img(item.logo, "poster-logo", "") : null
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

// Continue Watching card. Styles: card (landscape), wide (info-dense), poster.
// entry.kind is "progress" (resume) or "next" (Next Up episode).
export function cwCard(entry, onOpen) {
  const style = pref("cw.style", "card");
  const isNext = entry.kind === "next";
  const remaining = isNext ? 0 : Math.max(0, Math.round((entry.duration - entry.time) / 60));
  const label = entry.season ? `S${entry.season} E${entry.episode}` : entry.year || "";
  const preferThumb = pref("cw.episodeThumbs", true);
  const art =
    style === "poster"
      ? entry.poster || entry.background
      : (preferThumb && entry.thumbnail) || entry.background || entry.thumbnail || entry.poster;
  const blur = isNext && pref("cw.blur", false) && art === entry.thumbnail;
  let chip = remaining > 0 ? `${remaining}m left` : "Resume";
  if (isNext)
    chip = entry.upcoming
      ? `Airs ${entry.airDate || "soon"}`
      : entry.isNew
        ? "New Episode"
        : "Next Up";
  return h(
    "button.cw-card",
    {
      type: "button",
      class: `is-${style} ${blur ? "is-blurred" : ""} ${entry.upcoming ? "is-upcoming" : ""} ${entry.isNew ? "is-new" : ""}`,
      onclick: () => onOpen(entry),
      "aria-label": entry.name
    },
    h("span.cw-art", {}, img(art, "cw-img", "")),
    h("span.cw-shade"),
    h("span.cw-chip", {}, chip),
    h(
      "span.cw-copy",
      {},
      label ? h("span.cw-label", {}, label) : null,
      h("span.cw-title", {}, entry.name),
      entry.episodeTitle ? h("span.cw-sub", {}, entry.episodeTitle) : null,
      style === "wide" && entry.description ? h("span.cw-desc", {}, entry.description) : null
    ),
    isNext
      ? null
      : h(
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
