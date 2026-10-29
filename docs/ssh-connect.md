# SSH Connect development preview

SSH Connect is an optional, separately installed extension for the **Linux ARM64
preview**, first supported by OMXTerm **0.24.0-dev.0**. It is not bundled with the
terminal, a stable SDK, an SSH broker, or a cross-platform availability claim.

Build the committed source with `node scripts/build-ssh-extension.mjs`. The
builder produces `dist/extensions/ssh-0.1.0.omxext`, a SHA-256 sidecar and an
unqualified source/tool receipt; existing outputs are never overwritten. Install
the archive through Settings → Extensions and review the ordinary trusted-code
warning. Open **SSH Connect** from File, the Command Palette or the terminal
context menu. There is no new toolbar or default shortcut. Building an archive
alone does not publish it.

## Installing the distributed preview

Use the [Linux ARM64 host 0.24.0-dev.0 prerelease](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.0)
with the separate [SSH Connect 0.1.0 release](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.1.0).
Neither is Latest; stable0.23.0 and dev.9 cannot run SSH Connect. In Settings →
Extensions, explicitly **Browse official extensions**, select SSH Connect and
review its version/digest and trusted-code warning. Installation is dormant;
open SSH Connect separately to activate it. Official does not mean sandboxed.

Local-file or **Install from link** installation also works with the exact
[ssh-6d939f0.omxext archive](https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.1.0/ssh-6d939f0.omxext).
Its source-named filename and original checksum/receipt are retained unchanged:
version0.1.0,9418bytes,SHA-256
`d11d16df09876d20a6fc766fcb1e5d76e2214d0d0965ad90be47496e4b066699`.
The receipt identifies source6d939f0 and build-time qualification `not-run`;
subsequent package evidence is separate, not a rewritten build receipt.

The exact host/archive passed a synthetic-client campaign and host FULL verifier;
unchanged Files0.1.0 passed its lifecycle on this host. These are not a real SSH
connectivity/authentication campaign or proof of public catalog consumption.
The [release procedure](release.md#ssh-preview-publication) requires a separate
public-only checkpoint after rollout; record its actual outcome, never infer it
from source integration or these instructions.

## Public distribution checkpoint

On an assigned idle ordinary-user Linux ARM64 guest, reuse the opt-in
`test/integration/ssh-packaged.test.ts` with absolute `OMXTERM_SSH_PACKAGED_APPIMAGE`,
`ARCHIVE`, `EVIDENCE` paths and `APPIMAGE_SHA256`, `ARCHIVE_SHA256`, `VERSION`
(all names prefixed `OMXTERM_SSH_PACKAGED_`). For the bounded public-only path,
also set `OMXTERM_SSH_PACKAGED_CATALOG=public` and
`OMXTERM_SSH_PACKAGED_CATALOG_SHA256` to the promoted catalog's exact digest.

```sh
npm test -- test/integration/ssh-packaged.test.ts
```

The public mode verifies a separate fixed-endpoint readback, then the unchanged
packaged app independently browses the production endpoint and installs the SSH
card with captured-digest consent. It checks dormant installation, activation,
catalog Reinstall/actual backend retirement, fresh activation, Disable/Uninstall,
the same local PTY/Surface and normal joined Quit. It does not run the longer
synthetic argv/exit/keyboard campaign or execute an SSH client. No endpoint
substitution, custom CA or source product runtime is used. Native consent and
input are fixture-controlled; inspect the retained catalog/terminal captures.
Failure receipts/profiles are retained; successful cleanup does not turn a failed
scenario into a pass. Existing process ownership and exact AppImage/asar checks
remain in force. Without the public-mode inputs the original synthetic campaign
is unchanged. Public execution belongs after asset publication and fixed-catalog
promotion, not during source preparation.

## Connecting

Search filters the displayed aliases; it never interprets an unmatched query as
a destination. Select a row, or use the separate **Quick connect** field:

- `work-server`
- `alice@example.org:2222`
- `alice@[2001:db8::1]:2222`

Host/alias names allow 1–253 ASCII letters, digits, underscore, dot and hyphen,
without a leading hyphen. Users have the same grammar with a 64-character limit.
Ports are digits from 1 through 65535. Omitted user/port preserve OpenSSH
configuration/defaults. The field accepts at most 384 characters and trims only
surrounding ASCII spaces. IPv6 requires brackets; zone identifiers, Unicode
names, URLs, remote commands and additional options are not supported here.
Use ordinary terminal `ssh` for other workflows.

Keyboard Connect captures the target at Enter down and dispatches only after
release; repeats are consumed. Editing, hiding, blur or a lost release cancels an
undispatched gesture. Pointer Connect is immediate. Pending controls prevent
accidental duplicate submission. An accepted result means a **core terminal tab
was accepted**, not that authentication or connection succeeded. An uncertain
reply says a terminal may already have opened; check tabs rather than retrying
automatically. In the companion panel, Connect opens a new Terminal Tab while
keeping the panel visible and existing sessions alive. Focus transfers only while
this same panel page owns foreground interaction and no modal owns input;
otherwise the tab is appended in the background.

Main resolves an executable regular `ssh` file (symlinks allowed) only from
absolute, nonempty application-PATH directories at Connect time. That PATH can
differ from a login shell's PATH and is not publisher verification. Missing
OpenSSH leaves an actionable page error and opens no tab. Later spawn failure
uses the ordinary native failure acknowledgement. OMXTerm never installs ssh.

Main builds literal argv: optional `-l USER`, optional `-p PORT`, then `-- HOST`.
There is no interpolated shell command, caller-selected executable/environment,
backend PTY, credential vault, connection history, config editing or reconnect.
OpenSSH owns authentication, host-key prompts and network access. **Current user
and system configuration still applies**, including configured commands, forwards,
agent access and sockets; deliberate connection can write `known_hosts`.
Read-only discovery does not mean the OpenSSH process is read-only.

## Incomplete alias index

Opening and explicit Refresh read the account's `.ssh/config`. Missing config is
normal. Discovery never invokes `ssh -G`, Match exec, a shell, DNS or a network
probe, and never rewrites SSH files. It lists literal Host candidates, not
resolved HostName/User/key metadata or a promise that a condition applies.

The small tokenizer supports case-insensitive directives, whitespace or `=`,
double quotes and comments outside quotes. Malformed quotes, escapes and
unsupported tokens report incompleteness. Later Host directives remain visible
after Match. Includes are followed only in unconditional context: initially, or
after exact `Host *` / `Match all`. Traversal is inline: child Host/Match state
continues in the parent. Relative includes always anchor at `.ssh`, even inside
nested files. Absolute paths, `~/`, sorted `*` and `?` are supported; environment,
percent, other-user tilde, bracket classes and recursive `**` are not.

Product bounds: depth16,64 file visits,256KiB per file,1MiB aggregate reads,
4096 characters per line,4096 visited glob entries and256 unique aliases.
Files are opened nonblocking and checked as regular before bounded reads;
active-stack realpath cycles are refused, while symlinked regular configs work.
Partial results carry fixed reason counts. Quick connect remains available for
omitted aliases. One result fits both existing JSON capture hops without changing
runtime limits. Refresh is serialized per view; stale replies are invalidated,
not magically cancelled. Eight actual backend discoveries may run at once;
cancellation/timeouts do not release slots before the filesystem work settles.

## Core lifetime

An SSH terminal belongs to core after transfer, independent of extension disable,
update, uninstall or backend death. It retains no extension package lease.
Live SSH is Busy for close/Quit; normal Quit still waits for actual native exit.
Exit0 closes normally. Ordinary nonzero exit retains the readable/copyable/
searchable Surface with an exit-code notice and Close. This is not an inferred
authentication error. Input, PTY resize and protocol replies stop; local refit,
zoom, theme and final renderer/font disposal remain available. Ended content is
not Busy. Startup failures/signals and explicitly authorized removal keep their
existing precedence.

Known SSH sessions never supply local OSC7 directory provenance, even with an
empty/local hostname. New tabs/splits start the Default Shell at home, not SSH.
Remote titles remain display-only, with validated `SSH · HOST` fallback. This
does not detect manually typed ssh inside an ordinary shell.

## Capability and admission

The optional exact manifest declaration is
`"capabilities": ["terminal.openSsh.v1"]`; unknown declarations are rejected.
The unchanged Files 0.1.0 preview remains compatible and receives no SSH
capability. Hosts 0.24.0-dev.0 through 0.24.0-dev.3 explicitly admit its original
`>=0.23.0-dev.8 <0.24.0` host range at both catalog and installed-store checks;
ordinary semver would exclude this new prerelease tuple. This exception is
limited to those enumerated host versions, Files identity/version and its original host/API
ranges. API compatibility and target checks still apply. It does not modify the
published Files archive or admit other packages or future host versions.
The own-view bridge's `{operation:"host.capabilities"}` query reports declared
available selectors. The concrete request is
`{operation:"terminal.openSsh.v1",target:{host,user?,port?}}` with exact keys.
It is not a generic terminal SDK or a security sandbox for trusted Node code.

Actual child/main-frame routing binds requests to the captured pin, generation,
digest, local revision and original window/view lifetime. The companion panel
survives the terminal that originally opened it; its SSH launches remain new,
independently core-owned terminal sessions. Store
revalidation is the first authorization point. A different instance's later
change cannot retroactively revoke admission. A separate synchronous main
transfer rechecks local revocation before committing a one-shot core pane token;
local revocation before that point wins. No store writer lock spans rendering or
spawn. Renderer acknowledgement is notification, not authorization.

Tokens are owner-bound, at most one pending per view and32 application-wide,
removed on consumption/cancellation/window loss/Quit, with a60-second unconsumed
expiry. They cannot select startup `-e` or another window, start provisionally, or
allocate twice. A notification failure or missing acknowledgement is uncertain,
never automatically replayed. Closing a pending pane cancels its token.

See [ADR0041](adr/0041-transfer-ssh-launches-to-core.md). Controlled tests cover
input/index/wire budgets, view gesture/admission and retained Surface behavior.
Native/package evidence must identify exact host and separate archive hashes;
build receipts alone are not qualification. No real OpenSSH authentication or
remote connectivity campaign is claimed by this implementation. Other-platform
preview enablement and physical-keyboard/accessibility matrices remain unqualified.

The original #622/#671 proposal by @ruscher and `luizomf/sshtoolkit` informed the
design. This small parser/grammar is independently implemented; the archive keeps
MIT licensing and its design acknowledgement in `NOTICE`.
