# Independent certificate alert worker

`notifications.uc` returns `create(options)` with `check()`, `status()` and
`save({enabled,url,headers})`. RPC exposes only status/save; reading status does
not scan, send or alter event state. Options are local CLI test seams, never RPC
arguments. `notification-worker.uc` continuously calls the same check interface;
its independent `caddy-monitor` procd service starts at boot regardless of the
Caddy service, browser session or form/manual configuration mode.

Expiry is established only by actual stored leaf PEM from ticket06's bounded
`check()` contract. Near expiry uses min(14 days, lifetime/6), and requires at
least two distinct, attributable renewal attempts for the **same domain**,
observed across checks, spanning min(30 minutes, lifetime/24), on the unchanged
certificate without a newer observed success. Replayed windows cannot add an
attempt; observations from different domains cannot be combined. A single
issuer error cannot prove terminal failure. The near alert therefore says
`near_expiry_observed_issues`: final attempt outcomes remain unknown. This is
partial bounded history, never complete renewal failure history. No raw provider
error is retained by this module or included in a notification.

Checks normally run every five minutes; lifetime/24 can shorten the interval,
with a15-second floor. Pending delivery deadlines can shorten it too. A newer
valid replacement covering every affected active site suppresses stale old-leaf
expiry and recovers an episode once. Recovery additionally requires expiry
beyond the old certificate and a certificate outside the near-expiry window.
File disappearance, unreadable storage, cleared logs, worker restart or webhook
configuration changes never establish recovery. Backward clock observations
pause recovery. Stored PEM evidence does not verify a live TLS connection.

Private mode0600 JSON configuration and a versioned episode/observation/event
ledger live under the trusted mode0700 manager root. A separate worker lock
serializes checks/settings. Writes use same-directory0600 temporary files and
rename; durable event/budget/settings commits are synced before network I/O.
Unchanged checks do not rewrite the durable ledger; the last-check timestamp
lives in a0600 runtime file under `/var/run`. Ledger corruption or capacity
exhaustion fails closed instead of starting new episodes each poll. There are
at most256 logical identities/events and32 observed attempts per certificate.
Completed delivery history is evicted first; active pending events are retained.

`enabled` defaults false. Both user-chosen HTTP and HTTPS URLs, including LAN
receivers, are supported. Userinfo, fragments, whitespace/control characters and
backslashes are rejected. URL query and up to8 private headers are write-only;
status exposes only enabled/configured metadata. Blank inputs retain secrets.
Headers cannot override transport framing, Host or JSON Content-Type. Notification
settings are independent of save/apply and available in complete Caddyfile mode.

The fixed executable curl helper reads a0600 config and allowlisted JSON payload;
URL/header secrets never enter argv. Curl config values escape backslash and
double quote. `--disable` is first, proxy bypass is explicit, only HTTP(S) is
allowed, redirects are not followed, HTTPS certificate checks stay enabled,
connect/total limits are3s/8s with an outer10s deadline, response bodies and
stderr are discarded, and only exit0 plus HTTP2xx succeeds. At most one event
is attempted per worker tick; each event has three persistent attempts with
minimum60s/300s backoff. Curl's own retry is disabled. Payload fields are only
event_id, type, domains, not_after, observed_at and a fixed safe summary.

Events persist before delivery. Retries preserve an episode/phase event_id for
receiver deduplication. HTTP cannot atomically combine remote receipt and local
success persistence: power loss can cause a repeated delivery with the same ID.
Finite retry budgets can also exhaust without successful receipt. There is no
exactly-once or guaranteed-delivery claim. Disabled events are recorded locally
and are not retroactively sent merely because a target is later enabled.

The directory is trusted local root/Caddy storage, not an adversarial local-root
sandbox. The installed runtime lacks openat/O_NOFOLLOW, as documented in06.
All actual tests use generated self-signed PEMs and controlled loopback HTTP;
public ACME, arbitrary external URLs and browser visual acceptance remain final
separate checks. Installing/enabling the production service is an integration
step, not part of the isolated `/tmp` fixtures.
