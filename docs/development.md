# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) to clone the repository, install dependencies, and run OMXTerm in development mode. This guide covers OS-specific prerequisites, running unit and graphical integration tests, and verifying native packages.

See the [Restty guide](restty-development.md) for Terminal Surface internals and [release procedures](release.md) for full release builds.

## Platform prerequisites

Development targets native ARM64 macOS and ARM64/x64 Linux and Windows with **Node.js 22.13+ (22.x) or 24+** and npm. When working inside a virtual machine, clone and build on the guest's native filesystem rather than a shared host folder.

### macOS

Install **Xcode Command Line Tools** (`xcode-select --install`) before running `npm ci`.

- `postinstall` compiles the pinned Unix `node-pty` native addon.
- `npm run build` compiles the separate `native/macos-window-blur.mm` and `native/macos-option-shortcut.mm` addons using bundled Node-API headers (targeting macOS 12.0+).

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
A positive PID can disappear between the kernel's lookup and pidfd preparation;
older kernels can return `EINVAL` at that boundary. The helper accepts that
acquisition result only when a subsequent `/proc/<pid>/stat` read proves the
process disappeared. Existing/reused or unreadable identities, other errors,
and `EINVAL` from signaling remain failures; no PID-only signal fallback is used.

Verify that the fixture fonts are installed with `fc-list : family` (missing fixture fonts cause native font integration tests to fail with `Configured native fixture font is missing`).

If `npm ci` failed part-way because a system tool like `patch` or `make` was missing, install the missing package and run:

```sh
npm run postinstall && npm run check:portable
```

OMXTerm runs with `--no-sandbox` on Linux ([ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md)) and uses X11/XWayland. `npm run dev` passes `--no-sandbox` automatically; if launching Electron directly for debugging, run `npx electron --no-sandbox .`.

#### Executable temporary directory for Linux tests

Linux tests need a writable temporary directory on a filesystem that permits execution. These fixtures create executable scripts under Node's `os.tmpdir()` (which honors `TMPDIR`):

- [`linux-appimage-installer`](../test/unit/linux-appimage-installer.test.ts) and [`linux-helper-architecture`](../test/unit/linux-helper-architecture.test.ts) execute synthetic AppImages and commands such as `file` and `uname` through a fixture-local `PATH`.
- [`linux-appimage-launcher`](../test/integration/linux-appimage-launcher.test.ts) prepares a private copy of the pinned `app-builder-lib` package under `.scratch/`, leaving the installed dependency unchanged. It runs the generated AppRun through Bash, which then executes the temporary application stub. Production Linux packaging still prepares and guards the installed dependency's exact reviewed bytes.
- [`linux-desktop-launch`](../test/integration/linux-desktop-launch.test.ts) executes inspection stubs and a synthetic AppImage, including its installed copy through `gio launch`.
- [`linux-helper-provisioning`](../test/integration/linux-helper-provisioning.test.ts), [`linux-installer-lifecycle`](../test/integration/linux-installer-lifecycle.test.ts), and [`linux-packaged-process`](../test/unit/linux-packaged-process.test.ts) execute temporary helper, AppImage, or wrapper scripts.

If `/tmp` is mounted with `noexec`, executable permission bits alone do not satisfy this prerequisite. Failures can look like an invalid AppImage or a helper that never starts, rather than an explicit permission error. See [#688](https://github.com/luizomf/omxterm/issues/688) for the contributor-reported example, not a maintainer reproduction or established architecture defect.

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

On **Windows ARM64**, ordinary `npm run build`, `npm run dev`, and the build
phase of `npm run check:portable` compile the extension lease addon. Install
Visual Studio C++ Build Tools with native ARM64 compiler/linker and Windows SDK
ARM64 libraries. Open an ARM64 native-tools developer shell as the ordinary
user. Alternatively, in `cmd.exe`, `call` the installed `vcvarsall.bat arm64`
and start `powershell.exe` from that initialized shell; invoking the batch file
directly from PowerShell does not update PowerShell's environment. Verify
`$env:VSCMD_ARG_TGT_ARCH` is `arm64`, and `where.exe cl.exe` and
`where.exe link.exe` resolve the expected toolchain. Provision a trusted ARM64
`node.exe` import library exporting the required Node-API 8 symbols from a
compatible Node release and verify its provenance and architecture. Set
`OMXTERM_NODE_IMPORT_LIBRARY` to its **absolute** path in that shell, for example:

```powershell
$env:OMXTERM_NODE_IMPORT_LIBRARY = 'C:\tools\node-arm64\node.lib'
npm.cmd run build
```

The example path is a placeholder, not an included library. The build uses
locked `node-api-headers`, delay-loads `node.exe` against the running
Node/Electron executable, and neither downloads nor provisions an import
library or compiler. The MSVC import library and export sidecars are build
intermediates kept in the selected native output directory; runtime loads the
`.node` addon, not those sidecars. Native ARM64 Node and a matching Visual C++
runtime are required. Windows x64 does not select this ordinary-build runtime;
the separate explicit runtime build has its own target-native prerequisites. The
[Windows composition fixture](windows-arm64-extension-composition.md) describes
its additional native evidence boundary; source admission is not package or
installer qualification.

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

For the fixture adapter's readiness, early-exit and failed-start protocol, see
[Supervised PTY acquisition](native-test-reference.md#supervised-pty-acquisition). Acquisition does not
establish native-resource quiescence or fixture settlement.

Windows public kill/resize still
defer until first output; controlled callback-order units are not native timing
qualification or proof of containment of later native resize exceptions.

## Test discovery

Vitest discovers `*.test.*` and `*.spec.*` files under `test/unit/` and `test/integration/`. Support code lives in `test/fixtures/`.

- `npm test -- test/unit` — runs fast, headless unit tests only.
- `npm run test:panel-cancellation` — runs only the held-activation cancellation cases in Node with GC enabled, including the post-cancel collection discriminator. `check:portable` and both x64 CI lanes require this headless check; ordinary unit runs skip the collection case without `--expose-gc`.
- `npm test` — runs the full default suite (unit + integration).
- `npm run test:integration` — runs `test/integration/local-shell.test.ts` only.
- `npx vitest list --filesOnly --json` — lists discovered test files without running them.

The optional Files toolbar browser test uses an explicitly supplied headless
Chromium executable and synthetic host/backend responses:

```sh
OMXTERM_TOOLBAR_CHROMIUM=/absolute/path/to/headless-chromium npm test -- test/integration/files-toolbar-browser.test.ts
```

It checks real browser hit-testing, scrolling and layout without Electron or a
desktop. Headless browser processes may still access OS services. For agent
verification, run browser tests and browser-based review/reproduction probes in
an assigned disposable guest, never on a physical host; this also applies to
headless runs and every nested delegate. Set `OMXTERM_TOOLBAR_EVIDENCE` to a
private output directory to retain synthetic screenshots. This is not native or
packaged-app qualification.

The repository's `vitest.config.cts` sets Vite's root-relative `cacheDir` to
`.scratch/vite`, so Vitest result caches and Vite optimizer artifacts belong to
the selected worktree/project root, not a shared `node_modules` target. The CJS
config form also keeps Vite's config bundling in memory: an ESM config would
still write temporary modules under `node_modules/.vite-temp` before its
`cacheDir` setting is read. Do not rely on `--no-cache` or a private reporter path
to make linked dependencies read-only. Cache entries are cumulative scheduling
and optimization state, not evidence of the current invocation's execution or
coverage.

Named projects must inherit this policy or select their own owned cache location;
custom configs/CLI overrides are not sandboxed by the repository config. The
optional experimental filesystem-module cache has a separate path setting and
is not enabled here; enabling it requires an owned location too. Do not delete
shared historical caches or claim their unknown original state was restored.
The Node-only cache regression runs the pinned CLI with disposable shared
cache destinations, multiple workers, inherited nested projects, dependency
optimization and a symlinked working-directory alias; it does not qualify native
or browser behavior.

Test runs write Vitest's raw JSON to `.scratch/vitest-results.json`. Confirm that the report belongs to the current invocation, and preserve it with the command, selected scope/configuration, exit status, and terminal output before another run overwrites it. A nonzero exit remains a failure regardless of JSON counters.

In pinned Vitest 4.1.12:

- `num*TestSuites` includes nested suites, not just files, and is not an executed-file count. Entries in `testResults` identify reported files, not proof that they ran.
- During fail-fast, unreached files can appear as `passed` with empty `assertionResults`. An empty array alone does not distinguish an unreached file from an empty or collection-failed file. Preserve file-level failures and messages, including collection errors.
- Nonempty `assertionResults` represents collected test cases, not proof that all their bodies ran. Count entry statuses (`passed`, `failed`, `pending`, `skipped`, `todo`) separately; aggregate `numPendingTests` can differ from the number of `pending` entries. Pending is not an intentional skip or a pass.

Do not infer full-suite execution coverage from aggregate counters or empty passed entries.

Theme discovery's count/scan limits use controlled filesystem streams in
`test/unit/settings-theme-limits.test.ts`: exact/full and overflowing inputs
assert truncation, bounded iteration/reads and handle settlement without creating
thousands of files. `test/unit/settings-themes.test.ts` retains real filesystem,
link, validation and serialized Settings-service coverage. These are work bounds,
not a native filesystem throughput benchmark; the redesign does not establish the
cause of historical Windows fixture timeouts or `ENOTEMPTY` teardown failures.

The ASAR cancellation unit sets glob's `cwd` to its input directory so the injected
filesystem remains on that Windows drive when the checkout and `TEMP` differ.
It requires hook entry, abort, the exact rejection, pending-read settlement,
no extra crawl and no archive; operation settlement before hook entry fails
explicitly rather than leaving an unjoined rejection assertion.

## Running native tests

The prerequisites below protect test execution. If one is unavailable, record the
affected tests as unrun and continue independent checks or product work. Safe
execution and the release decision are separate. Under [ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse),
evidence gaps are assessed for relevance rather than treated as automatic release
blockers. Preserve actual failures and record their disposition.

> **Warning:** Graphical integration tests open and focus real Electron windows. Run them on an unlocked, logged-in desktop with WebGL2 support. Leave the mouse and keyboard idle during the run, do not resize or switch windows, and run only one graphical test suite at a time per desktop. Follow the shared-clipboard, Linux desktop-service or macOS preference precautions below before launch.

### Shared clipboard before native tests

Disposable guest accounts and temporary HOME/XDG/Electron profiles do **not**
isolate a host/shared clipboard. Before launching a real-clipboard writer, use
an assigned disposable guest and protect that boundary, including any hypervisor
sharing, remote-desktop clipboard redirection or other active synchronization.
The [fixture clipboard map](native-test-reference.md#fixture-clipboard-boundaries)
identifies default writers and distinguishes injected stubs; `npm test`, default
integration and `check:portable` can include real writers without an opt-in.

A concrete Parallels Desktop path, run on the managing host **only for the
currently assigned guest**, is:

1. Inspect installed `prlctl set misc_sharing --help`, `prlctl list --help` and
   `man prlctl` for the selected version/guest's support. The documented
   `--shared-clipboard` modes are `on` (bidirectional), `host-to-guest`,
   `guest-to-host` and `off` (disabled). Require **off**, not a one-way mode.
2. Resolve `ASSIGNED_VM_ID` from the current assignment. Inspect
   `prlctl list -i "$ASSIGNED_VM_ID"`; if sharing is already off, leave it off.
   Otherwise, within the assignment's configuration authority, disable it with
   `prlctl set "$ASSIGNED_VM_ID" --shared-clipboard off`. Re-read
   `prlctl list -i "$ASSIGNED_VM_ID"` immediately before launch and require an
   explicit disabled clipboard mode for that guest. Satisfy any documented
   apply-state/restart requirement; a pending stored setting is not effective
   isolation. Command acceptance alone is not that check. Exclude other active
   clipboard bridges using their supported connection/session controls; a
   Parallels setting covers only its own bridge.
3. If the control is unsupported for that guest, the mode cannot be read or
   confirmed disabled, another bridge cannot be excluded, or a required
   configuration/power change is outside the assignment, **hold the affected
   execution before launch**. Report the unavailable prerequisite and arrange
   supported isolation with the environment owner. This also holds a full suite
   containing the writer; it is not a passing skip or permission to probe the
   physical host's clipboard. Other VM/remote-desktop tools need their own
   documented disable/check path, not guessed equivalent flags.
4. Keep sharing disabled through execution and process settlement. Recheck after
   connection/configuration changes and after the run; an unexplained change
   leaves shared-resource protection unresolved and blocks further launches.
   Do not re-enable sharing or restore clipboard contents as routine cleanup.

Retain private **control metadata only**: tool/version and supported control,
selected guest attribution, observation times, disabled-mode checks, other bridge
coverage and any limitation. Public evidence should summarize the boundary and
synthetic-only fixture scope, not private guest identifiers or full configuration
output. Never collect clipboard contents, formats, screenshots or hashes as
preservation evidence; do not add a clipboard read/write/cross-boundary sentinel
probe or a backup/restoration framework. Fixture assertions may consume their own
synthetic values only after isolation is established. Exit0 and process/display
cleanup do not establish clipboard preservation.

The historical [#820](https://github.com/luizomf/omxterm/issues/820) run established
guest clipboard writes with sharing enabled. Host propagation and loss of prior
contents remain unknown; no new check, guessed restoration or replay can prove
retroactive preservation or repair the missing history.

### Linux desktop services and native verification

For agent Linux verification that launches Electron, a browser or a desktop
harness (including headless probes), use an assigned disposable guest. Reuse its
suitable **existing ordinary user, logged-in desktop, normal user bus and actual
per-user runtime directory** when that account's local state is explicitly
disposable; a new dedicated account or fresh login is not a prerequisite.
Verify the actual account/session and inherited display, authentication, bus and
runtime before launch. A separate ordinary account is an option when the existing
user's state must be preserved; it does not isolate shared machine state or grant
permission to alter other users' resources.

Temporary HOME/XDG/profile directories separate application files, not per-user
services. Changing `XDG_RUNTIME_DIR`, authenticating an Xvfb/Openbox display or
starting `dbus-run-session` under the existing logged-in account does **not**
establish account/runtime isolation. Auto-activated services can still share
paths and mounts with the original desktop. Do not create a competing same-user
private-bus portal as an isolation workaround. When reusing the guest user's
ordinary desktop/bus, explicitly own that verification session and follow the
shared-resource checks below. Disposable account preferences do not make shared
services, mounts or their consumers disposable.

Launch and settlement prerequisites:

1. Before launch, record a private baseline on the intended ordinary bus
   **without activating absent services**: original document-portal service/helper
   creation identities and bus owner (or established absence), mount namespace and document-path
   mount mapping/device/type and portal FUSE connection when observable, current
   consumers, and basic API/FUSE functionality when already active. Identify
   consumers of the document mount, including open files and process working
   directories, without reading exported document contents. Preserve the selected
   original configuration/state and unrelated
   evidence holds. Distinguish observed absence from unavailable inspection;
   if the scope cannot be observed and protected, stop and arrange a suitable
   user/session before launch. Do not interrupt original consumers to make a
   lane available.
2. After the run, join owned process outcomes and streams and release injected
   input. Compare the same original portal/helper/bus identities, mount mapping
   and API/FUSE scope, and original consumer state. Record unexplained consumer
   changes or inspection errors rather than assuming no impact. Repeat
   preservation checks after retiring only owned scratch, before releasing the
   guest. Record these results separately from fixture assertions and process
   settlement: exit0, no remaining task actors or a successful cleanup receipt
   alone does not prove shared-service preservation.
3. On unexplained changes or unavailable checks, retain evidence and report the
   unresolved shared-resource state; stop further launches. Do not unmount,
   kill or restart original services, delete their runtime/store, or reset the
   guest as routine cleanup. Recovery requires separately authorized scope and
   consumer assessment, not a generic retry or an assumed restoration baseline.

[#793](https://github.com/luizomf/omxterm/issues/793) records a same-user/private-bus
portal owning the visible document mount while the original portal retained a
different FUSE connection. Scoped functional recovery is complete, but the full
initial displacement sequence and any rendering-failure causality remain
unproven. Preservation checks are point-in-time observations, not a guarantee
against later changes or reconstruction of a missing historical baseline.

### macOS preferences and native verification

Temporary `HOME`, XDG, Electron user-data and session-data paths separate some
application files; they do **not** isolate macOS per-bundle preferences or
Keychain from the actual user and GUI session. Temporary browser profiles do not
establish Keychain isolation either, including for headless Chrome. Setting
`HOME` does not switch users. The observed Chrome key-storage dialog and its
unattributed trigger are recorded in [#784](https://github.com/luizomf/omxterm/issues/784). The FULL
[`package:verify`](../scripts/verify-packaged-app.mjs) GUI startup uses a temporary
HOME, XDG config/state and Electron user-data directory, but does not capture or
restore OS preferences. FULL and inspection-only also execute packaged Electron
Node-mode probes, some with the inherited environment. Inspection-only does not
launch the GUI, but has not been established as preference-isolated merely because
it is headless. Source-mode Electron fixtures can affect preferences too;
`npm run check` includes both graphical tests and the FULL verifier.

For agent native verification, use an assigned disposable macOS guest and
**reuse an existing suitable ordinary guest account** whose account state and
preferences are explicitly disposable. It need not be a newly created or separately
named test account. Reuse its already configured Aqua session after verifying the
actual account/console identity and [live desktop admission](#macos-console-admission).
Do not create another user, back up disposable preferences or repeat login/setup
solely for preference isolation. Changing an environment variable does not switch
users or establish readiness. Provision missing fixture prerequisites and keep the
desktop idle.

A separate ordinary test account is an option when the existing account's state
must be preserved, not a default requirement. Neither account choice isolates
physical hosts, shared system state, other accounts, input/display resources,
mounted host data or external services. Protect resources outside the explicitly
disposable guest-local scope.

**Only when existing guest preferences must be preserved**, arrange a suitable
baseline and recovery **before** launching any relevant process:

1. Identify the actual account, executable/bundle and possible application,
   Electron, Chromium and helper preference domains for the selected test. The
   packaged app currently uses `com.otaviomiranda.omxterm`; source Electron has
   used `com.github.Electron`. These are starting points, not an exhaustive list.
   Identify the files and user/host scope actually used; do not assume `HOME`
   points to them. Quiesce competing writers and establish exclusive use. If the
   affected scope cannot be identified or safely preserved, use a suitable
   disposable guest account instead.
2. In an owner-only hold outside disposable test scratch, record each domain's
   prior file and daemon existence or absence, exact file bytes and restorable
   metadata (owner/group, mode, modification time, extended attributes and ACLs
   when present), plus daemon-visible semantic values. Verify the backup and
   compare disk with daemon state before launch. Distinguish an absent or empty
   domain from a read/export error; treat errors, unexpected file types or
   ownership, and disk/daemon disagreement as blockers. Preserve the hold and
   keep preference values and private paths out of public evidence.
3. After the run, settle the owned processes and streams, then compare the same
   scope and investigate newly observed domains. Do not overwrite concurrent or
   unrecognized changes. Restore only identified, authorized domains from a
   verified baseline, including both the user preference daemon's semantic state
   and the original file bytes and metadata; handle a previously absent domain
   only when its absence and ownership are established. A raw plist copy or a
   `defaults` operation alone is not proof of both states. Do not guess missing
   values, delete unrelated domains, or restart/kill the preference daemon as a
   shortcut. If safe restoration is unclear, retain the hold and report the
   unresolved state rather than claiming cleanup.
4. Compare bytes, metadata, existence and daemon-visible values immediately
   after restoration and again after owned-scratch cleanup, before retiring the
   hold. Record the selected scope, process settlement, checks and any remaining
   limitations separately from the test result. Matches are point-in-time
   observations, not guarantees against later writes or evidence about
   unobserved domains.

Bounded guest evidence illustrates the distinction: the #764 FULL package
verification observed an application-domain plist metadata change without a
pre-run byte backup, so its earlier contents cannot be reconstructed. A #769
source-mode run changed Electron-domain bytes and daemon-visible values while the
application domain stayed unchanged. A separate Files0.6 packaged run changed the
application domain's bytes and daemon-visible values. In the latter two runs,
the changed existing domains were restored and their file bytes and daemon-visible
values matched the recorded baselines at subsequent checks. A later #766
source-view run also required restoration. In a #765 packaged run, its guard
reported matching selected domains without restoration.
The #769, #766 and #765 private guards treated failed daemon exports as absent or
empty for domains whose files were absent. Their reported matches therefore do
not establish daemon absence for those domains. These observations do not identify
the writer or key, prove a general cause, cover all domains, or guarantee future
restoration. See [#779](https://github.com/luizomf/omxterm/issues/779)
and the [Files checkpoint](files-development-preview.md#files-060-macos-public-catalog-checkpoint).

Preserve the application's existing macOS Chromium sandbox. An outer sandbox and
`NODE_OPTIONS` preload were not suitable workarounds in the #764 qualification;
do not disable application sandboxing to compensate for the test setup. No
repository verifier currently supplies a general preference backup/restoration
facility. Reuse a suitable disposable guest account when its preferences need not
be preserved; otherwise use a verified scoped recovery procedure or another
suitable disposable account.

### macOS console admission

Before source graphical tests, packaged GUI checks or native input probes in the
assigned disposable guest:

1. Verify that the intended **ordinary test user** actually owns the console and
   Aqua session, is on-console and is **unlocked**. SSH access, a running Aqua
   session, configured automatic login, accepted credentials and a stock
   `screenLock is off` result do not establish unlocked desktop admission.
2. Check for held keys/buttons **and Command/Shift/Control/Option modifier flags**.
   Release only input injected by the current owner; do not clear another user's
   state. Verify the selected display's current logical usable work area and
   [required viewport plus native frame](native-test-reference.md#settings-layout),
   not just its physical resolution.
3. Recheck immediately before launch and after restart, session/display changes
   or idle locking. Earlier readiness and a user-active assertion do not guarantee
   continued unlock. If the desktop is locked or changing, stop before launching
   the native run rather than treating the setup hold as a product failure.

Use supported normal guest-console/login mechanisms or an input transport whose
mapping and actual delivery have been verified. API/CLI acceptance alone proves
neither authentication nor product input receipt; do not guess virtual keycode
schemas or loop password attempts. Reuse suitable existing login/display/idle
setup. For necessary guest-only changes, preserve and restore a verified baseline
for state that must be retained; explicitly disposable account settings need no
backup or restoration solely for testing. Protect shared resources and other
consumers. This is not advice to disable security generally: do not relax
physical-host authentication/privacy/Keychain, decode another account's credential
or modify clean recovery media to admit a run.

[#797](https://github.com/luizomf/omxterm/issues/797) records a local
`autoLoginUserScreenLocked` observation and a separate later idle relock despite
lock-policy status. That local Boolean is **not a documented stable Apple MDM
interface or a permanent unlock recipe**; its initial writer is unknown. Setup
recovery does not qualify the product. Keep admission, actual input receipts and
[invocation outcomes](native-test-reference.md#admission-input-and-invocation-outcomes)
separate.

<a id="qualification-scope"></a>

### Qualification scope

`npm run check:portable` is the complete source check (formatting, lint, typecheck,
the default Vitest suite and an unpackaged build). Use [ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse)
to select focused checks for a narrow change and reuse matching results. Before
a run that includes graphical tests:

- Linux display relaunch selects `APPIMAGE` only when `APPDIR/omxterm` matches the current executable, preventing development Electron from relaunching an inherited outer AppImage; terminal environment propagation is unchanged ([ADR 0020](adr/0020-default-linux-rendering-to-x11.md)). [#609](https://github.com/luizomf/omxterm/issues/609) records the bounded Fedora/Ubuntu reproductions and corrected About/packaged-relaunch checks, not a diagnosis of every historical startup failure or all-platform qualification.
- Known runtime limitations that tests account for are listed in the [Restty guide](restty-development.md#current-runtime-limitations).
- Runs that include Window Chrome `settings-only` (including the full suite) need
  a selected display's logical usable work area large enough for the exact
  1920×1080 renderer viewport plus its observed native frame. Physical resolution
  alone is not the prerequisite. See the [Settings layout capacity check and
  focused command](native-test-reference.md#settings-layout) before a full run.
  If capacity is unavailable, leave those tests unrun and record the setup gap.
  An attempted run that fails the capacity check remains failed.
- Linux runs that include `terminal-popup-native` (including the full suite) need the explicitly provisioned [native-input lane](native-test-reference.md#native-terminal-popup-and-input-provisioning). Set `OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1` only after provisioning it. Missing prerequisites fail; they are not skipped as successful qualification.

#### Native dialog boundaries

Test OMXTerm's native-dialog boundary: payload validation, API arguments, requesting-owner lifetime, cancellation and error results, and file contents. For terminal export, combine focused automated checks with a representative manual native-chooser smoke using synthetic text: save a new file, cancel, accept overwrite, and refuse overwrite; verify saved UTF-8 bytes and that cancelled/refused actions leave existing files unchanged.

Exhaustive automation of OS-owned chooser widgets on every platform is not a routine delivery prerequisite. Expand native coverage for a demonstrated platform-specific product risk, and record what was actually exercised. Missing widget automation is an evidence limitation, not a product failure; actual crashes, failed assertions, privacy/ownership defects, and separately required packaging or release checks remain blockers.

### Focused checks

The separately built [Mirror Typing preview](mirror-typing.md#build-from-source)
has its own archive builder, manifest compatibility and licensed payload. Its
build receipt is not native installed-host qualification; see the guide's
[capability contract](mirror-typing.md#capability-and-lifetime).

The [internal extension backend runtime](extension-backend-runtime.md) has an
explicit `npm run build:extension-runtime` artifact and actual native process/store
tests. Normal macOS ARM64, Linux ARM64/x64 and Windows ARM64 `npm run build`
includes the runtime and native lease addon; the Files move addon remains limited
to macOS and Linux ARM64 for the
[Files preview](files-development-preview.md). Those targets construct application
infrastructure without activating installed code; explicit shared actions activate it.
The opt-in shared production-composition fixture has distinct
[macOS](macos-extension-composition.md#installed-package-production-fixture) and
[Linux x64](linux-x64-extension-composition.md#installed-package-production-fixture) and
[Windows ARM64](windows-arm64-extension-composition.md#installed-package-production-fixture)
qualification boundaries. It uses an ordinary build and a minimal installed archive,
without changing Snippets selection or implying Files support.
Files remains a separately built archive.
The runtime's default integration wrapper launches real Electron/Node children even
without opening windows; use an assigned native environment. No application
startup activation, package/fuse/signing qualification or public SDK follows from
building that artifact. Controlled lifecycle tests under `test/unit/extension-runtime-*`
remain headless and do not execute the native addon.

Use targeted files for the affected subsystem; add broader checks when the change
needs them. Detailed prerequisites and evidence boundaries are in the [native subsystem fixture reference](native-test-reference.md):

- [Host, hover and font lifecycle](native-test-reference.md#host-hover-and-font-lifecycle)
- [Restty host PowerShell isolation](native-test-reference.md#restty-host-powershell-isolation)
- [Host output evidence](native-test-reference.md#host-output-evidence)
- [Resize and continued-text coverage](native-test-reference.md#resize-and-continued-text-coverage)
- [Host/oracle phase receipts](native-test-reference.md#hostoracle-phase-receipts)
- [Auxiliary panel and shortcut capture](native-test-reference.md#auxiliary-panel-and-shortcut-capture)
- [Native terminal popup and input provisioning](native-test-reference.md#native-terminal-popup-and-input-provisioning)
- [Window chrome, About and drag geometry](native-test-reference.md#window-chrome-about-and-drag-geometry)
- [Settings layout](native-test-reference.md#settings-layout)
- [Split, language and theme smoke checks](native-test-reference.md#split-language-and-theme-smoke-checks)
- [Fixture ordering and failure controls](native-test-reference.md#fixture-ordering-and-failure-controls)

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

<a id="host-hover-and-font-lifecycle"></a>

Host, hover and font lifecycle: [fixture reference](native-test-reference.md#host-hover-and-font-lifecycle).

<a id="auxiliary-panel-and-shortcut-capture"></a>

Auxiliary panel and shortcut capture: [fixture reference](native-test-reference.md#auxiliary-panel-and-shortcut-capture).

<a id="native-terminal-popup-and-input-provisioning"></a>

Native terminal popup and input provisioning: [fixture reference](native-test-reference.md#native-terminal-popup-and-input-provisioning).

<a id="window-chrome-about-and-drag-geometry"></a>

Window chrome, About and drag geometry: [fixture reference](native-test-reference.md#window-chrome-about-and-drag-geometry).

<a id="settings-layout"></a>

Settings layout: [fixture reference](native-test-reference.md#settings-layout).

<a id="split-language-and-theme-smoke-checks"></a>

Split, language and theme smoke checks: [fixture reference](native-test-reference.md#split-language-and-theme-smoke-checks).

<a id="fixture-ordering-and-failure-controls"></a>

Fixture ordering and failure controls: [fixture reference](native-test-reference.md#fixture-ordering-and-failure-controls).

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

For macOS, apply the [preference precautions](#macos-preferences-and-native-verification)
to graphical tests and packaged Electron probes, including FULL and inspection-only
`package:verify` runs. Where preference preservation is required, a successful
verifier result does not itself establish restoration. For Linux, apply the [desktop-service prerequisites](#linux-desktop-services-and-native-verification)
before source/package launches; temporary profiles and headless execution do not
establish account/runtime isolation.

> **Warning:** Full Windows verification (`check:win` or `package:verify` with `--disposable-vm-allow-omxterm-replacement`) runs the NSIS installer and can replace an existing OMXTerm installation on the machine. Run it only in a disposable VM with a recovery snapshot ([Windows release procedure](release.md#windows-arm64-and-x64)). To verify only the unpacked Windows app directory without running the installer, use:
>
> ```powershell
> npm run package:win        # ARM64; use npm run package:win:x64 on x64
> npm run package:verify -- --windows-unpacked-only
> ```

The exact Windows verifier requires installed-payload removal independently of
registration/shortcut/process cleanup: the custom installation root must be
absent or a real empty directory. Non-recursive removal preserves unexpected
residual files/directories as failure evidence; exact owned-cache cleanup and
later relocated-uninstaller cleanup do not establish payload removal.
Before installation, the verifier binds its own new temporary directory to a
native long path and matching object identity. This handles Windows 8.3 `TEMP`
aliases without relaxing existing registration/shortcut/cache checks. Unsafe
resolved paths, identity changes and original or resolved reparse/process/cache
conflicts fail before installer execution; temporary evidence is retained. See
[ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md).

Headless controlled-command regressions exercise the actual transaction with real
files (including modeled short/long Windows aliases and cleared registrations but retained payload):
`npm test -- test/unit/windows-installer-transaction.test.ts test/unit/windows-installer-verification.test.ts test/unit/windows-verification-options.test.ts`.
These tests mock Windows filesystem metadata/path resolution and command results;
they reproduce verifier defects, not actual NSIS behavior. They do not execute
NSIS or PowerShell or replace disposable-Windows exact-installer qualification.
A source correction does not reclassify an earlier failed installation or
permit replaying its retained transaction.

Current source also carries one exact public Snippets0.1.0 input for new packaged
profiles. Normal checkout/package preparation is offline and pinned; missing or
corrupt supported-target input fails the beforePack hook. Source build/development
opts out of provisioning. See [Default Snippets](default-snippets.md) for
`prepare:default-snippets`, exact target/resource checks, ordinary-profile test
scenarios and the published0.25.0 results/limits. Plan further checks for changed
inputs; keep earlier failures and unrun cases visible in the release decision.

For native x64 **build-only** delivery, use `npm run package:linux:x64` or
`npm run package:win:x64`, then `npm run package:verify -- --inspection-only`.
This mode never launches a GUI, executes NSIS or installs the Linux helper. It
performs package-content checks and loads the exact packaged addon through
Electron Run-as-Node; Linux also runs bounded real PTY exec-status checks.
Desktop/GPU/installer and ordinary-user integration remain unverified, not gates
for these lanes. Windows inspection and unpacked-only verification compare the
embedded app version to the source without requiring an installer artifact;
full Windows verification requires the versioned installer. `--windows-unpacked-only`
is **not** headless: it still launches the application. See [hosted artifact
delivery](release.md#hosted-x64-build-only-artifact-delivery).

Linux x64 builds also bundle the preparatory backend/InstalledPackages runtime
and explicitly unpack its native lease addon. Package verification (including
`--inspection-only`) checks exact bundled bytes, native architecture/unpacking,
and actual packaged Node-mode store/lease/bootstrap resolution, recording
`.scratch/extensions-package.json`. It neither builds nor admits the ARM64-only
Files move addon. [Production Linux x64 extension composition](linux-x64-extension-composition.md)
and the subsequent [optional Snippets source transition](snippets-migration.md#linux-x64-source-transition)
have separate evidence; package inspection is not distributed cutover or GUI qualification.

Windows ARM64 packaging explicitly unpacks `extension-leases.node` and excludes
its `.lib`, `.exp` and `.obj` build intermediates. The inspection-only verifier
requires the extension runtime and dependencies, checks native architecture and
unpacking, compares prepared/package bytes, and runs the packaged Electron
Node-mode store/lease/bootstrap probe. It does not admit the Files move addon or
change Windows x64 admission. One exact unpacked ARM64 app passed this
[inspection-only checkpoint](windows-arm64-extension-composition.md#packaged-runtime-checkpoint)
under a non-elevated Interactive/Limited account, including ordinary-user symlink
access. Inspection does not execute NSIS or itself qualify graphical composition,
installer behavior or Snippets migration. A later, separately bounded
[packaged-GUI checkpoint](windows-arm64-extension-composition.md#packaged-gui-composition-checkpoint)
exercised that retained package with a minimal local extension; it did not run an
installer or qualify a Snippets migration. A subsequent [exact-NSIS checkpoint](windows-arm64-extension-composition.md#exact-nsis-installer-checkpoint)
built a new installer from an independent copy and passed the stock FULL
verifier; the earlier inspection and GUI results retain their original scope.

macOS ARM64 package verification (also with `--inspection-only`) checks the
unpacked extension lease and Files move addons, complete ad-hoc seal,
architecture/deployment floor and packaged Node-mode store/lease/bootstrap resolution. Prepared and
final hashes are recorded in `.scratch/extensions-package.json`; native bytes
may differ after signing, but JavaScript must match exactly. Both macOS and Linux
ARM64 run Files no-clobber move/conflict checks. The same macOS addon now links
Foundation for trash; inspection checks its export and root refusal only. Actual
recoverable Trash semantics require the separate assigned
[native trash fixture](files-development-preview.md#build-and-evidence-boundary),
whose bounded exact-package evidence is recorded there. These probes are not full macOS Files,
backend activation, production platform admission or Snippets qualification.

The [Files exact-DMG fixture](../test/fixtures/files-dmg.md) keeps its qualified
local eleven-check lifecycle mode separate from the six-check qualified
[public-link mode](../test/fixtures/files-dmg.md#public-link-mode).
The latter uses real Settings HTTPS install/reinstall and the unchanged qualified
archive/host pair; it does not replay Trash/state matrices or alter the v1 catalog.
Neither mode substitutes for ordinary FULL package verification. The retained
dev.21 host separately passed the FULL startup/PTY output/privacy check and DMG
image verification; see the [exact evidence](files-development-preview.md#macos-link-first-distribution).
That run used matching dev.21 verifier source, not weakened version checks against
current main. No rebuild was needed merely because test/docs source advanced to dev.22.
Current source's macOS-specific catalog endpoint is a host application change:
public-catalog mode requires a new exact DMG containing that selection and its
own FULL/package/public-consumption evidence. It reuses the short distribution
scope, not the local eleven-check Trash/state campaign. The original dev.21
binary remains link-only for Files0.5; see the
[publication boundary](release.md#files-macos-catalog-publication).

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

<a id="restty-host-powershell-isolation"></a>

Restty host PowerShell isolation: [fixture reference](native-test-reference.md#restty-host-powershell-isolation).

<a id="host-output-evidence"></a>

Host output evidence: [fixture reference](native-test-reference.md#host-output-evidence).

<a id="resize-and-continued-text-coverage"></a>

Resize and continued-text coverage: [fixture reference](native-test-reference.md#resize-and-continued-text-coverage).

<a id="hostoracle-phase-receipts"></a>

Host/oracle phase receipts: [fixture reference](native-test-reference.md#hostoracle-phase-receipts).

## Fixture ownership and cleanup

- [Linux packaged-wrapper controls](native-test-reference.md#linux-packaged-wrapper-controls)
- [Graphical fixture supervision](#graphical-fixture-supervision)
- [Supervised PTY acquisition](native-test-reference.md#supervised-pty-acquisition)
- [Windows cleanup diagnostics](native-test-reference.md#windows-cleanup-diagnostics)

<a id="linux-packaged-wrapper-controls"></a>

Linux packaged-wrapper controls: [fixture reference](native-test-reference.md#linux-packaged-wrapper-controls).

### Graphical fixture supervision

Graphical integration tests use [`runNativeFixture`](../test/fixtures/run-native-fixture.ts) and [`prepareFixture`](../test/fixtures/prepare-fixture.ts) to manage temporary user profiles, child Electron processes, and PTYs (`spawnFixturePty` / `spawnFixtureProcess`). They inherit the caller's desktop/bus/runtime; neither these helpers nor the Linux packaged-process helper provision or validate per-user service isolation. The launching owner must satisfy the [shared-clipboard prelaunch checks](#shared-clipboard-before-native-tests) and [Linux shared-resource prerequisites and preservation checks](#linux-desktop-services-and-native-verification).

Within the fixture process/profile scope:

- Fixture diagnostics and stdout/stderr logs are written under `.scratch/native-fixtures/`.
- The supervisor removes temporary profiles only after verifying that child processes have exited and streams have closed. Its [cleanup-assistance classification](native-test-reference.md#supervisor-cleanup-assistance) distinguishes no observed attempt from attempted or unknown assistance; cleanup success alone is not natural Quit.
- If a fixture process cannot be cleanly verified on exit, it writes an `ownership-blocked.json` receipt in `.scratch/native-fixtures/` and blocks further launches in that scope until inspected (except for abandoned Windows pre-bootstrap receipts whose parent process has already exited, which are archived automatically).

To run the unit tests for fixture preparation and supervision headlessly:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/fixture-preparation-callers.test.ts test/unit/native-preparation-ownership.test.ts test/unit/run-native-fixture-windows.test.ts test/unit/native-fixture-recovery.test.ts
```

<a id="supervised-pty-acquisition"></a>

Supervised PTY acquisition: [fixture reference](native-test-reference.md#supervised-pty-acquisition).

<a id="windows-cleanup-diagnostics"></a>

Windows cleanup diagnostics: [fixture reference](native-test-reference.md#windows-cleanup-diagnostics).
