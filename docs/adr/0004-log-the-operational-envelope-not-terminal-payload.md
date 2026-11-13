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

This diagnostic boundary does not prohibit users accessing or saving their own
terminal content. Explicit user-requested copying, local search and saving output
to a chosen file are distinct from operational logging and automatic transcript
collection. Scrollback Search stays in memory; Explicit Export may persist the
requested text through the normal native save chooser without another opt-in
toggle. Neither puts that content in diagnostic logs or authorizes automatic
recording or network transmission.

## Amendment: the agent API (ADR 0052)

The [agent API](0052-let-a-local-agent-drive-a-granted-window.md) adds content
that is excluded the same way: its requests and responses, grant tokens and
handshake proofs, the text an agent sends and the pane text it reads. Its
Operational Events carry only the envelope: `agent.grant` (a window started,
ended or was refused a grant, with a fixed reason) and, at debug level,
`agent.command` (the command name, its outcome code and duration) and
`agent.rejected` (a client that failed the handshake or hit a limit, with a
fixed reason).
