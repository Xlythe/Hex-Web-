# Hex game service mirror

The Android and web clients use the same POST/XML protocol as igGameCenter.
Their API base URL can be changed with the Android `hexApiBaseUrl` Gradle property
or the web `VITE_IGGC_API_BASE_URL` build variable. The default is
`https://hex-api.xlythe.com`.

`server.py` owns authentication, rooms, seats, moves, swap, undo, chat, and
rematches. SQLite stores all data in the `hex-data` Docker volume. Never remove
that volume during an update. Run `python -m unittest discover -s mirror` and
`python mirror/smoke.py` before deploying.

The mirror also offers an authenticated `GET /events?sid=<room>&after=<event-id>`
server-sent event stream. Pass `Authorization: Bearer <session-id>` and
`X-Hex-Uid: <uid>` headers. A `refresh` event signals the client to fetch
authoritative state through the existing POST/XML API. The web client keeps its
15-second poll as a fallback. Streams reconnect periodically; each server
process allows up to 64 subscribers. Sign-in and registration have per-IP and
global rate limits. Set `HEX_TRUST_PROXY_IP=1` only when traffic reaches the
service through a trusted proxy that supplies `CF-Connecting-IP`.

The current deployment is `~/hex-mirror` on `ubuntu@charlotte-vm-1`, published
on loopback port 8997 via `docker compose up -d --build`. The existing
`xlythe-tunnel.service` Cloudflare tunnel routes `hex-api.xlythe.com` to that
port. Its prior ingress configuration is backed up as
`~/.cloudflared/xlythe.yml.pre-hex` on the VM.

The mirror uses separate accounts from the original igGameCenter service. It
does not migrate accounts or games from that service.

## Ubuntu website

Build the web client with `VITE_IGGC_API_BASE_URL=https://hex.xlythe.com pnpm build`.
The website Compose service in `deploy/compose.yaml` serves the contents of its
sibling `site/` directory on loopback port 8994. The Ubuntu installation lives in
`~/hex-site`. Copy the hashed assets before replacing `index.html` so existing
tabs can finish loading. The tunnel sends the following paths on hex.xlythe.com
to port 8997, with all other requests going to port 8994.

```
^/(healthz|events|api_[a-z_]+\.php|server/hex1/api_handler\.php)$
```

Run `HEX_TEST_SITE=https://hex.xlythe.com python3 mirror/smoke.py` for a live
two-player test including event streaming. To test the deployed UI, set the same
environment variable and run `pnpm exec playwright test e2e/live-online.spec.ts --project chrome`.
For the Android-to-browser test, install the debug and instrumentation APKs from
Xlythe/Hex and set `HEX_ANDROID_SERIAL` to that device's adb serial.

Timed games started with this server version persist both clocks in SQLite.
The server charges elapsed time before processing a command and applies the
increment to a legal move. Accepting an undo restores the clocks saved at the
undone move. Either client can discover an expired clock by refreshing.
Completed games record wins, losses and quits. Rated games adjust both
players' ratings using Elo with a K-factor of 32 and a starting rating of 1500.
