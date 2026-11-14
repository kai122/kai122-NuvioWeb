// Stream relay for the Nuvio touch app (Cloudflare Worker).
//
// Debrid servers (TorBox, Real-Debrid, ...) send video files without the
// header that lets a web page read them (CORS). Players like VLC don't care,
// but the app's in-app MKV repackager must read the file itself. This worker
// fetches the file (passing the byte range through), and returns it with that
// header added. Nothing is stored or changed.
//
// Guard rails, so it can't be used as a general proxy:
// - only requests from the app's own site are served (Origin check),
// - only video files are passed through (by content type),
// - only GET/HEAD, only http(s), no cookies or credentials forwarded.
//
// Request: GET /?u=<encoded stream URL>   (Range header passed through)
// Also: POST /log with a small JSON playback-problem report (optional LOG
// KV binding; reports expire after 7 days).

const ALLOWED_ORIGINS = [
  /^https:\/\/kai122\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];
const VIDEO_TYPES =
  /^(video\/|audio\/|application\/(octet-stream|x-matroska|mp4|vnd\.apple\.mpegurl|x-mpegurl|force-download|binary))/i;
// Where add-on links led (per worker instance, short-lived).
const resolved = new Map();
const REMEMBER_MS = 20 * 60 * 1000;

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag"
];

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function reply(status, text, origin) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      ...(origin ? cors(origin) : {})
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin)) ? origin : "";
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: allowed ? cors(allowed) : {} });
    const url = new URL(request.url);
    if (url.pathname === "/health") return reply(200, "ok", allowed);
    if (!allowed) return reply(403, "This relay only serves the Nuvio app.", "");

    // Playback problem reports from the app (no links or keys, just what
    // failed), kept for 7 days in the LOG store so they can be looked at.
    if (url.pathname === "/log" && request.method === "POST") {
      if (!env?.LOG) return new Response(null, { status: 204, headers: cors(allowed) });
      const text = (await request.text()).slice(0, 4000);
      let entry;
      try {
        entry = JSON.parse(text);
      } catch (_) {
        return reply(400, "Bad report", allowed);
      }
      const key = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
      await env.LOG.put(key, JSON.stringify({ ...entry, country: request.cf?.country || "" }), {
        expirationTtl: 7 * 86400
      });
      return new Response(null, { status: 204, headers: cors(allowed) });
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return reply(405, "Method not allowed", allowed);

    let target;
    try {
      target = new URL(url.searchParams.get("u") || "");
    } catch (_) {
      return reply(400, "Missing or bad u= parameter", allowed);
    }
    if (target.protocol !== "https:" && target.protocol !== "http:")
      return reply(400, "Bad URL", allowed);

    const headers = new Headers({ "User-Agent": "Mozilla/5.0 (Nuvio relay)" });
    const range = request.headers.get("Range");
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("Range", range);

    // Add-on links (e.g. Torrentio's) redirect to the debrid file. The player
    // reads the file in many pieces, so remember where the link led instead
    // of asking the add-on again for every piece.
    const key = target.toString();
    const remembered = resolved.get(key);
    let upstream = null;
    if (remembered && remembered.until > Date.now()) {
      try {
        upstream = await fetch(remembered.url, {
          method: request.method,
          headers,
          redirect: "follow"
        });
        if (!upstream.ok && upstream.status !== 206) {
          upstream.body?.cancel();
          upstream = null; // expired link: resolve again below
        }
      } catch (_) {
        upstream = null;
      }
      if (!upstream) resolved.delete(key);
    }
    if (!upstream) {
      try {
        upstream = await fetch(key, { method: request.method, headers, redirect: "follow" });
      } catch (_) {
        return reply(502, "The stream's server didn't answer.", allowed);
      }
      if ((upstream.ok || upstream.status === 206) && upstream.url && upstream.url !== key) {
        if (resolved.size > 300) resolved.clear();
        resolved.set(key, { url: upstream.url, until: Date.now() + REMEMBER_MS });
      }
    }
    if (!upstream.ok && upstream.status !== 206) {
      upstream.body?.cancel();
      return reply(upstream.status, `The stream's server said ${upstream.status}.`, allowed);
    }
    const type = upstream.headers.get("content-type") || "";
    if (!VIDEO_TYPES.test(type)) {
      upstream.body?.cancel();
      return reply(415, "Only video files are relayed.", allowed);
    }
    const out = new Headers(cors(allowed));
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    out.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
};
