# Mirror Typing production fixture — root-owned native run

Preparation tests do **not** qualify the native scenario. Run this opt-in selector
only on an assigned, idle, unlocked **Linux ARM64** desktop as an ordinary user,
one graphical suite at a time. No guest is chosen by the fixture. Do not run it on
the owner's working desktop.

## Inputs and exact command

Use a committed candidate containing this fixture, host **0.24.0-dev.2**, fresh
locked dependencies and its normal `npm run build` outputs. Native dependency and
build preparation belongs to the root's separately authorized campaign, not this
fixture. The supplied archive remains separate and unchanged; the fixture never
rebuilds it. Use its inspected SHA-256 and retain its original build receipt.

The root must verify source transport/commit correspondence and build provenance
before execution. `SOURCE_COMMIT` is explicitly caller-attested, not proof of a
clean Git checkout. Preparation hashes `src/`, `extensions/`, `scripts/`, `test/`,
`package.json`, `package-lock.json`, `build.mjs`, and every regular file in `dist/`.
The observer bundle and each of its source inputs receive separate hashes. These
identify the bytes actually consumed; they do not prove the supplied host was
built from those source bytes. Dependency/runtime qualification remains separate.

The account shell must be sh/bash at `/bin` or `/usr/bin`. `python3` on PATH is
required for the synthetic raw-byte receiver in each real PTY. The existing
production-support helper retains the account's actual login shell and system
startup, redirecting account home and profile into the supervisor-owned temp
root. Its inherited `OMX_LAYOUT_READY` marker is merely shell readiness, not
Mirror evidence. No interactive stdin/TTY is needed by the runner.

Provide the assigned desktop's actual `DISPLAY` and, where needed, `XAUTHORITY`,
`XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `WAYLAND_DISPLAY`, ordinary-user
PATH and writable TMPDIR. Existing native terminal/font prerequisites apply.
The test resolves Electron from `SOURCE/node_modules`; do not substitute a global
Electron. Run from the same candidate checkout used for SOURCE and the observer.

```sh
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS -u APPIMAGE -u APPDIR \
  OMXTERM_MIRROR_NATIVE_SOURCE="$PWD" \
  OMXTERM_MIRROR_NATIVE_SOURCE_COMMIT=INSPECTED_40_CHARACTER_COMMIT \
  OMXTERM_MIRROR_NATIVE_ARCHIVE=/absolute/artifacts/mirror-typing-0.1.0.omxext \
  OMXTERM_MIRROR_NATIVE_ARCHIVE_SHA256=INSPECTED_LOWERCASE_SHA256 \
  OMXTERM_MIRROR_NATIVE_EVIDENCE=/absolute/evidence/mirror-native \
  node node_modules/vitest/vitest.mjs run test/integration/mirror-extension.test.ts
```

All five variables are mandatory once any is set; an unconfigured default suite
skips this test. Paths must be absolute. Every invocation creates a new evidence
`run-*` directory. The payload deadline is **150 seconds**, the outer test deadline
**210 seconds** including independent supervisor settlement, and individual
condition waits **15 seconds**. There are no sleep-based exclusion assertions.
An elapsed deadline is a failure, not permission to repeat the command.

## Scenario and oracles

- Real Settings local archive install, explicitly **synthetic chooser and trust
  acceptance**, then Disable/Enable without starting code. The archive digest is
  checked in the real trust prompt. No native chooser-widget qualification.
- Three real same-tab PTYs and production Surfaces. Actual setup lists all three;
  the required original pane and second pane stay selected, third is unchecked.
  Start uses the real page action. Core active status, actual native view hidden
  state and original pane DOM/native focus are checked before input.
- `sendInputEvent` keyDown/char/keyUp gestures for `a` and `b` traverse Chromium and
  the production encoder, first from pane 1 then pane 2. No direct Mirror IPC or
  `insertText` is used as mirrored keyboard evidence. `insertText` is used only to
  launch the raw receiver before Start. Synthetic Chromium events are not physical
  keyboard, OS input injection, IME or arbitrary terminal-mode qualification.
- Each receiver enters kernel raw mode and emits a hex acknowledgement for every
  byte it reads. Positive expected delivery is awaited, then an independent `|`
  is written directly to **each** native PTY as an observation fence. Every peer
  must acknowledge that byte; complete observed native writes and raw receipts
  must equal the exact cumulative expected sequence. Thus a dead or unobserved
  peer cannot satisfy an empty-peer assertion. Direct fences are explicitly not
  evidence of keyboard routing. They follow acknowledged production fanout/local
  delivery, which completes main's synchronous write loop before the fence.
- Hide both chrome rows using production menu actions; verify core Stop reserves
  content space, click it, and prove later `c` goes only to the last source. A new
  setup action and Start are required before further mirroring.
- Production terminal Paste receives synthetic `paste-local` from the guest
  clipboard. A passive main IPC listener, registered after production's handler,
  observes semantic Stop before the actual native local write. The semantic core
  notice must appear, peer/control receive no paste bytes, and later keyboard `d`
  stays local. This covers terminal Paste, not the whole snippet/drop matrix.
- Deliberately Start again, then terminate the real extension backend with SIGTERM
  to exercise lifetime loss. Require stopped core authority, actual backend close
  and hosted WebContents destruction. Original PTY and canvas identities survive;
  keyboard `e` remains local after retirement. The backend's deliberate signal is
  fault injection, not a claimed successful extension shutdown.
- Normal `app.quit()` joins all three real native PTY exits and the backend close.
  Existing `runNativeFixture` independently requires main exit 0, no signal,
  reason `exit` and empty cleanup errors. A stdout marker alone is insufficient.

Only the existing exported restoration production-support helpers, artifact list,
Chromium argument policy and native supervisor/ownership infrastructure are reused.
They already provide the needed built-main observation, isolation, UI actions and
process registration. No shared helper or product code is changed; no second host,
router, Surface, runtime, or general harness is introduced.

## Output and acceptance

Keep the whole attempt, including failures:

- `inputs.json`: host version, caller-attested commit, source manifest/digest,
  separate archive SHA-256, built artifact hashes, explicit synthetic scope.
- `observer-build.json`: observer bundle SHA-256 and source-input hashes.
- `setup.png`: actual en-US setup, three synthetic pane labels and selected pair.
- `active-hidden-chrome.png`: actual active en-US core status/source/member marks,
  visible Stop and top-row reservation with title/tab chrome hidden.
- `scenario.json`: completed checks, trust count, exact cumulative raw-byte fences,
  semantic Stop-before-write observation, PTY/backend actual exit facts and Quit.
- `supervisor.json`: runner result/stdout/stderr and independent settlement facts.

Root must inspect **both PNGs** for readable labels/status/Stop, source/member
clarity, focus, and unobscured terminal text. Geometry checks are not visual review.
No pt-BR, packaged artifact, hardware, IME or mismatched-mode claim is made.
Preparation failure or abrupt native termination may leave only partial outputs;
missing evidence is not a pass. Retain `.scratch/native-fixtures/` supervisor and
ownership records. Never clear a failed ownership guard or overwrite failed
artifacts to obtain a rerun. Diagnose before any separately authorized retry.

Focused **headless preparation only** (no Electron launch, build, guest or GUI):

```sh
node node_modules/vitest/vitest.mjs run test/unit/mirror-native-preparation.test.ts
```

These checks bundle observers against deliberately nonexecutable placeholder host
files, verify hashes/no-clobber behavior and input rejection, and reject corrupted
receipts (including false empty peers, duplicate bytes and unsettled retirement).
They do not establish that any native stage or screenshot has succeeded.
