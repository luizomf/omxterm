# Preview explicitly activated local images through a bounded main-process read

OMXTerm provides a Local Image Preview for one native-picker selection, one
literal visible authority-free absolute `file:///` URL, or one unambiguous
literal native absolute path activated with the platform's existing
modified-link gesture. Native path recognition accepts POSIX paths beginning
with one `/` and Windows drive-qualified paths beginning with a letter, colon,
and slash or backslash. It does not recognize relative paths, tilde forms,
UNC/device paths, infer a shell working directory, transfer an SSH path, use OSC
8 metadata, or read merely because output or hover exposed a path. A visible
native path always addresses the OMXTerm host even when its text came from SSH.
HTTP(S) External Links retain ADR 0011's operating-system browser route; local
image sources never reach that route.

Electron main owns source validation, the native picker, concurrency, and the
filesystem boundary. Each Terminal Window permits one picker or activated local
source request at a time. Picker, URL, and native paths are validated before
filesystem access;
UNC/device paths and ambiguous Windows paths without a drive are rejected even
when supplied by the native picker. Literal `%` and `#` in a native path remain
literal characters and are never URL-decoded or treated as a fragment. A
request opens a non-shell file descriptor, requires a
bounded regular file, reads one descriptor coherently, rejects an observed size
change while reading, and accepts only structurally valid, natively decodable
static PNG or JPEG content. The
limits are 16 MiB encoded, 8192 pixels per side, and 16 million pixels. PNG
animation metadata is rejected; filename extension is never evidence of format.
Closing the owner aborts picker continuation and makes later read results inert.
No path or payload enters Operational Events.

The narrow sender-validated preload route accepts only a picker marker or the
exact bounded file URL and returns only validated filename, media type,
dimensions, and bytes. It exposes no path, directory enumeration, generic read,
or arbitrary filesystem capability. The renderer creates one memory-only Blob
URL under a CSP that permits `blob:` only for images while preserving
`connect-src 'none'`. Escape, the close button, backdrop dismissal, decode
failure, page teardown, and owner close synchronously remove the image source
and revoke the Blob URL. Focus returns to the live selected Terminal Tab after
dismissal or picker cancellation. Late picker/read/decode results cannot reopen
a disposed overlay. The preview exposes only its active interaction state to
the Terminal Window host. While choosing, loading, or viewing, that host
suppresses terminal clipboard, file-drop, zoom and snippet actions and avoids
stealing focus; confirmed session/window lifecycle actions still proceed. This
keeps native menu routing from bypassing the DOM modal boundary, without
adding a general modal framework or cancelling already accepted input.

Restty's existing visible-destination provider and gesture owner recognize the
literal `file:///` span and native absolute path token alongside HTTP(S),
preserving soft-wrap proof and modified-click precedence over application mouse
reporting. Native paths use deliberately conservative boundaries: the complete
non-whitespace token must begin at a line boundary or after whitespace, and no
surrounding quote, bracket, assignment prefix, punctuation, or space is trimmed
or decoded. Thus paths containing whitespace and syntactically wrapped paths
are not recognized; punctuation already inside a recognized token remains part
of the exact requested filename. Main independently validates the complete URL
or path and content, so renderer recognition is neither authorization nor
format proof.

This capability is deliberately separate from ADR 0022. Inline Terminal Images
remain cell-anchored Terminal Payload parsed by the pinned Ghostty core; Local
Image Preview bytes come from an explicitly activated local file and appear in a
temporary application overlay. OMXTerm adds no plugin system, generic image
infrastructure, remote fetch, download, persistence, file write, or image
animation support.
