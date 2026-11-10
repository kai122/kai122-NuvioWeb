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
