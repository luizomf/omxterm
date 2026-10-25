# Third-party notices

OMXTerm includes the following runtime components. Their original license texts
are distributed in the application resources directory:
`OMXTerm.app/Contents/Resources` on macOS and `resources` in the packaged Linux
and Windows application layouts. Direct dependency versions are locked in
`package-lock.json`; exact versions of code bundled inside a dependency are
identified below. Restty and its Ghostty core include OMXTerm's local runtime
and core corrections; upstream pins and tracked patch provenance are recorded
in the repository's `assets/restty-sources.json`. Those corrections
do not remove the upstream attribution.

| Component                                              | License                         | Packaged notice                    |
| ------------------------------------------------------ | ------------------------------- | ---------------------------------- |
| Electron                                               | MIT                             | `LICENSE.electron.txt`             |
| Chromium and Electron transitive components            | See component notices           | `LICENSES.chromium.html`           |
| `node-pty`                                             | MIT                             | `licenses/node-pty.txt`            |
| `yaml` v2                                              | ISC                             | `licenses/yaml.txt`                |
| Restty 0.3.0                                           | MIT                             | `licenses/restty.txt`              |
| `text-shaper` 0.1.28 and FreeType-derived portions     | MIT and upstream attribution    | `licenses/text-shaper.txt`         |
| Ghostty/libghostty-vt (`0309af1`)                      | MIT                             | `licenses/ghostty.txt`             |
| xterm.js visible-link expression (retained derivative) | MIT                             | `licenses/xterm-visible-links.txt` |
| FiraCode Nerd Font Mono                                | SIL Open Font License 1.1       | `licenses/FiraCode-OFL.txt`        |
| DejaVu Sans Mono                                       | Bitstream/DejaVu/Arev           | `licenses/DejaVu.txt`              |
| JetBrainsMono Nerd Font Mono                           | SIL Open Font License 1.1       | `licenses/JetBrainsMono-OFL.txt`   |
| Nerd Fonts patched glyph sets                          | MIT, OFL, CC BY 4.0, Apache 2.0 | `licenses/NerdFonts-glyphs.txt`    |

The compact About implementation adapts text-safe rendering, named link buttons,
runtime-version delivery, and the typed fixed-link route from
[Rafael Ruscher (@ruscher)](https://github.com/ruscher)'s MIT-licensed contribution
in [PR #622](https://github.com/luizomf/omxterm/pull/622), source commit
[`b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38`](https://github.com/ruscher/omxterm/tree/b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38).
The selected source files are `src/renderer/about/about-dialog.ts`,
`src/main/about-wiring.ts`, `src/shared/about.ts`, and
`src/preload/about-bridge.ts`. OMXTerm adds compact credits, owner lifetime
handling, and integration with its existing terminal input policy; this is
selective reuse, not integration of the entire PR.

The resizable Auxiliary Panel also adapts the lazy exclusive-view/visible-dismiss
ideas from `src/renderer/workspace-sidebar.ts` and pointer/keyboard divider ideas
from `src/renderer/pane-view.ts` at the same source commit. OMXTerm adds
deactivation, async lifetime guards, bounded per-window geometry, complete capture
cleanup, clipboard routing and overlay integration; no workspaces or splits are
included.

The configured Interface Language implementation also adapts the translator,
English and Brazilian Portuguese catalogs, and catalog tests from
`src/shared/i18n.ts`, `src/shared/locales/en.ts`,
`src/shared/locales/pt-BR.ts`, and `test/unit/i18n.test.ts` at the same
MIT-licensed source commit. OMXTerm uses `en-US` instead of `en` and a single
explicit User Configuration choice rather than system-language detection.

The contributed About source identifies its presentation as
[AshyTerm](https://github.com/big-comm/ashyterm)-style. We credit that presentation
origin and the shared work of [Community Big](https://github.com/big-comm) and
[BigLinux](https://github.com/biglinux) without claiming that all About code
originated in AshyTerm. The supplied
[Community Big MIT notice](assets/licenses/ashyterm-MIT.txt) is retained and
packaged as `licenses/ashyterm.txt`. This attribution does not imply that unrelated
AshyTerm data or the rest of the contribution was integrated. See
[contributors](CONTRIBUTORS.md).

The visible-link expression remains derived from `@xterm/addon-web-links`
0.12.0 even though xterm.js is no longer a runtime dependency; its notice must
therefore remain packaged. The `text-shaper` notice is the exact 0.1.28 license
and includes its FreeType-derived rasterizer copyright statement. The Nerd Fonts
notice records both pinned releases, glyph-set provenance and their full
available license texts.

The repository preserves each bundled font's source, version, checksums, and
license details in `assets/fonts/README.md` and the adjacent license files.
