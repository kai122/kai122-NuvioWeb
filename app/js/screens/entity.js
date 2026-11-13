// Person pages (tap a cast member) and studio / network pages (tap a
// production or network logo), laid out like the native iPad app: details
// on the left, rows of titles on the right. Data from TMDB.
import { h, icon, img, fill } from "../dom.js";
import { back } from "../router.js";
import { tmdbAvailable, personDetails, companyDetails } from "../services/tmdb.js";
import { openTmdbTitle } from "./detail.js";

function poster(item) {
  return h(
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
  );
}

function row(title, items) {
  if (!items?.length) return null;
  return h(
    "section.row.entity-row",
    {},
    h("div.row-head", {}, h("h2.row-title", {}, title)),
    h("div.row-track", {}, items.map(poster))
  );
}

function fact(label, value) {
  return value
    ? h("div.entity-fact", {}, h("div.entity-label", {}, label), h("div.entity-value", {}, value))
    : null;
}

function shell(title) {
  const side = h("aside.entity-side", {}, h("div.detail-loading", {}, h("span.spinner")));
  const main = h("div.entity-main");
  const root = h(
    "div.screen.screen-entity",
    {},
    h(
      "button.round-button.glass.page-back",
      { type: "button", "aria-label": "Back", onclick: () => back() },
      icon("back", 26)
    ),
    h("div.entity-topbar", {}, h("span.entity-topbar-title", {}, title || "")),
    h("div.entity-layout", {}, side, main)
  );
  return {
    root,
    side,
    main,
    setTitle: (t) => (root.querySelector(".entity-topbar-title").textContent = t)
  };
}

function unavailable(side, text) {
  fill(
    side,
    h(
      "div.empty-card",
      {},
      icon("info", 28),
      h("div.empty-title", {}, "Not available"),
      h("div.empty-text", {}, text)
    )
  );
}

const formatDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export function renderPerson([id]) {
  const { root, side, main, setTitle } = shell("");
  let alive = true;
  if (!tmdbAvailable()) {
    unavailable(side, "Person pages need a TMDB key.");
    return { el: root };
  }
  if (!/^\d{1,10}$/.test(String(id || ""))) {
    unavailable(side, "This person couldn't be found.");
    return { el: root };
  }
  personDetails(id)
    .then((p) => {
      if (!alive) return;
      setTitle(p.name);
      const bio = h("p.entity-bio", {}, p.biography);
      const more =
        p.biography.length > 420
          ? h(
              "button.link-button.entity-more",
              {
                type: "button",
                onclick: (e) => {
                  const open = bio.classList.toggle("is-open");
                  e.currentTarget.textContent = open ? "Show Less ▴" : "Show More ▾";
                }
              },
              "Show More ▾"
            )
          : null;
      const born = p.birthday
        ? `${formatDate(p.birthday)}${p.deathday ? "" : p.age != null ? ` · ${p.age} years` : ""}`
        : "";
      fill(
        side,
        h(
          "div.entity-photo",
          {},
          p.photo
            ? img(p.photo, "entity-photo-img", p.name)
            : h("span.cast-initials", {}, p.name.slice(0, 1))
        ),
        h("h1.entity-name", {}, p.name),
        fact("Born", born),
        p.deathday
          ? fact("Died", `${formatDate(p.deathday)}${p.age != null ? ` · aged ${p.age}` : ""}`)
          : null,
        fact("Place of birth", p.place),
        fact("Known for", p.department),
        fact("Credits", p.count ? `${p.count} titles${p.since ? ` · since ${p.since}` : ""}` : ""),
        p.biography
          ? h("div.entity-bio-block", {}, h("div.entity-label", {}, "Biography"), bio, more)
          : null
      );
      fill(main, row("Popular", p.popular), row("Latest", p.latest));
    })
    .catch(() => alive && unavailable(side, "TMDB couldn't find this person."));
  return {
    el: root,
    destroy() {
      alive = false;
    }
  };
}

export function renderCompany([kind, id]) {
  const safeKind = kind === "network" ? "network" : "company";
  const { root, side, main, setTitle } = shell("");
  let alive = true;
  if (!tmdbAvailable()) {
    unavailable(side, "Studio pages need a TMDB key.");
    return { el: root };
  }
  if (!/^\d{1,10}$/.test(String(id || ""))) {
    unavailable(side, "This studio couldn't be found.");
    return { el: root };
  }
  companyDetails(safeKind, id)
    .then((c) => {
      if (!alive) return;
      setTitle(c.name);
      fill(
        side,
        h("div.entity-kicker", {}, safeKind === "network" ? "Network" : "Production company"),
        h(
          "div.entity-logo-card",
          {},
          c.logo ? img(c.logo, "entity-logo", c.name) : h("span.company-name", {}, c.name)
        ),
        h("h1.entity-name", {}, c.name),
        c.headquarters || c.country
          ? h("div.entity-sub", {}, [c.headquarters, c.country].filter(Boolean).join(" · "))
          : null,
        fact("Country", c.country),
        fact("Headquarters", c.headquarters),
        fact("Catalogue", c.total ? `${c.total} titles` : ""),
        c.description
          ? h(
              "div.entity-bio-block",
              {},
              h("div.entity-label", {}, "About"),
              h("p.entity-bio.is-open", {}, c.description)
            )
          : null
      );
      fill(main, ...c.rows.map((r) => row(r.title, r.items)));
      if (!c.rows.length)
        fill(main, h("div.empty-card", {}, h("div.empty-title", {}, "No titles found")));
    })
    .catch(() => alive && unavailable(side, "TMDB couldn't find this studio."));
  return {
    el: root,
    destroy() {
      alive = false;
    }
  };
}
