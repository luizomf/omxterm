# Keep user configuration strict and non-mutating

OMXTerm will reject missing or unsupported schema versions, unknown keys,
invalid JSON, and invalid values with precise errors. It will never silently
ignore configuration input, migrate a configuration, rewrite it, or replace it
with guessed defaults; the application makes useful noise and leaves the user's
file untouched.

Amended for 0.2.0: rejection no longer blocks startup. The terminal is the tool
users edit these files with, so an invalid file starts OMXTerm with its
built-in defaults (never a guessed repair, never a cached or previous
configuration — remembering prior state would require writing user-adjacent
files) behind a persistent, non-blocking error surface that reports the precise
problem. Strict validation, the useful noise, and the untouched user file are
unchanged.
