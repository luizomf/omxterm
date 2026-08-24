# Keep user configuration strict and non-mutating

OMXTerm will reject missing or unsupported schema versions, unknown keys,
invalid JSON, and invalid values with precise errors. It will never silently
ignore configuration input, migrate a configuration, rewrite it, or replace it
with guessed defaults; the application makes useful noise and leaves the user's
file untouched.

Amended for 0.2.0: rejection no longer blocks startup. The terminal is the tool
users edit these files with, so an invalid file starts OMXTerm with its
built-in defaults (never a guessed repair, never a persisted previous
configuration) behind a persistent, non-blocking error surface that reports the
precise problem. Strict validation, the useful noise, and the untouched user
file are unchanged.

Amended for manual User Configuration Reload: startup and reload reuse the same
complete validation boundary, but their fallback state differs because only a
running application has a last valid configuration. A valid manual reload
atomically replaces the active configuration; an invalid reload keeps the last
valid in-memory configuration active and reports the new problem. This is
runtime state, not a persisted cache. Removing `config.json` remains the valid
all-defaults state on reload, matching startup, and OMXTerm still never writes,
repairs, or partially applies the user's document.
