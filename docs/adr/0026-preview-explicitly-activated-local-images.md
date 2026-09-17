# Preview explicitly activated local images through a bounded main-process read

OMXTerm provides a Local Image Preview for one native-picker selection or one
literal visible authority-free absolute `file:///` URL activated with the
platform's existing modified-link gesture. It does not recognize bare or
relative paths, infer a shell working directory, interpret SSH paths, use OSC 8
metadata, accept remote or UNC file authorities, or read merely because output
or hover exposed a path. HTTP(S) External Links retain ADR 0011's operating-system
browser route; local image URLs never reach that route.

Electron main owns URL validation, the native picker, concurrency, and the
filesystem boundary. Each Terminal Window permits one picker or local-link
request at a time. A request opens a non-shell file descriptor, requires a
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
a disposed overlay.

Restty's existing visible-link provider and gesture owner recognize the literal
`file:///` span alongside HTTP(S), preserving soft-wrap proof and modified-click
precedence over application mouse reporting. Main independently validates the
complete URL and content, so renderer recognition is neither authorization nor
format proof.

This capability is deliberately separate from ADR 0022. Inline Terminal Images
remain cell-anchored Terminal Payload parsed by the pinned Ghostty core; Local
Image Preview bytes come from an explicitly activated local file and appear in a
temporary application overlay. OMXTerm adds no plugin system, generic image
infrastructure, remote fetch, download, persistence, file write, or image
animation support.
