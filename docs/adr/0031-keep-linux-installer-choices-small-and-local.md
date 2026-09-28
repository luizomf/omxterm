# Keep Linux installer choices small and local

## Context

The published 0.17.0 helper installs a verified local AppImage transactionally,
but users still need to understand launch flags when a desktop exports Wayland,
a virtual GPU cannot initialize Chromium's WebGL2 context, or XWayland leaves a
HiDPI interface too small. The Try Omarchy investigation in #425 reproduced these
as separate conditions. The owner requested a short helper filename and minimal
user choices, not automatic global desktop repair (#426).

## Decision

The next release names the helper `linux_install.sh` and its checksum
`linux_install.sh.sha256`. The embedded `--version`, release URL and checksum
retain its exact release identity. Published assets and release records remain
immutable. This amends ADR 0019's helper presentation, not supported platforms,
package formats, artifact trust or native release-verification requirements.

Keep `install [--compatibility] <verified-local-AppImage>`, `uninstall`,
`--version`, and `--help` as a non-interactive interface. The fixed ownership set
remains the AppImage, icon and desktop entry; no launcher service, manifest,
configuration migration, dependency installer or network discovery is added.
All three files retain transactional replacement and rollback.

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
