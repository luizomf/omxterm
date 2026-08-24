# Log the operational envelope, not terminal payload

OMXTerm will write structured JSONL diagnostics for the behavior it owns,
including application, IPC, PTY lifecycle, rendering control, and safe error
context. These Operational Events prioritize useful local diagnosis by both
humans and automated tools: important asynchronous actions record bounded,
searchable request and outcome metadata, duration, and a safe failure category
when applicable. User Configuration Reload therefore records requested,
succeeded, and rejected outcomes without recording the configuration, private
paths, or validation detail intended for stderr and the in-app error surface.

No log level, including debug, will record terminal input or output, clipboard
contents, complete process environments, configuration contents, or other
private input; diagnostics must never become an accidental transcript or
keylogger. Machine-readable diagnosis does not turn the log into a public API
or weaken this privacy boundary.
