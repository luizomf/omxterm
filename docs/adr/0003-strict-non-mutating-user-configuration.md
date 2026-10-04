# Keep user configuration strict and non-mutating

OMXTerm rejects missing or unsupported schema versions, unknown keys, invalid
JSON and invalid values with precise errors. It does not migrate, repair,
rewrite or silently ignore an existing user document.

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

**Current application-failure limitation:** publication and log-level change
precede consumer application, whose steps run sequentially. If a consumer
throws, the rejection path keeps the newly published configuration and does not
undo already applied native/renderer/menu effects. The displayed claim that the
last configuration was retained can be false. Complete validation is not
transactional rollback of side effects. An injected consumer exception confirms
this conditional incoherence; an ordinary production throw trigger is not
established. This boundary does not imply a distributed rollback requirement. Restart after fixing the cause reestablishes a
startup snapshot; application-time exceptions have no rollback guarantee.

Creation-time family and line-height behavior and the pending font-acquisition
race are described in
[ADR 0025](0025-use-restty-as-the-terminal-surface.md).

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
