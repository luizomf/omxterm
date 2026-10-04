# macOS direct-blur integration evidence

Historical issue #415 evidence from an uncommitted candidate based on
`bec1ee6734c50f5725a148af58e68cdb4dfefd87`. Direct blur was subsequently shipped in
[0.17.0](../releases/0.17.0.md). This record is candidate integration evidence,
not a current release, installation or cross-version compatibility claim.
[ADR 0030](../adr/0030-prefer-direct-macos-background-blur.md) records the production
decision.

## Environment and scope

- macOS 27 ARM64, Electron 43.1.1, Apple clang and SDK 27.
- Production addon: Node-API v8, ARM64, minimum macOS 12.0. The deployment floor
  was checked in Mach-O metadata, not inferred from the build host.
- Only isolated, owned fixtures and local worktree build outputs were used.
  No user configuration, shell, prototype, installed application or other app
  was changed. Native fixtures use synthetic Terminal Surface output and no PTY;
  the separate package verifier uses its existing owned synthetic PTY command.

## Observed boundaries

- Real ESM-relative optional loading, native enable/reset return 0, idempotent
  reset, exact argument count/boolean/Buffer size, foreign/stale pointer rejection,
  hidden-window rejection and worker-thread rejection.
- The runtime's `napi_is_buffer` also accepted a Uint8Array containing valid
  handle bytes. Requiring Node Buffer identity in addition to the N-API byte
  check closed that gap; the regression uses those exact valid pointer bytes.
- Electron's `show` event was sometimes absent despite `show()` making the
  window visible. Startup now uses registration -> `ready-to-show` -> owner
  `show()` -> native apply, not an event-only assumption. The fixture uses that
  production sequence and verifies no native enable before visibility.
- Live tint changes, off/zero reset, hide/show, native maximize/unmaximize,
  minimize/restore, current/future independent windows and closed lifetimes
  preserve existing window/webContents/Surface identity.
  Real WebGL readback retains implicit alpha 0, explicit RGB alpha 255, opaque
  glyph pixels, the same canvas, one synthetic session start and one disposal.
  These readbacks establish renderer semantics, **not desktop blur**.
- Unit fault injection covers absent/throwing modules, unavailable symbols,
  throwing/nonzero calls, HUD fallback, failed-reset uncertainty and later
  explicit retries. Uncertain cleanup never stacks another material. Windows
  Acrylic/opaque and Linux X11 behavior retain their existing tests.
- A bounded optional fullscreen control completed native entry and exit in
  **both HUD and direct modes**, with true fullscreen state on entry and false
  on exit, and unchanged canvas/opaque-cell checks. This is one native comparison,
  not proof that the earlier prototype failure was caused or fixed by blur.

## Verification commands

```sh
npx vitest run test/unit/window-background-effects.test.ts \
  test/unit/macos-blur-build.test.ts \
  test/unit/packaged-application-verifier.test.ts \
  test/integration/macos-window-blur.test.ts
OMXTERM_TEST_MACOS_FULLSCREEN=1 npx vitest run test/integration/macos-window-blur.test.ts
```

Both focused runs passed; supervised fixture cleanup reported no errors.

- `npm run check:portable`: **PASS**, 113 test files passed, 6 skipped;
  1,104 tests passed, 28 skipped. Formatting, lint, typecheck and build passed.
  The first full run rejected the updated packaging YAML against the old strict
  Windows installer-input fingerprint. Review confirmed only the macOS addon
  unpack rule and Linux/Windows exclusion changed; the fingerprint was repinned,
  not relaxed. The Windows transaction/refusal tests and final full run passed.
  No Windows installer was executed.
- `npm run build` followed by
  `npx electron-builder --config electron-builder.yml --mac --arm64 --dir --publish never`:
  **PASS**, local unpacked app only. No DMG, release or installation was produced.
- `npm run package:verify`: **PASS**, packaged ESM-relative addon loading through
  ASAR, ARM64/minimum-OS inspection, ad-hoc seal, and actual packaged synthetic
  PTY startup/parsed-output proof with blur requested. Four safe operational
  events; owned profile/process cleanup completed. The verifier's `FULL` label
  covers its unpacked-app checks here, not a DMG or release qualification.
- `codesign --verify --deep --strict`: **PASS**. The unpacked addon itself also
  reports an ARM64 ad-hoc signature, no Team ID. No signing entitlement changed.

Historical local app location: `release/mac-arm64/OMXTerm.app` (not a guaranteed
retained path in today's checkout). Exact candidate packaged identities:

| File within `Contents/Resources`                     | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `app.asar`                                           | `85685e616667f1a56802af7ef79d3094bda10bdd78939a0f7561423b8de48c75` |
| `app.asar.unpacked/dist/main/macos-window-blur.node` | `749d790055a0a7282bea5390879b900ab29df4d40f7b45339bdf55dd0dc7420f` |

The development addon is 53,176 bytes. These are local uncommitted-candidate
artifacts, not downloadable release identities. Build and verification logs,
fixture outcomes and checksum records remain in the worktree's ignored
`.scratch/macos-blur/` and `.scratch/native-fixtures/` directories. No owned test
process remains active; the accepted external prototype was left alone.

## Limits

Only macOS 27 ARM64 was available. Older supported macOS versions, other GPUs,
private-symbol changes, accessibility/compositor policy and long-term effects
remain unverified. The accepted prototype's owner-provided wallpaper comparison
selects the visual design; no new compositor screenshots or quantitative visual
parity claims are made for this candidate. API success is not visible-effect
proof. Mission Control bounds and transient composition are deliberately outside
this issue. No global observer, capture or geometry workaround was added.
