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

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s?(TB|GB|MB)\b/i;

// File size as text, from behaviorHints.videoSize or the stream's description.
export function streamSize(stream) {
  const bytes = Number(stream?.behaviorHints?.videoSize);
  if (bytes > 0) {
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
  }
  const match = streamLines(stream).join(" ").match(SIZE_RE);
  return match ? `${match[1].replace(",", ".")} ${match[2].toUpperCase()}` : "";
}

// Picks the stream to auto-play from the add-on groups, or null.
// mode: "first" | "regex"; bingeGroup: prefer the same source as last episode.
export function autoPick(groups, { mode, pattern = "", bingeGroup = "" }) {
  const playable = groups.flatMap((group) =>
    group.streams
      .filter((stream) => safeHttpUrl(stream.url))
      .map((stream) => ({ stream, addon: group.addon }))
  );
  if (!playable.length) return null;
  if (bingeGroup) {
    const same = playable.find((p) => p.stream.behaviorHints?.bingeGroup === bingeGroup);
    if (same) return same;
  }
  if (mode === "first") return playable[0];
  if (mode === "regex" && pattern) {
    let re;
    try {
      re = new RegExp(pattern, "i");
    } catch (_) {
      return null;
    }
    return (
      playable.find((p) => re.test([p.stream.name, ...streamLines(p.stream)].join(" "))) || null
    );
  }
  return null;
}

export function choiceFor({ stream, addon }) {
  const lines = streamLines(stream);
  return {
    url: safeHttpUrl(stream.url),
    streamTitle: lines[0] || (stream.name || addon.manifest.name).trim(),
    addonName: addon.manifest.name,
    bingeGroup: stream.behaviorHints?.bingeGroup || "",
    stream
  };
}

// onPlay({ url, streamTitle, addonName, bingeGroup, stream }); onExternal(url)
// onUpdate(groups, done) runs after each add-on answers.
export function createStreamList(context, { onPlay, onExternal, onUpdate, currentUrl = "" }) {
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
    const size = pref("streams.sizeBadges", true) ? streamSize(stream) : "";
    return h(
      "div.stream-card",
      {
        class: `${playUrl ? "" : "is-disabled"} ${isCurrent ? "is-current" : ""} badge-${pref("streams.badgePos", "bottom")}`
      },
      h(
        "button.stream-main",
        {
          type: "button",
          onclick: () => {
            if (playUrl) {
              onPlay(choiceFor({ stream, addon }));
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
              h("img.stream-addon-logo", {
                src: safeHttpUrl(addon.manifest.logo),
                alt: "",
                loading: "lazy"
              }),
              addon.manifest.name
            )
          : null,
        name.split("\n").map((part) => h("span.stream-name", {}, part)),
        lines.map((line) => h("span.stream-line", {}, line)),
        size ? h("span.stream-size", {}, size) : null
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
      onUpdate?.(groups, false);
    });
    if (gen !== generation) return;
    onUpdate?.(groups, true);
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
  return { el, reload: load, setStatus: (...nodes) => fill(status, ...nodes) };
}
