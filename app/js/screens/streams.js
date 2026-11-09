import { h, icon, fill } from "../dom.js";
import { fetchStreams } from "../addons.js";
import { openSheet, toast } from "../sheet.js";
import { navigate } from "../router.js";

// The player reads this when the "play" route mounts.
export let pendingPlayback = null;

export function startPlayback(playback) {
  pendingPlayback = playback;
  try {
    sessionStorage.setItem("nuvioTouch.playback", JSON.stringify(playback));
  } catch (_) {
    /* ignore */
  }
  navigate("play");
}

export function takePlayback() {
  if (pendingPlayback) return pendingPlayback;
  try {
    return JSON.parse(sessionStorage.getItem("nuvioTouch.playback") || "null");
  } catch (_) {
    return null;
  }
}

export function externalPlayerLinks(url) {
  const encoded = encodeURIComponent(url);
  return [
    { label: "Open in VLC", href: `vlc-x-callback://x-callback-url/stream?url=${encoded}` },
    { label: "Open in Infuse", href: `infuse://x-callback-url/play?url=${encoded}` },
    { label: "Open in Outplayer", href: `outplayer://${url}` }
  ];
}

export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch (_) {
    toast("Could not copy the link");
  }
}

function streamLines(stream) {
  const text = [stream.title, stream.description].filter(Boolean).join("\n");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function openExternalSheet(url, title) {
  const sheet = openSheet({
    title,
    content: h(
      "div.option-list",
      {},
      externalPlayerLinks(url).map((link) =>
        h(
          "a.option",
          { href: link.href, onclick: () => setTimeout(() => sheet.close(), 300) },
          h("span", {}, link.label),
          icon("external", 20)
        )
      ),
      h(
        "button.option",
        { type: "button", onclick: () => copyLink(url) },
        h("span", {}, "Copy link"),
        icon("link", 20)
      )
    )
  });
}

// context: { type, metaId, videoId, name, poster, background, logo, season, episode, episodeTitle, thumbnail, year }
export function openStreams(context) {
  const list = h("div.stream-list");
  const status = h("div.stream-status", {}, h("span.spinner"), "Finding streams…");
  const subtitle = context.season
    ? `S${context.season} E${context.episode}${context.episodeTitle ? ` · ${context.episodeTitle}` : ""}`
    : context.year || "";
  const sheet = openSheet({
    title: context.name,
    content: h("div", {}, subtitle ? h("div.sheet-subtitle", {}, subtitle) : null, status, list)
  });
  let total = 0;

  const play = (stream, addon) =>
    startPlayback({
      ...context,
      url: stream.url,
      streamTitle: streamLines(stream)[0] || stream.name || addon.manifest.name,
      addonName: addon.manifest.name
    });

  fetchStreams(context.type, context.videoId, ({ addon, streams }) => {
    if (!streams.length) return;
    total += streams.length;
    const group = h("div.stream-group", {}, h("div.stream-group-title", {}, addon.manifest.name));
    for (const stream of streams) {
      const playable = Boolean(stream.url);
      const lines = streamLines(stream);
      const row = h(
        "div.stream-row",
        { class: playable ? "" : "is-disabled" },
        h(
          "button.stream-main",
          {
            type: "button",
            onclick: () => {
              if (playable) {
                sheet.close();
                play(stream, addon);
              } else if (stream.externalUrl) {
                window.open(stream.externalUrl, "_blank", "noopener");
              } else if (stream.ytId) {
                window.open(
                  `https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}`,
                  "_blank",
                  "noopener"
                );
              } else {
                toast("Torrent streams can't play in a browser. Use a debrid add-on.");
              }
            }
          },
          h("span.stream-name", {}, (stream.name || addon.manifest.name).replace(/\n/g, " ")),
          lines.map((line) => h("span.stream-line", {}, line))
        ),
        playable
          ? h(
              "button.stream-more",
              {
                type: "button",
                "aria-label": "Other players",
                onclick: () => openExternalSheet(stream.url, "Play with")
              },
              icon("external", 20)
            )
          : null
      );
      group.append(row);
    }
    list.append(group);
    status.remove();
  }).then((addonCount) => {
    if (total) return;
    fill(
      status,
      addonCount
        ? "No streams found for this title."
        : h(
            "span",
            {},
            "No streaming add-ons installed. ",
            h(
              "button.link-button",
              {
                type: "button",
                onclick: () => {
                  sheet.close();
                  navigate("addons");
                }
              },
              "Add one"
            )
          )
    );
  });
}

// Continue Watching: replay the stream that was playing, from where it stopped.
export function resumeEntry(entry) {
  if (entry.url) startPlayback(entry);
  else openStreams(entry);
}
