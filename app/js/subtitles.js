// Subtitle parsing and language names.
const LANGUAGE_FALLBACK = {
  eng: "English",
  spa: "Spanish",
  fre: "French",
  fra: "French",
  ger: "German",
  deu: "German",
  ita: "Italian",
  por: "Portuguese",
  pob: "Portuguese (Brazil)",
  rus: "Russian",
  ara: "Arabic",
  chi: "Chinese",
  zho: "Chinese",
  jpn: "Japanese",
  kor: "Korean",
  hin: "Hindi",
  tur: "Turkish",
  pol: "Polish",
  dut: "Dutch",
  nld: "Dutch",
  swe: "Swedish",
  nor: "Norwegian",
  dan: "Danish",
  fin: "Finnish",
  gre: "Greek",
  ell: "Greek",
  heb: "Hebrew",
  hun: "Hungarian",
  cze: "Czech",
  ces: "Czech",
  rum: "Romanian",
  ron: "Romanian",
  bul: "Bulgarian",
  hrv: "Croatian",
  srp: "Serbian",
  bos: "Bosnian",
  slv: "Slovenian",
  slo: "Slovak",
  slk: "Slovak",
  ukr: "Ukrainian",
  per: "Persian",
  fas: "Persian",
  vie: "Vietnamese",
  tha: "Thai",
  ind: "Indonesian",
  may: "Malay",
  msa: "Malay"
};

let displayNames = null;
try {
  displayNames = new Intl.DisplayNames(["en"], { type: "language" });
} catch (_) {
  displayNames = null;
}

export function languageName(code) {
  const key = String(code || "").toLowerCase();
  if (!key) return "Unknown";
  if (LANGUAGE_FALLBACK[key]) return LANGUAGE_FALLBACK[key];
  try {
    const name = displayNames?.of(key);
    if (name && name.toLowerCase() !== key) return name;
  } catch (_) {
    /* not a known code */
  }
  return key.toUpperCase();
}

function toSeconds(stamp) {
  const match = String(stamp)
    .trim()
    .match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/);
  if (!match) return NaN;
  const [, hours = "0", minutes, seconds, millis] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, "0")) / 1000
  );
}

function cleanText(text) {
  return text
    .replace(/<\/?(i|b|u|font)[^>]*>/gi, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Parses SRT and WebVTT into [{ start, end, text }], sorted by start.
export function parseSubtitles(source) {
  const cues = [];
  const blocks = String(source || "")
    .replace(/\r/g, "")
    .replace(/^﻿/, "")
    .split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [startText, endText] = lines[timingIndex].split("-->");
    const start = toSeconds(startText);
    const end = toSeconds(endText);
    const text = cleanText(lines.slice(timingIndex + 1).join("\n"));
    if (Number.isFinite(start) && Number.isFinite(end) && text) cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

// Index of the cue showing at time t, or -1.
export function findCue(cues, t) {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].end < t) lo = mid + 1;
    else if (cues[mid].start > t) hi = mid - 1;
    else return mid;
  }
  return -1;
}

// "Strip SDH": drop [sound effects], (music), ♪ lines and SPEAKER: labels.
export function stripSdh(text) {
  return String(text || "")
    .split("\n")
    .map((line) =>
      line
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/^\s*-?\s*[A-Z][A-Z0-9 .'-]{1,30}:\s*/, (m) =>
          m.trim().startsWith("-") ? "- " : ""
        )
        .replace(/[♪♫]+/g, "")
        .trim()
    )
    .filter((line) => line && line !== "-")
    .join("\n");
}

// ASS/SSA: "Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text".
// Styling is dropped; \N line breaks and {\tags} are handled.
function parseAss(source) {
  const cues = [];
  let format = null;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (/^Format:/i.test(line) && !format) {
      const fields = line
        .slice(7)
        .split(",")
        .map((f) => f.trim().toLowerCase());
      if (fields.includes("text")) format = fields;
      continue;
    }
    if (!/^Dialogue:/i.test(line)) continue;
    const fields = format || [
      "layer",
      "start",
      "end",
      "style",
      "name",
      "marginl",
      "marginr",
      "marginv",
      "effect",
      "text"
    ];
    const parts = line.slice(9).split(",");
    const textIndex = fields.indexOf("text");
    const head = parts.slice(0, textIndex);
    const text = parts.slice(textIndex).join(",");
    const start = toSeconds(head[fields.indexOf("start")]);
    const end = toSeconds(head[fields.indexOf("end")]);
    const clean = text
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ")
      .trim();
    // Skip drawing commands and empty sign layers
    if (Number.isFinite(start) && Number.isFinite(end) && clean && !/^m\s+-?\d/.test(clean))
      cues.push({ start, end, text: clean });
  }
  // Merge lines shown at the same time (ASS often splits them)
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const cue of cues) {
    const last = merged[merged.length - 1];
    if (last && last.start === cue.start && last.end === cue.end) {
      if (!last.text.split("\n").includes(cue.text)) last.text += `\n${cue.text}`;
    } else merged.push({ ...cue });
  }
  return merged;
}

// Any supported subtitle text (SRT, WebVTT, ASS/SSA) to cues.
export function parseAnySubtitles(source) {
  const text = String(source || "")
    .replace(/\r/g, "")
    .replace(/^﻿/, "");
  if (/^\s*\[Script Info\]/i.test(text) || /^Dialogue:/im.test(text)) return parseAss(text);
  return parseSubtitles(text);
}

// Older subtitle files are often not UTF-8. Guess the legacy code page from
// the language when UTF-8 decoding fails.
const LEGACY_ENCODINGS = {
  ara: "windows-1256",
  per: "windows-1256",
  fas: "windows-1256",
  urd: "windows-1256",
  rus: "windows-1251",
  ukr: "windows-1251",
  bul: "windows-1251",
  srp: "windows-1251",
  mac: "windows-1251",
  bel: "windows-1251",
  gre: "windows-1253",
  ell: "windows-1253",
  tur: "windows-1254",
  heb: "windows-1255",
  pol: "windows-1250",
  cze: "windows-1250",
  ces: "windows-1250",
  slo: "windows-1250",
  slk: "windows-1250",
  hun: "windows-1250",
  hrv: "windows-1250",
  rum: "windows-1250",
  ron: "windows-1250",
  slv: "windows-1250",
  bos: "windows-1250",
  chi: "gb18030",
  zho: "gb18030",
  jpn: "shift_jis",
  kor: "euc-kr",
  tha: "windows-874",
  vie: "windows-1258"
};

export async function decodeSubtitleBytes(buffer, lang = "") {
  let bytes = new Uint8Array(buffer);
  // Gzip (some providers serve .srt.gz)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream === "function") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_) {
    const encoding = LEGACY_ENCODINGS[String(lang).toLowerCase()] || "windows-1252";
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch (__) {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }
}
