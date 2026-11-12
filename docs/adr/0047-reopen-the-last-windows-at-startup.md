# Reopen the last windows at startup

Status: accepted. Amends
[ADR 0042](0042-save-layouts-without-restoring-sessions.md), which ruled out
startup restore and autosave.

## Context

Saved Layout brings a window's structure back only when someone saves it and
opens it again. People expect a terminal they closed, or one that crashed or
updated, to come back the way they left it: same windows, tabs, splits and
folders. The scope stays the same as ADR 0042: structure and fresh shells, never
output, processes or commands.

Restoring has to happen before the first window appears. Waiting there for an
extension backend (a Node child, a package pin, a state lease) would slow every
start and add ways for startup to fail, and installed code would run before the
person asked for anything.

## Decision

Core owns reopening; an extension only switches it on.

- **Opt-in.** Reopening is on while an installed, enabled extension declares
  `terminal.reopenLayout.v1` (Saved Layout 0.3.0 and later). No extension code
  runs at startup. Turning it off (disable or uninstall) deletes the remembered
  windows.
- **Remembering.** While it is on, a 3 s tick captures every terminal window
  through the same capture as Save (ADR 0042), but only after activity that
  can change a layout or a folder: a pane starting, closing or exiting, PTY
  input, output or resize, or a tab selection. A closing window saves right
  away, after any save in progress. Main writes
  `<profile>/layout-session/last.json` only when the arrangement changed. It
  never writes while quitting, for an empty window set, or when a window can't
  be captured right now, so closing windows one by one during Quit, or the last
  window closing, keeps the last arrangement. Closing one of several windows
  forgets that window. A window without a terminal tab is skipped; tabs past 16
  tabs or 32 panes count as omitted; only the first 16 windows are kept.
- **Unavailable folders.** A reopened pane whose saved folder was missing
  starts at home but keeps the saved folder as its own until its shell reports
  another, so a mount that isn't there yet doesn't overwrite the layout.
- **Reopening.** A plain start opens each remembered window through the same
  plan as Open: every folder is checked, missing ones become home, and every
  pane starts a fresh Default Shell. A start with `-e` opens as asked and takes
  no part: it neither reopens nor remembers, so it can't overwrite the
  arrangement. Windows saved on another OS are skipped. If none can open, one
  ordinary window opens.
- **One owner per profile.** OMXTerm has no single-instance lock, so a second
  process on the same profile could reopen everything again and overwrite the
  first one's arrangement. Only the process holding the profile's
  `layout-session/session.lock` lease reopens and remembers; the OS releases it
  if OMXTerm crashes. Windows of a second process aren't remembered.
- **No crash loop.** A `reopening` marker is written before reopening and
  removed after the first successful save once the reopened windows run. If it
  is still there at the next start, the remembered windows are dropped and that
  start opens one ordinary window.
- **Turning it off.** The remembered windows are deleted when reopening goes
  from on to off while OMXTerm runs, never just because the extension runtime
  failed to load.

Window position and size aren't remembered. Writes are a complete temp file
renamed into place; there is no revision check, because only the lease owner
writes.

## Consequences

- Folder paths are now written without a deliberate Save, while the extension
  is enabled. They stay in the profile, never in logs, and are deleted when
  reopening is turned off.
- The extension needs a host that knows the capability; 0.27.0 rejects the
  manifest, so Saved Layout 0.3.0 needs a newer host while 0.2.0 stays the
  offer for 0.27.x.
- Capture requests from the page and from remembering share one renderer round
  trip per window instead of refusing each other.
