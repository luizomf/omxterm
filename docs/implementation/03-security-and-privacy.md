# Security and privacy

What the AshyTerm port changes in OMXTerm's threat model, and the controls
each feature relies on. Everything here is enforced in code and covered by the
named tests.

## Boundaries

- **IPC trust.** Every new channel (sessions, highlights, commands, backup)
  registers through `registerTrustedHandlers`. A call is rejected unless it
  comes from a registered Terminal Window's main frame
  (`senderFrame === sender.mainFrame`), and the rejection is recorded as
  `boundary.rejected`. Payloads are validated in preload and again in main.
- **Intents, not commands.** The renderer never sends a program, argument or
  path to execute. Saved sessions are referenced by id and Quick Connect
  targets are parsed (`parseSshTarget`) on both sides.
- **Literal argv.** Programs start through `node-pty` with an argument
  vector. No feature builds a shell string for execution. The Command Manager
  only types text into the terminal after the user sees a preview.

## SSH

- OpenSSH runs with literal arguments built by `sshArguments`. Hosts starting
  with `-` are rejected, and so are extra `-o` options that run local
  programs or weaken host-key checking (`ProxyCommand`, `LocalCommand`,
  `PermitLocalCommand`, `KnownHostsCommand`, `StrictHostKeyChecking`,
  `UserKnownHostsFile`, `Match`, among others).
- Host keys use OpenSSH's own prompt (`ask`). OMXTerm never accepts a key
  for the user.
- Passwords and passphrases are typed at ssh's prompt unless the user stores
  a session's password, which then lives only in the system keyring and
  reaches ssh through a one-time `SSH_ASKPASS` answer (ADR 0037). They are
  never logged, exported or placed on a command line, in the environment or
  in terminal output. AshyTerm's `sshpass` path is not ported.
- ControlMaster sockets live in a private (0700) per-user runtime directory.

## Secrets and data at rest

- The Credential Store uses Electron `safeStorage` and refuses Linux's
  `basic_text` fallback, which would be plaintext in practice. Ids are opaque
  (`session:<id>`, `ai:<provider>`) and never contain host names.
- Application Data and exports contain definitions only.
- Settings backups (`.omxbackup`) are encrypted with scrypt (N = 2^17) and
  AES-256-GCM. The header is authenticated with the data, key parameters are
  bounded on open, file names come from an allowlist, and credentials are
  never included. The renderer never receives the chosen paths.

## Terminal content

- Output highlighting reads the pane's own echoed command line to choose a
  rule set. That text stays in the renderer's memory and is never stored,
  logged or sent.
- User highlight patterns are rejected when they do not compile, match the
  empty string, take too long on probe inputs, or have nested unbounded
  quantifiers (`checkPattern`).
- Operational logs record event names, stages and counts only; paths,
  commands, terminal output and clipboard data are excluded. Error messages
  that cross IPC are fixed strings when they could carry a path.

## Network

No feature contacts the network on its own. SSH connections start only from
an explicit user action (open a session, Quick Connect, `--ssh`). There is no
telemetry.

## Open items

- The AI assistant, SFTP file manager and remote editing are not
  implemented. Each will need its own review: AI keys belong in the
  Credential Store, and remote editing must not write temporary files outside
  a private directory.
- A host-key mismatch currently shows ssh's own error. A guided fix flow with
  confirmation is planned.
