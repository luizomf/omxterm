# Agent API reference

The wire protocol and CLI of
[ADR 0052](../adr/0052-let-a-local-agent-drive-a-granted-window.md), on
macOS, Linux and Windows (slice 5). Slices 1 and 2 are implemented: the handshake, `list`, `send`,
`read`, `wait`, the `omxterm-ctl` commands without a slice mark, its `guide`
and its [MCP server](#mcp). Slice 3 is implemented too: the exact `screen`
source of [`read`](#read-tail-and-screen) and `match` in
[`wait`](#wait). From slice 4, the tab tree in
[`list`](#list-slice-1-tree-in-slice-4) and [`press`](#press-slice-4) with
named keys and the window's shortcuts, and [`keys`](#keys-slice-4), are implemented. Each later
command says which slice of the ADR's plan it belongs to; until then, names
and shapes can still change.

Slice 4 follows the ADR's
[keyboard-parity rule](../adr/0052-let-a-local-agent-drive-a-granted-window.md#keyboard-parity):
in the granted window an agent can press any key or shortcut the user can,
except the grant toggle.

## Finding the endpoint

A client needs the profile directory (Electron userData):

| Platform | Default profile                         | Endpoint                        |
| -------- | --------------------------------------- | ------------------------------- |
| macOS    | `~/Library/Application Support/omxterm` | `<profile>/agent-api/ctl.sock`  |
| Linux    | `${XDG_CONFIG_HOME:-~/.config}/omxterm` | `<profile>/agent-api/ctl.sock`  |
| Windows  | `%APPDATA%\omxterm`                     | `\\.\pipe\omxterm-agent-<hash>` |

`<hash>` is the first 16 hex characters of the SHA-256 of the profile path. A
non-default profile (`--user-data-dir`) is passed with `--profile`. The pipe
uses Node's default security descriptor: other users can't write to it, but
can still connect read-only and hold a pre-handshake slot, or create the
name first so a grant is refused. The token is still required for anything
else. On Windows the client only accepts a grant file whose `endpoint` is
that local pipe name.

Each grant has one file, `<profile>/agent-api/grants/<window>.json`, readable
only by the user (mode `0600`; on Windows, the inherited ACL of
`%APPDATA%\omxterm`) and removed when the grant ends:

```json
{
  "version": 1,
  "instance": "5f0c9a1e2b3d4c6f",
  "window": 3,
  "endpoint": "…/agent-api/ctl.sock",
  "token": "<64 hex>"
}
```

No grant file means no window is granted. With several, the client must pick a
window.

A client started inside a pane doesn't need any of that. Every pane has:

| Variable          | Value                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `OMXTERM_CTL`     | Absolute path of the `omxterm-ctl` launcher (`omxterm-ctl.exe` on Windows).   |
| `OMXTERM_PROFILE` | The profile directory.                                                        |
| `OMXTERM_PANE`    | The process instance, window and session id, such as `5f0c9a1e2b3d4c6f:3:s4`. |

None is secret and all three exist whether or not the window is granted. The
instance is 16 random hex digits chosen when OMXTerm starts. A source run and
the installed app can share a profile and both have a window 3; a client in a
pane only uses a grant file with its own `instance`, and main refuses a hello
for another instance.

## Framing

UTF-8, one JSON object per line, in both directions. A request line is at most
256 KiB. Requests on one connection may overlap; responses carry the request's
`id`.

```json
{ "id": 1, "cmd": "read", "args": { "pane": "s4" } }
{ "id": 1, "ok": true, "result": { "text": "…" } }
{ "id": 2, "ok": false, "error": { "code": "unknown-pane", "message": "No such pane in this window." } }
```

## Handshake

The token never crosses the connection. Both sides prove they hold it.

```
client                                       main
  | {"hello":1,"instance":I,"window":3,"pane":"s4","nonce":C} >|
  | <------- {"hello":1,"nonce":S,"proof":P1}   |   P1 = HMAC(token, "server" + C + S)
  | {"proof":P2}  --------------------------->  |   P2 = HMAC(token, "client" + C + S)
  | <------- {"ok":true,"window":3,"protocol":1}|
```

`instance` is the grant file's; main closes a hello for another instance as
it does an unknown window. `pane` is optional: a client inside a pane sends its own id from
`OMXTERM_PANE`, and `list` then marks that pane as `self`. HMAC is HMAC-SHA-256
keyed with the token's 32 bytes over the ASCII text shown; nonces are 32 random
bytes in lowercase hex. Each handshake line is at most 1 KiB and the handshake
must finish within 5 s. A client that gets a
wrong `P1` must close: the endpoint isn't OMXTerm. A wrong `P2`, an unknown
window or a silent client closes the connection after a short delay with no
detail. After the handshake the connection is bound to that window until the
grant ends.

## Commands

Pane ids are the window's session ids (`s4`); tab ids are assigned by the
window (`t2`). Both are valid for this grant only.

### `list` (slice 1; tree in slice 4)

```json
{ "id": 1, "cmd": "list" }
```

```json
{
  "window": 3,
  "tabs": [
    {
      "tab": "t1",
      "title": "zsh",
      "selected": true,
      "panes": [
        {
          "pane": "s1",
          "focused": true,
          "self": false,
          "cols": 120,
          "rows": 32,
          "live": true
        }
      ]
    }
  ]
}
```

Tab ids come from the window and are handed out the first time `list` shows a
tab; a tab keeps its id while it lives, whatever its position. `selected`
marks the visible tab. Per pane, `focused` is the pane that takes the user's
keys (a pane in a hidden tab is never `focused`), and `self` is the caller's
own pane. `cols` and `rows` are missing until the pane has a size, and `live`
is false for a pane whose program has ended: `send`, `read`, `wait` and
`press` answer `not-live` for it. Settings and extension tabs
are listed with `panes: []`. Pane ids are the same ids `send`, `read`, `wait`
and `press` take.

`list` asks the window for its tabs, like `read` asks for text, and answers
`unavailable` when it doesn't answer in time. Titles are the display-only tab
titles (ADR 0010), so they are untrusted text: main replaces control
characters with spaces and the window caps them at 200 characters. Slice 1
returned a flat top-level `panes` list; that field is gone.

The CLI prints one line per tab and its panes indented under it, tab-separated:

```text
t1	zsh	selected
  s1	120x32	focused	self
  s2	59x32
t2	vim
  s3	120x32
```

### `send` (slice 1)

`text`, `keys` or both; with both, the text comes first and the keys follow
in their own write after a gap. `send` writes bytes to the PTY and never
matches shortcuts; keys that depend on the pane's mode, and shortcuts, are
[`press`](#press-slice-4).

```json
{ "id": 2, "cmd": "send", "args": { "pane": "s1", "text": "npm test" } }
{ "id": 3, "cmd": "send", "args": { "pane": "s1", "keys": ["Enter"] } }
```

- `text` is written as is, at most 64 KiB of UTF-8. No newline is added.
- One final line break (`\n`, `\r\n` or `\r`) in `text` means "and run it":
  it is taken off the text and sent as `Enter` after it, as `keys` would,
  and keys that already end with `Enter` get no second one. `ls\n` is typed
  `ls`, then Enter, as before #1110.
- A `text` with a line break (CR or LF) left inside it is a paste when the pane's program
  enabled bracketed paste (DECSET 2004): it is written between `ESC [200~` and
  `ESC [201~`, as the user's paste arrives, so a shell takes all of it before
  running any of it (#1110). Main first waits (bounded) for the window to
  take the output it sent, then asks it for the pane's mode; a window that
  doesn't answer fails the send with `unavailable` and nothing is written. A
  text to paste that contains `ESC [201~` is `invalid-request`. Without the
  mode, the text is typed: a shell runs its first line while the rest waits
  as type-ahead, which the next program that reads input (ssh, sudo, `read`)
  takes. One-line texts are always typed, with no round trip. `a\nb\n` in a
  pane with bracketed paste is the paste `a\nb`, then Enter.
- Keys after a text wait 200 ms plus 2 ms per KiB of the text, then are
  written apart (#1109). Claude Code reads a chunk with text and Enter as a
  paste, so Enter adds a line; SSH merges writes up to about 10 ms apart;
  Codex takes an Enter within 120 ms of a fast run of typed characters as a
  newline; and a long text drains through tmux at about 1 to 2 ms per KiB
  after main's write. When the grant ends, the agent's request is cancelled
  or the pane ends during the gap, the keys aren't written: the first
  answers `revoked`, the second fails the request, and the third answers
  `receipt: "unknown"`, since the text was written.
- A pane's `send`s and `press`es write in turn, so another request never
  lands between a send's text and its keys.
- `keys` in slice 1: `Enter`, `Tab`, `Escape`, `Backspace`, `Space` and
  `Ctrl+A` … `Ctrl+Z`, in any letter case, at most 64 per request. Other names
  answer `unsupported-key`.
- Text and keys together are at most 64 KiB, counting a multi-line text's
  paste markers, or the request answers `too-large`.

```json
{ "receipt": "accepted", "offset": 48211 }
```

`offset` is the pane's output position when the bytes were written; pass it to
`wait` as `after`. `receipt` is `accepted` or `unknown` (the write may have
partly happened; it is never retried). A refused write is the error
`not-live`.

### `read` (tail and screen)

```json
{ "id": 4, "cmd": "read", "args": { "pane": "s1", "lines": 200 } }
{ "id": 5, "cmd": "read", "args": { "pane": "s1", "source": "screen" } }
```

- `tail` (default): the last `lines` lines of retained history plus screen
  (default 200, at most 10,000), without the blank rows below the cursor. It
  includes output from before the grant. A tail longer than 2 MiB of text is
  cut at its start and answers `"truncated": true`. The read first waits up
  to 1 s for the window to consume what main already sent.
- `screen`: exactly the active screen's rows, one line per row, blank rows
  included, wherever the user scrolled the pane's view. A line that wraps
  reads as one line per row it takes. It takes no `lines`; with `lines` it
  answers `invalid-request`. Reading doesn't move the user's scroll position,
  selection or cursor. The read first waits up to 1 s like a tail.
- Text only, trailing spaces trimmed per row. The alternate screen reads only
  its own contents.
- Any other `source` answers `invalid-request`.

```json
{ "text": "…", "cols": 120, "rows": 32, "offset": 51877, "truncated": false }
```

`offset` is the position the window had consumed when the text was read.

Later, without changing these fields: `"source": "command"` for one command's
output once OSC 133 lands (slice 8).

### `wait`

```json
{
  "id": 6,
  "cmd": "wait",
  "args": {
    "pane": "s1",
    "after": 48211,
    "idleMs": 800,
    "match": "Tests passed",
    "timeoutMs": 120000
  }
}
```

- `timeoutMs` is required, at most 600,000. A longer wait is a new request.
- `after`: only output past this position counts. Without it, the position
  when the request arrived is used.
- `idleMs` (default 500, 100 to 60,000): satisfied when output has moved past
  `after`, none arrived for that long, and the window has consumed it all.
- `match`: a literal string of 1 to 1,024 characters, not a regular
  expression, looked for in the pane's screen text (what `read` with
  `source: "screen"` answers, rows joined by `\n`). It answers once the
  window has shown output past `after` and a screen holds more copies of
  the text than the fewest it held since `after`. So an old copy still on
  screen doesn't count, one that scrolled off doesn't hide a new one, and
  one that leaves and comes back on the same screen counts again.
  - The main and alternate screens are counted apart. The screen at `after`
    starts from its count then, the alternate screen (when the main one was
    there) starts empty, and any other screen starts from its first look:
    an old result doesn't answer when the main screen comes back after an
    editor or pager quits. A resize starts the count again from a look.
  - The screen at `after` is known when `after` is the offset the pane's
    latest `send` or `press` returned, or the current position. For any
    other `after` it isn't, and the count starts from the first look.
  - Run a command and wait for its output with `send` then `wait`, passing
    the `send`'s offset as `after` (`omxterm-ctl send … --match TEXT` does
    both). A `wait` without `after` counts from its own arrival, so it can
    miss output that came first.
  - The echo of the typed command is new output too. For a command you
    write, print a marker the command line doesn't contain and that is new
    each time, such as `echo DONE-$((40+2))` matched as `DONE-42`, with a
    different number for each command.
  - A line wider than the pane is split across rows, and so is a match on
    it.
  - Main looks at the screen each time the window shows more output, at
    most every 50 ms. Text that appears and scrolls off between two looks
    is missed (`timeout`), so wait for text that stays, such as a final
    line.
- The first condition met answers. At least one of `idleMs` or `match`
  applies; with only `match`, idleness is ignored.

```json
{ "reason": "match", "offset": 50213 }
```

With `match`, `offset` is the position the screen showed when the text
appeared.

```json
{ "reason": "idle", "offset": 51877 }
```

`reason` is `idle`, `match`, `timeout` or `exited` (the pane's program ended;
the result adds `exitCode`). A timeout is a normal result, not an error. Later:
`command-end` with `exitCode` (slice 8). Clients must ignore reasons and fields
they don't know.

### `press` (slice 4)

Keys and shortcuts, as the user would press them in the granted window.

```json
{
  "id": 7,
  "cmd": "press",
  "args": { "pane": "s1", "keys": ["Down", "Down", "Enter"] }
}
```

```json
{ "receipt": "accepted", "offset": 51877 }
```

- `keys`: 1 to 64 names, pressed in order in one write. A name is `Up`,
  `Down`, `Left`, `Right`, `Home`, `End`, `PageUp`, `PageDown`, `Insert`,
  `Delete`, `F1` … `F12`, `Enter`, `Tab`, `Escape`, `Backspace` or `Space`,
  after any of `Ctrl+`, `Alt+` and `Shift+`, each at most once
  (`Ctrl+Shift+Up`), in any letter case. Anything else answers
  `unsupported-key` and nothing is written. So does `Ctrl+Space` (with any
  other modifier) on macOS, which keeps it for switching input sources: the
  user's own press sends the pane nothing.
- The window encodes each key for the pane's current modes (application
  cursor keys, Kitty keyboard flags) with the same encoder as the user's key,
  and main writes the bytes, so a press is exactly a user press and release:
  `Up` is `ESC [ A`, or `ESC O A` once the program asked for application
  cursor keys. That includes the encoder's legacy choices: without Kitty
  flags, modifiers on `PageUp`, `PageDown`, `Insert`, `Delete` and the
  function keys are dropped, and `Ctrl+Left`/`Ctrl+Right` send `ESC b`/`ESC f`.
  `Alt` is the terminal's Alt, whatever `optionKeyMode` says.
- Like `read`, it first waits up to 1 s for the window to consume the output
  main has already received from the pane, so the modes that output set are
  in place. Output still on its way can change them later. All keys of one
  press are encoded against the same modes. The answer is `send`'s: `offset` for `wait`'s `after`. A window that
  can't encode in time, or a pane that can't take input yet, answers
  `unavailable`.
- It works while the granted window isn't the selected one. Like `send`, it
  never passes the window's keyboard handling.

**Shortcuts** ([#1050](https://github.com/luizomf/omxterm/issues/1050),
[#1052](https://github.com/luizomf/omxterm/issues/1052)).
Main matches each chord against the window's effective shortcuts (defaults
plus the user's rebinds, the same matcher a real key goes through). A chord
here may also name a character key and `Cmd` (macOS Command, Super
elsewhere), as accelerators do: `Cmd+T`, `Ctrl+Shift+]`, `Cmd+Ctrl+=`,
`Cmd+Plus`.

```json
{ "id": 8, "cmd": "press", "args": { "pane": "s3", "keys": ["Cmd+Alt+W"] } }
{ "id": 8, "ok": true, "result": { "action": "closePane", "pane": "s3" } }
```

- A tab or pane action (`newTab`, `closeTab`, `nextTab`, `previousTab`,
  `selectTab1` … `selectTab9`, `splitRight`, `splitDown`, `closePane`,
  `focusNextPane`, `focusPreviousPane`, `focusPaneLeft` … `focusPaneDown`,
  `swapPaneLeft` … `swapPaneDown`, `equalizePanes`) runs in the granted window
  on the pane `press` names, even when another window is selected: the window
  first focuses that pane, selecting its tab, as a user clicks a pane and
  presses, so `press s3 Cmd+W` closes the tab holding `s3`. So do `zoomIn`,
  `zoomOut`, `actualSize`, `toggleTabBar` and `toggleTitleBar`, and `copy`
  and `selectAll`, which take that pane's selection. The result names
  the action and the pane; nothing is written to the PTY. The chord must be
  the press's only key (`invalid-request` otherwise). A window that can't take
  it now (a dialog or preview over it) answers `unavailable`.
- `toggleFullScreen`, `closeWindow` and `quit` act on the granted window
  from main, whichever window is selected. `toggleFullScreen` runs only while
  the user is in the granted window; from another window it answers
  `needs-user`, since full screen would move the user to it (a new Space on
  macOS).
- A close (`closeTab`, `closePane`, `closeWindow`, `quit`) that would ask to
  confirm a Busy Session, with `confirmClose` on, answers `needs-user` and
  does nothing; so does one while the user is confirming a close or quit,
  while a native dialog is open over the window (Protected Paste, an export,
  an extension install, a session failure), or while it closes, and a `quit`
  while other windows are open, since it would close them too. The message says which. The confirmation
  stays the user's. With `confirmClose` off it closes, as the user's press
  would. Closing the last tab, the window, or quitting ends the grant, so the
  answer may be `revoked`, or the connection may close, instead.
- The **Allow Agents in This Window** shortcut answers `refused`, whatever
  chord it is bound to, and nothing is written. The Command Palette, Find,
  Paste, New Window, Reload Configuration, the Snippets, Files and SSH Connect panels,
  the Auxiliary Panel's toggle and move, Mirror Typing and Save layout answer
  `not-yet`, with the reason in the message. Settings, About, Always on Top,
  Open Local Image and Developer Tools have no shortcut, so `press` can't
  reach them.
- A named-key chord that is no shortcut goes to the pane as a key; any other
  chord answers `unsupported-key`.
- An ungranted window or an ended grant refuses as `send` does.

### `keys` (slice 4)

Lists the granted window's effective shortcuts, including the user's rebinds,
and marks the ones that are refused or "not yet", so agents look there
instead of guessing ([#1051](https://github.com/luizomf/omxterm/issues/1051)).

```json
{ "id": 9, "cmd": "keys", "args": {} }
{ "id": 9, "ok": true, "result": { "shortcuts": [
  { "action": "newTab", "chord": "Cmd+T", "status": "available" },
  { "action": "toggleAgentAccess", "chord": null, "status": "refused" },
  { "action": "find", "chord": "Cmd+F", "status": "not-yet" }
] } }
```

- It takes no arguments. It reads the same table as `press`
  (`src/main/agent-shortcuts.ts`) and the live catalog, so a rebind in
  `config.json` shows up and what `keys` marks `available` is
  what `press` runs. `chord` is the display form `press` takes, or `null` when
  the user unbound the action; `refused` and `not-yet` are the codes `press`
  answers with. Every action is listed.
- The CLI prints one line per shortcut: chord (`-` when unbound), action, and
  `refused` or `not-yet` when `press` won't run it. `--json` prints the result.

### Tabs and panes (slice 4)

There are no tab or pane commands. An agent opens, splits, selects and closes
tabs and panes with the user's own shortcuts through `press`, then sees the
result in `list`. A new tab or pane starts the Default Shell, in the source
pane's folder for a split, exactly like the user's New Tab and Split; the
agent types what it wants to run. Closing the last tab closes the window and
ends the grant.

## Errors

| Code              | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `invalid-request` | Not JSON, too long, unknown command, or a wrong argument shape.         |
| `revoked`         | The grant ended. The connection closes after this response.             |
| `unknown-pane`    | No such pane in this window (also used for another window's ids).       |
| `not-live`        | The pane's program has ended or the pane is still starting.             |
| `unsupported-key` | A key name this version can't encode.                                   |
| `too-large`       | The text to send or the text to return is over its limit.               |
| `limit`           | Too many tabs, panes, connections or pending waits.                     |
| `unavailable`     | The window couldn't answer in time (a read, a press or a tree request). |
| `refused`         | The press named the grant toggle's shortcut; only the user toggles it.  |
| `not-yet`         | UI agents can't use yet, or an action past the window.                  |
| `needs-user`      | Left to the user: a running program, an open dialog, another window.    |

`message` is one English sentence for people reading logs of their own
scripts. Programs should branch on `code`.

## CLI

`omxterm-ctl` is one dependency-free script over the protocol. It reads the
grant file itself; a token is never passed as an argument.

```sh
omxterm-ctl status                         # granted or not, in one sentence
omxterm-ctl guide                          # the agent guide, a SKILL.md
omxterm-ctl mcp                            # MCP server on stdio
omxterm-ctl grants                         # granted windows of this profile
omxterm-ctl list
omxterm-ctl send s1 --text 'npm test' --enter --wait --idle 800
omxterm-ctl send s1 --keys Ctrl+C
printf '%s' "$text" | omxterm-ctl send s1 --text - --enter
omxterm-ctl wait s1 --after 48211 --idle 800 --timeout 120000
omxterm-ctl send s1 --text 'npm test' --enter --match 'Tests passed' --timeout 120000
omxterm-ctl wait s1 --after 48211 --match 'Tests passed' --timeout 120000
omxterm-ctl read s1 --lines 200
omxterm-ctl read s1 --screen               # the screen's rows, one line each
omxterm-ctl press s1 Down Down Enter       # slice 4
omxterm-ctl press s3 Cmd+Alt+W             # slice 4: closePane on s3
omxterm-ctl keys                           # slice 4: chords press runs
```

- Inside a pane, agents call it as `"$OMXTERM_CTL"`; window and profile come
  from the environment. On Windows that is `& $env:OMXTERM_CTL` in
  PowerShell, `"%OMXTERM_CTL%"` in cmd and `"$OMXTERM_CTL"` in Git Bash. It
  is `omxterm-ctl.exe`, a console program that runs the app's own executable
  in Node mode with the caller's arguments untouched, shares its console,
  ends the client on Ctrl+C or when it is killed itself, and returns the
  client's exit code. Only the caller's own shell changes arguments: Windows
  PowerShell 5.1 splits an argument that holds a double quote unless each
  one is written `\"`, and Git Bash (MSYS) rewrites an argument that looks
  like a POSIX path (`--text /exit` arrives as `C:/Program Files/Git/exit`);
  use `--text -` or `MSYS_NO_PATHCONV=1`. The guide shows the call per shell,
  and that an agent should clear the line (`Ctrl+U`) before `press Up`.
- `send --text -` and `wait --match -` (or `send --match -`) read the text
  from stdin as UTF-8, so it never meets a shell's quoting. Leading byte
  order marks and one final line break are dropped; `--enter` presses Enter.
  Windows PowerShell 5.1 pipes ASCII unless
  `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)` is set first.
  Elsewhere, `--window <id>` picks a grant when there
  are several and `--profile <dir>` picks a profile. A `--profile` other than
  the pane's own `OMXTERM_PROFILE` ignores the pane, so nothing is marked
  `self`. `--json` prints the raw result.
- When the client's own pane is unknown (no `OMXTERM_PANE`, or another
  profile), `status` and `list` add one sentence saying no pane is marked
  `self` and the caller may be in one of them; `--json` adds it as `note`.
- `status` exits 0 when this window is granted. Otherwise it prints one
  sentence naming **Allow Agents in This Window** and exits 3, so an agent
  can pass the sentence on to the user.
- `guide` prints `src/agent-ctl/SKILL.md` as is, frontmatter included, so
  `"$OMXTERM_CTL" guide > <skills>/omxterm/SKILL.md` installs it as a skill.
  It needs no grant.
- `mcp` serves the commands as MCP tools; see [MCP](#mcp).
- `send` remembers nothing between calls. `--keys` takes a comma-separated
  list, `--enter` adds `Enter` to the same request, and `send … --wait`
  runs `wait` with the returned `offset` on the same connection, which is the
  reliable way to type a command and wait for it. `--match TEXT` on `send`
  waits the same way, for that text. `--timeout` defaults to 60000 for
  `wait` and `send --wait`.
- A pane may be named `s4`, `3:s4` or as `OMXTERM_PANE` spells it,
  `5f0c9a1e2b3d4c6f:3:s4`; the window part must be the granted window's and the
  instance part this OMXTerm process's, or the pane "belongs to another window".
- `press` takes the keys as arguments after the pane (`--keys` with a
  comma-separated list works too) and prints nothing for keys; a shortcut
  prints the action and the pane, tab-separated. `--json` prints the result.
- `read` prints the text and nothing else, so it pipes.
- Exit status: 0 for a result (a `wait` timeout prints `timeout` and exits
  124), 1 for an API error, 2 for usage, 3 when no grant or endpoint was found.

## MCP

`omxterm-ctl mcp` is an MCP server on stdio, in the same dependency-free
script. It answers both the per-request protocol (`2026-07-28`, opened with
`server/discover` or any request whose `_meta` names its version, as Claude
Code does) and the `initialize` handshake (`2025-11-25` back to `2024-11-05`,
as Codex does). It offers tools only.

| Tool     | Arguments                                                                                    |
| -------- | -------------------------------------------------------------------------------------------- |
| `status` | `window?`                                                                                    |
| `list`   | `window?`                                                                                    |
| `send`   | `pane`, `text?`, `keys?` (list), `enter?`, `wait?`, `idle?`, `match?`, `timeout?`, `window?` |
| `press`  | `pane`, `keys` (list), `window?`                                                             |
| `read`   | `pane`, `lines?`, `screen?`, `window?`                                                       |
| `wait`   | `pane`, `after?`, `idle?`, `match?`, `timeout?`, `window?`                                   |

| `keys` | `window?` |

- A tool call is the CLI command of the same name, with the arguments as its
  options, on its own connection. The tools are always listed; the grant is
  looked up on every call, so a grant given or ended mid-session counts from
  the next call.
- The result is one text block with what the CLI would print. `send` without
  `wait` answers its receipt as JSON, for the `offset`, and `press` its
  receipt or the action and pane it ran, as JSON. A `wait` timeout is a
  normal result (`timeout`).
- No grant, an API error or a bad argument is a tool error (`isError`) whose
  text is the CLI's message; without a grant that's the `status` sentence. An
  unknown tool or method is a JSON-RPC error.
- `timeout` defaults to 50000 here, not 60000, so a wait answers before
  Codex's default 60 s tool timeout.
- `--profile` on the `mcp` command line applies to every call; `--window`
  applies to every call that doesn't pass its own `window`. The several-windows
  error names the `window` argument.
- A `pane` must be a pane id (`s4`, `3:s4` or `5f0c9a1e2b3d4c6f:3:s4`); anything else is a tool error.
- Calls run concurrently; `notifications/cancelled` drops that call's
  connection. The server exits when stdin closes.

Register it from an OMXTerm pane, so the client path is known. The tools
appear in the agent's next session. The guide has the same commands.

```sh
claude mcp add --scope user omxterm -- "$OMXTERM_CTL" mcp
```

Claude Code passes its whole environment to the server. Codex passes only a
short default list, so the server can't see its pane unless the variables are
in the server's `env_vars`. `codex mcp add` has no option for that, so the
second line adds it (rerunning both is safe: `add` rewrites the table):

```sh
codex mcp add omxterm -- "$OMXTERM_CTL" mcp &&
  sed -i.bak '/^\[mcp_servers\.omxterm\]$/a\
env_vars = ["OMXTERM_PROFILE", "OMXTERM_PANE", "OMXTERM_CTL"]
' "${CODEX_HOME:-$HOME/.codex}/config.toml"
```

Without `OMXTERM_PANE` the server acts like a client outside OMXTerm: the
default profile, the only granted window, and no `self` pane, which `status`
and `list` say. Registration stores the expanded path; on an AppImage it
changes with every launch, so register `sh -c 'exec "$OMXTERM_CTL" mcp'` there
instead.

## Where it lives

| Area                     | Where                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Wire limits and keys     | `src/shared/agent-api.ts`, shared by main and the client                                                   |
| Grants and credentials   | `src/main/agent-access.ts`                                                                                 |
| Socket and handshake     | `src/main/agent-endpoint.ts`                                                                               |
| Window requests          | `src/main/agent-window-requests.ts` (reads, presses, tabs and actions asked of the window)                 |
| Commands and waits       | `src/main/agent-commands.ts`                                                                               |
| Agent input and outputs  | `agentSessions` in `src/main/terminal-ipc-controller.ts` (the only agent write)                            |
| Pane environment         | `createLocalTerminalSession()` in `src/main/local-terminal-session.ts`                                     |
| Reads and marks (window) | `src/renderer/agent-access.ts`, `src/renderer/state-marks.ts`, `src/preload/agent-bridge.ts`               |
| Mark tone                | `src/renderer/ui.css`, `src/renderer/terminal-window-theme.ts`, `src/renderer/terminal-pane-accent.ts`     |
| Toggle                   | `src/main/action-catalog.ts`, `src/main/application-menu.ts`, `src/shared/terminal-keybinds.ts`            |
| Client and launcher      | `src/agent-ctl/` (built to `dist/agent-ctl/`, packaged under `resources/agent-ctl/`)                       |
| Agent guide              | `src/agent-ctl/SKILL.md`, bundled into the client as text                                                  |
| MCP server               | `src/agent-ctl/mcp.ts`, over the CLI's commands in `src/agent-ctl/commands.ts`                             |
| Screen-only read         | `getScreenText` in `scripts/restty-buffer-text-corrections.mjs`, through the Surface's `readScreen()`      |
| Shortcuts for `press`    | `src/main/agent-shortcuts.ts`, `keyboardInputForAccelerator()` in `src/shared/terminal-keybinds.ts`        |
| Running them in a window | `runSessionCommand` in `src/renderer/terminal-tabs.ts`; `agentCloseNeedsUser` in `terminal-application.ts` |
| Mode-aware key encoding  | `encodeKeyPress` in `scripts/restty-key-press-corrections.mjs`, through the Surface and `terminal-tabs.ts` |
