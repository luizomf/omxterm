# Application assets

The application icon has one scalable source:
[`src/shared/icons/hicolor/scalable/apps/omxterm-hero.svg`](../src/shared/icons/hicolor/scalable/apps/omxterm-hero.svg).
Every derivative below is generated from it by
`node scripts/generate-application-icons.mjs` (needs `rsvg-convert` from
librsvg). The derivatives are committed so packaging stays self-contained and
does not depend on image tooling.

- `application-icon.svg`: a byte-for-byte copy of the source.
- `application-icon.png`: 1024 px; the Linux window icon, the About panel, the
  development Dock icon, and the input electron-builder converts for Windows
  and Linux packages.
- `application-icon-macos.svg`: the artwork inside the 824 px square of the
  1024 px macOS icon grid, on a transparent canvas.
- `application-icon.icns`: macOS representations from 16 to 512 points, at
  standard and Retina resolution.
- `icons/hicolor/<size>/apps/omxterm.png` (16 to 512 px) and
  `icons/hicolor/scalable/apps/omxterm.svg`: freedesktop theme icons installed
  by the Arch, Manjaro and BigLinux `PKGBUILD`s.
