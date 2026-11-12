# Verify exact NSIS only in authorized disposable VMs

Windows release verification exercises the exact NSIS installation seam:
unpacked startup or archive extraction cannot establish the installed payload,
registration, startup or cleanup behavior.

A temporary `/D=` destination does not isolate NSIS application identity.
The pinned installer can remove a registered old version and change shared
registration and shortcuts. Environment/profile overrides do not isolate these
Windows effects. Treating a destination directory as a sandbox is unsafe.

The verifier therefore defaults to refusing installation and requires a literal
CLI opt-in for an explicitly authorized disposable VM with a recoverable
snapshot. It inspects the reviewed installer identity's HKCU/HKLM registration
in both views, default locations, shortcuts and conflicting processes. Unknown
inspection and live process conflicts remain refusals even with consent.
Intentional replacement supports only known per-user registration; it never
executes an arbitrary registry-supplied command itself. Inspection is necessary
but does not eliminate host races or installer-wide effects, so the disposable
VM requirement also applies to an apparently clean host. The pinned NSIS
template copies the installer to `%LOCALAPPDATA%\omxterm-updater` for
electron-updater, independently of `/D=`. OMXTerm has no auto-updater, so its
NSIS include deletes that copy at the end of installation. A pre-existing cache
is refused rather than assigned to this transaction or overwritten, since the
installer would delete it. The verifier then requires the cache to be absent
after installation and after uninstallation, and never removes one itself.

Before executing NSIS, the transaction resolves only its newly created temporary
installation directory to a native long path. Windows `TEMP` may contain an 8.3
profile alias while Shell shortcuts return long names. The created and resolved
paths must remain real directories with the same bigint device/inode identity;
a missing identity, reparse root or changed object fails closed. The resolved
path must also satisfy the original NSIS quoting and no-spaces constraints.
Both original and resolved spellings receive the stock ancestor/tree reparse,
process-prefix and cache inspection before launch, so resolution cannot hide an
unsafe original ancestor or miss a canonical process prefix. NSIS `/D`, expected
registration, shortcut target and owned-uninstaller arguments then use that one
resolved spelling. Existing registrations, commands, caches and unrelated
shortcuts are **not** canonicalized to make their ownership checks pass. This
bounded observation does not eliminate filesystem or installer-wide races.

The transaction binds installer bytes to their digest, compares installed
payload bytes, verifies installed startup, and invokes only its owned new
uninstaller after confirming registration ownership. A byte-identical copy runs
outside the install-path termination prefix, with `_?=` selecting the owned root
and preventing a detached relaunch. This avoids NSIS terminating its own
in-place uninstaller through its PowerShell process check. Bounded cleanup must remove
registration, shortcuts, default installation and processes. Their absence alone
does not prove payload removal at the custom `/D=` destination. The transaction
then requires that destination to be absent or a real empty directory, removed
only with non-recursive `rmdir`. Any remaining entry (including unexpected files
or directories), non-directory root or inspection/removal error fails verification
and preserves residual payload and the relocated-uninstaller tree for inspection.
The verifier never recursively deletes the installation destination to make an
uninstall pass. Only after the proof succeeds is the relocated-uninstaller tree
recursively removed.
Failures preserve primary and cleanup errors and retain uncertain state for
inspection. User data is never selected for deletion. The old application is
not restored by this test; snapshot recovery is a separate environment action.

Unpacked diagnostics remain available as partial verification. The exact-installer
check costs a disposable native VM and a review of the inspection footprint
when packaging inputs change.
