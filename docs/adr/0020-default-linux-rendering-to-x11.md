# Default Linux rendering to X11

OMXTerm will start Electron with the X11 Ozone backend on Linux unless the user
explicitly supplies an `--ozone-platform` command-line switch. Native Wayland
dogfooding on the supported Ubuntu ARM64 Parallels VM started the application,
renderer, and PTY but presented no visible window; the same exact AppImage was
visible and usable through X11 under XWayland. A terminal that runs invisibly is
not a viable platform default.

This chooses the smallest reliable backend for the initial Linux Supported
Platform without adding a display-backend setting or another package format.
Wayland sessions therefore require XWayland. An explicit Electron command-line
override remains available for diagnosis and future native Wayland retesting,
but native Wayland is not claimed as supported until exact-artifact evidence
shows ordinary visible window behavior. The choice does not affect macOS or
prejudge the Windows renderer backend.
