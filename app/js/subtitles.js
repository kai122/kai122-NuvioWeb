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
