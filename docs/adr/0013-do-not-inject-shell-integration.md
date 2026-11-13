# Do not inject shell integration

OMXTerm launches the user's Default Shell as an interactive login shell on macOS
and Linux. Windows starts its selected shell interactively without a login flag.
Shell startup remains user-owned: OMXTerm leaves startup files, `ZDOTDIR`,
dotfiles, and shell commands unchanged and injects no project-owned scripts.
Apart from the Terminal Capability Identity required to describe the PTY and,
on macOS and Linux, three non-secret variables that locate the agent API (see
the amendment below), the session inherits the user's environment and
configuration as they exist.

Shell Integration can provide richer prompt, working-directory, title, and
notification behavior, but it also makes OMXTerm participate in shell startup
and creates failure modes outside the application Boundary. The current
architecture prefers a predictable PTY over convenience that modifies or
interposes on the user's shell. OMXTerm does not infer prompt state; richer
shell-aware behavior remains outside its current boundary. One exception reads,
never requests, an OSC 7 directory a shell already emits:
a split pane may start in its source pane's last reported local directory
([ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md)). Shells that do
not report it keep the home directory for ordinary splits. The optional
[Saved Layout extension](0042-save-layouts-without-restoring-sessions.md) can
explicitly persist bounded main-observed reports and honestly labelled known
launch directories for fresh Default Shells. Current host source also lets the
Files companion explicitly open the active pane's last reported path as a local
folder, subject to selection and lifetime checks. This does not infer current cwd,
authenticate locality, inject `cd`/`clear`, or alter shell initialization.

## Amendment: read the shell's working directory (#972)

Most shells don't emit OSC 7 out of the box, so splits and Saved Layout fell
back to home unless people edited their shell configuration. On macOS and
Linux, when a pane has no usable OSC 7 report, OMXTerm now reads the working
directory of the pane's shell process (the PTY's direct child, never the
foreground program), as tmux and most terminals do. It is read-only: nothing is
injected, and shell startup stays untouched. Linux reads `/proc/<pid>/cwd`;
macOS runs one `lsof` (in a UTF-8 locale) for every pane looked up at the same
moment. Lookups happen right before a split and before each layout capture:
the page's Save, and, while Saved Layout reopens windows, the autosave tick,
which runs at most every 3 s and only after layout or terminal activity
([ADR 0047](0047-reopen-the-last-windows-at-startup.md)). A failed lookup keeps
the folders read before. OSC 7 still wins when present; SSH Connect and `-e`
panes stay home. Windows keeps OSC 7 or home, because PowerShell's location
isn't its process working directory.

## Amendment: agent API discovery (ADR 0052)

On macOS and Linux every pane's PTY also gets `OMXTERM_CTL` (the absolute path
of the bundled `omxterm-ctl` launcher), `OMXTERM_PROFILE` (the profile
directory) and `OMXTERM_PANE` (process instance, window and session id, such
as `5f0c9a1e2b3d4c6f:3:s4`), in
granted and ungranted windows alike, so an agent running in a pane can find
the [agent API](0052-let-a-local-agent-drive-a-granted-window.md) with nothing
configured. They are values in the environment, not shell integration: no
startup file, prompt or command changes. None is a secret: the grant's token
never enters an environment. A pane never inherits another OMXTerm's values;
on Windows, until its slice, panes get none.
