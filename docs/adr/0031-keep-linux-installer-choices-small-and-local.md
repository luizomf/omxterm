# Keep Linux installer choices small and local

## Context

The helper installs a verified local AppImage with staged three-file replacement,
but users still need to understand launch flags when a desktop exports Wayland,
a virtual GPU cannot initialize Chromium's WebGL2 context, or XWayland leaves a
HiDPI interface too small. The Try Omarchy investigation in #425 reproduced these
as separate conditions. The owner requested a short helper filename and minimal
user choices, not automatic global desktop repair (#426).

## Decision

The helper is published as `linux_install.sh` with
`linux_install.sh.sha256`. Its embedded `--version`, release URL and checksum
retain exact release identity. Assets through 0.17.0 keep their original names;
documentation and evidence corrections do not change those published bytes.
This is the current helper presentation under ADR 0019, not a change to
supported platforms, package formats or artifact trust.

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
partly removed and no structured cleanup/recovery status (#566). A nonzero result
therefore does not always mean the old installation survived. Post-commit cleanup
reporting could be improved separately; this is not a failed replacement,
destructive rollback or evidence that recovery deletes unrestored backups. Inspect the installed
entries and any remaining staging/backups before retrying.

Uninstall removes only the three owned entries, including symlinks themselves,
not their referents. It preserves unrelated files and parent directories. A
removal failure can leave partial removal; uninstall is not transactional.

The installed desktop entry explicitly selects `--ozone-platform=x11`, the
supported Linux path under ADR 0020. An ambient Wayland preference no longer
changes that entry's backend. The application's own override rules and direct
AppImage launch behavior are unchanged; the installer supplies an explicit
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
opt-in compatibility choice covers the tested VM workaround, while desktop-entry
launches retain their fixed, inspectable behavior. No new mandatory dependency
is introduced; optional desktop queries use existing command-line tools.

Install-time scale detection deliberately does not handle monitor hotplug or
mixed-scale movement dynamically. The desktop entry can be adjusted manually;
reinstallation replaces it. Compositor blur and title-bar preferences stay in
the optional setup guide, never automatic machine-wide changes. A functional
software-Mesa workaround does not establish native Wayland or accelerated GPU
support, and OMXTerm still requires an actual WebGL2 backend.
