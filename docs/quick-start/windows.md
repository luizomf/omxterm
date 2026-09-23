# Windows ARM64 quick start

[Install OMXTerm](../../README.md#windows) and the Microsoft Visual C++ Redistributable for ARM64 first; keep SmartScreen enabled and follow the unsigned-installer notes there. This example selects **Git Bash** as the Default Shell. Install Git for Windows separately and verify that `C:\Program Files\Git\bin\bash.exe` exists, or edit `windowsShell` in the example to your installed Bash executable before reloading. OMXTerm does not install Git or Bash.

## Get the files

Sign in to GitHub with access to this currently private repository, choose the branch you want, and use **Code → Download ZIP**. Extract it (Explorer's **Extract All** works) and find `docs\quick-start\files\windows` inside. No Git CLI or unauthenticated raw download is required. Inspect the complete [config.json](files/windows/config.json), [snippets.json](files/windows/snippets.json), and [themes/omtheme.json](files/windows/themes/omtheme.json) first.

## Back up and apply OMXTerm files

Run this in **PowerShell**. Change `$example` to the **actual extracted folder**. It saves each existing regular file to a uniquely named backup folder in your home before copying, and refuses a symlink/reparse point or directory at a destination. Stop if it reports an error; don't retry blindly.

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

If copying fails halfway, inspect the target files and backup before proceeding. Restore a backed-up file individually with e.g. `Copy-Item -LiteralPath (Join-Path $backup 'config.json') -Destination (Join-Path $configDir 'config.json')`. Remove only newly copied files with no corresponding backup after reviewing them; never remove the whole directory. A non-empty `XDG_CONFIG_HOME` changes the config location on Windows too.

The example explicitly lists the complete Windows shortcut map, omits `font.family` to retain the bundled font, and wires an editable external copy of the [standard palette](../omtheme.json) via `./themes/omtheme.json`. Top padding is **0 px**, the runtime default; the other sides are 8 px. Choose **View → Reload User Configuration** (`Ctrl+Shift+,`); if validation reports the Git Bash path missing or another error, correct the file and reload. Existing sessions retain their original shell; open a new tab for the newly selected shell.

Open **View → Toggle Snippets** (`Ctrl+Shift+S`), click “Open current folder in Explorer,” review the inserted ` explorer.exe .`, and press Enter. All seven snippets are JSON with `execute: false`; none submits Enter automatically. Their leading space opts out of Bash history when the optional `HISTCONTROL=ignoreboth` preference is active. Other examples use `ipconfig.exe`, `nslookup.exe`, `clip.exe`, and Git (Git Bash provides Git), and the palette uses Bash syntax. Replace paths/commands for your installation. See [Snippet behavior](../configuration.md#snippets) for paste safety and refresh on opening the sidebar.

## Optional Git Bash, Readline, and Vim preferences

OMXTerm does **not** require any of these: [bashrc](files/windows/bashrc), [inputrc](files/windows/inputrc), [vimrc](files/windows/vimrc). Inspect any existing dotfiles before replacing them; they may contain important customizations. Git Bash normally uses your Windows home for `$HOME`; verify that `printf '%s\n' "$HOME"` in Git Bash points to the same directory as `$HOME` in PowerShell before installing dotfiles. If not, adjust `$dotHome` below to Git Bash's home directory. `INPUTRC` may select a different Readline file.

This PowerShell block copies only the selected subset, backing up any existing regular files in the same `$backup`. Run it in the same PowerShell session as above or set `$example` and `$backup` again to those exact paths:

```powershell
$dotHome = $HOME
foreach ($name in @('bashrc', 'inputrc', 'vimrc')) { # Edit this list as needed
  $source = Join-Path $example $name
  $target = Join-Path $dotHome ('.' + $name)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Example missing: $source" }
  $existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
  if ($existing -and (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $existing.PSIsContainer)) { throw "Refusing destination: $target" }
  if ($existing) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup ('.' + $name)) -ErrorAction Stop }
  Copy-Item -LiteralPath $source -Destination $target -ErrorAction Stop
}
```

Restore, for example, with `Copy-Item -LiteralPath (Join-Path $backup '.bashrc') -Destination (Join-Path $dotHome '.bashrc')`; remove only newly copied files without backups after checking them. Start a new Git Bash/Vim process to pick up changes. Bash's `set -o vi` enables command-line vi mode (`Esc` or `jj` leaves insert mode); a leading space excludes a command from history. `.inputrc` disables Readline's bell and Vim's `belloff=all` disables Vim's separately. Vim also maps `jj` and auto-loads/saves a session per working directory in `~/.vim/sessions/` **only when launched without file arguments**. Sessions are executable Vim commands and can contain file paths; keep them private and never source someone else's sessions, or remove the session block if this preference is unwanted. [Configuration reference](../configuration.md) has more options.
