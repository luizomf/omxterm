# Make the Terminal Surface the portable module

The Terminal Surface is a deep Module whose small Interface hides Restty and
Ghostty setup, rendering, input, resize, appearance, clipboard, zoom, and
cleanup. It receives a terminal-session Adapter at a real Seam: OMXTerm supplies
an Electron IPC Adapter backed by a local PTY, while a web application can
supply a WebSocket Adapter; Electron, native windows, and local PTY ownership
remain desktop implementation details and are not generalized into a portable
application framework.

The Terminal Surface owns the lifecycle of the session Adapter it receives:
mounting starts and subscribes to the session, disposal closes it and releases
all resources, and a session exit ends the surface so its host can remove the
now-useless window. Headless, detachable, and reconnectable sessions are outside
this Interface.
