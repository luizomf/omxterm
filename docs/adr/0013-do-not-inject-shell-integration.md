# Do not inject shell integration

OMXTerm launches the user's Default Shell as an interactive login shell on macOS
and Linux. Windows starts its selected shell interactively without a login flag.
Shell startup remains user-owned: OMXTerm leaves startup files, `ZDOTDIR`,
dotfiles, and shell commands unchanged and injects no project-owned scripts.
Apart from the Terminal Capability Identity required to describe the PTY, the
session inherits the user's environment and configuration as they exist.

Shell Integration can provide richer prompt, working-directory, title, and
notification behavior, but it also makes OMXTerm participate in shell startup
and creates failure modes outside the application Boundary. The current
architecture prefers a predictable PTY over convenience that modifies or
interposes on the user's shell. OMXTerm does not infer shell cwd or prompt
state; richer shell-aware behavior remains outside its current boundary. The
one exception reads, never requests, an OSC 7 directory a shell already emits:
a split pane may start in its source pane's last reported local directory
([ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md)). Shells that do
not report it keep the home directory.
