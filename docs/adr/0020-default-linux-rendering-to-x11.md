# Default Linux rendering to X11

OMXTerm starts Electron with the X11 Ozone backend on Linux unless the user
supplies an `--ozone-platform` or `--ozone-platform-hint` switch before a Launch
Request's `-e`, or defines `ELECTRON_OZONE_PLATFORM_HINT`, including an empty
value. Wayland desktop sessions require XWayland. Native Wayland is not a
supported rendering path; explicit Electron overrides are available for
diagnosis, not additional support claims.

X11 gives the Linux application a bounded supported display path without a
configuration setting or another package format. The installed desktop entry
supplies an explicit X11 argument under
[ADR 0031](0031-keep-linux-installer-choices-small-and-local.md); direct AppImage
launches retain the override rules above.

Electron can seed an `ozone-platform` switch from session type before main
runs. `commandLine.hasSwitch` therefore cannot distinguish user intent, and a
late `appendSwitch` cannot reset the browser process's display backend. Main
reads original process arguments and the environment variable instead. When
Electron has selected a non-X11 backend and the user chose none, OMXTerm
relaunches once with literal `--ozone-platform=x11` so the whole process tree
uses X11. macOS and Windows are unaffected.

Argument/environment tests cover selection and relaunch decisions. Native
startup evidence is separate: an explicit X11 fixture does not prove the default
selection or native Wayland visibility. See [development](../development.md)
and [release verification](../release.md).
