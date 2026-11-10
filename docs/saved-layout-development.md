# Saved Layout — Linux ARM64 preview

Saved Layout **0.1.1** is an optional, separately installed extension for host
**>=0.24.0-dev.1 <0.26.0**, with preview API **^0.1.0**. The host's explicit
0.24.1-dev.N and 0.25.0-dev.N compatibility bridges also admit this range.
The 0.26.0-dev.N bridge does not: the range excludes its 0.26.0 endpoint, so
current 0.26.0-dev.1 source refuses this unchanged package. Other prerelease
families follow ordinary semver rules. It is not bundled, automatically
installed, or a stable SDK. This change does not publish an archive or catalog
entry. Build instructions below are for developers; install a separately
provided `.omxext` through Settings → Extensions using the ordinary code-trust
prompt. Enabling it does not run code until its **Saved Layout…** action opens.

## Save and open

The application page offers **Save this window / Replace saved layout**,
**Open in a new window**, **Forget saved layout**, and **Refresh**.

Save explicitly includes the originating window's ordered terminal tabs,
weighted splits, focused panes, terminal selection and available local folders.
Settings and extension pages are excluded and counted. Save is live at the
moment of capture, not frozen when the page opened. With graphical content
selected, the most recently selected surviving terminal tab is remembered.
There must be at least one terminal tab. Limits are 16 terminal tabs, 16 panes
per tab, 32 total panes and a 256 KiB document; excess refuses the whole request.

Open uses the exact snapshot loaded by that page, creates **one new window**,
and starts fresh Default Shells. Current terminals and their work stay open.
All restored panes start, including background tabs, through ordinary Surface
initialization; none is a dummy shell. The core status reports initializing,
completed or partially opened mounts and folder-fallback counts. A failed pane
uses ordinary startup/failure acknowledgement; healthy panes remain. Resizing
recovers space when the saved proportions cannot fit comfortable grids.

Keyboard Open waits until Enter is released; blur, hiding or a lost release
cancels the undispatched gesture. Pointer Open is immediate. A delayed new
window is shown inactive when the original focus intent no longer survives.
Accepted means core owns the new window, not that every shell has mounted.

No output, scrollback, title, environment, command, foreground process or SSH
target is saved. No `cd`, `clear`, Enter, integration hook or saved command is
injected. Shells still run their normal startup files. There is no automatic
SSH reconnect, process resurrection, startup restore, autosave, named profile,
window-placement recovery or migration of old fork `workspace.json` files.

## Folder provenance is not current-process inspection

The page distinguishes main-observed **reported-local** OSC 7 paths from
**launch-local** paths known when a Default Shell started without a report, and
**home** slots. A remote, invalid or overlong report invalidates launch fallback;
a later valid report may replace it. Known SSH Connect, explicit `-e`, ended,
failed and not-yet-started panes become home-directory shell slots.

OMXTerm does not inspect process cwd or authenticate OSC 7 locality. A program or
manually typed SSH session can emit a local-looking report. Launch-only folders
may be stale after a shell changes directory; startup files can also change cwd.
Capture clones renderer structure and then samples main's directory provenance,
not an atomic filesystem/process snapshot.

Open revalidates bounded absolute paths and directory usability asynchronously.
Missing/unavailable folders fall back to account home, with a count and no folder
creation. A disappearance after validation is an ordinary launch failure, not an
automatic second spawn. Windows UNC/device paths and cross-platform documents
are rejected. Symlinked local folders are allowed; OS-mounted folders and normal
shell startup may access networks. “Local” means interpreted on the OMXTerm
machine, not a promise of network-free I/O.

## Persistence, conflicts and forgetting

The backend's declared `state.v1` adapter stores one document at
`<Electron userData>/extension-state/omxterm.restoration/state.json`, separately
from `config.json` and immutable installed archives. On this Linux preview,
Electron normally places userData under `$XDG_CONFIG_HOME/omxterm` (or
`~/.config/omxterm`); an application profile override changes that location.
Paths and terminal data never become operational logs.

Save and Forget use short native exclusive leases and opaque revision
compare-and-replace. Another window/process's newer save wins over stale choices;
**Refresh** before making a new deliberate choice. A possible write followed by
transport loss is **outcome unknown**, never automatically replayed. Invalid
schema data with a readable revision can be explicitly replaced or forgotten;
unreadable, malformed state envelopes and oversized files require external
correction. Reads never repair, quarantine or migrate files.

Disable, update and uninstall retain saved data. Forget replaces the **active
snapshot** with a revisioned empty tombstone; it is not forensic erasure.
Interrupted writes may leave private `state-<UUID>.tmp` siblings containing an
older snapshot and paths. To remove those deliberately, close **all OMXTerm
instances**, inspect the extension's state directory, and remove those sibling
temp files. Do not remove/recreate `state.lock` while any instance is running.
POSIX-created directories/files use 0700/0600; no Windows ACL or universal
power-loss durability claim is made. The helper is correctness infrastructure,
not a sandbox for trusted extension code.

## Development and evidence

```sh
npm run build:restoration-extension -- /absolute/output/restoration-0.1.1.omxext
```

### Source compatibility follow-up (#785)

The 0.1.0 source manifest stopped below stable 0.25.0, so the existing minor-dev
bridge correctly refused it on host 0.25.0-dev.4. Version 0.1.1 extends only the
source archive's upper bound to 0.26.0; it does not weaken global admission or
modify any historical archive. The extension ID, saved-document version, CAS
state location and capabilities are unchanged, so updating retains saved data
without migration or implicit replacement.

The audit from #673's integrated host `c1a09dd1906414c03a24fc58dc0e554098e39f00`
to the #785 baseline `57adbe391eda3abdbf66ee1a72191c2d672a2461` found no
changes to the layout codec, directory provenance/transfer, state adapter,
bootstrap protocol or extension payload. Shared view dispatch/presentation and
window-owner cleanup did change. Those paths require fresh bounded production
lifecycle evidence on the current host, not reuse of the old native receipt.
The original #673 qualification retains only its historical host/archive scope;
this follow-up is not a new cross-platform or packaged-host qualification.

The separate archive contains its MIT license, Community Big MIT notice and
adaptation credit for @ruscher's #622 layout work. Host and archive source
identities, digests, actual checks and limits must accompany delivery. See
[ADR0042](adr/0042-save-layouts-without-restoring-sessions.md). Headless
codec/page/storage tests and prepared native bundles do not establish graphical
or native qualification. Other-platform preview support and release/catalog
publication remain separate work.
