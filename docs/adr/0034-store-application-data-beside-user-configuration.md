# Store application data beside user configuration

OMXTerm now keeps state that it creates and edits itself: Saved Sessions, and
later custom commands, highlight rules and workspace layouts. That state is
**Application Data**. It lives in the same XDG directory as `config.json`
(`$XDG_CONFIG_HOME/omxterm/`, ADR 0002) but in separate files that OMXTerm owns.
`config.json` keeps the strict, user-authored contract of ADR 0003.

## Format and writes

Each document is UTF-8 JSON shaped as `{ "version": N, "data": … }`, at most
4 MiB, validated on every load and before every save. Writes go to a private
sibling (`mode 0600`, directory `0700`), are flushed, and then renamed over the
target, so a crash leaves either the old or the new document. Saves to one
document are serialized so a slow earlier write cannot replace a later one.

## Recovery and versions

- A missing file is the empty document and is not created until the first save.
- An unreadable, oversized or invalid file is renamed to
  `<name>.corrupt-<timestamp>` and the empty document is used. Nothing is
  silently overwritten, and the safe `application-data.recovered` Operational
  Event names only the document and a fixed reason.
- A file written by a newer OMXTerm is left untouched and ignored, so a
  downgrade cannot destroy it.
- Older versions are migrated in memory; the file changes only on the next
  explicit save.

## Secrets

Secrets never enter Application Data documents. The Credential Store encrypts
each secret with Electron `safeStorage`: Keychain on macOS, DPAPI on Windows,
and the Secret Service (GNOME Keyring or KWallet) on Linux. It stores only
ciphertext under opaque identifiers in `credentials.json`. When Linux offers
only Chromium's constant-key `basic_text` backend, OMXTerm refuses to store
secrets rather than pretend to protect them.

## Consequences

Users can back up, inspect and delete these files directly. They are not
watched; OMXTerm reads them at startup and is their only writer while running.
