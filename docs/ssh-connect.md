# Connect to a server with SSH

SSH is a standard way to open a secure terminal session on another computer.
SSH Connect is an optional add-on (an extension) that starts that session from
OMXTerm. It uses OpenSSH on your computer to authenticate and connect; it does
not install SSH or store your keys.

## Availability

The official extension catalog offers SSH Connect 0.3.1 on **Linux with ARM64
(64-bit Arm) processors** and **Macs with Apple silicon**. This is a preview; other operating
systems and processor types are not qualified. The documented checks used OMXTerm
0.24.0. An installer compatibility check does not mean every app version or
connection setup has been tested. See the [developer record](ssh-connect-development.md)
for exact package versions and qualification limits.

## Install and open it

1. In OMXTerm, open **Settings → Extensions** and choose **Browse official
   extensions**.
2. Find **SSH Connect**. Check that the card offers version **0.3.1**, then
   choose **Install** and review the trust warning. Extensions run with your
   account's permissions; the warning is not a sandbox.
3. Open **SSH Connect** from the **File** menu, Command Palette or terminal
   context menu. Installing the extension alone does not open it.

If the card is missing, choose **Refresh catalog** and check your internet
connection. If it remains missing or disabled, your platform or host version may
not match the offer. Do not download an archive from an untrusted source to work
around it.

## Connect

OpenSSH must be installed and discoverable by OMXTerm. SSH Connect reads saved
server names (aliases) from your SSH settings file, `~/.ssh/config`, when the page
opens. If you already use an alias there, select it in the list. You can also
enter a destination directly in
**Quick connect**:

- `work-server`
- `alice@example.org`
- `alice@example.org:2222`
- `alice@[2001:db8::1]:2222`

Select **Connect**. OMXTerm opens a new terminal tab and OpenSSH handles the
connection, authentication and any first-time server-identity check. Follow the
prompts in that terminal. The tab may open before the remote connection succeeds.

SSH Connect accepts a host or alias, optional user and optional port. It does
not accept a URL, remote command or extra SSH options. For other OpenSSH workflows,
use `ssh` in a regular terminal tab. Your normal OpenSSH configuration still
applies, including configured commands, port forwarding and agent access.

## If the connection does not start

- **OpenSSH not found:** install your operating system's OpenSSH client and make
  sure the app can find the `ssh` program. Restart OMXTerm after installing it.
- **Alias missing:** check `~/.ssh/config`, then close and reopen SSH Connect or
  choose **Refresh**. Quick connect works even when an alias is not listed.
- **Authentication or host-key prompt:** follow OpenSSH's prompt in the terminal.
  SSH Connect does not bypass host-key checks or fix server credentials.
- **Connection refused or timed out:** check the host, port, network and server
  availability. These errors come from the SSH connection, not the alias list.

For installation and configuration behavior beyond these steps, see the
[developer record](ssh-connect-development.md).
