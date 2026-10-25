# Keep user configuration strict and non-mutating

OMXTerm rejects missing or unsupported schema versions, unknown keys, invalid
JSON and invalid values with precise errors. It does not migrate, repair,
rewrite or silently ignore an existing user document on its own. Only an
explicit user request in Settings writes `config.json`, as described below.

## Startup and manual reload

Startup continues after configuration rejection because OMXTerm may be the
terminal used to repair the file. Invalid configuration selects clean built-in
defaults; an invalid selected theme uses bundled `omtheme` while retaining the
other validated preferences. The persistent non-blocking error surface reports
the problem. This is not a guessed repair or persisted last-good cache.

Manual User Configuration Reload reuses complete startup validation and
serializes requests. Validation/load rejection before application retains the
last valid in-memory settings and reports the current problem. A successful
load publishes a whole snapshot, then applies consumers synchronously. Removing
`config.json` selects defaults; manual reload does not seed files.

Consumer application is sequential, not transactional. If a consumer throws
after publication and the log-level change, those changes and any already
applied native/renderer/menu effects remain. The failure notice can therefore
incorrectly say that the previous configuration was retained. Restarting after
fixing the cause establishes a fresh startup snapshot.

Creation-time family and line-height behavior and the pending font-acquisition
race are described in
[ADR 0025](0025-use-restty-as-the-terminal-surface.md).

## Explicit settings writes

The Settings editor writes `config.json` only when the user deliberately
changes a control or saves the raw JSON editor. Opening OMXTerm or the editor
never rewrites, completes or reformats an existing document; startup may create
the initial kit when it is absent. Every candidate passes the
same loader as startup, including theme, installed-font and Windows-shell
checks, before it replaces the file atomically; a rejected candidate leaves the
file untouched and reports the precise diagnostic.

A graphical change rereads the file and changes only its own field. Other
entries, including external edits made after the editor opened, are kept, and
omitted values stay omitted. Clearing a field removes it so it inherits its
default again. The document is rewritten as two-space JSON; values and key
order are kept, but custom whitespace is not. A raw JSON save must start from
the file's current revision: if the file changed since the draft was loaded,
the save is refused as a conflict instead of overwriting it. Requests are
serialized. A file that cannot be read, decoded or parsed is reported, never
replaced with defaults; a parsed but invalid document may be repaired by a
change whose whole candidate validates.

After asynchronous validation and temporary-file preparation, the writer checks
the observed bytes/presence again immediately before rename. A mismatch refuses
the edit with a fresh snapshot and reload guidance, without automatic retry or
rebase. The in-process queue does not lock external editors: this final
compare-then-rename minimizes the remaining race but is not a cross-process
atomic compare-and-swap. Settings refuses writes through a `config.json`
symlink, including a dangling one, with guidance to edit the target manually
and reload. It preserves the link and target rather than silently replacing
the entry or inventing a target-following policy.

Graphical responses reconcile only controls whose submitted edit still owns
the field; unrelated or newer typing remains local. Queued changes retain
pending feedback until all requested changes settle. Graphical requests are
submitted immediately to the existing main-process queue, not retained in a
view-local queue. Closing does not cancel requested writes; a reopened view's
read follows the writes already requested, while removed views still ignore
late results. Raw Save and Reload File allow only one pending raw operation at
a time, while typing remains usable.
Their responses cannot replace newer typing or a closed/reopened view. After a
successful raw save, newer typing keeps the revision of the submitted bytes as
its base, so a subsequent external edit still conflicts. A saved snapshot
represents those submitted bytes, not later disk contents observed during
application. Its text/document use the loader's UTF-8 decoding semantics
(including removal of a leading BOM), while its revision hashes the exact saved
bytes. Snapshot decoding/parsing is completed before persistence; raw Save
still writes the submitted text, including an accepted BOM, without a new
normalization or validation policy.

A successful write is followed by the ordinary manual reload. The editor
reports what actually happened: saved and applied, saved but not applied (with
the reload's reason), and settings that apply only to new windows or need a
restart for open tabs. Both graphical and raw saves report returned notices
and the deferred lifetimes of changed effective values (including removal to a
default, but not no-op spelling changes). Exceptional reload failure after
persistence remains a saved-but-not-applied outcome, with no rollback claim or
private exception details. A resolved request is not reported as application.

## Initial configuration kit

Startup may seed absent files with built-in defaults. An existing `config.json`
entry opts out of the entire kit, even if invalid or a dangling symlink.
Otherwise startup creates configuration, a non-executing snippet example and
`themes/omtheme.json`, preserving existing siblings. Complete files are published
without replacement, configuration last. Creation errors are non-blocking
notices; normal loading continues. Documents are never repaired or migrated.

Creation happens at application opening, not installation: DMG copying and
direct AppImage use have no common installer execution point. The same XDG
resolution runs as the actual user on all platforms. The theme copy becomes
user-owned and is not upgraded automatically. No theme discovery UI or file
watching is introduced.
