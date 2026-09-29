# Preview explicitly activated local images through a bounded main-process read

OMXTerm provides a Local Image Preview for one native-picker selection, one
literal visible authority-free absolute `file:///` URL, or one unambiguous
native path reference activated with the platform's existing modified-link
gesture. Issue #439 deliberately reopens the original absolute-only/unquoted
choice: absolute POSIX and Windows drive-qualified paths remain supported, with
matching single/double quote wrappers, local `~`/`~/...`, and explicit relative
references. This is an expansion of intentional exclusions, not a historical
regression. Relative references begin `./` or `../` (also backslashes on Windows)
or end in a `.png`, `.jpg`, `.jpeg` or `.webp` image name. Main opens a native base
directory picker at local home for every relative activation; only an explicit
selection is the base, and cancellation is inert. No cwd is inferred from an
agent, shell, process, startup directory or output. No base is persisted. `..`
follows normal local resolution, not a new sandbox. Home shorthand always means
the local user's home, never remote home or general shell expansion.
OMXTerm does not accept UNC/device paths, transfer an SSH path, use OSC 8
metadata, or read merely because output or hover exposed a path. A visible
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

The narrow sender-validated preload route accepts only a picker marker, the
exact bounded file URL, an exact bounded native absolute path, or a bounded
visible path reference, and returns only validated filename, media type,
dimensions, and bytes. Reference resolution stays in main; a base picker does
not expose its selected directory to the renderer. It exposes no path, directory enumeration, generic read,
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
reporting. References begin at a line boundary or after whitespace. A complete
non-whitespace token or one matching pair of quotes (including spaces) is
recognized without shell evaluation or escape decoding. Brackets, assignments
and trailing punctuation are not trimmed. The native picker handles ambiguous
filenames. A positive `:line` or `:line:column` after closing quotes is tool
location decoration; inside quotes it is literal. Unquoted references first try
the exact filename, then the unsuffixed target only when the exact read reports
ENOENT. This preserves existing valid absolute colon filenames without silently
retargeting permission, format or decode errors. Quoting the complete filename
forces literal interpretation even when it is missing; exact native sources,
picker selections and file URLs always stay literal. Each read keeps the same
bounds and owner-lifetime checks, including before a fallback read.
Main independently validates the complete reference, resolved absolute local
path and content; recognition is neither authorization nor format proof.

Actual WebP support is explicitly deferred by the #439 maintainer decision.
An extension is not format evidence: PNG bytes named `.webp` remain PNG, while
actual WebP receives a fixed unsupported-format error distinct from an unavailable
file. The renderer displays only fixed safe errors, never native error details.
Adding WebP later requires its own bounded validation/native decode decision;
allowing an extension alone would not fulfill that contract.

This capability is deliberately separate from ADR 0022. Inline Terminal Images
remain cell-anchored Terminal Payload parsed by the pinned Ghostty core; Local
Image Preview bytes come from an explicitly activated local file and appear in a
temporary application overlay. OMXTerm adds no plugin system, generic image
infrastructure, remote fetch, download, persistence, file write, or image
animation support.
