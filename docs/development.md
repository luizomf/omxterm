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
sudo apt install build-essential python3 patch binutils procps fontconfig file xwayland xdotool fonts-dejavu-core fonts-liberation

# Fedora
sudo dnf install gcc-c++ make python3 patch binutils procps-ng fontconfig file xorg-x11-server-Xwayland xdotool dejavu-sans-fonts dejavu-sans-mono-fonts liberation-mono-fonts

# Arch / Omarchy
sudo pacman -S --needed base-devel python patch binutils procps-ng fontconfig file xorg-xwayland xdotool ttf-dejavu ttf-liberation
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

#### Executable temporary directory for Linux tests

Linux tests need a writable temporary directory on a filesystem that permits execution. These fixtures create executable scripts under Node's `os.tmpdir()` (which honors `TMPDIR`):

- [`linux-appimage-installer`](../test/unit/linux-appimage-installer.test.ts) and [`linux-helper-architecture`](../test/unit/linux-helper-architecture.test.ts) execute synthetic AppImages and commands such as `file` and `uname` through a fixture-local `PATH`.
- [`linux-appimage-launcher`](../test/integration/linux-appimage-launcher.test.ts) runs a generated AppRun through Bash, which then executes the temporary application stub.
- [`linux-desktop-launch`](../test/integration/linux-desktop-launch.test.ts) executes inspection stubs and a synthetic AppImage, including its installed copy through `gio launch`.
- [`linux-helper-provisioning`](../test/integration/linux-helper-provisioning.test.ts), [`linux-installer-lifecycle`](../test/integration/linux-installer-lifecycle.test.ts), and [`linux-packaged-process`](../test/unit/linux-packaged-process.test.ts) execute temporary helper, AppImage, or wrapper scripts.

If `/tmp` is mounted with `noexec`, executable permission bits alone do not satisfy this prerequisite. Failures can look like an invalid AppImage or a helper that never starts, rather than an explicit permission error. [#688](https://github.com/luizomf/omxterm/issues/688) records a contributor's reported failures and successful reruns with an executable `TMPDIR`; those results are not a fresh maintainer reproduction or evidence of an architecture defect.

Use a newly created, private directory on an execution-capable filesystem you own. For example, from the repository root, this subshell tries your home filesystem, checks direct script execution, and scopes `TMPDIR` to one focused, non-graphical test run:

```sh
(
  TMPDIR=$(mktemp -d "$HOME/omxterm-test-tmp.XXXXXX") || exit 1
  export TMPDIR
  trap 'rm -f "$TMPDIR/exec-check"; rmdir "$TMPDIR" || printf "%s\n" "Temporary files retained at $TMPDIR; inspect before removing." >&2' 0
  printf '#!/bin/sh\nexit 0\n' > "$TMPDIR/exec-check"
  chmod 700 "$TMPDIR/exec-check"
  "$TMPDIR/exec-check" || {
    printf '%s\n' 'Choose an execution-capable filesystem allowed by your local policy.' >&2
    exit 1
  }
  rm "$TMPDIR/exec-check"
  npm test -- test/unit/linux-appimage-installer.test.ts
)
```

`mktemp -d` creates an owner-only directory; the exit trap removes it only if empty, preserving any remaining fixture files for inspection. Your home filesystem may also prohibit execution: if the probe fails, choose another approved user-owned location rather than remounting `/tmp`, changing system policy, using `sudo`, or skipping failures. For other test commands, use the same scoped environment; full-suite graphical requirements still apply. This prerequisite does not diagnose separate patched-PTY or CJK font failures.

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

## Pinned PTY runtime

OMXTerm pins the official `node-pty@1.2.0-beta.18` archive, not a floating beta
channel or custom Windows fork. Its npm integrity is
`sha512-3Rej3788OnasAwoSmTZhlCeUraJ9CQldtL5b571b9+3Nv47+PaxA5VPIGOOs+16OYQePTrC1Lrs8a9/df5WPRg==`.
This dependency maintenance incorporates upstream's merged ConPTY synchronization
and readiness corrections; it does not attribute historical crashes or establish
native/package qualification by source inspection alone. Electron stays locked
independently.

Postinstall guards complete input, intermediate and final JavaScript bytes,
applies exact replacements, and rejects unknown or partially modified sources.
It retains literal Windows argv, pause-aware Unix output-tail closure,
unavailable Linux foreground reads, and explicit boolean startup-failure
forwarding. The Windows agent-error handler supplies that boolean for deferred
connection failures; ordinary numeric exits never imply startup failure.

On macOS ARM64 and Linux ARM64/x64, preparation patches a temporary copy of the
pinned Unix sources with zero fuzz, verifies the patched digests, and builds with
C++17, Node-API 8 and locked headers. Installed upstream C++ sources remain
unchanged. macOS targets 12.0 and installs the rebuilt addon and matched executable
spawn helper in both `build/Release` and `prebuilds/darwin-arm64`. Linux installs
the same corrected addon in `build/Release` and the matching Linux prebuild, so
loader fallback cannot lose exec-status reporting even when upstream's install
hook skips compilation.

Windows ARM64/x64 retain unmodified official `conpty.node`,
`conpty_console_list.node`, and sibling `conpty/{conpty.dll,OpenConsole.exe}`
(bundled ConPTY `1.25.260303002`, selected with `useConptyDll: true`). Preparation
checks their archive-derived hashes and rejects any shadowing `build/Release` or
`build/Debug` addon. A DLL-only directory from upstream postinstall is not an
addon shadow. Windows source builds are not a supported fallback for this pin.

Packages exclude foreign prebuilds, Windows `pty.node`/winpty/PDBs and redundant
`third_party` build inputs. Package verification compares prepared JavaScript and
selected native bytes against the exact packaged files. macOS instead records
final native hashes after its required ad-hoc signing and verifies the complete
seal. `.scratch/node-pty-package.json` records selected native/runtime hashes;
inspection-only runtime evidence also carries this provenance. These records
must accompany the source/lock, target and compiler/SDK evidence; Unix compiler
outputs are not claimed bit-for-bit reproducible across toolchains. Prepared
JavaScript identities are listed in the [Restty guide](restty-development.md#pinned-inputs-and-wasm-core-rebuild).

Supervised PTY registration completes **process acquisition**, not native-resource
quiescence or fixture settlement. Ordinary readiness requires a verified positive
child identity; ordinary early exit requires a positive PID and reinspection
confirming its disappearance. The fixture PTY adapter alone knows beta.18's
`ready_datapipe` ordering; it never waits for payload or a prompt. Production
session/shutdown interfaces and their actual-exit barrier remain unchanged.

Only the pinned prepared **Windows** `execFailed === true` agent-error event
selects failed-start acquisition. Reviewed dependency ordering consumes the
attempt's deferred-connect admission before that notification, so late worker
readiness cannot initiate another connect. The synchronous observer must verify
the exact retained live owner and a valid positive-identity descendant closure,
then atomically publish that snapshot before forwarding lifecycle downstream.
Include live children/helpers created before native connect threw, even when the
public PID remains 0. An inspected owner-only snapshot is also allowed; neither
PID 0, absence nor the marker proves that no child existed or that native handles
or threads retired. This path does not invoke the successful-readiness callback;
Unix's shared marker still follows the ordinary actual-child exit path.

Readiness/exit/failed-start observation or publication failures retain the pending
write-ahead record and retire temporary observers, without throwing through the
dependency's synchronous listener queue and starving session lifecycle consumers.
Safe diagnostics distinguish `ready-observation`, `exit-observation` and
`failed-start-observation` (branch `failed-start`); publication failures retain
their precise publication phase too. Later events cannot rescue failed
observation. Synchronous registration failures still throw. The unchanged
independent supervisor acquires retained ledger identities, rechecks exact birth
identity before signaling, verifies disappearance and rejects pending/failed
cleanup even after a fixture exit 0 or empty final inventory. Its join and the
original native outcome/scenario assertions remain required; cleanup cannot turn
a nonzero exit or timeout into success.

This is a cooperative fixture protocol, not containment of arbitrary programs or
unobserved orphan trees. A child that launches descendants and disappears before
any accepted ancestry snapshot cannot be reconstructed from PID/name or empty
inventories. The deferred-failure fixture therefore attempts valid PowerShell
with literal no-profile, bounded, non-spawning arguments while preserving its
real unavailable-cwd failure oracle. Unknown escaping ancestry is a blocker, not
permission to invent identities or clear historical blocked receipts.
Headless composition and receipt coverage:
`npm test -- test/unit/native-fixture-ownership.test.ts test/unit/native-fixture-registration.test.ts test/unit/native-fixture-registration-receipt.test.ts`.
Passing those controlled cases does not qualify Windows native D9 or its baseline.

Windows public kill/resize still
defer until first output; controlled callback-order units are not native timing
qualification or proof of containment of later native resize exceptions.

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

- Controlled Fedora and Ubuntu reproductions of [#609](https://github.com/luizomf/omxterm/issues/609) traced the nested About relaunch timeout to inherited `APPIMAGE`: development Electron relaunched the outer terminal's AppImage instead of its own executable. Display relaunch now selects `APPIMAGE` only when `APPDIR/omxterm` matches the current executable ([ADR 0020](adr/0020-default-linux-rendering-to-x11.md)); terminal environment propagation is unchanged. Matched About cases and genuine packaged default-relaunch probes passed with the correction on both prepared desktops. This establishes a mechanism for those bounded reproductions, not the cause of every historical Linux or Windows startup failure or all-platform qualification.
- Known runtime limitations that tests account for are listed in the [Restty guide](restty-development.md#current-runtime-limitations).
- Linux runs that include `terminal-popup-native` (including the full suite) need the explicitly provisioned native-input lane described below. Set `OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1` only after provisioning it. Missing prerequisites fail; they are not skipped as successful qualification.

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

The `font-read-reload` suite holds an actual main-process `FileHandle.read` before
its positional read, retaining native discovery, bounded bytes/face validation,
production preload, host, Surface and supervised PTYs. It checks two pending A
consumers and queued B, one cancelled sibling during reload, exact input/child
acknowledgements, retained healthy session identity, handle cleanup and window
disposal without late startup. Its `old-post-read` build control restores the
original rejection and must fail the main accepted-A result oracle, not time out
or pass through a runtime-init delay. Run it alone on an explicitly assigned idle
desktop with `npm test -- test/integration/font-read-reload.test.ts`.
Headless preparation/physical-read adapter checks:
`npm test -- test/unit/font-read-reload-fixture.test.ts`.
Successful bundle preparation is not native runtime acceptance.

The `auxiliary-panel` suite uses the production window host, real Surfaces/PTYs,
native menu callbacks and Chromium synthetic input through the main keybind
matcher (default and remapped). It covers bounded geometry, captured pointer and
keyboard resize, retained hidden-tab output/grid, window independence, small
height, light/dark reload, chrome/fullscreen and About/image transitions. It does
not establish physical keyboard layouts, OS pointer hardware or cross-platform
pixel parity. Like the suites below, run it only on an idle unlocked desktop.

The Linux `settings-shortcut-native` suite uses the same real window host,
Settings capture/IPC, menu callbacks and Surface, with a raw Python PTY child
that reports every received byte. It checks held bound fullscreen/Quit gestures,
overlapping invalid/modifier releases, fresh input after a missing release,
page departure without button blur, window blur and the real 30-second timeout.
An exact Kitty press/release control fences each empty-input assertion; real
fullscreen and guarded Quit callbacks supply positive action/menu controls.
A deliberately bypassed native repeat must fail the action oracle; an explicitly
injected unmatched DOM release must fail the actual PTY oracle. Chromium can omit
a native release after a prevented down, so the fixture reports observed owned
native repeats/releases rather than assuming both arrived. Run it alone with `npm test -- test/integration/settings-shortcut-native.test.ts`.
The retained-Settings phase types into its graphical raw field, switches to a
terminal without disposing the editor or blurring Record, checks capture
cancellation and exact empty PTY input fenced by the fresh Kitty Escape, then
reopens the same draft/DOM. Its Electron `sendInputEvent` gestures are synthetic, not physical OS/layout or
AltGr qualification; the native menu positive control calls its actual callback,
not OS menu navigation. The ordinary fixture supervisor owns all windows/PTYs.

The Linux `terminal-popup-native` suite builds the production popup callbacks,
preload, renderer, Surfaces and real raw Python PTYs. It opens `Menu.popup` from
an actual Surface context-menu request and uses X11 `xdotool` keyboard events to
activate Paste, checking `BrowserWindow.getFocusedWindow()` inside that real
native callback and the clicked child's received bytes. Retained installed
callbacks additionally check ordinary child exit, selected-window changes with
window-local session IDs, the real Busy decision/shared close slot, native
clipboard selection, and effective translated/remapped/unbound menu state.
Deliberate old Close Pane and clipboard routing controls must fail their distinct
oracles; the existing fixture supervisor still requires actual child exits and
clean ownership settlement.

**Native-input prerequisite:** use an idle, explicitly provisioned input-capable
X11/XWayland desktop with the standard X11/evdev F5=71 and F6=72 keycode
mapping, where these commands cannot create an unowned pending permission
request. Xwayland's portal-backed XTEST may return command success while
RemoteDesktop Start is still pending; those resources belong to Xwayland,
not the Electron fixture supervisor. A portal flag's presence or absence alone
neither proves nor refutes admission. An already admitted portal session or a
provisioned direct XTEST lane may work; provision/authorize it separately using
the platform's supported mechanisms before declaring the lane ready. Tests never
change developer-desktop security, forge portal responses, or send guessed keys
to a permission dialog. Do not use the declaration to bypass consent.

On that provisioned lane, run alone:

```sh
OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1 npm test -- test/integration/terminal-popup-native.test.ts
```

The declaration is only a safety prerequisite, not proof of capability. Before
opening the first popup, the fixture sends exactly one F5 warmup and one F6
proof, using literal numeric keycodes 71 and 72 with a fixed five-second admission
budget and bounded command submission. Numeric keycodes bypass libxdo's named-key
modifier mapping (older libxdo can select Alt-modified F5/F6); calibration does not
use `--clearmodifiers`, manipulate unowned modifiers, change keymaps or upgrade
tools. The standard mapping is an assumption, not admission: the strict real,
unmodified F6 receipt remains the verifier. A cold EI fallback can discard the
triggering warmup; it does not justify repeated attempts or sleeps. Admission
requires the actual focused, live owned window's recognized F6 press and completed
native submission, never xdotool exit, listener registration or menu-show/mapping
timing. Preventing a
press can omit its release, so no release is invented as an admission requirement;
calibration events and late releases remain suppressed before renderer/PTY
delivery until owner retirement. Wrong owner/key, submission, receipt timeout
and retirement have distinct fixed failure categories. After each attempted
calibration command and its streams settle, a `finally` cleanup sends only that
numeric key's `keyup`, with its own five-second command timeout and without the
possibly aborted admission signal. Cleanup's command and stream closure are
also joined before returning; cleanup failure fails submission, retaining any
primary command error. An already-aborted signal sends neither command nor
cleanup. This teardown allowance does not extend the five-second admission
deadline or retry proof. Owned listeners/timers retire on closure. Original
popup/outer deadlines and Home/Down/Return activation, exact clicked-child Paste,
empty alternate child and both intended retarget-negative oracles remain required.

A failed case blocks further popup-case injection in that invocation (failure,
not a green skip). Stop and inspect the lane, including external portal state;
process settlement alone is not portal settlement. Native acceptance must record
actual admission plus source and both negative oracles on the selected runtime,
with no retained process/portal resources. This preflight adds no menu-map fence,
arbitrary delay, product authorization change or desktop provisioning code.

On KDE, `OMXTERM_POPUP_EVIDENCE_DIR` optionally uses Spectacle to capture and crop
a synthetic-content-only native popup PNG (not `capturePage`, which omits OS
menus). Busy answers are fixture-controlled, not native dialog-widget evidence;
input is synthetic, not physical keyboard/layout or cross-platform qualification.
Headless input-observer/child/build checks (no native input or provisioning declaration needed):
`npm test -- test/unit/terminal-popup-input-admission.test.ts test/unit/terminal-popup-native-submission.test.ts test/unit/terminal-popup-native-fixture.test.ts`.

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

On Windows, the real handle-drag no-resize oracle compares exact Win32 physical
window **and** client sizes before/after input on the same HWND, monitor, DPI and
restored state. Geometry-read failures, context transitions and one-physical-pixel
size changes fail; there is no tolerance or retry. Electron's enclosing DIP bounds
can gain or lose a DIP solely from moving across a fractional-scale rounding
boundary, so their sizes are not the no-resize oracle. Physical and DIP movement,
foreground/point ownership, pointer release/restoration and continuity checks are
still required. Headless validator and caller controls:
`npm test -- test/unit/window-chrome-drag-geometry.test.ts test/unit/window-chrome-native-drag.test.ts`.
They do not replace native Windows execution.

The Window Chrome `settings-only` case additionally runs the graphical editor's
layout matrix: six categories at 320×200, 640×480, 800×600, 960×640, 1280×800
and 1920×1080, en-US/pt-BR, representative dark/light palettes and actual panel
breakpoint edges. It checks clicked/selected/hidden/rendered category agreement,
readable label width/line geometry, actual form and shortcut placement on both
sides of their content breakpoints, horizontal containment and reachable focused
controls. Retained editor identity, palette color-scheme and native minima are
also checked. Viewport targeting uses the initial request plus at most two
request-delta corrections on both axes, each followed by the same two-animation-
frame boundary. Deltas accumulate from the last request, not observed/native
size. Breakpoint targeting uses the same bounded rule for panel width and exact
640 px viewport height. Exact first observations stop immediately; clamped or
unreachable targets fail without tolerance, minimum/zoom/scale changes or layout
retries. Category-level exact size and layout assertions remain independent.
`OMXTERM_SETTINGS_EVIDENCE_DIR` optionally saves synthetic-only
PNGs. Before throwing, a failure captures bounded app-only geometry and a frame
(up to 1920×1080 logical pixels and 32 MiB encoded), without refocusing or
restoring the renderer first. The runner's per-invocation failure destination is
outside the removed profile under `.scratch/native-fixtures/`; with an explicit
evidence directory it creates a unique `failure-*` child there. Capture/write
errors are recorded and never replace the original oracle failure.
Run alone on an assigned idle desktop with
`npm test -- test/integration/window-chrome.test.ts -t settings-only`.
Headless preparation does not establish rendered layout or physical input.

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

The independent theme-appearance case reuses that Window Chrome fixture:
`npm test -- test/integration/window-chrome.test.ts -t 'reloads theme appearance without losing separator focus, resize targets or native grids'`.
It loads real theme files through reload into retained windows; checks distinct,
null and omitted paint, both pane axes and the panel, pointer/keyboard PTY resize,
foreground focus during drag, light/dark defaults and a positive transparency
request with blur disabled. Windows retains its documented opaque fallback for
that request; macOS/Linux use the requested tint opacity. A Chromium pixel sample
verifies exact opaque accent/red pixels at the top/bottom of the returned image.
Dimensions and BGRA bytes come from the same NativeImage representation: its
pixel dimensions can differ from the requested 1×3 DIP rectangle at high DPI.
No resizing or color tolerance is applied. Keyboard modality uses synthetic input
plus programmatic separator focus, ordered after the owned renderer consumes the
actual trusted Shift-Tab down/up pair and its default focus movement. Consumption
and the strict `:focus-visible` oracle share the existing response budget; no CSS
modality flag is forced. This is not physical tab traversal or OS-compositor pixel parity.

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
The tab-removal, startup-title and initialization-cancellation fixture entries
observe successful registration of the actual host tab-command callback through
their supplied bridge; independent arrival observers never establish readiness.
Initialization cancellation waits for that receipt before requesting B, not just
A's native-child readiness. Its first-tab cases instead wait for the actual held
font/runtime boundary and host registration, invoke production Close Tab, and
check zero native sessions, normal window destruction and one Quit request.
They do not prevent window closure to inspect renderer cleanup; late release or
rejection and resource cleanup are covered headlessly through the production
host, Surface and Adapter. Native cases remain separate from headless evidence.
The headless emitted entry and production preload demonstrate host registration
while the first Surface return is held; independently holding actual host
registration retains the lost-command/no-replay negative control. Run
`node node_modules/vitest/vitest.mjs run test/unit/initialization-readiness.test.ts test/unit/renderer-fixture-consumers.test.ts`
for the ordering and stale-importer negative controls. This is fixture ordering
evidence, not a diagnosis of a historical native timeout or native cancellation
acceptance. Tab-removal retains its
held-Surface, early-command and held-renderer controls and original deadlines.
Held Surface now positively establishes reception before adoption; the
held-registration and early-command controls independently delay the real
subscription, preserving arrival-only, no-replay, retirement and timeout checks.
Headless emitted-entry/production-callback coverage:
`node node_modules/vitest/vitest.mjs run test/unit/tab-removal-host-readiness.test.ts`.
The production host receives commands during synchronous setup without buffering
or changing mount readiness. Actions requiring an unavailable Surface remain
no-ops; zoom/tab-bar state and Snippets are already available.

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

### Restty host PowerShell isolation

The shared Restty host fixture disables Ctrl+V clipboard access with a typed
`Action<Nullable<ConsoleKeyInfo>, object>` no-op registered through public
`PSConsoleReadLine.SetKeyHandler`. Unlike a ScriptBlock handler, the delegate
preserves PSReadLine's console input mode: an immediate Ctrl+C must reach
`CancelLine` and generate the fresh prompt required by large-paste readiness.
History remains isolated with `SaveNothing` and a fixture-owned path; input
phases still require the executed setup marker. The readiness oracle also
requires an executed command marker, not just a prompt or observed PTY write.

Headless encoded-setup and readiness checks (not native console-mode evidence):
`npm test -- test/unit/restty-host-sessions.test.ts test/unit/restty-host-paste.test.ts`.

### Host output evidence

The paced output fixture keeps all sixteen actual Select All/Copy checks over
2 MiB of ordered records, with unchanged pacing, history/core limits and real
pause/resume. Each source workload window is one literal BEGIN, 4096 exact
32-byte records and its matching END (131,122 bytes). The reserved
`__OMXTERM_BATCH_` namespace must occur once in configured order; malformed,
duplicate, reordered or truncated framing fails without resynchronization.
Bytes inside frames are never normalized, including controls and line endings.

Outside those frames, arbitrary printable/control output is uninterpreted
transport envelope, not an ANSI allowlist or a tolerated trailer length. It is
forwarded unchanged and counted without retaining the whole envelope. Only a
bounded possible-marker prefix is carried between callbacks. Original source
bytes use each callback's UTF-8 byte length; finalized framed bytes plus envelope
bytes must equal that total. This scoped workload oracle does not identify or
validate the origin/semantics of arbitrary envelope text.

After the actual producer exits, the fixture finalizes framing and takes a fresh
session flow snapshot: every original source byte must be cumulatively ACKed and
actual pending bytes must be zero. A pre-exit snapshot or advancement of the ACK
wrapper's counter alone is insufficient. Exact pre-refit baseline-plus-prefix
ACK equality remains a separate requirement. Headless parser/core and composed
producer/session/harness controls:
`npm test -- test/unit/restty-output-checkpoint.test.ts test/unit/restty-output-refit.test.ts test/unit/restty-host-output-phases.test.ts`.
They do not qualify native continuation or Windows transport.

The source-side reorder/omission controls retain only the longest suffix that
could still begin their exact mutation needle. Unrelated protocol/prompt output
is released immediately, with no timer or assumed later read. Raw source
observation precedes the single targeted mutation. Reorder preserves byte length
and must fail actual destination order at record 100; omission must first prove
fresh raw execution (not command echo), then fail response presence in that same
surviving core. Original-source ACK semantics and diagnostic deadlines are
unchanged; omission never synthesizes ACKs for removed bytes. These fixture
corrections do not establish the cause of historical native control timeouts.

### Host/oracle phase receipts

The shared Restty host fixture emits `__OMXTERM_RESTTY_HOST_PHASE__` JSON lines
with version 1, a fixed `phase`, `begin`/`complete`, wall-clock `at` and
process-local monotonic `monotonicMs`. Only source/ACK/copy checkpoint phases
carry a zero-based `checkpoint` (0–15). These synchronous, best-effort receipts
contain no terminal text, commands, titles or paths; they do not replace the
supervisor's mechanical outcome or any oracle assertion.

App readiness, load, first session, the original single native focus request,
its observed focus event, native focus predicate and DOM readiness are separate
boundaries. `dom-focus-query / complete` means the first existing renderer query
returned, even if false; only `dom-focus / complete` establishes its original
focus predicate. No extra responsiveness probe or periodic watcher is added.
An activation stall before that query says nothing about renderer responsiveness.
Output receipts cover the real producer, high-water/resume, all sixteen source,
original-ACK and copied-destination checkpoints, memory query and exit. Refit
receipts cover calibration/restoration, baseline/prefix ACK, native grid and
cleanup. The existing controlled-refit case adds a single entered/returned pair
around its refit resize call and continuation write. Its synchronous
`__OMXTERM_OUTPUT_REFIT_PROGRESS__` receipts carry only fixed phases and numeric
source/checkpoint/original-ACK/pending/pause/resume metadata: immediately after
continuation return, first continuation output, or first failure. The first
contained resize failure adds only `closed-pty` or `native-failure`; it prevents
continuation acceptance. No per-chunk logger, raw payload dump or new poller is
used. The resize array and `refit-native-grid` phase establish a grid request,
not native resize success or child consumption. Prefix modulo arithmetic plus a
byte baseline does not independently establish parser pending-wrap state in an
unknown envelope. Actual-core reflow tests discriminate that separately; D3's
native continuation cause remains unresolved until ordinary native execution.
Poll iterations never emit repeated receipts. A request return or focus
event alone is not readiness or native input admission.

The existing supervisor retains these lines even when its outer deadline wins
before an inner wait can report an error. Inspect unmatched entered phases and
completed phases together, including asynchronous stall completion and cleanup;
the last line alone need not identify the first failed operation. Absence of a
receipt is not success. Diagnostic sink failure is ignored, never converted to
acceptance. Deadlines, focus policy, producer pacing, backpressure and original
assertions remain unchanged. Headless ordering, privacy and real-supervisor
outer-termination controls:

```sh
node node_modules/vitest/vitest.mjs run test/unit/restty-host-window.test.ts test/unit/restty-host-phases.test.ts test/unit/restty-host-output-phases.test.ts test/unit/restty-host-phase-supervision.test.ts
```

## Fixture ownership and cleanup

Linux packaged-wrapper outcome controls use a private acquire-before-release
handoff. A finite Run-as-Node actor (or the stream-retention control worker)
proposes its PID/start identity and waits for an exact acknowledgement before
its native action or wrapper exit. The verifier acknowledges only an actually
collected actor with a live retained parent chain to the immutable initial
wrapper identity. Proposals never seed ownership or authorize signaling.
Malformed, oversized, stale and foreign controls fail within the existing
bounds; recovery cannot turn a timeout/native failure into success. This does
not provide containment of arbitrary unobserved orphans.

`beforeCleanup.outcome` records only the native exit notification already
observed by the verifier at that snapshot; it can be absent even when a retained
worker has been reparented after its wrapper exited. Reparenting does not prove
that the JavaScript exit callback has run. Acquisition-gap regressions compare
that field with independently observed notification delivery, including a real
exit notification deferred until recovery. They still require final native
exit 7/no signal, the acquired worker's retained identity, open streams before
recovery, exact output, closed streams and no remaining actors after recovery,
and the original settlement-timeout failure. Cleanup never supplies a substitute
native outcome or turns that intentional failure into verifier success.

Only those notification-order cases hold the verifier's test clock at launch
until the actual native exit emission is captured, then advance it to the same
250 ms expiry. One independent 3-second wall-clock guard bounds readiness and
capture together; this is event ordering, not native 250 ms latency
qualification. Recovery closes the deferral gate before releasing any captured
notification, so genuinely later arrivals pass through. Real time is restored
before recovery timing and on setup/capture failure, before joining cleanup.
An independent retirement timer shares that wall deadline, so a missing capture
or recovery transition cannot leave an asynchronous join on a frozen clock. Portable real-Node
controls cover late delivery, capture-gated expiry and wall-guard retirement,
not Linux ownership qualification. The no-capture control awaits actual clock
restoration by that watchdog before asserting retirement; elapsed wall time
alone is not its completion receipt. The other real 250 ms negative controls and
production deadlines remain unchanged.

Positive generated-actor tests share the existing 3-second readiness/setup
allowance with their readiness polling; their outer test guards also allow all
three native controls and bounded recovery. This is not a 250 ms native-latency
requirement. The six bad/missing-acknowledgement cases also use that positive
setup allowance: they require actual acquisition before exercising exactly one
ACK-publication fault, not acquisition expiry. The missing-publication case
forces a late hidden collection while retaining the worker, native SIGKILL,
stream closure and intentional settlement failure. Deliberate 250 ms
acquisition-expiry controls still require failure: the same
late hidden collection that succeeds with the positive allowance must expire
without an acknowledgement or action under the negative budget, then settle
cleanup. Controlled-clock tests call the actual actor acquisition helper to
check matching acknowledgements just before, exactly at and after expiry, plus
missing/mismatched acknowledgements. Production deadlines and ownership/signaling
rules are unchanged.

Headless regressions, including a deliberately bypassed handoff and forced
procfs observation gaps:

```sh
node node_modules/vitest/vitest.mjs run test/unit/linux-packaged-process.test.ts test/unit/linux-wrapper-acquisition.test.ts test/unit/linux-wrapper-control.test.ts
```

Graphical integration tests use [`runNativeFixture`](../test/fixtures/run-native-fixture.ts) and [`prepareFixture`](../test/fixtures/prepare-fixture.ts) to manage temporary user profiles, child Electron processes, and PTYs (`spawnFixturePty` / `spawnFixtureProcess`):

- Fixture diagnostics and stdout/stderr logs are written under `.scratch/native-fixtures/`.
- The supervisor removes temporary profiles only after verifying that child processes have exited and streams have closed.
- If a fixture process cannot be cleanly verified on exit, it writes an `ownership-blocked.json` receipt in `.scratch/native-fixtures/` and blocks further launches in that scope until inspected (except for abandoned Windows pre-bootstrap receipts whose parent process has already exited, which are archived automatically).

Windows supervisor receipts can additionally contain optional `cleanupFailure`
metadata when an existing cleanup PowerShell command throws. Its fixed `callsite`
is `final-sample`, `registration-before-kill`, `termination`,
`registration-after-kill`, or `survival`. `elapsedMs` measures the synchronous
boundary around the failed `execFileSync` call (including JavaScript call/argument
overhead) using the process-local monotonic clock, floored to whole milliseconds
and capped at 86,400,000 (one day). It excludes inventory parsing, registration
file processing and target encoding; it is not total cleanup time or an internal
PowerShell phase duration. `category` uses only own data properties: `timeout`
for `ETIMEDOUT`, `command-failed` for a nonzero safe-integer command exit status,
otherwise `unknown`. No arbitrary error codes/text, command arguments, output, environment
values or paths enter this metadata. The original `cleanupErrors` strings and
native exit/signal/reason remain authoritative and unchanged. Successful cleanup
and failures outside those command boundaries omit the field; legacy receipts
without it remain valid. This improves future failure discrimination, not
historical Windows performance or diagnosis of a rare timeout's cause. Command
bounds, ownership blocking, profile retention and supervisor joining are unchanged.
Headless emitted-supervisor/schema controls:
`npm test -- test/unit/native-fixture-cleanup-failure.test.ts test/unit/native-fixture-cleanup-outcome.test.ts test/unit/run-native-fixture-windows.test.ts`.
They do not replace actual Windows execution.

To run the unit tests for fixture preparation and supervision headlessly:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/fixture-preparation-callers.test.ts test/unit/native-preparation-ownership.test.ts test/unit/run-native-fixture-windows.test.ts test/unit/native-fixture-recovery.test.ts
```
