# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) to clone the repository, install dependencies, and run OMXTerm in development mode. This guide covers OS-specific prerequisites, running unit and graphical integration tests, and verifying native packages.

See the [Restty guide](restty-development.md) for Terminal Surface internals and [release procedures](release.md) for full release builds.

## Platform prerequisites

Development targets native ARM64 macOS and ARM64/x64 Linux and Windows with **Node.js 22.13+ (22.x) or 24+** and npm. When working inside a virtual machine, clone and build on the guest's native filesystem rather than a shared host folder.

### macOS

Install **Xcode Command Line Tools** (`xcode-select --install`) before running `npm ci`.

- `postinstall` compiles the pinned Unix `node-pty` native addon.
- `npm run build` compiles `native/macos-window-blur.mm` using bundled Node-API headers (targeting macOS 12.0+).

### Linux

Install C++ build tools, Python 3, `patch`, `binutils`, `procps`, `fontconfig`, `file`, XWayland, and the required test fixture fonts (`DejaVu Sans`, `DejaVu Sans Mono`, and `Liberation Mono`):

```sh
# Ubuntu / Debian
sudo apt install build-essential python3 patch binutils procps fontconfig file xwayland fonts-dejavu-core fonts-liberation

# Fedora
sudo dnf install gcc-c++ make python3 patch binutils procps-ng fontconfig file xorg-x11-server-Xwayland dejavu-sans-fonts dejavu-sans-mono-fonts liberation-mono-fonts

# Arch / Omarchy
sudo pacman -S --needed base-devel python patch binutils procps-ng fontconfig file xorg-xwayland ttf-dejavu ttf-liberation
```

`npm ci` rebuilds the source-digest-guarded exec-status PTY addon on native Linux
ARM64 and x64; use C++ build tools and `patch` on both architectures.
Full Linux package startup verification also requires Python 3.9+ and Linux
pidfd support (kernel 5.3+); identity-checked signaling fails closed without them.

Verify that the fixture fonts are installed with `fc-list : family` (missing fixture fonts cause native font integration tests to fail with `Configured native fixture font is missing`).

If `npm ci` failed part-way because a system tool like `patch` or `make` was missing, install the missing package and run:

```sh
npm run postinstall && npm run check:portable
```

OMXTerm runs with `--no-sandbox` on Linux ([ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md)) and uses X11/XWayland. `npm run dev` passes `--no-sandbox` automatically; if launching Electron directly for debugging, run `npx electron --no-sandbox .`.

### Windows

1. Enable **Developer Mode** in Windows Settings before cloning or running tests so non-elevated processes can create symbolic links.
2. Clone with `git clone -c core.autocrlf=false -c core.symlinks=true ...` to preserve LF line endings and repository symlinks.
3. Install the Microsoft Visual C++ Redistributable that matches your machine (**ARM64** or **x64**), and C++ build tools if building native addons from source. Without it, `npm ci` fails while loading native modules.
4. Run desktop development and graphical tests as a normal (non-Administrator) user inside an interactive desktop session (not a headless SSH Session 0). The separate hosted build-only lane uses headless checks and does not claim ordinary-user integration.

To verify that your user account can create symlinks before running `npm ci`, run in a non-elevated PowerShell window:

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

If PowerShell blocks local npm scripts, start a process-scoped session from your desktop terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
npm.cmd ci
npm.cmd run check:portable
```

## Test discovery

Vitest discovers `*.test.*` and `*.spec.*` files under `test/unit/` and `test/integration/`. Support code lives in `test/fixtures/`.

- `npm test -- test/unit` — runs fast, headless unit tests only.
- `npm test` — runs the full default suite (unit + integration).
- `npm run test:integration` — runs `test/integration/local-shell.test.ts` only.
- `npx vitest list --filesOnly --json` — lists discovered test files without running them.

Test runs write Vitest's raw JSON to `.scratch/vitest-results.json`. Confirm that the report belongs to the current invocation, and preserve it with the command, selected scope/configuration, exit status, and terminal output before another run overwrites it. A nonzero exit remains a failure regardless of JSON counters.

In pinned Vitest 4.1.12:

- `num*TestSuites` includes nested suites, not just files, and is not an executed-file count. Entries in `testResults` identify reported files, not proof that they ran.
- During fail-fast, unreached files can appear as `passed` with empty `assertionResults`. An empty array alone does not distinguish an unreached file from an empty or collection-failed file. Preserve file-level failures and messages, including collection errors.
- Nonempty `assertionResults` represents collected test cases, not proof that all their bodies ran. Count entry statuses (`passed`, `failed`, `pending`, `skipped`, `todo`) separately; aggregate `numPendingTests` can differ from the number of `pending` entries. Pending is not an intentional skip or a pass.

Do not infer full-suite execution coverage from aggregate counters or empty passed entries.

## Running native tests

> **Warning:** Graphical integration tests open and focus real Electron windows. Run them on an unlocked, logged-in desktop with WebGL2 support. Leave the mouse and keyboard idle during the run, do not resize or switch windows, and run only one graphical test suite at a time per desktop.

<a id="qualification-scope"></a>

### Qualification scope

`npm run check:portable` is the baseline for every code change (formatting, lint, typecheck, the default Vitest suite, and an unpackaged build). Two things to know before running it:

- On Linux, run the full suite from an external system terminal, not inside OMXTerm itself. The About integration fixtures can hit a relaunch timeout when nested inside OMXTerm on Fedora and Ubuntu ([#609](https://github.com/luizomf/omxterm/issues/609)).
- Known runtime limitations that tests account for are listed in the [Restty guide](restty-development.md#current-runtime-limitations).

### Focused checks

While iterating on a specific subsystem, you can run targeted test files before running the full suite:

| Subsystem                                      | Command                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering, appearance, and cursor              | `npx vitest run test/integration/restty-rendering.test.ts test/integration/restty-appearance-rendering.test.ts test/integration/restty-cursor-rendering.test.ts`                              |
| Tab removal readiness                          | `npx vitest run test/unit/tab-removal-readiness.test.ts test/integration/tab-removal.test.ts`                                                                                                 |
| Host image, output, and reload oracles         | `npx vitest run test/integration/restty-host-oracles.test.ts`                                                                                                                                 |
| Integrated host and retained sessions          | `npx vitest run test/integration/restty-host-integration.test.ts`                                                                                                                             |
| Scrollback readiness and input                 | `npx vitest run test/integration/restty-native-scroll-feedback.test.ts test/integration/restty-scrollback-rendering.test.ts`                                                                  |
| Hover and local-image activation               | `npx vitest run test/unit/restty-hover-evidence.test.ts test/unit/restty-hover-readiness.test.ts test/integration/restty-hover-readiness.test.ts test/integration/local-image-native.test.ts` |
| Snippets auxiliary host                        | `npx vitest run test/integration/auxiliary-panel.test.ts`                                                                                                                                     |
| Native window controls                         | `npx vitest run test/integration/window-chrome.test.ts test/integration/restty-cursor-rendering.test.ts`                                                                                      |
| About startup                                  | `npx vitest run test/integration/application-about.test.ts`                                                                                                                                   |
| Native failure acknowledgement                 | `npx vitest run test/integration/failure-acknowledgement.test.ts`                                                                                                                             |
| Initialization cancellation and font ownership | `npx vitest run test/integration/initialization-cancellation.test.ts test/integration/surface-font-ownership.test.ts`                                                                         |
| Literal argv                                   | `npx vitest run test/integration/literal-argv.test.ts test/unit/postinstall.test.ts`                                                                                                          |
| Unix native resize failure                     | `npx vitest run test/integration/terminal-resize-race.test.ts test/unit/terminal-resize-failure.test.ts`                                                                                      |
| Linux foreground Busy decision                 | `npx vitest run test/unit/linux-foreground.test.ts test/unit/postinstall.test.ts test/integration/linux-foreground.test.ts`                                                                   |

The `auxiliary-panel` suite uses the production window host, real Surfaces/PTYs,
native menu callbacks and Chromium synthetic input through the main keybind
matcher (default and remapped). It covers bounded geometry, captured pointer and
keyboard resize, retained hidden-tab output/grid, window independence, small
height, light/dark reload, chrome/fullscreen and About/image transitions. It does
not establish physical keyboard layouts, OS pointer hardware or cross-platform
pixel parity. Like the suites below, run it only on an idle unlocked desktop.

The `window-chrome` suite includes an independent `about-only` scenario so an
unrelated native geometry failure cannot skip About coverage. Run it alone with
`npm test -- test/integration/window-chrome.test.ts -t about-only`. It exercises
the real menu callback, preload, dialog and Terminal Surface, using synthetic
keyboard input. For an explicitly scheduled browser handoff check, set
`OMXTERM_TEST_ABOUT_BROWSER=1`: it opens the fixed project page in the default
browser, observes focus leaving OMXTerm, then returns focus to the dialog.
`OMXTERM_ABOUT_EVIDENCE_DIR` optionally saves fixture-only normal/small light/dark
PNG captures. These checks still require an idle unlocked desktop; they do not
claim physical keyboard navigation or pixel parity across platforms.

The independent Window Chrome feature smoke reuses the real renderer, host,
Settings service/reloader, owned profiles and native PTY supervisor. Select its
single literal case on an idle unlocked desktop:

```sh
node node_modules/vitest/vitest.mjs run test/integration/window-chrome.test.ts -t 'checks pane geometry and live language drafts without leaking a native dialog or process'
```

It checks a right split in one tab, DOM/command focus reaching main ownership,
input acknowledged by each actual child, keyboard divider resize changing both
pane bounds and PTY grids, and Close Pane terminating only its child while the
survivor refits and accepts input. It then changes the genuine Settings language
control through persistence/reload into two retained hosts while both dirty raw
editors keep bytes, selection, scroll, DOM focus and identity. The language event
is dispatched programmatically without moving focus; pane-close confirmation is
fixture-approved. This does not automate OS widgets, physical input, every split
axis/weight case, or preview target death. Headless preparation/control coverage:
`node node_modules/vitest/vitest.mjs run test/unit/feature-native-smoke-fixture.test.ts`.
Native behavior is established only by actually running the native case, not by
its successful bundle build or collection.

The `application-about` startup fixture stops before its first window. Its
`published-failure` control publishes the real observation, requests normal Quit
to latch production shutdown, then prevents the default `will-quit` exit and
injects actual exit code 3. The supervisor must report code 3 with no signal;
diagnostics never substitute for that outcome. The timeout controls require the
same producer/role to reach the menu (`missing-result`) or successful atomic
observation publication (`published-hang`). Bounded metadata outside the removed
profile records publication completion, Quit progression and unexpected window
creation; missing/invalid evidence or any window fails the phase check. These
checks diagnose fixture ordering, not the exact cause of a native SIGTRAP.
Headless coverage uses the actual fixture callback and production shutdown owner:
`npm test -- test/unit/application-about-startup.test.ts test/unit/application-about-diagnostics.test.ts test/unit/terminal-shutdown.test.ts test/unit/native-fixture-completion.test.ts`.

The auxiliary-panel native fixture fences overlay transitions with bounded,
window-owned receipts recorded only after the actual production Toggle/Paste
listeners return. These receipts establish callback consumption before About
close, picker cancellation or image Escape; they do not drain asynchronous
input accepted earlier. The continuous input sample and strict empty assertions
remain unchanged. Headless ordering/negative controls:
`npm test -- test/unit/overlay-action-consumption.test.ts test/unit/auxiliary-panel-fixture.test.ts`.

Fixture Surface import overrides target the canonical composition importer,
`src/renderer/start-terminal-window.ts`, not the thin `src/renderer/index.ts`
entry. After moving composition, check every importer-sensitive consumer; normal
bootstrap equivalence does not prove fixture interception equivalence. Run
`npm test -- test/unit/renderer-fixture-consumers.test.ts` for actual headless
bundle/control checks, including deliberately stale-importer negative controls.

Session-selection notifications describe ownership, not Surface adoption or host
command readiness: panes may report a started session before their mount returns.
The tab-removal and startup-title fixture entries observe successful registration
of the actual host tab-command callback through their supplied bridge; their
independent arrival observers never establish readiness. Tab-removal retains its
held-Surface, early-command and held-renderer controls and original deadlines.
Headless emitted-entry/production-callback coverage:
`node node_modules/vitest/vitest.mjs run test/unit/tab-removal-host-readiness.test.ts`.
This fixture observation does not change the documented first-tab command loss.

### Opt-in native test suites

Several specialized integration suites are skipped by default and enabled via environment variables:

| Suite                        | Command                                                                                                                                | Notes                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| macOS fullscreen blur        | `OMXTERM_TEST_MACOS_FULLSCREEN=1 npx vitest run test/integration/macos-window-blur.test.ts`                                            | Exercises native macOS fullscreen transitions for direct blur and HUD fallback.               |
| AltGr layout boundary        | `OMXTERM_TEST_ALTGR_NATIVE=1 npx vitest run test/integration/altgr-native.test.ts`                                                     | Requires an active US International AltGr layout (and `/dev/uinput` on Linux).                |
| Font stroke evidence         | `OMXTERM_FONT_STYLES_EVIDENCE_PATH="$PWD/.scratch/font-obs.json" npx vitest run test/integration/restty-font-styles-rendering.test.ts` | Saves comparison JSON and synthetic glyph PNG captures alongside the test run.                |
| Local-image preview capacity | `OMXTERM_TEST_IMAGE_CAPACITY=1 npx vitest run test/integration/local-image-capacity-native.test.ts`                                    | Measures repeated 64 MiB preview open/close cycles into `.scratch/local-image-capacity.json`. |
| `tmux` host comparison       | `OMXTERM_TEST_IMAGE_TMUX=1 npx vitest run test/integration/restty-host-integration.test.ts`                                            | Requires `tmux` installed on a POSIX desktop.                                                 |

<a id="interruption-regressions"></a>

#### Interruption regressions

These opt-in suites deliberately terminate fixture-owned processes to test cleanup and recovery. Run them only inside a disposable VM:

```sh
OMXTERM_TEST_NATIVE_INTERRUPTION=1 npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts
```

On Windows, additional WMI outcome and bootstrap suites are available:

```powershell
$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'
npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts test/integration/native-fixture-outcome-windows.test.ts test/integration/native-fixture-bootstrap-windows.test.ts
Remove-Item Env:OMXTERM_TEST_NATIVE_INTERRUPTION
```

<a id="evidence-reuse-and-packaging"></a>

### Packaging and verification commands

ARM64 complete native checks (and optional full x64 checks) run `check:portable`, build the platform installer into `release/`, and verify the packaged artifact locally (without publishing):

| Platform      | Complete native check                                            |
| ------------- | ---------------------------------------------------------------- |
| macOS ARM64   | `npm run check`                                                  |
| Linux ARM64   | `npm run check:linux`                                            |
| Windows ARM64 | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |
| Windows x64   | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |

> **Warning:** Full Windows verification (`check:win` or `package:verify` with `--disposable-vm-allow-omxterm-replacement`) runs the NSIS installer and can replace an existing OMXTerm installation on the machine. Run it only in a disposable VM with a recovery snapshot ([Windows release procedure](release.md#windows-arm64-and-x64)). To verify only the unpacked Windows app directory without running the installer, use:
>
> ```powershell
> npm run package:win        # ARM64; use npm run package:win:x64 on x64
> npm run package:verify -- --windows-unpacked-only
> ```

For native x64 **build-only** delivery, use `npm run package:linux:x64` or
`npm run package:win:x64`, then `npm run package:verify -- --inspection-only`.
This mode never launches a GUI, executes NSIS or installs the Linux helper. It
performs package-content checks and loads the exact packaged addon through
Electron Run-as-Node; Linux also runs bounded real PTY exec-status checks.
Desktop/GPU/installer and ordinary-user integration remain unverified, not gates
for these lanes. `--windows-unpacked-only` is **not** headless: it still launches
the application. See [hosted artifact delivery](release.md#hosted-x64-build-only-artifact-delivery).

See [release procedures](release.md#resume-and-version-only-commands) for standalone `package:*` and `package-built:*` commands.

### Linux packaged startup teardown

The full Linux verifier observes launch errors, native exit code/signal and stream
closure from launch. Its controlled PTY output receipt identifies the Electron
main and probe; the verifier checks owned ancestry, process start identity and
exact inspected executable bytes before sending TERM **only to main**, using a
pidfd to prevent PID-reuse signaling. Chromium children and an extract-and-run
AppImage wrapper remain alive for orderly shutdown. Descendants are retained by
identity, including PTYs in separate sessions. Before any application or wrapper
control launch, a bounded Python helper check opens a pidfd for itself and sends
signal 0 through it. Missing Python, APIs or kernel support blocks the launch;
there is no numeric-PID fallback.

Before trusting an extract-and-run wrapper's result, headless controls on that
exact AppImage must propagate native Run-as-Node exit 0, exit 3 and signal failure.
These controls intercept the reviewed bash AppRun via a private `BASH_ENV` script;
they do not launch Electron GUI or alter the package. A wrapper that masks a
failure is rejected. The wrapper's result is not a separate kernel wait of main;
a signal may be normalized to a nonzero wrapper code.

Success requires code 0/no signal, closed streams and owned settlement within
the existing two-second shutdown bound. Bounded identity-checked tree TERM/KILL
is failure recovery only, never success. Failures retain the isolated profile,
inspection/helper trees, and bounded stderr plus `linux-process-result.json` for
teardown failures. Recovery validates retained immutable PID/start identities,
allowing ordinary reparenting as parents exit; first-signaling main still requires
strict ancestry/group/executable checks. Independent recovery targets are all
attempted and errors aggregated. Failed wrapper controls retain bounded output,
native results and ownership snapshots before/after cleanup, even when cleanup
fails; recording errors join rather than replace the original failure.
Helper provisioning and macOS/Windows shutdown policies are unchanged.

Headless Linux regression coverage (real main, Chromium-like child, separate-session
PTY and reaping/masking wrappers; no desktop required):

```sh
npm test -- test/unit/linux-packaged-process.test.ts test/unit/packaged-application-verifier.test.ts
```

These process tests skip on other OSes. They do not replace exact-package desktop
verification in direct/FUSE and extract-and-run modes.

## Fixture ownership and cleanup

Graphical integration tests use [`runNativeFixture`](../test/fixtures/run-native-fixture.ts) and [`prepareFixture`](../test/fixtures/prepare-fixture.ts) to manage temporary user profiles, child Electron processes, and PTYs (`spawnFixturePty` / `spawnFixtureProcess`):

- Fixture diagnostics and stdout/stderr logs are written under `.scratch/native-fixtures/`.
- The supervisor removes temporary profiles only after verifying that child processes have exited and streams have closed.
- If a fixture process cannot be cleanly verified on exit, it writes an `ownership-blocked.json` receipt in `.scratch/native-fixtures/` and blocks further launches in that scope until inspected (except for abandoned Windows pre-bootstrap receipts whose parent process has already exited, which are archived automatically).

To run the unit tests for fixture preparation and supervision headlessly:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/fixture-preparation-callers.test.ts test/unit/native-preparation-ownership.test.ts test/unit/run-native-fixture-windows.test.ts test/unit/native-fixture-recovery.test.ts
```
