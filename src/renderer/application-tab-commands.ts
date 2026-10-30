import type {
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { ExtensionsBridge } from "../shared/extensions";
import type { TerminalPaneCommand } from "../shared/terminal-panes";

// Command state belongs to the application-tab lifetime, including the captured
// close target. It never owns a second collection, selection or session index.
export function createApplicationTabCommands<Tab>(
  tabs: readonly Tab[],
  options: {
    readonly available: () => boolean;
    readonly selected: () => Tab | undefined;
    readonly select: (index: number) => void;
    readonly create: () => Promise<void>;
    readonly openSsh?: (
      command: Extract<TerminalTabCommand, { action: "open-ssh" }>,
    ) => void;
    readonly close: (tab: Tab | undefined) => void;
    readonly closeSession: (id: TerminalSessionId) => void;
    readonly pane: (command: TerminalPaneCommand) => void;
    readonly extensions?: ExtensionsBridge | undefined;
    readonly canOpenSnippets?: () => boolean;
    readonly openSnippetsManagement?: () => void;
    readonly refuseSsh?: (token: string) => void;
    readonly canFocus?: (() => boolean) | undefined;
  },
) {
  let pendingClose: Tab | undefined;
  return {
    handle(command: TerminalTabCommand) {
      if (!options.available()) {
        if (command.action === "open-ssh") options.refuseSsh?.(command.token);
        return;
      }
      switch (command.action) {
        case "open-ssh":
          options.openSsh?.(command);
          return;
        case "snippets-management":
          if (options.canFocus?.() !== false && options.canOpenSnippets?.())
            options.openSnippetsManagement?.();
          return;
        case "toggle-snippets-extension":
        case "open-extension":
          void options.extensions
            ?.request({
              operation: "open",
              token: command.token,
              accepted:
                options.canFocus?.() !== false &&
                (command.action !== "toggle-snippets-extension" ||
                  options.canOpenSnippets?.() === true),
            })
            .catch(() => {});
          return;
        case "new":
          void options.create().catch(() => {});
          return;
        case "close":
          options.close(options.selected());
          return;
        case "prepare-close":
          pendingClose = options.selected();
          return;
        case "resolve-close": {
          const target = pendingClose;
          pendingClose = undefined;
          if (command.confirmed) options.close(target);
          return;
        }
        case "next":
        case "previous": {
          if (!tabs.length) return;
          const selected = options.selected();
          const index = selected === undefined ? -1 : tabs.indexOf(selected);
          options.select(
            (index + (command.action === "next" ? 1 : -1) + tabs.length) %
              tabs.length,
          );
          return;
        }
        case "select":
          if (command.position <= tabs.length)
            options.select(command.position - 1);
          return;
        case "close-session":
          options.closeSession(command.sessionId);
          return;
        default:
          options.pane(command);
      }
    },
    dispose() {
      pendingClose = undefined;
    },
  };
}
