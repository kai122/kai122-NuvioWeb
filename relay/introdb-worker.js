// Cloudflare Worker: lets the Nuvio Touch web app read skip-intro times from
// IntroDB, whose servers only accept requests from introdb.app.
// It forwards GET /segments?... to api.introdb.app and adds the header that
// lets browsers read the answer. Nothing else is forwarded or stored.
const UPSTREAM = "https://api.introdb.app/segments";
const ALLOWED = new Set(["imdb_id", "season", "episode", "is_movie"]);

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/segments") {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams) if (ALLOWED.has(key)) params.set(key, value);
    if (!/^tt\d{5,10}$/.test(params.get("imdb_id") || "")) {
      return new Response('{"error":"imdb_id required"}', {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    const cache = caches.default;
    const cacheKey = new Request(`${UPSTREAM}?${params}`);
    let response = await cache.match(cacheKey);
    if (!response) {
      const upstream = await fetch(`${UPSTREAM}?${params}`, {
        headers: { Accept: "application/json" }
      });
      response = new Response(upstream.body, {
        status: upstream.status,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" }
      });
      if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  }
};
