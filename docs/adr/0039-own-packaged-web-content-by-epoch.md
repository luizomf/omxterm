# ADR 0039: Own packaged web content by activation epoch

Status: Accepted internal module, consumed by the Linux ARM64 Files development preview; surviving-browser main-death file-read exclusion remains unqualified.

## Context

Optional web content must not run in the terminal renderer or acquire raw
terminal filesystem/PTY capabilities. ADR0041 adds one explicitly declared typed
SSH launch request to core, not arbitrary executable or native-session authority. Native child views paint above DOM, so ordinary
CSS stacking cannot provide modal exclusion. Installation ownership is separate
from browser lifetime ([ADR 0038](0038-pin-immutable-installed-packages.md)).

## Decision

A lazy `Extension View Host` owns one nonpersistent session/origin and at most
eight `WebContentsView` instances for one epoch/window. It uses Node-off,
context-isolated content and an app-owned visibility/own-backend-request preload. This is an
internal adapter, not an extension SDK, security sandbox or user activation path.
Core tab ordering includes hosted slots alongside terminal and retained Settings
content. Main issues view identities; only the owning terminal main frame can
present/close them. The window router maps each issued identity to its epoch and
acknowledges hiding every other epoch before presenting a new selection. Child
requests authenticate the actual child main frame and live view; bounded JSON
routes only to its captured backend callback, with cancellation on destruction.
Neither caller-provided IDs nor terminal renderer requests can select a backend. Monotonic layout revisions, owner lifetime and main-approved
content bounds prevent stale presentation and keep host chrome outside the view.
CSS geometry is converted using actual page zoom, not terminal font zoom.
A same-view geometry refresh does not revoke captured visible-child semantic
admission. Actual hiding, selection loss, window hide/minimize or retirement
revokes it permanently; showing that child again cannot revive the capture.
Layout revisions still order native presentations, and core selection revisions
still prevent semantic input from retargeting another Surface.

DOM selection and overlay opening await an acknowledged native hide. When that
hide removes the selected, natively focused child of an already focused window,
main returns native focus to the core WebContents before acknowledging. Hiding
an unfocused child or a background window does not move focus; the renderer still
owns which DOM terminal/control may receive it. A core-focus presentation can
also retain the selected child's visible bounds while returning input to the
core WebContents. Main accepts that handoff only in a focused window whose child
or core WebContents already owns native focus; it follows the same window
revision ordering as other presentations. Loss of focus eligibility returns a
distinct recoverable result: retain the pixels and settle DOM selection without
focusing, rather than latching the native-hide failure state. This supports companion tools that
remain visible while the terminal receives input. Overlay
closure can restore only the same still-current content owner. Failed hides
suppress presentation rather than showing a DOM modal behind live native pixels.
Pending or failed terminal handoffs also refuse terminal injection, Find,
clipboard and Snippets targeting; refused actions are not buffered or replayed.
Field input stays in the child; core commands use the existing matcher with the
owning window. Escape from a selected, natively focused companion child sends a
host-owned dismissal to core. A window-owned native gesture guard consumes its
repeats/release across the child-to-core focus transfer; it does not intercept a
fresh terminal Escape or general hosted-tab Escape. OS window blur or a fresh
press recovers a lost release. No extension bytes participate in this route. Native clipboard operations target selected hosted contents,
never a former terminal field. Host Close retains its Enter gesture through
repeats/release using the same window dismissal owner as Settings. Closing a
hosted tab does not close a PTY.

Companion tools distinguish Close from Hide: Close uses the same owner-bound
per-view retirement path, while Hide/Escape retains the page and remembers the
panel selection separately from native activity. A tool entry point closes only
its selected-visible view; otherwise it reveals or opens it. The independent
panel toggle never implicitly reopens a closed tool. Built-in tools retain an
available factory separately from opened instances. Closing the selected tool
hides the container without selecting a successor; other opened tools survive.
Removal is per-identity and idempotent across retirement notification and close
completion. Explicit close transfers native focus from the selected focused child
to core synchronously before hiding/detaching/destroying it, only while its owner
window is focused. The renderer still waits for acknowledged retirement before
restoring terminal DOM focus. Native focus is not deferred until destruction
settles: by then selection and even the epoch may be gone. A stale completion
cannot steal a newer selection's focus.

View retirement does not retire the app-owned backend. Reopening after settlement
creates fresh view state and context using the existing backend activation.
Close revokes view-owned requests and discards drafts, but accepted filesystem
effects can finish with an unknown outcome. Core-transferred SSH launches and
Surface-owned paste remain core-owned. No rollback or automatic replay follows
from view closure.

The resource consumer retains the whole captured `openVersion()` pin privately.
Fresh admission is revalidated before epoch creation; existing reads never follow
a latest-version pointer. Only bounded, fully materialized Responses cross the
custom `omx-extension` protocol: at most four admitted reads, two MiB per resource
and eight MiB of reserved read buffers. The package reader bounds allocation and
closes file handles before settlement. No file URL, stream, descriptor or package
directory is exposed to Chromium. Only explicitly supported packaged resource
paths/types are served; no catalog, download or remote networking is enabled.

CSP and session request policy deny connect, workers, frames, popups, navigation,
downloads and permission requests. The sole `loadURL` exception in the application
network source guard is the exact owned epoch-entry call, with behavior coverage
for foreign origin/scheme/epoch/path/navigation. Other callers remain prohibited.
The app-owned scheme does not register service-worker or CSP-bypass privileges.

Core window owners share a single native `closed` / core `destroyed` /
`render-process-gone` subscription through `subscribeWindowOwnerLoss`. It captures
the core contents before destruction and synchronously notifies subscribers once,
in registration order, detaching the native listeners on loss or the last
unsubscribe. Loss remains final for later subscribers. Chrome, layout capture,
semantic input, invocation lifetime, Mirror Typing and epoch hosts retain their
own cancellation and cleanup; navigation predicates are not combined. The native
close guard remains registered before this shared subscription, and terminal
session shutdown remains separately owned. Epoch retirement unsubscribes from
owner loss immediately, without treating notification as completed resource drain.

Retirement first revokes admission, hides/closes known views, unhandles the route,
settles actual resource reads, closes connections and clears session data. It
releases the pin only after views and reads drain. Native close, storage or pin
release failure is not successful retirement. A bounded timeout leaves the
original cleanup running and reports failure; it neither releases early nor
silently retries. Tab retirement is published only after native destruction and,
for the final epoch view, successful read/session/pin settlement. Failed epochs
keep their core-owned tab and recovery notice; they do not publish an empty
window. The owner-bound IPC route continues acknowledging safe null presentations
after settled retirement, but never admits old view identities. A renderer
presentation can race revocation before its per-view retirement notification;
removing one tab can also briefly select an already-revoked sibling. These
requests remain rejected by main. The renderer retains the exact identities of
rejected presentation requests and fails closed while their outcomes are
unreconciled. It clears that scoped failure only after main has published
retirement for every implicated identity and a current null presentation has
acknowledged hiding all native epochs. The two observations may arrive in either
order. It does not parse IPC error strings, treat rejection as a hide ACK, retry
the rejected request, or retain a window-lifetime history of retired IDs.
Unrelated retirement cannot clear the failure. A false presentation result,
identity-free rejection, close failure or epoch failure notification remains
fail-closed and cannot be cleared by this reconciliation. Successful reconciliation
allows later epochs and host overlays to work without reviving a retired identity.
No session-destroy API or arbitrary-descendant containment is
invented. Renderer loss conservatively retires all views in that epoch. Native hiding still
runs, but visibility IPC is not sent to a lost renderer or a closing view: its
WebContents may remain alive after its frame is disposed. Actual
renderer IDs are observed, and sharing the core renderer refuses continued use.
There is no per-view process-isolation promise.

## Gates and consequences

The host module itself does not own installation, catalogs or backend activation.
The separately installed [Files development preview](../files-development-preview.md)
composes production Settings, shared actions, backends and this host/reader/tab seam.
Preparatory [macOS ARM64 composition](../macos-extension-composition.md) uses
these same owners with a minimal installed-package qualification fixture, not Files.
Its phase-specific product evidence is separate from host-module qualification;
this host module exposes no public SDK and performs no catalog acquisition.
The installed-package adapter and ordinary browser retirement must be qualified
separately. Main death may leave already delivered bytes in browser memory;
materialized Responses alone do not prove that a surviving Chromium process has
no later disk route. Until a bounded actual-death discriminator establishes that
property, **main-death file-read exclusion remains unqualified** and cannot be
claimed as package cleanup safety after main death. No reboot, quarantine or
extra supervisor compensates for this missing evidence. A bounded actual-main-SIGKILL
observation saw the hosted renderer exit and an independent backend pin retain A
through uninstall/collection until that backend's kernel exit. Collection then
completed; the original orphan's exit code was unknown. This neither establishes a
surviving renderer's later/fresh A or B read exclusion nor guarantees renderer
termination on other platforms or configurations.

Retained native views have material memory cost; create substantial views lazily,
not one native view per widget. Hidden views retain drafts only within their
epoch. Activation consumers must supply trusted admission, the main-approved
slot and existing core command routing; this module is not successful no-op
extension support. The internal child preload offers a bounded `onAppearance(listener)` subscription.
Main projects only theme background/foreground hex colors and effective window
tint opacity from the same configuration snapshot as core, including native
Windows opacity fallback. Initial/latest values replay, hidden views receive
updates, and retirement removes the epoch subscription. The child receives no
configuration paths, terminal data, native-effect commands or new backend
capabilities. Existing content need not subscribe; this is not a public SDK.

Native child backgrounds are explicitly transparent. Opt-in content leaves its
base surface transparent so the owning window paints the theme tint exactly
once; opacity describes that parent tint and is not an instruction to fade text
or repaint the entire child. Existing opaque package CSS remains opaque. Main
still owns native blur. Neither source inspection nor child page captures prove
desktop composition or visible blur. Language adaptation remains separate.
