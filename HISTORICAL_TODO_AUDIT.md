# Historical TODO audit

Audited July 29, 2026 against the current `Hex-Web-` and `Hex` trees, the
pre-Google-Play-Games Android implementation, and the original igGameCenter
maintainer correspondence.

## Validation boundary

The protocol implementation is covered against a deterministic mock, but a
real two-client game has not yet been played. Anything labelled “mock
verified” still needs the planned Android-versus-web production smoke test.
The production service is old enough that a green mock suite cannot prove its
current deployment, account, or timeout behaviour.

## Completed and covered

| Historical item | Current evidence |
| --- | --- |
| Sign up, sign in, profile load/edit, and remembered login | `IgGameCenterApi.spec.ts`, `storage.spec.ts`, and the auth provider's startup validation. The web app stores the legacy session, not a plaintext password. Android encrypts remembered credentials with the platform keystore. |
| Create, query, join, configure, sit, and ready a game | API/protocol tests plus `MockIgGameCenterApi.spec.ts`. The mock requires both occupied seats to ready before changing the game to `ACTIVE`. |
| Start, move, swap, undo request/response, give up, claim quit, and rematch | `OnlinePlayer.spec.ts`, `igGameCenterProtocol.spec.ts`, controller tests, and multiplayer mock-flow tests. Live interoperability remains outstanding. |
| Send and receive chat, retry failures, system messages, minimized notifications, and unread count | Chat reducer tests, mock incremental-event tests, and responsive screenshot journeys. The badge is numeric and caps at `99+`. |
| Include `lasteid` on every game command | `OnlinePlayer` owns the cursor and overwrites caller input. Leaving captures the cursor before local state is reset. Unit tests cover both cases. |
| Accept `end` response casing variations | Claim-forfeit parsing is case-insensitive and unit tested. |
| Poll without server spam | The loop sends explicit `REFRESH` commands every 15 seconds, never overlaps requests, and preserves a minimum delay after other activity. Timing helpers are unit tested. |
| Keep private games out of the public lobby | Filtered in both the mock server and UI boundary, with a defense-in-depth unit test. Creation sends the protocol's `private` value. |
| AI play and Android bot parity | Web easy/medium/hard implementations have Android parity fixtures and behavioural tests. |
| Settings, player identity/color separation, board-size choices, swap rule, random starter, replay/new-game confirmations, and replay side labels | Model tests plus desktop, phone-portrait, and phone-landscape screenshot coverage. |
| Skip the first replay delay | Replay begins on the first real move instead of displaying the duplicated empty-board history entry; fake-timer coverage verifies subsequent moves retain normal pacing. |
| History replay on modern Android storage | Android history is app-private, requires no external-storage permission, and has host and API 37 round-trip tests. A serialization defect that previously saved an object identity string was fixed. |
| Landscape and responsive rendering | Android has 36 landscape goldens across phone, compact, and tablet widths. Web has 45 goldens across desktop and both phone orientations, including scrolled modal states and overflow assertions. The Android home hexagon's oversized, off-centre, partially offscreen geometry is intentional; its swipe rotation is tested. |
| Current Android settings | API 37 instrumentation covers every stored preference and every settings control across recreation while locked to landscape. Corrupt persisted values are clamped or replaced safely. |

## Worthwhile remaining work

| Priority | Item | Assessment |
| --- | --- | --- |
| P0 | Play a complete production Android-versus-web game | Required before calling the legacy integration production-validated. Exercise account creation/login, lobby/create/join, both-ready start, move/swap, chat, undo accept/decline, background/resume, forfeit/claim, rematch, and history replay while checking request cadence. |
| P0 | Repair deployed audio assets | The configured Cloud Storage URL returns HTML and the direct object URLs return `403`; the application therefore cannot decode the three sounds. Fix the bucket/object access or provide distributable local assets, then add network/deployment smoke coverage. This is external state and was not changed by the code review. |
| P1 | Restore an in-progress online board after a tab/app restart | Authentication survives reload and is revalidated, but the active board ID and event cursor are deliberately not restored. Persisting them without first confirming server rejoin/expiry semantics risks reviving a stale board. Add this after the live protocol exercise. |
| P1 | Import/export `.rhex` replays | Useful for portability and debugging, especially if Android and web share a versioned schema. Define that schema, validate untrusted files, set size limits, and add cross-client fixtures before adding drag/drop and download UI. |
| P1 | Replace or own the backend | The clean protocol boundary and mock make replacement feasible, but auth, matchmaking, durable games, event ordering, abuse controls, observability, migration, and operations make this a separate project rather than a cleanup task. |
| P2 | Join a private game by code | Worth adding once the production API's private-board lookup contract is confirmed. A SID alone is not enough to safely invent a request shape from the available legacy documentation. |
| P2 | Align border colours exactly to board edges | Visual polish, not a rules or data-loss issue. Current multi-viewport goldens show no crop/overflow regression; retain this as an art-direction review rather than changing geometry from a textual TODO. |
| P3 | Local socket matchmaking | Low value today compared with an owned online backend. It also creates discovery, firewall, security, lifecycle, and cross-platform support work. Only pursue for an explicit offline-LAN product goal. |

## Deployment and product tasks

Custom domains, Cloud Run provisioning, database setup, account-infrastructure
integration, and production monitoring remain deployment projects. They need
an explicit environment/ownership decision and should not be inferred from a
client-code cleanup. The current proxy is still a dependency until the backend
replacement is designed and migrated.

## Test coverage caveat

“Robust” does not mean every line is equally valuable to test. Rules,
serialization, protocol cursors/casing, polling, bots, settings, and replay
transitions have direct behavioural coverage; screens have visual coverage.
The main residual risks are the opaque production service, browser/platform
audio deployment, and lifecycle scenarios that only a real cross-client game
can settle.
