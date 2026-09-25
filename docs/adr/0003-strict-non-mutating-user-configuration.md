# Keep user configuration strict and non-mutating

OMXTerm rejects missing or unsupported schema versions, unknown keys, invalid
JSON, and invalid values with precise errors. It leaves the user's file untouched
and does not ignore input, migrate the document, rewrite it, or invent a repair.

The 0.2.0 amendment allows startup to continue after rejection because OMXTerm
may be the terminal used to repair the file. In that case, the application uses
its built-in defaults and presents the precise problem in a persistent,
non-blocking error surface. The fallback is a clean default configuration, never
a guessed repair or a previously persisted configuration. Strict validation and
the non-mutating file boundary remain unchanged.

The manual User Configuration Reload amendment reuses the complete startup
validation boundary. A running application already has a valid in-memory
configuration, so a rejected reload keeps that configuration active and reports
the new problem. A valid reload replaces it atomically. This runtime state is not
a persisted cache. Removing `config.json` selects the valid all-defaults state
on reload, just as it does at startup. Reload still does not write, repair, or partially apply the document.

## Initial configuration kit amendment

Application startup may seed absent user files with built-in defaults. An
existing `config.json` entry opts out of the entire kit, even if invalid or a
dangling symlink. Otherwise startup creates a default configuration, a
non-executing snippet example and `themes/omtheme.json`, preserving all existing
files. Complete files are published without replacement, with configuration
last. Creation errors are non-blocking notices; normal loading continues.
Manual reload never seeds files. User documents are never repaired or migrated.

This happens on first opening rather than installation: DMG copying and direct
AppImage use offer no common installer execution point. Runtime creation uses
the existing XDG resolution under the actual user's account on all platforms.
The external theme copy becomes user-owned and is not upgraded automatically.
No theme discovery UI or automatic reload is introduced.
