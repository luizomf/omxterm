# Keep user configuration strict and non-mutating

OMXTerm will reject missing or unsupported schema versions, unknown keys,
invalid JSON, and invalid values with precise errors. It will never silently
ignore configuration input, migrate a configuration, rewrite it, or replace it
with guessed defaults; the application makes useful noise and leaves the user's
file untouched.
