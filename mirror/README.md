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
