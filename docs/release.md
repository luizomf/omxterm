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
runtime, version, licenses, and forbidden/private-looking files, then launches
the unpacked application with isolated configuration, state, and user data.
Startup must reach a running PTY and its Operational Event log must not
contain the environment canary.

For packaging alone, run `npm run package:win`, followed on the same native
host by `npm run package:verify`. The automated startup check runs the
unpacked `release/win-arm64-unpacked/OMXTerm.exe`; installing and launching
the exact NSIS installer is a manual checklist step.

The installer is intentionally unsigned and triggers a Microsoft Defender
SmartScreen unknown-publisher warning. It is not a release candidate until all
automated checks and the exact-installer manual checklist below are complete.

## Agent-guided manual testing

The exact-artifact manual checklists below are the slowest and most error-prone
part of a release candidate. The default way to run them is **agent-guided**: a
human exercises the packaged application while an agent acts as scribe and guide.
This lowers the bar for the owner and for outside contributors who want to help
test an artifact with their own agent, and it produces a complete, honest record
without inflating the checklist into automation it is not.

The agent never observes the GUI for the tester. It prepares, dictates, records,
and verifies the system side; the human reports what they actually see.

- **Prepare test assets in advance.** The agent stages the adversarial inputs a
  checklist item needs before the run: file and folder sets whose names contain
  spaces, an apostrophe, `$(...)`, `;` and `&`, and Unicode with emoji;
  log-grep canary commands; and the environment records the exact-artifact
  record asks for. Prepared assets keep the tester moving and make edge cases
  reproducible.
- **Dictate one step at a time, expectation last.** The agent gives the tester
  one action, and states the expected outcome only _after_ the tester reports
  what happened. The tester runs blind, so each observation is unbiased evidence
  rather than a confirmation of what it was supposed to be.
- **Record verbatim under the never-infer rule.** The agent writes each item as
  `PASS`, `FAIL`, or `UNEXECUTED` from the tester's own words. Anything the run
  did not genuinely observe is `UNEXECUTED` with its reason — never inferred from
  build output, process existence, or automated test results.
- **Verify the system side in parallel.** While the human drives the GUI, the
  agent inspects the machine: running processes and AppImage mounts after quit,
  window properties such as `xprop`/`_NET_WM_ICON`, artifact identity with
  `file` and the SHA-256, and the Operational Event JSONL for the environment
  canary and for forbidden payload. These are evidence the agent can gather
  directly and must not attribute to the human.
- **Post the exact-artifact record on the tracking issue.** The agent fills in
  the platform record template from this document and posts it, with per-item
  results and every unexecuted reason, as the durable artifact evidence.

A checklist item that depends on seeing the screen — a Gatekeeper dialog, a
rendered gradient, a dock icon — stays with the human. The agent's job is to
remove everything around that observation, not to make the observation for them.

### Worked example — the #60 Linux run

The Linux ARM64 AppImage checklist for
[#60](https://github.com/luizomf/omxterm/issues/60) was run this way. The method
produced one of the most complete manual records in the repository, found two
real regressions mid-run, and left every unobserved item honestly `UNEXECUTED`:

- the [exact-artifact record](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053075065)
  in this document's Linux template, with per-item results and unexecuted
  reasons;
- the pending-item [re-run](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053144161)
  and [edge-case addendum](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053411307)
  against the same exact artifact;
- the two regressions the run surfaced — an invisible plain launch
  ([`b28ae76`](https://github.com/luizomf/omxterm/issues/60#issuecomment-5052788958))
  and a missing window icon
  ([`af10b18`](https://github.com/luizomf/omxterm/issues/60#issuecomment-5053024945))
  — each fixed on-branch and re-verified.

A reusable checklist-scribe skill is a possible future convenience; formalizing
one is not required to run the checklists this way today.

## macOS exact-artifact record

Create the following record before manual testing, fill in every value already
known, and keep the publication gate `BLOCKED`. Complete the results, SHA-256,
unexecuted reasons, and final gate as their required steps finish. Use
`UNEXECUTED` for every item the environment cannot genuinely observe; do not
infer a pass from build output, process existence, or automated test results.

```text
Source commit:
Source tag (only when separately authorized):
Host model:
macOS version and build:
Architecture:
Node.js version:
Exact DMG absolute path:
Exact DMG filename:
DMG byte size:
SHA-256:
Automated npm run check result:
Packaged-startup result:
Manual checklist results and evidence:
Unexecuted items and reasons:
Publication gate: BLOCKED or OWNER ACCEPTED
```

### Manual checklist for the exact DMG

Use a disposable configuration/state root where a check calls for invalid data
or log inspection. Test the application copied from the mounted exact DMG, not
the unpacked build directory or a previous installation.

- **DMG and first launch:** mount the exact DMG, verify it contains `OMXTerm.app`
  and an Applications link, copy the app, eject the DMG, and launch the copied
  app. Record whether macOS displayed a Gatekeeper warning. A locally built
  image may not carry download quarantine, so record the Gatekeeper observation
  as `UNEXECUTED` rather than manufacturing or bypassing a warning.
- **Default Shell and clean exit:** verify the operating-system-configured
  interactive login shell starts in the home directory; verify `TERM`,
  `COLORTERM`, `TERM_PROGRAM`, and `TERM_PROGRAM_VERSION`; in fresh windows, run
  `exit 0` and `exit 7`, and confirm each Terminal Window closes without a
  failure dialog.
- **Abnormal shell exit:** in a fresh window, run `kill -s KILL $$`; confirm the
  failure stays visible in the native dialog until acknowledged and the
  unusable window then closes.
- **Multiple windows, tabs, and cleanup:** use `Cmd+N` for at least two
  independent windows and `Cmd+T` for at least two Terminal Tabs in one of
  them; verify the tab strip appears only with two or more tabs, `Cmd+W`
  closes an idle tab without asking and a tab running a foreground process
  (e.g. `htop`) with one confirmation, `Cmd+Shift+W` closes the selected
  window and all of its tabs with one confirmation only when one of them is
  Busy, the last tab closing closes its window, the last window quits
  OMXTerm, and `Cmd+Q` requests one confirmation for all open windows only
  while a session is Busy. Confirm no OMXTerm or child shell remains after
  quit.
- **tmux, TUI, and terminal compatibility:** exercise tmux, an alternate-screen
  TUI, Unicode, truecolor, scrolling, resize, a REPL, bracketed paste, and SSH
  started by the user. Confirm OMXTerm installs no shell integration or custom
  terminfo.
- **macOS file and folder insertion:** from Finder, drag-drop multiple files
  and folders containing spaces, apostrophes, Unicode, and shell
  metacharacters into a window. Confirm ordered, independently POSIX-quoted
  absolute paths reach only the selected tab through Protected Paste without
  Enter. Copy the same Finder selection and confirm Paste uses the
  `NSFilenamesPboardType` or `public.file-url` fallback only when plain text
  is empty. Confirm a non-file URL, malformed list, and drop without native
  files have no side effect.
- **Clipboard and Protected Paste:** verify selection does not copy, `Ctrl+C`
  and `Ctrl+V` remain PTY input, native/context-menu copy and paste work, unsafe
  multiline or control-character paste is confirmed outside bracketed-paste
  mode, bracketed paste does not show that confirmation, and OSC 52 can write
  but cannot read or clear the clipboard.
- **Zoom:** verify `Cmd++`, `Cmd+-`, and `Cmd+0` affect only the selected window,
  do not alter User Configuration, and do not affect a newly opened window.
- **Always on Top:** toggle `Window -> Always on Top` and verify only the
  selected window changes. Verify a new window uses the configured default and
  the menu does not rewrite configuration.
- **Titles and BEL:** exercise OSC 0 and OSC 2, invalid/control/bidi/oversized
  titles, and BEL in focused and unfocused windows and in selected and
  unselected tabs. Confirm sanitized bounded titles per tab with the Default
  Shell name as the untitled fallback, the window title mirroring the selected
  tab, silent BEL, one Dock attention request, and the bell marker on the
  ringing tab until it is focused again.
- **Links:** verify only literal visible HTTP and HTTPS URLs activate on
  `Cmd+click`; verify invalid URLs, other schemes, OSC 8 destinations, and
  renderer navigation are refused.
- **Configuration:** verify absent configuration uses defaults without creating
  a file; verify a valid version 1 file after restart; verify invalid JSON,
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
- **Keybinds:** verify a remapped action (for example `newWindow` on
  `CommandOrControl+T`) triggers via the new accelerator, no longer via the
  default, and the menu displays the new accelerator; verify unmapped actions
  keep their defaults; verify an unknown action name, a malformed or
  modifier-less accelerator, and a remap colliding with a remaining default
  each start the application on default keybinds with the exact field reported
  in the error surface.
- **Snippets Sidebar:** with no `snippets.json`, verify the toggle keybind
  (default `Cmd+Shift+S`) opens a clean empty sidebar beside a still-usable
  terminal. With a valid file, verify search filters by name and description,
  a click injects into that window's session and returns focus to the
  terminal, a default snippet lands unexecuted, an `execute: true` snippet
  runs, and a multi-line body arrives as one bracketed paste. Verify editing
  the file and reopening the sidebar shows the new content without restart.
  With an invalid file, verify the application and terminal stay unaffected
  and the sidebar shows the exact path and field in place of the list.
- **Operational logs:** verify current/previous JSONL retention, configured log
  levels, bounded permissions and size, useful lifecycle/failure metadata, and
  absence of Terminal Payload, clipboard data, commands, titles, environment,
  configuration contents, secrets, and transcripts.
- **Application boundary and cleanup:** verify native copy/paste/select-all,
  fullscreen, close, quit, and Window actions; verify the Terminal Surface fills
  the content area; verify there is no application telemetry/update traffic;
  remove the copied app and disposable test configuration/state after recording
  evidence.

## Linux exact-artifact record

Create this record before manual testing the AppImage and keep the publication
gate `BLOCKED` until Otávio accepts the exact artifact. Record `UNEXECUTED` for
anything not genuinely observed.

```text
Source commit:
Source tag (only when separately authorized):
Linux distribution and version:
Kernel version:
Architecture:
Node.js and npm versions:
Native toolchain versions:
FUSE 2 runtime package/version:
Exact AppImage absolute path:
Exact AppImage filename:
AppImage byte size:
SHA-256:
Automated npm run check:linux result:
Packaged-startup result:
Manual checklist results and evidence:
Unexecuted items and reasons:
Publication gate: BLOCKED or OWNER ACCEPTED
```

### Manual checklist for the exact AppImage

Use the exact unchanged AppImage named in the record, not the unpacked build
directory or another copy. Use disposable configuration, state, and user-data
roots for invalid-file and log checks.

- **AppImage and first launch:** confirm the filename and `file` output identify
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
- **Default Shell and exits:** verify the operating-system-configured interactive
  login shell starts in the account home directory and reports `TERM`,
  `COLORTERM`, `TERM_PROGRAM`, and `TERM_PROGRAM_VERSION` exactly as documented.
  In fresh windows, run `exit 0`, `exit 7`, and `kill -s KILL $$`; confirm normal
  exits close without a failure dialog and the signal failure remains visible
  until acknowledged.
- **Windows, tabs, and cleanup:** using Linux `Ctrl` application shortcuts and
  native menu items, exercise independent windows and tabs, idle and Busy close
  behavior, fullscreen, zoom, always-on-top, copy, paste, select-all, and quit.
  Confirm the tab strip and focus behavior, one confirmation per guarded action,
  and that no OMXTerm, AppImage mount, child shell, or foreground process remains
  after the last window quits.
- **Terminal compatibility:** exercise tmux, an alternate-screen TUI, Unicode,
  truecolor, scrolling, resize, a REPL, bracketed paste, and SSH started by the
  user. Confirm OMXTerm adds neither custom terminfo nor Shell Integration.
- **Linux file and folder insertion:** from the native Linux file manager, drop
  multiple files and folders containing spaces, apostrophes, Unicode, and shell
  metacharacters into a window. Confirm ordered, independently POSIX-quoted
  absolute paths reach only the selected tab through Protected Paste without
  Enter. Copy the same native selection and confirm Paste uses the GNOME file
  list or URI-list fallback only when plain text is empty. Confirm a non-file
  URL, malformed list, and drop without native files have no side effect.
- **Clipboard and Protected Paste:** verify selection does not copy, `Ctrl+C` and
  `Ctrl+V` remain PTY input, the default `Ctrl+Shift+C` and `Ctrl+Shift+V` plus
  native menu/context copy and paste work, unsafe multiline or control-character paste
  is confirmed outside bracketed-paste mode, bracketed paste is not prompted,
  and OSC 52 can write but cannot read or clear the clipboard.
- **Titles, BEL, links, configuration, and snippets:** exercise the same accepted
  title sanitization, silent BEL, literal HTTP/HTTPS activation, valid and
  invalid configuration/theme behavior, keybind remapping, and Snippets Sidebar
  behavior documented in the macOS checklist, using Linux menu labels and
  shortcuts. Do not infer these results from unit tests.
- **Logs, application boundary, and cleanup:** verify bounded local JSONL
  retention and permissions, useful payload-free Operational Events, no
  application telemetry or update traffic, and absence of Terminal Payload,
  clipboard contents, paths inserted by drop or paste, environment canaries,
  configuration contents, commands, titles, secrets, and transcripts. Remove
  disposable test state after recording evidence, but preserve the exact
  AppImage unchanged for checksum and owner acceptance.

## Windows exact-artifact record

Create this record before manual testing the NSIS installer and keep the
publication gate `BLOCKED` until Otávio accepts the exact artifact. Record
`UNEXECUTED` for anything not genuinely observed.

```text
Source commit:
Source tag (only when separately authorized):
Windows edition, version, and build:
Architecture:
Node.js and npm versions:
Exact installer absolute path:
Exact installer filename:
Installer byte size:
SHA-256:
Automated npm run check:win result:
Packaged-startup result:
Manual checklist results and evidence:
Unexecuted items and reasons:
Publication gate: BLOCKED or OWNER ACCEPTED
```

### Manual checklist for the exact NSIS installer

Use the exact unchanged installer named in the record, not the unpacked build
directory. Use disposable configuration, state, and user-data roots for
invalid-file and log checks.

- **Installer and first launch:** confirm the filename identifies the accepted
  version and arm64. Run the exact installer from Explorer and record the
  SmartScreen observation verbatim; a locally built installer may not carry
  the download mark-of-the-web, so record SmartScreen as `UNEXECUTED` rather
  than manufacturing or bypassing a warning, and never disable SmartScreen or
  other system protections. Confirm the one-click per-user install completes
  without elevation, the Start Menu entry and its icon appear, and the
  installed application launches with the OMXTerm window icon. Record that no
  publisher signature is presented.
- **Default Shell and exits:** verify Windows PowerShell starts as a plain
  interactive session in the user profile directory and reports `TERM`,
  `COLORTERM`, `TERM_PROGRAM`, and `TERM_PROGRAM_VERSION` exactly as
  documented. In fresh windows, run `exit 0` and `exit 7`; confirm each closes
  without a failure dialog. Stop the shell process abnormally (for example
  `Stop-Process -Id $PID` from that shell) and confirm an abnormal end stays
  visible until acknowledged when it is reported as a failure.
- **Windows, tabs, and Busy behavior:** using `Ctrl` application shortcuts and
  native menu items, exercise independent windows and tabs, fullscreen, zoom,
  always-on-top, copy, paste, select-all, and quit. Confirm the documented
  Windows Busy contract: because ConPTY hides the foreground process name,
  closing any live tab, window, or the application asks exactly once per
  guarded action while `confirmClose` is enabled. Confirm no OMXTerm or child
  shell process remains after the last window quits.
- **Terminal compatibility:** exercise an alternate-screen TUI, Unicode and
  emoji, truecolor, scrolling, resize, a REPL, bracketed paste, and SSH
  started by the user (`ssh.exe`). Confirm OMXTerm installs no shell
  integration.
- **Windows file and folder insertion:** from Explorer, drop multiple files
  and folders containing spaces, apostrophes, Unicode, and shell
  metacharacters into a window. Confirm ordered, independently quoted
  absolute paths reach only the selected tab through Protected Paste without
  Enter. Copy a file in Explorer and confirm Paste inserts the documented
  single-path clipboard fallback only when plain text is empty.
- **Clipboard and Protected Paste:** verify selection does not copy, `Ctrl+C`
  and `Ctrl+V` remain PTY input, the default `Ctrl+Shift+C` and
  `Ctrl+Shift+V` plus native menu/context copy and paste work, unsafe
  multiline or control-character paste is confirmed outside bracketed-paste
  mode, bracketed paste is not prompted, and OSC 52 can write but cannot read
  or clear the clipboard.
- **Titles, BEL, links, configuration, and snippets:** exercise the same
  accepted title sanitization, silent BEL, literal HTTP/HTTPS activation,
  valid and invalid configuration/theme behavior at
  `%USERPROFILE%\.config\omxterm\`, keybind remapping, and Snippets Sidebar
  behavior documented in the macOS checklist, using Windows menu labels and
  shortcuts. Do not infer these results from unit tests.
- **Logs, application boundary, and cleanup:** verify bounded local JSONL
  retention at `%USERPROFILE%\.local\state\omxterm\logs\`, useful payload-free
  Operational Events, no application telemetry or update traffic, and absence
  of Terminal Payload, clipboard contents, inserted paths, environment
  canaries, configuration contents, commands, titles, secrets, and
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
