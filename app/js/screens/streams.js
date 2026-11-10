import { h, icon, img, fill } from "../dom.js";
import { openSheet, toast } from "../sheet.js";
import { navigate, back } from "../router.js";
import { createStreamList, autoPick, choiceFor } from "../streamlist.js";
import { store } from "../store.js";
import { pref } from "../prefs.js";

const LINK_REUSE_MS = 48 * 3600 * 1000;

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
  if (playback.videoId && playback.url) {
    store.saveLink(playback.videoId, {
      url: playback.url,
      streamTitle: playback.streamTitle,
      addonName: playback.addonName,
      bingeGroup: playback.bingeGroup || ""
    });
  }
  if (pref("pb.playerPref", "internal") === "external") {
    openExternalSheet(playback.url, playback.name || "Play with");
    return;
  }
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

export function openExternalSheet(url, title = "Play with", tryHere = null) {
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
      ),
      tryHere
        ? h(
            "button.option",
            {
              type: "button",
              onclick: () => {
                sheet.close();
                tryHere();
              }
            },
            h("span", {}, "Try playing here anyway"),
            icon("play", 20)
          )
        : null
    )
  });
  return sheet;
}

// context: { type, metaId, videoId, name, poster, background, logo, season, episode, episodeTitle, thumbnail, year }
// Reuse Last Link: replay the stream that worked last time for this title.
export function openStreams(context, { replace = false } = {}) {
  if (pref("pb.reuseLink", false)) {
    const link = store.lastLink(context.videoId);
    if (link?.url && Date.now() - link.savedAt < LINK_REUSE_MS) {
      startPlayback({ ...context, ...link }, { replace });
      return;
    }
  }
  pendingStreams = context;
  remember(STREAMS_KEY, context);
  navigate("streams", { replace });
}

export function renderStreams() {
  const context = pendingStreams || recall(STREAMS_KEY);
  const root = h("div.screen.screen-streams", {
    class: `bg-${pref("streams.background", "cinematic")}`
  });
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
  // Auto Stream Selection: first source, or the first that matches a regex.
  // context.bingeGroup (from the player's next episode) is tried first.
  const mode = pref("pb.autoMode", "manual");
  let lastGroups = [];
  const timeout = Number(pref("pb.timeout", 5));
  const auto = mode !== "manual" || !!context.bingeGroup;
  let decided = !auto;
  const banner = h("div.streams-auto.is-hidden");
  const startedAt = Date.now();
  let timer = null;
  const play = (choice) => {
    decided = true;
    clearTimeout(timer);
    startPlayback({ ...context, ...choice, stream: undefined }, { replace: true });
  };
  const tryAuto = (groups, done) => {
    if (decided) return;
    const pick = autoPick(groups, {
      mode,
      pattern: pref("pb.autoRegex", ""),
      bingeGroup: context.bingeGroup
    });
    const waited = (Date.now() - startedAt) / 1000;
    const ready = pick && (timeout === 0 || done || (timeout > 0 && waited >= timeout));
    if (ready) {
      toast(`Playing ${pick.addon.manifest.name}`);
      play(choiceFor(pick));
    } else if (done) {
      decided = true;
      banner.classList.add("is-hidden");
      if (auto) toast(mode === "regex" ? "No stream matched your pattern" : "Pick a stream");
    }
  };
  const list = createStreamList(context, {
    onPlay: play,
    onExternal: (url, tryHere, needsPlayer) =>
      openExternalSheet(
        url,
        needsPlayer ? "Safari can't play this file" : "Play with",
        needsPlayer ? tryHere : null
      ),
    onUpdate: (groups, done) => {
      lastGroups = groups;
      tryAuto(groups, done);
    }
  });
  if (auto) {
    fill(
      banner,
      h("span.spinner"),
      h(
        "span",
        {},
        mode === "regex" ? "Looking for a matching stream…" : "Choosing a stream for you…"
      ),
      h(
        "button.link-button",
        {
          type: "button",
          onclick: () => {
            decided = true;
            clearTimeout(timer);
            banner.classList.add("is-hidden");
          }
        },
        "Choose myself"
      )
    );
    banner.classList.remove("is-hidden");
    if (timeout > 0) timer = setTimeout(() => tryAuto(lastGroups, false), timeout * 1000 + 50);
  }
  root.append(
    backdrop,
    h(
      "button.round-button.glass.page-back",
      { type: "button", "aria-label": "Back", onclick: () => back() },
      icon("back", 26)
    ),
    h("div.streams-brand", {}, brand, subtitle ? h("div.streams-episode", {}, subtitle) : null),
    h("aside.streams-panel.glass-panel", {}, banner, list.el)
  );
  return {
    el: root,
    destroy() {
      decided = true;
      clearTimeout(timer);
    }
  };
}

// Continue Watching: replay the stream that was playing, from where it stopped.
export function resumeEntry(entry) {
  if (entry.url) startPlayback(entry);
  else openStreams(entry);
}
