# Architecture decision records

These records explain OMXTerm's current architecture, rationale and limits.
They evolve with the product, as do the [specification](../spec.md), contracts
and guides. Replace obsolete guidance rather than accumulating amendments;
Git, issues and PRs preserve decision history. A distinct architectural decision
can have its own ADR without keeping competing guidance active.

The specification owns observable behavior. Source/test boundaries and known
limitations belong with the relevant decision; they do not automatically imply
required code changes or release blockers. [Development](../development.md)
owns maintenance commands and [release](../release.md) owns qualification.

| ADR  | Decision                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0001 | [Use Electron for the desktop runtime](0001-electron-for-the-desktop-runtime.md)                                               |
| 0002 | [Store user configuration under XDG_CONFIG_HOME](0002-xdg-for-user-configuration.md)                                           |
| 0003 | [Keep user configuration strict and non-mutating](0003-strict-non-mutating-user-configuration.md)                              |
| 0004 | [Log the operational envelope, not terminal payload](0004-log-the-operational-envelope-not-terminal-payload.md)                |
| 0005 | [Keep OMXTerm and OMXTerm Web independent](0005-keep-omxterm-and-omxterm-web-independent.md)                                   |
| 0006 | [Isolate the renderer from local capabilities](0006-isolate-the-renderer-from-local-capabilities.md)                           |
| 0008 | [Make the Terminal Surface the portable module](0008-make-the-terminal-surface-the-portable-module.md)                         |
| 0009 | [Keep clipboard access explicit and one-way](0009-keep-clipboard-access-explicit-and-one-way.md)                               |
| 0010 | [Keep terminal titles display-only](0010-keep-terminal-titles-display-only.md)                                                 |
| 0011 | [Validate external links at main](0011-validate-external-links-at-the-main-process.md)                                         |
| 0012 | [Use standard xterm terminal capabilities](0012-use-standard-xterm-terminal-capabilities.md)                                   |
| 0013 | [Do not inject shell integration](0013-do-not-inject-shell-integration.md)                                                     |
| 0014 | [Release under the MIT License](0014-release-under-the-mit-license.md)                                                         |
| 0015 | [Publish tested releases without verified publisher identities](0015-publish-tested-unsigned-arm64-releases.md)                |
| 0016 | [Adopt tabs with one live session per tab](0016-adopt-tabs-with-one-live-session-per-tab.md)                                   |
| 0017 | [Confirm close only for Busy Sessions](0017-confirm-close-only-for-busy-sessions.md)                                           |
| 0018 | [Deliver menu-refused accelerators in main](0018-deliver-menu-refused-accelerators-in-main.md)                                 |
| 0019 | [Support native ARM64 releases with risk-based evidence](0019-support-native-arm64-releases-on-macos-linux-and-windows.md)     |
| 0020 | [Default Linux rendering to X11](0020-default-linux-rendering-to-x11.md)                                                       |
| 0021 | [Insert lexical shell-quoted paths through Protected Paste](0021-insert-lexical-shell-quoted-paths-through-protected-paste.md) |
| 0022 | [Render bounded Kitty images in direct sessions](0022-render-bounded-kitty-images-in-direct-sessions.md)                       |
| 0023 | [Verify exact NSIS in authorized disposable VMs](0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)                  |
| 0024 | [Disable the Chromium sandbox on Linux](0024-disable-the-chromium-sandbox-on-linux.md)                                         |
| 0025 | [Use Restty as the Terminal Surface](0025-use-restty-as-the-terminal-surface.md)                                               |
| 0026 | [Preview explicitly activated local images](0026-preview-explicitly-activated-local-images.md)                                 |
| 0027 | [Hide Window Chrome without replacing sessions](0027-hide-window-chrome-without-replacing-sessions.md)                         |
| 0028 | [Wait for native sessions before application quit](0028-wait-for-native-sessions-before-application-quit.md)                   |
| 0029 | [Compose background effects with explicit cell identity](0029-compose-background-effects-with-explicit-cell-identity.md)       |
| 0030 | [Prefer direct macOS background blur](0030-prefer-direct-macos-background-blur.md)                                             |
| 0031 | [Keep Linux installer choices small and local](0031-keep-linux-installer-choices-small-and-local.md)                           |
| 0032 | [Report native exec failures outside Terminal Payload](0032-report-native-exec-failures-outside-terminal-payload.md)           |
| 0033 | [Contain native resize failures](0033-contain-native-resize-failures-without-completing-sessions.md)                           |

## Related boundaries

- Tabs/chrome/close/native completion: 0016, 0017, 0027, 0028, 0032, 0033.
- Portable Surface/fonts/protocols: 0008, 0012, 0022, 0025.
- User-owned configuration and live application: 0002, 0003, 0025, 0029, 0030.
- Renderer privilege and explicit payload actions: 0006, 0009–0011, 0021, 0024, 0026.
- Native distribution, verification and installers: 0015, 0019, 0020, 0023, 0031.

The native minimum-size calculation omits the fixed 280 px Snippets Sidebar;
showing it in a narrow window can crowd out the grid. This layout bug is tracked
in [#570](https://github.com/luizomf/omxterm/issues/570). The
[window contract](../spec.md#window-and-session-behavior) describes the current
geometry and practical workaround.
