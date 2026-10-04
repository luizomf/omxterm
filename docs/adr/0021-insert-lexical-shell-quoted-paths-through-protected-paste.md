# Insert lexical shell-quoted paths through Protected Paste

Complements [ADR 0009](0009-keep-clipboard-access-explicit-and-one-way.md):
path insertion is a user-initiated paste-like action, so the clipboard stays
explicit and one-way, and the plain-text paste contract is untouched.

OMXTerm inserts native file-manager files and folders — dropped on a Terminal
Window or pasted when the clipboard has no plain text — as lexical,
platform-absolute path tokens delivered through Protected Paste without Enter.
The user always decides execution. Bracketed-paste-aware processes receive one
semantic paste; everything else keeps the multiline confirmation. Both entry
points reuse the Terminal Surface's existing injection seam, so the Surface
stays free of Electron, filesystem, and platform shell policy; the renderer
gains only the narrow preload capability that maps a dropped `File` to its
path (`webUtils.getPathForFile`).

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

Each path becomes an independently single-quoted token for the platform's
Default Shell: POSIX quoting with the close-quote/escaped-apostrophe/reopen
idiom on macOS and Linux, and Windows PowerShell 5.1 quoting that doubles
`U+0027` and the `U+2018`–`U+201B` quote characters PowerShell also treats as
quotes. Single quotes were chosen over backslash escaping or double quotes
because they neutralize the largest metacharacter surface without enabling
variable or subexpression expansion. The encoding assumes insertion at a
fresh ordinary argument-token boundary in the initial Default Shell. Without
Shell Integration ([ADR 0013](0013-do-not-inject-shell-integration.md)),
OMXTerm cannot see shell state, so it does not promise correct syntax inside
a partial quote, nested shell, SSH session, REPL or TUI. Lexical insertion avoids
shell integration and context guessing.

Electron 43's public Windows clipboard API exposes only one Explorer
`FileNameW` path, so Windows clipboard Paste inserts that single path while
multi-file Windows insertion remains complete and ordered through drag and
drop. OMXTerm uses the supported Electron API rather than parsing raw
`CF_HDROP`; clipboard Paste does not claim complete multi-file insertion on
Windows.
