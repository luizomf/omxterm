# Session and SSH management

## Model

`sessions.json` (Application Data) holds folders and sessions
(`src/shared/saved-sessions.ts`).

- **Local session:** working directory, optional program with literal
  arguments, and an initial command.
- **SSH session:**
  - host, port, user;
  - authentication `agent | key | password`, with an optional identity file;
  - jump hosts and forwards (`L`/`R`/`D`);
  - agent and X11 forwarding, compression;
  - connection reuse;
  - a remote command;
  - extra `-o` options, minus the forbidden list in
    [03-security-and-privacy.md](03-security-and-privacy.md).

Both kinds share a name, folder, color, favorite flag and `lastUsedAt`.
`SavedSessionService` serializes mutations, validates whole documents and
notifies every window.

## Launch

1. The renderer sends `saved-session` with an id, or `quick-ssh` with a
   target.
2. Main resolves the definition. A missing local working directory fails
   with a readable error instead of starting somewhere else.
3. SSH sessions run the system OpenSSH client with `sshArguments(session,
{platform, controlDirectory, homeDirectory})`.
   - Paths follow the target platform's rules (`path.win32` on Windows).
   - `~` is expanded by OMXTerm.
   - ControlMaster is offered only where Unix sockets exist.
4. A local initial command is typed once, 50 ms after the program's first
   output, so the line editor is ready (R12).
5. Saved and Quick Connect panes use `retainOnExit`: a non-zero exit keeps
   the final screen with **Reconnect** and **Close**. Reconnect starts a new
   session in the same pane position.

`--ssh [user@]host[:port]` hands its target once to the first window's
renderer. That window opens it exactly like Quick Connect, so Reconnect works
too (R20).

## AshyTerm behaviors not ported, and why

| AshyTerm                           | OMXTerm                              | Reason                                                  |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| `sshpass` with stored passwords    | Keyring + one-time `SSH_ASKPASS`     | No plaintext secrets, no secrets in argv or environment |
| `StrictHostKeyChecking=no` options | Rejected; OpenSSH default `ask`      | Silent key acceptance enables MITM                      |
| `ProxyCommand` in session options  | Rejected; allowed in `~/.ssh/config` | Would run a local program from an imported definition   |
| Shell-joined command strings       | Literal argv                         | Injection safety                                        |

## Import and export

- `~/.ssh/config` import (`readSshConfigHosts`):
  - reads `Host`, `HostName`, `User`, `Port`, `IdentityFile` and `ProxyJump`;
  - skips wildcard hosts;
  - follows `Include` (relative to `~/.ssh`, with globs);
  - stops at the first `Match` block.
- JSON import and export carry definitions only; imported ids are remapped.

## Planned

- Auto-reconnect with backoff.
- A host-key mismatch flow (show fingerprints, confirm, update
  `known_hosts`).
- SFTP-backed file manager ([01-feature-parity.md](01-feature-parity.md),
  section 4).
