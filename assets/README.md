# Application assets

`application-icon.svg` is the OMXTerm-owned scalable source for the application
icon. It was imported byte-for-byte from
`luizomf/omxterm-web/apps/web/public/favicon.svg` at commit
`f3ad6addd6e0eba7acdf40a4d31484e65b253291` (Git blob
`9c1673b934821cb83ace4f18291d8015e5b0c1fb`, SHA-256
`3c078dfc92467afa0ebb065aeaeb7c84f4442757d5ca831f028d16c39e9d8905`).

`application-icon-macos.svg` places the accepted artwork on the transparent,
rounded 1024 px macOS canvas without changing its prompt or colors.
`application-icon.png` is the matching 1024 px development Dock icon, and
`application-icon.icns` contains standard and Retina representations from 16
through 512 logical pixels for packaged builds. The raster derivatives are
committed so packaging stays self-contained and does not depend on image tooling
or an OMXTerm Web checkout.
