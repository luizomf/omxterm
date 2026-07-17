# Keep terminal titles display-only

OMXTerm will honor OSC 0 and OSC 2 title requests so shells, tmux, and terminal
applications can provide useful context in the native Terminal Window. The
requested title is untrusted Terminal Payload: OMXTerm accepts only printable
single-line text, removes control and invisible bidirectional formatting
characters, and rejects a request longer than 256 characters instead of
truncating it. An empty accepted title restores the `OMXTerm` fallback.

Terminal titles are a one-way display channel. OMXTerm will not implement title
reporting or send the current title back to the PTY, will not include title
contents in logs, and will not use them as application identity or authority. A
rejected request may emit an Operational Event containing only a normalized
reason such as `too_long` or `invalid_characters`.

This boundary requires targeted security review before delivery. Verification
must cover OSC sequences split across PTY output chunks; C0, C1, DEL, newline,
and bidirectional formatting characters; empty and oversized titles; repeated
title changes; the pinned xterm parser and Electron title API; absence of any
title-report response to the PTY; and absence of title contents from every log
level. Tests must assert observable window and PTY behavior rather than only the
sanitizer implementation.
