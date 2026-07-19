# Local arm64 release procedure

This procedure prepares and verifies the unsigned OMXTerm Release Artifact. It
does not authorize a tag, GitHub Release, upload, signing, notarization, or any
other publication. Those actions require separate approval from Otávio.

## Version selection and consistency

Select the release version under the [versioning policy](versioning.md) in an
explicitly authorized release preparation issue. This procedure does not choose
or increment a version by itself. A `-dev` development baseline version is
never releasable; release preparation removes the prerelease suffix.

Before building a release candidate, confirm that `package.json` and
`package-lock.json` contain the same accepted `X.Y.Z` version. The application
version, intended `vX.Y.Z` tag, `TERM_PROGRAM_VERSION`, DMG filename, checksum
filename, and GitHub Release must all identify that same version.

## Build and automated verification

Use an accepted release commit for `X.Y.Z`, with `vX.Y.Z` recorded as the
intended tag, on the Supported Platform: Otávio's current Apple Silicon
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

## Exact-artifact record

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
- **Multiple windows and cleanup:** use `Cmd+N` for at least two independent
  Live Terminal Sessions; verify `Cmd+W` closes only the selected window, the
  last window quits OMXTerm, and `Cmd+Q` requests one confirmation for all open
  windows. Confirm no OMXTerm or child shell remains after quit.
- **tmux, TUI, and terminal compatibility:** exercise tmux, an alternate-screen
  TUI, Unicode, truecolor, scrolling, resize, a REPL, bracketed paste, and SSH
  started by the user. Confirm OMXTerm installs no shell integration or custom
  terminfo.
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
  titles, and BEL in focused and unfocused windows. Confirm sanitized bounded
  titles, silent BEL, one Dock attention request, and the temporary bell marker.
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

Any failed required item or any unexplained unexecuted item keeps every future
tag, GitHub Release, attachment, or upload blocked. The Gatekeeper observation
may remain `UNEXECUTED` only when the locally built DMG has no download
quarantine and that reason is recorded; this conditional observation does not
by itself block publication, but the required Gatekeeper release guidance still
applies. Missing exact-artifact manual evidence does not prevent a preparatory
packaging change from merging, but it does prevent publication.

## SHA-256

Generate the checksum only after the exact DMG finishes manual testing. From
the output directory, preserving the artifact's filename:

```sh
cd release
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256
```

Changing or rebuilding the DMG invalidates the checklist and checksum. Repeat
the entire exact-artifact check for the replacement.

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

## Later owner-authorized GitHub Release

Only after Otávio accepts the exact-artifact record and separately authorizes
publication:

1. confirm the canonical repository is `luizomf/omxterm`, the accepted source is
   tagged `vX.Y.Z`, and the package metadata, DMG, and checksum still match the
   accepted record;
2. create the canonical GitHub Release for that exact tag with the Gatekeeper
   and provenance note above; summarize material changes, identify incompatible
   changes and migration or state that there are none, and record relevant
   known limitations;
3. attach exactly `OMXTerm-<version>-arm64.dmg` and
   `OMXTerm-<version>-arm64.dmg.sha256` manually;
4. download both attachments, verify the checksum again, and preserve the final
   release URL with the accepted evidence.

Do not automate these publication steps or perform them under the authority of
this repository procedure alone.
