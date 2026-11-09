// Settings screen: five categories, each with sub-pages. The pages come from
// schema.js (generated from the official app's strings).
import { h, icon, fill } from "../dom.js";
import { store } from "../store.js";
import { navigate, back } from "../router.js";
import { avatarEl } from "../tabbar.js";
import { openSheet, optionList, toast } from "../sheet.js";
import { listCatalogs } from "../addons.js";
import { sectionAddons } from "../screens/profile.js";
import { pref, setPref, clearPrefs, allPrefs, importPrefs } from "../prefs.js";
import { CATEGORIES, PAGES, THEMES } from "./schema.js";

const VERSION = "1.0 touch";

function pageCategory(pageId) {
  let id = pageId;
  for (let i = 0; i < 6 && PAGES[id]; i += 1) id = PAGES[id].parent;
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
}

function switchEl(on, onChange, label) {
  const el = h("button.switch", { type: "button", role: "switch", "aria-checked": String(on), "aria-label": label });
  el.classList.toggle("is-on", on);
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = !el.classList.contains("is-on");
    el.classList.toggle("is-on", next);
    el.setAttribute("aria-checked", String(next));
    onChange(next);
  });
  return el;
}

function rowShell({ title, sub, trailing, onClick, danger, live = true }) {
  const copy = h(
    "span.settings-copy",
    {},
    h("span.settings-title", {}, title),
    sub ? h("span.settings-sub.is-wrap", {}, sub) : null,
    live === false ? h("span.settings-soon", {}, "Saved. Not active in this version yet.") : null
  );
  return h(
    onClick ? "button.settings-row" : "div.settings-row.is-static",
    { type: onClick ? "button" : null, onclick: onClick, class: danger ? "is-danger" : "" },
    copy,
    trailing === undefined ? (onClick ? icon("chevronRight", 22) : null) : trailing
  );
}

function groupCard(rows) {
  return h("div.settings-card", {}, rows);
}

function labelOf(row, value) {
  const found = row.opts.find((o) => String(o.v) === String(value));
  return found ? found.l : String(value);
}

function openTextSheet(row, refresh) {
  const input = h("input.text-field", {
    type: row.secret ? "password" : "text",
    placeholder: row.ph || "",
    value: pref(row.pref, ""),
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false"
  });
  input.value = pref(row.pref, "");
  const sheet = openSheet({
    title: row.title,
    content: h(
      "div.form",
      {},
      row.sub ? h("p.form-hint", {}, row.sub) : null,
      input,
      h(
        "div.form-actions",
        {},
        h("button.pill-button", { type: "button", onclick: () => sheet.close() }, "Cancel"),
        h(
          "button.play-button",
          {
            type: "button",
            onclick: () => {
              setPref(row.pref, input.value.trim());
              sheet.close();
              refresh();
            }
          },
          "Save"
        )
      )
    )
  });
}

function renderRow(row, ctx) {
  switch (row.t) {
    case "section":
      return h("div.set-section-label", {}, row.title);
    case "note":
      return h("p.settings-note", {}, row.text);
    case "nav":
      return rowShell({
        title: row.title,
        sub: row.sub,
        onClick: () => (row.page === "profiles" ? navigate("profiles") : ctx.go(row.page))
      });
    case "toggle": {
      const on = !!pref(row.pref, row.def);
      return rowShell({
        title: row.title,
        sub: row.sub,
        live: row.live,
        trailing: switchEl(on, (v) => setPref(row.pref, v), row.title)
      });
    }
    case "select": {
      const value = pref(row.pref, row.def);
      return rowShell({
        title: row.title,
        sub: row.sub,
        live: row.live,
        trailing: h("span.settings-value", {}, labelOf(row, value)),
        onClick: () => {
          const sheet = openSheet({
            title: row.title,
            content: optionList(row.opts.map((o) => ({ value: o.v, label: o.l })), {
              selected: value,
              onSelect: (v) => {
                const original = row.opts.find((o) => String(o.v) === String(v));
                setPref(row.pref, original ? original.v : v);
                sheet.close();
                ctx.refresh();
              }
            })
          });
        }
      });
    }
    case "slider": {
      const value = Number(pref(row.pref, row.def));
      const out = h("span.settings-value", {}, `${value}${row.unit}`);
      const input = h("input.set-slider", {
        type: "range",
        min: row.min,
        max: row.max,
        step: row.step,
        value,
        "aria-label": row.title
      });
      input.addEventListener("input", () => {
        out.textContent = `${input.value}${row.unit}`;
        setPref(row.pref, Number(input.value));
      });
      return h(
        "div.settings-row.is-static.is-slider",
        {},
        h("span.settings-copy", {}, h("span.settings-title", {}, row.title), row.live === false ? h("span.settings-soon", {}, "Saved. Not active in this version yet.") : null, input),
        out
      );
    }
    case "text": {
      const value = pref(row.pref, "");
      return rowShell({
        title: row.title,
        sub: row.sub,
        live: row.live,
        trailing: h("span.settings-value", {}, value ? (row.secret ? "Set" : value) : "Not set"),
        onClick: () => openTextSheet(row, ctx.refresh)
      });
    }
    case "tiles": {
      const current = pref(row.pref, row.def);
      return h(
        "div.set-tiles",
        {},
        row.opts.map((o) =>
          h(
            "button.set-tile",
            {
              type: "button",
              class: o.v === current ? "is-selected" : "",
              onclick: () => {
                setPref(row.pref, o.v);
                ctx.refresh();
              }
            },
            h("span.set-tile-title", {}, o.l),
            h("span.set-tile-sub", {}, o.d)
          )
        )
      );
    }
    case "action":
      return rowShell({ title: row.title, sub: row.sub, danger: row.danger, onClick: () => runAction(row.id, ctx), trailing: null });
    case "link":
      return h(
        "a.settings-row",
        { href: row.href, target: "_blank", rel: "noopener noreferrer" },
        h("span.settings-copy", {}, h("span.settings-title", {}, row.title), row.sub ? h("span.settings-sub.is-wrap", {}, row.sub) : null),
        icon("chevronRight", 22)
      );
    case "themes":
      return h(
        "div.set-themes",
        {},
        THEMES.map((t) =>
          h(
            "button.set-theme",
            {
              type: "button",
              class: t.id === pref("theme", "White") ? "is-selected" : "",
              onclick: () => {
                setPref("theme", t.id);
                ctx.refresh();
              }
            },
            h("span.set-theme-dot", { style: { background: t.accent } }),
            h("span", {}, t.label)
          )
        )
      );
    case "posterPreview": {
      const w = Number(pref("poster.width", 126));
      const r = Number(pref("poster.radius", 12));
      return h(
        "div.set-poster-preview",
        {},
        h("div.set-poster-card", { style: { width: `${w}px`, height: `${Math.round((w * 3) / 2)}px`, borderRadius: `${r}px` } }),
        h(
          "div.set-poster-meta",
          {},
          h("div", {}, "Live Preview"),
          h("div.muted", {}, `Width: ${w}dp`),
          h("div.muted", {}, `Corner radius: ${r}dp`),
          h("div.muted", {}, `Height: ${Math.round((w * 3) / 2)}dp`)
        )
      );
    }
    case "subPreview":
      return h(
        "div.set-sub-preview",
        {},
        h("span", {
          style: {
            fontSize: `${Math.round(18 * (Number(pref("subs.size", 100)) / 100))}px`,
            fontWeight: pref("subs.bold", false) ? "700" : "500",
            color: pref("subs.color", "#ffffff"),
            textShadow: pref("subs.shadow", false) ? "0 2px 4px rgba(0,0,0,.8)" : pref("subs.outline", true) ? "0 0 2px #000, 0 0 3px #000" : "none",
            background: `rgba(0,0,0,${Number(pref("subs.bgOpacity", 0)) / 100})`
          }
        }, "Every story begins with a little curiosity.")
      );
    default:
      return null;
  }
}

function runAction(id, ctx) {
  switch (id) {
    case "resetHome":
      clearPrefs(["home."]);
      toast("Reset to default");
      ctx.refresh();
      break;
    case "resetPoster":
      clearPrefs(["poster."]);
      ctx.refresh();
      break;
    case "resetSubs":
      clearPrefs(["subs."]);
      ctx.refresh();
      break;
    case "clearCw":
      store.clearContinueWatching?.();
      toast("Cache cleared");
      break;
    case "signout":
      navigate("profiles");
      break;
    case "delete":
    case "reset":
      confirmReset();
      break;
    case "testNotif":
      if ("Notification" in window) {
        Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification("Nuvio", { body: "This is a test notification." });
          else toast("System notifications are disabled for Nuvio.");
        });
      } else toast("Notifications are not supported here.");
      break;
    case "exportSettings": {
      const blob = new Blob([JSON.stringify(allPrefs(), null, 2)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: "nuvio-settings.json" });
      document.body.append(a);
      a.click();
      a.remove();
      break;
    }
    case "importSettings": {
      const input = h("input", { type: "file", accept: "application/json,.json" });
      input.addEventListener("change", async () => {
        try {
          const data = JSON.parse(await input.files[0].text());
          toast(`Imported ${importPrefs(data)} settings`);
          ctx.refresh();
        } catch (_) {
          toast("That file could not be read");
        }
      });
      input.click();
      break;
    }
    default:
      break;
  }
}

function confirmReset() {
  const sheet = openSheet({
    title: "Delete all data on this device?",
    content: h(
      "div.form",
      {},
      h("p.form-hint", {}, "This removes every profile, add-on, library entry and saved progress stored here. It cannot be undone."),
      h(
        "div.form-actions",
        {},
        h("button.pill-button", { type: "button", onclick: () => sheet.close() }, "Cancel"),
        h(
          "button.play-button.is-danger",
          {
            type: "button",
            onclick: () => {
              try {
                Object.keys(localStorage).filter((k) => k.startsWith("nuvioTouch.")).forEach((k) => localStorage.removeItem(k));
                sessionStorage.clear();
              } catch (_) {
                /* ignore */
              }
              location.hash = "#/profiles";
              location.reload();
            }
          },
          "Delete"
        )
      )
    )
  });
}

// ---- Custom pages -----------------------------------------------------------
function customAccount() {
  const profile = store.activeProfile();
  return [
    h("div.profile-hero-card", {}, avatarEl(profile, 64), h("div.settings-copy", {}, h("div.profile-hero-name", {}, profile?.name || ""), h("div.settings-sub", {}, `${store.library().length} saved • ${store.continueWatching().length} in progress`))),
    groupCard([
      rowShell({ title: "Status", trailing: h("span.settings-value", {}, "Local profile") }),
      rowShell({ title: "Email", trailing: h("span.settings-value", {}, "Not signed in") })
    ])
  ];
}

function customTracking() {
  const providers = [
    { id: "trakt", name: "trakt", cls: "is-trakt" },
    { id: "simkl", name: "SIMKL", cls: "is-simkl" },
    { id: "mdblist", name: "MDBList", cls: "is-mdblist" },
    { id: "anilist", name: "AniList", cls: "is-anilist" }
  ];
  return [
    h("div.set-section-label", {}, "ACCOUNTS"),
    ...providers.map((p) =>
      h(
        "button.set-provider",
        { type: "button", class: p.cls, onclick: () => toast("Sign-in for tracking services is not available in the touch app yet.") },
        h("span.set-provider-name", {}, p.name),
        h("span.set-provider-sub", {}, "Not connected"),
        icon("chevronRight", 22)
      )
    )
  ];
}

function customDebrid() {
  const services = ["Real-Debrid", "TorBox", "Premiumize"];
  return [
    groupCard(
      services.map((name) => {
        const key = `debrid.${name.toLowerCase()}`;
        return rowShell({
          title: name,
          sub: "API key",
          trailing: h("span.settings-value", {}, pref(key, "") ? "Set" : "Not set"),
          onClick: () => openTextSheet({ pref: key, title: name, sub: "Saved on this device only.", ph: "API key", secret: true }, () => navigate(location.hash.replace(/^#\//, ""), { replace: true }))
        });
      })
    ),
    h("p.settings-note", {}, "Most add-ons take the debrid key in their own setup page. Keys saved here are stored on this device only.")
  ];
}

function customAbout() {
  return [
    h("div.set-about", {}, h("img.set-about-logo", { src: "../assets/brand/app_logo_wordmark.png", alt: "Nuvio" }), h("div.muted", {}, `Version ${VERSION}`), h("div.muted", {}, "Made with ❤️ by Tapframe and friends"))
  ];
}

function customHeroSources(pageHost) {
  const wrap = h("div.settings-card", {}, h("div.settings-loading", {}, "Loading catalogs…"));
  listCatalogs()
    .then((list) => {
      const hidden = new Set(pref("home.hiddenCatalogs", []));
      const hero = pref("home.heroCatalogs", null); // null = all
      if (!list.length) return fill(wrap, rowShell({ title: "No home catalogs", sub: "Enable or add an addon with catalogs to configure Home." }));
      const selected = new Set(hero || list.map((c) => c.key));
      fill(
        wrap,
        ...list.map((c) =>
          rowShell({
            title: `${c.catalog.name || c.catalog.id}`,
            sub: `${c.addon.manifest.name} • ${c.catalog.type}`,
            trailing: switchEl(selected.has(c.key), (on) => {
              if (on) selected.add(c.key);
              else selected.delete(c.key);
              setPref("home.heroCatalogs", [...selected]);
            }, c.catalog.name)
          })
        )
      );
      void hidden;
    })
    .catch(() => fill(wrap, rowShell({ title: "Couldn’t load Home catalogs", sub: "Check your connection and try again." })));
  void pageHost;
  return wrap;
}

function customCatalogVisibility() {
  const wrap = h("div.settings-card", {}, h("div.settings-loading", {}, "Loading catalogs…"));
  listCatalogs()
    .then((list) => {
      const hidden = new Set(pref("home.hiddenCatalogs", []));
      if (!list.length) return fill(wrap, rowShell({ title: "No home catalogs" }));
      fill(
        wrap,
        ...list.map((c) =>
          rowShell({
            title: `${c.catalog.name || c.catalog.id}`,
            sub: `${c.addon.manifest.name} • ${c.catalog.type}`,
            trailing: switchEl(!hidden.has(c.key), (on) => {
              if (on) hidden.delete(c.key);
              else hidden.add(c.key);
              setPref("home.hiddenCatalogs", [...hidden]);
            }, c.catalog.name)
          })
        )
      );
    })
    .catch(() => fill(wrap, rowShell({ title: "Couldn’t load Home catalogs" })));
  return wrap;
}

function renderCustom(row) {
  if (row.t === "heroSources") return customHeroSources();
  if (row.t === "catalogVisibility") return customCatalogVisibility();
  return null;
}

// ---- Screen -----------------------------------------------------------------
function pageBody(page, ctx) {
  const out = [];
  if (page.custom === "addons") return [sectionAddons(ctx.refresh)].flat();
  if (page.custom === "account") out.push(...customAccount());
  if (page.custom === "tracking") out.push(...customTracking());
  // group rows between section labels into cards
  let group = [];
  const flush = () => {
    if (group.length) out.push(groupCard(group));
    group = [];
  };
  for (const row of page.rows) {
    if (row.t === "section" || row.t === "note" || row.t === "heroSources" || row.t === "catalogVisibility" || row.t === "tiles" || row.t === "themes" || row.t === "posterPreview" || row.t === "subPreview") {
      flush();
      out.push(renderCustom(row) || renderRow(row, ctx));
    } else group.push(renderRow(row, ctx));
  }
  flush();
  if (page.custom === "debrid") out.push(...customDebrid());
  if (page.custom === "about") out.push(...customAbout());
  return out;
}

function categoryBody(cat, ctx) {
  return [
    groupCard(cat.rows.map((row) => renderRow(row, ctx))),
    h("div.set-footer", {}, h("img.set-about-logo", { src: "../assets/brand/app_logo_wordmark.png", alt: "Nuvio" }), h("div.muted", {}, "Made with ❤️ by Tapframe and friends"))
  ];
}

export function renderSettings([initial] = []) {
  const nav = h("nav.settings-nav");
  const content = h("div.settings-content");
  const root = h("div.screen.screen-settings", {}, h("div.settings-sidebar", {}, h("h1.settings-big-title", {}, "Settings"), nav), content);
  const known = (id) => CATEGORIES.some((c) => c.id === id) || !!PAGES[id];
  const target = known(initial) ? initial : "look";
  const ctx = {
    go: (pageId) => navigate(`profile/${pageId}`),
    refresh: () => draw()
  };

  function draw() {
    const category = CATEGORIES.find((c) => c.id === target) || pageCategory(target);
    fill(
      nav,
      ...CATEGORIES.map((c) =>
        h(
          "button.settings-nav-item",
          { type: "button", class: c.id === category.id ? "is-selected" : "", onclick: () => navigate(`profile/${c.id}`, { replace: true }) },
          h("span.settings-nav-icon", {}, icon(c.icon, 20)),
          h("span", {}, c.label)
        )
      )
    );
    const page = PAGES[target];
    if (page) {
      fill(content, h("div.settings-heading-row", {}, h("button.set-back", { type: "button", "aria-label": "Back", onclick: () => back(`profile/${page.parent}`) }, icon("back", 24)), h("h2.settings-heading", {}, page.title)), ...pageBody(page, ctx));
    } else {
      fill(content, h("h2.settings-heading", {}, category.label), ...categoryBody(category, ctx));
    }
  }
  return { el: root, onShow: draw, destroy() {} };
}
