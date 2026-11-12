# Open a second launch in the running process

Status: accepted. Amends
[ADR 0047](0047-reopen-the-last-windows-at-startup.md), whose profile lease
no longer has to stand in for a single-instance lock.

## Context

On Linux and Windows, opening OMXTerm again while it runs starts a second
process: the installed `.desktop` entry, a directly run AppImage and the Start
menu all run the executable again. On macOS the Dock and Finder only activate
the running app, but `open -n` and running the binary start a second process.

A second process on the same profile runs everything twice (extension
backends, configuration watchers) and, since Saved Layout reopens windows at
start, it neither reopens nor remembers anything: only the first process holds
the profile's layout lease. Work opened there is forgotten.

## Decision

Packaged OMXTerm runs one process per profile, using Electron's single-instance
lock.

- **Per profile.** Electron keys the lock on the userData directory, so a
  `--user-data-dir` profile (tests, packaged verification, a person's second
  profile) has its own lock and its own process.
- **A second launch becomes a window.** The new process parses its own
  arguments, hands the Launch Request to the running process and quits right
  away. The running process opens a new Terminal Window: a plain launch opens
  the Default Shell; a `-e` launch runs its program in the new window's first
  tab. A caller that waits on the launched process returns immediately, not
  when the command ends.
- **The request travels as data.** The parsed request goes through the lock's
  additional data, not the forwarded argv, which Electron may reorder or
  extend. The running process checks its shape; anything it can't read opens
  the Default Shell.
- **Failures stay where they happen.** A trailing `-e` with no program fails
  in the new process with the usual startup dialog and is never handed off.
- **Launches during startup wait.** A launch that arrives before the running
  process finished starting (and reopening) opens once it has.
- **The Linux X11 relaunch** never takes the lock: only the relaunched process
  does, so it can't hand off to the process that is exiting.
- **Source runs skip the lock.** `npm run dev` and test fixtures keep starting
  their own process. A development build and the installed app use the same
  profile directory (`omxterm`), and a dev build must not hand off to the
  installed one. The layout lease from ADR 0047 keeps covering that overlap.

## Consequences

- A launch from another process opens a new window even when OMXTerm already
  has windows. A Dock or Finder activation on macOS stays a plain activation.
- When the running process was started with `-e`, it neither reopens nor
  remembers windows (ADR 0047), and later launches join it, so that session's
  windows aren't remembered. The next plain start reopens the last remembered
  arrangement as before.
- A launch that reaches a process already quitting opens nothing.
- Starting a newly installed version while an older one runs opens a window in
  the older one until it quits.
