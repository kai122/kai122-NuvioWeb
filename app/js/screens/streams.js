import { h, icon, img } from "../dom.js";
import { openSheet, toast } from "../sheet.js";
import { navigate, back } from "../router.js";
import { createStreamList } from "../streamlist.js";

const PLAYBACK_KEY = "nuvioTouch.playback";
const STREAMS_KEY = "nuvioTouch.streams";

function remember(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* ignore */
  }
}

function recall(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch (_) {
    return null;
  }
}

let pendingPlayback = null;
let pendingStreams = null;

// replace: true swaps the current page (the stream picker) for the player,
// so leaving the player returns to the details page like the native app.
export function startPlayback(playback, { replace = false } = {}) {
  pendingPlayback = playback;
  remember(PLAYBACK_KEY, playback);
  navigate("play", { replace });
}

export function takePlayback() {
  return pendingPlayback || recall(PLAYBACK_KEY);
}

export function externalPlayerLinks(url) {
  const encoded = encodeURIComponent(url);
  return [
    { label: "Open in VLC", href: `vlc-x-callback://x-callback-url/stream?url=${encoded}` },
    { label: "Open in Infuse", href: `infuse://x-callback-url/play?url=${encoded}` },
    { label: "Open in Outplayer", href: `outplayer://${url.replace(/^https?:\/\//, "")}` }
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

export function openExternalSheet(url, title = "Play with") {
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
  return sheet;
}

// context: { type, metaId, videoId, name, poster, background, logo, season, episode, episodeTitle, thumbnail, year }
export function openStreams(context) {
  pendingStreams = context;
  remember(STREAMS_KEY, context);
  navigate("streams");
}

export function renderStreams() {
  const context = pendingStreams || recall(STREAMS_KEY);
  const root = h("div.screen.screen-streams");
  if (!context) {
    queueMicrotask(() => back());
    return { el: root };
  }
  const backdrop = h("div.streams-backdrop");
  if (context.background) {
    const bg = img(context.background, "streams-backdrop-img", "");
    bg.loading = "eager";
    backdrop.append(bg);
  }
  const titleEl = h("div.streams-title-text", {}, context.name);
  let brand = titleEl;
  if (context.logo) {
    brand = img(context.logo, "streams-logo", context.name);
    brand.loading = "eager";
    brand.addEventListener("error", () => brand.replaceWith(titleEl), { once: true });
  }
  const subtitle = context.season
    ? `S${context.season} E${context.episode}${context.episodeTitle ? ` · ${context.episodeTitle}` : ""}`
    : "";
  const list = createStreamList(context, {
    onPlay: (choice) =>
      startPlayback({ ...context, ...choice, stream: undefined }, { replace: true }),
    onExternal: (url) => openExternalSheet(url)
  });
  root.append(
    backdrop,
    h(
      "button.round-button.glass.page-back",
      { type: "button", "aria-label": "Back", onclick: () => back() },
      icon("back", 26)
    ),
    h("div.streams-brand", {}, brand, subtitle ? h("div.streams-episode", {}, subtitle) : null),
    h("aside.streams-panel.glass-panel", {}, list.el)
  );
  return { el: root };
}

// Continue Watching: replay the stream that was playing, from where it stopped.
export function resumeEntry(entry) {
  if (entry.url) startPlayback(entry);
  else openStreams(entry);
}
