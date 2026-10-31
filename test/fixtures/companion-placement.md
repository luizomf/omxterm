# Panel placement source fixture

This fixture is **unqualified until a separately recorded native run succeeds**.
Headless controls validate its oracles and input cleanup, not native behavior.

`test/integration/ssh-packaged.test.ts` accepts
`OMXTERM_SSH_PACKAGED_PLACEMENT=1` only with
`OMXTERM_SSH_PACKAGED_SOURCE`. It rejects combined, catalog and appearance modes.
Keep the existing source-mode archive digest, application version, extension
version and evidence variables. The staged source must have a matching fresh
production build and exact SSH/Files archives. Never substitute an old build for
changed renderer code.

The opt-in installs the two local archives through production Settings and runs
one synthetic live SSH client. It bypasses the broad SSH/shortcut scenario while
retaining its inspector, isolated configuration, owned-process supervision,
normal Quit and failure-profile retention. Files must finish its initial directory
listing before draft capture; no Files mutation campaign is replayed. There is no
real SSH connection, package qualification or public catalog request.

Run only on an assigned idle Linux ARM64 X11 desktop with verified scale 1,
`DISPLAY` and `XAUTHORITY`, XTEST, `/usr/bin/xdotool`, `/usr/bin/python3`, and
`libX11.so.6`. The outer runner must inspect the full launcher/helper graph and
reserve the desktop before execution. Native clicks use actual content-screen
coordinates, never direct child input injection. Separator input is synthetic
Chromium input; neither route proves physical input behavior.

`placement-scenario.json` records the exact required groups, measured DOM/native
bounds, retained identities and focus, input receipts and completion status.
`placement-input-ownership.json` is a write-ahead recovery marker for button 1
and the `x` key on the assigned display. Normal cleanup independently releases
both, checks `XQueryPointer` and `XQueryKeymap`, then removes the marker. An outer
runner must inspect retained markers on interruption, release only owned input
on that same lane, and preserve the failed result. Never remove an unresolved
marker or turn recovery into a successful test result.

The built-in counterpart remains `test/integration/auxiliary-panel.test.ts`.
Its fixture-only built-in policy also applies on ARM64. Both sides retain the
same draft/caret/focus/Surfaces; resize directions are tested on both sides,
followed by existing compact/overlay/chrome cases on the left. Software WebGL2
may be explicitly selected with `OMXTERM_AUXILIARY_SOFTWARE_RENDERING=1`; this
is not hardware GPU or shipping Windows/x64 qualification.

The suites must run sequentially. Preserve source/build/runtime identities and
all supervisor/Quit receipts. Native results, cleanup and evidence acceptance
remain the caller's responsibility; no automatic retries.
