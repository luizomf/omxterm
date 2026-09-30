# Windows quick start

[Install OMXTerm](../installation.md#windows) and open it. Windows PowerShell,
bundled fonts, and colors are ready to use. This walkthrough makes one setting
change and tries a saved command. You can choose Git Bash or another installed
shell later. Prefer a coordinated set of files? Jump to the
[complete ready-to-use setup](#complete-ready-to-use-setup-optional) for
configuration, snippets, and an editable theme; that optional setup uses Git Bash.

## 1. Open your settings folder

On first launch, OMXTerm creates `config.json`, `snippets.json`, and an editable
theme. Run this in **PowerShell** to open their folder:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME '.config' }
$configDir = Join-Path $configRoot 'omxterm'
New-Item -ItemType Directory -Path $configDir -Force -ErrorAction Stop | Out-Null
Invoke-Item -LiteralPath $configDir
```

The default is `%USERPROFILE%\.config\omxterm`; a non-empty `XDG_CONFIG_HOME`
selects another root. Back up files before editing. In Notepad's Save As dialog,
choose **All files** and UTF-8. Explorer's **View → Show → File name extensions**
helps check that the name stays `config.json`, not `config.json.txt`.

If you already had a configuration before installing, OMXTerm keeps it and
skips the starter kit. Create a missing `config.json` with the
[minimal configuration](../configuration.md#quick-start-use-the-bundled-defaults);
that alone does not create snippets or an editable theme. Steps 3 and 4 cover
those missing files.

## 2. Make the text comfortable

Open `config.json`, find `size` inside the `font` object (`font.size`), and change
`16` to `18`. If `font` or `size` is missing, use the
[complete font example](../configuration.md#add-one-display-change) to add the
missing fields while preserving your other settings. Save, then press and
release **Alt alone** to open the application menu. Choose **View → Reload
User Configuration** (`Ctrl+Shift+,`). The text gets larger; change it back to
`16` to undo it. If a notice reports an error, fix the named field and reload.

For temporary font zoom, use `Ctrl++` / `Ctrl+-`; `Ctrl+0` returns to your
configured size. See [fonts and spacing](../configuration.md#add-one-display-change)
for line height, padding, and installed fonts.

## 3. Try a snippet

Open **View → Toggle Snippets** (`Ctrl+Shift+S`) and click the starter greeting.
Review the inserted command, then press Enter. Snippets are saved text you can
insert into the current tab.

Edit `snippets.json` to add your own commands, then close and reopen the sidebar.
If `snippets.json` is missing, create it with the
[single-line snippet example](../configuration.md#snippets), which uses `pwd`
and works in PowerShell too. If the file already exists, preserve its `snippets`
array: add the example entry or choose an appropriate existing single-line
snippet with `execute: false`. Review the body before clicking. Reopen the
sidebar after edits; `execute: false` leaves the final Enter to you.

## 4. Make it yours

- **Colors:** edit a `#RRGGBB` value in `themes/omtheme.json` and reload, or use
  [OMXTerm Studio](../configuration.md#edit-visually-with-omxterm-studio).
  If the theme file is missing, [create and select a complete theme](../configuration.md#terminal-themes).
- **Background:** [enable blur and positive transparency together](../configuration.md#background-transparency-and-blur)
  for Acrylic on Windows 11 22H2 or later. If native effects are unavailable or
  disabled by system policy, the background stays opaque.
- **Window bars:** `Ctrl+Shift+D` toggles the title bar; `Ctrl+Shift+B` toggles
  the tab bar. [Set defaults for new windows](../configuration.md#start-with-hidden-bars).
- **Shell:** [choose another installed shell](../configuration.md#choose-the-windows-default-shell),
  such as PowerShell 7 or Git Bash. Reload and open a new tab to use it.
- **Next steps:** [everyday use](../usage.md), [shortcuts](../configuration.md#keybinds),
  and [when settings take effect](../configuration.md#reloading-user-configuration).

<a id="optional-git-bash-examples"></a>

## Complete ready-to-use setup (optional)

Install [Git for Windows](https://gitforwindows.org/) to get Git Bash. The example
expects `C:\Program Files\Git\bin\bash.exe`; check that it exists, or change
`windowsShell` to your actual path. Use doubled backslashes in JSON, as shown
in the linked configuration.

These files work with **OMXTerm 0.17.0 or newer** and use bundled fonts and all
built-in shortcuts.

Use these three files together; destinations are inside your
[settings folder](#1-open-your-settings-folder):

| Download                                                          | Copy to               |
| ----------------------------------------------------------------- | --------------------- |
| [config.json](files/windows/config.json) — selects Git Bash       | `config.json`         |
| [snippets.json](files/windows/snippets.json) — Bash commands      | `snippets.json`       |
| [themes/omtheme.json](files/windows/themes/omtheme.json) — colors | `themes/omtheme.json` |

Download each linked file using GitHub's **Download raw file** button. To get
all examples together, choose **Code → Download ZIP** on the repository's
**main** branch, use **Extract All**, and open `docs\quick-start\files\windows`.

Back up the destination files, then copy `config.json` and `snippets.json` into
your settings folder and `omtheme.json` into its `themes` subfolder. Replacing
these files replaces your current preferences; merge individual settings to
keep other choices.

Reload configuration, open a **new tab** (`Ctrl+Shift+T`) to start Git Bash,
and reopen the snippets sidebar. Try **Open current folder in Explorer**: it
inserts ` explorer.exe .`; press Enter to open Explorer. All seven snippets
are single-line and have `execute: false`. They use Bash syntax and Windows
tools such as `ipconfig.exe`, `nslookup.exe`, and `clip.exe`.

File drops and pasted file lists still use **PowerShell quoting** in Git Bash;
review and adjust them before pressing Enter. To return to Windows PowerShell,
remove `windowsShell`, reload, and open a new tab.

### Copy from an extracted ZIP in PowerShell

Set `$example` to your extracted folder. This backs up existing files and stops
at symlinks/reparse points so it does not overwrite their targets.

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

Keep the printed backup path. If copying stops, inspect what was copied before
retrying. To undo later, even in a fresh PowerShell session, replace the backup
path below with the one you saved. Use the same `XDG_CONFIG_HOME` as OMXTerm (or
set `$configDir` to the original settings folder if that environment has changed).
Check that destinations are still ordinary files, not symlinks/reparse points,
before restoring:

```powershell
$backup = 'C:\path\to\saved\omxterm-quick-start-backup-ID'
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME '.config' }
$configDir = Join-Path $configRoot 'omxterm'
Copy-Item -LiteralPath (Join-Path $backup 'config.json') -Destination (Join-Path $configDir 'config.json') -ErrorAction Stop
```

Repeat for `snippets.json` and `themes\omtheme.json` if they have backups. Remove
only newly added files without originals, not the whole settings folder. Reload
configuration and reopen the snippets sidebar; open a new tab to use the restored
shell setting.

<details>
<summary>Optional Git Bash and Vim preferences</summary>

The example [bashrc](files/windows/bashrc), [inputrc](files/windows/inputrc), and
[vimrc](files/windows/vimrc) customize the shell/editor separately from OMXTerm.
Download them as above and copy individual settings into your existing dotfiles
(hidden preference files such as `.bashrc`).

These examples enable vi-style editing (`Esc` or `jj` leaves insert mode), quiet
bells, and history that skips leading-space commands. Vim uses `slate` colors,
two-space indentation, and `Space w` to save. When started without file arguments,
it saves/loads per-directory sessions under `~/.vim/sessions/`. Those contain
executable Vim commands and paths; load only trusted sessions. Clipboard support
depends on your Vim build.

### Replace selected dotfiles with backups

This replaces existing prompts, aliases, and plugins in the selected files.
Check that `printf '%s\n' "$HOME"` in Git Bash and `$HOME` in PowerShell name
the same folder, or adjust `$dotHome`. If you use `INPUTRC`, adapt its destination.
Set `$example` to the extracted Windows example folder first, then run in PowerShell:

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

Start a new Git Bash or Vim to apply changes. To restore in a fresh PowerShell
session, replace the backup path with the one you saved and set `$dotHome` to
the same home folder you used above. Check that destinations are still ordinary
files, not symlinks/reparse points, before restoring:

```powershell
$dotBackup = 'C:\path\to\saved\omxterm-dotfiles-backup-ID'
$dotHome = $HOME
Copy-Item -LiteralPath (Join-Path $dotBackup '.bashrc') -Destination (Join-Path $dotHome '.bashrc') -ErrorAction Stop
```

Repeat for backed-up `.inputrc` and `.vimrc`; adapt destinations if you used
`INPUTRC`. Keep the earliest backup if you repeat the copy; remove only newly
added files without originals. Start a new Git Bash or Vim after restoring.

</details>
