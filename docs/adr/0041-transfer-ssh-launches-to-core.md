# Transfer explicit SSH launches to core

Status: Accepted for the Linux ARM64 optional SSH Connect preview (#671).

## Decision

Keep discovery and its application page in a separate installed extension. Add
one concrete declared/queryable `terminal.openSsh.v1` host capability with typed
host/user/port, not a general executable/argv SDK. Main validates/copies semantic
input, resolves application PATH and builds literal system-ssh argv. OpenSSH
retains configuration/authentication authority. The [SSH guide](../ssh-connect.md)
owns the exact grammar, discovery budgets and user-visible limitations.

A manager admission callback revalidates the captured independent UI pin under
the short store transaction. That authorizes this generation at that instant,
not a global disable broadcast. Local revision, view/window lifetime and
Quit are checked again before synchronous transfer into a core-owned pending
record. Cross-instance changes after store admission cannot undo that request;
local revocation before transfer refuses. No lock spans rendering or spawn.

A main-issued token addresses only its original window and one pending pane.
Renderer acknowledgement is notification; it cannot authorize an uncommitted
record. Mount consumes the token once through the ordinary trusted start IPC.
Pending cancellation, owner loss, bounded expiry and Quit remove unused tokens.
Startup `-e` stays independently consume-once. Core PTY/shutdown owns transferred
sessions and no extension pin follows them. Disable/uninstall/backend loss cannot
kill already transferred sessions. Reply loss is outcome-unknown, not retryable.

SSH Connect's companion view is retained per window independently of the source
terminal's lifetime. The package manager revalidates its captured generation on
explicit reopen and retires it on backend/window loss or package management.
This presentation policy leaves general hosted Application Tab invocations and
their captured source-session lifetimes unchanged.

Keyboard Connect finishes its initiating Enter gesture before dispatch, rather
than trying to guard a held key after crossing WebContents. Foreground selection
and modal admission govern focus only, not a replacement target.

For main-marked ordinary nonzero SSH exits, separate transport end from Surface
resource disposal. Retain Restty/fonts until pane removal; stop native input,
resize/replies and delayed title/BEL/OSC52 effects immediately. Output/exit replay
before start resolves follows the same state. Actual native exit still retires
the session and satisfies shutdown; the readable pane is not Busy. Signal and
startup failure retain acknowledgement semantics, not numeric heuristics.
Known SSH output is excluded before local OSC7 tracking, including early output.
Validated SSH fallback labels remain display-only. New tabs/splits use home and
the default shell; no reconnect or implicit configuration writes are added.

## Consequences

API0.1.x remains compatible with unchanged Files manifests. SSH requires the first
compatible host0.24.0-dev.0 and a separate archive; no stable SDK, broker, sandbox,
real connectivity evidence or other-platform preview qualification is implied.
Tests must compose actual capture, admission, token, Surface and native lifetime
seams, not merely keep a dead tab whose renderer was already destroyed.
