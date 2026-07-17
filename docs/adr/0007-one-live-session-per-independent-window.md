# Keep one live session per independent window

One OMXTerm application process may own several independent Terminal Windows,
each with exactly one Live Terminal Session. `Cmd+N` creates another window and
shell, closing a window terminates only its session, and closing the last window
quits the application; OMXTerm will not add tabs, workspaces, session restoration,
or a user-facing window manager to this model.
