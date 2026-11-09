import { h, icon, safeImageUrl, fill } from "../dom.js";
import { store } from "../store.js";
import { loadAllAddons, fetchManifest, normalizeManifestUrl } from "../addons.js";
import { openSheet, toast } from "../sheet.js";

// Lets Home rebuild its rows after add-ons change.
function addonsChanged() {
  window.dispatchEvent(new Event("nuvio:addons-changed"));
}

function card(...rows) {
  return h("div.settings-card", {}, rows);
}

function row({ iconName, title, subtitle, onClick, trailing, danger = false }) {
  return h(
    onClick ? "button.settings-row" : "div.settings-row.is-static",
    { type: onClick ? "button" : null, onclick: onClick, class: danger ? "is-danger" : "" },
    iconName ? h("span.settings-icon", {}, icon(iconName, 22)) : null,
    h(
      "span.settings-copy",
      {},
      h("span.settings-title", {}, title),
      subtitle ? h("span.settings-sub", {}, subtitle) : null
    ),
    trailing === undefined ? (onClick ? icon("chevronRight", 22) : null) : trailing
  );
}

function toggle(on, onChange, label) {
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

export function sectionAddons(refreshSection) {
  const listEl = h("div.addon-list", {}, h("div.settings-loading", {}, h("span.spinner")));

  async function draw() {
    const addons = await loadAllAddons({ refresh: true });
    if (!addons.length) {
      fill(
        listEl,
        h(
          "div.empty-card",
          {},
          h("div.empty-title", {}, "No add-ons installed"),
          h("div.empty-text", {}, "Add one to fill Home and find streams.")
        )
      );
      return;
    }
    fill(
      listEl,
      ...addons.map((addon, index) => {
        const manifest = addon.manifest;
        const resources = (manifest?.resources || []).map((r) =>
          typeof r === "string" ? r : r.name
        );
        const catalogs = (manifest?.catalogs || []).length;
        const logo = safeImageUrl(manifest?.logo);
        const types = (manifest?.types || [])
          .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
          .join(" / ");
        return h(
          "div.addon-card",
          { class: addon.enabled ? "" : "is-disabled" },
          h(
            "div.addon-head",
            {},
            h(
              "span.addon-icon",
              {},
              logo ? h("img.addon-logo", { src: logo, alt: "" }) : icon("puzzle", 26)
            ),
            h(
              "div.addon-titles",
              {},
              h("div.addon-name", {}, manifest?.name || "Unavailable add-on"),
              h(
                "div.addon-version",
                {},
                manifest?.version ? `Version ${manifest.version}` : addon.url
              )
            ),
            toggle(
              addon.enabled,
              (on) => {
                store.setAddonEnabled(addon.url, on);
                addonsChanged();
                draw();
              },
              `Enable ${manifest?.name || "add-on"}`
            )
          ),
          h(
            "div.addon-chips",
            {},
            h("span.addon-chip", {}, addon.enabled ? (manifest ? "Active" : "Error") : "Off"),
            h(
              "span.addon-chip",
              {},
              `${resources.length} resource${resources.length === 1 ? "" : "s"}`
            ),
            h("span.addon-chip", {}, `${catalogs} catalog${catalogs === 1 ? "" : "s"}`),
            manifest?.behaviorHints?.configurable ? h("span.addon-chip", {}, "Configurable") : null
          ),
          manifest?.description ? h("div.addon-desc", {}, manifest.description) : null,
          h("div.addon-meta", {}, [types, resources.join(", ")].filter(Boolean).join(" • ")),
          h(
            "div.addon-actions",
            {},
            h(
              "button.icon-button",
              {
                type: "button",
                "aria-label": "Move up",
                disabled: index === 0,
                onclick: () => {
                  store.moveAddon(addon.url, -1);
                  addonsChanged();
                  draw();
                }
              },
              icon("chevronDown", 22)
            ),
            h(
              "button.icon-button",
              {
                type: "button",
                "aria-label": "Move down",
                disabled: index === addons.length - 1,
                onclick: () => {
                  store.moveAddon(addon.url, 1);
                  addonsChanged();
                  draw();
                }
              },
              icon("chevronDown", 22)
            ),
            h(
              "button.icon-button.is-danger",
              {
                type: "button",
                "aria-label": "Remove",
                onclick: () => {
                  if (!confirm(`Remove ${manifest?.name || "this add-on"}?`)) return;
                  store.saveAddonUrls(store.addonUrls().filter((url) => url !== addon.url));
                  store.setAddonEnabled(addon.url, true);
                  addonsChanged();
                  draw();
                }
              },
              icon("trash", 22)
            )
          )
        );
      })
    );
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
      content: h(
        "div.form",
        {},
        h(
          "div.form-hint",
          {},
          "Paste the manifest link from the add-on's configure page. It is saved only on this device."
        ),
        input,
        error,
        submit
      )
    });
    submit.addEventListener("click", async () => {
      const url = normalizeManifestUrl(input.value);
      if (!url) {
        error.textContent = "Enter a web link (https://…).";
        return;
      }
      if (store.addonUrls().includes(url)) {
        error.textContent = "That add-on is already installed.";
        return;
      }
      submit.disabled = true;
      error.textContent = "";
      try {
        const { manifest } = await fetchManifest(url);
        store.saveAddonUrls([...store.addonUrls(), url]);
        sheet.close();
        toast(`Installed ${manifest.name}`);
        addonsChanged();
        draw();
      } catch (_) {
        error.textContent = "That link didn't return an add-on manifest. Check it and try again.";
        submit.disabled = false;
      }
    });
    setTimeout(() => input.focus(), 300);
  }

  draw();
  return [
    h(
      "div.settings-heading-row",
      {},
      h("h2.settings-heading", {}, "Add-ons"),
      h("button.pill-button", { type: "button", onclick: openAddSheet }, icon("add", 20), "Add")
    ),
    h(
      "p.settings-note",
      {},
      "Add-ons provide catalogs, details, streams and subtitles. Order matters: the first add-on that can answer is used for details."
    ),
    listEl
  ];
}
