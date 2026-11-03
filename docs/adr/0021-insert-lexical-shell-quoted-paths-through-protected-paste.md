# Insert lexical shell-quoted paths through Protected Paste

OMXTerm inserts native file-manager files and folders — dropped on a Terminal
Window or pasted when the clipboard has no plain text — as lexical,
platform-absolute path tokens delivered through Protected Paste without Enter.
Bracketed-paste-aware processes receive one semantic paste; other processes use
Protected Paste confirmation for multiline or control-character input. Delivery
follows the receiving Surface's lifetime under
[ADR 0009](0009-keep-clipboard-access-explicit-and-one-way.md). Both entry points
reuse the Surface's injection seam, keeping it free of Electron, filesystem and
platform shell policy; the renderer
gains only the narrow preload capability that maps a dropped `File` to its
path (`webUtils.getPathForFile`). Current Files source also offers one selected
path through a declared own-view capability. Main applies this same formatter,
then routes the result to the captured Surface through the existing semantic
input owner. At invocation, the app-owned child preload privately stamps the
latest observed core-selection revision and main-issued visible-admission
generation. Main validates them at receipt and commit, and core checks its own
selection before capture; missing or stale stamps fail closed, without a
caller-selected target or a global cross-process ordering guarantee. This source
feature requires a future Files archive and a host that understands the
capability; the published Files0.6 archive is unchanged. Its path-only tracked
chunks are acknowledged by the captured live local session after passing each
chunk to node-pty without synchronous error. This is not an OS or shell
consumption guarantee. A lost receipt stops the path and fences subsequent
Surface-queued semantic input until a definitive late receipt, if one arrives;
there is no automatic replay. This Files action refuses paths containing a
bracketed-paste terminator rather than stripping or rewriting them.

Paths are lexical only: OMXTerm never reads, resolves, normalizes, or stats a
target. Probing the filesystem from drop or clipboard data would turn
untrusted payload into filesystem access and make OMXTerm interpret what only
the receiving shell owns. For the same reason, plain text is never inferred to
be a path list — non-empty text pastes unchanged and takes priority — and a
malformed, mixed, or over-bound list inserts nothing at all, because a
partial insertion would silently misrepresent what the user handed over. The
exact bounds (256 paths, per-path and aggregate code-unit caps, and rejection
of oversized sources before decoding) are normative in
[`docs/spec.md`](../spec.md); they exist so a hostile or accidental clipboard
payload is bounded at the boundary rather than streamed into the PTY.

Each path becomes an independently single-quoted token using fixed platform
quoting: POSIX with the close-quote/escaped-apostrophe/reopen idiom on macOS and
Linux, and Windows PowerShell 5.1 quoting that doubles
`U+0027` and the `U+2018`–`U+201B` quote characters PowerShell also treats as
quotes. Single quotes were chosen over backslash escaping or double quotes
because they neutralize the largest metacharacter surface without enabling
variable or subexpression expansion. The encoding assumes insertion at a
fresh ordinary argument-token boundary in the corresponding shell;
`windowsShell` does not change the encoding. Without Shell Integration
([ADR 0013](0013-do-not-inject-shell-integration.md)), OMXTerm cannot see shell
state, so it does not promise correct syntax inside
a partial quote, nested shell, SSH session, REPL or TUI. Lexical insertion avoids
shell integration and context guessing.

Electron 43's public Windows clipboard API exposes only one Explorer
`FileNameW` path, so Windows clipboard Paste inserts that single path while
multi-file Windows insertion remains complete and ordered through drag and
drop. OMXTerm uses the supported Electron API rather than parsing raw
`CF_HDROP`; clipboard Paste does not claim complete multi-file insertion on
Windows.
