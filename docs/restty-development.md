# Restty development candidate

OMXTerm has a temporary, unpackaged Restty 0.3.0 Terminal Surface candidate. The
normal development launch and every packaged launch still use xterm. This is a
migration aid, not User Configuration and not a second supported renderer.

After `npm ci`, opt in explicitly:

```sh
OMXTERM_TERMINAL_SURFACE=restty npm run dev
```

`OMXTERM_TERMINAL_SURFACE` accepts exactly `xterm` or `restty`. Any other value
fails startup. A packaged process refuses `restty` rather than activating the
candidate or falling back automatically.

## Current slice

The candidate uses the existing tabs, Electron Adapter and owned local PTYs. It
supports ordinary Unicode shell input/output, grid resize, focus, independent
tabs, Default Shell and `-e` command startup, shell exit, explicit close and
renderer-loss cleanup. It requires the bundled TTF, Ghostty WASM core and a real
WebGL2 backend before starting a PTY. Initialization failure starts no shell;
WebGL context loss reports a visible failure and disposes only the owning tab.

The following Restty routes are deliberately unavailable until their migration
tickets land: copy, paste, Protected Paste, snippets and file-path injection;
OSC 52 clipboard effects; OSC 8 or visible-link activation; parsed titles and
bell; Terminal Theme, configured fonts, spacing, scrollback, Option Key Mode,
font zoom, inline images and other runtime configuration. The xterm Surface
retains all existing behavior. There is no automatic xterm fallback.

## Pinned inputs and restoration

- Restty npm package `0.3.0`, source commit
  `3db45b0e10dbe53c52a77131d366f519546e4f04`;
- Ghostty submodule commit
  `0309af1b7f0724105a0805efa88bbee808a616ae`;
- `text-shaper` `0.1.28`, source commit
  `a23058f475f2b0655b93a89bfce426eecafb9439` (Restty's source submodule at
  `94db4fba9186b99b868b401ce404a9930b93fcbf` is upstream prior art, not the
  installed npm artifact identity);
- Nerd Fonts `v3.4.0` `JetBrainsMono.zip`, archive SHA-256
  `76f05ff3ace48a464a6ca57977998784ff7bdbb65a6d915d7e401cd3927c493c`;
- bundled `JetBrainsMonoNerdFontMono-Regular.ttf`, SHA-256
  `f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c`.

`assets/restty-sources.json` records the npm registry's package-to-commit
`gitHead`, tarball integrity and SHA-1 metadata together with Restty's source
tree and exact submodule entries. To audit the mapping independently, compare
`npm view restty@0.3.0 gitHead dist repository --json` and
`npm view text-shaper@0.1.28 gitHead dist repository --json` with that tracked
manifest, then inspect the exact Restty tree with:

```sh
git clone https://github.com/wiedymi/restty.git
cd restty
git checkout 3db45b0e10dbe53c52a77131d366f519546e4f04
git submodule update --init --recursive
git rev-parse HEAD^{tree}
git ls-tree HEAD reference/ghostty reference/text-shaper
```

The lockfile restores the npm tarballs identified by that manifest. `npm ci`
then runs `scripts/prepare-restty-runtime.mjs`, which accepts only the reviewed
Restty runtime SHA-256 and produces corrected SHA-256
`8f9620d4c39b9e88bb149010e8aad24b0c35073373c2d8a66d78466ccbafec2a`.
The narrow correction makes font-load failure reject initialization and disables
Restty's direct clipboard/OSC 52 and link-opening callbacks. Unknown dependency
bytes fail instead of receiving a best-effort patch. Reinstall with `npm ci` to
restore and reapply the reviewed bytes; do not edit `node_modules` manually.

The TTF is tracked because Restty/text-shaper consumes font bytes and the prior
WOFF2 path did not provide equivalent shaping. `assets/fonts/README.md` records
font provenance and checksums. Runtime loading is memory-only and works under the
production `connect-src 'none'` CSP without local fonts, user dotfiles or remote
fetches. Packaged license texts are listed in `THIRD_PARTY_NOTICES.md`.

`test/integration/restty-host-integration.test.ts` runs the real main IPC
router, preload bridge, Electron Adapter, Restty Surface and owned macOS PTYs in
one fixture. It covers Unicode input/output, resize, focus return, two isolated
tabs, Default Shell and explicit-command startup, shell exit, explicit close,
renderer-process loss, and candidate-route refusal without using a user session
or clipboard.

Native runtime evidence for this first slice is macOS ARM64. Linux and Windows
Restty behavior remains unverified; their xterm package contract is unchanged.
