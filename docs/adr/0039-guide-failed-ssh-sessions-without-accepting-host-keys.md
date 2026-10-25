# Guide failed SSH sessions without accepting host keys

## Context

A Saved or Quick Connect session that fails keeps its final screen with
Reconnect and Close. ssh reports its own errors with exit status 255: a
changed host key, a refused sign-in, an unreachable or unknown host. Users
saw messages such as "REMOTE HOST IDENTIFICATION HAS CHANGED" without knowing
what to do next, and the usual fix for a reinstalled computer (removing its
old key from `known_hosts`) is also exactly what an attacker in the middle
would want.

## Decision

- When an SSH session ends with status 255, the ended banner adds
  **Solution** beside Reconnect and Close.
- Solution reads the tail of the pane's final output only to name the cause
  (changed or unverified host key, refused sign-in, refused connection,
  timeout, no route, unknown host name, or the last error line) and to show
  the received fingerprint. That text never reaches a command.
- For a changed host key in the user's own `~/.ssh/known_hosts`, the dialog
  explains the risk, shows the fingerprint, and asks the user to confirm it
  with whoever manages that computer. Only the explicit **Remove old key and
  reconnect** runs `ssh-keygen -R <host> -f ~/.ssh/known_hosts` in main, with
  literal arguments. ssh-keygen keeps the previous file as `known_hosts.old`.
  The host comes from the session definition or the Quick Connect target,
  never from the renderer or the terminal output. The reconnect then makes
  ssh ask about the new key in the terminal under the session's own Host key
  checking policy. OMXTerm still never accepts a key for the user.
- A key in another file, such as a system-wide `ssh_known_hosts`, is not
  changed; the dialog shows the manual command instead.
- A refused sign-in on an agent or key Saved Session offers switching to
  Password (typed when prompted) and reconnecting
  ([ADR 0037](0037-store-optional-ssh-passwords-in-the-system-keyring.md)).
  Network failures explain what to check and offer Reconnect.

## Consequences

The common case, a reinstalled computer, takes one confirmed click instead
of a manual `ssh-keygen` command, while the warning and the fingerprint stay
in front of the user. A session whose Host key checking is "accept new keys"
accepts the new key on that reconnect without a question; the dialog's
fingerprint check is the user's verification in that case.
