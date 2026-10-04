# Restty cutover evidence map

This historical map records regression ownership at the final Restty-only
cutover. Restty remains the sole Surface; the temporary selector and xterm
renderer are not supported modes. The map identifies regression seams, not
proof that every contract edge is covered or a current release-acceptance record.
Native artifact identities and results belong to the release record for their
exact source commit. Use the [spec](spec.md) and
[Restty development guide](restty-development.md) for current behavior and commands.

## Integrated migration slices

| Ticket | Integrated squash                          | Retained implementation and regression seams                                                                        |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| #253   | `31406e672118697158944d07fce014d64982cd8f` | `restty-terminal-surface.ts`; `restty-terminal-surface.test.ts`; `restty-rendering.test.ts`; host lifecycle fixture |
| #254   | `982c3fb73c60240f2e9c7246eccbf1cb715d58b3` | theme/geometry runtime operations; `restty-appearance-rendering.test.ts`; Terminal Window CSS tests                 |
| #255   | `54213e2c0563695b896b5cd115fd8f6e033079f1` | sender-validated font route and restart notices; installed-font tests; host native font/reload evidence             |
| #256   | `2286c26f05bc11c8111bcfacd12f13d7ba4186ec` | Ghostty line/byte setters; scrollback core, renderer and Surface tests                                              |
| #257   | `4c959432d85eb9af320b1de1f2a324a1aed02fe8` | semantic input delivery, OSC 52 and clipboard host services; clipboard/parser tests and host paste evidence         |
| #258   | `7b940962c43981a652fa3d1c6bc08cdfbeb00ac9` | Restty visible-cell link interaction and main-process validation; visible-link and host gesture tests               |
| #259   | `62adc6d7c3a8b72761d8531afcbe4d31b4eb143c` | pinned parsed-event queue and existing title/bell controller; core-event and host ownership tests                   |
| #260   | `411e225f3bb46dea8e5e967a788f3d3a3d8a978d` | pinned Ghostty Kitty parser/store; core-image, renderer-image, ConPTY transport and host image tests                |
| #261   | `3f15a8aea03e06694cf4dca42a4f7e49662135be` | ordered cumulative output ACKs, PTY watermarks and bounded OutputFilter; IPC, core and native output-stress tests   |
| #262   | `4fab3585d21e971b6ecc7635e6d6d17ed4c60e2f` | Option-side input, DA replies, mouse/selection and grapheme mode; runtime, selection and host TUI tests             |

## Parent story coverage

1. Restty inside the existing OMXTerm host: renderer assembly plus native host
   fixture.
2. Temporary opt-in: superseded by this final cutover; selector-removal and
   package-content assertions prove there is one shipped Surface.
3. Shell input/output, resize, focus, tabs, windows, command startup and
   termination: renderer tab/window tests, real-PTY integration and native host
   fixture.
4. Pi/Chafa images, deletion and alternate-screen cleanup: Ghostty core image,
   rendering, transport and native host image evidence.
5. Copy/paste, Protected Paste, snippets and path insertion ordering: semantic
   delivery, Surface clipboard, snippets/path and native host paste tests.
6. Write-only OSC 52: canonical decoder, Restty parser and native host evidence.
7. Visible HTTP(S) links: pure span contract, Restty gesture fixture and
   main-process URL boundary tests.
8. Theme, fonts, zoom, padding and reload: configuration/reloader, installed-font,
   appearance-rendering and native host paint/reload tests.
9. Shortcuts, Option input, mouse, selection, Unicode, titles and bell: keybind,
   selection, runtime rendering, core events and native host tests.
10. Page-granular positive scrollback and zero history: core, rendering and
    Surface scrollback suites.
11. Accurate incompatibilities and resource limits: product contract, ADR 0022,
    Restty guide, dependency digest and package verifier.
12. Independently verifiable slices: squash identities above and the single
    portable/native command set.
13. Clean reproducible dependency/core/font inputs: lockfile, checksum-guarded
    preparation, `assets/restty-sources.json`, tracked patches/WASM and font
    provenance tests.
14. Supported-platform package boundaries: native `check`, `check:linux` and
    `check:win` package, startup, PTY and cleanup verification.

The final package verifier rejects legacy `@xterm` entries and requires current
licenses. The portable gate retains engine-neutral host, Adapter, IPC,
configuration, tabs/windows, clipboard, URL, logging and lifecycle tests while
Restty-specific behavior remains exercised at its actual core and browser
seams.
