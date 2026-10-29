import type {
  TerminalExit,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { TerminalTabsOptions } from "./terminal-tabs";
import type { createPaneOperations } from "./terminal-pane-operations";
import {
  appendTab,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";
import type { ApplicationTab } from "./terminal-tabs";
import type { retainDismissalGesture } from "./about/about-dialog";
import type { Translate } from "./renderer-language";

export function relabelEndedPane(pane: TerminalPane, t: Translate) {
  const notice = pane.container.querySelector<HTMLElement>(
    ".terminal-exit-notice",
  );
  if (!notice) return;
  notice.querySelector("span")!.textContent =
    t("terminal.sshExit", { code: Number(notice.dataset.exitCode) }) + " ";
  notice.querySelector("button")!.textContent = t("hosted.close");
}

export function terminalPaneEnded(
  pane: TerminalPane,
  exit: TerminalExit,
  panes: ReturnType<typeof createPaneOperations>,
  keyboard: ReturnType<typeof retainDismissalGesture>,
  notify: (tab: TerminalTab) => void,
  t: Translate,
) {
  if (exit.retained) {
    const notice = pane.container.ownerDocument.createElement("div");
    notice.className = "terminal-exit-notice";
    notice.setAttribute("role", "status");
    notice.dataset.exitCode = String(exit.exitCode);
    notice.append(pane.container.ownerDocument.createElement("span"));
    const close = pane.container.ownerDocument.createElement("button");
    close.addEventListener("keydown", (event) => keyboard.track(event, close));
    close.addEventListener("click", () => panes.closePane(pane));
    notice.append(close);
    pane.container.append(notice);
    relabelEndedPane(pane, t);
    notify(pane.tab);
  } else if (exit.signal === 0 && !exit.startupFailed) panes.removePane(pane);
  else notify(pane.tab);
}

export function terminalTabCreator(
  parent: HTMLElement,
  tabs: ApplicationTab[],
  options: TerminalTabsOptions,
  owner: {
    selected(): ApplicationTab | undefined;
    select(index: number, passive?: boolean): void;
    render(): void;
    panes: ReturnType<typeof createPaneOperations>;
    mount(pane: TerminalPane): Promise<void>;
  },
) {
  return async (
    ssh?: Extract<TerminalTabCommand, { action: "open-ssh" }>,
  ): Promise<void> => {
    const previous = owner.selected();
    const foreground =
      !ssh ||
      ((options.isSshSourceForeground
        ? options.isSshSourceForeground(ssh.sourceView)
        : previous?.kind === "hosted" && previous.id === ssh.sourceView) &&
        options.canFocus?.() !== false);
    const pane = appendTab(
      parent,
      ssh
        ? () => options.createAdapter(undefined, ssh.token)
        : options.createAdapter,
    );
    if (ssh) pane.label = ssh.title;
    tabs.push(pane.tab);
    owner.panes.renderTab(pane.tab);
    owner.panes.trackFocus(pane);
    if (foreground) owner.select(tabs.length - 1, tabs.length === 1);
    else {
      pane.tab.container.hidden = true;
      pane.container.hidden = true;
      owner.render();
    }
    if (ssh) options.sshPane?.(ssh.token, true);
    try {
      await owner.mount(pane);
    } catch (error) {
      if (ssh) options.sshPane?.(ssh.token, null);
      throw error;
    }
  };
}
