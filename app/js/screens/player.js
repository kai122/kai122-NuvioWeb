import { h, icon, safeHttpUrl, fill, img } from "../dom.js";
import { back } from "../router.js";
import { store } from "../store.js";
import { toast } from "../sheet.js";
import { pref, setPref } from "../prefs.js";
import { fetchSubtitles, fetchMeta, preloadStreams, fetchStreams } from "../addons.js";
import { PAGES } from "../settings/schema.js";
import { seriesEpisodes, episodeContext, isReleased } from "./detail.js";
import { createStreamList, playability, choiceFor } from "../streamlist.js";
import { parseSubtitles, findCue, languageName, stripSdh } from "../subtitles.js";
import {
  takePlayback,
  externalPlayerLinks,
  copyLink,
  openExternalSheet,
  openStreams
} from "./streams.js";

const SAVE_EVERY_MS = 5000;
const HIDE_AFTER_MS = 3500;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FITS = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
  { value: "fill", label: "Stretch" }
];
const SUB_COLORS = PAGES["pb.subs"].rows.find((r) => r.pref === "subs.color").opts.map((o) => o.v);
const SUB_LANG_KEY = "nuvioTouch.subtitleLanguage";
const LAST_PLAYER_KEY = "nuvioTouch.lastPlayer";
const BASE_SUB_PX = 30;
const PAUSE_OVERLAY_MS = 5000;
const NEXT_COUNTDOWN_S = 10;
const HOLD_MS = 450;
const HOLD_RATE = 2;

function readJSON(key, fallback) {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key) || "null") || {}) };
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* ignore */
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const hrs = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return hrs ? `${pad(hrs)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function skipButton(forward, onClick) {
  return h(
    "button.player-skip",
    {
      type: "button",
      "aria-label": forward ? "Forward 10 seconds" : "Back 10 seconds",
      onclick: onClick
    },
    h("span.player-skip-icon", { class: forward ? "is-forward" : "" }, icon("replay", 34)),
    h("span.player-skip-num", {}, "10")
  );
}

export function renderPlayer() {
  const playback = takePlayback();
  const root = h("div.screen.screen-player");
  if (playback) playback.url = safeHttpUrl(playback.url);
  if (!playback?.url) {
    queueMicrotask(() => back());
    return { el: root };
  }

  const video = h("video.player-video", {
    playsinline: true,
    "webkit-playsinline": true,
    preload: "auto"
  });
  const subtitleText = h("div.player-subtitle", { "aria-live": "off" });
  const scrim = h("div.player-scrim");
  const spinner = h("div.player-buffering", {}, h("span.spinner"));
  const setLoading = (text) => {
    loadingText.textContent = pref("pb.loadingStatus", true) ? text : "";
  };
  const errorBox = h("div.player-error.is-hidden");
  const loadingText = h("div.player-loading-text");
  const speedBadge = h("div.player-speed-badge", {}, `${HOLD_RATE}×`, icon("skipNext", 18));
  const seekBadge = h("div.player-seek-badge");
  const ratingBadge = h("div.player-rating-badge");
  const pauseOverlay = h("div.player-pause-overlay");
  const nextCard = h("div.player-next");
  const panelHost = h("div.player-panel-host");

  // --- Top right: picture-in-picture, lock, back -----------------------------
  const pipSupported =
    document.pictureInPictureEnabled || typeof video.webkitSetPresentationMode === "function";
  const topRight = h(
    "div.player-top",
    {},
    h(
      "div.player-pill",
      {},
      pipSupported
        ? h(
            "button.player-icon",
            { type: "button", "aria-label": "Picture in picture", onclick: togglePip },
            icon("pip", 22)
          )
        : null,
      h(
        "button.player-icon",
        { type: "button", "aria-label": "Lock controls", onclick: () => setLocked(true) },
        icon("lock", 22)
      )
    ),
    h(
      "button.player-round",
      { type: "button", "aria-label": "Close player", onclick: () => back() },
      icon("arrowBack", 24)
    )
  );

  // --- Centre: -10, play/pause, +10 ------------------------------------------
  const playButton = h("button.player-play", {
    type: "button",
    "aria-label": "Play or pause",
    onclick: togglePlay
  });
  const center = h(
    "div.player-center",
    {},
    skipButton(false, () => seekBy(-10)),
    playButton,
    skipButton(true, () => seekBy(10))
  );

  // --- Bottom: title, ends-at, seek bar, toolbar, time ------------------------
  const endsAt = h("div.player-ends");
  const progressFill = h("div.player-progress-fill");
  const buffered = h("div.player-progress-buffered");
  const thumb = h("div.player-progress-thumb");
  const scrubLabel = h("div.player-scrub-label.is-hidden");
  const progress = h(
    "div.player-progress",
    { role: "slider", "aria-label": "Seek" },
    h("div.player-progress-track", {}, buffered, progressFill),
    thumb,
    scrubLabel
  );
  const timePill = h("div.player-time-pill");
  let expanded = false;
  const toolbar = h("div.player-toolbar");
  const subtitleLabel = playback.season
    ? `S${playback.season} E${playback.episode}${playback.episodeTitle ? ` · ${playback.episodeTitle}` : ""}`
    : playback.year || "";
  const bottom = h(
    "div.player-bottom",
    {},
    h(
      "div.player-info-row",
      {},
      h(
        "div.player-titles",
        {},
        h("div.player-title", {}, playback.name || ""),
        h("div.player-sub", {}, subtitleLabel)
      ),
      endsAt
    ),
    progress,
    h("div.player-toolbar-row", {}, toolbar, timePill)
  );

  const chrome = h("div.player-chrome", {}, topRight, center, bottom);
  const unlockButton = h(
    "button.player-unlock",
    { type: "button", onclick: () => setLocked(false) },
    icon("lock", 20),
    h("span", {}, "Tap to unlock")
  );
  spinner.append(loadingText);
  root.append(
    video,
    subtitleText,
    scrim,
    pauseOverlay,
    ratingBadge,
    speedBadge,
    seekBadge,
    chrome,
    nextCard,
    spinner,
    errorBox,
    unlockButton,
    panelHost
  );

  // --- State ------------------------------------------------------------------
  const saved = store.progressMap()[playback.videoId];
  let lastSave = 0;
  let hideTimer = null;
  let locked = false;
  let fitIndex = 0;
  let scrubbing = false;
  let subtitles = [];
  let cues = [];
  let activeSubtitle = null;
  let nativeTrack = null;
  // Subtitle style lives in Settings > Media > Playback > Subtitles. The
  // in-player panel edits the same settings.
  let subDelay = 0;
  let meta = null; // full series/movie metadata, loaded in the background
  let nextVideo = null;
  let nextShown = false;
  let nextDismissed = false;
  let nextTimer = null;
  let preloaded = false;
  let finished = false;
  let pauseTimer = null;
  let ratingShown = false;

  function renderToolbar() {
    const tool = (name, label, onClick, active = false) =>
      h(
        "button.player-icon",
        { type: "button", "aria-label": label, class: active ? "is-active" : "", onclick: onClick },
        icon(name, 22)
      );
    const items = [
      tool("speed", "Playback speed", openSpeed, video.playbackRate !== 1),
      tool("aspect", "Aspect ratio", cycleFit, fitIndex !== 0),
      tool("cc", "Subtitles", openSubtitlesPanel, Boolean(activeSubtitle)),
      audioTracks().length > 1 ? tool("audio", "Audio", openAudio) : null,
      tool("layers", "Sources", openSources)
    ];
    if (expanded) {
      items.push(
        tool("external", "Open in another player", () => openExternalSheet(playback.url)),
        tool("info", "Playback info", openInfo)
      );
      if (document.fullscreenEnabled || document.webkitFullscreenEnabled)
        items.push(tool("fullscreen", "Full screen", toggleFullscreen));
    }
    items.push(
      tool(
        expanded ? "back" : "chevronRight",
        expanded ? "Fewer controls" : "More controls",
        () => {
          expanded = !expanded;
          renderToolbar();
          wake();
        }
      )
    );
    fill(toolbar, ...items.filter(Boolean));
  }

  function applySubtitleStyle() {
    const size = Math.round(BASE_SUB_PX * (Number(pref("subs.size", 100)) / 100));
    const background = Number(pref("subs.bgOpacity", 0)) / 100;
    subtitleText.style.fontSize = `${size}px`;
    subtitleText.style.color = pref("subs.color", "#ffffff");
    subtitleText.style.fontWeight = pref("subs.bold", false) ? "700" : "500";
    subtitleText.style.setProperty("--sub-bg", `rgba(0, 0, 0, ${background})`);
    subtitleText.style.setProperty("--sub-offset", `${Number(pref("subs.offset", 20))}px`);
    subtitleText.classList.toggle("has-bg", background > 0);
    subtitleText.classList.toggle("has-outline", !!pref("subs.outline", true));
    subtitleText.classList.toggle("has-shadow", !!pref("subs.shadow", false));
  }

  // --- Controls visibility ------------------------------------------------------
  function showControls(visible) {
    root.classList.toggle("controls-visible", visible && !locked);
  }

  function wake() {
    if (locked) return;
    if (pauseOverlay.classList.contains("is-on")) schedulePauseOverlay();
    showControls(true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!video.paused && !scrubbing && !panelHost.firstChild) showControls(false);
    }, HIDE_AFTER_MS);
  }

  function setLocked(value) {
    locked = value;
    root.classList.toggle("is-locked", locked);
    if (locked) {
      showControls(false);
      toast("Controls locked");
    } else {
      wake();
    }
  }

  // --- Gestures: tap toggles controls; double-tap the sides skips 10 s;
  // swipe sideways seeks; press and hold plays at 2x (each can be turned off).
  let lastTap = 0;
  let gesture = null; // { x, y, startTime, mode: null|"seek"|"hold", holdTimer }
  let suppressClick = false;
  scrim.addEventListener("pointerdown", (event) => {
    if (locked) return;
    const holdAllowed = pref("pb.holdSpeed", true);
    gesture = {
      x: event.clientX,
      y: event.clientY,
      startTime: video.currentTime,
      mode: null,
      holdTimer: null
    };
    if (holdAllowed && !video.paused) {
      gesture.holdTimer = setTimeout(() => {
        if (!gesture || gesture.mode) return;
        gesture.mode = "hold";
        gesture.rate = video.playbackRate;
        video.playbackRate = HOLD_RATE;
        speedBadge.classList.add("is-on");
        showControls(false);
      }, HOLD_MS);
    }
  });
  scrim.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.mode === "hold") return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (
      !gesture.mode &&
      Math.abs(dx) > 24 &&
      Math.abs(dx) > Math.abs(dy) * 1.5 &&
      pref("pb.gestures", true) &&
      Number.isFinite(video.duration)
    ) {
      gesture.mode = "seek";
      clearTimeout(gesture.holdTimer);
    } else if (!gesture.mode && Math.hypot(dx, dy) > 12) {
      clearTimeout(gesture.holdTimer);
    }
    if (gesture.mode === "seek") {
      // A full-width swipe covers 3 minutes, or the whole video if shorter.
      const span = Math.min(180, video.duration);
      const delta = (dx / window.innerWidth) * span;
      gesture.target = Math.max(0, Math.min(video.duration - 0.5, gesture.startTime + delta));
      seekBadge.textContent = `${delta >= 0 ? "+" : "−"}${formatTime(Math.abs(delta))}  ·  ${formatTime(gesture.target)}`;
      seekBadge.classList.add("is-on");
    }
  });
  const endGesture = () => {
    if (!gesture) return;
    clearTimeout(gesture.holdTimer);
    if (gesture.mode === "hold") {
      video.playbackRate = gesture.rate || 1;
      speedBadge.classList.remove("is-on");
      suppressClick = true;
    } else if (gesture.mode === "seek") {
      if (Number.isFinite(gesture.target)) video.currentTime = gesture.target;
      seekBadge.classList.remove("is-on");
      suppressClick = true;
      wake();
    }
    gesture = null;
  };
  scrim.addEventListener("pointerup", endGesture);
  scrim.addEventListener("pointercancel", endGesture);
  scrim.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (locked) {
      unlockButton.classList.add("is-shown");
      setTimeout(() => unlockButton.classList.remove("is-shown"), 2500);
      return;
    }
    const now = Date.now();
    const third = event.clientX / window.innerWidth;
    if (pref("pb.gestures", true) && now - lastTap < 300 && (third < 0.33 || third > 0.67)) {
      seekBy(third < 0.33 ? -10 : 10);
      lastTap = 0;
      return;
    }
    lastTap = now;
    if (root.classList.contains("controls-visible")) {
      clearTimeout(hideTimer);
      showControls(false);
    } else {
      wake();
    }
  });

  // --- Playback -------------------------------------------------------------------
  function togglePlay() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    wake();
  }

  function seekBy(delta) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 0.5, video.currentTime + delta));
    wake();
  }

  function syncPlayState() {
    fill(playButton, icon(video.paused ? "play" : "pause", 40));
  }

  function syncTime() {
    const duration = video.duration;
    const current = video.currentTime;
    if (!scrubbing && Number.isFinite(duration) && duration > 0) {
      const ratio = current / duration;
      progressFill.style.transform = `scaleX(${ratio})`;
      thumb.style.left = `${ratio * 100}%`;
    }
    timePill.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (Number.isFinite(duration) && duration > 0) {
      const remaining = (duration - current) / (video.playbackRate || 1);
      const end = new Date(Date.now() + remaining * 1000);
      endsAt.textContent = `Ends at ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    try {
      const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      buffered.style.transform = `scaleX(${Number.isFinite(duration) && duration ? end / duration : 0})`;
    } catch (_) {
      /* ignore */
    }
    renderSubtitle();
  }

  function save(force = false) {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const now = Date.now();
    if (!force && now - lastSave < SAVE_EVERY_MS) return;
    lastSave = now;
    if (video.currentTime / video.duration >= 0.95) {
      if (finished) return;
      finished = true;
      store.removeProgress(playback.videoId);
      store.setWatched(playback.videoId, true);
      if (!playback.season) store.setWatched(playback.metaId, true);
      else updateNextUp();
      return;
    }
    if (video.currentTime < 5) return;
    finished = false;
    const { stream, ...entry } = playback;
    store.setProgress({ ...entry, time: video.currentTime, duration: video.duration });
  }

  // --- Seek bar -------------------------------------------------------------------
  function ratioAt(clientX) {
    const box = progress.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width));
  }

  function previewScrub(ratio) {
    progressFill.style.transform = `scaleX(${ratio})`;
    thumb.style.left = `${ratio * 100}%`;
    scrubLabel.style.left = `${ratio * 100}%`;
    scrubLabel.textContent = formatTime(ratio * (video.duration || 0));
  }

  progress.addEventListener("pointerdown", (event) => {
    if (!Number.isFinite(video.duration)) return;
    scrubbing = true;
    progress.setPointerCapture?.(event.pointerId);
    progress.classList.add("is-scrubbing");
    scrubLabel.classList.remove("is-hidden");
    previewScrub(ratioAt(event.clientX));
    wake();
  });
  progress.addEventListener("pointermove", (event) => {
    if (scrubbing) previewScrub(ratioAt(event.clientX));
  });
  const endScrub = (event) => {
    if (!scrubbing) return;
    scrubbing = false;
    progress.classList.remove("is-scrubbing");
    scrubLabel.classList.add("is-hidden");
    video.currentTime = ratioAt(event.clientX) * video.duration;
    wake();
  };
  progress.addEventListener("pointerup", endScrub);
  progress.addEventListener("pointercancel", endScrub);

  // --- Toolbar actions ------------------------------------------------------------
  function cycleFit() {
    fitIndex = (fitIndex + 1) % FITS.length;
    video.style.objectFit = FITS[fitIndex].value;
    toast(FITS[fitIndex].label);
    renderToolbar();
    wake();
  }

  function togglePip() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.();
    } else if (video.requestPictureInPicture) {
      video.requestPictureInPicture().catch(() => toast("Picture in picture is not available"));
    } else if (video.webkitSetPresentationMode) {
      video.webkitSetPresentationMode(
        video.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture"
      );
    }
  }

  function toggleFullscreen() {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root);
  }

  // --- Panels ---------------------------------------------------------------------
  function closePanel() {
    fill(panelHost);
    root.classList.remove("has-panel");
    wake();
  }

  function openPanel(panel, { side = "right" } = {}) {
    clearTimeout(hideTimer);
    const shell = h(
      "div.player-panel-backdrop",
      {
        class: `is-${side}`,
        onclick: (event) => {
          if (event.target === shell) closePanel();
        }
      },
      panel
    );
    fill(panelHost, shell);
    root.classList.add("has-panel");
    requestAnimationFrame(() => shell.classList.add("is-open"));
  }

  function panelHeader(title, subtitle) {
    return h(
      "div.player-panel-head",
      {},
      h(
        "div",
        {},
        h("div.player-panel-title", {}, title),
        subtitle ? h("div.player-panel-sub", {}, subtitle) : null
      ),
      h("button.player-panel-close", { type: "button", onclick: closePanel }, "Close")
    );
  }

  function openSpeed() {
    const panel = h(
      "div.player-panel.is-compact",
      {},
      panelHeader("Playback speed"),
      h(
        "div.option-list",
        {},
        SPEEDS.map((speed) =>
          h(
            "button.option",
            {
              type: "button",
              class: video.playbackRate === speed ? "is-selected" : "",
              onclick: () => {
                video.playbackRate = speed;
                renderToolbar();
                closePanel();
              }
            },
            h("span", {}, speed === 1 ? "Normal" : `${speed}×`),
            video.playbackRate === speed ? h("span.option-check", { html: "&#10003;" }) : null
          )
        )
      )
    );
    openPanel(panel);
  }

  function openSources() {
    const list = createStreamList(playback, {
      currentUrl: playback.url,
      onPlay: (choice) => {
        closePanel();
        switchSource(choice);
      },
      onExternal: (url, tryHere, needsPlayer) =>
        openExternalSheet(
          url,
          needsPlayer ? "Safari can't play this file" : "Play with",
          needsPlayer
            ? () => {
                closePanel();
                tryHere();
              }
            : null
        )
    });
    openPanel(h("div.player-panel", {}, panelHeader("Sources", playback.name), list.el));
  }

  function switchSource(choice) {
    if (choice.url === playback.url) return;
    const time = video.currentTime;
    const wasPaused = video.paused;
    const rate = video.playbackRate;
    Object.assign(playback, {
      url: choice.url,
      streamTitle: choice.streamTitle,
      addonName: choice.addonName,
      bingeGroup: choice.bingeGroup || ""
    });
    errorBox.classList.add("is-hidden");
    video.src = playback.url;
    video.addEventListener(
      "loadedmetadata",
      () => {
        video.currentTime = time;
        video.playbackRate = rate;
        if (!wasPaused) video.play().catch(() => {});
      },
      { once: true }
    );
    toast("Switching source…");
  }

  function openInfo() {
    let host = "";
    try {
      host = new URL(playback.url).host;
    } catch (_) {
      host = "";
    }
    const ahead = (() => {
      try {
        for (let i = 0; i < video.buffered.length; i += 1) {
          if (
            video.buffered.start(i) <= video.currentTime &&
            video.buffered.end(i) >= video.currentTime
          ) {
            return `${Math.round(video.buffered.end(i) - video.currentTime)} s`;
          }
        }
      } catch (_) {
        /* ignore */
      }
      return "0 s";
    })();
    const rows = [
      ["Title", playback.name],
      ["Add-on", playback.addonName],
      ["Stream", playback.streamTitle],
      ["Resolution", video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : "Unknown"],
      ["Duration", formatTime(video.duration)],
      ["Buffered ahead", ahead],
      ["Speed", `${video.playbackRate}×`],
      ["Server", host],
      ["Subtitles", activeSubtitle ? activeSubtitle.label : "Off"]
    ].filter(([, value]) => value);
    openPanel(
      h(
        "div.player-modal",
        {},
        panelHeader("Playback Info"),
        h(
          "div.info-table",
          {},
          rows.map(([label, value]) =>
            h("div.info-row", {}, h("span.info-label", {}, label), h("span.info-value", {}, value))
          )
        )
      ),
      { side: "center" }
    );
  }

  // --- Subtitles ------------------------------------------------------------------
  function renderSubtitle() {
    let text = "";
    if (activeSubtitle?.kind === "addon") {
      const index = findCue(cues, video.currentTime - subDelay);
      text = index >= 0 ? cues[index].text : "";
    } else if (activeSubtitle?.kind === "native" && nativeTrack?.activeCues?.length) {
      text = [...nativeTrack.activeCues].map((cue) => cue.text.replace(/<[^>]+>/g, "")).join("\n");
    }
    if (text && pref("subs.stripSdh", false)) text = stripSdh(text);
    if (subtitleText.textContent !== text) subtitleText.textContent = text;
    subtitleText.classList.toggle("is-empty", !text);
  }

  function preferredLanguages() {
    return [pref("subs.lang", ""), pref("subs.lang2", "")].filter(Boolean).map(languageName);
  }

  function nativeTracks() {
    return [...(video.textTracks || [])].filter(
      (track) => track.kind === "subtitles" || track.kind === "captions"
    );
  }

  async function selectSubtitle(entry) {
    if (nativeTrack) nativeTrack.mode = "disabled";
    nativeTrack = null;
    cues = [];
    activeSubtitle = entry;
    subDelay = 0;
    if (!entry) {
      renderSubtitle();
      renderToolbar();
      return;
    }
    writeJSON(SUB_LANG_KEY, { lang: entry.lang });
    if (entry.kind === "native") {
      nativeTrack = entry.track;
      nativeTrack.mode = "hidden";
      nativeTrack.oncuechange = renderSubtitle;
    } else {
      try {
        const url = safeHttpUrl(entry.url);
        if (!url) throw new Error("bad url");
        const response = await fetch(url);
        cues = parseSubtitles(await response.text());
        if (!cues.length) throw new Error("empty");
      } catch (_) {
        toast("Could not load those subtitles");
        activeSubtitle = null;
      }
    }
    renderSubtitle();
    renderToolbar();
  }

  function subtitleEntries() {
    const isForced = (text) => /\bforced\b/i.test(String(text || ""));
    const native = nativeTracks().map((track, i) => ({
      kind: "native",
      id: `native-${i}`,
      lang: track.language || "und",
      label: track.label || languageName(track.language),
      source: "Built-in",
      forced: track.kind === "forced" || isForced(track.label),
      track
    }));
    const addon = subtitles.map((sub, i) => ({
      kind: "addon",
      id: `${sub.id || i}`,
      lang: sub.lang || "und",
      label: languageName(sub.lang),
      source: sub.addonName,
      forced: isForced(sub.id) || isForced(sub.label),
      url: sub.url
    }));
    const all = [...native, ...addon];
    const wanted = preferredLanguages();
    if (pref("subs.preferredOnly", false) && wanted.length) {
      return all.filter((entry) => wanted.includes(languageName(entry.lang)));
    }
    return all;
  }

  function openSubtitlesPanel() {
    const entries = subtitleEntries();
    const byLang = new Map();
    for (const entry of entries) {
      const key = languageName(entry.lang);
      if (!byLang.has(key)) byLang.set(key, []);
      byLang.get(key).push(entry);
    }
    const languages = [...byLang.keys()].sort((a, b) => a.localeCompare(b));
    let selectedLang = activeSubtitle
      ? languageName(activeSubtitle.lang)
      : languages.includes("English")
        ? "English"
        : languages[0];

    const langCol = h("div.subs-col.subs-langs");
    const listCol = h("div.subs-col.subs-list");
    const styleCol = h("div.subs-col.subs-style");

    function drawLangs() {
      fill(
        langCol,
        h("div.subs-col-title", {}, "Languages"),
        h(
          "button.subs-lang",
          {
            type: "button",
            class: !activeSubtitle && selectedLang === null ? "is-selected" : "",
            onclick: () => {
              selectedLang = null;
              selectSubtitle(null).then(drawAll);
            }
          },
          h("span", {}, "None")
        ),
        ...languages.map((lang) =>
          h(
            "button.subs-lang",
            {
              type: "button",
              class: lang === selectedLang ? "is-selected" : "",
              onclick: () => {
                selectedLang = lang;
                drawAll();
              }
            },
            h("span", {}, lang),
            h("span.subs-count", {}, String(byLang.get(lang).length))
          )
        )
      );
    }

    function drawList() {
      const items = byLang.get(selectedLang) || [];
      fill(
        listCol,
        h("div.subs-col-title", {}, "Subtitles"),
        items.length
          ? items.map((entry) =>
              h(
                "button.subs-item",
                {
                  type: "button",
                  class: activeSubtitle?.id === entry.id ? "is-selected" : "",
                  onclick: () => selectSubtitle(entry).then(drawAll)
                },
                h("span.subs-source", {}, entry.source || ""),
                h("span.subs-name", {}, entry.label),
                activeSubtitle?.id === entry.id ? h("span.subs-check", { html: "&#10003;" }) : null
              )
            )
          : h(
              "div.subs-empty",
              {},
              entries.length
                ? "Pick a language"
                : "No subtitles found. Add a subtitles add-on such as OpenSubtitles v3."
            )
      );
    }

    function stepper(value, onMinus, onPlus) {
      return h(
        "div.stepper",
        {},
        h("button.stepper-btn", { type: "button", onclick: onMinus }, "−"),
        h("span.stepper-value", {}, value),
        h("button.stepper-btn", { type: "button", onclick: onPlus }, "+")
      );
    }

    function saveStyle(key, value) {
      setPref(key, value);
      applySubtitleStyle();
      drawStyle();
    }

    function drawStyle() {
      const size = Number(pref("subs.size", 100));
      const bold = !!pref("subs.bold", false);
      const currentColor = pref("subs.color", "#ffffff");
      const bgOpacity = Number(pref("subs.bgOpacity", 0));
      fill(
        styleCol,
        h("div.subs-col-title", {}, "Style"),
        h("div.subs-label", {}, "Subtitle Delay"),
        stepper(
          `${subDelay >= 0 ? "+" : ""}${subDelay.toFixed(3)}s`,
          () => {
            subDelay -= 0.25;
            renderSubtitle();
            drawStyle();
          },
          () => {
            subDelay += 0.25;
            renderSubtitle();
            drawStyle();
          }
        ),
        h(
          "button.subs-reset",
          {
            type: "button",
            onclick: () => {
              subDelay = 0;
              renderSubtitle();
              drawStyle();
            }
          },
          "Reset"
        ),
        h("div.subs-label", {}, "Font Size"),
        stepper(
          `${size}%`,
          () => saveStyle("subs.size", Math.max(60, size - 5)),
          () => saveStyle("subs.size", Math.min(160, size + 5))
        ),
        h("div.subs-label", {}, "Bold"),
        h(
          "button.subs-toggle",
          {
            type: "button",
            class: bold ? "is-on" : "",
            onclick: () => saveStyle("subs.bold", !bold)
          },
          bold ? "On" : "Off"
        ),
        h("div.subs-label", {}, "Color"),
        h(
          "div.swatches",
          {},
          SUB_COLORS.map((color) =>
            h("button.swatch", {
              type: "button",
              "aria-label": color,
              class: currentColor === color ? "is-selected" : "",
              style: { background: color },
              onclick: () => saveStyle("subs.color", color)
            })
          )
        ),
        h("div.subs-label", {}, "Background"),
        stepper(
          `${bgOpacity}%`,
          () => saveStyle("subs.bgOpacity", Math.max(0, bgOpacity - 25)),
          () => saveStyle("subs.bgOpacity", Math.min(100, bgOpacity + 25))
        )
      );
    }

    function drawAll() {
      drawLangs();
      drawList();
      drawStyle();
    }

    drawAll();
    openPanel(
      h(
        "div.subs-panel",
        {},
        h(
          "div.subs-head",
          {},
          h("h2.subs-title", {}, "Subtitles"),
          h("button.player-panel-close", { type: "button", onclick: closePanel }, "Done")
        ),
        h("div.subs-columns", {}, langCol, listCol, styleCol)
      ),
      { side: "full" }
    );
  }

  async function loadSubtitles() {
    try {
      subtitles = await fetchSubtitles(playback.type, playback.videoId);
    } catch (_) {
      subtitles = [];
    }
    if (activeSubtitle) return;
    const entries = subtitleEntries();
    const wanted = preferredLanguages();
    if (!wanted.length) {
      const last = readJSON(SUB_LANG_KEY, { lang: "" }).lang;
      if (last) wanted.push(languageName(last));
    }
    // "Use Forced Subtitles": when the audio is already in your subtitle
    // language, only show forced (signs and foreign dialogue) subtitles.
    if (pref("subs.forced", false) && wanted[0] && audioLanguage() === wanted[0]) {
      const forced = entries.find((e) => e.forced && languageName(e.lang) === wanted[0]);
      if (forced) selectSubtitle(forced);
      return;
    }
    for (const lang of wanted) {
      const match = entries.find((e) => !e.forced && languageName(e.lang) === lang);
      if (match) {
        selectSubtitle(match);
        return;
      }
    }
  }

  // --- Audio tracks (Safari exposes them for HLS and MP4) ------------------------
  function audioTracks() {
    return video.audioTracks ? [...video.audioTracks] : [];
  }

  function audioLanguage() {
    const active = audioTracks().find((t) => t.enabled);
    return active?.language ? languageName(active.language) : "";
  }

  function selectAudio(track) {
    for (const t of audioTracks()) t.enabled = t === track;
    renderToolbar();
  }

  function applyAudioPreference() {
    const tracks = audioTracks();
    if (tracks.length < 2) return;
    for (const lang of [pref("pb.audioLang", ""), pref("pb.audioLang2", "")].filter(Boolean)) {
      const match = tracks.find(
        (t) => t.language && languageName(t.language) === languageName(lang)
      );
      if (match) {
        selectAudio(match);
        return;
      }
    }
  }

  function openAudio() {
    const tracks = audioTracks();
    openPanel(
      h(
        "div.player-panel.is-compact",
        {},
        panelHeader("Audio"),
        h(
          "div.option-list",
          {},
          tracks.map((track, i) =>
            h(
              "button.option",
              {
                type: "button",
                class: track.enabled ? "is-selected" : "",
                onclick: () => {
                  selectAudio(track);
                  closePanel();
                }
              },
              h(
                "span",
                {},
                track.label || (track.language ? languageName(track.language) : `Track ${i + 1}`)
              ),
              track.enabled ? h("span.option-check", { html: "&#10003;" }) : null
            )
          )
        )
      )
    );
  }

  // --- Next episode -----------------------------------------------------------------
  async function loadMeta() {
    if (!playback.metaId) return;
    try {
      meta = await fetchMeta(playback.type, playback.metaId);
    } catch (_) {
      meta = null;
    }
    if (!meta) return;
    if (!playback.description && meta.description && !playback.season)
      playback.description = meta.description;
    if (playback.type === "series") {
      const episodes = seriesEpisodes(meta).filter((v) => v.season > 0);
      const i = episodes.findIndex((v) => v.id === playback.videoId);
      nextVideo = i >= 0 ? episodes[i + 1] || null : null;
      if (nextVideo && !isReleased(nextVideo)) nextVideo = null;
    }
  }

  // Next Up after finishing an episode: the episode after the furthest one
  // watched, or after this one when "Next Up From Furthest Episode" is off.
  function updateNextUp() {
    if (!meta) return;
    const episodes = seriesEpisodes(meta).filter((v) => v.season > 0);
    let index = episodes.findIndex((v) => v.id === playback.videoId);
    if (pref("cw.furthest", true)) {
      const watched = store.watchedSet();
      episodes.forEach((v, i) => {
        if (watched.has(v.id) && i > index) index = i;
      });
    }
    const upNext = index >= 0 ? episodes[index + 1] : null;
    if (!upNext) {
      store.setNextUp(playback.metaId, null);
      return;
    }
    store.setNextUp(playback.metaId, {
      ...episodeContext(meta, upNext),
      released: upNext.released || upNext.firstAired || ""
    });
  }

  // When the Next Episode prompt appears (seconds into the video).
  function thresholdTime() {
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return Infinity;
    if (pref("pb.threshMode", "pct") === "min")
      return Math.max(0, d - Number(pref("pb.threshMin", 2)) * 60);
    return d * (Number(pref("pb.threshPct", 95)) / 100);
  }

  function playNext() {
    if (!nextVideo || !meta) return;
    clearInterval(nextTimer);
    save(true);
    const context = {
      ...episodeContext(meta, nextVideo),
      bingeGroup: pref("pb.binge", true) ? playback.bingeGroup || "" : ""
    };
    openStreams(context, { replace: true });
  }

  function hideNextCard() {
    nextDismissed = true;
    clearInterval(nextTimer);
    nextCard.classList.remove("is-on");
  }

  function checkNext() {
    if (!nextVideo || nextDismissed) return;
    const at = thresholdTime();
    // Start looking for sources a minute before the prompt.
    if (!preloaded && pref("pb.preload", false) && video.currentTime >= at - 60) {
      preloaded = true;
      preloadStreams(playback.type, nextVideo.id);
    }
    if (nextShown || video.currentTime < at) return;
    nextShown = true;
    const auto = pref("pb.autoNext", true);
    let left = NEXT_COUNTDOWN_S;
    const label = h(
      "span.player-next-count",
      {},
      auto ? `Next episode in ${left}` : "Next episode"
    );
    fill(
      nextCard,
      nextVideo.thumbnail ? img(nextVideo.thumbnail, "player-next-img", "") : null,
      h(
        "div.player-next-copy",
        {},
        label,
        h(
          "span.player-next-title",
          {},
          `S${nextVideo.season} E${nextVideo.episode} · ${nextVideo.title || nextVideo.name || ""}`
        )
      ),
      h("button.player-next-play", { type: "button", onclick: playNext }, icon("play", 20), "Play"),
      h(
        "button.player-next-close",
        { type: "button", "aria-label": "Dismiss", onclick: hideNextCard },
        icon("close", 18)
      )
    );
    nextCard.classList.add("is-on");
    if (auto) {
      nextTimer = setInterval(() => {
        if (video.paused) return;
        left -= 1;
        label.textContent = `Next episode in ${left}`;
        if (left <= 0) playNext();
      }, 1000);
    }
  }

  // --- Pause overlay and content rating -------------------------------------------
  function schedulePauseOverlay() {
    clearTimeout(pauseTimer);
    pauseOverlay.classList.remove("is-on");
    if (!video.paused || !pref("pb.pauseOverlay", true)) return;
    pauseTimer = setTimeout(() => {
      if (!video.paused || panelHost.firstChild) return;
      const logo = playback.logo ? img(playback.logo, "player-pause-logo", playback.name) : null;
      fill(
        pauseOverlay,
        h("div.player-pause-kicker", {}, "You're watching"),
        logo || h("div.player-pause-title", {}, playback.name),
        subtitleLabel ? h("div.player-pause-sub", {}, subtitleLabel) : null,
        playback.description && !playback.season
          ? h("p.player-pause-text", {}, playback.description)
          : null
      );
      logo?.addEventListener(
        "error",
        () => logo.replaceWith(h("div.player-pause-title", {}, playback.name)),
        { once: true }
      );
      showControls(false);
      pauseOverlay.classList.add("is-on");
    }, PAUSE_OVERLAY_MS);
  }

  function showRating() {
    if (ratingShown || !pref("pb.parental", true) || !playback.certification) return;
    ratingShown = true;
    fill(
      ratingBadge,
      h("span.player-rating-label", {}, "Rated"),
      h("span.player-rating-value", {}, playback.certification)
    );
    ratingBadge.classList.add("is-on");
    setTimeout(() => ratingBadge.classList.remove("is-on"), 6000);
  }

  // --- Video events ---------------------------------------------------------------
  let resumed = false;
  video.addEventListener("loadedmetadata", () => {
    setLoading("Loading video…");
    // Resume where this movie or episode stopped, whichever source played it.
    if (!resumed && saved && saved.time > 5 && saved.time < video.duration - 10) {
      video.currentTime = saved.time;
    }
    resumed = true;
    applyAudioPreference();
    renderToolbar();
    syncTime();
  });
  video.addEventListener("timeupdate", () => {
    syncTime();
    save(false);
    checkNext();
  });
  video.addEventListener("progress", syncTime);
  video.addEventListener("play", () => {
    syncPlayState();
    schedulePauseOverlay();
    wake();
  });
  video.addEventListener("pause", () => {
    syncPlayState();
    save(true);
    schedulePauseOverlay();
    wake();
  });
  video.addEventListener("ended", () => {
    save(true);
    if (nextVideo && !nextDismissed && pref("pb.autoNext", true)) playNext();
  });
  video.addEventListener("waiting", () => {
    setLoading("Buffering…");
    spinner.classList.add("is-on");
  });
  video.addEventListener("playing", () => {
    spinner.classList.remove("is-on");
    showRating();
  });
  video.addEventListener("canplay", () => spinner.classList.remove("is-on"));
  video.addEventListener("ratechange", syncTime);
  // A source that won't play: quietly try the next one Safari can play
  // (up to three), before showing the error.
  const triedUrls = new Set([playback.url]);
  let fallbacks = 0;
  async function tryNextSource() {
    if (fallbacks >= 3) return false;
    fallbacks += 1;
    spinner.classList.add("is-on");
    setLoading("That source didn't play. Trying another…");
    const groups = [];
    await fetchStreams(playback.type, playback.videoId, (g) => groups.push(g)).catch(() => {});
    const order = (g) => (g.addon.manifest?.name === playback.addonName ? 0 : 1);
    const next = groups
      .sort((a, b) => order(a) - order(b))
      .flatMap((g) => g.streams.map((stream) => ({ stream, addon: g.addon })))
      .find(
        ({ stream }) =>
          safeHttpUrl(stream.url) &&
          !triedUrls.has(safeHttpUrl(stream.url)) &&
          playability(stream) !== "external"
      );
    if (!next) return false;
    const choice = choiceFor(next);
    triedUrls.add(choice.url);
    toast(`Trying ${choice.addonName}: ${choice.streamTitle}`.slice(0, 90));
    switchSource(choice);
    video.play().catch(() => {});
    return true;
  }

  video.addEventListener("error", async () => {
    if (!video.getAttribute("src")) return;
    if (!errorBox.classList.contains("is-hidden")) return;
    if (await tryNextSource()) return;
    spinner.classList.remove("is-on");
    errorBox.classList.remove("is-hidden");
    fill(
      errorBox,
      h("div.player-error-title", {}, "Safari can't play this stream"),
      h(
        "div.player-error-text",
        {},
        "This is usually an MKV file or an unsupported codec. Open it in a player app, or pick another source."
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
        ),
        h("button.pill-button.is-ghost", { type: "button", onclick: openSources }, "Other sources")
      )
    );
    showControls(true);
  });

  // Keyboard (iPad keyboards and Bluetooth remotes).
  const onKey = (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowLeft") seekBy(-10);
    else if (event.key === "ArrowRight") seekBy(10);
    else if (event.key === "Escape" && panelHost.firstChild) closePanel();
  };
  document.addEventListener("keydown", onKey);

  // Lock screen / Control Center controls.
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: subtitleLabel ? `${playback.name} · ${subtitleLabel}` : playback.name,
        artwork:
          playback.poster && /^https?:/.test(playback.poster)
            ? [{ src: playback.poster, sizes: "300x450" }]
            : []
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => seekBy(10));
    } catch (_) {
      /* ignore */
    }
  }

  applySubtitleStyle();
  const onPrefChange = (event) => {
    if (String(event.detail?.key || "").startsWith("subs.") || event.detail?.key === "*")
      applySubtitleStyle();
  };
  window.addEventListener("nuvio:pref", onPrefChange);
  renderToolbar();
  syncPlayState();
  setLoading("Connecting to the stream…");
  spinner.classList.add("is-on");
  writeJSON(LAST_PLAYER_KEY, {
    ...playback,
    stream: undefined,
    profileId: store.activeProfileId,
    at: Date.now()
  });
  video.src = playback.url;
  video.play().catch(() => {
    /* autoplay may need a tap; the play button is shown */
  });
  wake();
  loadSubtitles();
  loadMeta();

  return {
    el: root,
    destroy() {
      save(true);
      clearTimeout(hideTimer);
      clearTimeout(pauseTimer);
      clearInterval(nextTimer);
      window.removeEventListener("nuvio:pref", onPrefChange);
      try {
        localStorage.removeItem(LAST_PLAYER_KEY);
      } catch (_) {
        /* ignore */
      }
      document.removeEventListener("keydown", onKey);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };
}
