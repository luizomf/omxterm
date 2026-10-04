# Make the Terminal Surface the portable module

The Terminal Surface is a deep Module whose small Interface hides Restty and
Ghostty setup, rendering, input, resize, appearance, clipboard, zoom, and
cleanup. It receives a terminal-session Adapter at a real Seam: OMXTerm supplies
an Electron IPC Adapter backed by a local PTY, while a web application can
supply a WebSocket Adapter; Electron, native windows, and local PTY ownership
remain desktop implementation details and are not generalized into a portable
application framework.

The Terminal Surface owns the lifecycle of the session Adapter it receives:
mounting starts and subscribes only after rendering readiness, disposal closes
it and relinquishes owned resources, and a session exit ends the Surface so its
host can finish the owning Terminal Tab's lifecycle under
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md). Closing the last tab
closes its window. Pending initialization can settle before partial resources
are released, and native session completion remains independently owned by main
under [ADR 0028](0028-wait-for-native-sessions-before-application-quit.md).
Headless, detachable and reconnectable sessions are outside this Interface.
