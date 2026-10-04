# Disable the Chromium sandbox on Linux

OMXTerm deliberately uses `--no-sandbox` on Linux so ordinary users can launch
it without administrator sandbox setup. Supporting distribution-specific
sandbox prerequisites exceeds the project's current maintenance scope.

This is an unconditional Linux launch policy, not a probe-driven fallback or
configuration option. Direct AppImage, extraction, the optional per-user desktop
entry, unpacked runtime and X11 relaunch follow the same policy. macOS and
Windows keep their existing sandbox behavior. Kitty/Chafa graphics remain
supported on all three ARM64 platforms.

Context isolation, disabled Node integration, the minimal typed preload bridge
and the production CSP limit renderer authority. They do not replace Chromium
sandboxing or provide equivalent protection. Ordinary-user launch needs no
elevation, setuid helper, AppArmor management or global security-policy change.

The pinned packager has no AppRun override, so a checksum-guarded build-input
patch replaces its namespace probe with the unconditional flag before loading
electron-builder. A packaging hook rejects unprepared input; verification checks
the generated launcher. Dependency upgrades require reviewing these pinned
bytes. Development's Node launcher supplies the same Linux-only flag before
Electron bootstrap, using Electron's existing CLI for process signals and exit
status. Applying it only in app main, even before readiness, is too late:
Chromium has already initialized sandbox machinery. The flag remains in literal
argv through X11 relaunch; main also retains the policy for child processes.
Native verification covers ordinary startup, PTYs and graphics. A focused
launcher test observes bootstrap argv at the process-spawn boundary; it does not
claim to prove a visible or usable terminal.
