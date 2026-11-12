# Independent certificate alert worker

`notifications.uc` returns `create(options)` with `check()`, `status()` and
`save({enabled,url,headers,method,body_mode,body})`. RPC exposes only status/save; reading status does
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

Settings stage in public UCI `caddy.notifications`; private URL, headers and body
templates are immutable mode0600 entries in `caddy_secrets`. The worker reads
committed settings only. A versioned episode/observation/event ledger lives
under the trusted mode0700 manager root. A separate worker lock
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
status exposes enabled/configured, method, body mode and body-configured metadata. Blank inputs retain secrets; changing the URL clears old headers unless new
headers are supplied, so retargeting does not silently forward old credentials.
Headers cannot override transport framing or Host; Content-Type may be overridden.
Settings use native UCI save/apply/revert and are available in complete Caddyfile mode.

The fixed executable curl helper reads a0600 config and bounded request body;
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

The production monitor can be managed separately with
`/etc/init.d/caddy-monitor start|stop|enable|disable`. Package removal stops
and disables this monitor; it does not stop the separately packaged Caddy
service. Webhooks stay disabled until explicitly configured and enabled.

Production settings now stage in `caddy.notifications` (enabled and webhook
reference, method and body_mode), with private URL/header/body fields in `caddy_secrets`. The worker
reads only committed UCI settings. Save refreshes LuCI native pending changes;
Apply/revert controls activation. Old notifications.json is not read or imported.
The notification ledger and runtime check evidence remain operational files.

## Request method and body

Method defaults to POST. Supported methods: POST, GET, PUT, PATCH, DELETE, HEAD,
OPTIONS. GET and HEAD send no body (HEAD also enables curl's HEAD behavior).
`body_mode` defaults to `default`, which sends the existing JSON payload.
`none` sends no body; `custom` uses a write-only template of at most16KiB.
Blank body input retains the saved template. Changing target clears old headers
and body unless supplied again. Saving never sends a request.

Variables: `{{event_id}}`, `{{type}}`, `{{domains}}`, `{{not_after}}`,
`{{observed_at}}`, `{{summary}}`, `{{expires_at}}` (UTC ISO8601).
For valid JSON templates, substitution occurs recursively in string values;
a value containing exactly a variable preserves its type (domains is an array,
epoch timestamps are numbers). Embedded variables become text and JSON is
serialized afterward, preserving escaping. JSON object keys remain literal.
Other templates use plain text, with domains joined by commas. Default content
type is application/json for JSON and text/plain for text; custom Content-Type
headers override it. Unknown or unterminated variable expressions are rejected.
No environment, file or executable expansion occurs.

Example: `{"text":"{{summary}}","domains":"{{domains}}"}`.
