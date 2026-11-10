# Access authentication contract

Schema2 adds optional `auth.basic={profile:"basic-<revision>-<time>"}` globally.
There is no global authentication mode. Each site has `auth={mode:"none"}` or
`auth={mode:"basic",source:"global"}` or
`auth={mode:"basic",source:"independent",profile:"basic-..."}`.
Missing site auth means none. Ticket08 extends global `auth` with `authelia`
parameters and site mode with `authelia`, preserving this reference contract.

`basic_profile_save({scope,config,users,expected_revision})` requires write ACL.
Scope is `global` or an existing site's domain. Config is the editor's entire
configuration (or omitted to use saved draft). This saves all current editor
changes and creates a new draft revision, never applies. Each account contains
`username` and exactly one of `password`, `hash`, or `retain:true`.
An omitted/removed account is deleted; retain only matches a prior username in
that scope's profile. Passwords cross a private stdin pipe to actual Caddy's
`hash-password --algorithm bcrypt`; no plaintext file or process argument is
created. Passwords accept1–72bytes and exclude CR/LF/NUL. Existing advanced
hash input accepts bcrypt cost4–16. Hashes never leave the manager via RPC,
including writer `draft_edit`, preview, mutation responses and errors.

Private mode0600 immutable `basic-profiles/<ref>.json` versions contain usernames
and hashes. The mode0700 manager root owns the directory. Public drafts contain
only references. Old versions are retained for last-active/recovery stability;
this ticket does not garbage-collect profiles. Saving never rewrites an active
profile. A failed validate/load therefore retains old credentials, including
service restart/reload from durable active.json. Generated active/candidate JSON
necessarily contains hashes and remains private; generated preview substitutes
`[private hash]`. No export method reads active/candidate JSON.

State adds `basic_profiles` (reference -> username metadata only) and
`affected_domains` (global Basic Auth references when draft differs from active).
The native page displays affected domains before Apply. Global reference is
resolved while compiling the draft, so all referencing sites change together;
independent profiles remain unchanged. Authentication executes inside the
matching path route before advanced snippets, prefix stripping and proxy.
Unmatched paths return404 without an authentication challenge.

Manual source retains form profiles but never resolves or applies them;
account mutation is refused and native account/content forms are disabled.
Service actions remain independent.
