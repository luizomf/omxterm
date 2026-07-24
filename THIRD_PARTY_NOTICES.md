# Third-party notices

OMXTerm includes the following runtime components. Their original license texts
are distributed in the application resources directory:
`OMXTerm.app/Contents/Resources` on macOS and `resources` in the packaged Linux
and Windows application layouts. The exact dependency versions are locked in
`package-lock.json`.

| Component                                   | License                   | Packaged notice                              |
| ------------------------------------------- | ------------------------- | -------------------------------------------- |
| Electron                                    | MIT                       | `LICENSE.electron.txt`                       |
| Chromium and Electron transitive components | See component notices     | `LICENSES.chromium.html`                     |
| `@xterm/xterm`                              | MIT                       | `licenses/xterm.txt`                         |
| `@xterm/addon-fit`                          | MIT                       | `licenses/xterm-addon-fit.txt`               |
| `@xterm/addon-web-links`                    | MIT                       | `licenses/xterm-addon-web-links.txt`         |
| `@xterm/addon-unicode-graphemes`            | MIT                       | `licenses/xterm-addon-unicode-graphemes.txt` |
| `node-pty`                                  | MIT                       | `licenses/node-pty.txt`                      |
| JetBrainsMono Nerd Font Mono                | SIL Open Font License 1.1 | `licenses/JetBrainsMono-OFL.txt`             |

The repository also preserves the bundled font's source, version, checksums,
and license details in `assets/fonts/README.md` and `assets/fonts/OFL.txt`.
