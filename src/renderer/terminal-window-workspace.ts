import { createTranslator, type Translator } from "../shared/i18n";
import {
  createBroadcastIndicator,
  type BroadcastIndicator,
} from "./broadcast-indicator";
import {
  createHighlightingController,
  type HighlightingController,
} from "./highlighting/highlighting-controller";
import { createSessionsPanel } from "./sessions/sessions-panel";
import { createCommandsPanel } from "./commands/commands-panel";
import type { TerminalTabs, TerminalTabsOptions } from "./terminal-tabs";
import type { TerminalWindowPageOptions } from "./terminal-window-host";
import { createToaster, createWorkspaceSidebar } from "./workspace-sidebar";

// The optional left sidebar with Saved Sessions and the Command Manager.
// Opening a session or typing a command is ignored while a Local Image
// Preview owns the window, like every other injection.
export function mountWorkspace(
  workspace: NonNullable<TerminalWindowPageOptions["workspace"]>,
  context: {
    readonly translator: Translator;
    readonly tabs: TerminalTabs;
    readonly isBlocked: () => boolean;
    readonly focusTerminal: () => void;
  },
): () => void {
  const document = workspace.element.ownerDocument;
  const toaster = createToaster(document);
  const sidebar = createWorkspaceSidebar(workspace.element, {
    translator: context.translator,
    focusTerminal: context.focusTerminal,
    panels: [
      {
        id: "sessions",
        label: "sidebar.sessions",
        create: () =>
          createSessionsPanel(document, {
            translator: context.translator,
            bridge: workspace.sessions,
            notify: toaster.notify,
            open: (launch, placement) => {
              if (!context.isBlocked())
                context.tabs.openLaunch(launch, placement);
            },
          }),
      },
      ...(workspace.commands
        ? [
            {
              id: "commands",
              label: "sidebar.commands" as const,
              create: () =>
                createCommandsPanel(document, {
                  translator: context.translator,
                  bridge: workspace.commands!,
                  chooseFile: workspace.sessions.chooseFile,
                  notify: toaster.notify,
                  run: ({ text, submit }) => {
                    if (context.isBlocked()) return;
                    context.tabs.injectSnippet(text, { submit });
                    context.focusTerminal();
                  },
                }),
            },
          ]
        : []),
    ],
  });
  const removeToggle = workspace.sessions.onToggleSidebar(() => {
    if (!context.isBlocked()) sidebar.toggle("sessions");
  });
  const removeCommandsToggle = workspace.commands?.onToggleSidebar(() => {
    if (!context.isBlocked()) sidebar.toggle("commands");
  });
  return () => {
    removeToggle();
    removeCommandsToggle?.();
    sidebar.dispose();
    toaster.dispose();
  };
}

// Window-level callbacks and translated strings for the Terminal Tabs.
export function windowTabsOptions(
  options: TerminalWindowPageOptions,
  translator: Translator,
  broadcastIndicator: BroadcastIndicator,
  highlighting: HighlightingController | undefined,
): Omit<TerminalTabsOptions, "createAdapter" | "mount" | "surfaceOptions"> {
  return {
    ...(highlighting
      ? { createHighlighter: () => highlighting.createHighlighter() }
      : {}),
    showTabBar: options.configuration?.showTabBar ?? true,
    dividerLabel: translator.t("pane.divider"),
    endedBanner: {
      ended: (exitCode) => translator.t("sessions.ended", { code: exitCode }),
      reconnect: translator.t("sessions.reconnect"),
      close: translator.t("common.close"),
    },
    onBroadcastChange: (targetCount) => broadcastIndicator.show(targetCount),
    ...(options.confirmBroadcast
      ? { confirmBroadcast: options.confirmBroadcast }
      : {}),
    ...(options.reportWorkingDirectory
      ? { onWorkingDirectory: options.reportWorkingDirectory }
      : {}),
    ...(options.notifyTabsEmpty
      ? { notifyEmpty: options.notifyTabsEmpty }
      : {}),
    ...(options.notifyTabSelection
      ? { notifySelection: options.notifyTabSelection }
      : {}),
    ...(options.onTitleRequest ? { notifyTitle: options.onTitleRequest } : {}),
    ...(options.onBell ? { notifyBell: options.onBell } : {}),
    syncTitle: (sessionId) => options.syncTabTitle?.(sessionId),
  };
}

// Per-window helpers created before the tabs: translations, the broadcast
// indicator (which stops broadcasting through the tabs) and highlighting.
export function windowServices(
  document: Document,
  options: TerminalWindowPageOptions,
  tabs: () => TerminalTabs,
): {
  readonly translator: Translator;
  readonly broadcastIndicator: BroadcastIndicator;
  readonly highlighting: HighlightingController | undefined;
} {
  const translator = options.translator ?? createTranslator("en");
  return {
    translator,
    broadcastIndicator: createBroadcastIndicator(document, {
      translator,
      stop: () => tabs().handleCommand({ action: "toggle-broadcast" }),
    }),
    highlighting: options.highlights
      ? createHighlightingController(options.highlights)
      : undefined,
  };
}
