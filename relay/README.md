# Stream relay (lets the app play TorBox MKVs itself)

Debrid servers like TorBox send files without the header that lets a web page
read them (CORS). VLC doesn't need it, but the app's in-app MKV repackager
does. [`stream-worker.js`](stream-worker.js) is a tiny Cloudflare Worker that
fetches the file and adds that header. Nothing is stored or changed.

It's already deployed for this app as
`https://nuvio-relay.nuvio-ff2c9472.workers.dev` (the app's default). It only
serves requests from the app's own site and only passes video through, so it
can't be used as a general proxy.

To run your own instead: create a Worker named `nuvio-relay` (Compute
(Workers) → Workers & Pages → Create → Create Worker), paste
`stream-worker.js`, deploy, and put its address in **Settings → Media →
Playback → Stream relay address**. If you host the app somewhere other than
kai122.github.io, add that site to `ALLOWED_ORIGINS` at the top of the file.

---

# IntroDB relay (for "Skip Intro" on TV shows and movies)

The touch app gets skip times for anime from AniSkip directly. For TV shows
and movies it uses [IntroDB](https://introdb.app), whose servers only accept
requests from introdb.app, so a browser app needs this tiny relay in between.
It's free on Cloudflare's free plan and takes about five minutes.

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. In the dashboard: **Compute (Workers) → Workers & Pages → Create →
   Create Worker** (start from "Hello World"). Name it `introdb-relay` and
   click **Deploy**.
3. Click **Edit code**, delete everything, paste the contents of
   [`introdb-worker.js`](introdb-worker.js), and click **Deploy**.
4. Copy the worker's address, e.g. `https://introdb-relay.yourname.workers.dev`.
   Check it works by opening
   `https://introdb-relay.yourname.workers.dev/segments?imdb_id=tt0903747&season=1&episode=2`
   in Safari: you should see Breaking Bad's intro times.
5. In the touch app: **Settings → Media → Playback → Skip segments →
   IntroDB relay address**, paste the address and Save.

The relay only forwards IntroDB's `/segments` lookups (IMDb id, season,
episode). It stores nothing and caches answers for a day.

---

# Alerts service (new-episode notifications while the app is closed)

This tiny worker checks your shows every few hours and sends a notification
to your iPhone, iPad or computer when a new episode comes out. It's free on
Cloudflare's free plan and takes about ten minutes, once.

It stores only what it needs: each device's push address and the IMDb ids
and names of the shows it should watch. No account, email or history.

1. Make a free account at <https://dash.cloudflare.com/sign-up> (skip if you
   already made one for the IntroDB relay).
2. **Storage:** in the dashboard open **Storage & Databases → KV → Create**.
   Name it `nuvio-alerts` and click **Add**.
3. **Worker:** **Compute (Workers) → Workers & Pages → Create → Create
   Worker** (start from "Hello World"). Name it `nuvio-alerts` and click
   **Deploy**. Click **Edit code**, delete everything, paste the contents of
   [`alerts-worker.js`](alerts-worker.js), and click **Deploy**.
4. **Connect the storage:** in the worker open **Settings → Bindings → Add →
   KV namespace**. Variable name `SUBS`, namespace `nuvio-alerts`. Save.
5. **Keys:** open `https://nuvio-alerts.yourname.workers.dev/keys` in Safari.
   It shows two values. In the worker go to **Settings → Variables and
   Secrets → Add**, type **Secret**:
   - `VAPID_PUBLIC_KEY` = the `publicKey` value
   - `VAPID_PRIVATE_KEY` = the `privateKey` value

   Deploy when asked. (Opening `/keys` again now says the keys are set.)

6. **Schedule:** **Settings → Trigger Events → Add → Cron Triggers**, enter
   `17 */3 * * *` (every 3 hours) and save.
7. Check it: `https://nuvio-alerts.yourname.workers.dev/health` should show
   `"configured":true`.
8. **In the app:** open Nuvio **from your Home Screen**, go to **Settings →
   System → Notifications**, set **Alerts service address** to
   `https://nuvio-alerts.yourname.workers.dev`, then turn on **Notifications
   while Nuvio is closed** and allow notifications. Tap **Send Test
   Notification** to check. Do this on each device you want alerts on.

The show list updates by itself when you save shows or watch something new.
