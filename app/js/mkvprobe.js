// Reads the start of a stream to see (1) whether this app may read the file
// itself (CORS) and (2) which video/audio/subtitle formats an MKV holds.
// Used to judge whether an in-app MKV repackager can play it.

const PROBE_BYTES = 512 * 1024;

const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackType: 0x83,
  CodecID: 0x86,
  Language: 0x22b59c,
  Name: 0x536e,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675
};
const TRACK_TYPES = { 1: "video", 2: "audio", 17: "subtitle" };

// Safari can take these out of the MKV box as they are.
const SAFARI_OK = {
  "V_MPEG4/ISO/AVC": "H.264",
  "V_MPEGH/ISO/HEVC": "HEVC (H.265)",
  V_AV1: "AV1 (newer iPads only)",
  V_VP9: "VP9",
  A_AAC: "AAC",
  "A_AAC/MPEG4/LC": "AAC",
  "A_AAC/MPEG2/LC": "AAC",
  A_AC3: "Dolby Digital (AC3)",
  A_EAC3: "Dolby Digital Plus (E-AC3)",
  A_FLAC: "FLAC",
  A_OPUS: "Opus",
  A_MPEG_L3: "MP3",
  "S_TEXT/UTF8": "Text (SRT)",
  "S_TEXT/WEBVTT": "Text (WebVTT)",
  "S_TEXT/ASS": "Styled (ASS)",
  "S_TEXT/SSA": "Styled (SSA)"
};
const NOT_OK = {
  A_DTS: "DTS",
  "A_DTS/LOSSLESS": "DTS-HD",
  A_TRUEHD: "Dolby TrueHD",
  "A_PCM/INT/LIT": "PCM",
  V_MPEG2: "MPEG-2",
  "V_MS/VFW/FOURCC": "Old AVI codec (XviD/DivX)",
  "S_HDMV/PGS": "Picture subtitles (PGS)",
  S_VOBSUB: "Picture subtitles (VobSub)"
};

function readVint(bytes, pos, keepMarker) {
  const first = bytes[pos];
  if (first === undefined) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) {
    length += 1;
    mask >>= 1;
  }
  if (length > 8 || pos + length > bytes.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[pos + i];
    if (bytes[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readElement(bytes, pos) {
  const id = readVint(bytes, pos, true);
  if (!id) return null;
  const size = readVint(bytes, pos + id.length, false);
  if (!size) return null;
  const start = pos + id.length + size.length;
  const end = size.unknown ? bytes.length : Math.min(bytes.length, start + size.value);
  return { id: id.value, start, end, next: size.unknown ? bytes.length : start + size.value };
}

function children(bytes, start, end, visit) {
  let pos = start;
  while (pos < end) {
    const el = readElement(bytes, pos);
    if (!el || el.start > end) break;
    if (visit(el) === false) return false;
    pos = el.next;
  }
  return true;
}

const text = (bytes, el) =>
  new TextDecoder().decode(bytes.subarray(el.start, el.end)).replace(/\0+$/, "");
const uint = (bytes, el) => {
  let v = 0;
  for (let i = el.start; i < el.end; i += 1) v = v * 256 + bytes[i];
  return v;
};

export function parseMkvHeader(bytes) {
  const out = { docType: "", tracks: [], complete: false };
  const top = readElement(bytes, 0);
  if (!top || top.id !== ID.EBML) return null;
  children(bytes, top.start, top.end, (el) => {
    if (el.id === ID.DocType) out.docType = text(bytes, el);
  });
  const seg = readElement(bytes, top.next);
  if (!seg || seg.id !== ID.Segment) return out;
  children(bytes, seg.start, seg.end, (el) => {
    if (el.id === ID.Cluster) return false;
    if (el.id !== ID.Tracks) return true;
    out.complete = el.next <= bytes.length;
    children(bytes, el.start, el.end, (entry) => {
      if (entry.id !== ID.TrackEntry) return;
      const track = { type: "", codec: "", language: "", name: "", width: 0, height: 0 };
      children(bytes, entry.start, entry.end, (f) => {
        if (f.id === ID.TrackType) track.type = TRACK_TYPES[uint(bytes, f)] || "other";
        else if (f.id === ID.CodecID) track.codec = text(bytes, f);
        else if (f.id === ID.Language) track.language = text(bytes, f);
        else if (f.id === ID.Name) track.name = text(bytes, f);
        else if (f.id === ID.Video)
          children(bytes, f.start, f.end, (v) => {
            if (v.id === ID.PixelWidth) track.width = uint(bytes, v);
            if (v.id === ID.PixelHeight) track.height = uint(bytes, v);
          });
      });
      out.tracks.push(track);
    });
    return false;
  });
  return out;
}

export function describeCodec(codec) {
  if (SAFARI_OK[codec]) return { label: SAFARI_OK[codec], ok: true };
  if (NOT_OK[codec]) return { label: NOT_OK[codec], ok: false };
  return { label: codec || "Unknown", ok: null };
}

// Returns { readable, status, host, contentType, error, mkv }.
export async function probeStream(url) {
  const result = { readable: false, status: 0, host: "", contentType: "", error: "", mkv: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}` }
    });
    result.status = response.status;
    result.readable = true;
    result.contentType = response.headers.get("content-type") || "";
    try {
      result.host = new URL(response.url || url).host;
    } catch (_) {
      /* ignore */
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < PROBE_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel().catch(() => {});
    const bytes = new Uint8Array(Math.min(total, PROBE_BYTES));
    let offset = 0;
    for (const c of chunks) {
      const part = c.subarray(0, Math.max(0, bytes.length - offset));
      bytes.set(part, offset);
      offset += part.length;
    }
    result.mkv = parseMkvHeader(bytes);
    result.supportsRange = result.status === 206;
  } catch (error) {
    result.error = error.name === "AbortError" ? "timed out" : String(error.message || error);
    try {
      result.host = new URL(url).host;
    } catch (_) {
      /* ignore */
    }
  } finally {
    clearTimeout(timer);
  }
  return result;
}
