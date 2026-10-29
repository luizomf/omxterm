# Mirror Typing

Mirror Typing is an optional, separately installed **Linux ARM64 preview** for
copying typing to a fixed selection of live panes in one terminal tab. It requires
OMXTerm **0.24.0-dev.2 or newer within 0.24.x** and extension API **0.1.x**.
It is not bundled with the terminal; no catalog or release availability is implied.

## Install and start

1. Obtain a separately built `mirror-typing-0.1.0.omxext` archive from a trusted
   source. Open **Settings → Extensions**, install the local archive and review
   the normal trust prompt before enabling it. Extension trust is not sandboxing.
2. Open at least two live panes in one terminal tab. Focus the pane you want to
   start from, then invoke **Mirror Typing** through its installed extension action
   in the Command Palette.
3. Inspect the pane checkboxes. All eligible panes are initially selected; the
   originally focused pane is required and cannot be unchecked. Select at least
   two panes, counting that original pane. Titles are labels, not identities.
4. Choose **Start mirroring**. There is no extra confirmation. Core returns to the
   original tab and focused pane after hiding setup. Typing begins mirroring only
   when the core-owned **Mirroring typing · N panes · Stop** indicator is active.

Use **Refresh targets** to take a fresh snapshot of the original captured tab.
This replaces pending setup authority; it does not silently capture another tab.
A retained setup page refreshes when shown again. If its original source is gone,
focus a live pane and invoke the action again. A refused or lost Start result is
not retried automatically: check the terminal's status, then Refresh before
another deliberate Start.

## What gets copied

**Typing is copied exactly. Use matching terminal programs/modes. Paste, snippets
and drops stop mirroring and go only to their original pane. Input already sent
cannot be undone.**

Core copies the source pane's final encoded keyboard bytes, including typing,
composition commits, repeats, control/navigation/function keys and any emitted
key-release sequences. Encoding follows the **source mode**, not each recipient's
mode. Application-cursor, keypad or Kitty keyboard modes can interpret identical
bytes differently. Use similar interactive shells/programs with matching modes;
this does not synchronize shell state or guarantee equivalent behavior in arbitrary
SSH, tmux or TUI sessions. A terminal key such as bare Ctrl+V may cause each local
program to read its own clipboard; typing-only does not prevent program effects.
Mouse reports, focus reports, terminal replies and typing in graphical fields are
not mirrored. Extension code never receives keyboard payloads.

Any selected pane can become the source. New splits never join automatically.
Focusing an unselected pane or switching tabs stops the group. To change members,
open setup again, inspect the fresh selection and explicitly Start.

## Stop and recover

Use the always-visible **Stop** in core terminal content, including when title/tab
chrome is hidden. It does not depend on the extension page responding. Opening
setup or Settings, a selected pane ending/closing, window hiding/minimizing, or
local extension disable/update/uninstall also stops mirroring. Ordinary native
window blur does not end an active group, but no typing is admitted while unfocused;
blur during Start cancels that pending start.

A terminal Paste gesture, snippet Insert/Run or dropped path **stops first**, before
clipboard reads, confirmation or single-pane delivery. Existing Protected Paste
still applies. Cancelling paste leaves mirroring stopped; nothing resumes
automatically. Paste in a search or extension field is unrelated to terminal input.

Stop does not close shells, terminate programs, undo input already sent, or send
synthetic key releases. Writes to several PTYs are not an atomic transaction;
a write failure may occur after some panes received bytes. There is no replay or
rollback. A program that received a key press may not receive its later release.

Selections, setup tokens and active authority are memory-only: nothing is saved,
restored at startup or included in Saved Layout. Disabling in another application
instance does not promise instantaneous revocation here; local core Stop remains
available.

## Build from source

From a clean, committed checkout with installed locked dependencies:

```sh
node scripts/build-mirror-typing-extension.mjs
```

The builder needs the repository's supported Node.js version, installed `esbuild`,
Git and `python3` on PATH. Python uses only its standard library. It requires no
terminal, credentials, network service, native addon or Electron window. It bundles
the actual shared Settings page/control styles and UI tokens, rather than shipping
a separate visual kit. This preview uses the tokens' default palette; it does not
claim live host-theme propagation.

Outputs are `dist/extensions/mirror-typing-0.1.0.omxext`, `.omxext.sha256` and
`.omxext.json`. All refuse replacement. The receipt records source/tool identities
and archive digest; `qualification.status: "not-run"` is not installation or native
qualification. An optional output path and full source commit may be supplied as
literal positional arguments for a transported Git archive; that source identity
is explicitly recorded as `supplied-commit`, not a verified clean checkout.

Maintainers can exercise archive validation after the host capability is integrated:

```sh
OMXTERM_MIRROR_TYPING_BUILD=1 npm test -- test/unit/mirror-typing-build.test.ts
```

The archive includes the OMXTerm MIT license, its own `NOTICE`, and the full
AshyTerm MIT license. The workflow credits Rafael Ruscher (@ruscher), Community Big
and BigLinux for the broadcast-input contribution in PR #622; this is a narrower
adaptation, not a wholesale merge.
