# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) to clone the repository, install dependencies, and run OMXTerm in development mode. This guide covers OS-specific prerequisites, the test layers and how to run them, the performance benchmark, and package verification.

See the [Restty guide](dev/restty-development.md) for Terminal Surface internals and [release procedures](release.md) for full release builds.

## Platform prerequisites

Development targets native ARM64 macOS and ARM64/x64 Linux and Windows with **Node.js 22.13+ (22.x) or 24+** and npm. When working inside a virtual machine, clone and build on the guest's native filesystem rather than a shared host folder.

### macOS

Install **Xcode Command Line Tools** (`xcode-select --install`) before running `npm ci`.

- `postinstall` compiles the pinned Unix `node-pty` native addon.
- `npm run build` compiles the `native/macos-window-blur.mm` and `native/macos-option-shortcut.mm` addons with bundled Node-API headers (targeting macOS 12.0+).

### Linux

Install C++ build tools, Python 3, `patch`, `binutils`, `procps`, `fontconfig`, `file`, XWayland, `xdotool`, and the test fixture fonts (`DejaVu Sans`, `DejaVu Sans Mono`, and `Liberation Mono`):

```sh
# Ubuntu / Debian
sudo apt install build-essential python3 patch binutils procps fontconfig file xwayland xdotool fonts-dejavu-core fonts-liberation

# Fedora
sudo dnf install gcc-c++ make python3 patch binutils procps-ng fontconfig file xorg-x11-server-Xwayland xdotool dejavu-sans-fonts dejavu-sans-mono-fonts liberation-mono-fonts

# Arch / Omarchy
sudo pacman -S --needed base-devel python patch binutils procps-ng fontconfig file xorg-xwayland xdotool ttf-dejavu ttf-liberation
```

- `npm ci` patches and rebuilds the `node-pty` addon (with exec-status reporting) on ARM64 and x64, so both need C++ build tools and `patch`.
- Check the fixture fonts with `fc-list : family`. Native tests that need a missing one skip with `Fixture font not installed: …`.
- Linux package verification also needs Python 3.9+ and pidfd support (kernel 5.3+). Without them it fails instead of signaling by bare PID.

If `npm ci` failed part-way because a tool like `patch` or `make` was missing, install it and run:

```sh
npm run postinstall && npm run check:portable
```

OMXTerm runs with `--no-sandbox` on Linux ([ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md)) and uses X11/XWayland. `npm run dev` passes `--no-sandbox` automatically; if you launch Electron directly for debugging, run `npx electron --no-sandbox .`.

#### Executable temporary directory for Linux tests

Several Linux tests (AppImage installer, launcher, helper and packaged-process tests) create and run scripts under Node's `os.tmpdir()`, which honors `TMPDIR`. If `/tmp` is mounted `noexec`, they fail in confusing ways, such as an invalid AppImage or a helper that never starts ([#688](https://github.com/luizomf/omxterm/issues/688)).

Point `TMPDIR` at a private directory on a filesystem that allows execution for that run:

```sh
TMPDIR=$(mktemp -d "$HOME/omxterm-test-tmp.XXXXXX") npm run test:unit
```

Remove the directory when you're done. Don't remount `/tmp` or change system policy to make the tests pass.

### Windows

1. Enable **Developer Mode** in Windows Settings before cloning or running tests so non-elevated processes can create symbolic links.
2. Clone with Git for Windows defaults. `.gitattributes` keeps text files LF whatever `core.autocrlf` says. Make sure symbolic links are enabled (Developer Mode plus `core.symlinks=true`, the Git for Windows default when it can create them).
3. Install the Microsoft Visual C++ Redistributable that matches your machine (**ARM64** or **x64**). Without it, `npm ci` fails while loading native modules.
4. Run desktop development and graphical tests as a normal (non-Administrator) user in an interactive desktop session, not a headless SSH session.

`npm run build` (and so `npm run dev` and `check:portable`) compiles the extension lease and Files addons on both ARM64 and x64. That needs:

- Visual Studio C++ Build Tools with the native compiler, linker and Windows SDK libraries for your architecture. The build scripts find it themselves with `vswhere` and load `vcvarsall` for the host architecture when `cl.exe` isn't on `PATH`, so a plain PowerShell works. If no Build Tools are installed, they fail with a message naming what to install. A native-tools developer shell is optional; if you prefer one, start it through `cmd.exe` (`call vcvarsall.bat arm64` or `x64`, then launch `powershell.exe`; running the batch file directly from PowerShell doesn't update its environment) and check that `$env:VSCMD_ARG_TGT_ARCH` matches.
- A trusted `node.lib` import library for your architecture from a compatible Node release, exporting the Node-API 8 symbols. The build doesn't download one. Set its **absolute** path in your shell:

```powershell
$env:OMXTERM_NODE_IMPORT_LIBRARY = 'C:\tools\node-arm64\node.lib'
npm.cmd run build
```

The path above is a placeholder. The addons delay-load `node.exe` against the running Node/Electron executable, so the `.lib`, `.exp` and `.obj` files are build intermediates and are not packaged. The hosted x64 CI lane pins Node 24.22.2 and its official import library.

To check that your account can create symlinks before running `npm ci`, run in a non-elevated PowerShell window:

```powershell
@'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omxterm-symlink-check-'));
try {
  fs.writeFileSync(path.join(root, 'target.txt'), 'ok');
  const link = path.join(root, 'link.txt');
  fs.symlinkSync('target.txt', link, 'file');
  if (fs.readFileSync(link, 'utf8') !== 'ok') throw new Error('Symlink read failed');
  console.log('PASS: ordinary-user file symlink creation');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
'@ | node
```

If PowerShell blocks local npm scripts, start a process-scoped session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
npm.cmd ci
npm.cmd run check:portable
```

## Pinned PTY runtime

OMXTerm pins the official `node-pty@1.2.0-beta.18` archive (npm integrity
`sha512-3Rej3788OnasAwoSmTZhlCeUraJ9CQldtL5b571b9+3Nv47+PaxA5VPIGOOs+16OYQePTrC1Lrs8a9/df5WPRg==`),
not a floating beta or a fork. Electron is locked separately.

`postinstall` checks the exact bytes of the JavaScript it patches and rejects
unknown or partly modified sources. The patches keep Windows argv literal,
close Unix output tails cleanly when paused, report Linux foreground reads as
unavailable, and forward an explicit startup-failure flag. An ordinary numeric
exit never means startup failure.

- **macOS ARM64 and Linux ARM64/x64:** a temporary copy of the Unix sources is
  patched with zero fuzz, checked, and built with C++17, Node-API 8 and locked
  headers. The installed upstream sources stay unchanged. The rebuilt addon goes
  into both `build/Release` and the matching prebuild directory (macOS also gets
  the spawn helper), so the loader can't fall back to an unpatched build.
- **Windows ARM64/x64:** the official `conpty.node`, `conpty_console_list.node`
  and bundled ConPTY (`conpty.dll`, `OpenConsole.exe`, used with
  `useConptyDll: true`) are kept unmodified and checked against the archive
  hashes. A shadowing `build/Release` or `build/Debug` addon is rejected.
  Building from source is not supported for this pin.

Packages exclude foreign prebuilds, winpty, PDBs and redundant build inputs.
Package verification compares the prepared JavaScript and native files against
the packaged copies (on macOS, after code signing) and records the native
hashes in `.scratch/node-pty-package.json`.

## Dependency maintenance traps

`@electron/asar` is used directly and by `app-builder-lib`, which packages
`app.asar`. Two open advisories on those trees don't justify a dependency change
([#756](https://github.com/luizomf/omxterm/issues/756),
[#763](https://github.com/luizomf/omxterm/issues/763#issuecomment-6722547699)).

Do **not** force `minimatch@11` under `@electron/asar@3.4.1`. Its
`createPackageFromFiles()` path calls `minimatch_1.default(...)`, and
`minimatch@11` has no default export. The locked `electron-builder` uses
`createPackageFromStreams()`, which avoids that call, but don't rely on it.

When a dependency in the asar or electron-builder tree changes, check a real
package, not just the audit:

```sh
# Shipped runtime is unaffected by dev-only entries.
npm audit --omit=dev

# Check the archive electron-builder just produced (a nonempty list is a smoke check, not a full content check).
node -e "const {listPackage}=require('@electron/asar');const files=listPackage(process.argv[1]);if(files.length===0)throw Error('empty asar');console.log(files.length+' entries')" path/to/resources/app.asar
```

## Test layers

Vitest discovers `*.test.*` and `*.spec.*` files under `test/unit/` and `test/integration/`. Shared support code lives in `test/fixtures/`.

| Layer                | Where                                         | What it needs                                                             |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Unit                 | `test/unit/`                                  | Nothing; headless and parallel                                            |
| Headless integration | `test/integration/` (`*-core`, `local-shell`) | Real Node, PTYs or the bundled terminal core; no window                   |
| Graphical native     | `test/integration/` (most other suites)       | An unlocked desktop; opens and focuses real Electron windows              |
| Opt-in suites        | `test/integration/`, gated by env vars        | A specific setup (see [opt-in suites](#opt-in-native-test-suites))        |
| Package verification | `scripts/verify-packaged-app.mjs`             | A built package (see [packaging](#packaging-and-verification))            |
| Performance          | `scripts/performance/`                        | A built app and an idle desktop (see [benchmark](#performance-benchmark)) |

Commands:

- `npm run test:unit` — headless unit tests in parallel (about a minute). Run it after every change.
- `npm run test:panel-cancellation` — the held-activation cancellation cases in Node with `--expose-gc`. `check:portable` and both x64 CI lanes run it; ordinary unit runs skip the collection case.
- `npm test` — the full default suite (unit + integration, including graphical suites).
- `npm run test:integration` — `test/integration/local-shell.test.ts` only.
- `npm run check:portable` — format check, lint, typecheck, the panel cancellation check, the default suite, and an unpackaged build.
- `npx vitest list --filesOnly --json` — list discovered test files without running them.

Vitest's cache lives in `.scratch/vite` (set in `vitest.config.cts`), so each worktree keeps its own. Each run writes raw JSON results to `.scratch/vitest-results.json`, overwriting the previous run. Trust the exit status: a nonzero exit is a failure whatever the JSON says.

Native dialogs (open, save, overwrite) are tested at OMXTerm's boundary: payload validation, API arguments, owner lifetime, cancel and error results, and file contents. Automating OS-owned chooser widgets on every platform isn't a routine requirement. For terminal export, also do a quick manual smoke with synthetic text: save, cancel, accept overwrite and refuse overwrite.

## Running native tests

> **Warning:** Graphical integration tests open and focus real Electron windows. Run them on an unlocked, logged-in desktop with WebGL2 support. Leave the mouse and keyboard idle during the run, don't resize or switch windows, and run only one graphical suite at a time per desktop.

If a test can't run on your machine, report it as unrun and keep going.
Missing coverage is weighed case by case, not treated as an automatic release
blocker ([ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse)).
To pick focused checks for a narrow change and reuse earlier results, see
[reusing test and build results](release.md#reusing-test-and-build-results).

### Side effects on your desktop

Native tests run the real app against your real user session. A temporary
`HOME`, XDG, or Electron profile directory separates app files, but not these:

- **Clipboard:** two default suites write the system clipboard:
  `extension-view-native` (Linux and macOS) and `terminal-popup-native` (Linux).
  Inside a VM with clipboard sharing on, the writes reach the host too.
- **macOS preferences and Keychain:** source and packaged runs can write the
  `com.github.Electron` and `com.otaviomiranda.omxterm` preference domains, and
  Chromium may show Keychain prompts.
- **Linux desktop services:** Electron can start or reuse per-user services such
  as the document portal on your session bus.

If you care about that state, run native tests in a VM or a spare user account.
Keep the Chromium sandbox enabled; don't disable it to make a test setup work.

Standalone Surface fixtures apply the production Linux GPU policy, which allows
Chromium's SwiftShader WebGL fallback
([ADR 0037](adr/0037-allow-the-linux-software-webgl-fallback.md)). They still need
working WebGL2.

### Focused checks

Run the files for the subsystem you changed; add broader checks when the change
needs them. Known runtime limits the tests account for are in the
[Restty guide](dev/restty-development.md#current-runtime-limitations). Extension
work has its own build and tests: see the
[extension backend runtime](dev/extension-backend-runtime.md) (`npm run build:extension-runtime`)
and the [Mirror Typing build](mirror-typing-development.md#build-and-test).

| Subsystem                                      | Command                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering, appearance, and cursor              | `npx vitest run test/integration/restty-rendering.test.ts test/integration/restty-appearance-rendering.test.ts test/integration/restty-cursor-rendering.test.ts` |
| Tab removal readiness                          | `npx vitest run test/integration/tab-removal.test.ts`                                                                                                            |
| Host image, output, and reload oracles         | `npx vitest run test/integration/restty-host-oracles.test.ts`                                                                                                    |
| Integrated host and retained sessions          | `npx vitest run test/integration/restty-host-integration.test.ts`                                                                                                |
| Scrollback readiness and input                 | `npx vitest run test/integration/restty-native-scroll-feedback.test.ts test/integration/restty-scrollback-rendering.test.ts`                                     |
| Hover and local-image activation               | `npx vitest run test/integration/restty-hover-readiness.test.ts test/integration/local-image-native.test.ts`                                                     |
| Snippets auxiliary host                        | `npx vitest run test/integration/auxiliary-panel.test.ts`                                                                                                        |
| Native window controls                         | `npx vitest run test/integration/window-chrome.test.ts test/integration/restty-cursor-rendering.test.ts`                                                         |
| About startup                                  | `npx vitest run test/integration/application-about.test.ts`                                                                                                      |
| Native failure acknowledgement                 | `npx vitest run test/integration/failure-acknowledgement.test.ts`                                                                                                |
| Initialization cancellation and font ownership | `npx vitest run test/integration/initialization-cancellation.test.ts test/integration/surface-font-ownership.test.ts`                                            |
| Font read across reload                        | `npx vitest run test/integration/font-read-reload.test.ts`                                                                                                       |
| Hosted extension views                         | `npx vitest run test/integration/extension-view-native.test.ts test/integration/extension-view-package-pin.test.ts`                                              |
| Settings shortcut capture (Linux)              | `npx vitest run test/integration/settings-shortcut-native.test.ts`                                                                                               |
| Literal argv                                   | `npx vitest run test/integration/literal-argv.test.ts test/unit/postinstall.test.ts`                                                                             |
| Unix native resize failure                     | `npx vitest run test/integration/terminal-resize-race.test.ts test/unit/terminal-resize-failure.test.ts`                                                         |
| Linux foreground Busy decision                 | `npx vitest run test/unit/linux-foreground.test.ts test/unit/postinstall.test.ts test/integration/linux-foreground.test.ts`                                      |

<a id="resize-and-continued-text-coverage"></a>

Single cases worth running on their own:

```sh
# About dialog (set OMXTERM_TEST_ABOUT_BROWSER=1 to also check the browser handoff)
npx vitest run test/integration/window-chrome.test.ts -t about-only

# Settings layout matrix (see the display requirement below)
npx vitest run test/integration/window-chrome.test.ts -t settings-only

# Split panes and live language change
npx vitest run test/integration/window-chrome.test.ts -t 'checks pane geometry and live language drafts'

# Theme reload with split panes and the panel
npx vitest run test/integration/window-chrome.test.ts -t 'reloads theme appearance'

# Short wrapped line kept across a resize (controlled Adapter, no native PTY)
npx vitest run test/integration/restty-appearance-rendering.test.ts -t 'renders theme colors and preserves configured geometry'
```

#### Settings layout matrix

Headless Settings tests cover ownership, retained identity and palette choice,
not visual quality. The `settings-only` Window Chrome case checks real layout:

- Seven categories after a native-minimum window request, then at 600×320,
  600×480, 640×480, 800×600, 960×320, 960×640 and 1280×640, in both Interface
  Languages with light and dark palettes, plus the panel-container edges at
  559/560/599/600 px (viewport height 640).
- The minimum slot records the requested minimum and the actual outer, content
  and viewport sizes. It needs a compact viewport (at most 639×360) smaller than
  the desktop one; the runtime minimum is never lowered.
- Each case checks the clicked category's selected/hidden state, form and
  shortcut placement on both sides of the breakpoints, label geometry, theme
  and Extension card edges against the 720 px boundary, editor rows, and
  navigation scroll on focus.
- It uses only synthetic themes and Extension entries, with no catalog network.
  `OMXTERM_SETTINGS_EVIDENCE_DIR` saves optional captures; failures keep a
  bounded frame and geometry under `.scratch/native-fixtures/`. Programmatic
  focus and input aren't physical keyboard qualification.

#### Settings layout display requirement

The Window Chrome `settings-only` case checks the Settings editor at viewports up
to **1280×640 CSS px**. Nothing in the Settings layout changes past that: the
widest step is the 900 px navigation width and the 720 px content cap, and the
only height step is at 360 px. The selected display's usable work area, in
logical DIPs, must fit that viewport plus the window's native frame (about
1300×700 DIPs). Physical resolution isn't what counts: display scaling and
panels or docks can make a high-resolution screen too small.

The fixture checks this before anything else. If the display is too small, the
case fails (it doesn't skip) and prints the required and observed sizes. Enlarge
the test desktop's logical work area and run `-t settings-only` on its own before
a full run. If you can't, leave the case unrun and say so.

#### Native terminal popup (Linux)

`terminal-popup-native` opens the real context menu and drives it with `xdotool`
key events through X11/XWayland. It needs a desktop where synthetic input reaches
the app without a permission prompt, with the standard X11 keycodes (F5=71,
F6=72). Under Wayland, XWayland's XTEST can go through a RemoteDesktop portal that
waits for consent; authorize that separately, never by sending keys to the
dialog. Then declare the setup and run the suite alone:

```sh
OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1 npx vitest run test/integration/terminal-popup-native.test.ts
```

Without the variable its cases skip; a skip is not qualification. The fixture sends one F5/F6
calibration pair and requires the app to receive F6 before opening any popup.

### Opt-in native test suites

These suites are skipped unless you set an environment variable:

| Suite                  | Command                                                                                                        | Notes                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| macOS fullscreen blur  | `OMXTERM_TEST_MACOS_FULLSCREEN=1 npx vitest run test/integration/macos-window-blur.test.ts`                    | Native macOS fullscreen transitions for direct blur and HUD fallback.       |
| AltGr layout boundary  | `OMXTERM_TEST_ALTGR_NATIVE=1 npx vitest run test/integration/altgr-native.test.ts`                             | Needs an active US International AltGr layout (and `/dev/uinput` on Linux). |
| `tmux` host comparison | `OMXTERM_TEST_IMAGE_TMUX=1 npx vitest run test/integration/restty-host-integration.test.ts`                    | Needs `tmux` on a POSIX desktop.                                            |
| Files toolbar browser  | `OMXTERM_TOOLBAR_CHROMIUM=/abs/path/to/chromium npx vitest run test/integration/files-toolbar-browser.test.ts` | Headless Chromium layout and hit-testing; no Electron or desktop.           |
| Performance benchmark  | `npm run perf:benchmark`                                                                                       | See [the benchmark](#performance-benchmark).                                |

The extension-build, packaged Files/SSH smoke and extension-composition suites
are also env-gated; their guides ([Files](dev/files-development-preview.md),
[SSH Connect](dev/ssh-connect-development.md),
[macOS composition](dev/macos-extension-composition.md)) and
[release procedures](release.md) describe them.

Some suites can also save synthetic-only screenshots or JSON for review. Point
these at a fresh directory outside the repository's fixture profiles:

| Variable                              | Suite                                           |
| ------------------------------------- | ----------------------------------------------- |
| `OMXTERM_ABOUT_EVIDENCE_DIR`          | `window-chrome` `about-only`                    |
| `OMXTERM_SETTINGS_EVIDENCE_DIR`       | `window-chrome` `settings-only`                 |
| `OMXTERM_EXTENSION_VIEW_EVIDENCE_DIR` | `extension-view-native`                         |
| `OMXTERM_POPUP_EVIDENCE_DIR`          | `terminal-popup-native` (KDE, uses Spectacle)   |
| `OMXTERM_FONT_STYLES_EVIDENCE_PATH`   | `restty-font-styles-rendering` (JSON file path) |
| `OMXTERM_TOOLBAR_EVIDENCE`            | `files-toolbar-browser`                         |

### Native fixture runner

Graphical suites launch Electron through
[`runNativeFixture`](../test/fixtures/run-native-fixture.ts), with
[`prepareFixture`](../test/fixtures/prepare-fixture.ts) building the fixture
bundle. The runner starts the fixture in its own temporary profile and returns
its exit code, signal, `reason` (`exit`, `timeout`, `cancelled` or
`spawn-error`), stdout and stderr.

While the fixture runs, the runner samples its process tree every 500 ms and
reads the processes it registered with `spawnFixturePty` or
`spawnFixtureProcess` (PTY shells call `setsid`, so walking the tree alone would
miss them). When the run ends, it kills every owned process still alive, matching
each by PID and start time. `cleanupErrors` is empty only when every owned
process is gone and the output streams closed; the profile is then removed,
otherwise it's kept for inspection. `cleanupAssistance` is `attempted` when the
runner had to kill something.

## Performance benchmark

`npm run perf:benchmark` measures the built application through a fixed workload
and reports the numbers. **It has no thresholds and no pass/fail for
performance.** It exits non-zero only on operational errors (missing build,
fixture failure, unreadable baseline) or, with `--fail-on-invalid`, on invalid
observations. No check or release lane runs it, because a baseline is tied to the
machine that recorded it.

```sh
npm run build                                  # the benchmark measures the built app
npm run perf:benchmark                         # report + summary; never writes a baseline
npm run perf:benchmark -- --fail-on-invalid    # also fail on missing or incomplete observations
npm run perf:baseline                          # record a first baseline (clean tracked tree)
npm run perf:baseline -- --replace             # replace this machine's baseline
```

The CLI accepts only `--record`, `--replace`, `--fail-on-invalid` and
`--truncate-stream` (a fault injection for the integrity check; it can't record).

Each run writes to `.scratch/performance-benchmark/run-*/artifacts/`:
`report.json`, `summary.md`, and `raw-observations.json`. The raw file can
contain machine details and process IDs; review it before sharing.

What it measures, three fresh repetitions each, printed per repetition:

- memory and CPU with 1, 3 and 6 tabs, each running the same 10,000-line workload;
- idle CPU with cursor blink on/off, focused/unfocused;
- stream throughput (ASCII, styled glyphs, ASCII with deep history), measured as
  bytes parsed into the grid, not paint time;
- synthetic keystroke to grid change (not on-screen latency);
- the scrollback cost at 10,000 vs 0 lines;
- one extension-runtime process, launched on its own.

Memory uses each platform's proportional or private metric, never resident set
size. Main, renderer, GPU, utility, extension runtime and fixture shells are
separate rows; fixture shells never count toward totals. The profiles live in
`PERFORMANCE_BENCHMARK_PROFILES` in
[`test/fixtures/performance-benchmark-report.ts`](../test/fixtures/performance-benchmark-report.ts):

| Profile        | Metric                                | Baseline file                                |
| -------------- | ------------------------------------- | -------------------------------------------- |
| `linux-arm64`  | PSS (`/proc/<pid>/smaps_rollup`)      | `test/performance/baseline.linux-arm64.json` |
| `linux-x64`    | PSS                                   | none                                         |
| `darwin-arm64` | `phys_footprint` (`footprint --json`) | none                                         |
| `win32-arm64`  | private bytes (`PrivateMemorySize64`) | none                                         |
| `win32-x64`    | private bytes                         | none                                         |

When a baseline exists, the summary prints it beside the run only if the
protocol, metric, machine identity, content size, pixel ratio, grid and settings
all match; otherwise it lists why it didn't compare. Summary and repeat runs for
the original delivery are in
[`docs/evidence/performance-830/`](evidence/performance-830/README.md).

Limits: variation between runs is shown, not bounded; a uniform per-tab leak
isn't flagged; the idle window is about 12 s, so slower growth can hide; the
workload is fixed. Run it on a desktop you aren't using (a VM is safest): it
opens, focuses and blurs real windows repeatedly.

## Packaging and verification

The complete native checks run `check:portable`, build the platform installer
into `release/`, and verify the package locally without publishing:

| Platform      | Complete native check                                            |
| ------------- | ---------------------------------------------------------------- |
| macOS ARM64   | `npm run check`                                                  |
| Linux ARM64   | `npm run check:linux`                                            |
| Windows ARM64 | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |
| Windows x64   | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |

Packaged launches, including `package:verify`, have the same
[side effects on your desktop](#side-effects-on-your-desktop) as graphical tests.
A packaged OMXTerm runs one process per profile: if an installed OMXTerm is
already running, launching a freshly built package without `--user-data-dir`
just opens a window in the installed one. Quit it first, or pass a separate
`--user-data-dir`.
See [release procedures](release.md#resume-and-version-only-commands) for the
standalone `package:*` and `package-built:*` commands.

> **Warning:** Full Windows verification (`check:win`, or `package:verify` with `--disposable-vm-allow-omxterm-replacement`) runs the NSIS installer and can replace an existing OMXTerm installation. Run it only in a disposable VM with a recovery snapshot ([Windows release procedure](release.md#windows-arm64-and-x64), [ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)). To verify only the unpacked app directory without the installer:
>
> ```powershell
> npm run package:win        # ARM64; use npm run package:win:x64 on x64
> npm run package:verify -- --windows-unpacked-only
> ```
>
> `--windows-unpacked-only` still launches the app; it isn't headless.

`package:verify` modes:

- **Full (default):** launches the packaged app and checks startup, PTY output
  and shutdown. On Linux it also installs the helper into a temporary root. On
  Windows it runs the exact NSIS installer and checks install and uninstall, and
  refuses to run the installer without `--disposable-vm-allow-omxterm-replacement`.
- **`--inspection-only`:** never launches a GUI, runs NSIS or installs the Linux
  helper. It checks package contents and loads the packaged native addons through
  Electron's Run-as-Node mode; on Linux it also runs real PTY exec-status checks.
  Use it for x64 build-only delivery after `npm run package:linux:x64` or
  `npm run package:win:x64` ([hosted x64 delivery](release.md#hosted-x64-build-only-artifact-delivery)).
- **`--windows-unpacked-only`:** launches the unpacked Windows app without the
  installer.

In every mode, package verification also checks the bundled extension runtime:
exact bundled bytes, native architecture, that its lease and Files addons are
unpacked from `app.asar`, and a packaged store/lease/bootstrap and Files move
probe. Results go to `.scratch/extensions-package.json`.
On macOS native bytes change with code signing, so the verifier records final
hashes and checks the full signature seal; JavaScript must match exactly.
Every target enables extensions; Windows x64 still keeps built-in Snippets.

On supported targets, packaging also bundles the default Snippets extension; see
[Default Snippets](dev/default-snippets.md) for `prepare:default-snippets`.

Headless tests for the Windows installer transaction (they mock Windows
filesystem and command results, so they don't run NSIS):

```sh
npx vitest run test/unit/windows-installer-transaction.test.ts test/unit/windows-installer-verification.test.ts test/unit/windows-verification-options.test.ts
```

### Linux packaged startup teardown

The full Linux verifier watches the launched app's exit code, signal and output
streams. Once the packaged PTY output check passes, it sends TERM **only to the
Electron main process**, after checking its ancestry, start time and executable
bytes, and through a pidfd so a reused PID can't be signaled. Chromium children
and an extract-and-run AppImage wrapper are left to shut down normally. A small
Python helper checks pidfd support before any launch; there is no PID-only
fallback.

Before trusting an extract-and-run wrapper, the verifier checks that it passes
through Run-as-Node exit 0, exit 3 and a signal; a wrapper that hides a failure is
rejected. Success needs exit 0 with no signal, closed streams and every owned
process gone within two seconds. Killing a leftover process tree is failure
recovery, never success. On failure the profile, process snapshots and
`linux-process-result.json` are kept for inspection.

Headless regression tests (no desktop needed; they skip on other OSes):

```sh
npx vitest run test/unit/linux-packaged-process.test.ts test/unit/packaged-application-verifier.test.ts test/unit/linux-wrapper-acquisition.test.ts test/unit/linux-wrapper-control.test.ts
```
