# Keep clipboard access explicit and one-way

File-manager path insertion through drop and Paste is a later, complementary
decision recorded in
[ADR 0021](0021-insert-lexical-shell-quoted-paths-through-protected-paste.md);
it does not change the one-way stance below.

OMXTerm will not copy terminal selections automatically. On macOS, `Ctrl+C`
remains terminal input, while `Cmd+C`, `Cmd+V`, and the contextual menu provide
explicit text copy and paste actions. `Ctrl+V` also remains terminal input so a
local application such as an AI CLI can handle the shortcut and read image data
directly from the operating-system clipboard. Those image bytes do not travel
through the PTY.

OSC 52 may write to the host clipboard so tmux and terminal applications can
copy naturally, but clipboard read requests, empty writes, and malformed
payloads are consumed without changing the clipboard. OMXTerm will not inherit
the 64 KiB project limit from OMXTerm Web: local processes have a different
trust and transport boundary, and large valid copies and text pastes must not be
truncated by an arbitrary SSH-oriented limit. Runtime dependencies may still enforce their safety bounds. Restty's pinned
OutputFilter retains at most 10,000,000 UTF-16 code units for an unfinished OSC
handler body and consumes an oversized OSC 52 request without a clipboard or PTY
side effect. Because an OSC 52 write includes the `c;` target and Base64 advances in
four-character groups, the largest valid request inside the parser bound is
9,999,998 UTF-16 code units and the next valid request is 10,000,002 UTF-16 code
units, outside the bound.

Potentially executable multiline or control-character pastes require user
confirmation unless the receiving process has enabled bracketed paste. Neither
clipboard contents nor pasted Terminal Payload may be logged. A confirmed paste
is forwarded completely and, when bracketed paste is enabled, remains one
semantic paste even if IPC or PTY streaming splits its bytes internally. OMXTerm
does not truncate, summarize, convert, or otherwise interpret large text; an
interactive CLI may replace it with a placeholder or attachment inside its own
input model.

Platform-specific key mappings belong inside the Terminal Surface rather than
its public Interface, so adding another Supported Platform does not change the
session Adapter contract.
