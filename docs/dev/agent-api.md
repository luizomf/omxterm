# Agent API reference

The wire protocol and CLI of
[ADR 0052](../adr/0052-let-a-local-agent-drive-a-granted-window.md). Slices 1
and 2 (macOS and Linux) are implemented: the handshake, `list`, `send`,
`read`, `wait`, the `omxterm-ctl` commands without a slice mark, its `guide`
and its [MCP server](#mcp). Each later command says which slice of the ADR's
plan it belongs to; until then, names and shapes can still change.

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
| `OMXTERM_CTL`     | Absolute path of the `omxterm-ctl` launcher.                                  |
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

Slice 1 returns `panes` at the top level, without tabs. Titles are the
display-only tab titles (ADR 0010), so they are untrusted text.

### `send` (slice 1; mode-aware keys in slice 6)

`text`, `keys` or both; with both, the text comes first, in one write.

```json
{ "id": 2, "cmd": "send", "args": { "pane": "s1", "text": "npm test" } }
{ "id": 3, "cmd": "send", "args": { "pane": "s1", "keys": ["Enter"] } }
```

- `text` is written as is, at most 64 KiB of UTF-8. No newline is added and no
  paste framing is applied.
- `keys` in slice 1: `Enter`, `Tab`, `Escape`, `Backspace`, `Space` and
  `Ctrl+A` … `Ctrl+Z`, in any letter case, at most 64 per request. Other names
  answer `unsupported-key` until slice 6.
- The whole write is at most 64 KiB, or the request answers `too-large`.

```json
{ "receipt": "accepted", "offset": 48211 }
```

`offset` is the pane's output position when the bytes were written; pass it to
`wait` as `after`. `receipt` is `accepted` or `unknown` (the write may have
partly happened; it is never retried). A refused write is the error
`not-live`.

### `read` (tail in slice 1; exact screen in slice 3)

```json
{ "id": 4, "cmd": "read", "args": { "pane": "s1", "lines": 200 } }
{ "id": 5, "cmd": "read", "args": { "pane": "s1", "source": "screen" } }
```

- `tail` (default): the last `lines` lines of retained history plus screen
  (default 200, at most 10,000), without the blank rows below the cursor. It
  includes output from before the grant. A tail longer than 2 MiB of text is
  cut at its start and answers `"truncated": true`. The read first waits up
  to 1 s for the window to consume what main already sent.
- `screen` (slice 3): exactly the active screen's rows, wherever the user
  scrolled.
- Text only, trailing spaces trimmed per row. The alternate screen reads only
  its own contents.

```json
{ "text": "…", "cols": 120, "rows": 32, "offset": 51877, "truncated": false }
```

`offset` is the position the window had consumed when the text was read.

Later, without changing these fields: `"source": "command"` for one command's
output once OSC 133 lands (slice 8).

### `wait` (slice 1; `match` in slice 3)

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
- `match` (slice 3): a literal string of at most 1,024 characters, looked for
  in the pane's screen text. Not a regular expression. Slice 1 answers
  `invalid-request`.
- The first condition met answers. At least one of `idleMs` or `match`
  applies; with only `match`, idleness is ignored.

```json
{ "reason": "idle", "offset": 51877 }
```

`reason` is `idle`, `match`, `timeout` or `exited` (the pane's program ended;
the result adds `exitCode`). A timeout is a normal result, not an error. Later:
`command-end` with `exitCode` (slice 8). Clients must ignore reasons and fields
they don't know.

### Tabs and panes (slice 4)

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
omxterm-ctl status                         # granted or not, in one sentence
omxterm-ctl guide                          # the agent guide, a SKILL.md
omxterm-ctl mcp                            # MCP server on stdio
omxterm-ctl grants                         # granted windows of this profile
omxterm-ctl list
omxterm-ctl send s1 --text 'npm test' --enter --wait --idle 800
omxterm-ctl send s1 --keys Ctrl+C
omxterm-ctl wait s1 --after 48211 --idle 800 --timeout 120000
omxterm-ctl wait s1 --match 'Tests passed' --timeout 120000   # slice 3
omxterm-ctl read s1 --lines 200
omxterm-ctl read s1 --screen               # slice 3
omxterm-ctl split s1 --down                # slice 4
omxterm-ctl new-tab                        # slice 4
omxterm-ctl close s8 --force               # slice 4
```

- Inside a pane, agents call it as `"$OMXTERM_CTL"`; window and profile come
  from the environment. Elsewhere, `--window <id>` picks a grant when there
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
  list, `--enter` appends `Enter` in the same request, and `send … --wait`
  runs `wait` with the returned `offset` on the same connection, which is the
  reliable way to type a command and wait for it. `--timeout` defaults to
  60000 for `wait` and `send --wait`.
- A pane may be named `s4` or `3:s4`; the window part must match.
- `read` prints the text and nothing else, so it pipes.
- Exit status: 0 for a result (a `wait` timeout prints `timeout` and exits
  124), 1 for an API error, 2 for usage, 3 when no grant or endpoint was found.

## MCP

`omxterm-ctl mcp` is an MCP server on stdio, in the same dependency-free
script. It answers both the per-request protocol (`2026-07-28`, opened with
`server/discover` or any request whose `_meta` names its version, as Claude
Code does) and the `initialize` handshake (`2025-11-25` back to `2024-11-05`,
as Codex does). It offers tools only.

| Tool     | Arguments                                                                          |
| -------- | ---------------------------------------------------------------------------------- |
| `status` | `window?`                                                                          |
| `list`   | `window?`                                                                          |
| `send`   | `pane`, `text?`, `keys?` (list), `enter?`, `wait?`, `idle?`, `timeout?`, `window?` |
| `read`   | `pane`, `lines?`, `window?`                                                        |
| `wait`   | `pane`, `after?`, `idle?`, `timeout?`, `window?`                                   |

- A tool call is the CLI command of the same name, with the arguments as its
  options, on its own connection. The tools are always listed; the grant is
  looked up on every call, so a grant given or ended mid-session counts from
  the next call.
- The result is one text block with what the CLI would print. `send` without
  `wait` answers its receipt as JSON, for the `offset`. A `wait` timeout is a
  normal result (`timeout`).
- No grant, an API error or a bad argument is a tool error (`isError`) whose
  text is the CLI's message; without a grant that's the `status` sentence. An
  unknown tool or method is a JSON-RPC error.
- `timeout` defaults to 50000 here, not 60000, so a wait answers before
  Codex's default 60 s tool timeout.
- `--profile` on the `mcp` command line applies to every call; `--window`
  applies to every call that doesn't pass its own `window`. The several-windows
  error names the `window` argument.
- A `pane` must be a pane id (`s4` or `3:s4`); anything else is a tool error.
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

| Area                     | Where                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Wire limits and keys     | `src/shared/agent-api.ts`, shared by main and the client                                        |
| Grants and credentials   | `src/main/agent-access.ts`                                                                      |
| Socket and handshake     | `src/main/agent-endpoint.ts`                                                                    |
| Commands and waits       | `src/main/agent-commands.ts`                                                                    |
| Agent input and outputs  | `agentSessions` in `src/main/terminal-ipc-controller.ts` (the only agent write)                 |
| Pane environment         | `createLocalTerminalSession()` in `src/main/local-terminal-session.ts`                          |
| Reads and marks (window) | `src/renderer/agent-access.ts`, `src/renderer/state-marks.ts`, `src/preload/agent-bridge.ts`    |
| Accent tone              | `src/renderer/ui.css`, `src/renderer/terminal-window-theme.ts`                                  |
| Toggle                   | `src/main/action-catalog.ts`, `src/main/application-menu.ts`, `src/shared/terminal-keybinds.ts` |
| Client and launcher      | `src/agent-ctl/` (built to `dist/agent-ctl/`, packaged under `resources/agent-ctl/`)            |
| Agent guide              | `src/agent-ctl/SKILL.md`, bundled into the client as text                                       |
| MCP server               | `src/agent-ctl/mcp.ts`, over the CLI's commands in `src/agent-ctl/commands.ts`                  |
| Screen-only read         | slice 3: one runtime accessor beside `scripts/restty-buffer-text-corrections.mjs`               |
| Tab and pane commands    | slice 4: `src/shared/terminal-panes.ts`, `src/renderer/terminal-pane-operations.ts`             |
