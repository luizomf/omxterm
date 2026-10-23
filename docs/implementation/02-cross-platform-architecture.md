# Cross-platform architecture

OMXTerm keeps its original process model while adding AshyTerm's features.
Every privileged capability stays in Electron main; the renderer is a
context-isolated page without Node integration (`sandbox: true`; the
Chromium OS sandbox itself is off on Linux, see
[ADR 0024](../adr/0024-disable-the-chromium-sandbox-on-linux.md)) that only
sends validated intents.

## Process boundaries

| Layer                   | Owns                                                                                                                                                                | Never does                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/main/`             | PTYs (`node-pty`), process launch, Application Data documents, the Credential Store, native dialogs and menus, PATH lookups, OpenSSH argument construction, backups | Interpret terminal output                                     |
| `src/preload/`          | One frozen `window.omxterm` object (`terminal`, `sessions`, `highlights`, `commands`, `backup`); validates every payload in both directions                         | Expose `ipcRenderer` or Node APIs                             |
| `src/renderer/`         | Tabs, the split-pane layout, sidebars (Snippets, Sessions, Commands), modals, the output highlighter                                                                | Spawn processes, read files, see file paths chosen in dialogs |
| `src/terminal-surface/` | Restty/Ghostty rendering and input; receives a session Adapter and optional hooks (`transformOutput`, `onUserInput`, `onWorkingDirectory`, `retainOnExit`)          | Import Electron, `node-pty` or renderer modules               |

Launches are intents: the renderer sends `{kind: "inherit", sessionId}`,
`{kind: "saved-session", id}` or `{kind: "quick-ssh", target}` and main
resolves programs, arguments, directories and environment
([ADR 0006](../adr/0006-isolate-the-renderer-from-local-capabilities.md) and
[ADR 0036](../adr/0036-run-saved-ssh-sessions-through-the-system-openssh-client.md)).

## Persistent state

- **User Configuration** (`config.json`, `snippets.json`, `themes/`) stays
  user-authored and hot-reloadable.
- **Application Data** (`sessions.json`, `highlights.json`, `commands.json`)
  is written only by OMXTerm through `createApplicationDocumentStore`: a
  versioned `{version, data}` envelope, atomic write-then-rename, a 4 MiB cap,
  quarantine of corrupt files to `.corrupt-<time>`, and newer versions left
  untouched ([ADR 0034](../adr/0034-store-application-data-beside-user-configuration.md)).
  Each document has a service that serializes mutations and notifies every
  window.
- **Secrets** go only to the Credential Store (`safeStorage`), which refuses
  Linux's `basic_text` fallback. No feature stores a secret yet: SSH
  passwords are typed at ssh's own prompt.

## Platform adapters

| Concern            | Linux                                     | macOS               | Windows                              |
| ------------------ | ----------------------------------------- | ------------------- | ------------------------------------ |
| Default shell      | account shell                             | account shell       | `windowsShell` or Windows PowerShell |
| Executable lookup  | PATH, no shell                            | PATH, no shell      | PATH × PATHEXT, no shell             |
| SSH client         | `ssh`                                     | `ssh`               | `ssh.exe` (Windows OpenSSH)          |
| Connection reuse   | ControlMaster in a private `%C` directory | same                | not offered (no Unix sockets)        |
| Path rules in argv | `path.posix`                              | `path.posix`        | `path.win32`                         |
| Command quoting    | POSIX single quotes                       | POSIX single quotes | PowerShell single quotes             |
| Working directory  | `/proc/<pid>/cwd`, OSC 7                  | OSC 7               | OSC 7                                |

Platform values are injected (`platform`, `homeDirectory`, `env`) so every
adapter is unit-tested for all three systems on any host. Native suites gate
on the host architecture through `isNativeTestArchitecture`, so x64 and arm64
runners execute the same tests ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).

## Startup

`readStartupCommandLine` parses OMXTerm's options before the application is
ready. `--help` and `--version` exit without a window, and an invalid option
never triggers the Linux X11 relaunch. `-w` and `--ssh` affect only the first
tab of the first window, like the `-e` Launch Request.
