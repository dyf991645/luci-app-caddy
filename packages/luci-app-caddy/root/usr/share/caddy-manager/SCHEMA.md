# Managed configuration contract (ticket 02)

The installed `config.uc` module returns `create(options)`. Options configure the
local test environment only; RPC never accepts root paths, executables, admin
addresses, bind addresses or issuer overrides. Production uses `/etc/caddy`,
`127.0.0.1:2019`, `/usr/bin/caddy` and public ACME. `internal_tls` is solely the
isolated real-router test seam, with CA trust installation explicitly disabled.

```json
{
  "version": 1,
  "settings": {
    "http_port": 10080,
    "https_port": 10443,
    "email": "",
    "storage": "/etc/caddy/data"
  },
  "sites": [{
    "domain": "app.example.com",
    "backend": "http://192.168.1.2:8080",
    "challenge": "http-01"
  }]
}
```

Ticket02 accepts one non-wildcard DNS domain, one HTTP backend with explicit port,
and `http-01` or `tls-alpn-01`. Backend URLs do not contain credentials, path,
query or fragment. Global port fields are JSON integers. Unknown top-level, settings and site keys
are rejected before saving or previewing; arbitrary request properties cannot
enter the readable draft. Schema extensions must deliberately update these
allowlists and their public save/read tests along with validation/generation.
Future ticket03 extends
`sites[]` and replaces `backend` with a backend group (including HTTPS transport),
with a deliberate version/migration change. Future auth/manual/credential fields
must be explicitly added to validation and generation; they must not be silently
interpreted as Caddy JSON. Secret credentials belong to separate private storage,
not the readable draft or preview. Generated preview is built from the public
model and never reads private active/candidate JSON.

RPC methods (object `luci.caddy`):

- `draft_get()` returns `{ok,draft,draft_revision,active_revision,pending,recovery_required}`.
- `draft_save({config,expected_revision})` validates the public model, checks the
  draft revision under an exclusive nonblocking lock, persists a new draft and
  returns the same state. It never changes the running or active configuration.
- `config_preview({config})` returns `{ok,config}` with generated managed JSON.
- `config_apply({expected_revision})` validates the saved draft with real Caddy,
  loads it through the loopback admin endpoint, then promotes durable active
  JSON and metadata. Service must already be running; it never silently starts
  a deliberately stopped service. Success means loaded, not certificate issued.

Local manager methods also include `active_reload()` and `recover({load})`.
Errors return `{ok:false,error}` with fixed safe text; raw CLI/provider errors
can contain credentials and never enter RPC responses. An indeterminate load
or failed compensation additionally returns `recovery_required:true`.

`draft.json` is separate from `active.json` (the procd startup authority).
`active-state.json` records the last committed public model/revision.
`candidate.json` and `transaction.json` are private, mode0600, inside the
mode0700 manager root. Before loading, a durable journal records previous and
next metadata and candidate JSON. Atomic rename + system sync makes durable
active.json the recovery decision: before promotion, previous active wins;
after promotion, next metadata completes. On interruption, recovery reloads the
authoritative active JSON before clearing the journal. A CLI timeout is not
assumed to mean Caddy rejected the load: compensation is attempted, otherwise
the journal is retained and outcome is explicitly uncertain.

The init script calls `recover.uc boot` before procd starts, which reconciles
metadata without contacting an absent daemon; startup then loads active.json.
`recover.uc reload` runs locked recovery plus last-active reload. Core-only
installations retain their original startup/reload behavior if the optional
manager is absent. Caddy autosave is disabled, so `--resume` never bypasses this
contract. Save/apply use the same OS lock across rpcd and CLI invocations.

No configuration writes uhttpd, firewall, DNS, NAT or router trust stores.
Public HTTP-01 always needs external80 -> configured HTTP port; TLS-ALPN-01
needs external443 -> configured HTTPS port. Internal nonstandard ports alone
cannot make public ACME reachable. Configured ports2019 (managed admin) and
identical HTTP/HTTPS ports are rejected. Future diagnostics can report conflicts.

Power-cut tests kill a manager after successful real `/load` and before active
promotion, then exercise the public boot/reload recovery interface. This tests
the interrupted-process contract, not physical storage hardware durability.
