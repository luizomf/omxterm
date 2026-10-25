# Confirm close only for Busy Sessions

Defines close confirmation for the tab lifecycle in
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

`confirmClose` guards closing a pane, closing a tab, closing a window, and
quitting with one confirmation per action. Close Pane considers only its
captured focused pane; Close Tab considers every affected pane, including live
siblings of a focused pane that is pending or retained after exit. A close action asks only when an
affected Live Terminal Session is a Busy Session: an explicit command, any live
Windows session, or a Unix session whose PTY foreground name differs from the
idle Default Shell or cannot be read. ConPTY reports a static console title,
not a foreground name, so Windows deliberately asks for all live sessions.
Closing only idle Unix Default Shell sessions proceeds without a dialog. Quit
asks when any open session is Busy.

Close Pane uses the same prepare/resolve ownership protocol as Close Tab,
capturing the pane before the asynchronous dialog and consuming that target once.
A removed target is inert; later focus never retargets the decision.

Confirmation protects running work without adding a dialog for an idle Unix
shell. The name-only heuristic keeps that decision local and cheap rather than
turning close into a process-tree inspection.

The inspection is deliberately minimal: OMXTerm reads only the PTY's
foreground process name (node-pty's `process`), compares it in memory against
the Default Shell's name known from the spawn, and never logs, displays, or
transmits it. Names are inspected on demand during close decisions, without
polling, argument reading or process-tree traversal. An unreadable name counts
as Busy so a detection failure asks before ending work. A nested shell with the
same name counts as idle; a differently named shell counts as Busy. This is a limitation of the name-only heuristic.

Pinned node-pty 1.1.0's Linux public getter substitutes the spawned shell when
its native foreground lookup is unavailable. Postinstall removes that fallback
from the reviewed Unix runtime so unreadable names count as Busy. An ordinary Linux pipeline can reach this state when its short-lived
foreground group leader exits before another pipeline member. The preparation
and byte guards are documented in the [native development guide](../development.md).

Close Tab confirmation retains its original renderer-owned tab rather than
resolving selection again after the asynchronous answer. Main serializes one
pending tab confirmation per window, sends a preparation command before opening
the dialog, and sends its decision through the same ordered tab-command channel.
The renderer consumes that captured tab reference once; denial releases it and
an already removed tab is inert. This also identifies tabs still mounting,
without inventing a session ID before the Adapter starts. Window disposal
invalidates pending decisions. Native PTY completion stays independent under
[ADR 0028](0028-wait-for-native-sessions-before-application-quit.md).
