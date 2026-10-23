import { quotePathForShell } from "../../shared/file-browser";
import type { FilesSource } from "./files-source";

export interface PaneState {
  // Local panes only: OSC 7, else the shell process's directory.
  readonly directory: string | null;
  // A program runs in the pane's shell; nothing is typed into it then.
  readonly busy: boolean;
}

export interface TerminalSyncOptions {
  readonly focusedPane: () => Promise<PaneState | null>;
  // The focused pane's last OSC 7 URI (remote shells report remote paths).
  readonly reportedUri: () => string | undefined;
  // Raw keys, as if typed, and a command typed and submitted, both into the
  // focused pane without moving keyboard focus.
  readonly sendKeys: (keys: string) => void;
  readonly runCommand: (command: string) => void;
}

export type PushResult = "sent" | "busy" | "same";

// How long the panel trusts its own navigation while the shell catches up.
const PUSH_GRACE_MS = 4_000;

// The path of a file:// URI from any host, as a remote shell reports it.
export function pathFromUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") return undefined;
    const decoded = decodeURIComponent(url.pathname);
    return decoded.startsWith("/") ? decoded : undefined;
  } catch {
    return undefined;
  }
}

// Keeps the Files panel and the focused terminal in the same folder, both
// ways, as AshyTerm does: the panel follows the shell, and browsing in the
// panel changes the shell's directory.
export function createTerminalSync(options: TerminalSyncOptions) {
  let pending: { path: string; until: number } | undefined;

  const settled = (current: string | null | undefined) => {
    if (!pending) return true;
    if (current === pending.path || Date.now() > pending.until) {
      pending = undefined;
      return true;
    }
    return false;
  };

  return {
    // Where the terminal is now, or undefined while it is still moving to
    // where the panel sent it (or when it cannot be known).
    async pull(source: FilesSource): Promise<string | undefined> {
      const current =
        source.kind === "remote"
          ? pathFromUri(options.reportedUri())
          : ((await options.focusedPane().catch(() => null))?.directory ??
            undefined);
      return settled(current) ? current : undefined;
    },

    // Changes the terminal's directory after the user browsed in the panel.
    // The line being edited is cleared first (Ctrl+E Ctrl+U, recoverable
    // with Ctrl+Y); the command starts with a space so shells set to ignore
    // such lines keep it out of history.
    async push(source: FilesSource, directory: string): Promise<PushResult> {
      if (source.kind === "local") {
        const pane = await options.focusedPane().catch(() => null);
        if (!pane || pane.busy) return "busy";
        if (pane.directory === directory) return "same";
      } else if (pathFromUri(options.reportedUri()) === directory)
        return "same";
      pending = { path: directory, until: Date.now() + PUSH_GRACE_MS };
      if (source.platform === "win32") {
        options.sendKeys("\u001b");
        options.runCommand(
          `Set-Location -LiteralPath ${quotePathForShell(directory, "win32")}`,
        );
      } else {
        options.sendKeys("\u0005\u0015");
        options.runCommand(
          ` cd -- ${quotePathForShell(directory, source.platform)}`,
        );
      }
      return "sent";
    },
  };
}

// Typed into a remote shell on request: makes bash or zsh report its folder
// with OSC 7 for the rest of the session, so the panel can follow it.
export const REMOTE_TRACKING_COMMAND =
  ` __omx_osc7() { printf '\\033]7;file://%s%s\\033\\\\' "\${HOSTNAME:-$(hostname)}" "$PWD"; };` +
  ` if [ -n "\${ZSH_VERSION:-}" ]; then precmd_functions+=(__omx_osc7);` +
  ` else PROMPT_COMMAND="__omx_osc7\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; fi; __omx_osc7`;
