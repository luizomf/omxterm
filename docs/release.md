# ARM64 release policy and native procedures

The policy below applies to all initial OMXTerm Release Artifacts. This document
implements the native procedures for the unsigned macOS DMG, Linux ARM64
AppImage, and Windows ARM64 NSIS installer. Nothing here authorizes a tag,
GitHub Release, upload, signing, notarization, or any other publication. Those
actions require separate approval from Otávio.

## Cross-platform release policy

The initial Supported Platforms and artifact formats are macOS arm64 DMG, Linux
arm64 AppImage, and Windows arm64 NSIS. Initial artifacts are unsigned; signing,
Apple notarization, certificates, and paid signing services are deferred.

While the repository is private, every release candidate is built locally and
natively. macOS builds run on Otávio's current Apple Silicon Mac. Linux arm64
and Windows arm64 builds run in native Parallels VM clones and use the VM's
native filesystem, never a host shared folder. Each target requires its own
automated checks and native operating-system behavior verification, recorded
against the exact artifact being considered. Rebuilding or changing one
artifact invalidates that artifact's acceptance evidence.

Exact-artifact acceptance and publication are separate owner gates. Acceptance
never authorizes a tag, upload, or GitHub Release; publication remains manual
and requires separate authorization from Otávio. x64, Intel macOS, additional
package formats, signing and notarization, paid CI, and a multi-platform CI
matrix are deferred until the repository is public.

The macOS, Linux, and Windows steps below are the implemented procedures for
those platforms. The macOS procedure preserves its Gatekeeper policy; the Linux
procedure records the unsigned AppImage and FUSE limitations; the Windows
procedure records the unsigned NSIS installer and SmartScreen limitation.

## Version selection and consistency

Select the release version under the [versioning policy](versioning.md) in an
explicitly authorized release preparation issue. This procedure does not choose
or increment a version by itself. A `-dev` development baseline version is
never releasable; release preparation removes the prerelease suffix.

Before building a release candidate, confirm that `package.json` and
`package-lock.json` contain the same accepted `X.Y.Z` version. The application
version, intended `vX.Y.Z` tag, `TERM_PROGRAM_VERSION`, native artifact
filenames, checksum filenames, and GitHub Release must all identify that same
version. The package names are `OMXTerm-X.Y.Z-arm64.dmg`,
`OMXTerm-X.Y.Z-arm64.AppImage`, and `OMXTerm-X.Y.Z-arm64.exe`.

## Build and automated verification

### macOS arm64

Use an accepted release commit for `X.Y.Z`, with `vX.Y.Z` recorded as the
intended tag, on the macOS Supported Platform: Otávio's current Apple Silicon
(`arm64`) Mac. Install Node.js 22 or newer, check out the accepted source
without local or private files, and run:

```sh
npm ci
npm run check
```

`npm run check` is the complete automated verification command. It checks
formatting and types, runs every unit and integration test, builds the
application, creates `release/OMXTerm-<version>-arm64.dmg`, and starts the
packaged `release/mac-arm64/OMXTerm.app` with isolated configuration and state.
The packaged-startup check requires the arm64 executable, renderer, Terminal
Surface, bundled font, native PTY helper, project and third-party licenses, and
startup events through a running PTY. It rejects source maps, tests, source
trees, alternate-architecture PTY binaries, common secret files, and signing
identities in the package.

For packaging alone, use `npm run package:mac`, which passes `--publish never`
to the packager. Run the non-publishing `npm run package:verify` command against
the unpacked app afterward.

The DMG is intentionally unsigned and not notarized. It must not be treated as
a release candidate until every automated check is green and the exact DMG has
completed the manual checklist below.

### Linux arm64

Use a native Linux arm64 clone on the VM's native filesystem, never a Parallels
shared folder. Install Node.js 22 or newer, `python3`, `make`, a C++ compiler
(`build-essential` on Ubuntu), the `fontconfig` utilities, and an X11 display or
XWayland in a Wayland session. Native Wayland is not currently claimed. Then run
from the accepted source commit:

```sh
npm ci
npm run check:linux
```

The postinstall rebuilds `node-pty` against Electron's Linux arm64 runtime.
`npm run check:linux` runs all portable and real-PTY checks, creates the
non-published `release/OMXTerm-<version>-arm64.AppImage`, extracts that exact
AppImage, checks its arm64 executable and native module, runtime files, version,
icon, licenses, and forbidden/private-looking files, then launches the exact
AppImage with isolated configuration, state, and user data. Startup must reach
a running PTY and its Operational Event log must not contain the environment
canary.

For packaging alone, run `npm run package:linux`, followed on the same native
host by `npm run package:verify`. A normal AppImage launch requires FUSE 2
(`libfuse2t64` on Ubuntu 24.04 or `libfuse2` on older Ubuntu releases). If that
runtime cannot be installed, the safe manual fallback is:

```sh
./release/OMXTerm-<version>-arm64.AppImage --appimage-extract-and-run
```

The AppImage is intentionally unsigned and provides no verified publisher
identity. It is not a release candidate until all automated checks and the
exact-AppImage manual checklist below are complete.

### Windows arm64

Use a native Windows arm64 clone on the VM's native filesystem, never a
Parallels shared folder, in a graphical session. Install Node.js 22 or newer
and the Visual C++ Redistributable for ARM64 (Electron's runtime requires it),
allow script execution for npm's cmd shims, and clone with
`core.autocrlf=false` and `core.symlinks=true` (symlinked repository files
must check out as symlinks; Developer Mode enables unprivileged symlinks).
Then run from the accepted source commit:

```powershell
npm ci
npm run check:win
```

`npm run check:win` runs all portable and real-ConPTY checks, creates the
non-published `release/OMXTerm-<version>-arm64.exe` NSIS installer, inspects
the unpacked application's arm64 PE executables and win32-arm64 node-pty
runtime, version, licenses, and forbidden/private-looking files, installs the
exact installer into a throwaway directory to confirm it extracts every
executable, then launches the unpacked application with isolated
configuration, state, and user data. Startup must reach a running PTY and its
Operational Event log must not contain the environment canary.

For packaging alone, run `npm run package:win`, followed on the same native
host by `npm run package:verify`. The automated check installs the exact
installer to a temporary location — its one-click `/D=` never touches the
real per-user install — and asserts that every packaged executable and DLL
lands, then uninstalls; installing to the real location and launching from the
Start Menu remains a manual checklist step.

The installer carries a zip-compressed application payload rather than the
smaller default LZMA archive. On an ARM64 build host electron-builder
compresses executables with the ARM64 BCJ2 7-Zip filter, which the installer's
bundled extraction plugin cannot decode — it drops every PE file at install
time. The zip payload avoids that filter, so the installer is larger than a
macOS or Linux artifact of the same application but installs completely.
Because this disables the differential (blockmap) package, no `latest.yml` or
`.blockmap` is produced; OMXTerm ships no automatic updates, so nothing depends
on them.

The installer is intentionally unsigned and triggers a Microsoft Defender
SmartScreen unknown-publisher warning. It is not a release candidate until all
automated checks and the exact-installer manual checklist below are complete.

## Dogfood and exact-artifact acceptance

Exploratory dogfood and an exact-artifact release checklist have different
purposes. Dogfood may use a development build, vary actions as useful, and
record findings against its source commit. It can discover defects, but it is
not Release Artifact acceptance and its results cannot be copied into or used
to infer a checklist result. An exact-artifact run starts a new durable record,
uses every applicable check identifier below, and remains bound to one unchanged
artifact by filename, byte size, and SHA-256. Rebuilding, renaming, or changing
the artifact starts a new record; rerunning a failed or unexecuted check is valid
only after confirming that identity again.

The SHA-256 used to bind a run may be calculated before testing. Do not create
the distributable `.sha256` file until the platform's checksum section says to
do so after manual testing.

## Agent-guided manual testing

The exact-artifact manual checklists below are the slowest and most error-prone
part of a release candidate. The default way to run them is **agent-guided**: a
human exercises the packaged application while an agent acts as scribe and
guide. No private skill, agent product, or orchestration setup is required. The
agent never observes the GUI for the tester; it prepares, dictates, records, and
verifies the system side, while the human reports what they actually see.

### Prepare once

Before the first check, the agent:

1. creates the canonical run record below on the release tracking issue, fills
   every known field, and leaves every check `UNEXECUTED — PENDING`;
2. verifies the accepted source and the local absolute artifact path, then posts
   only the public-safe identity: artifact type, filename, byte size, and
   SHA-256. The absolute path remains in a local worksheet and never appears in
   tracker evidence;
3. stages the adversarial inputs required below: file and folder sets whose
   names contain spaces, an apostrophe, `$(...)`, `;` and `&`, and Unicode with
   emoji; log-grep canaries; and the required environment records; and
4. keeps the publication gate `BLOCKED`. Exact-artifact acceptance and separate
   publication authorization remain owner gates; neither is inferred from a
   completed checklist.

### Resume and checkpoint

For a new or resumed run, use this sequence exactly:

1. Read the complete durable run record on the tracking issue. Private chat is
   not continuation authority.
2. Recalculate filename, byte size, and SHA-256 from the artifact at the locally
   retained absolute path. If any value differs from the record, stop, mark the
   run invalid, keep publication blocked, and start a new record for the new
   artifact.
3. Select the first applicable row whose current result is
   `UNEXECUTED — PENDING`. The record's `Next pending check` must name that same
   identifier. An `UNEXECUTED — IMPOSSIBLE: <reason>` row is not selectable, but
   remains a release blocker unless an explicit exception below applies.
4. Give the tester exactly one action from that row. Do not reveal the expected
   outcome until after the tester reports what happened.
5. Record the owner's observation verbatim, then assign `PASS`, `FAIL`, or
   `UNEXECUTED`. Never infer a result from automated checks, process existence,
   or a different artifact. System-side evidence gathered by the agent must be
   labeled as such and never attributed to the owner.
6. Checkpoint the safe observation on the tracking issue before dictating
   another action. If the row needs more observations, keep its current result
   `UNEXECUTED — PENDING`, list the safe completed observations and the exact
   remaining observation, and leave it as `Next pending check`. Otherwise update
   the row, cleanup state, and exact next pending identifier. Before handoff or
   context exhaustion, post the same durable checkpoint; local notes and private
   chat are never continuation state.

While the human drives the GUI, verify applicable system-side evidence in
parallel: running processes and AppImage mounts after quit, window properties
such as `xprop`/`_NET_WM_ICON`, artifact identity with `file` and SHA-256, and
the Operational Event JSONL for the environment canary and forbidden payload.
Label this as agent-gathered evidence; never attribute it to the human.

A checklist item that depends on seeing the screen — a Gatekeeper dialog, a
rendered gradient, or an icon — stays with the human. The agent's job is to
remove everything around that observation, not to make the observation for
them.

### Tracker evidence safety

The tracking issue is the durable record, but it must never contain Terminal
Payload, clipboard contents, commands, private paths, screenshots containing
payload, secrets, or transcripts. Operational-log evidence keeps the existing
privacy restrictions below. Keep raw observations and the local absolute
artifact path only in the local worksheet. In the tracker row, quote the
owner's words verbatim only when they are public-safe. Otherwise replace each
forbidden part with an explicit marker such as `[omitted: command]` or
`[omitted: private path]` and record a safe outcome summary; if useful evidence
cannot be separated safely, write `EVIDENCE OMITTED: <forbidden category>`.
This is honest omission, not permission to paraphrase forbidden material as if
it were verbatim. Do not link to unsafe external evidence.

### Canonical durable run record

The following metadata block plus every identifier and initial result from the
applicable platform checklist is the one canonical template. Do not use
identifier ranges or omit identifiers, and do not copy the action text (which
may contain commands) into the tracker. Each identifier has chronological
attempt entries; its last entry is its current result. Use exactly
`PASS — <safe evidence>`, `FAIL — <safe evidence>`,
`UNEXECUTED — PENDING: <safe observation still needed>`, or
`UNEXECUTED — IMPOSSIBLE: <reason>`.

```text
Run title: <version> <platform> exact-artifact checklist
Tracking issue: <public issue URL>
Source commit: <full commit SHA>
Source tag: <tag, or UNEXECUTED — not separately authorized>
Artifact type: <DMG, AppImage, or NSIS installer>
Artifact filename: <public-safe basename>
Artifact byte size: <integer>
Artifact SHA-256: <lowercase digest>
Local absolute artifact path verified: YES — retained locally, not posted
Host identity: <public-safe model/OS/build/architecture fields required below>
Toolchain identity: <public-safe versions required below>
Automated check: <PASS/FAIL/UNEXECUTED and safe evidence; no command or output>
Packaged startup: <PASS/FAIL/UNEXECUTED and safe evidence>

Check results:
<copy every applicable identifier and its chronological results; omit the action text>

Cleanup state: <COMPLETE, INCOMPLETE — reason, or NOT STARTED>
Exact-artifact acceptance: PENDING or OWNER ACCEPTED
Publication gate: BLOCKED — separate owner authorization required
Next pending check: <first identifier whose current result is UNEXECUTED — PENDING, or NONE>
```

A failed row remains current and blocking until it is deliberately scheduled
for a same-artifact rerun. After rechecking artifact identity, append
`UNEXECUTED — PENDING: rerun after FAIL` to that identifier and select it through
the normal sequence. Append the rerun result instead of deleting history. The
latest result controls the row's gate state, so a later `PASS` against the same
unchanged artifact supersedes an earlier `FAIL` without erasing it. A changed
artifact always starts a new record.

`Next pending check: NONE` means only that no pending row is selectable; it does
not imply readiness. Exact-artifact acceptance may become `OWNER ACCEPTED` only
when automated verification and packaged startup passed, cleanup is complete,
and every applicable manual row's current result is `PASS`, except that
`MAC-GATEKEEPER` or `WIN-SMARTSCREEN` may be `UNEXECUTED — IMPOSSIBLE` for the
exact conditional reason stated in its row. A current `FAIL`,
`UNEXECUTED — PENDING`, or any other `UNEXECUTED — IMPOSSIBLE` keeps acceptance
and publication blocked. Missing or unexplained results are also blocking.

Identifiers beginning with `SH-` are shared behavior families; their final
`MAC`, `LIN`, or `WIN` segment identifies the native observation. Identifiers
beginning with `MAC-`, `LIN-`, or `WIN-` are platform-specific. Treat every full
identifier as stable: do not rename or reuse one for a different check.

### Worked example — the #60 Linux run

The Linux ARM64 AppImage checklist for
[#60](https://github.com/luizomf/omxterm/issues/60) was run with the earlier
record format. It produced a complete manual history and found two regressions,
but new runs use the canonical record above:

- the [exact-artifact record](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053075065),
  with per-item results and unexecuted reasons;
- the pending-item [rerun](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053144161)
  and [edge-case addendum](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053411307)
  against the same exact artifact; and
- the two regressions the run surfaced — an invisible plain launch
  ([`b28ae76`](https://github.com/luizomf/omxterm/issues/60#issuecomment-5052788958))
  and a missing window icon
  ([`af10b18`](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053024945))
  — each fixed on-branch and reverified.

## macOS exact-artifact record

Use the canonical record with host model, macOS version and build, architecture,
and Node.js version in its identity fields. Verify the exact DMG's absolute path
locally, but post only its filename, byte size, and SHA-256. Keep the exact path
private and local. Use a disposable configuration/state root where a check calls
for invalid data or log inspection. Test the application copied from the
mounted exact DMG, not the unpacked build directory or a previous installation.

### Manual checklist for the exact DMG

Copy every identifier and initial result below into the run record, not the
action text. Each row starts `UNEXECUTED — PENDING: not yet observed`. A row is
`PASS` only when every independently stated observation in that row was made. If only part was
observed, keep the row `UNEXECUTED — PENDING`, record the completed parts, and
name the exact remaining observation; this prevents a grouped behavior from
hiding an omission.

- **`MAC-DMG-FIRST-LAUNCH` — DMG and first launch.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Mount the exact DMG, verify it
  contains `OMXTerm.app` and an Applications link, copy the app, eject the DMG,
  and launch the copied app.
- **`MAC-GATEKEEPER` — Gatekeeper observation.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Record whether macOS displayed a
  Gatekeeper warning. A locally built image may not carry download quarantine,
  so record `UNEXECUTED — IMPOSSIBLE: locally built DMG has no download
quarantine` rather than manufacturing or bypassing a warning.
- **`SH-SHELL-EXIT-MAC` — Default Shell and clean exit.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify the
  operating-system-configured interactive login shell starts in the home directory; verify `TERM`,
  `COLORTERM`, `TERM_PROGRAM`, and `TERM_PROGRAM_VERSION`; in fresh windows, run
  `exit 0` and `exit 7`, and confirm each Terminal Window closes without a
  failure dialog.
- **`SH-ABNORMAL-EXIT-MAC` — Abnormal shell exit.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. In a fresh window, run
  `kill -s KILL $$`; confirm the failure stays visible in the native dialog until acknowledged and the
  unusable window then closes.
- **`SH-WINDOW-TAB-CLEANUP-MAC` — Multiple windows, tabs, and cleanup.**
  Initial result: `UNEXECUTED — PENDING: not yet observed`. Use `Cmd+N` for at
  least two independent windows and `Cmd+T` for at least two Terminal Tabs in one of
  them; verify the tab strip appears only with two or more tabs, `Cmd+W`
  closes an idle tab without asking and a tab running a foreground process
  (e.g. `htop`) with one confirmation, `Cmd+Shift+W` closes the selected
  window and all of its tabs with one confirmation only when one of them is
  Busy, the last tab closing closes its window, the last window quits
  OMXTerm, and `Cmd+Q` requests one confirmation for all open windows only
  while a session is Busy. Confirm no OMXTerm or child shell remains after
  quit.
- **`SH-TERMINAL-COMPAT-MAC` — tmux, TUI, and terminal compatibility.**
  Initial result: `UNEXECUTED — PENDING: not yet observed`. Exercise tmux, an
  alternate-screen TUI, Unicode, truecolor, scrolling, resize, a REPL, bracketed paste, and SSH
  started by the user. Confirm OMXTerm installs no shell integration or custom
  terminfo.
- **`MAC-FILE-INSERTION` — macOS file and folder insertion.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. From Finder, drag-drop multiple files
  and folders containing spaces, apostrophes, Unicode, and shell
  metacharacters into a window. Confirm ordered, independently POSIX-quoted
  absolute paths reach only the selected tab through Protected Paste without
  Enter. Copy the same Finder selection and confirm Paste uses the
  `NSFilenamesPboardType` or `public.file-url` fallback only when plain text
  is empty. Confirm a non-file URL, malformed list, and drop without native
  files have no side effect.
- **`SH-CLIPBOARD-MAC` — Clipboard and Protected Paste.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify selection does not copy,
  `Ctrl+C` and `Ctrl+V` remain PTY input, native/context-menu copy and paste work,
  unsafe multiline or control-character paste is confirmed outside bracketed-paste
  mode, bracketed paste does not show that confirmation, and OSC 52 can write
  but cannot read or clear the clipboard.
- **`SH-ZOOM-MAC` — Zoom.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify `Cmd++`, `Cmd+-`, and `Cmd+0`
  affect only the selected window, do not alter User Configuration, and do not affect a newly opened window.
- **`SH-ALWAYS-ON-TOP-MAC` — Always on Top.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Toggle `Window -> Always on Top` and
  verify only the selected window changes. Verify a new window uses the configured default and
  the menu does not rewrite configuration.
- **`SH-TITLES-BEL-MAC` — Titles and BEL.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Exercise OSC 0 and OSC 2,
  invalid/control/bidi/oversized titles, and BEL in focused and unfocused windows and in selected and
  unselected tabs. Confirm sanitized bounded titles per tab with the Default
  Shell name as the untitled fallback, the window title mirroring the selected
  tab, silent BEL, one Dock attention request, and the bell marker on the
  ringing tab until it is focused again.
- **`SH-LINKS-MAC` — Links.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify only literal visible HTTP and
  HTTPS URLs activate on `Cmd+click`; verify invalid URLs, other schemes, OSC 8 destinations, and
  renderer navigation are refused.
- **`SH-CONFIGURATION-MAC` — Configuration.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify absent configuration uses
  defaults without creating a file; verify a valid version 1 file after restart; verify invalid JSON,
  unknown keys, unsupported versions, invalid values, and missing fonts still
  open the application on built-in defaults with the exact problem reported on
  stderr and in the persistent in-app error surface, without rewriting the
  file, and with the terminal fully usable beneath the error. Verify the
  bundled `omtheme` default, an absolute external theme path, a
  config-relative external theme path, a valid symlink, and a non-black theme
  across the initial window, title inset, padding, and terminal cells. Verify
  missing, unreadable, non-regular, invalid UTF-8, invalid JSON, and
  invalid-schema theme files open the application with the bundled `omtheme`,
  the rest of the validated configuration, and the loud error surface, without
  rewriting either file; verify configuration and theme changes take effect
  only after restart.
- **`SH-KEYBINDS-MAC` — Keybinds.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify a remapped action (for example
  `newWindow` on `CommandOrControl+T`) triggers via the new accelerator, no longer via the
  default, and the menu displays the new accelerator; verify unmapped actions
  keep their defaults; verify an unknown action name, a malformed or
  modifier-less accelerator, and a remap colliding with a remaining default
  each start the application on default keybinds with the exact field reported
  in the error surface.
- **`SH-SNIPPETS-MAC` — Snippets Sidebar.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. With no `snippets.json`, verify the
  toggle keybind (default `Cmd+Shift+S`) opens a clean empty sidebar beside a still-usable
  terminal. With a valid file, verify search filters by name and description,
  a click injects into that window's session and returns focus to the
  terminal, a default snippet lands unexecuted, an `execute: true` snippet
  runs, and a multi-line body arrives as one bracketed paste. Verify editing
  the file and reopening the sidebar shows the new content without restart.
  With an invalid file, verify the application and terminal stay unaffected
  and the sidebar shows the exact path and field in place of the list.
- **`SH-LOGS-MAC` — Operational logs.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify current/previous JSONL
  retention, configured log levels, bounded permissions and size, useful lifecycle/failure metadata, and
  absence of Terminal Payload, clipboard data, commands, titles, environment,
  configuration contents, secrets, and transcripts.
- **`SH-APP-BOUNDARY-MAC` — Application boundary and cleanup.** Initial
  result: `UNEXECUTED — PENDING: not yet observed`. Verify native
  copy/paste/select-all, fullscreen, close, quit, and Window actions; verify the Terminal Surface fills
  the content area; verify there is no application telemetry/update traffic;
  remove the copied app and disposable test configuration/state after recording
  evidence.

## Linux exact-artifact record

Use the canonical record with Linux distribution and version, kernel version,
architecture, Node.js and npm versions, native toolchain versions, and the FUSE
2 runtime package/version in its identity fields. Verify the exact AppImage's
absolute path locally, but post only its filename, byte size, and SHA-256. Keep
the exact path private and local.

### Manual checklist for the exact AppImage

Use the exact unchanged AppImage named in the record, not the unpacked build
directory or another copy. Use disposable configuration, state, and user-data
roots for invalid-file and log checks. Copy every identifier and initial result
below into the run record, not the action text; each starts
`UNEXECUTED — PENDING: not yet observed`. A row is `PASS` only when
every independently stated observation in it was made. A partial row remains
`UNEXECUTED — PENDING` with both completed and exactly remaining observations
recorded.

- **`LIN-APPIMAGE-FIRST-LAUNCH` — AppImage and first launch.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Confirm the filename and `file` output identify
  ARM aarch64, make the artifact executable, and launch it normally. Confirm the
  default X11 backend presents a visible window, recording XWayland when the
  desktop session is Wayland; an explicit Ozone override is diagnostic evidence,
  not the normal-launch result. Record the installed FUSE 2 runtime. If normal
  mounting is unavailable, record that result
  and exercise `--appimage-extract-and-run` as the documented safe fallback;
  never infer the normal launch result from extraction. Confirm the desktop icon
  and window association are correct; the window carries its own icon, while
  the GNOME dock icon requires the desktop-integration step documented in the
  README for directly-run AppImages. Record that no publisher signature is
  presented.
- **`SH-SHELL-EXIT-LIN` — Default Shell and exits.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify the operating-system-configured interactive
  login shell starts in the account home directory and reports `TERM`,
  `COLORTERM`, `TERM_PROGRAM`, and `TERM_PROGRAM_VERSION` exactly as documented.
  In fresh windows, run `exit 0`, `exit 7`, and `kill -s KILL $$`; confirm normal
  exits close without a failure dialog and the signal failure remains visible
  until acknowledged.
- **`SH-WINDOW-TAB-CLEANUP-LIN` — Windows, tabs, and cleanup.** Initial
  result: `UNEXECUTED — PENDING: not yet observed`. Using Linux `Ctrl` application shortcuts and
  native menu items, exercise independent windows and tabs, idle and Busy close
  behavior, fullscreen, zoom, always-on-top, copy, paste, select-all, and quit.
  Confirm the tab strip and focus behavior, one confirmation per guarded action,
  and that no OMXTerm, AppImage mount, child shell, or foreground process remains
  after the last window quits.
- **`SH-TERMINAL-COMPAT-LIN` — Terminal compatibility.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Exercise tmux, an alternate-screen TUI, Unicode,
  truecolor, scrolling, resize, a REPL, bracketed paste, and SSH started by the
  user. Confirm OMXTerm adds neither custom terminfo nor Shell Integration.
- **`LIN-FILE-INSERTION` — Linux file and folder insertion.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. From the native Linux file manager, drop
  multiple files and folders containing spaces, apostrophes, Unicode, and shell
  metacharacters into a window. Confirm ordered, independently POSIX-quoted
  absolute paths reach only the selected tab through Protected Paste without
  Enter. Copy the same native selection and confirm Paste uses the GNOME file
  list or URI-list fallback only when plain text is empty. Confirm a non-file
  URL, malformed list, and drop without native files have no side effect.
- **`SH-CLIPBOARD-LIN` — Clipboard and Protected Paste.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify selection does not copy,
  `Ctrl+C` and `Ctrl+V` remain PTY input, the default `Ctrl+Shift+C` and
  `Ctrl+Shift+V` plus native menu/context copy and paste work, unsafe multiline
  or control-character paste is confirmed outside bracketed-paste mode,
  bracketed paste is not prompted, and OSC 52 can write but cannot read or clear
  the clipboard.
- **`SH-TITLES-BEL-LINKS-LIN` — Titles, BEL, and links.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Exercise the same accepted title
  sanitization, silent BEL, and literal HTTP/HTTPS activation documented in the
  macOS checklist, using Linux menu labels and shortcuts.
- **`SH-CONFIG-KEYBINDS-SNIPPETS-LIN` — Configuration, keybinds, and snippets.**
  Initial result: `UNEXECUTED — PENDING: not yet observed`. Exercise the same
  valid and invalid configuration/theme behavior, keybind remapping, and
  Snippets Sidebar behavior documented in the macOS checklist, using Linux menu
  labels and shortcuts. Do not infer these results from unit tests.
- **`SH-LOGS-APP-CLEANUP-LIN` — Logs, application boundary, and cleanup.**
  Initial result: `UNEXECUTED — PENDING: not yet observed`. Verify bounded local
  JSONL retention and permissions, useful payload-free Operational Events, no
  application telemetry or update traffic, and absence of Terminal Payload,
  clipboard contents, paths inserted by drop or paste, environment canaries,
  configuration contents, commands, titles, secrets, and transcripts. Remove
  disposable test state after recording evidence, but preserve the exact
  AppImage unchanged for checksum and owner acceptance.

## Windows exact-artifact record

Use the canonical record with Windows edition, version, and build, architecture,
and Node.js and npm versions in its identity fields. Verify the exact
installer's absolute path locally, but post only its filename, byte size, and
SHA-256. Keep the exact path private and local.

### Manual checklist for the exact NSIS installer

Use the exact unchanged installer named in the record, not the unpacked build
directory. Use disposable configuration, state, and user-data roots for
invalid-file and log checks. Copy every identifier and initial result below into
the run record, not the action text; each starts
`UNEXECUTED — PENDING: not yet observed`. A row is `PASS` only when every
independently stated observation in it was made. A partial row remains
`UNEXECUTED — PENDING` with both completed and exactly remaining observations
recorded.

- **`WIN-INSTALLER-FIRST-LAUNCH` — Installer and first launch.** Initial
  result: `UNEXECUTED — PENDING: not yet observed`. Confirm the filename
  identifies the accepted version and arm64. Run the exact installer from
  Explorer. Confirm the one-click per-user install completes without elevation,
  the Start Menu entry and its icon appear, and the installed application
  launches with the OMXTerm window icon. Record that no publisher signature is
  presented.
- **`WIN-SMARTSCREEN` — SmartScreen observation.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Record the SmartScreen observation
  verbatim. A locally built installer may not carry the download mark-of-the-web,
  so record `UNEXECUTED — IMPOSSIBLE: locally built installer has no
mark-of-the-web` rather than manufacturing or bypassing a warning. Never
  disable SmartScreen or other system protections.
- **`SH-SHELL-EXIT-WIN` — Default Shell and exits.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify Windows PowerShell starts as a plain
  interactive session in the user profile directory and reports `TERM`,
  `COLORTERM`, `TERM_PROGRAM`, and `TERM_PROGRAM_VERSION` exactly as
  documented. In fresh windows, run `exit 0` and `exit 7`; confirm each closes
  without a failure dialog. Stop the shell process abnormally (for example
  `Stop-Process -Id $PID` from that shell) and confirm an abnormal end stays
  visible until acknowledged when it is reported as a failure.
- **`SH-WINDOW-TAB-BUSY-WIN` — Windows, tabs, and Busy behavior.** Initial
  result: `UNEXECUTED — PENDING: not yet observed`. Using `Ctrl` application shortcuts and
  native menu items, exercise independent windows and tabs, fullscreen, zoom,
  always-on-top, copy, paste, select-all, and quit. Confirm the documented
  Windows Busy contract: because ConPTY hides the foreground process name,
  closing any live tab, window, or the application asks exactly once per
  guarded action while `confirmClose` is enabled. Confirm no OMXTerm or child
  shell process remains after the last window quits.
- **`SH-TERMINAL-COMPAT-WIN` — Terminal compatibility.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Exercise an alternate-screen TUI, Unicode and
  emoji, truecolor, scrolling, resize, a REPL, bracketed paste, and SSH
  started by the user (`ssh.exe`). Confirm OMXTerm installs no shell
  integration.
- **`WIN-FILE-INSERTION` — Windows file and folder insertion.** Initial
  result: `UNEXECUTED — PENDING: not yet observed`. From Explorer, drop multiple files
  and folders containing spaces, apostrophes, Unicode, and shell
  metacharacters into a window. Confirm ordered, independently quoted
  absolute paths reach only the selected tab through Protected Paste without
  Enter. Copy a file in Explorer and confirm Paste inserts the documented
  single-path clipboard fallback only when plain text is empty.
- **`SH-CLIPBOARD-WIN` — Clipboard and Protected Paste.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Verify selection does not copy,
  `Ctrl+C` and `Ctrl+V` remain PTY input, the default `Ctrl+Shift+C` and
  `Ctrl+Shift+V` plus native menu/context copy and paste work, unsafe multiline
  or control-character paste is confirmed outside bracketed-paste mode,
  bracketed paste is not prompted, and OSC 52 can write but cannot read or clear
  the clipboard.
- **`SH-TITLES-BEL-LINKS-WIN` — Titles, BEL, and links.** Initial result:
  `UNEXECUTED — PENDING: not yet observed`. Exercise the same accepted title
  sanitization, silent BEL, and literal HTTP/HTTPS activation documented in the
  macOS checklist, using Windows menu labels and shortcuts.
- **`SH-CONFIG-KEYBINDS-SNIPPETS-WIN` — Configuration, keybinds, and snippets.**
  Initial result: `UNEXECUTED — PENDING: not yet observed`. Exercise the same
  valid and invalid configuration/theme behavior at
  `%USERPROFILE%\.config\omxterm\`, keybind remapping, and Snippets Sidebar
  behavior documented in the macOS checklist, using Windows menu labels and
  shortcuts. Do not infer these results from unit tests.
- **`SH-LOGS-APP-CLEANUP-WIN` — Logs, application boundary, and cleanup.**
  Initial result: `UNEXECUTED — PENDING: not yet observed`. Verify bounded local
  JSONL retention at `%USERPROFILE%\.local\state\omxterm\logs\`, useful
  payload-free Operational Events, no application telemetry or update traffic,
  and absence of Terminal Payload, clipboard contents, inserted paths,
  environment canaries, configuration contents, commands, titles, secrets, and
  transcripts. Uninstall the per-user application after recording evidence,
  confirm the uninstaller removes the Start Menu entry, and preserve the exact
  installer unchanged for checksum and owner acceptance.

Any failed required item or any unexplained unexecuted item keeps every future
tag, GitHub Release, attachment, or upload blocked. The Gatekeeper and
SmartScreen observations may remain `UNEXECUTED` only when the locally built
artifact carries no download quarantine or mark-of-the-web and that reason is
recorded; these conditional observations do not by themselves block
publication, but the required Gatekeeper and SmartScreen release guidance
still applies. Missing exact-artifact manual evidence does not prevent a preparatory
packaging change from merging, but it does prevent publication.

## macOS SHA-256

Generate the checksum only after the exact DMG finishes manual testing. From
the output directory, preserving the artifact's filename:

```sh
cd release
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256
```

Changing or rebuilding the DMG invalidates the checklist and checksum. Repeat
the entire exact-artifact check for the replacement.

## Linux SHA-256

Generate the checksum only after manual testing finishes against the unchanged
exact AppImage:

```sh
cd release
sha256sum OMXTerm-<version>-arm64.AppImage > OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
```

Record both the filename and digest in the exact-artifact record. Rebuilding,
renaming, or changing the AppImage invalidates its manual evidence and checksum.
Keep publication blocked until Otávio accepts this exact artifact and separately
authorizes publication.

## Windows SHA-256

Generate the checksum only after manual testing finishes against the unchanged
exact installer:

```powershell
cd release
$name = "OMXTerm-<version>-arm64.exe"
"$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name" |
  Out-File -Encoding ascii "$name.sha256"
Get-Content "$name.sha256"
```

Confirm the digest matches a fresh `Get-FileHash` of the same file. The same
rebuild/rename invalidation and blocked-publication rules as the other
platforms apply.

## Gatekeeper and provenance release note

Use this language in any later owner-authorized release, updated only with the
accepted version and checksum:

> OMXTerm for Apple Silicon is intentionally not signed with an Apple Developer
> ID and is not notarized. macOS may warn that it cannot verify the developer or
> check the app for malicious software. Review the source, verify the published
> SHA-256, and proceed only if you trust this exact artifact. If you choose to
> open it, follow Apple's current [Open Anyway instructions](https://support.apple.com/102445)
> in System Settings -> Privacy & Security. Do not disable system-wide macOS
> security protections. This is the open-source build Otávio published and
> uses; it is not independently audited, approved by Apple, or guaranteed free
> of defects in all code and dependencies.

## SmartScreen and provenance release note

Use this language in any later owner-authorized release that attaches the
Windows installer, updated only with the accepted version and checksum:

> OMXTerm for Windows ARM64 is intentionally not signed with a code-signing
> certificate. Microsoft Defender SmartScreen may warn that the installer is
> from an unknown publisher. Review the source, verify the published SHA-256,
> and proceed only if you trust this exact artifact. If you choose to install
> it, use SmartScreen's `More info -> Run anyway` for this one file. Do not
> disable SmartScreen or other system-wide Windows security protections. This
> is the open-source build Otávio published and uses; it is not independently
> audited, approved by Microsoft, or guaranteed free of defects in all code
> and dependencies.

## Later owner-authorized GitHub Release

Only after Otávio accepts the exact-artifact record and separately authorizes
publication:

1. confirm the canonical repository is `luizomf/omxterm`, the accepted source is
   tagged `vX.Y.Z`, and the package metadata, DMG, AppImage, installer, and
   their checksums still match their accepted records;
2. create the canonical GitHub Release for that exact tag with the Gatekeeper
   and SmartScreen provenance notes above; summarize material changes, identify
   incompatible changes and migration or state that there are none, and record
   relevant known limitations;
3. attach exactly `OMXTerm-<version>-arm64.dmg`,
   `OMXTerm-<version>-arm64.dmg.sha256`,
   `OMXTerm-<version>-arm64.AppImage`,
   `OMXTerm-<version>-arm64.AppImage.sha256`,
   `OMXTerm-<version>-arm64.exe`, and
   `OMXTerm-<version>-arm64.exe.sha256` manually;
4. download all six attachments, verify every checksum again on its native
   Supported Platform, and preserve the final release URL with the accepted
   evidence.

Do not automate these publication steps or perform them under the authority of
this repository procedure alone.
