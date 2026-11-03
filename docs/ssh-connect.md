# SSH Connect development preview

SSH Connect is an optional, separately installed extension. The current published
catalogs offer SSH0.3.1 for **Linux ARM64**. This source candidate also offers the
unchanged SSH0.3.1 archive for **macOS ARM64**, subject to catalog integration and
public readback; source changes do not themselves change the published offer.
It is not bundled with the terminal, a stable SDK, or an SSH broker. Windows and
other targets are not qualified by this work.

The separately published SSH0.3.1 archive and its original checksum/receipt are
immutable. Current source includes a later capability-unavailable message correction;
it is not present in that archive. An isolated test build may use a distinct output
path, but must not be confused with or replace the published archive. A maintainer
must assign a new extension version before publishing changed bytes. Install an
offered archive through Settings → Extensions and review the ordinary trusted-code
warning. Open **SSH Connect** from File, the Command Palette or the terminal context
menu. There is no new toolbar or default shortcut. Host source also
supports an optional `toggleSshConnect` binding in Settings → Shortcuts, reusing
the same entry point once per key press. Missing/disabled/unsupported tools do
not consume that key. A host change does not update an installed extension, and
building an archive alone does not publish it.

Source version 0.3.1 requires host 0.24.0-dev.8 or later for its read-only
appearance and interface-language subscriptions. Compact controls share the terminal's theme tokens;
the base surface reveals the parent window's single tint rather than painting
an opaque background. Live theme/opacity updates retain search, quick-connect
and other view state, including while hidden. Native blur remains host-owned
and compositor dependent. The bundled stylesheet includes all shared tokens.
Controls, accessible names and notices follow the host's `en-US` or `pt-BR`
interface language. Live language changes retain drafts, selected aliases, focus
and pending operations without rediscovery or automatic connection retries.
Alias names and connection targets remain literal, untranslated data.
Version 0.3.0 is separately published; the historical 0.1.0 archive remains
immutable. Updating the host alone does not update a separately installed extension:
review and deliberately install the newer extension. Current source leaves the
visible SSH Connect identity to the host header while retaining its named child
region and OpenSSH sections. The published 0.3.0 archive keeps its original
heading, including on a newer host. The separately published
[SSH0.3.1 archive](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.1)
uses the shared panel header. The exact Linux ARM64 host0.24.0/SSH0.3.1 local
pair and a bounded older dev.11/local-archive pair passed with synthetic clients;
this does not establish real SSH authentication or remote connectivity. The
original archive/checksum/receipt were byte-verified separately, and the receipt
remains `not-run`. Catalog promotion and the separate
[public-HTTPS checkpoint](#ssh-031-linux-public-catalog-checkpoint) did not
replace that receipt. The stable-pair [#746](https://github.com/luizomf/omxterm/issues/746)
diagnostic remains unexplained.

## Installing the distributed preview

The [stable OMXTerm 0.24.0 host](https://github.com/luizomf/omxterm/releases/tag/v0.24.0)
and the separately published [SSH Connect 0.3.1 archive](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.1)
are distinct downloads. On Linux ARM64, **Browse official extensions** currently
offers SSH0.3.1. The source catalogs propose the same original archive on macOS
ARM64 after integration and verified promotion; until then the published macOS
catalog marks it incompatible. Local/link installation checks host/API compatibility,
not catalog target qualification. Check this guide and the selected release rather
than treating a successful manual install as a platform-support guarantee.

Review the version, digest and trusted-code warning. Installation is dormant; open
SSH Connect separately to activate it. Official does not mean sandboxed. The
archive requires host 0.24.0-dev.8 or later, but a minimum version alone does not
establish platform support or qualify every admitted host. The immutable SSH0.3.1
archive's capability-unavailable message still mentions only Linux ARM64; that
historical wording is not a current macOS compatibility test. Stable host0.24.0
also incorrectly describes extension management itself as Linux ARM64-only in
Settings; the host-source correction is not present in that immutable release.

The earlier [Linux ARM64 host 0.24.0-dev.11 prerelease](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11)
and [SSH Connect 0.3.0 release](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.0)
remain a separate historical exact pair. Stable 0.23.0 and 0.23.0-dev.9 cannot
run SSH Connect. Their earlier catalog checkpoint does not establish the new offer.

The published [ssh-0.3.0-77937fc.omxext archive](https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.3.0/ssh-0.3.0-77937fc.omxext)
is 11,572 bytes, SHA-256
`13b265058ba051bb1dcf57ba1cef9347ed8d6851069a4ad1206af0469feb46cf`.
The immutable prerelease was published on 2026-10-30 at 20:07:34 UTC; draft and
anonymous public downloads of the archive and both original sidecars matched
byte-for-byte. Tag `ext-ssh-v0.3.0` identifies build source
`77937fcf87ae71a68709111df7ace7359fb3f0b6`, not the later source-integration squash.
The original receipt retains build-time `qualification.status: not-run` and
`intendedHost: 0.24.0-dev.19`; later qualification used public dev.11 instead.
That AppImage's SHA-256 is
`04344920a6229baf695d01e03fedcf5396c897f6805d6ed2ed4b9f4104f67c86`.

The exact dev.11/SSH0.3 pair passed the 12-cell appearance/language and
synthetic Connect campaign, including normal/narrow geometry, retained state,
core-owned terminals and joined Quit. A noncomposited nested desktop does not
qualify native blur or universal transparency readability. Controlled inputs and
synthetic clients do not establish real authentication or remote connectivity.
Public asset verification and the subsequent catalog checkpoint remain separate
evidence boundaries.

### Historical 0.1.0 preview

The original [ssh-6d939f0.omxext archive](https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.1.0/ssh-6d939f0.omxext)
retains its source-named filename and original checksum/receipt unchanged:
version0.1.0,9418bytes,SHA-256
`d11d16df09876d20a6fc766fcb1e5d76e2214d0d0965ad90be47496e4b066699`.
The receipt identifies source6d939f0 and build-time qualification `not-run`;
subsequent package evidence is separate, not a rewritten build receipt.

The historical dev.0/SSH0.1 host/archive pair passed a synthetic-client campaign
and host FULL verifier; unchanged Files0.1.0 passed its lifecycle on that host.
Those Files results do not establish Files0.1 compatibility with dev.11. These are not a real SSH
connectivity/authentication campaign or proof of public catalog consumption.
The [release procedure](release.md#ssh-preview-publication) requires a separate
public-only checkpoint after rollout; record its actual outcome, never infer it
from source integration or these instructions.

## Public distribution checkpoint

The SSH0.3 catalog promotion at `6f4355d6573b0fb4e3f8591655d7db789106a8a7`
passed independent review, full formatting/types/lint and 4,305 headless tests
(66 skipped). Fixed raw endpoint bytes matched SHA-256
`0a446b1a3c53960508f0d0b16a951e5f889d9998230832624d8f1edddef6dd15` after the
initial CDN cache expired. Files and Snippets entries were preserved.

A separate ordinary-user Linux ARM64 public-HTTPS checkpoint passed using fresh
public dev.11 AppImage/SSH0.3 downloads with the hashes above. Production Settings
installed and reinstalled the captured archive with two digest-bound consents;
installation stayed dormant, explicit activation worked, reinstall/disable joined
both backends, uninstall completed, and the same original terminal/Surface
remained usable. Normal Busy Quit joined the PTY and main exit0; independent
process/profile/lane absence and unchanged source/artifact hashes were checked.
No SSH client was executed. Controlled input/dialogs, extracted AppImage execution
and noncomposited rendering do not qualify real authentication, physical input,
FUSE/helper installation, native blur or broad GPU support.

The initial public run failed because its observer required every Settings button
to be enabled, including an intentionally incompatible Files card. The failure
was retained; fixture `f65c1c1d38a5a5866d2fe5118b75d575c21c5f55` scopes readiness
to the page's own acquisition controls, with busy/missing-control negatives checked.
The corrected run passed without changing product or archive bytes. The retained
terminal capture was inspected; the two catalog captures lagged DOM transitions
and are **not** additional visual qualification. Public lifecycle proof comes from
actual production actions/receipts; SSH appearance evidence is the separate
12-cell exact-package campaign above.

### SSH 0.3.1 Linux public-catalog checkpoint

🤖 AI-assisted.

On 2026-11-02, an ordinary-user Ubuntu26.04 ARM64 guest used the retained,
**locally built**, extracted OMXTerm0.24.0 AppImage (128,175,114 bytes, SHA-256
`0dd3ff2c0ad9dc069c5c22daf735acb84633dce48e484532882f9a375b53c913`)
and the separately published SSH0.3.1 archive (11,606 bytes, SHA-256
`be7589f44a65c8ab763b85e78863deeb487094bd33a936923988fe41bd846b0b`).
Both were built from `8717d47327eeab14f522b1b2a448216860d0923d`; the passing
fixture used `b5ca2aea6087531e523d026424ae0be35a040be3`. The host was not
downloaded from a public stable release. Its build inputs and the verifier-only
stderr-truncation addition have the separate provenance described in the
[Files Linux checkpoint](files-development-preview.md#files-060-linux-public-catalog-checkpoint).

The independently read-back legacy catalog SHA-256 was
`2ab4f15d697559a261a19dc014297200a277e60289e67bf788303d6fbc0eacda`.
Production HTTPS, with no controlled transport or local/link fallback, supplied
both archive downloads. Passive observations bound the actual catalog bytes,
selected snapshot and archive bytes to controlled Official consents at installation
generations 0 and 1. Nine checks passed: dormant install/reinstall, activation,
retirement and management, the retained usable PTY/Surface and normal joined Quit.
Both backends closed with exit 0; the main exited 0 and owned processes settled.
Separate WebContents captures showed the SSH0.3.1 Install/Reinstall cards and
surviving terminal. No SSH client was executed.

The first public attempt reached joined PTY/backend Quit but the main did not exit
within five seconds and recovery terminated it with SIGTERM; that failed occurrence
remains recorded. The observer incorrectly required the extensions IPC handler to
remain present after production shutdown had removed it. Its teardown was corrected,
and a directed subsequent run passed; the first timeout's cause was not proved.
The passing run retained two Chromium/X portal atom-cache diagnostics in stderr.
No user-facing failure was demonstrated in that occurrence, but their cause and
impact remain unknown. It did not show the earlier #746 diagnostic, which remains
unexplained. Synthetic input, controlled consent and extracted-AppImage execution do
not qualify physical input, real SSH/authentication, FUSE/helper installation,
compositor behavior, a downloaded public stable host or every admitted version.

On an assigned idle ordinary-user Linux ARM64 guest, reuse the opt-in
`test/integration/ssh-packaged.test.ts` with absolute `OMXTERM_SSH_PACKAGED_APPIMAGE`,
`ARCHIVE`, `EVIDENCE` paths and `APPIMAGE_SHA256`, `ARCHIVE_SHA256`, `VERSION`
(all names prefixed `OMXTERM_SSH_PACKAGED_`). For the bounded public-only path,
also set `OMXTERM_SSH_PACKAGED_CATALOG=public` and
`OMXTERM_SSH_PACKAGED_CATALOG_SHA256` to the promoted catalog's exact digest.

```sh
npm test -- test/integration/ssh-packaged.test.ts
```

`OMXTERM_SSH_PACKAGED_EXTENSION_VERSION` selects the expected archive version
(default `0.1.0`). With version `0.3.0` or `0.3.1`, optional
`OMXTERM_SSH_PACKAGED_APPEARANCE=1` adds normal/narrow dark/light opacity and
visible/hidden language checks before the synthetic Connect campaign. It requires
an assigned single-screen desktop lane, retains captures for visual inspection,
and does not establish native blur in a noncomposited nested lane. It cannot be
combined with public-catalog mode. Exact-package appearance/language qualification
is separate from public catalog consumption; neither a source build nor the
historical compact 0.2.0 rendering campaign proves a new archive's Connect behavior.
The explicit `0.24.0` / `0.3.1` pair also checks captured trust identity and the
visible host header, named child region and controls, retaining separate host and
child images for inspection. This does not qualify other compatible host versions.

The public mode verifies a separate fixed-endpoint readback, then the unchanged
packaged app independently browses the production endpoint and installs the SSH
card with captured-digest consent. It checks dormant installation, activation,
catalog Reinstall/actual backend retirement, fresh activation, Disable/Uninstall,
the same local PTY/Surface and normal joined Quit. It does not run the longer
synthetic argv/exit/keyboard campaign or execute an SSH client. No endpoint
substitution, custom CA or source product runtime is used. Native consent and
input are fixture-controlled; inspect the retained catalog/terminal captures.
Catalog captures require the selected, visible Extensions page and exact enabled
SSH action, with the title/action inside the clipped viewport. One three-second
deadline bounds two renderer-frame opportunities, capture, target revalidation
and action dispatch. The fixture saves the exact checked image before clicking;
unrelated incompatible cards do not block readiness. These ordering and geometry
checks do not prove compositor presentation: inspect the saved pixels for the
expected SSH version and Install/Reinstall action before accepting visual evidence.
For the `0.24.0` / `0.3.1` pair, passive observations bind the actual endpoint
bytes, captured selection, public archive bytes and exact Official trust warning
and generations; no request or response transport is substituted. The supervisor
pass covers scenario and owned shutdown only: truncated native stderr fails this
checkpoint, and complete stderr requires separate manual review. Unknown
diagnostics, including the observed #746 presentation rejection, are not waived.
A locally supplied host is not a publicly downloaded stable host.

Failure receipts/profiles are retained; successful cleanup does not turn a failed
scenario into a pass. Existing process ownership and exact AppImage/asar checks
remain in force. Without the public-mode inputs the original synthetic campaign
is unchanged. Public execution belongs after asset publication and fixed-catalog
promotion, not during source preparation.

## macOS ARM64 exact-pair checkpoint

On macOS 27.0.1 ARM64, the retained original OMXTerm0.24.0 DMG
(SHA-256 `88e66b764cc9fc4fa3a6cfb2c0e081dce5089631a8f8b8640ad875214e8bc34f`)
and SSH0.3.1 archive (SHA-256
`be7589f44a65c8ab763b85e78863deeb487094bd33a936923988fe41bd846b0b`)
passed bounded local-install scenarios with controlled consent and synthetic input.
A synthetic client verified alias import, literal argv, retained exit, Hide/Close,
Disable with a surviving core SSH terminal, and joined normal Quit. Separately,
production Connect invoked a wrapper with literal `['--', 'fixture-local']`;
the wrapper added `-F` and `-E` to isolate configuration and capture diagnostics,
then exec'd the guest's verified `/usr/bin/ssh` (OpenSSH10.3p1). Client and owned
loopback server both recorded public-key authentication using generated keys.
The SSH session ran no remote shell or command; the client ended on signal 1 and
server on 255 during normal app shutdown. The host/backend joined; these are not
SSH exit-0 claims.

This is not unwrapped SSH/config behavior, a physical-input/accessibility or
remote-shell campaign, all-host qualification, or actual macOS public HTTPS/catalog
consumption. The app's bounded stderr tail retained sandbox-extension permission
warnings of unknown cause/impact and has no truncation indicator. Three earlier
GUI attempts failed; a corrected observer waited for the retained panel to become
visible before Close and the later distinct occurrence passed. Original archive
receipt qualification remains `not-run`; these subsequent checks are separate.

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
The historical Files 0.1.0 preview receives no SSH capability. Hosts
0.24.0-dev.0 through 0.24.0-dev.5 explicitly admit its original
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
build receipts alone are not qualification. The bounded macOS loopback check above
is not a general remote-connectivity campaign. Windows and other-platform preview
enablement and physical-keyboard/accessibility matrices remain unqualified.

The original #622/#671 proposal by @ruscher and `luizomf/sshtoolkit` informed the
design. This small parser/grammar is independently implemented; the archive keeps
MIT licensing and its design acknowledgement in `NOTICE`.
