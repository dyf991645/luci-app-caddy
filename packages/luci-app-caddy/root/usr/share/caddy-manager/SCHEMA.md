# Managed configuration contract (tickets 02–07)

The installed `config.uc` module returns `create(options)`. Options configure the
local test environment only; RPC never accepts root paths, executables, admin
addresses, bind addresses or issuer overrides. Production uses `/etc/caddy`,
`127.0.0.1:2019`, `/usr/bin/caddy` and public ACME. `internal_tls` is solely the
isolated real-router test seam, with CA trust installation explicitly disabled.

```json
{
  "version": 2,
  "settings": {
    "http_port": 10080,
    "https_port": 10443,
    "email": "",
    "storage": "/etc/caddy/data"
  },
  "sites": [{
    "domain": "app.example.com",
    "upstreams": ["http://192.168.1.2:8080", "http://192.168.1.3:8080"],
    "balance": "round_robin",
    "path": "/media/*",
    "strip": true,
    "challenge": "http-01"
  }]
}
```

Version2 accepts one or more sites, exactly one per non-wildcard DNS domain.
Each group has at least one HTTP or HTTPS backend with explicit port; a group
must use the same scheme. URLs exclude credentials, path, query and fragment.
`balance` is `round_robin`, `least_conn` or `random`. HTTPS uses Caddy's verified
TLS transport: there is no insecure-skip-verify switch. With Caddy2.11 HTTP
retains the incoming Host; HTTPS sets Host to the upstream authority for SNI
compatibility. WebSocket upgrades are automatic. Changed-config reload closes
existing WebSockets by default; clients must reconnect (verified on2.11.8).

`path` is empty for the entire domain, an exact path, or a path with a final
`/*`. `/media/*` includes `/media/` and descendants, excludes `/media` and
`/mediaX`; unmatched requests explicitly return404. Only ASCII unreserved path
segments are accepted; encoding, query, fragment, parent/dot segments and other
wildcard positions are rejected. `strip:true` requires a trailing `/*` and
removes its prefix while preserving the request query. Matching happens inside
the domain's subroute; future authentication must run inside that matching
handler before rewrite/proxy, keeping the404 fallback outside authentication.

Version1 drafts using `backend` deliberately migrate to version2 with a
single-element `upstreams`, `round_robin`, empty path and `strip:false` when
read, saved or previewed. Reads do not rewrite files or change revisions. The
next save persists version2; existing active.json and active metadata remain
startup authority until a successful apply. Existing version1 public callers
remain accepted through migration. Revisions and journal recovery are unchanged.
Global port fields are JSON integers. `http-01` and `tls-alpn-01` are supported.
All public object keys remain allowlisted; unknown fields fail validation.
Authentication is documented in [AUTH-SCHEMA.md](AUTH-SCHEMA.md). Additional
source/credential fields must be explicitly allowlisted and generated; they
are never interpreted as caller-supplied Caddy JSON. Secret credentials belong to separate private storage,
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
  JSON and metadata. When stopped, the RPC validates and promotes disk state without loading or
  starting the service. With a UCI store, successful Apply commits only caddy. Success means loaded, not certificate issued.

Local manager methods also include `active_reload()` and `recover({load})`.
Errors return `{ok:false,error}` with fixed safe text; raw CLI/provider errors
can contain credentials and never enter RPC responses. An indeterminate load
or failed compensation additionally returns `recovery_required:true`.

The production UCI source is `/etc/config/caddy`, with actual `manager config`,
`auth auth`, `site`, `service service`, and `notifications notifications` sections.
Each backend is an ordered `list upstream`, and scalar fields (ports, domain,
challenge, auth mode/source, Authelia backend/URI/portal) are normal UCI options.
Empty strings use `<option>_empty=1` to distinguish a deliberately empty value
from an absent optional field, because libuci removes empty string options.
The manager's API revision is an opaque content fingerprint, not a UCI pointer;
direct `uci set` edits participate in pending detection and concurrency checks.
Service and notification settings stage through the same per-session native UCI
changeset, then become effective on Apply. They do not start services or deliver
webhooks when saved. Native commit/revert/rollback controls the field source.
The config.change trigger validates/synchronizes committed fields, then applies
the desired runtime and boot state. Invalid configuration keeps last-active Caddy.

`/etc/config/caddy_secrets` (0600, no public UCI ACL) contains typed `credential`,
`basic`, `source`, and `webhook` sections with token, username/hash lists,
Caddyfile/snippet content, and URL/header lists. These immutable private UCI
versions are referenced by the public fields, so native changes never include
sensitive values and rollback retains the exact prior credentials. Private
versions abandoned by cancellation are retained; no garbage collection runs.

Post-install migration imports legacy draft/snapshot JSON, referenced credentials,
Basic accounts and notification settings, and converts saved rpcd session
revision deltas into field deltas. It backs up the old UCI baseline, preserves
legacy files for recovery, resumes unconverted sessions, and never loads Caddy
or changes runtime/boot state. JSON is no longer an editable configuration source;
isolated test fixtures can still supply the legacy file adapter.
`active.json` remains the procd startup authority.
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

## DNS-01 and write-only Cloudflare credentials (ticket05)

Settings additionally accept `default_challenge` (`http-01`, `dns-01`,
`tls-alpn-01`) and `cloudflare_credential` (positive integer private version
reference). Site `challenge` accepts `global`, `http-01`, `dns-01` or
`tls-alpn-01`. `global` is a persistent reference to the current draft's
`settings.default_challenge`, falling back to `http-01` when unset. Explicit
site methods remain independent, including existing and migrated version1
sites; they are never converted into references. Leading `*.` wildcard sites
must resolve to DNS-01; specific domains support all three effective methods.
Validation, generated issuer selectors and private DNS credential resolution
use the same effective method.

`credential_status()` is read-only and returns `configured`, `draft_revision`
and `active_revision` for credential references, never token bytes.
`credential_save({token,expected_revision})` is write-ACL only. It creates a
root-only immutable `credential` section in `caddy_secrets` (0600), updates the public draft reference and advances the draft revision.
It does not replace the active secret or the running process environment.
Stale concurrent edits fail. Retired versions remain private so an active or
interrupted transaction retains its exact original credential. Removing a draft
reference never deletes the active version. There is no public token readback,
bulk credential export or deletion RPC.

`tls_save({default_challenge,expected_revision})` is a scoped write RPC. Like
credential staging, it edits the private full draft internally and returns only
the read-safe state. This preserves retained manual content and scoped snippets
without requiring the TLS page to fetch or resubmit unrelated private sources.
It validates the complete updated draft before persisting. For example, changing
the default from DNS-01 to HTTP-01 is rejected when an inherited wildcard site
would become invalid; the prior draft content and revision remain intact.
Changing a default only stages a draft: inherited sites change their generated
policy after successful Apply, while explicit overrides and last-active JSON
remain unchanged until their own applicable edits are successfully applied.
Both TLS/default and credential mutations are refused in complete Caddyfile
mode; the controls remain visible and read-only. Manual provider literals are
never rewritten by form credential references.

Apply resolves the selected private version into the private candidate JSON,
validates it, and uses the existing transactional `/load` path. Failed validation
or load retains the previous private active JSON and credential revision.
Restart/reload therefore uses the exact last successful credential. Public
preview is generated independently with a fixed redacted provider placeholder.
Neither active JSON, candidates, journals nor credential files are downloadable.
The command helper discards both stdout and stderr because Cloudflare provider
errors can embed a token. RPC uses fixed errors exclusively. Diagnostic readers use a strict allowlist of fixed event categories, timestamps,
levels, logger names and HTTP statuses. Raw messages/provider errors, source,
headers, queries and arbitrary fields are omitted entirely, so unknown manual
credentials do not depend on blacklist matching. These files must never be
exposed via a raw log/config endpoint. See [DIAGNOSTICS.md](DIAGNOSTICS.md).

Cloudflare needs Zone DNS Edit and Zone Read scoped to required zones, outbound
Cloudflare API connectivity and authoritative TXT propagation. Syntax validation
and successful hot load do not prove API acceptance, issuance or renewal.
`disable_certificates` is a local-only test option, never accepted over RPC,
allowing real DNS-provider provision/load without initiating ACME or DNS calls.

No configuration writes uhttpd, firewall, DNS, NAT or router trust stores.
Public HTTP-01 always needs external80 -> configured HTTP port; TLS-ALPN-01
needs external443 -> configured HTTPS port. Internal nonstandard ports alone
cannot make public ACME reachable. Configured ports2019 (managed admin) and
identical HTTP/HTTPS ports are rejected. Future diagnostics can report conflicts.

Power-cut tests kill a manager after successful real `/load` and before active
promotion, then exercise the public boot/reload recovery interface. This tests
the interrupted-process contract, not physical storage hardware durability.

## Independent Caddyfile source (ticket 04)

Public state additionally exposes `active_source` (`form`, `manual`, or null
when no managed revision is committed), independently of the selected draft mode.

`mode` is `form` (default for existing drafts) or `manual`.
`manual_caddyfile` is the separate complete Caddyfile string. Each form site may
contain `advanced_snippet`, a string of HTTP routing directives. Both sources
remain in the private draft, regardless of selected mode; neither is converted
into the other. A source change is only a draft change until successful Apply.
Service start/restart/reload still uses durable last-active JSON, including
when that JSON originated from a Caddyfile. Service/autostart remain independent
of the read-only content forms in manual mode.

`draft_edit()` is a **write ACL** RPC exposing editable private source to trusted
administrators. `draft_get()` and all save/apply responses omit Caddyfile and
snippet strings, including inactive source. `config_preview` now requires write
ACL because validation of administrator-supplied server configuration is a
privileged operation. Manual/snippet previews return a fixed redacted validation
summary, never adapted JSON or active/candidate files. Ordinary form previews
continue to be generated from the public model. CLI and provider diagnostics
are discarded; safe fixed errors cannot echo supplied tokens or file content.

Manual Caddyfiles are root-equivalent server configuration, **not a sandbox**.
A trusted writer can deliberately expose files using `file_server`, templates,
proxy configuration and other server modules. Granting write access therefore
requires the same trust as editing the service configuration on the router.
Read ACL grants no such access. As a conservative managed-source limitation,
imports (including quoted tokens), backslashes, backticks and environment
expansion (`{$...}` and `{env....}`) are rejected before running the adapter.
This deliberately also rejects such text inside comments/strings; it is not an
attempt to sanitize arbitrary Caddy syntax or safely delegate root configuration
to untrusted users. No import can read `/etc` into adapted output, and private
adapter output is never an export API.

Real `caddy adapt` writes mode0600 private JSON; the manager then enforces its
ownership boundary **before** real `caddy validate` or `/load`: admin is exactly
`127.0.0.1:2019`, autosave is disabled, explicit disabled/nonlocal/remote admin,
external config loaders and persistent autosave overrides are rejected. Manual
storage must be the managed filesystem root (`/etc/caddy/data`); unspecified
storage is filled in. Other storage modules/roots are unsupported, pending the
certificate inventory contract in ticket06. All internal CA trust installation
is disabled, including implicit local CAs. No trust-store changes are requested.

Advanced snippets are adapted inside a synthetic HTTP site; only its HTTP
routing directives are accepted (not global/server/TLS/storage settings or
additional site blocks). Their routes execute before the generated proxy,
within the generated site's host and path boundary, and therefore do not relax
the 404 fallback. Snippets may set headers or terminate requests explicitly;
there is no automatic reconciliation if an administrator deliberately adds a
second proxy. Import/environment restrictions and private preview rules apply
to snippets too. Each source is limited to 64KiB.

`settings.access_log` is an optional boolean, default false. Apply enables HTTP
server access logs in the existing bounded logd RAM ring. Diagnostic RPC and
export expose safe event/status evidence only; see DIAGNOSTICS.md.

`tls_save` also accepts an optional `site_challenges` object keyed by existing
site domain. Global and site verification choices validate/stage atomically;
unknown sites/methods and incompatible wildcard changes reject the whole edit.
The scope preserves private snippets and manual content without fetching them
into the TLS page. Notification settings and certificate details open on that
page in native modals; legacy inventory/notification routes render the TLS view.


The TLS page also owns the optional ACME account email. `tls_save` accepts an
optional `email` in the manager API. The public RPC updates it only when
`update_email=true`, so older clients omitting the new field retain their email;
`email=''` plus that flag explicitly clears it. Email changes use the same
validation, session staging, stale-revision checks and Apply as TLS defaults.
Global settings retain the email without exposing another editor.

Service control checkbox edits participate in the Global settings page's shared
Save / Save & Apply flow. The service panel has no separate save button. A
service-only save stages only desired service options and never rewrites form
configuration. Unchanged upstream lists and site order are not rewritten during
encoding: native del/add_list/reorder deltas occur only for actual changes.
Previously staged native deltas remain intact until the user applies or reverts.
