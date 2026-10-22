#!/bin/sh
# OMXTerm DEB/RPM post-install script (electron-builder template; no macros).
#
# OMXTerm disables the Chromium sandbox on Linux (ADR 0024): /usr/bin/omxterm
# and the desktop entry pass --no-sandbox before Electron bootstrap. Unlike the
# packager's default script, this never makes chrome-sandbox setuid root,
# installs no AppArmor profile and creates no update-alternatives link.
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
exit 0
