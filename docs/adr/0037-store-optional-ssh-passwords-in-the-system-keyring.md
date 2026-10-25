# Store optional SSH passwords in the system keyring

## Context

[ADR 0036](0036-run-saved-ssh-sessions-through-the-system-openssh-client.md)
left passwords at ssh's own prompt. Users of password-only hosts asked to
save a session's password, as AshyTerm did, and to be offered a password when
an agent or key session cannot sign in. AshyTerm's `sshpass -f` file wrote the
secret to disk and is still not ported.

## Decision

- **Opt-in per session.** Password authentication shows a password field with
  a show/hide toggle and **Password (typed when prompted)**. Choosing the
  latter, or leaving a session on agent or key, stores nothing.
- **Storage.** A stored password lives only in the Credential Store
  (`credentials.json`, encrypted by Electron `safeStorage`: Keychain, DPAPI or
  the Secret Service), keyed `session:<saved-session-id>`. Chromium's
  `basic_text` backend is refused, so without a secure keyring storing is
  unavailable and ssh asks as before. `sessions.json`, exports and backups
  never contain it. The renderer can store or remove a password but only
  learns whether one exists; it never reads one back.
- **Delivery.** ssh asks a helper through `SSH_ASKPASS` with
  `SSH_ASKPASS_REQUIRE=force` (OpenSSH 8.4+). A `0700` launcher in the private
  ControlMaster directory runs the helper with Electron as Node.js. For a
  password prompt the helper sends a one-time token over a `0600` Unix socket
  in the same directory, and main answers once per launch; tokens expire after
  ten minutes. Every other prompt, including unknown host keys, verification
  codes and the retry after a wrong password, is asked on the session's own
  terminal with ssh's echo rules. The password never enters argv, the
  environment, terminal output, logs or temporary files.
- **Lifetime.** Deleting a session, deleting its folder or switching it away
  from password authentication removes the stored password.
- **Recovery offer.** When an agent or key Saved Session ends with OpenSSH's
  "Permission denied" or "Too many authentication failures", its ended banner
  offers switching it to Password (typed when prompted) and reconnecting.
- **Platforms.** Windows' OpenSSH keeps the prompt only; storing is reported
  as unavailable there.

## Consequences

Password-only hosts connect without typing, at the cost of trusting the user
account's keyring. Anyone who can run code as the same user could already
read that keyring and the askpass socket, so no new boundary is crossed. A
host that asks for the password through an unusual keyboard-interactive
prompt that does not end in "password:" is typed at the terminal. The Files
panel still reuses the terminal's shared connection rather than the stored
password.
