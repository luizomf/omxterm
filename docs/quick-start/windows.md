# Windows: set up Git Bash, colors, and snippets

[Install OMXTerm](../../README.md#windows) and open it once first. You can already
use the terminal with Windows PowerShell and its automatically created starter kit.
This optional tutorial selects **Git Bash**, adds an editable theme and seven
Bash snippets (saved commands you can insert), and keeps bundled fonts and all
27 default shortcuts. Git Bash is a separate shell supplied with Git for Windows,
not part of OMXTerm.

**Prefer PowerShell?** Keep your existing files and use the
[minimal configuration tutorial](../configuration.md#quick-start-use-the-bundled-defaults).
The [customization section below](#4-make-it-yours) applies to either shell;
you do not need to install Git Bash just to change colors or blur.

## 1. Get Git Bash and the examples

Install [Git for Windows](https://gitforwindows.org/) separately. Check that
`C:\Program Files\Git\bin\bash.exe` exists; if yours is elsewhere, edit
`windowsShell` in the example to that absolute path. OMXTerm does not install Bash.

In the repository on GitHub, select **main**, then choose **Code → Download ZIP**.
Use **Extract All** and open `docs\quick-start\files\windows` inside the result.
These examples require **OMXTerm 0.17.0 or newer**; downloading the source ZIP
here is only a way to get the examples, not an instruction to build the app.

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
Use a plain-text editor such as Notepad. In Save As, choose **All files** and
UTF-8; in Explorer, enable **View → Show → File name extensions**. Check that the
files end in `.json`, not `.json.txt`.

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
Restoring `16` or your backed-up files reverses the change.

## 4. Make it yours

Edit existing fields in `config.json`; do not add duplicate objects. JSON does
not accept comments, and numbers and `true`/`false` stay unquoted.

| Preference                                  | Try this                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `windowsShell`                              | Keep the actual absolute path to `bash.exe`, choose another installed shell such as PowerShell 7, or remove this property to return to Windows PowerShell. Reload and open a new tab. |
| `window.blur` / `window.transparency`       | Change `false` / `0` to `true` / `0.35`, save, and reload. **Both** are needed for Acrylic on Windows 11 22H2 or later.                                                               |
| `window.showTitleBar` / `window.showTabBar` | Set the defaults for new windows. Use `Ctrl+Shift+D` / `Ctrl+Shift+B` to toggle the current window instead.                                                                           |
| `keybinds`                                  | All 27 defaults are included. For example, change `toggleSnippets` to `Control+Alt+Shift+S`, then reload. Remove an override to use its built-in default.                             |

Write paths with doubled backslashes in JSON, for example
`"C:\\Program Files\\PowerShell\\7\\pwsh.exe"`. The executable must exist;
`windowsShell` does not accept arguments or expand environment variables. See
[Windows shell selection](../configuration.md#choose-the-windows-default-shell).
File drops and pasted file lists still use **PowerShell quoting**, even in Git
Bash; review and adjust the inserted command before pressing Enter.

Blur and transparency start **off** in the example. Windows uses Acrylic, a
system blur material, not plain transparency: with blur off or unsupported native
effects, the background stays opaque. System settings may also prevent Acrylic;
the terminal still works. See [background effects](../configuration.md#background-transparency-and-blur).

Font family and line height apply to new tabs after reload; existing tabs need
a restart. Snippets reload when you close and reopen their sidebar. See
[all shortcuts](../usage.md#built-in-platform-shortcuts) and
[reload behavior](../configuration.md#reloading-user-configuration).

## Optional Git Bash and Vim preferences

**Skip this section unless you want to change how your shell/editor works.**
Dotfiles are hidden preference files for other programs, not OMXTerm settings.
OMXTerm does not require them. The examples [bashrc](files/windows/bashrc),
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
