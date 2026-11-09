import { h, icon, fill } from "../dom.js";
import { back } from "../router.js";
import { store } from "../store.js";
import { takePlayback, externalPlayerLinks, copyLink } from "./streams.js";

const SAVE_EVERY_MS = 5000;

export function renderPlayer() {
  const playback = takePlayback();
  const root = h("div.screen.screen-player");
  if (!playback?.url) {
    queueMicrotask(() => back());
    return { el: root };
  }

  const video = h("video.player-video", {
    playsinline: true,
    controls: true,
    autoplay: true,
    preload: "auto"
  });
  const title = playback.season
    ? `${playback.name} · S${playback.season} E${playback.episode}`
    : playback.name;
  const top = h(
    "div.player-top",
    {},
    h(
      "button.round-button.glass",
      { type: "button", "aria-label": "Back", onclick: () => back() },
      icon("back", 26)
    ),
    h(
      "div.player-titles",
      {},
      h("div.player-title", {}, title || ""),
      h("div.player-sub", {}, playback.streamTitle || "")
    )
  );
  const errorBox = h("div.player-error.is-hidden");
  root.append(video, top, errorBox);

  const saved = store.progressMap()[playback.videoId];
  let lastSave = 0;

  function save(force = false) {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const now = Date.now();
    if (!force && now - lastSave < SAVE_EVERY_MS) return;
    lastSave = now;
    if (video.currentTime / video.duration >= 0.95) {
      store.removeProgress(playback.videoId);
      store.setWatched(playback.videoId, true);
      if (!playback.season) store.setWatched(playback.metaId, true);
      return;
    }
    if (video.currentTime < 5) return;
    store.setProgress({ ...playback, time: video.currentTime, duration: video.duration });
  }

  video.addEventListener("loadedmetadata", () => {
    if (saved?.url === playback.url && saved.time > 5 && saved.time < video.duration - 10) {
      video.currentTime = saved.time;
    }
  });
  video.addEventListener("timeupdate", () => save(false));
  video.addEventListener("pause", () => save(true));
  video.addEventListener("ended", () => save(true));
  video.addEventListener("error", () => {
    errorBox.classList.remove("is-hidden");
    fill(
      errorBox,
      h("div.player-error-title", {}, "Safari can't play this stream"),
      h(
        "div.player-error-text",
        {},
        "This is usually an MKV file or an unsupported codec. Open it in a player app instead, or pick another stream."
      ),
      h(
        "div.player-error-actions",
        {},
        externalPlayerLinks(playback.url).map((link) =>
          h("a.pill-button", { href: link.href }, link.label)
        ),
        h(
          "button.pill-button.is-ghost",
          { type: "button", onclick: () => copyLink(playback.url) },
          "Copy link"
        )
      )
    );
  });

  // Our top bar follows the native controls: hide it while playing untouched.
  let idleTimer = null;
  const wake = () => {
    root.classList.remove("is-idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!video.paused) root.classList.add("is-idle");
    }, 3000);
  };
  root.addEventListener("pointerdown", wake);
  video.addEventListener("play", wake);
  video.addEventListener("pause", wake);

  video.src = playback.url;
  wake();

  return {
    el: root,
    destroy() {
      save(true);
      clearTimeout(idleTimer);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };
}
