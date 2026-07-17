# Log the operational envelope, not terminal payload

OMXTerm will write structured JSONL diagnostics for the behavior it owns,
including application, IPC, PTY lifecycle, rendering control, and safe error
context. No log level, including debug, will record terminal input or output,
clipboard contents, complete process environments, or configuration contents;
diagnostics must never become an accidental transcript or keylogger.
