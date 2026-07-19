# Keep one live session per independent window

Superseded by [ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md):
after dogfooding invalidated the assumption that tmux would cover
multiplexing, tabs were adopted with one live session per tab.

One OMXTerm application process may own several independent Terminal Windows,
each with exactly one Live Terminal Session. `Cmd+N` creates another window and
shell, closing a window terminates only its session, and closing the last window
quits the application; OMXTerm will not add tabs, workspaces, session restoration,
or a user-facing window manager to this model.
