# Allow the Linux software WebGL fallback

## Context

Restty is the only Terminal Surface and needs an actual WebGL2 backend under
[ADR 0025](0025-use-restty-as-the-terminal-surface.md). Linux virtual machines
without 3D acceleration, GPU-less hosts and blocklisted drivers have no
hardware WebGL2. Current Chromium no longer falls back to its bundled
SwiftShader WebGL there unless `--enable-unsafe-swiftshader` is set, so a plain
launch reports "Restty did not initialize an available rendering backend" and
starts no shell. The installer's opt-in compatibility mode
([ADR 0031](0031-keep-linux-installer-choices-small-and-local.md)) only helps
installer users, not distribution packages or direct launches.

## Decision

On Linux, Electron main appends `enable-unsafe-swiftshader` before readiness,
next to the retained sandbox policy of
[ADR 0024](0024-disable-the-chromium-sandbox-on-linux.md). The GPU process
starts after readiness, so main is early enough; launchers need no change.

This is a fallback permission, not detection or an override. Chromium still
chooses usable hardware WebGL2 first, keeps its GPU blocklist and driver
selection, and uses SwiftShader only when hardware WebGL2 is unavailable. No
VM, desktop or driver probe is added, and `LIBGL_ALWAYS_SOFTWARE` and
`--ignore-gpu-blocklist` stay explicit compatibility choices for drivers that
are exposed but broken. macOS and Windows keep Chromium's default; Windows can
follow with native evidence.

Chromium calls the switch unsafe because web pages would reach a JIT-based
software renderer in the GPU process. OMXTerm windows load only the packaged
renderer under the production CSP and deny navigation, so the fallback runs
OMXTerm's own shaders. Terminal output reaches it as glyph and cell data, not
shader code. On Linux the GPU process is unsandboxed under ADR 0024, as with
hardware drivers.

## Consequences

Linux VMs and GPU-less hosts open a usable terminal without flags or
reinstallation, at the CPU cost of software rendering. Hardware users see no
change. ADR 0025's requirement for an actual WebGL2 backend and its
no-fallback-renderer decision stand: SwiftShader provides WebGL2 to the same
Restty Surface. A host where neither hardware nor SwiftShader WebGL2 works
still fails visibly before any PTY starts.
