# SSH Connect development

SSH Connect is an optional extension that opens OpenSSH sessions in new
OMXTerm terminal tabs. It ships as a separate `.omxext` archive, not inside the
host. Users install it from **Settings → Extensions** and open it from File, the
Command Palette or the terminal context menu, or with an optional
`toggleSshConnect` shortcut. The [SSH Connect user guide](../ssh-connect.md) covers
installation and connecting.

The extension lists `Host` aliases from `~/.ssh/config` and offers a quick-connect
field. It never runs `ssh` itself. It asks core, through one typed capability, to
open a terminal tab that runs the system `ssh`. Core owns that tab from then on.
It is not an SDK, an SSH broker, a credential vault or a reconnect service.

## Where the code lives

- `extensions/ssh/extension.json`: id `omxterm.ssh`, version, host range, API,
  the `terminal.openSsh.v1` and `links.open.v1` capabilities and the `docs`
  link.
- `extensions/ssh/page.ts`, `view.ts`, `index.html`, `ssh.css`: the panel page.
  It follows the host theme and interface language (`en-US`, `pt-BR`) through
  read-only subscriptions; strings live in `messages.ts`.
- `extensions/ssh/backend.ts`, `discovery.ts`: the backend and the alias index.
- `src/shared/ssh-target.ts`: target grammar and argv.
- `src/main/ssh-terminal-launch.ts`, `ssh-terminal-ipc.ts`,
  `application-extension-views.ts`: capability routing, admission and the handoff
  token.

## Connecting

- Search only filters the alias list; an unmatched query is never a destination.
  The separate **Quick connect** field takes `[user@]host[:port]`, such as
  `alice@[2001:db8::1]:2222`.
- Hosts and aliases are 1–253 ASCII letters, digits, `_`, `.` and `-`, without a
  leading hyphen. Users follow the same rule up to 64 characters. Ports are
  1–65535. The field accepts at most 384 characters and trims surrounding ASCII
  spaces. IPv6 needs brackets. Zone ids, Unicode names, URLs, remote commands and
  extra options are refused.
- Keyboard Connect captures the target on Enter down and dispatches on release;
  repeats are consumed. Editing, hiding, blur or a lost release cancels it.
  Pointer Connect is immediate. Pending controls block duplicate submits.
- An accepted reply means core accepted a terminal tab, not that SSH
  authenticated. An uncertain reply says a tab may already exist, and the page
  never retries on its own.
- The new tab takes focus only while the panel owns foreground interaction and
  no modal owns input. Otherwise it opens in the background. The panel stays
  open.

## Capability and admission

[ADR 0041](../adr/0041-transfer-ssh-launches-to-core.md) records why launches move to
core.

- The manifest declares `"capabilities": ["terminal.openSsh.v1", "links.open.v1"]`;
  unknown declarations are rejected. The view can ask
  `{operation: "host.capabilities"}` for the available selectors.
- The page's **Learn more** link sends `{operation: "links.open.v1", link: "docs"}`;
  main opens the manifest's `docs` URL (this project's
  [user guide](../ssh-connect.md))
  ([ADR 0045](../adr/0045-open-declared-extension-links-by-id.md)). Source from
  0.4.0 on needs host `>=0.27.0-dev.0`; the published 0.3.2 archive keeps its
  range.
- The request is `{operation: "terminal.openSsh.v1", target: {host, user?, port?}}`
  with exact keys.
- Main validates the target, then looks for an executable regular `ssh` file
  (symlinks allowed) in the absolute directories of the application `PATH` at
  Connect time. That `PATH` can differ from a login shell's. If `ssh` is missing,
  the page shows an error and no tab opens. OMXTerm never installs `ssh`.
- Main builds literal argv: optional `-l USER`, optional `-p PORT`, then
  `-- HOST`. There is no shell string and the caller can't pick the executable or
  environment.
- Requests are bound to the view's captured package pin, generation, digest,
  local revision and original window. Store revalidation authorizes the request.
  A separate synchronous transfer rechecks local revocation, then commits a
  one-shot core pane token. No lock spans rendering or spawn.
- Tokens belong to one window and one pending pane. There is at most one per view
  and 32 per application. They expire after 60 seconds unused and are removed on
  use, cancellation, window loss or Quit. They can't select startup `-e`, another
  window, or start twice.
- Renderer acknowledgement is a notification, not authorization. A missing
  acknowledgement makes the outcome unknown, and it is never replayed.

## Core-owned SSH tabs

- After transfer the session belongs to core. Disabling, updating or uninstalling
  the extension, or losing its backend, doesn't end it.
- A live SSH session counts as Busy for close and Quit.
- Exit 0 closes the pane. A nonzero exit keeps a readable, copyable, searchable
  Surface with an exit-code notice and Close. Input, resize and protocol replies
  stop. Ended content isn't Busy. Startup failures and signals keep their
  acknowledgement behavior.
- SSH output never feeds local OSC 7 directory tracking. New tabs and splits
  start the default shell at home.
- Remote titles are display-only, with an `SSH · HOST` fallback. `ssh` typed in an
  ordinary shell isn't detected.

## Alias index

- Opening and **Refresh** read the account's `.ssh/config`; a missing file is
  normal. Discovery never runs `ssh -G`, `Match exec`, a shell, DNS or a network
  probe, and never writes SSH files. It lists literal `Host` names, not resolved
  `HostName`, user or key data.
- The tokenizer handles case-insensitive directives, whitespace or `=`, double
  quotes and comments outside quotes. Malformed quotes, escapes and unsupported
  tokens mark the result incomplete.
- `Include` is followed only in unconditional context: at the start, or after
  exact `Host *` or `Match all`. Included Host/Match state continues in the
  parent. Relative includes anchor at `.ssh`, even in nested files. Absolute
  paths, `~/`, `*` and `?` work; environment variables, `%` tokens, `~user`,
  bracket classes and `**` don't.
- Bounds: depth 16, 64 file visits, 256 KiB per file, 1 MiB total, 4,096
  characters per line, 4,096 glob entries and 256 aliases. Files are opened
  non-blocking and must be regular. Include cycles are refused; symlinked config
  files work.
- A partial result carries fixed reason counts. Quick connect still works for
  missing aliases.
- Refresh is serialized per view and stale replies are dropped. The backend runs
  at most eight discoveries at once, and a slot frees only when its filesystem
  work settles.

## Build and test

Unit tests cover the target grammar, discovery bounds, the page, IPC and renderer
composition and the retained Surface:

```sh
npx vitest run test/unit/ssh-*.test.ts
```

To build an archive, follow
[Building an extension archive](../release.md#building-an-extension-archive) with
`node scripts/build-ssh-extension.mjs`. It writes
`dist/extensions/ssh-<version>.omxext` with `.sha256` and `.json` sidecars and
refuses a dirty checkout. To try it, install the archive through
**Settings → Extensions → Install local .omxext…**.

### Packaged SSH smoke

`test/integration/ssh-smoke-packaged.test.ts` checks an archive on a packaged
host, on Linux ARM64 and macOS ARM64. It launches the app with an isolated home
that has one alias in `~/.ssh/config` and a fake `ssh` first on `PATH`. It
installs the archive through **Install local .omxext…**, picks the alias and
checks the argv the fake client received. Nothing touches the network, and it
runs in seconds:

```sh
OMXTERM_SSH_SMOKE_APP=/absolute/OMXTerm-X.Y.Z-arm64.AppImage \
OMXTERM_SSH_SMOKE_ARCHIVE=/absolute/ssh-X.Y.Z.omxext \
npx vitest run test/integration/ssh-smoke-packaged.test.ts
```

On macOS, point the app variable at an `OMXTerm.app` copied out of the DMG and
run it from a logged-in desktop session. The test skips when either variable is
unset.

### Publishing

Follow [Publishing an extension archive](../release.md#publishing-an-extension-archive).
Published archives are immutable, so changed bytes need a new version in
`extension.json`. Updating the host never updates an installed extension; users
install the newer archive themselves.

## Current limits

- The official catalogs offer SSH Connect 0.4.0 (host `>=0.27.0-dev.0`) for
  Linux ARM64 and macOS ARM64 only; 0.26 hosts lose the catalog offer and can
  install 0.3.2 by link. Windows and x64 aren't offered or tested.
- OpenSSH owns authentication, host-key prompts and network access. The user's
  OpenSSH configuration still applies, including configured commands, forwards,
  agent access and sockets, and connecting can write `known_hosts`.
- No connection history, credential storage, config editing or reconnect.
- The alias index is deliberately incomplete; see the bounds above.
- Real authentication has only been checked against a local loopback server.
  Remote connectivity, physical-keyboard and accessibility behavior aren't
  qualified.

## Credits

The original proposal in #622 and #671 by @ruscher and `luizomf/sshtoolkit`
informed the design. The parser and grammar here are independent. The archive
keeps MIT licensing and the acknowledgement in `extensions/ssh/NOTICE`.
