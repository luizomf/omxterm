# Keep Linux installer choices small and local

## Context

Display backend, WebGL2 availability and interface scaling are separate Linux
launch conditions. The helper supplies small inspectable install-time choices
without changing global desktop policy or adding runtime discovery.

## Decision

The helper is published as `linux_install.sh` with
`linux_install.sh.sha256`. Its embedded `--version`, release URL and checksum
retain exact release identity under
[ADR 0019](0019-support-native-arm64-releases-on-macos-linux-and-windows.md).

Keep `install [--compatibility] <verified-local-AppImage>`, `uninstall`,
`--version`, and `--help` as a non-interactive interface. The fixed ownership set
remains the AppImage, icon and desktop entry; no launcher service, manifest,
configuration migration, dependency installer or network discovery is added.
All three replacements are staged and protected by recovery traps until the
replacement phase completes. A staging/replacement failure attempts rollback;
if restoration fails, unrestored originals remain at reported backup locations.

**Current post-commit limitation:** after replacing all three files the helper
disables recovery traps, then deletes staging/backups under `set -e`. A cleanup
error can return nonzero with the new installation already committed, originals
partly removed and no structured cleanup/recovery status. A nonzero result does
not always mean the old installation survived. This is distinct from replacement
failure and rollback; it does not imply required post-commit hardening. Inspect
the installed entries and remaining staging/backups before retrying.

Uninstall removes only the three owned entries, including symlinks themselves,
not their referents. It preserves unrelated files and parent directories. A
removal failure can leave partial removal; uninstall is not transactional.

The installed desktop entry explicitly selects `--ozone-platform=x11`, the
supported Linux path under ADR 0020. An ambient Wayland preference does not
change that entry's backend. Direct AppImage launches use the application's
override rules; the installer supplies an explicit
argument rather than introducing another runtime default.

Only `--compatibility` adds per-process Mesa software rendering and Chromium's
GPU-blocklist override. Detecting a VM, Hyprland or Omarchy is not evidence that a
user needs those trade-offs. A normal reinstall removes them. Both modes preserve
the actual FUSE probe's extraction choice before Electron arguments, without
changing the AppImage bytes or sandbox policy.

Interface scale is distinct from terminal font zoom. During installation, an
active Hyprland session may be queried read-only with bounded `hyprctl` calls.
Only an enabled XWayland zero-scaling policy and one uniform positive monitor
scale justify a fixed Electron scale argument. Missing tools, failed queries,
malformed reports and mixed-scale setups fall back to normal Electron scaling;
there is no guessed 2x default. The helper reports the choice and users refresh
it by reinstalling after display changes. No launch-time probing is introduced.

## Consequences

The ordinary path needs no compositor or graphics vocabulary. One clearly
opt-in compatibility choice provides software graphics, while desktop-entry
launches retain their fixed, inspectable behavior. No new mandatory dependency
is introduced; optional desktop queries use existing command-line tools.

Install-time scale detection deliberately does not handle monitor hotplug or
mixed-scale movement dynamically. The desktop entry can be adjusted manually;
reinstallation replaces it. Compositor blur and title-bar preferences stay in
the optional setup guide, never automatic machine-wide changes. A functional
software-Mesa workaround does not establish native Wayland or accelerated GPU
support, and OMXTerm still requires an actual WebGL2 backend.
