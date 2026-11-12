# Connect to a server with SSH

SSH is a standard way to open a secure terminal session on another computer.
SSH Connect is an optional add-on (an extension) that starts that session from
OMXTerm. It uses OpenSSH on your computer to authenticate and connect; it does
not install SSH or store your keys.

## Availability

SSH Connect 0.4.0 runs on macOS (Apple silicon) and Linux with OMXTerm 0.27.0
or later, and on Windows with OMXTerm 0.28.0 or later (earlier Windows versions
can't find `ssh.exe`). A real Windows connection hasn't been tested yet. On OMXTerm 0.26,
install [SSH Connect 0.3.2](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.2)
from its release link instead. See the [developer notes](dev/ssh-connect-development.md)
for how it is built and its current limits.

## Install and open it

1. In OMXTerm, open **Settings → Extensions** and choose **Browse official
   extensions**.
2. Find **SSH Connect**. Check that the card offers version **0.4.0**, then
   choose **Install** and review the trust warning. Extensions run with your
   account's permissions; the warning is not a sandbox.
3. Return to a terminal tab (open one if needed); the panel is suspended while
   Settings is selected. Open **SSH Connect** from the **File** menu, Command
   Palette or terminal context menu. Installing it alone does not open it.

If the card is missing, choose **Refresh catalog** and check your internet
connection. If it remains missing or disabled, your platform or host version may
not match the offer. Do not download an archive from an untrusted source to work
around it.

## Connect

Before connecting, you need OpenSSH installed and discoverable by OMXTerm, a
real server address, your remote account name, and the password or authorized key
required by that server. Ask the server administrator if you do not have these.

Choose one connection method:

- **Saved alias:** SSH Connect reads aliases from `~/.ssh/config` when it opens.
  **Search aliases** only filters that list; it is not a destination field.
  Click an alias to connect immediately, without pressing **Connect**.
- **Quick connect:** enter a destination, then choose **Connect**. Examples:
  `work-server`, `alice@example.org`, `alice@example.org:2222` or
  `alice@[2001:db8::1]:2222`. Replace these placeholders with your own configured
  alias, account, server address and port; they are not real connection details.

The alias list is read-only and may be incomplete: it doesn't evaluate `Match`
conditions and skips entries it can't read. Use Quick connect for any alias it
leaves out. Names must be ASCII; IPv6 addresses need brackets and can't carry a
zone identifier.

OMXTerm opens a new terminal tab before the connection necessarily succeeds.
OpenSSH may use an existing key or SSH agent, or ask for the remote account's
password or your private key's passphrase in that terminal. Password/passphrase
input normally shows no characters as you type.

For a first-time server-identity prompt, obtain the server's trusted fingerprint
independently from its administrator or provider through a trusted separate
channel. Compare it with the displayed fingerprint before accepting. If you
cannot verify it, cancel. If OpenSSH warns that a known server's key has changed,
stop and confirm independently with the administrator; do not disable checks or
blindly delete the stored key.

SSH Connect accepts a host or alias, optional user and optional port. It does
not accept a URL, remote command or extra SSH options. For other OpenSSH workflows,
use `ssh` in a regular terminal tab. Your normal OpenSSH configuration still
applies, including configured commands, port forwarding and agent access.

## If the connection does not start

- **OpenSSH not found:** run `ssh -V` in Terminal; a version line means the
  client is available. On
  Ubuntu or Debian, install the [OpenSSH client](https://packages.ubuntu.com/openssh-client)
  with `sudo apt install openssh-client`. On Fedora, install the
  [OpenSSH client package](https://packages.fedoraproject.org/pkgs/openssh/openssh-clients/)
  with `sudo dnf install openssh-clients`. On macOS, use the `ssh` command in
  Terminal. Windows 10 and 11 include it; if `ssh -V` fails, add **OpenSSH
  Client** in **Settings → System → Optional features**. Restart OMXTerm after
  installing so it can find the program.
- **Alias missing:** check `~/.ssh/config`, then close and reopen SSH Connect or
  choose **Refresh**. Quick connect works even when an alias is not listed.
- **Sign-in or server identity prompt:** follow OpenSSH's instructions in the
  terminal. Confirm a first-time fingerprint through a trusted separate channel,
  as described above. Press **Ctrl+C** to cancel authentication; this does not end
  arbitrary remote programs or sessions. SSH Connect cannot bypass host-key checks
  or fix your credentials.
- **Connection refused or timed out:** check the host, port, network and server
  availability. These errors come from the SSH connection, not the alias list.
- **Unknown launch outcome:** inspect the terminal tabs before trying again; a
  tab may already have opened. Do not duplicate or replay an uncertain launch.

## Disconnect

At the remote shell prompt, run `exit`, or close the actual SSH terminal tab
(and confirm if asked). Hiding or closing the SSH Connect panel does not end its
already opened terminal sessions. An ordinary nonzero SSH exit may leave readable
output with an exit-code notice; that is an ended connection, not a live session.
Close that tab when finished reading.

For installation and configuration behavior beyond these steps, see the
[developer notes](dev/ssh-connect-development.md).
