# File manager and transfers

**Status: not implemented.** Nothing in this area ships on this branch. This
record keeps the design constraints so the work can start from them.

## What AshyTerm does

AshyTerm has a file-manager panel for local folders and, over SFTP, for the
host of the focused SSH session. It supports upload and download with
progress, and remote editing: download to a temporary file, open it in an
editor, and upload on save.

## Constraints for OMXTerm

- **Main owns the file system and the network.** The renderer asks for
  listings by opaque handles (a pane's session plus a relative path) and
  never sends absolute paths to read or write, consistent with ADR 0006.
- **SFTP.** There is no SFTP client in the dependency tree. The choices
  are:
  - drive the system `sftp` in batch mode (no new dependency, but output
    parsing is fragile and differs on Windows OpenSSH);
  - add a maintained pure-JS SSH library (a new supply-chain dependency
    that needs review, and its own host-key and agent handling, duplicating
    OpenSSH's).

  This needs a maintainer decision and an ADR before any code.

- **Credentials.** SFTP must reuse what OpenSSH already trusts (agent,
  `known_hosts`, `~/.ssh/config`); OMXTerm must not keep a second key store.
- **Remote editing.** Temporary copies go in a private (0700) per-session
  directory, are deleted when the session ends, and are never logged.
- **Transfers.** They are cancellable and report progress through main.
  Overwrites need confirmation, and paths are validated against traversal
  on both ends.

## Interim

Local folders are reachable from the terminal itself, and drag-and-drop
already inserts quoted paths (ADR 0021). Remote files can be copied with
`scp`/`sftp` from a pane, including through the Command Manager.
