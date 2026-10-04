# Architecture decision records

These records explain the current architecture and its tradeoffs. ADRs,
specifications, contracts and guides evolve with the product; they are not
immutable constraints or mandatory future implementation plans. Replace obsolete
competing guidance in place, retaining useful rationale and links. Git preserves
historical text. Use a new ADR when a distinct durable decision needs its own
explanation, not merely to append a correction that leaves old guidance active.

The [product contract](../spec.md) owns observable behavior. An ADR describes the
selected architecture and states actual limitations separately from its goals.
A source/spec discrepancy is not automatically a code bug, accepted behavior or
release blocker. Independently supported defects receive focused follow-up work;
editing this documentation does not repair them or supply missing execution
evidence.

**Current** records incorporate relevant later decisions; readers need not merge
old amendments mentally. **Superseded** records are short pointers, not competing
rules. Historical filenames are retained for existing links.

| ADR  | Decision                                                                                                                       | Status     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 0001 | [Use Electron for the desktop runtime](0001-electron-for-the-desktop-runtime.md)                                               | Current    |
| 0002 | [Store user configuration under XDG_CONFIG_HOME](0002-xdg-for-user-configuration.md)                                           | Current    |
| 0003 | [Keep user configuration strict and non-mutating](0003-strict-non-mutating-user-configuration.md)                              | Current    |
| 0004 | [Log the operational envelope, not terminal payload](0004-log-the-operational-envelope-not-terminal-payload.md)                | Current    |
| 0005 | [Keep OMXTerm and OMXTerm Web independent](0005-keep-omxterm-and-omxterm-web-independent.md)                                   | Current    |
| 0006 | [Isolate the renderer from local capabilities](0006-isolate-the-renderer-from-local-capabilities.md)                           | Current    |
| 0007 | [One session per window: replaced by tabs](0007-one-live-session-per-independent-window.md)                                    | Superseded |
| 0008 | [Make the Terminal Surface the portable module](0008-make-the-terminal-surface-the-portable-module.md)                         | Current    |
| 0009 | [Keep clipboard access explicit and one-way](0009-keep-clipboard-access-explicit-and-one-way.md)                               | Current    |
| 0010 | [Keep terminal titles display-only](0010-keep-terminal-titles-display-only.md)                                                 | Current    |
| 0011 | [Validate external links at main](0011-validate-external-links-at-the-main-process.md)                                         | Current    |
| 0012 | [Use standard xterm terminal capabilities](0012-use-standard-xterm-terminal-capabilities.md)                                   | Current    |
| 0013 | [Do not inject shell integration](0013-do-not-inject-shell-integration.md)                                                     | Current    |
| 0014 | [Release under the MIT License](0014-release-under-the-mit-license.md)                                                         | Current    |
| 0015 | [Publish tested releases without verified publisher identities](0015-publish-tested-unsigned-arm64-releases.md)                | Current    |
| 0016 | [Adopt tabs with one live session per tab](0016-adopt-tabs-with-one-live-session-per-tab.md)                                   | Current    |
| 0017 | [Confirm close only for Busy Sessions](0017-confirm-close-only-for-busy-sessions.md)                                           | Current    |
| 0018 | [Deliver menu-refused accelerators in main](0018-deliver-menu-refused-accelerators-in-main.md)                                 | Current    |
| 0019 | [Support native ARM64 releases with risk-based evidence](0019-support-native-arm64-releases-on-macos-linux-and-windows.md)     | Current    |
| 0020 | [Default Linux rendering to X11](0020-default-linux-rendering-to-x11.md)                                                       | Current    |
| 0021 | [Insert lexical shell-quoted paths through Protected Paste](0021-insert-lexical-shell-quoted-paths-through-protected-paste.md) | Current    |
| 0022 | [Render bounded Kitty images in direct sessions](0022-render-bounded-kitty-images-in-direct-sessions.md)                       | Current    |
| 0023 | [Verify exact NSIS in authorized disposable VMs](0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)                  | Current    |
| 0024 | [Disable the Chromium sandbox on Linux](0024-disable-the-chromium-sandbox-on-linux.md)                                         | Current    |
| 0025 | [Use Restty as the sole Terminal Surface](0025-stage-restty-behind-an-unpackaged-opt-in.md)                                    | Current    |
| 0026 | [Preview explicitly activated local images](0026-preview-explicitly-activated-local-images.md)                                 | Current    |
| 0027 | [Hide Window Chrome without replacing sessions](0027-hide-window-chrome-without-replacing-sessions.md)                         | Current    |
| 0028 | [Wait for native sessions before application quit](0028-wait-for-native-sessions-before-application-quit.md)                   | Current    |
| 0029 | [Compose background effects with explicit cell identity](0029-compose-background-effects-with-explicit-cell-identity.md)       | Current    |
| 0030 | [Prefer direct macOS background blur](0030-prefer-direct-macos-background-blur.md)                                             | Current    |
| 0031 | [Keep Linux installer choices small and local](0031-keep-linux-installer-choices-small-and-local.md)                           | Current    |
| 0032 | [Report native exec failures outside Terminal Payload](0032-report-native-exec-failures-outside-terminal-payload.md)           | Current    |
| 0033 | [Contain native resize failures](0033-contain-native-resize-failures-without-completing-sessions.md)                           | Current    |

## Related boundaries

- Tabs/chrome/close/native completion: 0016, 0017, 0027, 0028, 0032, 0033.
- Portable Surface/fonts/protocols: 0008, 0012, 0022, 0025.
- User-owned configuration and live application: 0002, 0003, 0025, 0029, 0030.
- Renderer privilege and explicit payload actions: 0006, 0009–0011, 0021, 0024, 0026.
- Native distribution, verification and installers: 0015, 0019, 0020, 0023, 0031.

Known #566 boundaries are described where owned: reload application failure in
0003; first-tab command registration and conditional exit notification in 0016;
CPR, pending family acquisition and font-error redaction in 0012/0025;
post-commit installer cleanup in 0019/0031; and bounded historical/exact-helper
evidence in 0019. These are limitations and evidence gaps, not newly desirable
architecture. The native window minimum-size calculation also omits the fixed
280 px Snippets Sidebar, so showing it in a narrow window can crowd out the grid;
see the current [window contract](../spec.md#window-and-session-behavior).
