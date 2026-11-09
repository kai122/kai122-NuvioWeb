import { h, icon, fill, safeImageUrl } from "../dom.js";
import { store } from "../store.js";
import { navigate } from "../router.js";
import { pageHeader } from "../components.js";
import { avatarEl } from "../tabbar.js";
import { loadAddons, fetchManifest, normalizeManifestUrl } from "../addons.js";
import { openSheet, toast } from "../sheet.js";

function settingsRow({ iconName, title, subtitle, onClick, trailing }) {
  return h(
    "button.settings-row",
    { type: "button", onclick: onClick },
    h("span.settings-icon", {}, icon(iconName, 22)),
    h(
      "span.settings-copy",
      {},
      h("span.settings-title", {}, title),
      subtitle ? h("span.settings-sub", {}, subtitle) : null
    ),
    trailing || icon("chevronRight", 22)
  );
}

export function renderProfile() {
  const root = h("div.screen.screen-profile");
  return {
    el: root,
    onShow() {
      const profile = store.activeProfile();
      fill(
        root,
        pageHeader("Profile"),
        h(
          "div.profile-hero-card",
          {},
          avatarEl(profile, 72),
          h(
            "div",
            {},
            h("div.profile-hero-name", {}, profile?.name || ""),
            h(
              "div.settings-sub",
              {},
              `${store.library().length} saved • ${store.continueWatching().length} in progress`
            )
          )
        ),
        h(
          "div.settings-card",
          {},
          settingsRow({
            iconName: "person",
            title: "Switch profile",
            subtitle: "Choose who's watching",
            onClick: () => navigate("profiles")
          }),
          settingsRow({
            iconName: "puzzle",
            title: "Add-ons",
            subtitle: `${store.addonUrls().length} installed • catalogs and streams`,
            onClick: () => navigate("addons")
          })
        ),
        h(
          "div.settings-card",
          {},
          settingsRow({
            iconName: "info",
            title: "About",
            subtitle: "Nuvio Touch • everything is stored on this device",
            onClick: () => toast("Nuvio Touch • data stays on this device")
          }),
          settingsRow({
            iconName: "external",
            title: "Open the classic web app",
            subtitle: "The TV-style version",
            onClick: () => (location.href = "../")
          })
        )
      );
    }
  };
}

export function renderAddons() {
  const listEl = h("div.settings-card");
  const root = h(
    "div.screen.screen-addons",
    {},
    h(
      "button.round-button.glass.page-back",
      { type: "button", "aria-label": "Back", onclick: () => history.back() },
      icon("back", 26)
    ),
    pageHeader(
      "Add-ons",
      h(
        "button.pill-button",
        { type: "button", onclick: () => openAddSheet() },
        icon("add", 20),
        "Add"
      )
    ),
    h(
      "p.page-note",
      {},
      "Add-ons provide catalogs, details and streams. Paste the manifest URL from the add-on's install page (the same link you use in Stremio or the Nuvio app)."
    ),
    listEl
  );

  async function refresh() {
    const addons = await loadAddons({ refresh: true });
    fill(
      listEl,
      ...addons.map((addon) => {
        const manifest = addon.manifest;
        const resources = (manifest?.resources || [])
          .map((r) => (typeof r === "string" ? r : r.name))
          .join(", ");
        return h(
          "div.settings-row.is-static",
          {},
          h(
            "span.settings-icon",
            {},
            safeImageUrl(manifest?.logo)
              ? h("img.addon-logo", { src: safeImageUrl(manifest.logo), alt: "" })
              : icon("puzzle", 22)
          ),
          h(
            "span.settings-copy",
            {},
            h(
              "span.settings-title",
              {},
              manifest
                ? `${manifest.name} ${manifest.version ? `v${manifest.version}` : ""}`
                : addon.url
            ),
            h(
              "span.settings-sub",
              {},
              manifest ? resources || manifest.description || "" : "Could not load this add-on"
            )
          ),
          h(
            "button.icon-button",
            {
              type: "button",
              "aria-label": "Remove",
              onclick: () => {
                if (!confirm(`Remove ${manifest?.name || "this add-on"}?`)) return;
                store.saveAddonUrls(store.addonUrls().filter((url) => url !== addon.url));
                refresh();
              }
            },
            icon("trash", 22)
          )
        );
      })
    );
    if (!addons.length) fill(listEl, h("div.settings-row.is-static", {}, "No add-ons installed."));
  }

  function openAddSheet() {
    const input = h("input.text-field", {
      type: "url",
      placeholder: "https://…/manifest.json",
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false"
    });
    const error = h("div.form-error");
    const submit = h("button.play-button.is-wide", { type: "button" }, h("span", {}, "Install"));
    const sheet = openSheet({
      title: "Add an add-on",
      content: h("div.form", {}, input, error, submit)
    });
    submit.addEventListener("click", async () => {
      const url = normalizeManifestUrl(input.value);
      if (!url) return;
      submit.disabled = true;
      error.textContent = "";
      if (store.addonUrls().includes(url)) {
        error.textContent = "That add-on is already installed.";
        return;
      }
      try {
        const { manifest } = await fetchManifest(url);
        store.saveAddonUrls([...store.addonUrls(), url]);
        sheet.close();
        toast(`Installed ${manifest.name}`);
        refresh();
      } catch (e) {
        error.textContent = "That link didn't return an add-on manifest. Check it and try again.";
        submit.disabled = false;
      }
    });
    setTimeout(() => input.focus(), 300);
  }

  refresh();
  return { el: root };
}
