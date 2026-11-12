# Files availability

Files is an optional add-on for browsing folders and files. It can move or
delete items after confirmation, and insert a file's path into the terminal
(**Insert path into terminal**, Shift+Enter, or drag it onto a terminal pane).

Files works on every OMXTerm platform: macOS (Apple silicon), Linux and
Windows, on ARM64 and x64. It needs OMXTerm 0.26.0 or later, and on Windows and
Linux x64 it needs OMXTerm 0.28.0 or later to rename, move and (on Windows) send
items to the Recycle Bin. Older OMXTerm versions can install Files 0.7 or 0.6
from their [releases](https://github.com/luizomf/omxterm/releases).

1. Open **Settings → Extensions → Browse official extensions** and choose
   **Install** on the Files card shown for your computer.
2. Review the package and trust prompt before approving. The add-on runs with
   your account's permissions; it is not sandboxed.
3. Open **Files** from the File menu or Command Palette to browse local folders.

The [developer notes](dev/files-development-preview.md) cover how Files is built,
tested and packaged, and its current platform limits.
