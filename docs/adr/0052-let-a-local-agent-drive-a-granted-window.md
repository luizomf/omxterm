# Let a local agent drive a window the user grants

Status: proposed ([#1025](https://github.com/luizomf/omxterm/issues/1025),
building on [#330](https://github.com/luizomf/omxterm/issues/330)). Nothing
here is implemented. When it is, it amends
[ADR 0050](0050-show-ongoing-states-as-quiet-state-marks.md) (one accent tone,
window-scoped marks) and
[ADR 0004](0004-log-the-operational-envelope-not-terminal-payload.md) (API
payloads join the excluded content). The wire protocol and CLI are sketched in
the [Agent API reference](../dev/agent-api.md).

## Context

Agents already drive terminals, through tmux or UI automation. OMXTerm is a
terminal built for running agents, with no embedded model or chat UI, so the
missing piece is a first-class route for an outside program to do what a tmux
client does: open tabs and panes, type, read the screen, and wait.

The owner's decisions are settled in #1025: the grant covers one window; inside
it the agent has full autonomy; it stays until the user stops it; it is visible
as an accent State Mark; core owns it in Electron `main`. This record makes
those concrete against the code and says where they don't hold as written.

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
  sessions and the selected tab's sessions, not the tree. Pane commands
  (`split`, `close-pane`, `new`) act on the focused pane, return nothing, and
  move the selection.
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
                            |  agentInput() ------+--> PTY     +--------------------------+
                            |  output positions   |<-- PTY
                            +---------------------+
```

### Grant

- A grant belongs to one Terminal Window and lives in main's memory only.
  **Allow Agents in This Window** is a toggle in the Window menu and the
  Command Palette, with a rebindable shortcut that has no default. Turning it
  on flashes one sentence; there is no confirmation dialog.
- Only that gesture creates a grant. The API has no command that grants, lists
  other windows, runs an application action, or types into anything but a PTY.
  Agent bytes are written to the PTY in main and never pass the window's
  keyboard handling, so an agent can't press the shortcut that would grant
  another window.
- It ends when the user clicks a mark, uses the toggle, closes the window or
  quits, and also when main can't keep its side of the bargain: the renderer
  is lost or reloads, or the endpoint can't be held. Ending closes every
  connection of that grant; in-flight waits fail with `revoked`. Switching
  tabs, modals, blur, hide and minimize don't end it.
- It is never written to disk as state, never restored by reopen-at-startup
  (ADR 0047) or Saved Layout, and never activated by `config.json`, a launch
  argument or an extension.

### Transport and discovery

- Main listens only while at least one grant exists. One endpoint per running
  process: a Unix socket at `<profile>/agent-api/ctl.sock` on macOS and Linux
  (directory `0700`, socket `0600`), and the named pipe
  `\\.\pipe\omxterm-agent-<hash of the profile path>` on Windows. No TCP.
- The profile is the Electron userData directory, the same key as the
  single-instance lock, so "the right running process" is "the one that owns
  this profile". A client derives the default profile path per platform or
  takes `--profile`. A stale socket file is replaced only after a connect to
  it is refused. If another live process already holds the endpoint (a source
  run next to the installed app), the grant is refused with one sentence.
- A grant has a random 256-bit token. Main writes
  `<profile>/agent-api/grants/<window>.json` (`0600`: endpoint, window id,
  token) and deletes it when the grant ends; leftovers are removed at startup.
  The token never travels in argv or environment variables.
- A connection authenticates with a mutual HMAC challenge over the token, so
  neither side sends it and a client can tell a real endpoint from something
  squatting on the name. An authenticated connection is bound to that grant's
  window; every pane and tab id it sends is checked against that window.
- The protocol is newline-delimited JSON, versioned in the handshake. It is
  the contract; `omxterm-ctl` is a small dependency-free client over it,
  run by the bundled runtime in Node mode (the mechanism ADR 0040 uses) or by
  any Node.

### Input

- Agent input enters at one function in main, `agentInput(grant, pane, data)`,
  which checks the grant and the pane's window and calls `writeTracked()`.
  It is the only place agent bytes are written, so a later record of what the
  agent typed has one place to attach.
- It bypasses the Surface. Consequences, all intended: agent bytes never reach
  `routeKeyInput`, so they never enter a Mirror Typing route and never stop
  one; they skip Protected Paste and its confirmation; they don't scroll the
  user's viewport to the bottom; they don't clear a bell.
- The user's keyboard keeps working in every pane. Each request is one bounded
  write, so a request isn't split by a keystroke, but requests and keystrokes
  interleave freely. There is no input lock.
- Main doesn't know terminal modes. The first slice sends literal text and a
  fixed table of mode-independent keys (`Enter`, `Tab`, `Escape`,
  `Backspace`, `Ctrl+<letter>`). Arrow and function keys, whose bytes depend
  on application-cursor and Kitty modes, and paste that honors bracketed
  paste mode, need a renderer-encoded route and come later.

### Reading and waiting

- `read` is a main-to-renderer round trip with a correlation id and a
  timeout, like layout capture. Before asking, main waits (bounded) until the
  renderer has acknowledged everything main has sent for that session, so a
  read after a `send` doesn't race the parser.
- `screen` needs one more read-only runtime accessor beside `getBufferText()`:
  the active screen's rows, independent of where the user scrolled.
  `scrollback` reuses the export path and its bound, returned as a tail of N
  lines. Text only; no colors or cell attributes.
- **Scrollback from before the grant is readable.** Restty has no stable row
  marker to fence it (rows reflow on resize and are evicted), and an agent
  that can type can print any file the user can read, so hiding earlier
  output would protect nothing. The grant sentence says "read".
- `wait` is built in main on the output positions it already keeps. `send`
  returns the session's position; `wait` takes `after` (only output past that
  position counts), `idleMs` (no output for that long, and the renderer caught
  up), an optional literal `match` checked against the screen text, and a
  required bounded `timeoutMs`. It answers with a tagged `reason`: `idle`,
  `match`, `timeout` or `exited`. OSC 133
  ([#1027](https://github.com/luizomf/omxterm/issues/1027)) later adds
  `reason: "command-end"` with `exitCode` and a read source for one command's
  output without changing existing fields.
- Without command boundaries, `idle` is a heuristic: a spinner or a prompt
  clock never goes idle, and a slow command can pause. That is why `match`
  and the timeout exist.

### Tabs and panes

- Ids are the window's session ids for panes and renderer-assigned ids for
  tabs, valid for that grant only. `list` is a renderer round trip that
  returns the tree.
- Creating, splitting, closing and selecting need new renderer commands that
  take a pane or tab id and answer with the new id; today's commands act on
  the focused pane and answer nothing. Closing a Busy Session refuses unless
  the request says `force`. Closing the last tab closes the window and the
  grant with it.
- An agent that selects a tab or pane moves the user's selection, and tab
  selection stops a Mirror Typing group as it does for the user (ADR 0043).

### Visible state

- `stateGlyphs` gains `agent`. Marks get a window scope:
  `setWindow(owner, mark)`, rendered on every pane of the window, including
  panes created later, and once on every tab. Today `set()` is keyed by pane
  and Application Tabs (Settings) get no marks.
- The pane mark is actionable: clicking it ends the grant. Its label names the
  state and the stop ("Agents can control and read this window. Click to
  stop."). The tab copy stays a plain glyph.
- The tone is core-owned. `ui.css` gains `--ui-accent`, set from the same
  derivation as the focused-pane line (`terminalPaneAccent()`: the theme's
  cyan, or the foreground when cyan lacks contrast), and CSS maps
  `.ui-mark[data-glyph="agent"]` to it, including on hover. Reporters still
  never pass a color. It doesn't reuse `--terminal-pane-accent`, because a
  theme can set `appearance.activePaneHighlight` to `null` and a consent
  indicator can't be something a theme switches off.
- With the tab strip hidden, the selected tab's panes still carry the mark,
  so the window always shows it, with one exception that needs a fix: an
  Application Tab has no pane. A window-scoped mark also renders at the page's
  top-right corner when the selected tab has no pane.
- Main admits commands only while the renderer has confirmed the marks are
  shown. No mark, no access.
- The attention mark of
  [#1026](https://github.com/luizomf/omxterm/issues/1026) can share the
  plumbing (a glyph in the vocabulary, the glyph-to-tone CSS mapping, the tab
  copy) but is pane-scoped and should not use the accent: the accent means
  "something other than you can act here".

### Privacy

Requests, responses, tokens, pane text and typed bytes never reach operational
logs. Operational Events may record that a grant started or ended, the window,
a command name, its duration and an error code.

## Threat model

- **Other users on the machine** are stopped by the profile directory and
  socket permissions on macOS and Linux. On Windows the pipe uses the default
  security descriptor, so the token is the authenticator (see Tradeoffs).
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
  keyboard, including whatever the open SSH sessions can do.

## Tradeoffs and disagreements with #1025

- **"A named pipe with an ACL" isn't available from Node.** libuv creates
  listening pipes with no security attributes and without
  `PIPE_REJECT_REMOTE_CLIENTS`, and Node exposes neither. An owner-only pipe
  means a native helper that owns the pipe I/O. This record chooses the token
  with mutual proof as the Windows boundary and leaves the native hardening
  as an open question, with Windows as the last platform slice.
- **The token is not a wall between same-user processes.** See above. Handing
  it to the agent by hand (show it once, the user pastes it) would be one,
  at the cost of the friction the feature exists to remove.
- **`omxterm ctl` as a subcommand of the app doesn't work well.** The app
  binary starts Chromium, hands off one-way and quits (ADR 0048), is a GUI
  executable on Windows, and is an AppImage mount on Linux. The client is a
  separate small script, `omxterm-ctl`; nothing installs a command on `PATH`
  today on any platform, and that stays an open question.
- **"Visible" holds only while the window is.** A minimized, hidden or
  covered window keeps its grant, by decision, and shows nothing anywhere
  else. The menu item's check mark is the only other trace.
- **Full autonomy includes the user's focus.** New tabs and selections made
  by the agent move what the user sees. Creating without selecting depends on
  panes that were never shown being mounted and sized, which is unverified.
- **A flash instead of a confirmation** keeps the product quiet and accepts
  that a mis-click grants access until the user notices the marks.

## Rejected

- **A terminal model in main** to read without the renderer: a second parser
  to keep identical to Ghostty's.
- **Routing agent input through the Surface** (`inject()`): it would revoke
  Mirror Typing routes, trigger Protected Paste and depend on a live renderer
  for every byte. A renderer-encoded route stays possible for mode-aware keys.
- **Loopback TCP or HTTP**: reachable by every local user and by browsers.
- **Putting the token in the pane's environment**: the PTY is already running
  when the grant is given, and every child process would inherit it.

## First version and follow-up slices

1. **Drive what's there (macOS and Linux).** The grant toggle, window-scoped
   accent mark with click-to-stop, endpoint, token and handshake,
   `list` (flat panes), `send` (text and mode-independent keys), `read`
   (screen), `wait` (`idle`, `timeout`, `exited`), `omxterm-ctl`, and the
   spec, glossary, ADR 0050 and ADR 0004 amendments. It proves the security
   and visibility shape with no new renderer commands.
2. **Read more, wait better.** `read` scrollback tails and `wait` with
   `match`.
3. **Shape the window.** The tab and pane tree in `list`; create, split,
   close and select by id.
4. **Windows.** The pipe endpoint, console behavior of the client, and the
   decision on native hardening.
5. **Keys and paste by mode.** Renderer-encoded named keys and paste that
   honors bracketed paste.
6. **A record of what the agent typed.** Session-only, in memory, bounded,
   shown to the user in the window and dropped with the grant; attached at
   `agentInput()`, never in operational logs.
7. **MCP and an agent guide.** A thin MCP server over the same client, and a
   `SKILL.md` that teaches an agent the commands.
8. **Command boundaries.** With #1027: `command-end`, exit codes and
   per-command output.

## Open questions

- Windows: accept the default pipe descriptor behind the token, or pay for a
  native pipe server?
- Where does `omxterm-ctl` live for the user: an explicit "install the
  command" action, a documented path per platform, or a non-secret
  environment variable in every pane that points at it?
- Does a read work in a minimized or fully covered window on all three
  platforms? Output ingestion continues for hidden tabs, but the read depends
  on the runtime's render state. To verify in slice 1.
- Limits: how many tabs and panes may an agent create, and does a grant need
  a rate limit on input?
- Should the grant show anywhere outside its window (Dock, tray, another
  window's menu) for the overnight case?
- With several granted windows, how does an agent running inside one learn
  which is its own without an environment variable?
