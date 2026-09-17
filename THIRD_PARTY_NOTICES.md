# Third-party notices

OMXTerm includes the following runtime components. Their original license texts
are distributed in the application resources directory:
`OMXTerm.app/Contents/Resources` on macOS and `resources` in the packaged Linux
and Windows application layouts. Direct dependency versions are locked in
`package-lock.json`; exact versions of code bundled inside a dependency are
identified below.

| Component                                   | License                   | Packaged notice                  |
| ------------------------------------------- | ------------------------- | -------------------------------- |
| Electron                                    | MIT                       | `LICENSE.electron.txt`           |
| Chromium and Electron transitive components | See component notices     | `LICENSES.chromium.html`         |
| `node-pty`                                  | MIT                       | `licenses/node-pty.txt`          |
| Restty 0.3.0                                | MIT                       | `licenses/restty.txt`            |
| `text-shaper` 0.1.28                        | MIT                       | `licenses/text-shaper.txt`       |
| Ghostty/libghostty-vt (`0309af1`)           | MIT                       | `licenses/ghostty.txt`           |
| FiraCode Nerd Font Mono                     | SIL Open Font License 1.1 | `licenses/FiraCode-OFL.txt`      |
| DejaVu Sans Mono                            | Bitstream/DejaVu/Arev     | `licenses/DejaVu.txt`            |
| JetBrainsMono Nerd Font Mono                | SIL Open Font License 1.1 | `licenses/JetBrainsMono-OFL.txt` |

The repository preserves each bundled font's source, version, checksums, and
license details in `assets/fonts/README.md` and the adjacent license files.
