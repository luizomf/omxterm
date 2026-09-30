# Do not inject shell integration

OMXTerm launches the user's Default Shell as an interactive login shell on macOS
and Linux. Windows starts its selected shell interactively without a login flag.
Shell startup remains user-owned: OMXTerm leaves startup files, `ZDOTDIR`,
dotfiles, and shell commands unchanged and injects no project-owned scripts.
Apart from the Terminal Capability Identity required to describe the PTY, the
session inherits the user's environment and configuration as they exist.

Shell Integration can provide richer prompt, working-directory, title, and
notification behavior, but it also makes OMXTerm participate in shell startup
and creates failure modes outside the application Boundary. The first version
prefers a predictable PTY over convenience that modifies or interposes on the
user's shell. A future opt-in integration would require its own spec, visible
installation/removal behavior, and compatibility tests; it must never arrive as
an implicit implementation detail.
