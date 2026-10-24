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
never writes, completes or reformats the document. Every candidate passes the
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

A successful write is followed by the ordinary manual reload. The editor
reports what actually happened: saved and applied, saved but not applied (with
the reload's reason), and settings that apply only to new windows or need a
restart for open tabs. A resolved request is not reported as application.

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
