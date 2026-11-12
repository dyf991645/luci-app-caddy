# Safe log and local deployment evidence (ticket 10)

The installed `diagnostics.uc` returns `{logs(filters),status(),probe(request)}`.
Constructor root/command/binary/logfile overrides are local fixture seams only;
RPC accepts no executable, file path, URL or host override.

Read ACL methods `logs({level,kind})` and `diagnostics()` cannot invoke service
operations. `backend_probe({confirm:true,offset:0})` requires write ACL and an explicit
button click. The page automatically traverses every unique validated URL from the saved form
configuration in batches of eight, appending results as each batch completes.
Each request returns total, next_offset and complete; offsets must be nonnegative
integers and cannot supply arbitrary targets. Later failures retain earlier results
and permit a fresh run. Manual source targets are unsupported. The fixed helper execs BusyBox nc
(no HTTP/credentials), with a 2500ms ucode deadline per target. One exclusive
probe lock bounds concurrent work. TCP acceptance does not establish HTTP
health, TLS trust, authentication, or public ACME reachability. Service actions
remain exclusively in the existing action method and fixed allowlist.

`status()` collects actual Caddy version/modules, kernel/APK architecture, APK
installed version, firmware version/target, procd state and allowed HOME/XDG
comparisons (never full process environment), root/active file permissions, and
TCP listeners. Known owners are `caddy`, `uhttpd`, `other`, `unknown`; no arbitrary
process command line is returned. Draft form port checks distinguish another
service conflict from Caddy's own listener. Last-active HTTP ports come from
backend-only active JSON. Manual draft mode does not reuse inactive form ports.
Missing/failed helpers, module queries and listener queries remain unknown;
missing binaries never produce invented versions or module information. No
active JSON/source/provider configuration is returned.

The fixed log helper reads logd once, at most256 lines, under a2-second deadline
and128KiB file/read cap. Temporary output is0600 under the0700 manager root,
protected by an exclusive reader lock and deleted after reading. Oversized,
symlinked or unavailable sources fail closed. Production procd stdout/stderr
continues into the existing logd RAM ring; this app creates no persistent raw
log file, does not follow logs, change global logd settings or start a second
logger. The system's configured/default ring size and existence of an existing
file/remote destination are reported as configuration evidence, not proof of
its current running configuration. Existing system destinations need separate
retention/access review. The log window is partial and evicts old evidence;
empty/omitted/unknown history is not a success claim.

**No raw log message, error, URL, identifier, user, header, query, body, config,
manual source, profile hash, token or key is returned or exported.** This is an
allowlist projection, not a blacklist that depends on knowing secret values.
Supported Caddy2.11.8 certificate messages become fixed event categories;
known runtime loggers become generic service events/warnings/errors. Access
records contain only actual timestamp, fixed logger/kind, level and valid HTTP
status. Arbitrary logger names/messages and non-JSON lines are omitted. Numeric
timestamps are source evidence, not substituted collection time. Level/type
filters operate after projection; the browser download contains precisely
these safe records. The viewer deliberately cannot diagnose arbitrary provider
text: issuer errors require checking provider permissions/configuration through
trusted administrator channels.

`settings.access_log` is optional boolean (default false). Form compilation adds
HTTP server logging to stdout/stderr only when enabled; procd routes it into
the same bounded system ring. Manual Caddyfile `log` controls remain independent;
custom file/network log destinations are not read, exported, or managed by this
viewer. Complete manual configuration remains root-equivalent as documented
in SCHEMA.md.

Configuration CLI operations retain at most32 fixed outcome records in a0600
private event file. Raw CLI output is never stored there. Caddyfile adaptation
uses a0600 bounded stderr temporary file, extracts only a numeric line after
the fixed source filename, then deletes stderr. RPC errors can include only
`{category:'caddyfile_syntax',source:'manual'|'advanced_snippet',line}`; snippets
subtract the synthetic wrapper line. Syntax literals never enter RPC. Validation
and load/provider failures retain fixed safe messages. Event bookkeeping is
best effort and never turns a successful Caddy operation into a failed apply.

Public HTTP-01 requires Internet80 to the selected internal HTTP port (default
18080); TLS-ALPN-01 requires Internet443 to internal HTTPS (default18443).
DNS-01 requires provider API acceptance and TXT propagation. A local listener
cannot prove public DNS, NAT or firewall behavior. Direct nonstandard-port
browser addresses and generated redirects include the configured port; public
443 forwarding requires a matching external-address/redirect plan. The app does
not change uhttpd, firewall, DNS, NAT or trust settings.
