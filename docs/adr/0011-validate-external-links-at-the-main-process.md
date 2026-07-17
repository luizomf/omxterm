# Validate external links at the main process

OMXTerm will recognize only literal HTTP and HTTPS URLs visible in Terminal
Payload, and activation on macOS requires `Cmd+click`. The exact visible string
is the activation request; OMXTerm will consume OSC 8 control sequences but
ignore their semantic-link metadata because it can hide a destination behind
unrelated text. Text carried by OSC 8 still renders normally, and a literal URL
within that visible text may be detected independently.

The Terminal Surface may identify and request an External Link activation; it
cannot navigate, create a window, or call Electron's shell API itself. The
Electron main process independently validates the IPC sender, parses the
complete URL, requires the exact `http:` or `https:` protocol and a non-empty
host, and only then asks the operating system to open it in the default browser.
Every other protocol is rejected without a fallback handler.

This Boundary is motivated by
[CVE-2026-20841](https://www.cve.org/CVERecord?id=CVE-2026-20841), where Windows
Notepad opened unverified protocols from Markdown links and enabled remote code
execution after a user click. It also follows Electron's explicit warning that
[`shell.openExternal` with untrusted content can compromise the
host](https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-shellopenexternal-with-untrusted-content).
User interaction is necessary but is not treated as validation.

Security verification must cover visible URLs, OSC 8 metadata whose destination
differs from its visible text, control sequences split across PTY output chunks,
mixed-case and encoded protocol attempts, leading or embedded control
characters, protocol-relative and malformed URLs, `file:`, custom application
protocols, renderer navigation/window creation, forged IPC senders, and
repeated activation. Tests must prove that rejected input causes no external
side effect and that link contents do not enter Operational Events.

The visible-span implementation is pinned to `@xterm/addon-web-links` 0.12.0
alongside `@xterm/xterm` 6.0.0. Its strict provider expression owns the matched
span: surrounding prose punctuation and closing brackets are excluded, an
opening parenthesis terminates a match, nearby URLs remain separate, and a URL
may span xterm soft-wrapped buffer lines. OMXTerm supplies the lowercase-only
form of that expression and forwards the provider's matched string unchanged.
