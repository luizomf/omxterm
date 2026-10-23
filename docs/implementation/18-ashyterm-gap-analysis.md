# AshyTerm gap analysis and porting plan

This record compares every feature that the AshyTerm README
(`CommunityBigLinux/ashyterm`, local checkout at `8d50567e`) advertises, plus
the user-visible behavior found in its source, with OMXTerm as of commit
`a353880` on `feature/ashyterm-ui-parity`. The feature-by-feature matrix with
evidence stays in [01-feature-parity.md](01-feature-parity.md); this document
answers a narrower question: **what does a user of AshyTerm miss in OMXTerm
today, and in which order will it be built?**

Status legend: **done** (works in the real application), **partial** (some of
the advertised behavior works), **missing** (nothing user-visible yet).

## 1. Summary

| AshyTerm README section    | OMXTerm status | Main gaps                                                                  |
| -------------------------- | -------------- | -------------------------------------------------------------------------- |
| Header bar and main menu   | done           | theme selector and font-size control in the menu; open-tabs list           |
| Sessions and SSH           | partial        | stored passwords (keyring), SFTP sessions, auto-reconnect, host-key repair |
| Smart output highlighting  | partial        | `cat` syntax colors, live input highlighting, per-rule editor and styles   |
| Split panes and tab groups | partial        | named layouts, auto-join groups, cwd tab titles, move/detach tabs          |
| Input broadcasting         | partial        | choosing target tabs/panes across the window                               |
| Integrated file manager    | partial        | drag-and-drop upload onto the terminal, rsync, transfer history            |
| Command manager            | done           | pinned command toolbar, send to several terminals                          |
| Optional AI assistant      | missing        | whole feature, opt-in, with providers and secret storage                   |
| Deep customization         | partial        | custom scheme editor, cursor and scrolling options, header transparency    |
| Backup and restore         | done           | (OMXTerm uses `.omxbackup`, scrypt + AES-256-GCM, instead of 7z)           |
| Command-line usage         | partial        | `--new-window`, `--close-after-execute`, `--ssh …:/path`, single instance  |
| Configuration files        | done           | (OMXTerm keeps its own layout; documented in `docs/configuration.md`)      |

## 2. Section by section

### 2.1 Header bar and main menu (AshyTerm `ui/header_bar_builder.py`, `ui/menus.py`)

| AshyTerm behavior                                                                                                | OMXTerm                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Header buttons: sessions, file manager, command manager, search, AI, temp-file cleanup, main menu, new tab       | **done** for sessions, commands, search, split, broadcast, new tab, main menu |
| Main menu: theme selector (system/light/dark/terminal), font size − / + / reset                                  | **missing**: menu has zoom items, no inline controls; needs Preferences store |
| Main menu items: New Window, Command Palette, Preferences, Colors, AI Assistant, Keyboard Shortcuts, About, Quit | **partial**: all present except AI Assistant (shortcuts live in Preferences)  |
| Open-tabs dropdown at the end of the tab strip                                                                   | **missing**                                                                   |
| Buttons mirrored when window controls are on the left (KDE)                                                      | **missing** (Linux custom title row always puts controls on the right)        |

### 2.2 Sessions and SSH (README "Sessions and SSH")

| AshyTerm behavior                                                          | OMXTerm                                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save Local, SSH and SFTP sessions in folders, colored tabs, sidebar search | **partial**: Local and SSH sessions, nested folders, tab colors, search, favorites and recent work; **no SFTP session type**                         |
| Key or password authentication, passwords in GNOME Keyring / KWallet       | **partial**: key and interactive password work; `credential-store.ts` (Electron `safeStorage`) exists but no editor field or launch path uses it yet |
| ControlMaster reuse, ProxyJump, port forwarding, X11, post-login command   | **done** (also `-R`/`-D` forwards and agent forwarding)                                                                                              |
| `~/.ssh/config` import                                                     | **done** (Include supported, wildcards skipped)                                                                                                      |
| Quick connect, `--ssh user@host`                                           | **done** (`:/path` suffix missing)                                                                                                                   |
| Auto-reconnect, changed-host-key repair, test connection                   | **missing**                                                                                                                                          |
| Hide sessions from the tree without deleting ("favorites" visibility)      | **missing**                                                                                                                                          |
| Saved layouts listed in the session tree                                   | **missing** (depends on named layouts, 2.4)                                                                                                          |

### 2.3 Smart output highlighting (README "Smart output highlighting")

| AshyTerm behavior                                                          | OMXTerm                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Colors applied in the terminal, no shell changes                           | **done**                                                                                       |
| 50+ command-aware rule sets                                                | **done**: all 51 sets / 486 rules imported, command detection by line model                    |
| Pattern highlighting (IPs, UUIDs, URLs, errors, warnings)                  | **done**                                                                                       |
| `cat` with syntax highlighting (Pygments)                                  | **missing**: needs a JavaScript highlighter bundled in the renderer                            |
| Live input highlighting (optional)                                         | **missing**                                                                                    |
| Every rule editable: colors, bold, italic, underline, strikethrough, blink | **partial**: switches, ignored commands, rule-set toggles and custom rules; no per-rule styles |
| Built-in color schemes, all editable                                       | **missing** (one configured theme file; see 2.8)                                               |

### 2.4 Split panes and tab groups (README "Split panes and tab groups")

| AshyTerm behavior                                          | OMXTerm                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Horizontal/vertical splits, maximize, rebalance            | **done**                                                                               |
| Save and restore complete named layouts                    | **partial**: the last workspace is restored at startup (opt-in); no named layouts      |
| Chrome-style tab groups: color, collapse, drag, auto-join  | **partial**: color, name, collapse, drag reorder; no auto-join                         |
| Tab titles follow the working directory (OSC 7), tooltip   | **partial**: OSC 7 is tracked for new panes; titles come from the shell's title string |
| Input broadcasting to several tabs and panes               | **partial**: broadcast to the panes of the tab or window; no per-target selection      |
| Move tab left/right, detach to a new window, notifications | **missing**                                                                            |

### 2.5 Integrated file manager (README "Integrated file manager")

**Partial** since the Files panel landed: local browsing that follows the
terminal, SFTP browsing for SSH panes, remote editing, downloads and uploads
with progress are done (see `docs/spec.md`, Files panel). Still missing: drag
and drop onto the terminal to upload, rsync, and a transfer history. AshyTerm
offers:

- a side panel that follows the shell's current directory (OSC 7), for local
  and remote (SFTP) file systems, with breadcrumbs, search, hidden files and a
  context menu;
- remote editing: download to a private temporary copy, open in the local
  editor, watch for saves and upload each one;
- drag and drop uploads onto the terminal (rsync when available, SFTP
  otherwise);
- a transfer manager with progress, cancel, conflict handling and history.

### 2.6 Command manager (README "Command manager")

**Done**: ready-made command forms (56 built-ins, the 8 AshyTerm forms plus
macOS and Windows ones), custom commands, import and export, insert or run.
**Missing**: the pinned command toolbar and sending a command to several
terminals at once.

### 2.7 Optional AI assistant (README "Optional AI assistant")

All **missing**. AshyTerm: opt-in side panel; providers Groq, Google Gemini,
OpenRouter, Cerebras, GitHub Models, Mistral and local OpenAI-compatible
servers (Ollama, LM Studio); distribution-aware system prompt; persistent chat
history; quick prompts; click-to-insert and click-to-run command suggestions.
OMXTerm's constraints (from the project brief): disabled by default, no
network access until enabled, nothing sent without an explicit user action,
API keys only in the system secret store, never executing a suggestion
without confirmation.

### 2.8 Deep customization (README "Deep customization")

| AshyTerm preference                                                           | OMXTerm                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Preferences window                                                            | **done**: Appearance, Terminal, Window and Tabs, Shortcuts, Advanced              |
| Fonts, line spacing                                                           | **done** in configuration, no GUI                                                 |
| Terminal transparency; header bar transparency                                | **partial**: terminal transparency and blur; no separate header transparency      |
| Cursor shape and blink                                                        | **partial**: from the theme only                                                  |
| Scrollback, scroll sensitivity, kinetic scrolling, scroll on output/keystroke | **partial**: scrollback only                                                      |
| Color schemes (13 built-in) and custom scheme editor                          | **partial**: the 13 AshyTerm schemes plus omtheme; no custom scheme editor        |
| Tab appearance, icon theme                                                    | **missing**                                                                       |
| Keyboard shortcut editor                                                      | **done**: shortcut recorder with conflict checks                                  |
| Copy on select, risky-paste warning, OSC 52 toggle                            | **partial**: protected paste and OSC 52 write exist; no copy on select or toggles |
| Encrypted backup of settings and sessions                                     | **done**                                                                          |

### 2.9 Command line (README "Usage")

| Option                                                  | OMXTerm                                                  |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `-w`, `-e/-x`, `--ssh`, `-h`, `-v`, `-d`, `--log-level` | **done**                                                 |
| positional `DIRECTORY`                                  | **missing** (Electron app path ambiguity in development) |
| `--close-after-execute`, `--new-window`                 | **missing**                                              |
| `--ssh …:/path`                                         | **missing**                                              |
| single instance (second launch opens a tab)             | **missing**                                              |

## 3. Porting plan

Each phase ships tests, documentation updates and a real-application check on
Linux before the next phase starts.

1. **Header toolbar and main menu** — done in `a353880`.
2. **Preferences window** — done (custom scheme editor and the main-menu
   theme and font-size controls remain) — a graphical editor over `config.json` with
   validation, reset to defaults and live application: Appearance (color
   scheme, font, size, line height, transparency, padding), Terminal (cursor,
   scrollback, scrolling, copy on select, paste warning), Tabs and window
   (title bar, tab bar, restore windows, confirm close), Shortcuts (editor with
   conflict detection), Highlighting (links to the rules editor) and Privacy.
   Adds built-in color schemes, the main-menu theme and font-size controls,
   and `Ctrl+,` / `Cmd+,`.
3. **Stored SSH passwords** — wire `credential-store.ts` into the session
   editor and the SSH launch path (passed through `SSH_ASKPASS`, never on the
   command line), plus auto-reconnect and host-key repair.
4. **File manager** — done except drag-and-drop upload, rsync and transfer
   history — local browsing panel that follows OSC 7, then SFTP
   browsing over the user's OpenSSH (ControlMaster reuse, existing host-key
   policy), transfers with progress and cancel, remote editing with change
   detection, drag-and-drop upload, and SFTP saved sessions.
5. **AI assistant** — opt-in panel with OpenAI-compatible providers (Groq,
   OpenRouter, Gemini, Mistral, Cerebras, GitHub Models, Ollama, LM Studio),
   keys in the secret store, explicit-send only, history, insert/run with
   confirmation.
6. **Highlighting extras** — `cat` syntax colors, live input highlighting,
   per-rule styles and editor, color-scheme editor.
7. **Workspace extras** — named layouts, cwd tab titles, auto-join groups,
   move/detach tabs, broadcast target selection, pinned command toolbar,
   long-command notifications.
8. **Command line** — `--new-window`, `--close-after-execute`, `--ssh …:/path`,
   single-instance forwarding.
