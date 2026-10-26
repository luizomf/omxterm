# Report native exec failures outside Terminal Payload

## Context

PTY creation and successful program execution are distinct. Numeric exit status
cannot distinguish failed exec from a program returning nonzero; filesystem
preflight cannot prove execution. Native startup reporting therefore uses a
private status channel rather than exit-code or Terminal Payload heuristics.

## Decision

Keep the exact official node-pty 1.2.0-beta.18 pin and apply a source-digest-guarded native correction at
postinstall. Build its Node-API addon locally on macOS ARM64 and Linux ARM64/x64,
using the locked headers; rebuild the existing macOS spawn helper as a matched
pair. Both development and packaged native artifact locations receive the same
correction, including Linux's prebuild fallback. Windows retains its unmodified
official ConPTY addons and bundled runtime, not a locally rebuilt native fork.
Shared guarded JavaScript forwards the optional boolean on both platforms.
Windows' specific agent `onError` handler supplies it for deferred connect/worker
failure after spawn returns; synchronous missing-file rejection stays synchronous.
Neither a numeric status nor error text is used by OMXTerm to infer failure.

A private close-on-exec pipe carries one fixed failure byte from the existing
child/helper when setup or exec fails. Successful exec closes the writer. The
native exit thread consumes this status after reaping the child and includes a
boolean in its existing exit callback. It neither blocks Electron's main thread
waiting for startup nor interprets output, errno strings, or numeric exit status.
The executable, argv, environment, working directory, native exec operation and
PTY ownership use the same direct spawn path, without a shell or executable
wrapper.

Main translates only that boolean into a fixed optional `startupFailed: true`
exit field. Strict preload validation preserves it; renderer tab ownership waits
for the native failure acknowledgement just as for unexpected signals under
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md#session-ownership-and-lifecycle).
Main classifies the Operational Event as `spawn-failure` with null code and uses the
existing fixed spawn dialog. Successfully executed programs returning nonzero
retain ordinary exit semantics; requested close and rendering failure keep
their outcome precedence. Native exit, not the status byte or kill request, releases
the application shutdown record (ADR 0028).

## Consequences and verification

Unix dependency preparation requires the native compiler and `patch`; macOS
needs Apple tooling for its blur addon. Unknown upstream native or JavaScript
source bytes stop preparation rather than applying an approximate patch. This
is a maintained adaptation of the pinned dependency, not an upstream guarantee.

Native regression exercises missing explicit executables and unavailable Default
Shells through real Electron, node-pty, renderer ownership and native failure
dialogs. A simultaneously live, successfully executed program returns 1 without
a second dialog. Tests assert safe operational metadata and acknowledgement,
plus preservation of the mounting-tab and shutdown boundaries from ADR 0016.
A Windows deferred-connect case uses an existing executable with an unavailable
fixture cwd; headless prepared-JavaScript checks separately exercise worker
error, timeout, late readiness and ordinary numeric exit. These are distinct
from native/package evidence. Tests must distinguish native evidence for each platform and package from mocks
or source review. Terminal Payload never supplies the failure classification.
