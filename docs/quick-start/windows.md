# Windows: set up Git Bash, colors, and snippets

[Install OMXTerm](../../README.md#windows) first. This optional tutorial selects
**Git Bash**, adds an editable theme and seven snippets, and keeps the bundled
fonts and default shortcuts. If you prefer PowerShell, use the
[minimal configuration tutorial](../configuration.md#quick-start-use-the-bundled-defaults)
instead; OMXTerm already starts PowerShell by default.

## 1. Get Git Bash and the examples

Install Git for Windows separately. Check that
`C:\Program Files\Git\bin\bash.exe` exists; if yours is elsewhere, edit
`windowsShell` in the example to that absolute path. OMXTerm does not install Bash.

In the repository on GitHub, select **main**, then choose **Code → Download ZIP**.
Sign in if asked. Use **Extract All** and open `docs\quick-start\files\windows`
inside the result. These examples are for OMXTerm 0.14.0 or newer.

You need three files:

- [config.json](files/windows/config.json) — Git Bash, settings, and shortcuts;
- [snippets.json](files/windows/snippets.json) — example Bash commands;
- [themes/omtheme.json](files/windows/themes/omtheme.json) — editable colors.

## 2. Copy the files

Run this in **PowerShell**, not Git Bash, to create and open your configuration folder:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME '.config' }
$configDir = Join-Path $configRoot 'omxterm'
New-Item -ItemType Directory -Path (Join-Path $configDir 'themes') -Force -ErrorAction Stop | Out-Null
Invoke-Item -LiteralPath $configDir
```

In Explorer, copy the two JSON files into that folder and `omtheme.json` into
its `themes` subfolder. **Back up existing destination files before replacing
them.** If you already have settings you like, merge only what you want.
Ensure the files end in `.json`, not `.json.txt`.

The default layout is below. A non-empty `XDG_CONFIG_HOME` replaces
`%USERPROFILE%\.config`:

```text
%USERPROFILE%\.config\omxterm\
├── config.json
├── snippets.json
└── themes\
    └── omtheme.json
```

<details>
<summary>Prefer copying in PowerShell? Use this backup-aware block.</summary>

Set `$example` to the extracted example folder. This backs up existing files
and refuses symlinks/reparse points at destinations.

```powershell
$example = 'C:\path\to\extracted\omxterm\docs\quick-start\files\windows'
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME '.config' }
$configDir = Join-Path $configRoot 'omxterm'
$backup = Join-Path $HOME ('omxterm-quick-start-backup-' + [guid]::NewGuid().ToString('N'))
$names = @('config.json', 'snippets.json', 'themes\omtheme.json')
foreach ($name in $names) {
  if (-not (Test-Path -LiteralPath (Join-Path $example $name) -PathType Leaf)) { throw "Example missing: $name" }
}
foreach ($dir in @($configDir, (Join-Path $configDir 'themes'))) {
  $item = Get-Item -LiteralPath $dir -Force -ErrorAction SilentlyContinue
  if ($item -and (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $item.PSIsContainer)) { throw "Not a plain directory: $dir" }
}
New-Item -ItemType Directory -Path (Join-Path $configDir 'themes') -Force -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
foreach ($name in $names) {
  $target = Join-Path $configDir $name
  $existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
  if ($existing -and (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $existing.PSIsContainer)) { throw "Refusing destination: $target" }
  if ($existing) {
    $saved = Join-Path $backup $name
    New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force -ErrorAction Stop | Out-Null
    Copy-Item -LiteralPath $target -Destination $saved -ErrorAction Stop
  }
  Copy-Item -LiteralPath (Join-Path $example $name) -Destination $target -ErrorAction Stop
}
"Backup (only files that previously existed): $backup"
```

Keep the printed backup path. If copying fails, inspect the files before
retrying. To restore an original, use, for example,
`Copy-Item -LiteralPath (Join-Path $backup 'config.json') -Destination (Join-Path $configDir 'config.json')`.
Remove only newly added files without originals, not the whole folder.

</details>

## 3. Reload and try it

1. Choose **View → Reload User Configuration** (`Ctrl+Shift+,`). Press and
   release `Alt` if the menu is hidden. Correct any reported error and reload.
2. Open a **new tab** (`Ctrl+Shift+T`) to start Git Bash. Existing sessions keep
   their original shell.
3. Open **View → Toggle Snippets** (`Ctrl+Shift+S`). Click **Open current folder
   in Explorer**, review the inserted ` explorer.exe .`, and press Enter.
   Explorer should open the shell's current folder.

All seven examples have `execute: false`: OMXTerm does not append Enter. They
use Bash syntax with Windows tools such as `explorer.exe`, `ipconfig.exe`,
`nslookup.exe`, and `clip.exe`. They are not PowerShell snippets.

To see a visible change, edit `font.size` in `config.json` from `16` to `18` and
reload. Edit a `#RRGGBB` color in `themes/omtheme.json` to change the palette.
Restoring `16` or your backed-up files reverses the change. More options:
[Configuration](../configuration.md).

## Optional Git Bash and Vim preferences

OMXTerm does not require dotfiles. The examples [bashrc](files/windows/bashrc),
[inputrc](files/windows/inputrc), and [vimrc](files/windows/vimrc) are separate
shell/editor preferences. Prefer copying individual settings into your existing files.

They enable vi-style command-line editing (`Esc` or `jj` leaves insert mode),
quiet bells, and history that skips leading-space commands. Vim uses the `slate`
colors, two-space indentation, and `Space w` to save. When started without file
arguments, it saves/loads a session per directory under `~/.vim/sessions/`.
Those session files contain executable Vim commands and paths; do not load
untrusted sessions. Clipboard support depends on your Vim build.

<details>
<summary>Replace selected dotfiles with backups (optional)</summary>

This replaces the chosen files, including their existing prompt, aliases, and
plugins. Check that `printf '%s\n' "$HOME"` in Git Bash names the same home as
PowerShell's `$HOME`; otherwise adjust `$dotHome`. If you use `INPUTRC`, adapt
its destination. Set `$example` as above, then run in PowerShell:

```powershell
$dotHome = $HOME
$dotBackup = Join-Path $dotHome ('omxterm-dotfiles-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dotBackup -ErrorAction Stop | Out-Null
"Dotfile backup: $dotBackup"
foreach ($name in @('bashrc', 'inputrc', 'vimrc')) { # Edit this list as needed
  $source = Join-Path $example $name
  $target = Join-Path $dotHome ('.' + $name)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Example missing: $source" }
  $existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
  if ($existing -and (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $existing.PSIsContainer)) { throw "Refusing destination: $target" }
  if ($existing) { Copy-Item -LiteralPath $target -Destination (Join-Path $dotBackup ('.' + $name)) -ErrorAction Stop }
  Copy-Item -LiteralPath $source -Destination $target -ErrorAction Stop
}
```

Start a new Git Bash or Vim to apply its settings. To restore an original, use,
for example, `Copy-Item -LiteralPath (Join-Path $dotBackup '.bashrc') -Destination (Join-Path $dotHome '.bashrc')`.
Keep the earliest backup if you repeat this step; remove only newly added files
without originals.

</details>
