# Let a local agent drive a window the user grants

Status: accepted for slice 1, "Drive what's there", and slice 2, "Agents plug
in by themselves" (macOS and Linux), and slice 3, "Read and wait better",
which are implemented. The
[keyboard-parity rule](#keyboard-parity) is accepted, and slice 4 builds it
([#1047](https://github.com/luizomf/omxterm/issues/1047)): `press` with named
keys and every shortcut decided, the tab tree in `list`, and `keys`. Slice 5,
Windows ([#1078](https://github.com/luizomf/omxterm/issues/1078)), is
implemented with the default pipe descriptor. The
other later slices are still proposed
([#1025](https://github.com/luizomf/omxterm/issues/1025), building on
[#330](https://github.com/luizomf/omxterm/issues/330)). Slice 1 amends
[ADR 0050](0050-show-ongoing-states-as-quiet-state-marks.md) (one accent tone,
window-scoped marks),
[ADR 0004](0004-log-the-operational-envelope-not-terminal-payload.md) (API
payloads join the excluded content) and
[ADR 0013](0013-do-not-inject-shell-integration.md) (three non-secret
environment variables in every pane). Slice 4 amends ADR 0050 again (the
mark's error tone). The wire protocol and CLI are in the
[Agent API reference](../dev/agent-api.md). Where slices differ from the
text below, [Slice 1 as built](#slice-1-as-built),
[Slice 2 as built](#slice-2-as-built),
[Slice 4 as built](#slice-4-as-built) and
[Slice 5 as built](#slice-5-as-built) say so.

## Context

Agents already drive terminals, through tmux or UI automation. OMXTerm is a
terminal built for running agents, with no embedded model or chat UI, so the
missing piece is a first-class route for an outside program to do what a tmux
client does: open tabs and panes, type, read the screen, and wait.

The owner's decisions are settled in #1025: the grant covers one window; inside
it the agent can press what the user can press, keys and shortcuts alike
(keyboard parity, which on 2026-11-13 replaced "full autonomy"); it stays
until the user stops it; it is visible as a State Mark; core owns it in
Electron `main`. This record makes those concrete against the code and says
where they don't hold as written.

The audience is someone who will never touch tmux. They click to allow, the
agent already in the pane finds out by itself that it can drive the window,
and one click turns it off. So discovery with no setup is part of the decision,
not a later convenience.

What the code gives us today:

- **Input is written in main.** Keyboard bytes go Surface → preload →
  `terminal:input` → `session.write()` (`src/main/terminal-ipc-controller.ts`,
  `src/main/local-terminal-session.ts`), bounded to 64 KiB per message, with
  `writeTracked()` returning a receipt. Mirror Typing taps the Surface's
  `routeKeyInput` hook in the renderer, before that route (ADR 0043).
- **Text lives only in the renderer.** The Ghostty core runs in the renderer's
  WASM; main has no screen model. `TerminalSurface.exportText("content")`
  returns retained scrollback plus screen through the patched runtime's
  `getBufferText()` (`scripts/restty-buffer-text-corrections.mjs`), read-only,
  with a 16 MiB bound. Main already does correlated renderer round trips for
  layout capture (`src/main/terminal-layout-ipc.ts`).
- **Main sees every output chunk and knows when the renderer consumed it.**
  `src/main/terminal-output-flow.ts` keeps a cumulative byte position per
  session; the renderer acknowledges a position only after the chunk was
  submitted to the Surface. Hidden tabs keep ingesting.
- **Tabs and panes belong to the renderer.** Main knows a window's live
  sessions and the selected tab's sessions, not the tree. Tab and pane
  commands (`new`, `split`, `close-pane`) act on the selected tab's focused
  pane and return nothing; New Tab selects the tab it creates.
- **Shortcuts are actions matched in main.** Every shortcut, menu item and
  palette entry is one entry of `src/main/action-catalog.ts`, and each acts
  on the selected window. Main matches the effective keybinds (defaults plus
  the user's rebinds) in the window's `before-input-event`
  (`src/main/keybind-delivery.ts`); a key that matches nothing goes on to the
  Surface.
- **Mode-aware key encoding lives in the renderer.** Restty encodes a key for
  the pane's application-cursor and Kitty keyboard modes when it is pressed
  (`scripts/restty-application-cursor-corrections.mjs`); main never sees
  those modes.
- **A pane's environment already names the terminal.** Main sets
  `TERM_PROGRAM=OMXTerm` and its version when it spawns the PTY
  (`src/main/local-terminal-session.ts`), and knows the window and the session
  id at that point.
- **One process per profile** when packaged (ADR 0048); the hand-off to it is
  one-way, with no reply channel. A source run skips the lock and shares the
  installed app's profile directory.

## Decision

```
 agent / script                Electron main                      renderer (granted window)
+---------------+  socket   +---------------------+    IPC     +--------------------------+
| omxterm-ctl   |---------->| agent endpoint      |            | State Marks: accent mark |
| or any client |  NDJSON   |  auth: grant token  |<---------->|  on every pane and tab   |
+---------------+           |  scope: one window  |  marks,    | Surface text reads       |
                            |                     |  reads,    | tab and pane commands    |
                            |  agent write -------+--> PTY     +--------------------------+
                            |  output positions   |<-- PTY
                            +---------------------+
```

### Grant

- A grant belongs to one Terminal Window and is state in main's memory only.
  **Allow Agents in This Window** is a toggle in the Window menu and the
  Command Palette, with a rebindable shortcut that has no default. Turning it
  on flashes one sentence; there is no confirmation dialog.
- Only that gesture creates a grant. The API has no command that grants or
  reaches another window, and agent input never passes the window's keyboard
  handling. New Window is "not yet" for agents: the granted window is their
  workspace. Until slice 4 it runs no application action at all; after
  it, the agent presses shortcuts in its window and the grant toggle is
  refused by action, not by key ([Keyboard parity](#keyboard-parity)).
- It ends when the user clicks a mark, uses the toggle, closes the window or
  quits (the agent's Close Window and Quit too), and also when main can't
  keep its side of the bargain: the renderer is lost or reloads, or the
  endpoint can't be held. Ending closes every
  connection of that grant; in-flight waits fail with `revoked`. Switching
  tabs, modals, blur, hide and minimize don't end it.
- It is never restored by reopen-at-startup (ADR 0047) or Saved Layout, and
  never activated by `config.json`, a launch argument or an extension. The
  only thing on disk is the grant's credential file below, which exists while
  the grant does and is never read back by OMXTerm.

### Transport and discovery

- Main listens only while at least one grant exists. One endpoint per running
  process: a Unix socket at `<profile>/agent-api/ctl.sock` on macOS and Linux
  (directory `0700`, socket `0600`), and the named pipe
  `\\.\pipe\omxterm-agent-<hash of the profile path>` on Windows. No TCP.
- A Unix socket path is limited to about 104 bytes on macOS and 108 on Linux.
  The default profile fits. A long `--user-data-dir` profile (tests, packaged
  verification) may not, and then the grant is refused with one sentence
  rather than moved somewhere a client would have to guess.
- The profile is the Electron userData directory, the same key as the
  single-instance lock, so "the right running process" is "the one that owns
  this profile". A client derives the default profile path per platform or
  takes `--profile`. A stale socket file is replaced only after a connect to
  it is refused. If another live process already holds the endpoint (a source
  run next to the installed app), the grant is refused with one sentence.
- A grant has a random 256-bit token. Main writes
  `<profile>/agent-api/grants/<window>.json` (`0600`: endpoint, window id,
  token) and deletes it when the grant ends; leftovers are removed at startup.
  The token never travels in argv or environment variables. On Windows the
  file is protected by the profile directory's inherited ACL under
  `%APPDATA%`; a custom profile path carries no such guarantee.
- A connection authenticates with a mutual HMAC challenge over the token, so
  neither side sends it and a client can tell a real endpoint from something
  squatting on the name. An authenticated connection is bound to that grant's
  window; every pane and tab id it sends is checked against that window.
- The protocol is newline-delimited JSON, versioned in the handshake. It is
  the contract; `omxterm-ctl` is a small dependency-free client over it,
  run by the bundled runtime in Node mode (the mechanism ADR 0040 uses) or by
  any Node.

### Discovery without setup

- Every pane's PTY gets three more environment variables at spawn, in granted
  and ungranted windows alike, none of them secret: `OMXTERM_CTL` (the
  absolute path of the `omxterm-ctl` launcher inside the installed app),
  `OMXTERM_PROFILE` (the profile directory) and `OMXTERM_PANE` (window and
  session id, such as `3:s4`; slice 1 prefixes the process's instance id).
  This is how an agent learns it is inside
  OMXTerm, where the client is and which pane is its own, with nothing on
  `PATH` and nothing configured.
- The client run inside a pane needs no arguments: it reads those variables,
  finds its window's grant file and connects. `list` marks the caller's own
  pane as `self`, so an agent doesn't type into itself by accident.
- Without a grant, `"$OMXTERM_CTL" status` says so in one sentence that names
  the menu item, and exits non-zero. The agent can relay that sentence; after
  the click the same command works. Nothing else changes for the agent, so
  the grant can come before or after the agent starts.
- `"$OMXTERM_CTL" guide` prints the short agent guide (the same text as the
  `SKILL.md`), so an agent that has never heard of OMXTerm can learn the
  commands from the variable alone. `"$OMXTERM_CTL" mcp` serves the same
  commands as MCP tools over stdio from the same script; the tools are always
  listed and answer "not granted" until the user clicks.
- The variables are not shell integration: no startup file, prompt or shell
  command changes (ADR 0013 keeps that rule), but its sentence about the
  inherited environment is amended. They don't cross SSH by default, so a
  remote agent doesn't believe it has a local API. A multiplexer started
  inside a pane keeps the variables of the pane that started its server.
- An agent running outside OMXTerm has no variables: it uses the default
  profile path, and needs `--window` when more than one window is granted.

### Input

- Agent input enters at one place in main: the granted window's commands
  check the grant and the pane's window, then call the window controller's
  `agentSessions.write()`, which calls the session's `writeTracked()`. It is
  the only place agent bytes are written, so a later record of what the agent
  typed has one place to attach.
- It bypasses the Surface. Consequences, all intended: agent bytes never reach
  `routeKeyInput`, so they never enter a Mirror Typing route and never stop
  one; they skip Protected Paste and its confirmation; they don't scroll the
  user's viewport to the bottom; they don't clear a bell.
- The user's keyboard keeps working in every pane. Each request is one bounded
  write, so a request isn't split by a keystroke, but requests and keystrokes
  interleave freely. There is no input lock.
- Main doesn't know terminal modes. `send` writes literal text and a fixed
  table of mode-independent keys (`Enter`, `Tab`, `Escape`, `Backspace`,
  `Space`, `Ctrl+<letter>`), and stays that way. Arrow and function keys,
  whose bytes depend on application-cursor and Kitty modes, are `press` in
  slice 4; paste that honors bracketed paste mode is slice 6.

### Keyboard parity

Owner decision (2026-11-13, #1025): **inside a window the user granted, the
agent can press what the user can press, keys and shortcuts alike**, with one
exception, the grant toggle. Only the user turns a grant on or off, one click
on the mark stops everything at once, and a grant is never restored
automatically. Slice 4 builds it. `press` with named keys came first
([#1048](https://github.com/luizomf/omxterm/issues/1048)); until shortcut
matching lands, every chord goes to the pane.

```
 press(pane, chord)
        |
        v
 main: effective shortcuts --- match ---> toggleAgentAccess --> refused
 (defaults + rebinds)            |------> parked UI ---------> "not yet"
                                 |------> other action ------> runs in the
                                 |                             granted window
                                 '------> no match
                                              |
                       renderer encodes for the pane's mode
                                              |
                                              v
                                   agent write --> PTY
```

- **`press` is the route.** It takes named keys and chords for a pane of the
  granted window. Main matches each one against that window's effective
  shortcuts with the same matcher `before-input-event` uses, from data: no
  key event is synthesized and nothing enters Chromium's input path. A match
  runs that catalog action and `press` says which one ran. Anything else is
  encoded by the renderer for the pane's current mode, exactly as the user's
  key would be, and written by main's agent write, so like `send` it never
  reaches `routeKeyInput`, Mirror Typing or Protected Paste. Restty's
  encoder runs without a DOM key event
  ([Slice 4 as built](#slice-4-as-built)).
- **The exception is enforced by action, not by key.** A chord that resolves
  to `toggleAgentAccess` is refused, whatever key the user bound it to, and
  is not sent to the pane either. The API reaches actions only through that
  lookup, never through the menu, the Command Palette or a native dialog, so
  rebinding the toggle can't route around it.
- **Presses act on the granted window and the pane they name**, even when
  another window is selected. Keys go to that pane. For a matched action,
  main first focuses that pane in the granted window (selecting its tab if
  needed), then runs the action, the way the user clicks a pane and presses,
  so `press s3 Cmd+W` closes `s3`. The result names the action and the pane.
  Presses never type into the selected window or through the user's keyboard
  handling. Today every catalog action takes the selected window, so slice 4
  gives the actions it covers an explicit window.
- **Closing a Busy Session needs the user.** When an agent's close would
  raise the Busy Session confirmation (ADR 0017), the native dialog stays the
  user's: the press answers one sentence ("needs the user") and does
  nothing. With `confirmClose` off it closes, as the user's press would.
- **UI the agent can't read yet answers "not yet"** in one sentence and does
  nothing, until its own decision: the Command Palette (which lists **Allow
  Agents in This Window**), Settings, Find, extension panels and native
  dialogs. So does an action that would reach past the window. Each
  shortcut's decision is in [Slice 4 as built](#slice-4-as-built). About,
  Settings, Open Local Image, Always on Top and Developer Tools have no
  shortcut, so `press` can't reach them. Developer Tools stays
  out of reach even if it gets one: it runs code in the renderer, and the
  renderer can grant ([Slice 1 as built](#slice-1-as-built)).
- **`send` stays as it is**: literal text and mode-independent keys, never
  matched against shortcuts.
- **The mark turns to the error tone** once shortcuts land
  ([Visible state](#visible-state)).

### Reading and waiting

- `read` is a main-to-renderer round trip with a correlation id and a
  timeout, like layout capture. Before asking, main waits (bounded) until the
  renderer has acknowledged everything main has sent for that session, so a
  read after a `send` doesn't race the parser.
- The first read is a tail: the last N lines of retained scrollback plus
  screen, through the existing export path and its bound, with no runtime
  change. The exact `screen` read (the active screen's rows, independent of
  where the user scrolled) is one more read-only accessor beside
  `getBufferText()` in the checksum-guarded runtime corrections,
  `getScreenText()`. It reads each row through the core's selection text, so
  a wrapped line answers one line per row, and touches no selection, scroll,
  cursor or rendering state. Text only; no colors or cell attributes.
- **Scrollback from before the grant is readable.** Restty has no stable row
  marker to fence it (rows reflow on resize and are evicted), and an agent
  that can type can print any file the user can read, so hiding earlier
  output would protect nothing. The grant sentence says "read".
- `wait` is built in main on the output positions it already keeps. `send`
  returns the session's position; `wait` takes `after` (only output past that
  position counts), `idleMs` (no output for that long, and the renderer caught
  up), an optional literal `match` checked against the pane's text, and a
  required bounded `timeoutMs`. It answers with a tagged `reason`: `idle`,
  `match`, `timeout` or `exited`. OSC 133
  ([#1027](https://github.com/luizomf/omxterm/issues/1027)) later adds
  `reason: "command-end"` with `exitCode` and a read source for one command's
  output without changing existing fields.
- Without command boundaries, `idle` is a heuristic: a spinner or a prompt
  clock never goes idle, and a slow command can pause. That is why `match`
  and the timeout exist.
- `match` is looked for in the screen text of the `screen` read, so an
  agent can copy what it expects from a read. A screen can't tell an old
  copy from a new one, so the wait counts copies: it answers `match` once
  the window has shown output past `after` and a screen holds more copies
  than the fewest it held since `after`. An old copy that scrolled off
  stops counting, so it doesn't hide a new one, and a copy that leaves and
  comes back on the same screen (a pager scrolled away and back) counts as
  new.
- The main and alternate screens are counted apart, and the window says
  which one each read saw (`isAltScreen()` beside `getScreenText()` in the
  runtime corrections). The screen at `after` starts from its count then;
  the alternate screen, when the main one was there, starts empty, since a
  program switched to it since. A screen whose count isn't known (the main
  screen coming back after a full-screen program, or any screen when the
  screen at `after` is unknown) and a screen resized since (rows reflow)
  start from their first look. So an old result on the main screen doesn't
  answer when an editor or pager in front of it quits.
- The screen at `after` is known when `after` is the offset a `send` or
  `press` just returned (main reads the screen right before writing, so the
  window answers before the program can echo anything) or the current
  position (the wait reads it first). For any other `after`, or when that
  read failed, it is unknown. Main keeps that one screen per pane in
  memory, never in logs, until the pane's next `send` or `press`, its exit
  or the grant's end.
- Main looks again each time the window shows more output, at most every
  50 ms. What it misses happens between two looks, or before the first look
  at a screen it had no count for: text that appears and scrolls off, a
  burst that swaps an old copy for a new one, or new text already there
  when the main screen comes back. Those end in `timeout`, not `match`;
  text that stays on screen, such as a final line, is the reliable thing to
  wait for. Matching the output stream instead would miss full-screen
  programs that redraw only the cells that changed, and would need a second
  escape-sequence parser in main.

### Tabs and panes

- Ids are the window's session ids for panes and renderer-assigned ids for
  tabs, valid for that grant only. In slice 4 `list` returns the tree of
  tabs and panes, with the selected tab and focused pane, so an agent can see
  what its presses did.
- The agent shapes the window with the user's own shortcuts through `press`:
  new, close, next, previous and select tab, split, close pane, focus and
  swap panes, equalize. This replaces the commands taking a pane or tab id
  that this record first proposed. Closing the last tab closes the window and
  the grant with it.
- An agent that selects a tab or pane moves that window's selection, and tab
  selection stops a Mirror Typing group as it does for the user (ADR 0043).

### Visible state

- `stateGlyphs` has `agent` (`◆`). Marks have a window scope:
  `setWindow(owner, mark)`, rendered on every pane of the window, including
  panes created later, and once on every tab, Application Tabs included.
- The pane mark is actionable: clicking it ends the grant. Its label names the
  state and the stop: "Agents can do anything you can in this window. Click
  this mark to stop them." The tab copy stays a plain glyph, since a tab is a
  button already.
- The tone is core-owned: `--ui-agent`, the theme's red (the color behind
  `--ui-error-accent`), or the foreground when the red lacks contrast against
  the background. CSS maps `.ui-mark[data-glyph="agent"]` to it, including on
  hover, and reporters never pass a color. It ignores
  `appearance.activePaneHighlight`: a consent indicator can't be something a
  theme switches off. Before slice 4 the mark took the cyan accent
  (`--ui-accent`) and read "Agents can control and read this window. Click to
  stop."; agents pressing shortcuts made it the error tone.
- **The mark is always visible, and clickable, while a grant exists.** It is
  the panic button, so no state may hide it: not a hidden tab strip or title
  bar, not an extension tab or its native view, not anything the agent can
  toggle. When the selected tab shows no pane (Settings, an extension tab, or
  a terminal tab whose panes wait for an extension's view to hide), a copy
  with the same click sits in the page's top-right corner, tab strip or not.
  Marks are `app-region: no-drag`, so a hidden title bar's drag area doesn't
  take the click. That holds in every state an agent's shortcut can make: tab
  strip and title bar hidden, full screen, any zoom
  ([#1052](https://github.com/luizomf/omxterm/issues/1052)). A dialog or
  overlay the user opens (the Command Palette, an image preview, an extension
  dialog) sits above the mark until the user closes it; agents can't open
  those, and their closes and quit wait for the user meanwhile.
- The click stops the window at once: it drops every agent command the window
  holds before main hears of it, so nothing already handed over runs after.
- Main admits commands only while the renderer has confirmed the marks are
  shown. No mark, no access.
- The attention mark of
  [#1026](https://github.com/luizomf/omxterm/issues/1026) can share the
  plumbing (a glyph in the vocabulary, the glyph-to-tone CSS mapping, the tab
  copy) but is pane-scoped and has no tone of its own: the agent's tone means
  "agents can act here".

### Privacy

Requests, responses, tokens, pane text and typed bytes never reach operational
logs. Operational Events may record that a grant started or ended, the window,
a command name, its duration and an error code.

## Threat model

- **Other users on the machine** are stopped by the profile directory and
  socket permissions on macOS and Linux. On Windows they can't write to the
  pipe or read the credential, so they can't authenticate; they can still
  hold a pre-handshake slot or take the pipe's name first, which only
  refuses or delays a grant ([Slice 5 as built](#slice-5-as-built)).
- **Other processes of the same user are not stopped**, and no local design
  here can stop them: they can read the grant file. The same user can already
  read the user's keys and shell startup files, and on X11 (the Linux default,
  ADR 0020) can synthesize keystrokes into any window. The token still earns
  its place: it binds a client to one window, dies with the grant so a stale
  client fails, authenticates the endpoint to the client, and keeps out
  anything that can reach the socket but not the profile (a forwarded socket,
  a sandboxed app).
- **A pane running SSH.** The remote host can't reach the local endpoint
  unless the user forwards the socket, and no terminal escape sequence can
  create a grant, reveal a token or issue a command. The real risk runs the
  other way: remote output is text the agent reads, and the agent can type
  into local panes of the same window. A hostile host can try to steer the
  agent into running local commands. OMXTerm doesn't judge content (#330);
  the containment is the window boundary, so sensitive sessions belong in a
  window without a grant.
- **The agent itself** has, inside the window, what the user has at that
  keyboard, including whatever the open SSH sessions can do. From slice 4
  that includes the window's shortcuts, except the grant toggle, and Copy
  onto the system clipboard, which OSC 52 already allowed. Paste, which reads
  it, is not yet.

## Tradeoffs and disagreements with #1025

- **"A named pipe with an ACL" isn't available from Node.** libuv creates
  listening pipes with no security attributes and without
  `PIPE_REJECT_REMOTE_CLIENTS`, and Node exposes neither. An owner-only pipe
  means a native helper that owns the pipe I/O. This record chooses the token
  with mutual proof as the Windows boundary. Slice 5 measured the default
  descriptor and kept it, with no native helper
  ([Slice 5 as built](#slice-5-as-built)).
- **The token is not a wall between same-user processes.** See above. Handing
  it to the agent by hand (show it once, the user pastes it) would be one,
  at the cost of the friction the feature exists to remove.
- **`omxterm ctl` can't go through the app's normal launch.** A second
  launch starts Chromium, hands its request to the running process one-way
  and quits (ADR 0048, `claimSingleInstance`): there is no channel for an
  answer. The client is a separate script, `omxterm-ctl`, run by the same
  binary in Node mode, which skips both. This is a disagreement about the
  mechanism, not the name. On Windows the binary is a GUI executable, so a
  `.cmd` launcher runs it ([Slice 5 as built](#slice-5-as-built)).
  Unverified: the per-call cost of the AppImage mount. The installers put no command on `PATH` today (the Linux
  script installs the AppImage, an icon and a desktop entry; the NSIS include
  doesn't touch `PATH`), which is why discovery uses `OMXTERM_CTL`.
- **The accent has no contrast guarantee.** `terminalPaneAccent()` falls back
  to the foreground color when cyan is too close to the background, and a
  custom palette or transparency can still leave it weak. The mark can't be
  switched off, but a theme can make it as quiet as any other mark. The
  error tone of slice 4 gets the same fallback and the same limit.
- **"Visible" holds only while the window is.** A minimized, hidden or
  covered window keeps its grant, by decision, and shows nothing anywhere
  else. The menu item's check mark is the only other trace.
- **Parity includes the window's selection.** The agent's New Tab selects
  the new tab, as the user's does, and a matched shortcut first focuses the
  pane it names, so what the user sees in that window moves with the agent.
- **Environment variables in every pane** are visible to every program the
  user runs there, and say only where OMXTerm is. That is the price of an
  agent finding the API by itself.
- **A flash instead of a confirmation** keeps the product quiet and accepts
  that a mis-click grants access until the user notices the marks.

## Rejected

- **A terminal model in main** to read without the renderer: a second parser
  to keep identical to Ghostty's.
- **Routing agent input through the Surface** (`inject()`): it would revoke
  Mirror Typing routes, trigger Protected Paste and depend on a live renderer
  for every byte. `press` asks the renderer only to encode a key; the bytes
  still go through main's agent write.
- **Synthesizing native key events** for `press`
  (`webContents.sendInputEvent`): they would go through the user's keyboard
  handling, could reach the menu and the Command Palette, and would make the
  grant toggle's refusal depend on keys instead of actions.
- **Loopback TCP or HTTP**: reachable by every local user and by browsers.
- **Putting the token in the pane's environment**: the PTY is already running
  when the grant is given, and every child process would inherit it.

## First version and follow-up slices

1. **Drive what's there (macOS and Linux).** The grant toggle, window-scoped
   accent mark with click-to-stop, endpoint, token and handshake, the three
   environment variables, `status`, `list` (flat panes), `send` (text and
   mode-independent keys), `read` (a tail), `wait` (`idle`, `timeout`,
   `exited`), `omxterm-ctl`, and the spec, glossary and ADR 0050, 0004 and
   0013 amendments. It proves the security, visibility and discovery shape
   with no new tab or pane commands and no runtime patch.
2. **Agents plug in by themselves.** `omxterm-ctl guide`, a `SKILL.md`, and
   `omxterm-ctl mcp`, a thin MCP server over the same client for agents that
   speak MCP (Claude Code, Codex).
3. **Read and wait better.** The exact `screen` read and `wait` with `match`.
4. **Press what the user can press.** The
   [keyboard-parity rule](#keyboard-parity), in this order (sub-issues of
   #1025, after this amendment, #1047):
   - [#1048](https://github.com/luizomf/omxterm/issues/1048): `press` with
     named keys, encoded for the pane's mode, also in an unselected granted
     window. No shortcut matching yet: every chord goes to the pane.
   - [#1049](https://github.com/luizomf/omxterm/issues/1049): the tab and
     pane tree in `list`.
   - [#1050](https://github.com/luizomf/omxterm/issues/1050): tab and pane
     shortcuts run in the granted window on the pane `press` names, the
     grant toggle is refused by action, parked UI answers "not yet", a busy
     close needs the user, and the mark takes the error tone with its
     contrast fallback and is always visible. Other chords still go to the
     pane.
   - [#1051](https://github.com/luizomf/omxterm/issues/1051): `keys` lists
     the window's effective shortcuts, marking the refused and "not yet"
     ones.
   - [#1052](https://github.com/luizomf/omxterm/issues/1052): the remaining
     shortcut actions, each decided, including the Snippets sidebar, the
     auxiliary panel toggle and move, Reload Configuration and the extension
     slots. New Window stays "not yet": the granted window is the agent's
     workspace.

   It replaces the id-based tab and pane commands first planned here and
   takes the named keys of slice 6.

5. **Windows.** The pipe endpoint, console behavior of the client, and the
   decision on native hardening.
6. **Paste by mode.** Text sent as a paste that honors bracketed paste mode.
7. **A record of what the agent typed.** Session-only, in memory, bounded,
   shown to the user in the window and dropped with the grant; attached at
   main's agent write, never in operational logs.
8. **Command boundaries.** With #1027: `command-end`, exit codes and
   per-command output.

Numbers name slices, not their order; #1025 tracks the order.

## Slice 1 as built

What shipped matches the decision above, with these differences found while
building it:

- **The grant starts after the marks.** The toggle asks the window to show its
  marks; only when the renderer confirms does main listen and write the
  credential file, and only then does the handshake accept the token. A
  window that doesn't confirm within 5 s ends the attempt. Confirmations are
  admitted one at a time, so a repeated one can't touch a grant being
  admitted.
- **The renderer can grant.** The Command Palette runs in the window's
  renderer, and it can invoke **Allow Agents in This Window** like any other
  action, so a compromised renderer could grant its own window without the
  user. That adds little: such a renderer can already type into its own
  panes' PTYs. The palette entry stays because it is a real user surface. The
  boundary that holds is the rest: no terminal output, extension, launch
  argument, configuration or API call can grant, and the agent API can't
  reach the window's keyboard handling.
- **Each process has an instance id.** A source run and the installed app
  share a profile and can both have window 1, so window ids alone would let
  an agent in one process's ungranted window drive the other's granted
  window 1. Main picks a random 64-bit instance id at startup; it leads
  `OMXTERM_PANE` (`<instance>:<window>:<pane>`), sits in the credential file
  and in the client's hello, and main refuses a hello for another instance.
  A client in a pane only uses a credential of its own instance.
- **A credential belongs to the process that wrote it.** A refused grant never
  removes a credential it didn't write, and leftovers are removed at startup
  only when no live process answers on the socket.
- **`list` is built in main.** The flat pane list of slice 1 needs only the
  window's live sessions, their last grid and the focused pane, which main
  already has. The renderer round trip arrives with the tree in slice 4.
- **`send` takes text, keys or both** (text first, in one write), so the
  CLI's `--enter` stays one request. `Space` is in the key table.
- **The corner mark** shows only when the selected tab has no pane and the tab
  strip is hidden; otherwise the tab buttons already carry the mark, and a
  page header's buttons stay clear. Slice 4 shows it whenever the selected
  tab has no pane, since a tab button's glyph can't be clicked
  ([Slice 4 as built](#slice-4-as-built)).
- **A held shortcut toggles once.** A bound `toggleAgentAccess` owns one
  physical press, so key repeat can't flip the grant back and forth.
- **Windows** refused the toggle with one sentence, and its panes got no
  variables, until slice 5.
- **The launcher** is a POSIX script at `<resources>/agent-ctl/omxterm-ctl`
  beside its bundled script `omxterm-ctl.cjs`, outside the archive. It runs
  `Contents/MacOS/OMXTerm` (macOS) or `omxterm` (Linux) next to it in Node
  mode; an unpackaged build names its Electron binary in a `runtime` file. On
  an AppImage, `OMXTERM_CTL` points into the current mount, which lives as
  long as the panes that received it.
- **Reads in hidden tabs and minimized windows** work on macOS (verified on a
  macOS 27 guest): `send`, `wait` and `read` answered while the window was
  minimized and the pane's tab wasn't selected. Linux is unverified.
- The HMAC key is the token's 32 bytes; the grant file stores them as hex.

## Slice 2 as built

- **One text.** The guide is `src/agent-ctl/SKILL.md`, bundled into the
  client as text. `guide` prints the whole file, frontmatter included, so
  redirecting it into an agent's skills folder installs it; nothing else
  ships a copy.
- **The MCP server is the CLI.** Each tool call becomes the CLI command of
  the same name, parsed by the same code, on its own connection. That's what
  makes a grant given after the agent started work on the next call, and an
  ended grant fail cleanly, with no session state in the server.
- **Two protocol eras.** The current MCP revision (`2026-07-28`) has no
  `initialize`; each request names its version, and Claude Code already opens
  with `server/discover`. Codex still sends `initialize` (`2025-06-18`). The
  server answers both, chosen per request.
- **Codex hides the pane.** Codex starts stdio servers with a short default
  environment, so `OMXTERM_PANE` and `OMXTERM_PROFILE` don't reach the server
  unless its configuration lists them in `env_vars`. Without them the server
  behaves like a client outside OMXTerm, and `status` and `list` say that no
  pane could be marked `self`. The guide gives one block that registers the
  server and adds them.
- **A shorter wait.** An MCP `wait` defaults to a 50 s timeout instead of the
  CLI's 60 s, so it answers before Codex's default 60 s tool timeout.

## Slice 4 as built

So far, `press` with named keys
([#1048](https://github.com/luizomf/omxterm/issues/1048)):

- **No DOM event needed.** Restty's keymap reads only a key event's `key`,
  `code`, modifier flags, `type`, `repeat` and `isComposing`, and its input
  handler reads the pane's DECCKM and Kitty flags from the core when it
  encodes. One checksum-guarded runtime correction
  (`scripts/restty-key-press-corrections.mjs`, no WASM change) adds
  `encodeKeyPress()` beside it: a plain key description in, the keydown's
  bytes out, plus the keyup's when Kitty asked for release events, each
  through the same PTY mapping as the user's key. So a press is exactly a
  user press and release, and nothing is sent by the renderer.
- **The round trip** is `read`'s: main asks the granted window for the bytes
  with a correlation id and a timeout, then writes them in one write through
  `agentSessions.write()`, like `send`. Main first waits, bounded, until the
  window consumed the output main already received from the pane, so the
  modes that output set are in place; output still on its way can change them
  later. All keys of one press are encoded against the same modes. A press in
  flight when the grant ends writes nothing.
- **Named keys only**: arrows, `Home`, `End`, `PageUp`, `PageDown`, `Insert`,
  `Delete`, `F1`–`F12`, `Enter`, `Tab`, `Escape`, `Backspace` and `Space`,
  with `Ctrl`, `Alt` and `Shift`. On macOS, `Ctrl+Space` is refused: macOS
  keeps it for switching input sources, and the user's press sends nothing.
  `Alt` is the terminal's Alt: on macOS the
  user's Option+Space types native text when `optionKeyMode` leaves Option
  alone, but the agent's `Alt+Space` sends `ESC` and a space.

`list` returns the tree
([#1049](https://github.com/luizomf/omxterm/issues/1049)):

- **The window knows its tabs; main knows each pane's size and focus.** Main
  asks the window for tab ids, titles, the selected tab and each tab's pane
  session ids (the same correlated, bounded round trip as `read`), then joins
  the live sessions it already has. Pane ids are unchanged, so they stay valid
  for `send`, `read`, `wait` and `press`.
- Tab ids (`t1`, ...) are handed out when `list` first shows a tab and stay
  with the tab while it lives. Titles are untrusted text.

Tab and pane shortcuts, and the mark in the error tone
([#1050](https://github.com/luizomf/omxterm/issues/1050)):

- **A chord is an accelerator, as data.** `press` parses each chord with the
  accelerator grammar (so it may name `Cmd` and character keys: `Cmd+T`,
  `Ctrl+Shift+]`) and runs it through `terminalActionForKeyboardInput()`
  against the live catalog's shortcuts, the matcher `before-input-event`
  uses. One table (`src/main/agent-shortcuts.ts`) decides every action: run,
  refused (`toggleAgentAccess`), not yet (Command Palette, Find, and the
  Snippets, Files and SSH Connect panels), or still a
  key for the pane, so a new action never runs for agents by default.
  Refusals answer before anything happens, whatever else the press holds; a
  shortcut that runs must be the press's only key. A named-key chord of an
  action not covered yet still goes to the pane; any other unrun chord is
  `unsupported-key`, since the encoder takes named keys only.
- **Focus and act are one step in the window.** The actions don't go through
  the catalog's selected-window callbacks. Main sends the granted window one
  correlated request, like `read`, with the pane and the tab or pane command;
  the window focuses that pane (selecting its tab), runs the command once that
  tab shows (leaving an extension's view waits for main to hide it; split and
  directional focus measure the tab), and answers. A pane that is gone answers `unknown-pane`, and a
  window whose selection didn't move (a dialog over it) answers `unavailable`,
  so a close never lands on another pane. That leaves the user's Close Pane
  and its popup checks unchanged.
- **No focus theft.** Selecting an extension tab focuses its native view,
  which on macOS raises its window over the one the user is in (seen on a
  macOS guest). A tab an agent's shortcut selects takes native focus only
  when its window already has it.
- **The Busy Session check is on the named panes.** Main's idea of the
  focused pane trails the window, so a close asks
  `agentCloseNeedsUser()` in the application, which owns `confirmClose`,
  about the named pane, or for Close Tab every pane of its tab (from the
  window's tab list). A close the user is already confirming in that window
  also needs the user. The sentence says which: a running program, a close being
  confirmed, or a window that is closing.
- **A stop is immediate in the window too.** The renderer keeps its own
  live flag: the mark's click clears it before telling main, and so does
  main's grant-off message. The window then refuses queued actions and drops
  any action still waiting for its tab to show. When main stops waiting for
  an action (the agent went away, or time ran out), it tells the window to
  drop that one.
- **The mark** takes `--ui-agent`, the theme's red or its foreground when the
  red has a contrast below 3 against the background, the accent's rule. The
  `--ui-accent` token had no other use and is gone. Its label reads "Agents
  can do anything you can in this window. Click this mark to stop them."
- **Always visible, always one click.** A tab button's glyph can't be a
  button, so the corner copy now shows whenever the selected tab has no pane,
  tab strip or not, and marks are `app-region: no-drag`, so a hidden title
  bar's drag area doesn't swallow the click. An extension tab's native view
  sits below its page header and doesn't reach the corner (checked on a
  macOS guest), which settles slice 1's open question. The tab-bar and
  title-bar toggles, and every other action, waited for
  [#1052](https://github.com/luizomf/omxterm/issues/1052) below.

`keys`, so agents look instead of guess
([#1051](https://github.com/luizomf/omxterm/issues/1051)):

- **The same table and the same live shortcuts as `press`.** `keys` walks
  `src/main/agent-shortcuts.ts` and reads the catalog's effective shortcuts,
  so a rebind shows up and a new action is listed as soon as the table decides
  it. Each entry has the action, its chord (null when the user unbound it)
  and a status: `available`, `refused` (the grant toggle) or `not-yet`. Since
  #1052 every action is in the table, so every action is listed.

The remaining shortcuts
([#1052](https://github.com/luizomf/omxterm/issues/1052)). Every action is
now decided in `src/main/agent-shortcuts.ts`; none still goes to the pane as a
key. Each runs in the granted window or answers "not yet":

- **Run, in the window on the named pane:** Zoom In, Zoom Out and Actual
  Size (the window's font zoom), Select All (text `read` already returns),
  and Copy, which writes the pane's selection to the system clipboard: any
  program in a pane can already do that with OSC 52, so it gives an agent
  that can type nothing new. Toggle Tab Bar and Toggle Title Bar are
  window-local, and the mark stays visible and one click with them hidden
  (checked below).
- **Run, from main on the granted window:** Toggle Full Screen, only from
  the window the user is in; otherwise it needs the user, since on macOS it
  moves them to the window's Space (seen on a macOS guest). Close Window, like
  Close Tab: a Busy Session anywhere in the window, a close or quit being
  confirmed, or any native dialog open over the window (Protected Paste, an
  export or extension install, a session failure) needs the user; closing out
  from under a dialog is their call, and so is Close Tab or Close Pane then.
  Quit, only when the granted window is the last one: other windows aren't
  the agent's to close, so it needs the user then, and under the same
  conditions. Both end the grant. Main checks the window's grant right
  before acting, so a stop main has heard always wins.
- **Not yet:** Paste brings the clipboard, filled from other windows and
  apps, into a pane the agent can `read`, and can raise Protected Paste's
  native dialog; agents type with `send`, and paste by mode is slice 6.
  Reload Configuration applies the file to every window, including
  `confirmClose`, which guards the agent's own closes. Save layout replaces
  the user's saved snapshot through an extension that acts on the selected
  window. Find, the Command Palette, the Snippets, Files and SSH Connect
  panels, the Auxiliary Panel's toggle and move, and Mirror Typing (a setup
  dialog) are UI the agent can't read. New Window (owner decision): the
  granted window is the agent's workspace. A new window takes the user's
  keyboard, and the focus check races with the window being created; at
  worst the user's toggle shortcut, which acts on the focused window, would
  grant the agent's new window instead of stopping the old grant. Opening
  windows without taking focus is a later decision.
- **Window commands, two routes.** Zoom, Copy, Select All and the bar
  toggles ride the window request `press` already uses for tab and pane
  actions: the window focuses the named pane, then runs them, and a stop
  still drops one in flight. A toggle a preview holds answers `unavailable`.
  Full Screen, Close Window and Quit are main's: the application
  acts on the granted window it was given, never the selected one, and never
  through a confirmation dialog.
- **The mark at any zoom.** Pane marks follow the terminal's font size, which
  Zoom Out takes down to 1px, so the glyph never shrinks below the UI's meta
  text (`max(var(--terminal-font-size), var(--ui-text-meta))` in `ui.css`).
- **The mark, checked.** On a macOS guest, after the agent hid the tab strip
  and title bar: one pane, a split, zoomed out to the smallest font,
  Settings (the corner copy), and full screen. Every mark was on screen and topmost, also
  with the pointer resting on it and the hidden title bar's drag handle shown
  beside a split's middle mark, and one window-server click on it ended the
  grant each time. With the user in another window, the agent's zoom, copy
  and bar toggles changed only the granted window, without raising it. An
  extension tab with both bars hidden was checked in #1050; Linux wasn't run.

## Slice 5 as built

Windows ([#1078](https://github.com/luizomf/omxterm/issues/1078)), after a
probe on a Windows 11 ARM64 guest
([#1025](https://github.com/luizomf/omxterm/issues/1025#issuecomment-6868282883)):

- **The default pipe descriptor, no native pipe server.** That settles the
  open question. Node's descriptor gives the owner, SYSTEM and Administrators
  full control and Everyone and Anonymous only read. A client that opens the
  pipe for reading and writing, as `omxterm-ctl` does, gets `EPERM` as a
  second non-admin user, whether OMXTerm runs elevated or not.
  Administrators can connect, as they can open anything of the user's.
  Same-user processes were never out of reach on any platform, and the token
  still proves both sides.
- **What another user can still do is a nuisance, not access.** libuv
  doesn't reject remote clients, and a read-only open is allowed, so another
  user's connection still reaches `accept` and can hold one of the eight
  pre-handshake slots until the 5 s handshake timeout. The pipe name is
  predictable, so another user can also create it first, and the grant is
  refused as `in-use`. Neither gets past the handshake: without the token no
  command runs and nothing is read.
- **The credential is the same file.** `%APPDATA%\omxterm` inherits SYSTEM,
  Administrators and the user only; the probe's second non-admin user
  couldn't read a fresh file there. Windows has no mode bits, so the client
  skips its `0600` check there and relies on that ACL. A custom profile path
  still carries no such guarantee.
- **The pipe is `\\.\pipe\omxterm-agent-<hash>`**, the first 16 hex digits of
  the SHA-256 of the profile path. It has no file: nothing to prepare,
  protect, replace or remove, and no path-length limit. Main decides that by
  platform, never by how the path is spelled. On Windows the client only
  follows a grant file to that local pipe name, so a file planted under a
  custom profile can't send it to another pipe or to a remote host. A name another live
  process holds fails the listen, and the grant is refused with the
  existing sentence; the name is free again when that process ends. Ending
  the last grant closes the pipe.
- **The launcher is `omxterm-ctl.cmd`** beside `omxterm-ctl.cjs` in
  `resources\agent-ctl`, and `OMXTERM_CTL` names it. It sets
  `ELECTRON_RUN_AS_NODE=1` inside `setlocal`, runs `OMXTerm.exe` with the
  script and every argument, and returns its exit code; an unpackaged build
  names its Electron binary in the same `runtime` file as the POSIX launcher.
  Run directly from PowerShell, the GUI executable gives no output, no exit
  code and doesn't wait. The `.cmd` works from PowerShell
  (`& $env:OMXTERM_CTL status`), cmd (`"%OMXTERM_CTL%" status`) and Git Bash
  (`"$OMXTERM_CTL" status`), and `mcp` serves over its stdin.
- **A `.cmd` re-parses its command line, so the CLI isn't for arbitrary
  text on Windows.** Windows runs a batch file through cmd.exe, which reads
  the whole command line again before the launcher starts, so no launcher
  code can fix it. Checked from PowerShell 5.1 and Git Bash: `%NAME%`
  expands even inside quotes, and in an argument without spaces (which
  those shells pass unquoted) `^` disappears and `&` runs the rest as a
  command. `&`, `|`, `<` and `>` are cmd.exe's operators there, so
  `--text 'x&calc'` would start Calculator and `--text 'echo>notes.txt'`
  would overwrite `notes.txt`: commands run as the caller, outside the granted window.
  From PowerShell 5.1, an argument with spaces arrived intact unless it held
  a double quote: `--text 'git commit -m "fix & test"'` arrived as
  `git commit -m fix`, and cmd.exe tried to run `test""`. A batch script
  must `call` the launcher, or it never returns to the script. MCP tool
  arguments travel over stdin and never meet that parse, so MCP is the route
  for text until [#1081](https://github.com/luizomf/omxterm/issues/1081)
  (a console launcher, and text over stdin) lands; it blocks the 0.34.0
  release.

## Open questions

- Registering the MCP server in an agent's own configuration is still one
  step per agent. Should OMXTerm offer it (`omxterm-ctl setup <agent>`, or a
  Command Palette action), or leave it to the guide? Slice 2 leaves it to the
  guide: it's one command per agent, and Codex's `env_vars` shows that each
  agent's configuration has its own rules, which a `setup` command would have
  to track. Worth revisiting if users trip on it.
- Should `omxterm-ctl` also be offered on `PATH` for agents and scripts that
  run outside OMXTerm?
- Does a read work in a minimized or fully covered window on Linux? It does
  on macOS (slice 1) and Windows (slice 5).
- Limits: how many tabs and panes may an agent create, and does a grant need
  a rate limit on input?
- Should the grant show anywhere outside its window (Dock, tray, another
  window's menu) for the overnight case?
- `OMXTERM_CTL` points into the AppImage's current mount. A multiplexer server
  started in a pane outlives the app and keeps a dead path; is a stable copy
  (or a `PATH` entry) worth it?
