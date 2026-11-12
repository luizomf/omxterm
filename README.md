# <img src="docs/images/omxterm-hero.png" alt="" width="48" /> OMXTerm

OMXTerm is a free, open-source desktop terminal for macOS, Linux, and Windows.
A terminal is the window where you type commands; OMXTerm gives that window
tabs, themes, and shortcuts, and runs the shell your computer already has (the
program that runs the commands you type).

![OMXTerm on macOS with fastfetch and a blurred desktop](docs/images/macos.webp)

_macOS, with background transparency and blur._

<details>
<summary>More screenshots</summary>

**macOS — tabs and snippets**

![OMXTerm on macOS with two tabs and the snippets sidebar](docs/images/macos-background.webp)

**Windows**

![OMXTerm on Windows with PowerShell and two tabs](docs/images/windows.webp)

**Fedora KDE Plasma**

![OMXTerm on Fedora KDE Plasma with two tabs](docs/images/fedora-kde.webp)

**Ubuntu GNOME**

![OMXTerm on Ubuntu GNOME with two terminal windows](docs/images/ubuntu-gnome.webp)

**Omarchy / Hyprland**

![OMXTerm on Omarchy with tiled windows](docs/images/omarchy-hyprland.webp)

</details>

## Why OMXTerm

- **Your own shell.** Your prompt, aliases, and history work as usual; tabs,
  multiple windows, and hideable bars keep the screen clean.
- **Looks the way you want.** Bundled fonts include the symbols command-line
  tools print and joined-up pairs (ligatures). Themes, transparency, and blur
  are built in.
- **Fewer small mistakes.** Drag a file in to insert its path, hold Cmd or Ctrl
  and click an image path to preview it, and Protected Paste can ask before a
  multi-line paste runs.

**[Install](#platforms-and-downloads)** · **[First session](#first-session)** ·
**[Customize](docs/configuration.md)** · **[Everyday use](docs/usage.md)** ·
**[How it works](docs/how-it-works.md)** · **[Documentation](docs/README.md)**

## Platforms and downloads

Open the **[latest release](https://github.com/luizomf/omxterm/releases/latest)**
and download the file for your computer. The file name ends with the version,
then:

| Your computer                                | Download file     |
| -------------------------------------------- | ----------------- |
| **Mac** with an Apple chip (M1, M2, M3, M4…) | `-arm64.dmg`      |
| **Windows** PC, most laptops and desktops    | `-x64.exe`        |
| **Windows** PC with a Snapdragon / ARM chip  | `-arm64.exe`      |
| **Linux** PC, most laptops and desktops      | `-x64.AppImage`   |
| **Linux** on an ARM computer                 | `-arm64.AppImage` |

Not sure which one you have?

- **Mac:** Apple menu → **About This Mac**. "Apple M…" is right. Intel Macs
  aren't supported.
- **Windows:** **Settings → System → About → System type**. "x64-based" →
  x64; "ARM-based" → arm64.
- **Linux:** run `uname -m` in a terminal. `x86_64` → x64, `aarch64` → arm64.
  Needs glibc 2.35 or newer (Ubuntu 22.04, Debian 12, Fedora 36 or later).

The Intel/AMD builds (Windows and Linux x64) are new and **untested on real
desktops**. If one misbehaves,
[tell us](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md).

Then follow the short steps in the [installation guide](docs/installation.md),
including the one-time "Open Anyway" on macOS.

## First session

OMXTerm opens with your shell in your home folder and a prompt ending in `%`,
`$`, or `>`. Type this and press Enter (in Command Prompt, use `cd` instead):

```sh
pwd
```

It prints the folder you are in: your home folder on first launch, such as
`/Users/yourname`, `/home/yourname`, or `C:\Users\yourname`.

| Action             | macOS             | Linux and Windows   |
| ------------------ | ----------------- | ------------------- |
| New tab            | `Cmd+T`           | `Ctrl+Shift+T`      |
| Copy selected text | `Cmd+C`           | `Ctrl+Shift+C`      |
| Paste              | `Cmd+V`           | `Ctrl+Shift+V`      |
| Zoom in / out      | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |

`Ctrl+C` stops the running command. On Linux and Windows, press and release
**Alt** to open the application menu; on macOS, use the menu bar.

### Make it yours

Choose **Settings…** in the application menu to change the font, theme, and
shortcuts. Themes and snippets live in files; the
[configuration guide](docs/configuration.md) shows where. See
[Everyday use](docs/usage.md) for all shortcuts and image previews.

## Optional tools

Files and SSH Connect are optional add-ons you install from inside OMXTerm.
Snippets comes with the app; a new installation tries to add it once on most
systems. See [Optional tools](docs/installation.md#optional-tools).

## Updating or uninstalling

OMXTerm does not update itself. To update, quit, download the new version, and
replace it; on macOS, drag the new **OMXTerm.app** into
**Applications**. Settings, themes, and snippets are kept. See
[update and uninstall steps](docs/installation.md#updating-or-uninstalling).

## Privacy and security

OMXTerm collects no telemetry and never downloads or updates extensions on its
own. A new installation may add the Snippets add-on from the app's own files; it
stays off until you open it. Logs never include what you type, your terminal
output, your clipboard, or your settings. We have not yet confirmed that the
Windows app makes no network requests at all. Report vulnerabilities through
[SECURITY.md](SECURITY.md).

## Contributing

Bug reports, documentation fixes, and code are welcome: read
[CONTRIBUTING.md](CONTRIBUTING.md) and
[open an issue](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md).
Testing the x64 builds is welcome in
[Linux #223](https://github.com/luizomf/omxterm/issues/223) and
[Windows #224](https://github.com/luizomf/omxterm/issues/224).

## License

[MIT](LICENSE). Built with Restty, Ghostty, and other open-source components
listed in [Third-Party Notices](THIRD_PARTY_NOTICES.md).

---

**Sponsor: Hostinger** — VPS and other hosting, 10% off with
[this link](https://hostinger.com/otaviomiranda) and coupon `OTAVIOMIRANDA`.
