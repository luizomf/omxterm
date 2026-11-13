# Agent API reference (proposed)

A sketch of the wire protocol and CLI for
[ADR 0052](../adr/0052-let-a-local-agent-drive-a-granted-window.md). Nothing
here is implemented; names and shapes can still change. Each command says which
slice of the ADR's plan it belongs to.

## Finding the endpoint

A client needs the profile directory (Electron userData):

| Platform | Default profile                         | Endpoint                        |
| -------- | --------------------------------------- | ------------------------------- |
| macOS    | `~/Library/Application Support/omxterm` | `<profile>/agent-api/ctl.sock`  |
| Linux    | `${XDG_CONFIG_HOME:-~/.config}/omxterm` | `<profile>/agent-api/ctl.sock`  |
| Windows  | `%APPDATA%\omxterm`                     | `\\.\pipe\omxterm-agent-<hash>` |

`<hash>` is the first 16 hex characters of the SHA-256 of the profile path. A
non-default profile (`--user-data-dir`) is passed with `--profile`.

Each grant has one file, `<profile>/agent-api/grants/<window>.json`, readable
only by the user and removed when the grant ends:

```json
{
  "version": 1,
  "window": 3,
  "endpoint": "…/agent-api/ctl.sock",
  "token": "<64 hex>"
}
```

No grant file means no window is granted. With several, the client must pick a
window.

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
  | {"hello":1,"window":3,"nonce":C}  ------->  |
  | <------- {"hello":1,"nonce":S,"proof":P1}   |   P1 = HMAC(token, "server" + C + S)
  | {"proof":P2}  --------------------------->  |   P2 = HMAC(token, "client" + C + S)
  | <------- {"ok":true,"window":3,"protocol":1}|
```

HMAC is HMAC-SHA-256; nonces are 32 random bytes in hex. A client that gets a
wrong `P1` must close: the endpoint isn't OMXTerm. A wrong `P2`, an unknown
window or a silent client closes the connection after a short delay with no
detail. After the handshake the connection is bound to that window until the
grant ends.

## Commands

Pane ids are the window's session ids (`s4`); tab ids are assigned by the
window (`t2`). Both are valid for this grant only.

### `list` (slice 1; tree in slice 3)

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
        { "pane": "s1", "focused": true, "cols": 120, "rows": 32, "live": true }
      ]
    }
  ]
}
```

Slice 1 returns `panes` at the top level, without tabs. Titles are the
display-only tab titles (ADR 0010), so they are untrusted text.

### `send` (slice 1; mode-aware keys in slice 5)

Exactly one of `text` or `keys`.

```json
{ "id": 2, "cmd": "send", "args": { "pane": "s1", "text": "npm test" } }
{ "id": 3, "cmd": "send", "args": { "pane": "s1", "keys": ["Enter"] } }
```

- `text` is written as is, at most 64 KiB of UTF-8. No newline is added and no
  paste framing is applied.
- `keys` in slice 1: `Enter`, `Tab`, `Escape`, `Backspace`, `Space` and
  `Ctrl+A` … `Ctrl+Z`. Other names answer `unsupported-key` until slice 5.

```json
{ "receipt": "accepted", "offset": 48211 }
```

`offset` is the pane's output position when the bytes were written; pass it to
`wait` as `after`. `receipt` is `accepted` or `unknown` (the write may have
partly happened; it is never retried). A refused write is the error
`not-live`.

### `read` (screen in slice 1; scrollback in slice 2)

```json
{ "id": 4, "cmd": "read", "args": { "pane": "s1", "source": "screen" } }
{ "id": 5, "cmd": "read", "args": { "pane": "s1", "source": "scrollback", "lines": 200 } }
```

- `screen` (default): the active screen's rows, wherever the user scrolled.
- `scrollback`: the last `lines` lines of retained history plus screen
  (default 200, at most 10,000). It includes output from before the grant.
- Text only, trailing spaces trimmed per row. The alternate screen reads only
  its own contents.

```json
{ "text": "…", "cols": 120, "rows": 32, "offset": 51877, "truncated": false }
```

Later, without changing these fields: `"source": "command"` for one command's
output once OSC 133 lands (slice 8).

### `wait` (slice 1; `match` in slice 2)

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
- `match`: a literal string of at most 1,024 characters, looked for in the
  screen text. Not a regular expression.
- The first condition met answers. At least one of `idleMs` or `match`
  applies; with only `match`, idleness is ignored.

```json
{ "reason": "idle", "offset": 51877 }
```

`reason` is `idle`, `match`, `timeout` or `exited` (the pane's program ended;
the result adds `exitCode`). A timeout is a normal result, not an error. Later:
`command-end` with `exitCode` (slice 8). Clients must ignore reasons and fields
they don't know.

### Tabs and panes (slice 3)

| Command      | Arguments                                  | Result                          |
| ------------ | ------------------------------------------ | ------------------------------- |
| `tab.new`    | none                                       | `{ "tab": "t3", "pane": "s7" }` |
| `tab.select` | `tab`                                      | `{}`                            |
| `tab.close`  | `tab`, `force?`                            | `{}`                            |
| `pane.split` | `pane`, `direction`: `"right"` or `"down"` | `{ "pane": "s8" }`              |
| `pane.focus` | `pane`                                     | `{}`                            |
| `pane.close` | `pane`, `force?`                           | `{}`                            |

A new tab or pane starts the Default Shell, in the source pane's folder for a
split, exactly like the user's own New Tab and Split. There is no command
argument: the agent types what it wants to run. Closing something with a Busy
Session answers `busy` unless `force` is true. Closing the last tab closes the
window and ends the grant.

## Errors

| Code              | Meaning                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `invalid-request` | Not JSON, too long, unknown command, or a wrong argument shape.   |
| `revoked`         | The grant ended. The connection closes after this response.       |
| `unknown-pane`    | No such pane in this window (also used for another window's ids). |
| `unknown-tab`     | No such tab in this window.                                       |
| `not-live`        | The pane's program has ended or the pane is still starting.       |
| `unsupported-key` | A key name this version can't encode.                             |
| `too-large`       | The text to send or the text to return is over its limit.         |
| `busy`            | Closing needs `force`.                                            |
| `limit`           | Too many tabs, panes, connections or pending waits.               |
| `unavailable`     | The window couldn't answer in time (a read or a tree request).    |

`message` is one English sentence for people reading logs of their own
scripts. Programs should branch on `code`.

## CLI

`omxterm-ctl` is one dependency-free script over the protocol. It reads the
grant file itself; a token is never passed as an argument.

```sh
omxterm-ctl grants                         # granted windows of this profile
omxterm-ctl list
omxterm-ctl send s1 --text 'npm test' --enter
omxterm-ctl send s1 --keys Ctrl+C
omxterm-ctl wait s1 --idle 800 --match 'Tests passed' --timeout 120000
omxterm-ctl read s1
omxterm-ctl read s1 --scrollback 200
omxterm-ctl split s1 --down                # slice 3
omxterm-ctl new-tab                        # slice 3
omxterm-ctl close s8 --force               # slice 3
```

- `--window <id>` picks a grant when there are several; `--profile <dir>`
  picks a profile. `--json` prints the raw result.
- `send` remembers nothing between calls. `--enter` appends `Enter` in the
  same request, and `send … --wait` runs `wait` with the returned `offset` on
  the same connection, which is the reliable way to type a command and wait
  for it.
- `read` prints the text and nothing else, so it pipes.
- Exit status: 0 for a result (a `wait` timeout prints `timeout` and exits
  124), 1 for an API error, 2 for usage, 3 when no grant or endpoint was found.

## What an implementation touches

| Area                   | Where                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Endpoint, grants, auth | new modules in `src/main/`                                                                      |
| Agent input            | `agentInput()` in main, calling `LocalTerminalSession.writeTracked()`                           |
| Output positions       | `src/main/terminal-output-flow.ts` (expose sent and acknowledged positions, last output)        |
| Reads                  | a correlated request like `src/main/terminal-layout-ipc.ts`; `TerminalSurface.exportText`       |
| Screen-only read       | one runtime accessor beside `scripts/restty-buffer-text-corrections.mjs`                        |
| Marks and tone         | `src/renderer/state-marks.ts`, `src/renderer/ui.css`, `src/renderer/terminal-window-theme.ts`   |
| Toggle                 | `src/main/action-catalog.ts`, `src/main/application-menu.ts`, `src/shared/terminal-keybinds.ts` |
| Tab and pane commands  | `src/shared/terminal-panes.ts`, `src/renderer/terminal-pane-operations.ts`                      |
