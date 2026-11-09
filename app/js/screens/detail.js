import { h, icon, img, fill } from "../dom.js";
import { fetchMeta } from "../addons.js";
import { store } from "../store.js";
import { back } from "../router.js";
import { toast } from "../sheet.js";
import { openStreams } from "./streams.js";

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((v) => v.trim());
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function episodeContext(meta, video) {
  return {
    type: meta.type,
    metaId: meta.id,
    videoId: video ? video.id : meta.id,
    name: meta.name,
    poster: meta.poster,
    background: meta.background,
    logo: meta.logo,
    year: meta.year,
    season: video?.season,
    episode: video?.episode ?? video?.number,
    episodeTitle: video ? video.title || video.name || "" : "",
    thumbnail: video?.thumbnail || ""
  };
}

function seriesEpisodes(meta) {
  return (meta.videos || [])
    .filter((v) => Number(v.season) >= 0)
    .map((v) => ({ ...v, season: Number(v.season), episode: Number(v.episode ?? v.number) }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

// First episode not watched yet, or one with saved progress.
function nextEpisode(meta, episodes) {
  const progress = store.progressMap();
  const resume = episodes.find((v) => progress[v.id]);
  if (resume) return resume;
  const watched = store.watchedSet();
  return (
    episodes.find((v) => v.season > 0 && !watched.has(v.id)) ||
    episodes.find((v) => v.season > 0) ||
    episodes[0]
  );
}

function metaLine(meta, episodes) {
  const seasons = new Set(episodes.filter((v) => v.season > 0).map((v) => v.season)).size;
  return h(
    "div.detail-meta",
    {},
    meta.year
      ? h(
          "span.detail-year",
          {},
          meta.type === "series" && meta.releaseInfo ? meta.releaseInfo : meta.year
        )
      : null,
    meta.type === "series" && seasons
      ? h("span", {}, `${seasons} Season${seasons === 1 ? "" : "s"}`)
      : null,
    meta.runtime ? h("span", {}, meta.runtime) : null,
    meta.certification ? h("span.cert-box", {}, meta.certification) : null,
    meta.imdbRating
      ? h(
          "span.imdb-chip",
          {},
          h("span.imdb-mark", {}, "IMDb"),
          h("span.imdb-score", {}, meta.imdbRating)
        )
      : null
  );
}

function episodeCard(meta, video) {
  const watched = store.isWatched(video.id);
  const progress = store.progressMap()[video.id];
  return h(
    "button.episode-card",
    { type: "button", onclick: () => openStreams(episodeContext(meta, video)) },
    img(video.thumbnail || meta.background, "episode-img", ""),
    h("span.episode-shade"),
    h(
      "span.episode-copy",
      {},
      h(
        "span.episode-chip",
        {},
        `S${video.season} E${video.episode}`,
        watched ? h("span.episode-watched", {}, " ✓") : null
      ),
      h("span.episode-title", {}, video.title || video.name || `Episode ${video.episode}`),
      video.overview || video.description
        ? h("span.episode-desc", {}, video.overview || video.description)
        : null,
      h(
        "span.episode-foot",
        {},
        video.runtime ? h("span", {}, video.runtime) : null,
        video.rating ? h("span.episode-rating", {}, `★ ${video.rating}`) : null,
        video.released ? h("span.episode-date", {}, formatDate(video.released)) : null
      )
    ),
    progress
      ? h(
          "span.cw-progress",
          {},
          h("span.cw-progress-fill", {
            style: { width: `${Math.min(100, (progress.time / progress.duration) * 100)}%` }
          })
        )
      : null
  );
}

function seasonsBlock(meta, episodes, initialSeason) {
  const seasons = [...new Set(episodes.map((v) => v.season))].sort(
    (a, b) => (a === 0) - (b === 0) || a - b
  );
  if (!seasons.length) return null;
  const tabs = h("div.season-tabs");
  const count = h("div.episode-count");
  const track = h("div.row-track.episode-track");
  const select = (season) => {
    tabs
      .querySelectorAll(".season-tab")
      .forEach((tab) => tab.classList.toggle("is-selected", Number(tab.dataset.season) === season));
    const items = episodes.filter((v) => v.season === season);
    count.textContent = `${items.length} episode${items.length === 1 ? "" : "s"}`;
    fill(track, ...items.map((video) => episodeCard(meta, video)));
    track.scrollLeft = 0;
  };
  seasons.forEach((season) =>
    tabs.append(
      h(
        "button.season-tab",
        { type: "button", dataset: { season }, onclick: () => select(season) },
        season === 0 ? "Specials" : `Season ${season}`
      )
    )
  );
  select(seasons.includes(initialSeason) ? initialSeason : seasons[0]);
  return h("section.detail-section", {}, h("h2.section-title", {}, "Episodes"), tabs, count, track);
}

function castBlock(meta) {
  const cast = list(meta.cast).slice(0, 20);
  if (!cast.length) return null;
  return h(
    "section.detail-section",
    {},
    h("h2.section-title", {}, "Cast"),
    h(
      "div.row-track.cast-track",
      {},
      cast.map((name) =>
        h(
          "div.cast-card",
          {},
          h(
            "div.cast-photo",
            {},
            name
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
          ),
          h("div.cast-name", {}, name)
        )
      )
    )
  );
}

function detailsBlock(meta) {
  const rows = [
    ["Release Info", meta.releaseInfo],
    ["Runtime", meta.runtime],
    ["Country", list(meta.country).join(", ")],
    ["Language", list(meta.language).join(", ")],
    ["Writers", list(meta.writer).slice(0, 3).join(", ")],
    ["Awards", meta.awards]
  ].filter(([, value]) => value);
  if (!rows.length) return null;
  return h(
    "section.detail-section",
    {},
    h("h2.section-title", {}, meta.type === "series" ? "Show Details" : "Details"),
    h(
      "div.details-table",
      {},
      rows.map(([label, value]) =>
        h(
          "div.details-row",
          {},
          h("span.details-label", {}, label),
          h("span.details-value", {}, value)
        )
      )
    )
  );
}

export function renderDetail([type, rawId]) {
  const id = decodeURIComponent(rawId || "");
  const backdrop = h("div.detail-backdrop");
  const topbar = h(
    "div.detail-topbar",
    {},
    h(
      "button.round-button.glass",
      { type: "button", "aria-label": "Back", onclick: () => back() },
      icon("back", 26)
    ),
    h("div.detail-topbar-title"),
    h("span.detail-topbar-spacer")
  );
  const body = h("div.detail-body", {}, h("div.detail-loading", {}, h("span.spinner")));
  const root = h("div.screen.screen-detail", {}, backdrop, topbar, body);

  const onScroll = () =>
    topbar.classList.toggle("is-solid", window.scrollY > window.innerHeight * 0.32);
  window.addEventListener("scroll", onScroll, { passive: true });

  fetchMeta(type, id).then((meta) => {
    if (!meta) {
      fill(
        body,
        h(
          "div.empty-card",
          {},
          icon("info", 28),
          h("div.empty-title", {}, "Details unavailable"),
          h("div.empty-text", {}, "None of your add-ons could provide details for this title.")
        )
      );
      return;
    }
    if (meta.background) {
      const bg = img(meta.background, "detail-backdrop-img", "");
      bg.loading = "eager";
      bg.addEventListener("load", () => bg.classList.add("is-loaded"), { once: true });
      backdrop.append(bg);
    }
    const episodes = meta.type === "series" ? seriesEpisodes(meta) : [];
    const next = meta.type === "series" ? nextEpisode(meta, episodes) : null;
    const progress = store.progressMap()[next ? next.id : meta.id];

    const titleEl = h("h1.detail-title-text", {}, meta.name);
    let logoEl = titleEl;
    if (meta.logo) {
      logoEl = img(meta.logo, "detail-logo", meta.name);
      logoEl.loading = "eager";
      logoEl.addEventListener("error", () => logoEl.replaceWith(titleEl), { once: true });
    }
    topbar.querySelector(".detail-topbar-title").textContent = meta.name;

    let playLabel = "Play";
    if (next) playLabel = `${progress ? "Resume" : "Play"} S${next.season} E${next.episode}`;
    else if (progress)
      playLabel = `Resume · ${Math.max(1, Math.round((progress.duration - progress.time) / 60))}m left`;

    const savedButton = h("button.round-button", {
      type: "button",
      "aria-label": "Add to Library"
    });
    const syncSaved = () => {
      const saved = store.isSaved(meta.id);
      fill(savedButton, icon(saved ? "check" : "add", 26));
      savedButton.setAttribute("aria-label", saved ? "Remove from Library" : "Add to Library");
    };
    savedButton.addEventListener("click", () => {
      const added = store.toggleSaved(meta);
      syncSaved();
      toast(added ? "Saved to Library" : "Removed from Library");
    });
    syncSaved();

    const watchedButton = h("button.round-button", { type: "button" });
    const syncWatched = () => {
      const watched = store.isWatched(meta.id);
      watchedButton.classList.toggle("is-on", watched);
      fill(watchedButton, icon(watched ? "watched" : "eye", 24));
      watchedButton.setAttribute("aria-label", watched ? "Mark as unwatched" : "Mark as watched");
    };
    watchedButton.addEventListener("click", () => {
      store.setWatched(meta.id, !store.isWatched(meta.id));
      syncWatched();
    });
    syncWatched();

    const trailer = (meta.trailerStreams || meta.trailers || []).find((t) => t.ytId || t.source);
    const trailerButton = trailer
      ? h(
          "button.round-button",
          {
            type: "button",
            "aria-label": "Trailer",
            onclick: () =>
              window.open(
                `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.ytId || trailer.source)}`,
                "_blank",
                "noopener"
              )
          },
          icon("external", 22)
        )
      : null;

    const genres = list(meta.genres || meta.genre);
    const directors = list(meta.director);
    const intro = h(
      "div.detail-intro",
      {},
      h("div.detail-logo-slot", {}, logoEl),
      metaLine(meta, episodes),
      genres.length ? h("div.detail-genres", {}, genres.join(" • ")) : null,
      directors.length
        ? h(
            "div.detail-director",
            {},
            h("span.muted", {}, "Director: "),
            directors.slice(0, 2).join(", ")
          )
        : null,
      meta.description ? h("p.detail-synopsis", {}, meta.description) : null,
      h(
        "div.detail-actions",
        {},
        h(
          "button.play-button",
          { type: "button", onclick: () => openStreams(episodeContext(meta, next)) },
          icon("play", 22),
          h("span", {}, playLabel)
        ),
        trailerButton,
        watchedButton,
        savedButton
      )
    );
    fill(
      body,
      intro,
      meta.type === "series" ? seasonsBlock(meta, episodes, next?.season) : null,
      castBlock(meta),
      detailsBlock(meta)
    );
  });

  return {
    el: root,
    destroy() {
      window.removeEventListener("scroll", onScroll);
    }
  };
}
