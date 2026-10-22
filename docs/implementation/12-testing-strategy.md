# Testing strategy

OMXTerm's existing test layers are kept; the port adds tests at the lowest
layer that can prove each behavior.

## Layers

| Layer                    | Runs                                     | Used for                                                                                                                                                                    |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`test/unit`, Node) | every CI target, `npm test -- test/unit` | Parsers and validators, SSH argv, ssh_config import, command templates and quoting, backup crypto and restore, Application Data stores, highlighting transform, CLI options |
| Unit (jsdom)             | same                                     | Renderer: panes and layout, sidebars, Sessions and Commands panels, modals, backup dialogs, ended banners                                                                   |
| Native PTY integration   | Linux x64/arm64 (`native-pty` CI job)    | Real PTYs: local shell, literal argv, foreground process, resize races, session retirement                                                                                  |
| Graphical integration    | locally, one suite at a time             | Real windows: tab lifecycle, startup titles, failure dialogs, window chrome and menus                                                                                       |
| Real application         | manual, per change                       | Launch Electron with an isolated `XDG_CONFIG_HOME`, drive it through DevTools Protocol and `xdotool`, capture screenshots                                                   |

## Rules

- **Inject, don't detect.** Platform, home directory, environment, clocks,
  file systems and executable lookup are injected, so Windows and macOS
  behavior is unit-tested on any host. Examples: `sshArguments` with
  `path.win32`, PowerShell quoting, and the Windows `ssh.exe` lookup.
- **Byte-identity invariants.** The output highlighter is checked against a
  mixed VT stream split at 200 random chunk boundaries. Removing SGR from
  its output must give the input exactly, and every escape sequence must
  survive in order.
- **Real dependencies over mocks.** Real crypto with production scrypt
  costs, real temporary directories and real stores where they are fast
  enough.
- **Regressions get a test first.** Each entry in
  [15-regression-and-bug-tracking.md](15-regression-and-bug-tracking.md)
  names the test that covers it.
- **No hiding.** Tests are never skipped or weakened to pass CI. Native
  suites skip only through their declared platform and architecture gates
  (`isNativeTestArchitecture`). No arbitrary sleeps: waits use
  `vi.waitFor` on an observable condition.

## Running locally

```sh
TMPDIR=$PWD/.scratch/tmp npm test -- test/unit     # fast, headless
npm run lint && npm run typecheck && npm run format:check
npm run build && env -u ELECTRON_RUN_AS_NODE TMPDIR=$PWD/.scratch/tmp \
  npx vitest run test/integration/window-chrome.test.ts   # one graphical suite
```

`TMPDIR` matters on hosts where `/tmp` is `noexec`. Graphical suites open and
focus real windows; run them one at a time on an idle desktop.

## Gaps

- No automated real-app driver runs in CI; real-application checks are
  recorded by hand in the parity matrix (`RA`).
- Native PTY suites run in CI only on Linux. macOS and Windows get unit
  tests and builds there.
- Packaged-app verification on every architecture is tracked in
  [16-release-readiness.md](16-release-readiness.md).
