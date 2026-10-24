# Validate external links at the main process

OMXTerm recognizes as External Links only literal HTTP and HTTPS URLs
visible in Terminal Payload. Activation requires `Cmd+click` on macOS or
`Ctrl+click` on Linux and Windows. The exact visible string
is the activation request; OMXTerm consumes OSC 8 control sequences but
ignores their semantic-link metadata because it can hide a destination behind
unrelated text. Text carried by OSC 8 still renders normally, and a literal URL
within that visible text may be detected independently.

The Terminal Surface may identify and request an External Link activation; it
cannot navigate, create a window, or call Electron's shell API itself. The
Electron main process independently validates the IPC sender, parses the
complete URL, requires the exact `http:` or `https:` protocol and a non-empty
host, and only then asks the operating system to open it in the default browser.
Every other protocol is rejected without a fallback handler.

User interaction is necessary but does not validate an OS URL handler.
Allow-listing protocols prevents terminal text from selecting arbitrary handlers;
Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-shellopenexternal-with-untrusted-content)
explains the `shell.openExternal` boundary.

Boundary tests cover visible URLs, OSC 8 metadata whose destination
differs from its visible text, control sequences split across PTY output chunks,
mixed-case and encoded protocol attempts, leading or embedded control
characters, protocol-relative and malformed URLs, `file:`, custom application
protocols, renderer navigation/window creation, forged IPC senders, and
repeated activation. Rejected input has no external side effect; link contents
are excluded from Operational Events.

Restty's visible-destination provider recognizes lowercase HTTP(S) URLs in cell
snapshots and joins rows only when Ghostty selection text proves a soft wrap. Surrounding prose punctuation and
closing brackets are excluded, an opening parenthesis terminates a match, nearby
URLs remain separate, and clipped destinations are refused rather than guessed.
A known mismatch between wide-wrap spacer cells and core selection text can
prevent recognition of a visible URL at some Unicode wrap boundaries
([#593](https://github.com/luizomf/omxterm/issues/593)).

Application-owned About links use a separate narrow route: the renderer sends
only `website`, `contributors`, `issues`, or `license`. Main validates the live
registered main-frame sender and maps that identifier to a fixed project HTTPS
destination. This does not extend the Terminal Surface's external-link privilege
or allow renderer-supplied addresses for About. Opening the dialog itself makes
no network request.

[ADR 0026](0026-preview-explicitly-activated-local-images.md) adds literal
`file:///` URL and conservative native path-reference recognition to the same
visible-destination and gesture owner, but keeps their bounded local-file
preview route separate from External Link opening.
