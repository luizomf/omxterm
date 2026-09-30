# Default Linux rendering to X11

OMXTerm starts Electron with the X11 Ozone backend on Linux unless the user
supplies an `--ozone-platform` or `--ozone-platform-hint` command-line switch
before a Launch Request's `-e`, or defines `ELECTRON_OZONE_PLATFORM_HINT`, including
an empty value. Native Wayland dogfooding on the supported Ubuntu ARM64 Parallels
VM started the application, renderer, and PTY but presented no visible window;
the same exact AppImage was
visible and usable through X11 under XWayland. A terminal that runs invisibly is
not a viable platform default.

This chooses the smallest reliable backend for the initial Linux Supported
Platform without adding a display-backend setting or another package format.
Wayland sessions therefore require XWayland. An explicit Electron command-line
override remains available for diagnosis and future native Wayland retesting,
but native Wayland is not claimed as supported until exact-artifact evidence
shows ordinary visible window behavior. The choice does not affect macOS or
prejudge the Windows renderer backend.

Detection note: Electron seeds an `ozone-platform` switch from the session
type and initializes the browser process's display backend before application
code runs. `commandLine.hasSwitch` therefore cannot identify a user override
(it reports the auto-seeded value), and a late `appendSwitch` reaches only
child processes while the browser process stays on the invisible Wayland
path. User intent is read from the real process arguments
(`--ozone-platform`, `--ozone-platform-hint`) and the
`ELECTRON_OZONE_PLATFORM_HINT` environment variable; when the seeded backend
is not X11 and the user chose nothing, the application relaunches itself once
with an explicit `--ozone-platform=x11` so the whole process tree starts on
X11.
