# Run saved SSH sessions through the system OpenSSH client

Saved Sessions are reusable launch definitions, local or SSH, kept as
Application Data (ADR 0034). Opening one always starts a new process; OMXTerm
never presents a restarted shell as a continuation of an earlier one.

## SSH client

SSH sessions run the platform's OpenSSH `ssh` client (`ssh.exe` on Windows)
in the PTY with a literal argument vector built in main, never a local shell
string.

- **Host names:** validated, and never starting with `-`, so a host cannot be
  parsed as an option.
- **Extra options:** given as `Name=value`. Options that run local programs or
  weaken host verification are rejected (`ProxyCommand`, `LocalCommand`,
  `KnownHostsCommand`, `StrictHostKeyChecking`, `UserKnownHostsFile`,
  `ControlPath`, among others); they belong in `~/.ssh/config`, which ssh still
  reads, so imported aliases keep their full Host blocks.
- **Host keys:** verification keeps OpenSSH's interactive default. A session
  may opt into `accept-new` or `yes`; `no` is never produced.
- **Passwords:** typed at ssh's own prompt unless the user stores one in the
  system keyring ([ADR 0037](0037-store-optional-ssh-passwords-in-the-system-keyring.md)).
  OMXTerm does not place them on command lines, in environment variables or
  in temporary files. AshyTerm's `sshpass -f` file is deliberately not ported.
- **Multiplexing:** ControlMaster is optional, Unix-only, and uses OpenSSH's
  `%C` hash in a private `0700` runtime directory. It is skipped whenever
  forwards, X11 or ProxyJump need a fresh connection.

## Launch boundary

The renderer starts a session with an intent only: `saved-session` with an id,
or `quick-ssh` with a `[user@]host[:port]` target that main parses again.
Main resolves the definition and builds the argument vector, so the renderer
cannot construct commands (ADR 0006). Local Saved Sessions may set a working
directory, which must exist, a literal program and argument vector, and an
initial command typed once after spawn.

## Failure presentation

Saved and Quick Connect panes keep their final screen after a non-zero exit,
with Reconnect and Close actions, so connection errors stay readable. Input to
an ended pane is refused, and the retired session id is never addressed again.
