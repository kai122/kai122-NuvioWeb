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
import { account, pushCollections, CLOUD_PREFIX, syncStatus } from "../services/nuvioAccount.js";
import { parseCollectionsFile } from "../screens/collections.js";
import { openSignIn, runDownload, summaryText, confirmSignOut } from "../signin.js";
import { isStandalone, openInstallGuide } from "../install.js";
import {
  pushSupport,
  currentSubscription,
  enablePush,
  disablePush,
  testPush,
  relayUrl,
  watchedShows
} from "../services/push.js";

const VERSION = "1.0 touch";

function pageCategory(pageId) {
  let id = pageId;
  for (let i = 0; i < 6 && PAGES[id]; i += 1) id = PAGES[id].parent;
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
}

function switchEl(on, onChange, label) {
  const el = h("button.switch", {
    type: "button",
    role: "switch",
    "aria-checked": String(on),
    "aria-label": label
  });
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

// Icons for the category rows, like the native Settings.
const NAV_ICONS = {
  account: "person",
  profiles: "person",
  appearance: "palette",
  layout: "grid",
  content: "search",
  playback: "play",
  integrations: "link",
  tracking: "sort",
  notifications: "bell",
  advanced: "gear",
  about: "info"
};

function rowShell({ title, sub, trailing, onClick, danger, lead = null }) {
  const copy = h(
    "span.settings-copy",
    {},
    h("span.settings-title", {}, title),
    sub ? h("span.settings-sub.is-wrap", {}, sub) : null
  );
  return h(
    onClick ? "button.settings-row" : "div.settings-row.is-static",
    { type: onClick ? "button" : null, onclick: onClick, class: danger ? "is-danger" : "" },
    lead ? h("span.settings-row-icon", {}, icon(lead, 22)) : null,
    copy,
    trailing === undefined ? (onClick ? icon("chevronRight", 22) : null) : trailing
  );
}

export const isPhoneWidth = () =>
  window.matchMedia("(max-width: 700px), (max-height: 500px) and (max-width: 1000px)").matches;

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
        lead: ctx.categoryPage ? NAV_ICONS[row.page] || null : null,
        onClick: () => (row.page === "profiles" ? navigate("profiles") : ctx.go(row.page))
      });
    case "toggle": {
      const on = !!pref(row.pref, row.def);
      return rowShell({
        title: row.title,
        sub: row.sub,
        trailing: switchEl(
          on,
          (v) => {
            setPref(row.pref, v);
            if (
              row.pref === "notif.episodes" &&
              v &&
              "Notification" in window &&
              Notification.permission === "default"
            ) {
              Notification.requestPermission().catch(() => {});
            }
          },
          row.title
        )
      });
    }
    case "select": {
      const value = pref(row.pref, row.def);
      return rowShell({
        title: row.title,
        sub: row.sub,
        trailing: h("span.settings-value", {}, labelOf(row, value)),
        onClick: () => {
          const sheet = openSheet({
            title: row.title,
            content: optionList(
              row.opts.map((o) => ({ value: o.v, label: o.l })),
              {
                selected: value,
                onSelect: (v) => {
                  const original = row.opts.find((o) => String(o.v) === String(v));
                  setPref(row.pref, original ? original.v : v);
                  sheet.close();
                  ctx.refresh();
                }
              }
            )
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
        h("span.settings-copy", {}, h("span.settings-title", {}, row.title), input),
        out
      );
    }
    case "text": {
      const value = pref(row.pref, "");
      return rowShell({
        title: row.title,
        sub: row.sub,
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
      return rowShell({
        title: row.title,
        sub: row.sub,
        danger: row.danger,
        onClick: () => runAction(row.id, ctx),
        trailing: null
      });
    case "link":
      return h(
        "a.settings-row",
        { href: row.href, target: "_blank", rel: "noopener noreferrer" },
        h(
          "span.settings-copy",
          {},
          h("span.settings-title", {}, row.title),
          row.sub ? h("span.settings-sub.is-wrap", {}, row.sub) : null
        ),
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
        h("div.set-poster-card", {
          style: { width: `${w}px`, height: `${Math.round((w * 3) / 2)}px`, borderRadius: `${r}px` }
        }),
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
        h(
          "span",
          {
            style: {
              fontSize: `${Math.round(18 * (Number(pref("subs.size", 100)) / 100))}px`,
              fontWeight: pref("subs.bold", false) ? "700" : "500",
              color: pref("subs.color", "#ffffff"),
              textShadow: pref("subs.shadow", false)
                ? "0 2px 4px rgba(0,0,0,.8)"
                : pref("subs.outline", true)
                  ? "0 0 2px #000, 0 0 3px #000"
                  : "none",
              background: `rgba(0,0,0,${Number(pref("subs.bgOpacity", 0)) / 100})`
            }
          },
          "Every story begins with a little curiosity."
        )
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
    case "deleteProfile":
      confirmDeleteProfile();
      break;
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
      // API keys stay on this device: they're left out of the exported file.
      const prefs = Object.fromEntries(
        Object.entries(allPrefs()).filter(([key]) => !/(^|\.)key$/i.test(key))
      );
      const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
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

function confirmDeleteProfile() {
  const profile = store.activeProfile();
  if (!profile) return;
  const sheet = openSheet({
    title: `Delete ${profile.name}?`,
    content: h(
      "div.form",
      {},
      h(
        "p.form-hint",
        {},
        "This removes the profile and its library, progress and watched history from this device. It cannot be undone."
      ),
      h(
        "div.form-actions",
        {},
        h("button.pill-button", { type: "button", onclick: () => sheet.close() }, "Cancel"),
        h(
          "button.play-button.is-danger",
          {
            type: "button",
            onclick: () => {
              sheet.close();
              store.removeProfile(profile.id);
              store.forgetActiveProfile();
              navigate("profiles", { replace: true });
            }
          },
          "Delete"
        )
      )
    )
  });
}

function confirmReset() {
  const sheet = openSheet({
    title: "Delete all data on this device?",
    content: h(
      "div.form",
      {},
      h(
        "p.form-hint",
        {},
        "This removes every profile, add-on, library entry and saved progress stored here. It cannot be undone."
      ),
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
                Object.keys(localStorage)
                  .filter((k) => k.startsWith("nuvioTouch."))
                  .forEach((k) => localStorage.removeItem(k));
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
function customNotifications(ctx) {
  const card = h("div.settings-card", {}, h("div.settings-loading", {}, h("span.spinner")));
  const support = pushSupport();
  const shows = watchedShows().length;
  const busy = (fn) => async () => {
    try {
      await fn();
    } catch (error) {
      toast(error.message || "Something went wrong");
    }
    ctx.refresh();
  };
  (async () => {
    const sub = await currentSubscription();
    const rows = [];
    if (support === "homescreen") {
      rows.push(
        rowShell({
          title: "Notifications while Nuvio is closed",
          sub: "Apple only allows these for the Home Screen app. Add Nuvio to your Home Screen, open it from there, then turn this on.",
          onClick: () => openInstallGuide()
        })
      );
    } else if (support !== "ok") {
      rows.push(
        rowShell({
          title: "Notifications while Nuvio is closed",
          sub: "This browser can't receive notifications.",
          trailing: null
        })
      );
    } else {
      rows.push(
        rowShell({
          title: "Notifications while Nuvio is closed",
          sub: sub
            ? `On. Watching ${shows} show${shows === 1 ? "" : "s"} from your library and Continue Watching.`
            : relayUrl()
              ? "Get a notification when a new episode of your shows comes out."
              : "Set the alerts service address below first.",
          trailing: switchEl(
            !!sub,
            (on) =>
              busy(async () => {
                if (on) {
                  const n = await enablePush();
                  toast(`Notifications on for ${n} show${n === 1 ? "" : "s"}`);
                } else {
                  await disablePush();
                  toast("Notifications off");
                }
              })(),
            "Notifications while Nuvio is closed"
          )
        })
      );
      if (sub)
        rows.push(
          rowShell({
            title: "Send Test Notification",
            sub: "Arrives in a few seconds, even if you close the app.",
            onClick: busy(async () => {
              await testPush();
              toast("Test sent");
            })
          })
        );
    }
    fill(card, ...rows);
  })();
  return [h("div.set-section-label", {}, "WHILE THE APP IS CLOSED"), card];
}

function customAccount(ctx) {
  const profile = store.activeProfile();
  const acct = account();
  const cards = [
    h(
      "div.profile-hero-card",
      {},
      avatarEl(profile, 64),
      h(
        "div.settings-copy",
        {},
        h("div.profile-hero-name", {}, profile?.name || ""),
        h(
          "div.settings-sub",
          {},
          `${store.library().length} saved • ${store.continueWatching().length} in progress`
        )
      )
    ),
    h("div.set-section-label", {}, "NUVIO ACCOUNT")
  ];
  if (!acct) {
    cards.push(
      groupCard([
        rowShell({
          title: "Sign in with Nuvio",
          sub: "Bring your profiles, add-ons, Continue Watching and library from the Nuvio app.",
          onClick: () =>
            openSignIn({ onDone: () => navigate("profiles"), onFail: () => ctx.refresh() })
        })
      ])
    );
  } else {
    cards.push(
      groupCard([
        rowShell({
          title: "Signed in",
          trailing: h("span.settings-value", {}, acct.email || "Nuvio account")
        }),
        rowShell({
          title: "Sync now",
          sub: acct.lastSync
            ? `Last synced ${new Date(acct.lastSync).toLocaleString()} • ${summaryText(acct.lastSummary)}`
            : "Download your account again",
          onClick: () => runDownload().then(() => ctx.refresh())
        }),
        rowShell({
          title: "Upload changes to Nuvio",
          sub: syncStatus.lastError
            ? `Last upload failed (${syncStatus.lastError}). It retries on the next change.`
            : syncStatus.lastPush
              ? `Last upload ${new Date(syncStatus.lastPush).toLocaleTimeString()}`
              : "What you watch, mark and save here is sent to your account.",
          trailing: switchEl(
            !!pref("nuvio.upload", true),
            (v) => setPref("nuvio.upload", v),
            "Upload changes to Nuvio"
          )
        }),
        rowShell({
          title: "Sign Out",
          sub: "Removes your Nuvio profiles from this device. They stay safe in your account.",
          danger: true,
          trailing: null,
          onClick: () => confirmSignOut({ onDone: () => navigate("profiles") })
        })
      ]),
      h(
        "p.settings-note",
        {},
        "Your Nuvio profiles sync both ways: changes here are uploaded a few seconds later, and the latest from your account is downloaded each time the app opens."
      )
    );
  }
  return cards;
}

function customCollections(ctx) {
  const list = store.collections();
  const hidden = new Set(pref("collections.hidden", []));
  const profile = store.activeProfile();
  const cloud = !!account() && String(profile?.id || "").startsWith(CLOUD_PREFIX);
  const importFile = () => {
    const input = h("input", { type: "file", accept: "application/json,.json" });
    input.addEventListener("change", async () => {
      try {
        const imported = parseCollectionsFile(await input.files[0].text());
        store.saveCollections(imported);
        window.dispatchEvent(new Event("nuvio:collections-changed"));
        toast(`Imported ${imported.length} collection${imported.length === 1 ? "" : "s"}`);
        if (cloud) {
          pushCollections(profile.id)
            .then(() => toast("Saved to your Nuvio account"))
            .catch((e) => toast(`Couldn't save to Nuvio: ${e.message}`));
        }
        ctx.refresh();
      } catch (error) {
        toast(error.message || "That file could not be read");
      }
    });
    input.click();
  };
  const out = [
    h(
      "p.settings-note",
      {},
      "Collections group catalogs into folders shown on Home, like Streaming Services → Netflix. They use TMDB, so they need a TMDB key."
    ),
    groupCard(
      [
        rowShell({
          title: "Import collections",
          sub: "Choose a Nuvio collections .json export.",
          onClick: importFile
        }),
        cloud && list.length
          ? rowShell({
              title: "Save to Nuvio account",
              sub: "Upload these collections to this profile on your account.",
              onClick: () =>
                pushCollections(profile.id)
                  .then(() => toast("Saved to your Nuvio account"))
                  .catch((e) => toast(`Couldn't save: ${e.message}`))
            })
          : null
      ].filter(Boolean)
    )
  ];
  if (list.length) {
    out.push(
      h("div.set-section-label", {}, "SHOW ON HOME"),
      groupCard(
        list.map((c) =>
          rowShell({
            title: c.title,
            sub: `${c.folders?.length || 0} folders${c.pinToTop !== false ? " • above catalogs" : ""}`,
            trailing: switchEl(
              !hidden.has(c.id),
              (on) => {
                if (on) hidden.delete(c.id);
                else hidden.add(c.id);
                setPref("collections.hidden", [...hidden]);
              },
              c.title
            )
          })
        )
      ),
      groupCard([
        rowShell({
          title: "Remove all collections from this device",
          danger: true,
          trailing: null,
          onClick: () => {
            store.saveCollections([]);
            window.dispatchEvent(new Event("nuvio:collections-changed"));
            ctx.refresh();
          }
        })
      ])
    );
  } else
    out.push(
      h(
        "p.settings-note",
        {},
        "No collections yet. Signing in with Nuvio downloads the ones on your account, or import a file."
      )
    );
  return out;
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
        {
          type: "button",
          class: p.cls,
          onclick: () =>
            toast("Sign-in for tracking services is not available in the touch app yet.")
        },
        h("span.set-provider-name", {}, p.name),
        h("span.set-provider-sub", {}, "Not connected"),
        icon("chevronRight", 22)
      )
    )
  ];
}

function customAbout() {
  return [
    h(
      "div.set-about",
      {},
      h("img.set-about-logo", { src: "../assets/brand/app_logo_wordmark.png", alt: "Nuvio" }),
      h("div.muted", {}, `Version ${VERSION}`),
      h("div.muted", {}, "Made with ❤️ by Tapframe and friends"),
      isStandalone()
        ? h("div.muted.set-about-mode", {}, "Running as a Home Screen app")
        : h(
            "button.pill-button.set-about-install",
            { type: "button", onclick: () => openInstallGuide() },
            "Add to Home Screen"
          )
    )
  ];
}

function customHeroSources(pageHost) {
  const wrap = h("div.settings-card", {}, h("div.settings-loading", {}, "Loading catalogs…"));
  listCatalogs()
    .then((list) => {
      const hidden = new Set(pref("home.hiddenCatalogs", []));
      const hero = pref("home.heroCatalogs", null); // null = all
      if (!list.length)
        return fill(
          wrap,
          rowShell({
            title: "No home catalogs",
            sub: "Enable or add an addon with catalogs to configure Home."
          })
        );
      const selected = new Set(hero || list.map((c) => c.key));
      fill(
        wrap,
        ...list.map((c) =>
          rowShell({
            title: `${c.catalog.name || c.catalog.id}`,
            sub: `${c.addon.manifest.name} • ${c.catalog.type}`,
            trailing: switchEl(
              selected.has(c.key),
              (on) => {
                if (on) selected.add(c.key);
                else selected.delete(c.key);
                setPref("home.heroCatalogs", [...selected]);
              },
              c.catalog.name
            )
          })
        )
      );
      void hidden;
    })
    .catch(() =>
      fill(
        wrap,
        rowShell({
          title: "Couldn’t load Home catalogs",
          sub: "Check your connection and try again."
        })
      )
    );
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
            trailing: switchEl(
              !hidden.has(c.key),
              (on) => {
                if (on) hidden.delete(c.key);
                else hidden.add(c.key);
                setPref("home.hiddenCatalogs", [...hidden]);
              },
              c.catalog.name
            )
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
  if (page.custom === "addons") return [sectionAddons()].flat();
  if (page.custom === "account") out.push(...customAccount(ctx));
  if (page.custom === "tracking") out.push(...customTracking());
  if (page.custom === "collections") out.push(...customCollections(ctx));
  // group rows between section labels into cards
  let group = [];
  const flush = () => {
    if (group.length) out.push(groupCard(group));
    group = [];
  };
  for (const row of page.rows) {
    if (
      row.t === "section" ||
      row.t === "note" ||
      row.t === "heroSources" ||
      row.t === "catalogVisibility" ||
      row.t === "tiles" ||
      row.t === "themes" ||
      row.t === "posterPreview" ||
      row.t === "subPreview"
    ) {
      flush();
      out.push(renderCustom(row) || renderRow(row, ctx));
    } else group.push(renderRow(row, ctx));
  }
  flush();
  if (page.custom === "about") out.push(...customAbout());
  if (page.custom === "notifications") out.push(...customNotifications(ctx));
  return out;
}

function categoryBody(cat, ctx) {
  const acct = cat.id === "you" ? account() : null;
  return [
    groupCard(cat.rows.map((row) => renderRow(row, { ...ctx, categoryPage: true }))),
    acct
      ? groupCard([
          rowShell({
            title: "Sign Out",
            sub: acct.email ? `Signed in as ${acct.email}` : "Signed in with Nuvio",
            danger: true,
            trailing: null,
            onClick: () => confirmSignOut({ onDone: () => navigate("profiles") })
          })
        ])
      : null,
    h(
      "div.set-footer",
      {},
      h("img.set-about-logo", { src: "../assets/brand/app_logo_wordmark.png", alt: "Nuvio" }),
      h("div.muted", {}, "Made with ❤️ by Tapframe and friends")
    )
  ];
}

export function renderSettings([initial] = []) {
  const nav = h("nav.settings-nav");
  const content = h("div.settings-content");
  const root = h(
    "div.screen.screen-settings",
    {},
    h("div.settings-sidebar", {}, h("h1.settings-big-title", {}, "Settings"), nav),
    content
  );
  const known = (id) => CATEGORIES.some((c) => c.id === id) || !!PAGES[id];
  // Phones show one level at a time, like the native iPhone app: the list of
  // sections first, then the chosen section full width with a back button.
  const phone = isPhoneWidth();
  const target = known(initial) ? initial : phone ? null : "look";
  root.classList.toggle("is-phone", phone);
  root.classList.toggle("is-phone-list", phone && !target);
  const ctx = {
    go: (pageId) => navigate(`profile/${pageId}`),
    refresh: () => draw()
  };

  function draw() {
    const category = target
      ? CATEGORIES.find((c) => c.id === target) || pageCategory(target)
      : null;
    const acct = account();
    fill(
      nav,
      phone && !target
        ? h(
            "button.settings-phone-hero",
            { type: "button", onclick: () => navigate("profile/account") },
            avatarEl(store.activeProfile(), 56),
            h(
              "span.settings-copy",
              {},
              h("span.profile-hero-name", {}, store.activeProfile()?.name || ""),
              h("span.settings-sub", {}, acct ? acct.email || "Nuvio account" : "Not signed in")
            ),
            icon("chevronRight", 22)
          )
        : null,
      ...CATEGORIES.map((c) =>
        h(
          "button.settings-nav-item",
          {
            type: "button",
            class: c.id === category?.id ? "is-selected" : "",
            onclick: () => navigate(`profile/${c.id}`, { replace: !phone })
          },
          h("span.settings-nav-icon", {}, icon(c.icon, 20)),
          h("span.settings-nav-label", {}, c.label),
          phone ? icon("chevronRight", 22) : null
        )
      ),
      phone && !target && acct
        ? h(
            "button.settings-nav-item.is-danger",
            {
              type: "button",
              onclick: () => confirmSignOut({ onDone: () => navigate("profiles") })
            },
            h("span.settings-nav-icon", {}, icon("person", 20)),
            h("span.settings-nav-label", {}, "Sign Out")
          )
        : null
    );
    if (!target) {
      fill(content);
      return;
    }
    const page = PAGES[target];
    if (page) {
      fill(
        content,
        h(
          "div.settings-heading-row",
          {},
          h(
            "button.set-back",
            { type: "button", "aria-label": "Back", onclick: () => back(`profile/${page.parent}`) },
            icon("back", 24)
          ),
          h("h2.settings-heading", {}, page.title)
        ),
        ...pageBody(page, ctx)
      );
    } else {
      fill(
        content,
        phone
          ? h(
              "div.settings-heading-row",
              {},
              h(
                "button.set-back",
                { type: "button", "aria-label": "Back", onclick: () => back("profile") },
                icon("back", 24)
              ),
              h("h2.settings-heading", {}, category.label)
            )
          : h("h2.settings-heading", {}, category.label),
        ...categoryBody(category, ctx)
      );
    }
  }
  return { el: root, onShow: draw, destroy() {} };
}
