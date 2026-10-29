# Saved Layout production fixture — assigned guest only

This fixture is prepared, not native-qualified by its headless tests. Run one
suite at a time on an assigned, idle, unlocked **Linux ARM64** desktop as a
non-root user. No guest is selected by this recipe. Do not run it on the owner's
working desktop.

## Inputs and preparation

Working directory: the guest's candidate OMXTerm checkout. Use its prepared
Node/npm dependencies and bundled Electron, not an unrelated global Electron.
The actual account shell must be `/bin/bash`, `/usr/bin/bash`, `/bin/sh`, or
`/usr/bin/sh`. The fixture retains that shell and its normal `-l` startup, while
redirecting only account home and profile paths into the supervisor-owned temp
root. Synthetic startup files print a readiness marker without OSC 7 or `cd`.
System shell startup still runs normally.

The caller must provide the live desktop environment (`DISPLAY`, and where
needed `XAUTHORITY`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS` and
`WAYLAND_DISPLAY`), a usable ordinary-user `PATH`, and a writable temporary
filesystem. Do not forward a stale `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`,
`APPIMAGE` or `APPDIR`. No interactive stdin/TTY is required. Synthetic Chromium
input and fixture-controlled chooser/trust responses are used; this is not
physical keyboard or native dialog qualification.

Prepare the host on that guest with the normal project prerequisites and
`npm run build`. The package metadata must be **0.24.0-dev.1** (the original
Saved Layout milestone) or the explicitly admitted **0.24.0-dev.2** follow-up.
The fixture records the actual supplied version; previous dev.1 receipts do not
qualify dev.2. This includes the
Linux native lease addon and extension runtime; do not substitute host-native
artifacts copied from macOS. The fixture hashes the built main, preload,
renderer, bootstrap, package runtime and lease addon, without modifying them.
The ordinary terminal runtime/font prerequisites in `docs/development.md` still
apply. Production's Linux X11/XWayland policy is retained.

Prepare a separate Saved Layout archive with:

```sh
npm run build:restoration-extension -- /absolute/output/restoration-0.1.0.omxext
```

The existing builder requires a clean source HEAD. A transported source archive
may supply its exact source commit as the second argument; the receipt calls
that `supplied-commit`, not a clean Git verification. Root owns source/receipt
correspondence. Build tools include esbuild and Python 3; native build
prerequisites belong to host preparation, not to the fixture run.

Record the archive SHA-256 from the inspected artifact/receipt. Supply **all four**
variables below; paths must be absolute. Any partial opt-in fails instead of
silently skipping. The evidence destination can exist; each invocation creates
a fresh `run-*` directory. The temporary application/profile belongs to the
existing native fixture supervisor.

```sh
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS -u APPIMAGE -u APPDIR \
  OMXTERM_RESTORATION_SOURCE="$PWD" \
  OMXTERM_RESTORATION_ARCHIVE=/absolute/output/restoration-0.1.0.omxext \
  OMXTERM_RESTORATION_ARCHIVE_SHA256=INSPECTED_LOWERCASE_SHA256 \
  OMXTERM_RESTORATION_EVIDENCE=/absolute/evidence/restoration \
  node node_modules/vitest/vitest.mjs run test/integration/restoration-extension.test.ts
```

The test resolves Electron from `SOURCE/node_modules`, launches the generated
`main.mjs` with `productionFixtureArguments`, and imports the **unchanged built
production** `SOURCE/dist/main/index.js`. Preparation bundles only observers and
existing PTY/process registration helpers. It does not build another app,
replace the renderer/router, mock the state service or load a native addon during
headless preparation. Both backend children and all eight real PTYs are registered
with the existing supervisor. The native payload deadline is 150 seconds; the
outer test allowance is 210 seconds, including settlement.

## Required outcome

- Production Settings install/trust is dormant; explicit Saved Layout opens the
  first real backend/page.
- Two source terminal tabs, three mixed-axis unequal panes in the first, one in
  the second. Synthetic local OSC 7, launch-only inheritance, and a directory
  removed only after Save exercise provenance and one Home fallback.
- Save traverses the real page, host capture, backend, scoped state and native
  lease. The first page is destroyed and Disable joins actual backend closure.
  Enable is dormant. A fresh page/backend reads the same persisted revision and
  reuses the stable lease file before Open.
- Exactly four new Default Shells, no dummy shell, all background mounts started;
  original native PTYs and canvas identities remain. Every restored pane reaches
  a distinct PTY, accepts fixture input, reports the expected `pwd`, and confirms
  its resized kernel grid with `stty size`, without a `clear` workaround.
- Core status reports completion and one fallback. Disabling the extension again
  retires the second backend without affecting either window's shells. Normal
  Quit must join backend closure and all actual PTY exit observations, and the
  external supervisor must independently report clean settlement.

Inspect `cold-saved-layout.png` and `restored-window-fallback.png` (synthetic
profile/data only), `scenario.json`, `supervisor.json`, `inputs.json`, and
`observer-build.json`. Passing preparation tests or a marker alone is not native
acceptance. Failure/unknown supervisor settlement is not permission to rerun or
remove retained ownership evidence blindly.

Headless preparation only:

```sh
node node_modules/vitest/vitest.mjs run test/unit/restoration-native-preparation.test.ts
```

## Unchanged Files 0.1.0 compatibility on the new host

No Files fixture change is required. Reuse the existing **packaged lifecycle**
selector below with an inspected Linux ARM64 **0.24.0-dev.1 AppImage** and the
**unchanged published Files 0.1.0 archive/digest**, not a rebuilt replacement.
Root must verify the host version: the fixture reads it from the supplied asar;
it does not have an expected-version environment override.

```sh
env -u OMXTERM_FILES_PACKAGED_CATALOG -u OMXTERM_FILES_PACKAGED_CATALOG_FILE \
  -u OMXTERM_FILES_PACKAGED_ATTACH_ONLY -u OMXTERM_FILES_PACKAGED_TERMINAL_ONLY \
  OMXTERM_FILES_PACKAGED_APPIMAGE=/absolute/host-0.24.0-dev.1-arm64.AppImage \
  OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256=INSPECTED_HOST_SHA256 \
  OMXTERM_FILES_PACKAGED_ARCHIVE=/absolute/immutable-files-0.1.0.omxext \
  OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256=PUBLISHED_FILES_SHA256 \
  OMXTERM_FILES_PACKAGED_EVIDENCE=/absolute/evidence/files-dev1 \
  node node_modules/vitest/vitest.mjs run test/integration/files-packaged.test.ts \
    -t 'uses separate Files through the exact packaged application and joins normal Quit'
```

Run it separately on the same assigned idle desktop. It extracts the unchanged
AppImage (no FUSE/helper installation), checks artifact/asar identities, and uses
its existing loopback inspector and owned Linux-process lifecycle. Prerequisites
include Python 3.9+ with Linux pidfd support (kernel 5.3+), `/usr/bin/xprop`,
ordinary Node test dependencies, and an executable supplied AppImage. Leave
catalog and diagnostic stopping-point modes unset. This selector covers the
existing bounded create/move/conflict check, explicit reinstall with actual
retirement and dormant state, fresh activation, disable/uninstall, original
PTY/Surface continuity and joined Quit. It does **not** select the larger
`files-production.test.ts` operation/HTTPS matrix or repeat a platform campaign.
