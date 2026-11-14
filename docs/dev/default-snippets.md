# One-time default Snippets

Since **OMXTerm 0.25.0**, new **packaged** profiles on Linux ARM64/x64, macOS ARM64
and Windows ARM64 try once to install **Snippets 0.1.3**, enabled but inactive
until opened. Existing profiles and disabled/removed choices stay intact; Windows
x64 keeps built-in Snippets. The [availability note](../snippets-availability.md)
is the user view. The policy below also applies
to current source; 0.24.0 did not have this default.

## Enrollment and the permanent attempt

`src/main/default-snippets.ts` owns the policy; existing main captures synchronously as its first executable statement, before profile getters or startup writes. It uses actual `app.getName()` and `app.getPath('appData')` to derive the default userData, plus the account-home/XDG configuration and operational-state roots. It never observes freshness through userData/sessionData getters, which can create directories. Every root must be absolutely identified and absent, with no linked/non-directory/failed ancestor. Existing empty roots are existing profiles too. Development/default-app startup, readiness already reached, unsupported targets, `--user-data-dir`, uncertain identity and later actual-userData mismatch do not enroll.

At readiness, before the operational log, initial kit or package store, main compares actual userData and rederived name/config/state identity, and refuses existing product configuration, YAML, themes, extensions/state or logs that appeared since capture. Chromium may already have created the default root; after-ready directory contents are **not** a freshness heuristic or a Chromium-filename whitelist. One exclusive-created `<userData>/provisioning/default-snippets` file consumes the attempt, with literal `snippets-default-attempt-v1\n`. The filename/content are independent of package/host version, architecture and digest. A present, empty, corrupt, unknown or interrupted witness is never reset or retried. Directory/file sync is attempted before any publication; filesystem/Windows durability retains the ordinary store's limitations, not universal power-loss proof. This is a stable user-owned namespace, not defense against malicious same-user ancestor/mount replacement.

After `InstalledPackages.open`, before backend/manager composition and initial snapshot, the one-shot grant reads the bounded pinned resource and invokes ordinary `install(bytes,{expectedGeneration:0,enabled:true})`. Snapshot entries—including disabled installations and tombstones—win; production generation admission also rejects a concurrent change after a stale empty snapshot. Installation validates/extracts but never imports backend code. Provisioning performs no startup catalog/archive acquisition, extension view/backend activation, user YAML creation or shortcut reassignment. The Windows network-silence test still failed because it observed system-proxy traffic; see the release limits above.

Missing/corrupt resource, store failure or uncertain publication consumes the claimed attempt; terminal startup continues with existing runtime-unavailable handling or a fixed nonblocking startup warning. No private path/native diagnostic is logged by provisioning. Removing/disabling/collecting the package never removes the witness. Clearing only the installation store is not enrollment reset. Manual installation/reinstallation still uses ordinary explicit trust and activation. Deliberately deleting **all** profile/config/state history can create a new profile; this is not a machine-wide history ledger or automatic recovery.

## Fixed source input and reproducible packaging

The committed `assets/default-snippets/snippets-0.1.3.omxext` is the **unchanged public ZIP**, not a rebuild of current `extensions/snippets`. `assets/default-snippets.json` pins:

- 82,380 bytes; SHA256 `9f331d1f5ace110db3d72858006cdc1090aa06c3ec4438062cbbba2fd5006c07`;
- original source/tag commit `e18e16e512ebe5f3cc076ef9a8509be0719cd537`;
- [immutable public archive](https://github.com/luizomf/omxterm/releases/download/ext-snippets-v0.1.3/snippets-0.1.3.omxext), with original host range `>=0.24.0-dev.8`, API `0.1.x` and semantic-input capability.

The ZIP contains its original license notices and package-owned `snippets.example.yaml`;
normal extraction retains that example inside the immutable version, never creates
or copies it to the user's `snippets.yaml`. Original release receipts remain `not-run`; retaining this input does not rewrite them. Host shared compatibility admits the current development family without changing that original manifest.

A normal locked checkout already has the fixed input. `npm run prepare:default-snippets` verifies it offline. To restore an absent/damaged checkout input, separately obtain that **exact URL**, then run `npm run prepare:default-snippets -- /absolute/path/to/snippets-0.1.3.omxext`; only exact hash/size bytes can replace the fixed source input. No acquisition occurs inside this command, build, package preparation or application startup. Do not rebuild/rename a different archive as 0.1.3 or edit receipt qualification.

On an assigned build environment, run the normal locked setup/build/package command for its native target. Electron-builder's `beforePack` hook verifies the existing Linux launcher prerequisite and stages only the pinned input to `dist/default-snippets/<builder-os>-<arch>/bundled-snippets`. Target-specific stages prevent ARM64/x64 hooks from sharing or clearing each other's payload. Supported-target missing/corrupt input **fails packaging**, clearing stale staging first. Unsupported targets clear the stage and require no archive. Source build/development needs no preparation and opts out of provisioning even if this input exists.

The only external resource exception is `resources/bundled-snippets/snippets-0.1.3.omxext` (macOS `Contents/Resources/...`) for an optional target. Packaging filters copy that exact filename only; separate archive/receipt exclusions inside app.asar remain. Package verification checks target, exact directory contents, regular nonlinked file, byte count and SHA256 before its runtime probes; Windows x64 must have no bundled archive. Other `.omxext` archives/sidecars, lookalikes and an archive inside app.asar remain forbidden. This input is public data, readable by installed users, not a generated native binary.

## Evidence boundaries and remaining gates

For 0.25.0, Linux/macOS ARM64 package and ordinary-profile checks passed. Windows
ARM64 installer checks passed and profile behavior was accepted separately from
its failed network-silence test. Its graphical suite did not run, and public-install
Snippets failures remain unresolved. x64 is build-only. See the
[release limits](snippets-migration.md#known-limits) for details.

The earlier diagnostic and fixture requirements below are developer references,
not additional results for 0.25.0.

One bounded pre-change Ubuntu26.04.1 ARM64 / Electron43.8.1 **source** diagnostic on `8169c2c` observed absent default roots before and after full product-module evaluation, then `Crashpad` before product readiness writes, with exact later-userData matching. It supports the simpler existing-main seam, not a different import graph or any packaged/other-platform promise. That disposable scope was exported/retired; it is not a replacement for earlier failed Ubuntu gates or A's separate panel-focus qualification.

Node/filesystem regressions cover archive extraction, registry/generation admission,
one-time/concurrent/failed claims, disable/uninstall/restart and resource filters.
Their deterministic lease adapter does not test kernel locks. For a changed startup
graph or package, select native checks for absent ordinary roots, no user-data-dir
override, packaged identity, generation1 enabled+dormant installation, acquisition/
backend/view/YAML activity, retained PTY and normal Quit, restart and preserved
existing-profile choices. Reuse unchanged-input results. Record any failures or
missing coverage for the [maintainer's release decision](../release.md#verification-and-release-decisions);
a blocked fixture does not by itself stop host delivery or unrelated work.
#741's remaining qualification work stays open.
