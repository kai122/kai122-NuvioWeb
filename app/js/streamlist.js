// Stream results from every stream add-on, with per-add-on filter chips.
// Used by the stream picker page and the player's Sources panel.
import { h, icon, safeHttpUrl, fill } from "./dom.js";
import { fetchStreams } from "./addons.js";
import { pref } from "./prefs.js";
import { navigate } from "./router.js";
import { toast } from "./sheet.js";

export function streamLines(stream) {
  const text = [stream.title, stream.description].filter(Boolean).join("\n");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// onPlay({ url, streamTitle, addonName, stream }); onExternal(url)
export function createStreamList(context, { onPlay, onExternal, currentUrl = "" }) {
  const chips = h("div.stream-chips");
  const list = h("div.stream-list");
  const status = h("div.stream-status");
  const el = h("div.stream-panel-body", {}, chips, status, list);
  let groups = [];
  let filter = "all";
  let generation = 0;

  function renderChips() {
    const refresh = h(
      "button.chip-round",
      { type: "button", "aria-label": "Refresh", onclick: () => load() },
      icon("refresh", 20)
    );
    const chip = (value, label, disabled = false) =>
      h(
        "button.stream-chip",
        {
          type: "button",
          class: `${filter === value ? "is-selected" : ""} ${disabled ? "is-empty" : ""}`,
          onclick: () => {
            filter = value;
            renderChips();
            renderList();
          }
        },
        label
      );
    fill(
      chips,
      refresh,
      chip("all", "All"),
      ...groups.map((group) =>
        chip(group.addon.url, group.addon.manifest.name, !group.streams.length)
      )
    );
  }

  function row(stream, addon) {
    const playUrl = safeHttpUrl(stream.url);
    const externalUrl = safeHttpUrl(stream.externalUrl);
    const lines = streamLines(stream);
    const name = (stream.name || addon.manifest.name).trim();
    const isCurrent = playUrl && playUrl === currentUrl;
    return h(
      "div.stream-card",
      { class: `${playUrl ? "" : "is-disabled"} ${isCurrent ? "is-current" : ""}` },
      h(
        "button.stream-main",
        {
          type: "button",
          onclick: () => {
            if (playUrl) {
              onPlay({
                url: playUrl,
                streamTitle: lines[0] || name,
                addonName: addon.manifest.name,
                stream
              });
            } else if (externalUrl) {
              window.open(externalUrl, "_blank", "noopener");
            } else if (stream.ytId) {
              window.open(
                `https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}`,
                "_blank",
                "noopener"
              );
            } else {
              toast(
                stream.infoHash
                  ? "Torrent streams can't play in a browser. Use a debrid add-on."
                  : "This stream has no playable link."
              );
            }
          }
        },
        pref("streams.addonLogo", false) && safeHttpUrl(addon.manifest.logo)
          ? h(
              "span.stream-addon",
              {},
              h("img.stream-addon-logo", { src: safeHttpUrl(addon.manifest.logo), alt: "", loading: "lazy" }),
              addon.manifest.name
            )
          : null,
        name.split("\n").map((part) => h("span.stream-name", {}, part)),
        lines.map((line) => h("span.stream-line", {}, line))
      ),
      playUrl
        ? h(
            "button.stream-more",
            { type: "button", "aria-label": "Other players", onclick: () => onExternal(playUrl) },
            icon("external", 20)
          )
        : null
    );
  }

  function renderList() {
    const visible = groups.filter((group) => filter === "all" || group.addon.url === filter);
    fill(
      list,
      ...visible.flatMap((group) => group.streams.map((stream) => row(stream, group.addon)))
    );
  }

  async function load() {
    const gen = ++generation;
    groups = [];
    fill(list);
    fill(status, h("span.spinner"), "Finding streams…");
    renderChips();
    const count = await fetchStreams(context.type, context.videoId, (result) => {
      if (gen !== generation) return;
      groups.push(result);
      renderChips();
      renderList();
      if (result.streams.length) fill(status);
    });
    if (gen !== generation) return;
    if (!groups.some((group) => group.streams.length)) {
      fill(
        status,
        count
          ? "No streams found for this title."
          : h(
              "span",
              {},
              "No streaming add-ons installed. ",
              h(
                "button.link-button",
                { type: "button", onclick: () => navigate("addons") },
                "Add one"
              )
            )
      );
    }
  }

  load();
  return { el, reload: load };
}
