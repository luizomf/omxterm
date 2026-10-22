# Project audit and baseline

Engineering record for the AshyTerm parity work on branch
`feature/ashyterm-cross-platform-parity`. The product contract stays in
[`docs/spec.md`](../spec.md); this file records the starting point.

## Repositories audited

| Project  | Revision                                | Stack                                                                  |
| -------- | --------------------------------------- | ---------------------------------------------------------------------- |
| OMXTerm  | `3686d11` (main at branch point)        | Electron 43, TypeScript 7, Restty 0.3.0 (Ghostty WASM), node-pty 1.1.0 |
| AshyTerm | `8d50567e` (CommunityBigLinux/ashyterm) | Python, GTK4, libadwaita, VTE, py7zr, libsecret                        |

The AshyTerm audit covered every module under `src/ashyterm/`, the 51 shipped
highlight rule files, the command-manager built-ins, settings, dialogs, menus,
actions, shortcuts, CLI parsing and the test corpus. Its findings are summarized
in [01-feature-parity.md](01-feature-parity.md).

## OMXTerm architecture at the branch point

- `src/main`: windows, the PTY Adapter (node-pty), strict `config.json`
  validation, the operational event log, clipboard, link and local-image
  boundaries.
- `src/preload`: a frozen, validated bridge (`window.omxterm.terminal`).
- `src/renderer`: tabs (one Surface per tab), chrome, the snippets sidebar and
  local image preview. Context isolation and the sandbox are on; Node
  integration is off.
- `src/terminal-surface`: the portable Restty Surface and session Adapter.
- Documented scope excluded SSH, AI, splits, persistent sessions and profiles.
  Releases are ARM64 only. There were no GitHub Actions workflows in the
  repository.

## Baseline verification (Linux x86_64, KDE Plasma Wayland with XWayland)

| Check                        | Result                                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                     | Installed, but npm 12's install-script allowlist skipped node-pty's native build. Fixed by running `node-gyp rebuild` in `node_modules/node-pty`, then `npm run postinstall`.                                                |
| `npm run typecheck`          | Pass                                                                                                                                                                                                                         |
| `npm run lint`               | Pass                                                                                                                                                                                                                         |
| `npm run format:check`       | Pass                                                                                                                                                                                                                         |
| `npm test -- test/unit`      | 2107/2143 pass. The 36 failures are all in `linux-appimage-installer.test.ts`: the host mounts `/tmp` with `noexec`, so the test's fake `file` binary cannot run. With `TMPDIR` on an executable filesystem, 2143/2143 pass. |
| Graphical integration suites | Not run in the baseline; they take over the active desktop.                                                                                                                                                                  |

Two environment findings for contributors:

- Electron started from VS Code's integrated terminal inherits
  `ELECTRON_RUN_AS_NODE=1`, so `electron .` fails with `bad option`. Unset it
  before launching.
- Unit tests that execute temporary scripts need an executable `TMPDIR`.

## Architectural risks identified

1. **WebGL context budget.** Each Surface owns a WebGL2 context, and Chromium
   limits active contexts per renderer. Split panes multiply contexts, so a tab
   is capped at 16 panes. Many tabs × panes remains a known limit (see
   [15-regression-and-bug-tracking.md](15-regression-and-bug-tracking.md)).
2. **Output highlighting versus the Surface.** AshyTerm rewrites the PTY byte
   stream. OMXTerm must not corrupt control sequences, images or alternate
   screen content (see [07-smart-highlighting.md](07-smart-highlighting.md)).
3. **Strict configuration.** `config.json` is user-authored and non-mutating
   (ADR 0003). OMXTerm-owned state goes to separate Application Data files
   (ADR 0034).
4. **Platform reach.** Native validation is only available here for Linux
   x86_64. Windows and macOS claims require their own runners
   ([13-github-actions-matrix.md](13-github-actions-matrix.md)).
