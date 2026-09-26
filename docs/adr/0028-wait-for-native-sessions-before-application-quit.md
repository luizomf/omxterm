# Wait for native sessions before application quit

Refines [ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md)'s session
lifecycle without changing [ADR 0017](0017-confirm-close-only-for-busy-sessions.md)'s
confirmation policy.

## Context

Closing a window or disposing its IPC controller requests PTY termination; it
does not establish that native termination and exit callbacks have completed.
The pinned Windows PTY runtime can defer termination until the session becomes
ready. Native verification for #401 observed Electron entering quit with all
three owned PTYs still pending, followed by a deferred native kill and a native
process failure. The same missing completion boundary exists in earlier source;
the evidence does not identify the exact failing native instruction or establish
that Window Chrome introduced the race.

A disposed renderer/controller must stop receiving terminal events. Its lifetime
therefore cannot also be the authority for application-wide native completion.
A session whose tab or window already closed may still be draining natively.

## Decision

Electron main owns native session completion independently of each window and
IPC controller. Each successfully created session remains tracked until its
actual native exit callback, including after a close request or owner disposal.
A synchronous spawn failure releases its pending completion record.

The existing quit decision runs first. Pending or denied Busy Session
confirmation does not dispose sessions or begin shutdown. Once quit is accepted,
the application stops accepting new session starts, requests termination of its
owned sessions, and awaits every pending native exit before completing normal
Electron quit. Last-window close follows the same boundary; Electron's default
last-window behavior must not bypass it. Repeated quit requests share one drain.

The completion callback is observed before forwarding to a possibly disposed
controller. Application completion does not depend on renderer delivery,
controller event forwarding, a success log marker, or merely calling `kill()`.

## Consequences and verification

Shutdown may retain the application process briefly after the last window has
closed while native sessions finish. No session persistence, process-name-based
cleanup, shell injection, new user setting, or new dependency is introduced.
There is no arbitrary shutdown delay or forced-success exit substituting for
actual completion. A missing native completion remains a failure to complete,
not an invented successful exit.

Tests exercise accepted/cancelled quit, last-window closure, previously closed
sessions, deferred exits, repeated requests, spawn failure and rejection of late
starts through the production ownership seam. Native supervision still requires
actual process exit and complete results under an external bound; a `quit` event
alone is insufficient. Cross-platform and exact-package verification remain
required. Bounded passing probes support the ordering correction, not a universal
claim that every native-runtime hang has been eliminated.
