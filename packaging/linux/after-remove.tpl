#!/bin/sh
# OMXTerm DEB/RPM post-remove script (electron-builder template; no macros).
# The package payload owns every installed file; only refresh the menu cache.
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
exit 0
