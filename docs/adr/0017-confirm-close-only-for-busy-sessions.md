# Confirm close only for Busy Sessions

Amends the `confirmClose` consequence of [ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

`confirmClose` keeps guarding closing a tab, closing a window, and quitting
with one confirmation per action, but a close action now asks only when an
affected Live Terminal Session is a Busy Session: its PTY foreground process
is not the idle Default Shell. Closing only idle sessions proceeds without a
dialog. Quit asks when any open session is Busy.

The pre-tab contract said OMXTerm "does not inspect child processes to guess
whether closing is safe" and asked every time. With one session per window
that cost one dialog per window close; with tabs it required a dialog whenever
`Cmd+W` closed an idle shell. Dogfooding of the tabs branch on 2026-07-19 showed
that this was the wrong default. The maintainer decided the confirmation should
protect running work, not idle shells — the convention Terminal.app and Ghostty
follow.

The inspection is deliberately minimal: OMXTerm reads only the PTY's
foreground process name (node-pty's `process`), compares it in memory against
the Default Shell's name known from the spawn, and never logs, displays, or
transmits it. There is no process-tree walking, no argument reading, and no
polling — the name is read once per close request. An unreadable name counts
as Busy so a detection failure degrades to asking, never to silently killing
work. The heuristic accepts known edge cases (a nested idle shell counts as
idle) as the price of staying name-only.
