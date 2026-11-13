// In-app MKV repackager. Safari can't open MKV files, but most of them hold
// video and audio it plays fine (H.264/HEVC with AAC or Dolby Digital). This
// reads the MKV over the network piece by piece, rewraps the same video and
// audio into MP4 fragments (nothing is re-encoded, so it's light on the
// battery) and feeds them to Safari's media engine. Seeking jumps straight to
// the nearest keyframe and continues from there.
//
// Needs the file's host to allow this page to read it (CORS). When it doesn't,
// openMkv() throws a RemuxError with kind "blocked" and the player falls back
// to handing the link to Safari directly.

const MS = window.ManagedMediaSource || window.MediaSource;
const AHEAD_S = 75; // read at most this far ahead of the playhead
const BEHIND_S = 40; // drop what's this far behind, to keep memory low
const FRAGMENT_S = 2;

let lib = null;
const loadLib = () => (lib ||= import("../vendor/mediabunny.min.mjs"));

export class RemuxError extends Error {
  constructor(kind, message) {
    super(message);
    // "blocked" (host refuses), "unsupported" (formats this device can't
    // play: stop here), "failed" (couldn't read it: try the normal way)
    this.kind = kind;
  }
}

// Your stream relay (relay/stream-worker.js on Cloudflare): fetches the file
// and adds the header that lets the app read it, for hosts like TorBox that
// don't send it. Only video is relayed, and only for this app's site.
export const DEFAULT_STREAM_RELAY = "https://nuvio-relay.nuvio-ff2c9472.workers.dev";
export function relayed(url, relayBase = DEFAULT_STREAM_RELAY) {
  const base = String(relayBase || "").replace(/\/+$/, "");
  return /^https:\/\/[^\s/?#]+$/.test(base) ? `${base}/?u=${encodeURIComponent(url)}` : "";
}

export const remuxAvailable = () =>
  !!MS && typeof WritableStream !== "undefined" && typeof MS.isTypeSupported === "function";

const CODEC_LABEL = {
  avc: "H.264",
  hevc: "HEVC (H.265)",
  av1: "AV1",
  vp9: "VP9",
  vp8: "VP8",
  aac: "AAC",
  ac3: "Dolby Digital",
  eac3: "Dolby Digital Plus",
  opus: "Opus",
  flac: "FLAC",
  mp3: "MP3",
  vorbis: "Vorbis",
  dts: "DTS",
  truehd: "Dolby TrueHD"
};
const label = (codec) => CODEC_LABEL[codec] || String(codec || "an unknown format").toUpperCase();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mimeFor(videoCodec, audioCodec) {
  return `video/mp4; codecs="${[videoCodec, audioCodec].filter(Boolean).join(",")}"`;
}

// Opens the file and checks what's inside. Resolves to a handle for play().
export async function openMkv(url) {
  if (!remuxAvailable()) throw new RemuxError("unsupported", "This browser can't repackage MKVs.");
  const mb = await loadLib();
  const input = new mb.Input({
    source: new mb.UrlSource(url, {
      parallelism: 2,
      maxCacheSize: 48 * 1024 * 1024,
      // Don't retry forever on a host that refuses us.
      getRetryDelay: (attempts) => (attempts < 2 ? 1 : null)
    }),
    formats: [mb.MATROSKA]
  });
  let video;
  let audioTracks;
  let duration;
  try {
    video = await input.getPrimaryVideoTrack();
    audioTracks = await input.getAudioTracks();
    duration = await input.computeDuration();
  } catch (error) {
    input.dispose?.();
    const text = String(error?.message || error);
    // Not readable as MKV here: let Safari try the link the normal way.
    if (/not.*(recogni|support)|unsupported|format/i.test(text))
      throw new RemuxError("failed", "This file couldn't be read as an MKV.");
    // A fetch that fails outright from another site is almost always CORS.
    throw new RemuxError("blocked", "This host doesn't let the app read the file.");
  }
  if (!video) {
    input.dispose?.();
    throw new RemuxError("failed", "No video track could be read.");
  }
  const videoCodec = await video.getCodecParameterString().catch(() => null);
  if (!videoCodec || !MS.isTypeSupported(mimeFor(videoCodec))) {
    input.dispose?.();
    throw new RemuxError(
      "unsupported",
      `This file's video is ${label(video.codec)}, which this device can't play.`
    );
  }
  const audio = [];
  for (const track of audioTracks) {
    const codec = await track.getCodecParameterString().catch(() => null);
    audio.push({
      track,
      id: track.id,
      codec: track.codec,
      codecString: codec,
      language: track.languageCode || "",
      name: track.name || "",
      playable: !!codec && MS.isTypeSupported(mimeFor(videoCodec, codec))
    });
  }
  if (audio.length && !audio.some((a) => a.playable)) {
    input.dispose?.();
    const kinds = [...new Set(audio.map((a) => label(a.codec)))].join(" and ");
    throw new RemuxError("unsupported", `This file's audio is ${kinds}, which Safari can't play.`);
  }
  return { mb, input, url, video, videoCodec, audio, duration: Number(duration) || 0 };
}

// Picks the audio track: the preferred language if it can play, otherwise the
// file's default, otherwise the first one that plays.
export function chooseAudio(handle, preferredLang = "") {
  const playable = handle.audio.filter((a) => a.playable);
  const want = String(preferredLang || "")
    .toLowerCase()
    .slice(0, 2);
  return (
    (want && playable.find((a) => a.language.toLowerCase().startsWith(want))) ||
    playable.find((a) => a.track.disposition?.default) ||
    playable[0] ||
    null
  );
}

// Starts playback of an opened MKV in `videoEl`. Returns a controller.
export function play(handle, videoEl, { startAt = 0, audioId = null, onError } = {}) {
  const { mb, input, video } = handle;
  let audio = handle.audio.find((a) => a.id === audioId && a.playable) || chooseAudio(handle);
  let mime = mimeFor(handle.videoCodec, audio?.codecString);
  const source = new MS();
  const objectUrl = URL.createObjectURL(source);
  let sourceBuffer = null;
  let generation = 0; // bumps on every seek restart; old loops stop
  let destroyed = false;
  let reachedEnd = false;
  let readHead = 0; // how far (in seconds) the current read has appended

  // ManagedMediaSource (iPhone/iPad) plays only when AirPlay is off for the
  // element or an AirPlay alternative is given; we have none for MKVs.
  if (window.ManagedMediaSource) videoEl.disableRemotePlayback = true;
  videoEl.src = objectUrl;

  const fail = (error) => {
    if (destroyed) return;
    destroyed = true;
    onError?.(error);
  };

  const idle = () =>
    sourceBuffer.updating
      ? new Promise((r) => sourceBuffer.addEventListener("updateend", r, { once: true }))
      : Promise.resolve();

  const bufferedAt = (t) => {
    const b = videoEl.buffered;
    for (let i = 0; i < b.length; i += 1) if (b.start(i) - 0.3 <= t && t < b.end(i)) return true;
    return false;
  };

  async function trimBehind() {
    const cut = videoEl.currentTime - BEHIND_S;
    const b = sourceBuffer.buffered;
    if (cut <= 0 || !b.length || b.start(0) >= cut) return;
    await idle();
    sourceBuffer.remove(0, cut);
    await idle();
  }

  async function append(data, gen) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (gen !== generation || destroyed) return;
      await idle();
      try {
        sourceBuffer.appendBuffer(data);
        await idle();
        return;
      } catch (error) {
        if (error?.name !== "QuotaExceededError") throw error;
        // Full: drop what's behind the playhead and wait for playback to move on.
        await trimBehind().catch(() => {});
        await sleep(1000);
      }
    }
  }

  // Reads from the keyframe at or before `from` onwards and appends.
  async function run(from) {
    const gen = ++generation;
    reachedEnd = false;
    await idle();
    if (gen !== generation || destroyed) return;
    if (source.readyState === "open") sourceBuffer.abort();
    const videoSink = new mb.EncodedPacketSink(video);
    const key =
      (await videoSink.getKeyPacket(from, { verifyKeyPackets: true })) ||
      (await videoSink.getFirstKeyPacket());
    if (!key || gen !== generation) return;
    const base = key.timestamp;
    readHead = base;
    sourceBuffer.timestampOffset = base;

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({
        fastStart: "fragmented",
        minimumFragmentDuration: FRAGMENT_S
      }),
      target: new mb.StreamTarget(new WritableStream({ write: (chunk) => append(chunk.data, gen) }))
    });
    const videoOut = new mb.EncodedVideoPacketSource(video.codec);
    output.addVideoTrack(videoOut);
    let audioOut = null;
    let audioIter = null;
    if (audio) {
      audioOut = new mb.EncodedAudioPacketSource(audio.codec);
      output.addAudioTrack(audioOut, { languageCode: audio.language || undefined });
      const audioSink = new mb.EncodedPacketSink(audio.track);
      const first = (await audioSink.getPacket(base)) || (await audioSink.getFirstPacket());
      audioIter = first ? audioSink.packets(first) : null;
    }
    await output.start();
    const videoIter = videoSink.packets(key);
    const videoConfig = await video.getDecoderConfig();
    const audioConfig = audio ? await audio.track.getDecoderConfig() : null;
    let v = await videoIter.next();
    let a = audioIter ? await audioIter.next() : { done: true };
    let firstVideo = true;
    let firstAudio = true;

    while (!v.done || !a.done) {
      if (gen !== generation || destroyed) {
        output.cancel().catch(() => {});
        return;
      }
      const takeVideo = !v.done && (a.done || v.value.timestamp <= a.value.timestamp);
      const packet = takeVideo ? v.value : a.value;
      // Far enough ahead: wait for the playhead (or a seek) before reading on.
      while (packet.timestamp - videoEl.currentTime > AHEAD_S && gen === generation && !destroyed) {
        await trimBehind().catch(() => {});
        await sleep(500);
      }
      if (gen !== generation || destroyed) continue;
      // Pictures/audio from before the keyframe can't be shown from here on.
      if (packet.timestamp < base - 0.0005) {
        if (takeVideo) v = await videoIter.next();
        else a = await audioIter.next();
        continue;
      }
      const shifted = packet.clone({ timestamp: packet.timestamp - base });
      readHead = Math.max(readHead, packet.timestamp);
      if (takeVideo) {
        await videoOut.add(shifted, firstVideo ? { decoderConfig: videoConfig } : undefined);
        firstVideo = false;
        v = await videoIter.next();
      } else {
        await audioOut.add(shifted, firstAudio ? { decoderConfig: audioConfig } : undefined);
        firstAudio = false;
        a = await audioIter.next();
      }
    }
    await output.finalize();
    if (gen !== generation || destroyed) return;
    await idle();
    reachedEnd = true;
    if (source.readyState === "open") source.endOfStream();
  }

  const start = (from) =>
    run(from).catch((error) => {
      if (!destroyed) fail(error);
    });

  // Seeking somewhere that isn't loaded: restart reading from there.
  const onSeeking = () => {
    if (destroyed || !sourceBuffer) return;
    if (!bufferedAt(videoEl.currentTime)) start(videoEl.currentTime);
  };
  videoEl.addEventListener("seeking", onSeeking);
  // iPhone/iPad may drop buffered video when memory is tight. If the reader
  // has already gone well past a spot that's no longer loaded, the data was
  // dropped (not just slow to arrive): read it again from the playhead.
  let lastRecover = 0;
  const aheadOf = (t) => {
    const b = videoEl.buffered;
    for (let i = 0; i < b.length; i += 1)
      if (b.start(i) - 0.3 <= t && t < b.end(i)) return b.end(i) - t;
    return 0;
  };
  const checkGap = () => {
    if (destroyed || !sourceBuffer || videoEl.seeking || videoEl.paused) return;
    const t = videoEl.currentTime;
    if (aheadOf(t) > 0.6 || readHead < t + 3 || Date.now() - lastRecover < 4000) return;
    lastRecover = Date.now();
    start(t);
  };
  const onWaiting = () => checkGap();
  videoEl.addEventListener("waiting", onWaiting);
  const gapTimer = setInterval(checkGap, 1500);
  // Started part-way in (resume): make sure the playhead is where the data is.
  if (startAt > 0)
    videoEl.addEventListener(
      "loadedmetadata",
      () => {
        if (videoEl.currentTime + 1 < startAt) videoEl.currentTime = startAt;
      },
      { once: true }
    );

  source.addEventListener(
    "sourceopen",
    () => {
      try {
        if (handle.duration > 0) source.duration = handle.duration;
        sourceBuffer = source.addSourceBuffer(mime);
        sourceBuffer.mode = "segments";
        start(Math.max(0, startAt));
      } catch (error) {
        fail(error);
      }
    },
    { once: true }
  );

  return {
    get audioTracks() {
      return handle.audio.map((a) => ({
        id: a.id,
        language: a.language,
        name: a.name,
        codec: label(a.codec),
        playable: a.playable,
        selected: a === audio
      }));
    },
    // Switch the audio track: restart from the current spot with the new one.
    async setAudio(id) {
      const next = handle.audio.find((a) => a.id === id && a.playable);
      if (!next || next === audio || !sourceBuffer) return;
      audio = next;
      const nextMime = mimeFor(handle.videoCodec, audio.codecString);
      await idle();
      if (nextMime !== mime && sourceBuffer.changeType) sourceBuffer.changeType(nextMime);
      mime = nextMime;
      const at = videoEl.currentTime;
      await idle();
      sourceBuffer.remove(0, Infinity);
      await idle();
      start(at);
      videoEl.currentTime = at;
    },
    get ended() {
      return reachedEnd;
    },
    destroy() {
      destroyed = true;
      generation += 1;
      videoEl.removeEventListener("seeking", onSeeking);
      videoEl.removeEventListener("waiting", onWaiting);
      clearInterval(gapTimer);
      input.dispose?.();
      URL.revokeObjectURL(objectUrl);
    }
  };
}
