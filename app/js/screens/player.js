import { h, icon, safeHttpUrl, fill } from "../dom.js";
import { back } from "../router.js";
import { store } from "../store.js";
import { toast } from "../sheet.js";
import { fetchSubtitles } from "../addons.js";
import { createStreamList } from "../streamlist.js";
import { parseSubtitles, findCue, languageName } from "../subtitles.js";
import { takePlayback, externalPlayerLinks, copyLink, openExternalSheet } from "./streams.js";

const SAVE_EVERY_MS = 5000;
const HIDE_AFTER_MS = 3500;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FITS = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
  { value: "fill", label: "Stretch" }
];
const SUB_COLORS = ["#ffffff", "#ffd84d", "#4de3ff", "#ff6b81", "#22d37c", "#b75aff", "#ff8a3d"];
const SUB_STYLE_KEY = "nuvioTouch.subtitleStyle";
const SUB_LANG_KEY = "nuvioTouch.subtitleLanguage";

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
  const errorBox = h("div.player-error.is-hidden");
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
  root.append(video, subtitleText, scrim, chrome, spinner, errorBox, unlockButton, panelHost);

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
  const subStyle = readJSON(SUB_STYLE_KEY, {
    size: 30,
    color: "#ffffff",
    background: 0,
    bold: false
  });
  let subDelay = 0;

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
    fill(toolbar, ...items);
  }

  function applySubtitleStyle() {
    subtitleText.style.fontSize = `${subStyle.size}px`;
    subtitleText.style.color = subStyle.color;
    subtitleText.style.fontWeight = subStyle.bold ? "700" : "500";
    subtitleText.style.setProperty("--sub-bg", `rgba(0, 0, 0, ${subStyle.background})`);
    subtitleText.classList.toggle("has-bg", subStyle.background > 0);
  }

  // --- Controls visibility ------------------------------------------------------
  function showControls(visible) {
    root.classList.toggle("controls-visible", visible && !locked);
  }

  function wake() {
    if (locked) return;
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

  let lastTap = 0;
  scrim.addEventListener("click", (event) => {
    if (locked) {
      unlockButton.classList.add("is-shown");
      setTimeout(() => unlockButton.classList.remove("is-shown"), 2500);
      return;
    }
    const now = Date.now();
    const third = event.clientX / window.innerWidth;
    if (now - lastTap < 300 && (third < 0.33 || third > 0.67)) {
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
      store.removeProgress(playback.videoId);
      store.setWatched(playback.videoId, true);
      if (!playback.season) store.setWatched(playback.metaId, true);
      return;
    }
    if (video.currentTime < 5) return;
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
      onExternal: (url) => openExternalSheet(url)
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
      addonName: choice.addonName
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
    if (subtitleText.textContent !== text) subtitleText.textContent = text;
    subtitleText.classList.toggle("is-empty", !text);
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
    const native = nativeTracks().map((track, i) => ({
      kind: "native",
      id: `native-${i}`,
      lang: track.language || "und",
      label: track.label || languageName(track.language),
      source: "Built-in",
      track
    }));
    const addon = subtitles.map((sub, i) => ({
      kind: "addon",
      id: `${sub.id || i}`,
      lang: sub.lang || "und",
      label: languageName(sub.lang),
      source: sub.addonName,
      url: sub.url
    }));
    return [...native, ...addon];
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

    function saveStyle() {
      writeJSON(SUB_STYLE_KEY, subStyle);
      applySubtitleStyle();
      drawStyle();
    }

    function drawStyle() {
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
          `${subStyle.size}`,
          () => {
            subStyle.size = Math.max(16, subStyle.size - 2);
            saveStyle();
          },
          () => {
            subStyle.size = Math.min(60, subStyle.size + 2);
            saveStyle();
          }
        ),
        h("div.subs-label", {}, "Bold"),
        h(
          "button.subs-toggle",
          {
            type: "button",
            class: subStyle.bold ? "is-on" : "",
            onclick: () => {
              subStyle.bold = !subStyle.bold;
              saveStyle();
            }
          },
          subStyle.bold ? "On" : "Off"
        ),
        h("div.subs-label", {}, "Color"),
        h(
          "div.swatches",
          {},
          SUB_COLORS.map((color) =>
            h("button.swatch", {
              type: "button",
              "aria-label": color,
              class: subStyle.color === color ? "is-selected" : "",
              style: { background: color },
              onclick: () => {
                subStyle.color = color;
                saveStyle();
              }
            })
          )
        ),
        h("div.subs-label", {}, "Background"),
        stepper(
          `${Math.round(subStyle.background * 100)}%`,
          () => {
            subStyle.background = Math.max(0, Math.round((subStyle.background - 0.25) * 100) / 100);
            saveStyle();
          },
          () => {
            subStyle.background = Math.min(1, Math.round((subStyle.background + 0.25) * 100) / 100);
            saveStyle();
          }
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
    const preferred = readJSON(SUB_LANG_KEY, { lang: "" }).lang;
    if (preferred && !activeSubtitle) {
      const match = subtitleEntries().find(
        (entry) => languageName(entry.lang) === languageName(preferred)
      );
      if (match) selectSubtitle(match);
    }
  }

  // --- Video events ---------------------------------------------------------------
  video.addEventListener("loadedmetadata", () => {
    if (saved?.url === playback.url && saved.time > 5 && saved.time < video.duration - 10) {
      video.currentTime = saved.time;
    }
    syncTime();
  });
  video.addEventListener("timeupdate", () => {
    syncTime();
    save(false);
  });
  video.addEventListener("progress", syncTime);
  video.addEventListener("play", () => {
    syncPlayState();
    wake();
  });
  video.addEventListener("pause", () => {
    syncPlayState();
    save(true);
    wake();
  });
  video.addEventListener("ended", () => save(true));
  video.addEventListener("waiting", () => spinner.classList.add("is-on"));
  video.addEventListener("playing", () => spinner.classList.remove("is-on"));
  video.addEventListener("canplay", () => spinner.classList.remove("is-on"));
  video.addEventListener("ratechange", syncTime);
  video.addEventListener("error", () => {
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
  renderToolbar();
  syncPlayState();
  spinner.classList.add("is-on");
  video.src = playback.url;
  video.play().catch(() => {
    /* autoplay may need a tap; the play button is shown */
  });
  wake();
  loadSubtitles();

  return {
    el: root,
    destroy() {
      save(true);
      clearTimeout(hideTimer);
      document.removeEventListener("keydown", onKey);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };
}
