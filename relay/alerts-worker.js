// New-episode notifications for the Nuvio touch app (Cloudflare Worker).
//
// Every few hours it checks the shows each device asked about and, when a new
// episode is out, wakes that device with a Web Push message. The app then
// shows "New episode: Show · S2 E5", even while it's closed.
//
// Setup (free plan): see README.md. Needs
//   - a KV namespace bound as SUBS
//   - secrets VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (made by setup page /keys)
//   - a Cron Trigger, e.g. "17 */3 * * *"
//
// What it stores per device: the push address its browser gave it, the IMDb
// ids and names of the shows to watch, and the latest episode it has seen for
// each. Nothing else: no account, email or viewing history.
//
// Push messages are sent without content (so nothing needs encrypting); the
// app's service worker asks this worker what's new when it wakes.

const MAX_SHOWS = 60;
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/
];
const ALLOWED_ORIGINS = [
  /^https:\/\/[a-z0-9-]+\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
];

// ---- helpers -----------------------------------------------------------------
const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (text) => {
  const s = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const ok = ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
const json = (request, data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request)
    }
  });

function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch (_) {
    return false;
  }
}

function cleanShows(list) {
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    const id = String(s?.id || "");
    if (!/^tt\d{1,10}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(s?.name || "").slice(0, 120) });
    if (out.length >= MAX_SHOWS) break;
  }
  return out;
}

// ---- VAPID (RFC 8292) --------------------------------------------------------
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64url(raw), privateKey: jwk.d };
}

async function vapidHeader(endpoint, env) {
  const pub = fromB64url(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
      d: env.VAPID_PRIVATE_KEY,
      ext: true
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT || "https://github.com/kai122/kai122-NuvioWeb"
      })
    )
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(`${header}.${claims}`)
  );
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function sendPush(endpoint, env) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(endpoint, env),
      TTL: "86400",
      Urgency: "normal",
      "Content-Length": "0"
    }
  });
  return response.status;
}

// ---- episodes (Cinemeta, no key needed) --------------------------------------
async function latestEpisode(id, cache) {
  if (cache.has(id)) return cache.get(id);
  let best = null;
  try {
    const response = await fetch(`https://v3-cinemeta.strem.io/meta/series/${id}.json`, {
      cf: { cacheTtl: 3600 }
    });
    const data = response.ok ? await response.json() : null;
    const now = Date.now();
    for (const v of data?.meta?.videos || []) {
      const t = new Date(v.released || v.firstAired || "").getTime();
      const season = Number(v.season);
      const episode = Number(v.episode ?? v.number);
      if (!Number.isFinite(t) || t > now || !(season > 0)) continue;
      if (!best || t > best.t || (t === best.t && (season > best.season || episode > best.episode)))
        best = { t, season, episode, title: String(v.name || v.title || "").slice(0, 120) };
    }
  } catch (_) {
    best = undefined; // unknown this run: keep what we had
  }
  cache.set(id, best);
  return best;
}

export async function checkAll(env) {
  const cache = new Map();
  let cursor;
  let sent = 0;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    for (const { name } of page.keys) {
      const record = await env.SUBS.get(name, "json");
      if (!record?.endpoint) continue;
      record.seen ||= {};
      record.pending ||= [];
      const firstRun = !record.checkedAt;
      for (const show of record.shows || []) {
        const latest = await latestEpisode(show.id, cache);
        if (!latest) continue;
        const tag = `${latest.season}x${latest.episode}`;
        const before = record.seen[show.id];
        if (before && before !== tag && !firstRun)
          record.pending.push({
            id: show.id,
            name: show.name,
            season: latest.season,
            episode: latest.episode,
            title: latest.title
          });
        record.seen[show.id] = tag;
      }
      record.pending = record.pending.slice(-20);
      record.checkedAt = Date.now();
      // Wake the device once; again after a day if it never came to collect.
      if (
        record.pending.length &&
        (!record.notifiedAt || Date.now() - record.notifiedAt > 86400000)
      ) {
        const status = await sendPush(record.endpoint, env).catch(() => 0);
        if (status === 404 || status === 410) {
          await env.SUBS.delete(name); // the device unsubscribed or was reset
          continue;
        }
        if (status >= 200 && status < 300) {
          record.notifiedAt = Date.now();
          sent += 1;
        }
      }
      await env.SUBS.put(name, JSON.stringify(record));
    }
  } while (cursor);
  return sent;
}

// ---- HTTP --------------------------------------------------------------------
async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });

  if (url.pathname === "/" || url.pathname === "/health")
    return json(request, {
      ok: true,
      configured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.SUBS)
    });

  // One-time helper: makes a VAPID key pair to save as the two secrets.
  if (url.pathname === "/keys") {
    if (env.VAPID_PUBLIC_KEY) return json(request, { error: "Keys are already set." }, 409);
    return json(request, await generateVapidKeys());
  }

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.SUBS)
    return json(request, { error: "This worker isn't set up yet. See the README." }, 503);

  if (url.pathname === "/vapid" && request.method === "GET")
    return json(request, { key: env.VAPID_PUBLIC_KEY });

  if (url.pathname === "/subscribe" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    const sub = body?.subscription;
    if (!validEndpoint(sub?.endpoint)) return json(request, { error: "Bad subscription" }, 400);
    const name = `sub:${await sha256Hex(sub.endpoint)}`;
    const old = (await env.SUBS.get(name, "json")) || {};
    const record = {
      endpoint: sub.endpoint,
      shows: cleanShows(body.shows),
      seen: old.seen || {},
      pending: old.pending || [],
      checkedAt: old.checkedAt || 0,
      notifiedAt: old.notifiedAt || 0,
      updatedAt: Date.now()
    };
    await env.SUBS.put(name, JSON.stringify(record));
    return json(request, { ok: true, shows: record.shows.length });
  }

  if (url.pathname === "/unsubscribe" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body?.endpoint) return json(request, { error: "Missing endpoint" }, 400);
    await env.SUBS.delete(`sub:${await sha256Hex(body.endpoint)}`);
    return json(request, { ok: true });
  }

  // The app's service worker, woken by a push, asks what's new. The id is the
  // SHA-256 of the device's own push address, which only that device knows.
  if (url.pathname === "/pending" && request.method === "GET") {
    const id = url.searchParams.get("id") || "";
    if (!/^[0-9a-f]{64}$/.test(id)) return json(request, { error: "Bad id" }, 400);
    const name = `sub:${id}`;
    const record = await env.SUBS.get(name, "json");
    if (!record) return json(request, { items: [] });
    const items = record.pending || [];
    record.pending = [];
    record.notifiedAt = 0;
    await env.SUBS.put(name, JSON.stringify(record));
    return json(request, { items });
  }

  // Sends a test notification to one device right away.
  if (url.pathname === "/test" && request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!validEndpoint(body?.endpoint)) return json(request, { error: "Bad endpoint" }, 400);
    const name = `sub:${await sha256Hex(body.endpoint)}`;
    const record = await env.SUBS.get(name, "json");
    if (!record) return json(request, { error: "Not subscribed" }, 404);
    record.pending = [...(record.pending || []), { test: true, name: "Nuvio" }].slice(-20);
    await env.SUBS.put(name, JSON.stringify(record));
    const status = await sendPush(record.endpoint, env).catch(() => 0);
    return json(request, { ok: status >= 200 && status < 300, status });
  }

  return json(request, { error: "Not found" }, 404);
}

export default {
  fetch: (request, env) =>
    handle(request, env).catch(() => json(request, { error: "Something went wrong" }, 500)),
  scheduled: (_event, env, ctx) => ctx.waitUntil(checkAll(env))
};
