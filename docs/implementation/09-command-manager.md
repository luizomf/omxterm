# Command Manager

## Scope

A Commands sidebar panel (**View → Toggle Commands**, `toggleCommands`).

- 56 built-in templates:
  - all eight AshyTerm built-ins (`find`, `ls`, compress, extract,
    `systemctl`, `journalctl`, `pacman`, `ping`);
  - macOS and PowerShell equivalents;
  - apt, dnf, Homebrew, winget, Git, Docker and SSH tasks.
- User commands, favorites, and hidden built-ins.

## Templates

`CommandDefinition` (`src/shared/commands.ts`) has a template with `{field}`
placeholders and typed fields.

**Field types:** `text`, `text_area`, `password`, `number`, `switch`,
`dropdown`, `radio`, `multi_select`, `file_path`, `directory_path`.

**Field options:**

- `flag` and `offValue` for switches;
- authored `options` for choice fields;
- `prefix` and `suffix`;
- `perLine`, which makes each line its own argument;
- `min` and `max` for numbers.

**How `buildCommand(definition, values, shell)` treats values:**

- Free text is quoted for the target shell. POSIX uses `'…'` with `'\''`;
  PowerShell uses `'…'` with `''`. Plain words stay unquoted.
- Choice fields insert only values authored in the definition. Typed text
  can never become an option.
- Required fields and numeric ranges fail with `CommandFieldError` before
  anything is typed.

## Flow

1. The catalog keeps commands for the current platform and asks main which
   required programs exist on PATH. The lookup uses no shell; results are
   cached and refreshed each time the panel lists commands. Commands with a missing program are
   shown dimmed, with a reason.
2. A form shows the exact command preview. **Insert in Terminal** types it
   into the focused pane; **Run in Terminal** also presses Enter. Main never
   runs a command.
3. The submitted text also selects the pane's highlight rule set (R19).

## Storage

`commands.json` (Application Data) holds custom definitions, favorites and
hidden ids. Main validates everything (`validateCommandLibrary`). Built-in
names, descriptions, categories and field labels are translated
(`command-builtins/pt-BR.ts`); command text and option values never are.

## Related features

- **View → Command Palette…** runs any action by name (C3).
- **Run in Multiple Terminals…** sends a command to the checked terminals of
  the window (B3).

## Not yet ported

- A pinned command toolbar (C2).

Tests: `command-manager`, `renderer-commands-panel`.
