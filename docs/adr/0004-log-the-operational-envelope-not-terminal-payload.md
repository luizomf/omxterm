# Log the operational envelope, not terminal payload

OMXTerm writes structured JSONL diagnostics for behavior it owns, including the
application, IPC, PTY lifecycle, rendering control, and safe error context.
Operational Events support local diagnosis by people and automated tools. For
important asynchronous actions they record bounded, searchable request and
outcome metadata, duration, and a safe failure category when applicable. User
Configuration Reload, for example, records requested, succeeded, and rejected
outcomes. Configuration contents stay private, while stderr and the in-app error
surface report actionable validation errors and relevant paths.

Terminal input and output, clipboard contents, complete process environments,
configuration contents, and other private input are excluded at every log
level, including debug. This keeps diagnostics from becoming a transcript or
keylogger. Their machine-readable shape is an internal diagnostic aid, not a
public API or an exception to the privacy boundary.
