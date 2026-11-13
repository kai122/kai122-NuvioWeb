import { h, icon, img, fill, safeImageUrl, prefersReducedMotion } from "../dom.js";
import { fetchMeta } from "../addons.js";
import { store } from "../store.js";
import { back, navigate } from "../router.js";
import { toast, openSheet, optionList } from "../sheet.js";
import { pref } from "../prefs.js";
import { openStreams } from "./streams.js";
import { enrichMeta, seasonDetails, imdbIdFor } from "../services/tmdb.js";
import { fetchRatings } from "../services/mdblist.js";
import { takePosterTransition } from "../components.js";

const TMDB_WAIT_MS = 4000;
const TRAILER_DELAY_MS = 2500;

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function isReleased(video) {
  const date = new Date(video?.released || video?.firstAired || "");
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

export function episodeContext(meta, video) {
  return {
    type: meta.type,
    metaId: meta.id,
    videoId: video ? video.id : meta.id,
    name: meta.name,
    poster: meta.poster,
    background: meta.background,
    logo: meta.logo,
    year: meta.year,
    description: meta.description || "",
    certification: meta.certification || "",
    season: video?.season,
    episode: video?.episode ?? video?.number,
    episodeTitle: video ? video.title || video.name || "" : "",
    thumbnail: video?.thumbnail || ""
  };
}

export function seriesEpisodes(meta) {
  return (meta.videos || [])
    .filter((v) => v && v.id && Number(v.season) >= 0)
    .map((v) => ({ ...v, season: Number(v.season), episode: Number(v.episode ?? v.number) }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

// First episode with saved progress, else the first unwatched one.
function nextEpisode(meta, episodes) {
  const progress = store.progressMap();
  const resume = episodes.find((v) => progress[v.id]);
  if (resume) return resume;
  const watched = store.watchedSet();
  return (
    episodes.find((v) => v.season > 0 && !watched.has(v.id) && isReleased(v)) ||
    episodes.find((v) => v.season > 0) ||
    episodes[0] ||
    null
  );
}

function ratingChips(meta, external) {
  const chips = [];
  if (meta.imdbRating)
    chips.push(
      h(
        "span.imdb-chip",
        {},
        h("span.imdb-mark", {}, "IMDb"),
        h("span.imdb-score", {}, meta.imdbRating)
      )
    );
  for (const r of external) {
    if (r.source === "imdb") {
      if (!meta.imdbRating)
        chips.push(
          h(
            "span.imdb-chip",
            {},
            h("span.imdb-mark", {}, "IMDb"),
            h("span.imdb-score", {}, r.value)
          )
        );
      continue;
    }
    chips.push(
      h(
        "span.rating-chip",
        {},
        h("span.rating-source", {}, r.label),
        h("span.rating-value", {}, r.value)
      )
    );
  }
  if (!chips.length && meta.tmdbRating)
    chips.push(
      h(
        "span.rating-chip",
        {},
        h("span.rating-source", {}, "TMDB"),
        h("span.rating-value", {}, meta.tmdbRating)
      )
    );
  return chips;
}

function metaLine(meta, episodes, ratingsSlot) {
  const seasons = new Set(episodes.filter((v) => v.season > 0).map((v) => v.season)).size;
  // Like the native app: series show "N Seasons" (no year or runtime),
  // movies show the year and runtime.
  const series = meta.type === "series" && seasons > 0;
  return h(
    "div.detail-meta",
    {},
    series
      ? h("span.detail-year", {}, `${seasons} Season${seasons === 1 ? "" : "s"}`)
      : meta.year
        ? h("span.detail-year", {}, meta.year)
        : null,
    !series && meta.runtime ? h("span", {}, meta.runtime) : null,
    meta.certification ? h("span.cert-box", {}, meta.certification) : null,
    ratingsSlot
  );
}

function episodeCard(meta, video, tmdbExtra) {
  const extra = tmdbExtra?.get(video.episode) || {};
  const watched = store.isWatched(video.id);
  const progress = store.progressMap()[video.id];
  const title = extra.title || video.title || video.name || `Episode ${video.episode}`;
  const overview = extra.overview || video.overview || video.description;
  const thumb = video.thumbnail || extra.thumbnail || meta.background;
  const runtime = video.runtime || extra.runtime;
  const rating = video.rating || extra.rating;
  const released = video.released || extra.released;
  const blur = pref("meta.blurUnwatched", false) && !watched && !progress;
  const upcoming = !isReleased({ released });
  return h(
    "button.episode-card",
    {
      type: "button",
      class: `${blur ? "is-blurred" : ""} ${upcoming ? "is-upcoming" : ""}`,
      onclick: () =>
        openStreams(
          episodeContext(meta, {
            ...video,
            title,
            thumbnail: thumb === meta.background ? "" : thumb
          })
        )
    },
    h("span.episode-thumb", {}, img(thumb, "episode-img", "")),
    h("span.episode-shade"),
    h(
      "span.episode-copy",
      {},
      h(
        "span.episode-chip",
        {},
        `S${video.season} E${video.episode}`,
        watched ? h("span.episode-watched", {}, " ✓") : null,
        upcoming ? h("span.episode-soon", {}, " · Upcoming") : null
      ),
      h("span.episode-title", {}, title),
      overview ? h("span.episode-desc", {}, overview) : null,
      h(
        "span.episode-foot",
        {},
        runtime ? h("span", {}, runtime) : null,
        rating ? h("span.episode-rating", {}, `★ ${rating}`) : null,
        released ? h("span.episode-date", {}, formatDate(released)) : null
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

// Seasons (poster tiles when TMDB has season posters, like the native app;
// otherwise pills) and Episodes with search and sort.
function seasonsBlock(meta, episodes, initialSeason) {
  const seasons = [...new Set(episodes.map((v) => v.season))].sort(
    (a, b) => (a === 0) - (b === 0) || a - b
  );
  if (!seasons.length) return [];
  const layout = pref("meta.episodeCards", "horizontal") === "list" ? "is-list" : "is-row";
  const posters = seasons.some((season) => meta.seasonPosters?.[season]);
  const picker = h(posters ? "div.row-track.season-poster-track" : "div.season-tabs");
  const search = h("input.episode-search", {
    type: "search",
    placeholder: "Search title, plot or number",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "search"
  });
  const sortButton = h("button.episode-tool", { type: "button" }, "Sort");
  const count = h("div.episode-count");
  const order = h("div.episode-count.is-order");
  const track = h("div.episode-track", {
    class: layout === "is-row" ? "row-track" : "episode-list"
  });
  let active = null;
  let extra = null;
  let descending = false;
  const matches = (video, q) => {
    if (!q) return true;
    const e = extra?.get(video.episode) || {};
    if (String(video.episode) === q || `e${video.episode}` === q) return true;
    return [video.title, video.name, video.overview, video.description, e.title, e.overview].some(
      (text) =>
        String(text || "")
          .toLowerCase()
          .includes(q)
    );
  };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const all = episodes.filter((v) => v.season === active);
    let items = all.filter((v) => matches(v, q));
    if (descending) items = [...items].reverse();
    count.textContent = `${items.length} of ${all.length} episode${all.length === 1 ? "" : "s"}`;
    order.textContent = descending ? "Episode: last to first" : "Episode: first to last";
    fill(track, ...items.map((video) => episodeCard(meta, video, extra)));
  };
  const select = async (season) => {
    active = season;
    extra = null;
    picker
      .querySelectorAll("[data-season]")
      .forEach((tab) => tab.classList.toggle("is-selected", Number(tab.dataset.season) === season));
    track.scrollLeft = 0;
    draw();
    if (!meta.tmdbId) return;
    try {
      const details = await seasonDetails(meta.tmdbId, season);
      if (details && active === season) {
        extra = details;
        draw();
      }
    } catch (_) {
      /* keep the add-on's episode data */
    }
  };
  search.addEventListener("input", draw);
  sortButton.addEventListener("click", () => {
    descending = !descending;
    draw();
  });
  seasons.forEach((season) => {
    const label = season === 0 ? "Specials" : `Season ${season}`;
    picker.append(
      posters
        ? h(
            "button.season-poster-tile",
            { type: "button", dataset: { season }, onclick: () => select(season) },
            h(
              "span.season-poster-frame",
              {},
              img(meta.seasonPosters?.[season] || meta.poster, "season-poster-img", "")
            ),
            h("span.season-poster-label", {}, label)
          )
        : h(
            "button.season-tab",
            { type: "button", dataset: { season }, onclick: () => select(season) },
            h("span", {}, label)
          )
    );
  });
  select(seasons.includes(initialSeason) ? initialSeason : seasons[0]);
  return [
    posters ? h("section.detail-section", {}, h("h2.section-title", {}, "Seasons"), picker) : null,
    h(
      "section.detail-section",
      { class: layout },
      h("h2.section-title", {}, "Episodes"),
      posters ? null : picker,
      h(
        "div.episode-toolbar",
        {},
        h("label.episode-search-wrap", {}, icon("search", 18), search),
        sortButton
      ),
      h("div.episode-meta-row", {}, count, order),
      track
    )
  ];
}

// Trailers row (TMDB videos), opening YouTube.
function trailersBlock(meta) {
  const list = (meta.trailers || []).filter((t) => /^[\w-]{6,20}$/.test(t.ytId || ""));
  if (!list.length) return null;
  return h(
    "section.detail-section",
    {},
    h("h2.section-title", {}, "Trailers"),
    h(
      "div.row-track.trailer-track",
      {},
      list.map((t) =>
        h(
          "button.trailer-card",
          {
            type: "button",
            "aria-label": t.name || "Trailer",
            onclick: () =>
              window.open(
                `https://www.youtube.com/watch?v=${encodeURIComponent(t.ytId)}`,
                "_blank",
                "noopener"
              )
          },
          h(
            "span.trailer-thumb",
            {},
            img(
              `https://i.ytimg.com/vi/${encodeURIComponent(t.ytId)}/hqdefault.jpg`,
              "trailer-img",
              ""
            ),
            h("span.trailer-play", {}, icon("play", 22))
          ),
          h("span.trailer-name", {}, t.name || "Trailer"),
          t.year ? h("span.trailer-year", {}, t.year) : null
        )
      )
    )
  );
}

// Rating Map: every episode's TMDB rating for a season, as coloured tiles.
function ratingMapBlock(meta, episodes) {
  if (meta.type !== "series" || !meta.tmdbId) return null;
  const seasons = [...new Set(episodes.map((v) => v.season))]
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  if (!seasons.length) return null;
  const section = h("section.detail-section.rating-map");
  const seasonButton = h("button.episode-tool.has-chevron", { type: "button" });
  const summary = h("span.rating-summary");
  const grid = h("div.rating-grid");
  const footer = h("div.rating-footer");
  const legend = h(
    "div.rating-legend",
    {},
    [
      ["is-top", "9+"],
      ["is-great", "8–9"],
      ["is-good", "7–8"],
      ["is-ok", "6–7"],
      ["is-low", "<6"]
    ].map(([cls, label]) =>
      h("span.rating-legend-item", {}, h("span.rating-dot", { class: cls }), label)
    )
  );
  const band = (r) =>
    r >= 9 ? "is-top" : r >= 8 ? "is-great" : r >= 7 ? "is-good" : r >= 6 ? "is-ok" : "is-low";
  let active = seasons[0];
  async function load(season) {
    active = season;
    fill(seasonButton, h("span", {}, `Season ${season}`), icon("chevronDown", 16));
    fill(grid);
    let details = null;
    try {
      details = await seasonDetails(meta.tmdbId, season);
    } catch (_) {
      details = null;
    }
    if (active !== season) return;
    const rated = episodes
      .filter((v) => v.season === season)
      .map((v) => ({ v, r: Number(details?.get(v.episode)?.rating || v.rating || 0) }))
      .filter((x) => x.r > 0);
    if (!rated.length) {
      if (seasons.length === 1) section.remove();
      fill(summary);
      fill(footer, h("span.muted", {}, "No ratings for this season yet."));
      return;
    }
    const avg = rated.reduce((sum, x) => sum + x.r, 0) / rated.length;
    fill(
      summary,
      icon("star", 14),
      ` Average ${avg.toFixed(1)} · ${rated.length} episode${rated.length === 1 ? "" : "s"} rated`
    );
    fill(
      grid,
      rated.map(({ v, r }) =>
        h(
          "button.rating-tile",
          {
            type: "button",
            class: band(r),
            "aria-label": `Episode ${v.episode}: ${r.toFixed(1)}`,
            onclick: () =>
              toast(
                `S${v.season} E${v.episode}${v.title || v.name ? ` · ${v.title || v.name}` : ""} — ${r.toFixed(1)}`
              )
          },
          r.toFixed(1)
        )
      )
    );
    const best = rated.reduce((a, b) => (b.r > a.r ? b : a));
    const worst = rated.reduce((a, b) => (b.r < a.r ? b : a));
    fill(
      footer,
      h("p.rating-hint", {}, "Tap an episode to see its rating."),
      h(
        "div.rating-extremes",
        {},
        h(
          "span.rating-chip",
          {},
          h("span.rating-dot", { class: "is-great" }),
          `Best S${best.v.season} E${best.v.episode}`
        ),
        h(
          "span.rating-chip",
          {},
          h("span.rating-dot", { class: "is-good" }),
          `Lowest S${worst.v.season} E${worst.v.episode}`
        )
      )
    );
  }
  seasonButton.addEventListener("click", () => {
    const sheet = openSheet({
      title: "Season",
      content: optionList(
        seasons.map((s) => ({ value: s, label: `Season ${s}` })),
        {
          selected: active,
          onSelect: (value) => {
            sheet.close();
            load(Number(value));
          }
        }
      )
    });
  });
  fill(
    section,
    h("h2.section-title", {}, "Rating Map"),
    h("div.rating-head", {}, seasonButton, summary),
    grid,
    legend,
    footer
  );
  load(active);
  return section;
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function castBlock(meta) {
  const people = meta.castFull?.length
    ? meta.castFull
    : list(meta.cast)
        .slice(0, 20)
        .map((name) => ({ name, character: "", photo: "" }));
  if (!people.length) return null;
  return h(
    "section.detail-section",
    {},
    h("h2.section-title", {}, "Cast"),
    h(
      "div.row-track.cast-track",
      {},
      people.map((person) =>
        h(
          person.id ? "button.cast-card" : "div.cast-card",
          person.id
            ? {
                type: "button",
                "aria-label": person.name,
                onclick: () => navigate(`person/${person.id}`)
              }
            : {},
          h(
            "div.cast-photo",
            {},
            person.photo ? img(person.photo, "cast-img", "") : null,
            h("span.cast-initials", {}, initials(person.name))
          ),
          h("div.cast-name", {}, person.name),
          person.character ? h("div.cast-role", {}, person.character) : null
        )
      )
    )
  );
}

function logosBlock(title, entries) {
  if (!entries?.length) return null;
  return h(
    "section.detail-section",
    {},
    h("h2.section-title", {}, title),
    h(
      "div.row-track.company-track",
      {},
      entries.map((entry) =>
        h(
          entry.id ? "button.company-card" : "div.company-card",
          entry.id
            ? {
                type: "button",
                title: entry.name,
                "aria-label": entry.name,
                onclick: () => navigate(`company/${entry.kind || "company"}/${entry.id}`)
              }
            : { title: entry.name },
          entry.logo
            ? img(entry.logo, "company-logo", entry.name)
            : h("span.company-name", {}, entry.name)
        )
      )
    )
  );
}

// TMDB titles: find the IMDb id so the user's add-ons can provide streams.
export async function openTmdbTitle(item) {
  try {
    const imdb = await imdbIdFor(item.type, item.tmdbId);
    if (imdb) {
      navigate(`detail/${item.type}/${encodeURIComponent(imdb)}`);
      return;
    }
  } catch (_) {
    /* fall through */
  }
  toast("This title isn't available from your add-ons");
}

function tmdbRow(title, items) {
  if (!items?.length) return null;
  return h(
    "section.detail-section",
    {},
    h("h2.section-title", {}, title),
    h(
      "div.row-track",
      {},
      items.map((item) =>
        h(
          "button.poster-card",
          { type: "button", "aria-label": item.name, onclick: () => openTmdbTitle(item) },
          h(
            "div.poster-frame",
            {},
            img(item.poster, "poster-img", ""),
            h("span.poster-fallback", {}, item.name)
          ),
          h("div.poster-title", {}, item.name),
          h("div.poster-year", {}, item.year || "")
        )
      )
    )
  );
}

function detailsBlock(meta) {
  const rows = [
    ["Release Info", meta.released ? formatDate(meta.released) : meta.releaseInfo],
    ["Status", meta.status],
    ["Runtime", meta.runtime],
    ["Created by", list(meta.creators).join(", ")],
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

// "Dominant Color": average the backdrop. Only works when the image host
// allows it (CORS); otherwise the page keeps the cinematic look.
function applyDominantColor(url, root) {
  const safe = safeImageUrl(url);
  if (!safe) return;
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.decoding = "async";
  probe.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 14;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(probe, 0, 0, 24, 14);
      const data = ctx.getImageData(0, 0, 24, 14).data;
      let r = 0;
      let g = 0;
      let b = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const dim = (v) => Math.round((v / n) * 0.45);
      root.style.setProperty("--detail-tint", `rgb(${dim(r)}, ${dim(g)}, ${dim(b)})`);
      root.classList.add("has-tint");
    } catch (_) {
      /* tainted canvas: keep cinematic */
    }
  };
  probe.src = safe;
}

function trailerPreview(backdrop, ytId) {
  if (!ytId || prefersReducedMotion()) return null;
  const timer = setTimeout(() => {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${encodeURIComponent(ytId)}&playsinline=1&modestbranding=1&rel=0`;
    const frame = h("iframe.detail-trailer", {
      src,
      title: "Trailer preview",
      allow: "autoplay; encrypted-media",
      referrerpolicy: "strict-origin-when-cross-origin",
      sandbox: "allow-scripts allow-same-origin",
      tabindex: "-1"
    });
    frame.addEventListener(
      "load",
      () => setTimeout(() => frame.classList.add("is-playing"), 1200),
      { once: true }
    );
    backdrop.append(frame);
  }, TRAILER_DELAY_MS);
  return () => clearTimeout(timer);
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

export function renderDetail([type, rawId]) {
  const id = String(rawId || "");
  const background = pref("meta.background", "cinematic");
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
  const root = h("div.screen.screen-detail", { class: `bg-${background}` }, backdrop, topbar, body);
  let stopTrailer = null;
  let alive = true;

  // Poster transition: the tapped poster grows into the backdrop.
  const transitionPoster = takePosterTransition();
  if (transitionPoster) {
    const ghost = img(transitionPoster, "detail-backdrop-img is-poster-ghost", "");
    ghost.loading = "eager";
    backdrop.append(ghost);
  }

  const onScroll = () =>
    topbar.classList.toggle("is-solid", window.scrollY > window.innerHeight * 0.32);
  window.addEventListener("scroll", onScroll, { passive: true });

  (async () => {
    const base = await fetchMeta(type, id);
    if (!alive) return;
    if (!base) {
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
    const meta = await withTimeout(enrichMeta(base), TMDB_WAIT_MS, base);
    if (!alive) return;
    render(meta);
  })();

  function render(meta) {
    if (meta.background) {
      const bg = img(meta.background, "detail-backdrop-img", "");
      bg.loading = "eager";
      bg.addEventListener(
        "load",
        () => {
          bg.classList.add("is-loaded");
          backdrop.querySelector(".is-poster-ghost")?.classList.add("is-gone");
        },
        { once: true }
      );
      backdrop.append(bg);
      if (background === "dominant") applyDominantColor(meta.background, root);
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
    // Scrolled top bar shows the title's logo, like the native app.
    const barTitle = topbar.querySelector(".detail-topbar-title");
    barTitle.textContent = meta.name;
    if (meta.logo) {
      const barLogo = img(meta.logo, "detail-topbar-logo", meta.name);
      barLogo.addEventListener("load", () => fill(barTitle, barLogo), { once: true });
    }

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
      store.setWatched(meta.id, !store.isWatched(meta.id), {
        contentId: meta.id,
        type: meta.type,
        season: null,
        episode: null,
        title: meta.name || ""
      });
      syncWatched();
    });
    syncWatched();

    const addonTrailer = (meta.trailerStreams || meta.trailers || []).find(
      (t) => t && (t.ytId || t.source)
    );
    const ytId = meta.trailers?.[0]?.ytId || addonTrailer?.ytId || addonTrailer?.source || "";
    const trailerButton = /^[\w-]{6,20}$/.test(ytId)
      ? h(
          "button.round-button",
          {
            type: "button",
            "aria-label": "Watch trailer",
            onclick: () =>
              window.open(
                `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`,
                "_blank",
                "noopener"
              )
          },
          icon("movie", 22)
        )
      : null;
    if (trailerButton && pref("meta.heroTrailer", false))
      stopTrailer = trailerPreview(backdrop, ytId);

    const shuffleButton =
      meta.type === "series" &&
      pref("meta.shuffle", true) &&
      episodes.some((v) => v.season > 0 && isReleased(v))
        ? h(
            "button.round-button",
            {
              type: "button",
              "aria-label": "Play a random episode",
              onclick: () => {
                const pool = episodes.filter((v) => v.season > 0 && isReleased(v));
                const pick = pool[Math.floor(Math.random() * pool.length)];
                toast(`Shuffle: S${pick.season} E${pick.episode}`);
                openStreams(episodeContext(meta, pick));
              }
            },
            icon("shuffle", 22)
          )
        : null;

    const ratingsSlot = h("span.detail-ratings", {}, ratingChips(meta, []));
    fetchRatings(meta.type, meta.id).then((external) => {
      if (external.length) fill(ratingsSlot, ratingChips(meta, external));
    });

    const genres = list(meta.genres || meta.genre);
    const directors = list(meta.director);
    const intro = h(
      "div.detail-intro",
      {},
      h("div.detail-logo-slot", {}, logoEl),
      metaLine(meta, episodes, ratingsSlot),
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
        shuffleButton,
        watchedButton,
        savedButton
      )
    );
    fill(
      body,
      // Same order as the native app.
      intro,
      meta.type === "series" && meta.networks?.length
        ? logosBlock("Networks", meta.networks)
        : logosBlock("Production", meta.companies),
      castBlock(meta),
      trailersBlock(meta),
      ...(meta.type === "series" ? seasonsBlock(meta, episodes, next?.season) : []),
      meta.collection ? tmdbRow(meta.collection.name, meta.collection.parts) : null,
      detailsBlock(meta),
      tmdbRow("More Like This", meta.recommendations),
      ratingMapBlock(meta, episodes)
    );
  }

  return {
    el: root,
    destroy() {
      alive = false;
      stopTrailer?.();
      window.removeEventListener("scroll", onScroll);
    }
  };
}
