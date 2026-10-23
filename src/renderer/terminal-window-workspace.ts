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
import { installBackupDialogs } from "./backup/backup-dialogs";
import { openHighlightEditor } from "./highlighting/highlight-editor";
import { openPreferencesDialog } from "./preferences/preferences-dialog";
import { createCommandPalette, type PaletteEntry } from "./command-palette";
import { sessionLaunch } from "./sessions/session-actions";
import { TERMINAL_ACTION_NAMES } from "../shared/terminal-keybinds";
import type { MessageKey } from "../shared/locales/en";
import { createHeaderToolbar, type HeaderToolbar } from "./header-toolbar";

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
    // Its panel buttons show which sidebar panel is open.
    readonly toolbar?: HeaderToolbar | undefined;
  },
): () => void {
  const document = workspace.element.ownerDocument;
  const toaster = createToaster(document);
  const sidebar = createWorkspaceSidebar(workspace.element, {
    translator: context.translator,
    focusTerminal: context.focusTerminal,
    onChange(panelId) {
      context.toolbar?.setPressed("sessions", panelId === "sessions");
      context.toolbar?.setPressed("commands", panelId === "commands");
    },
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
  const palette = workspace.palette
    ? createCommandPalette(document, {
        translator: context.translator,
        entries: () => paletteEntries(workspace, context),
      })
    : undefined;
  const removePaletteToggle = workspace.palette?.onToggle(() => {
    if (!context.isBlocked()) palette?.toggle();
  });
  const openHighlightRules = () => {
    if (document.querySelector(".highlight-editor")) return;
    void openHighlightEditor(document, {
      translator: context.translator,
      bridge: workspace.highlights!,
    }).catch((cause: unknown) => toaster.notify(String(cause)));
  };
  const removeHighlightEditor = workspace.highlights?.onOpenEditor(() => {
    if (!context.isBlocked()) openHighlightRules();
  });
  const removePreferences = workspace.preferences?.onOpen(() => {
    if (context.isBlocked() || document.querySelector(".preferences-dialog"))
      return;
    void openPreferencesDialog(document, {
      translator: context.translator,
      bridge: workspace.preferences!,
      ...(workspace.highlights ? { openHighlightRules } : {}),
    }).catch((cause: unknown) => toaster.notify(String(cause)));
  });
  const removeBackup = workspace.backup
    ? installBackupDialogs(document, {
        bridge: workspace.backup,
        translator: context.translator,
        notify: toaster.notify,
      })
    : undefined;
  return () => {
    removeToggle();
    removeBackup?.();
    removeHighlightEditor?.();
    removePreferences?.();
    removePaletteToggle?.();
    palette?.dispose();
    removeCommandsToggle?.();
    sidebar.dispose();
    toaster.dispose();
  };
}

// Application actions (except tab numbers and the palette itself), then
// Saved Sessions, which open in a new tab.
async function paletteEntries(
  workspace: NonNullable<TerminalWindowPageOptions["workspace"]>,
  context: Parameters<typeof mountWorkspace>[1],
): Promise<PaletteEntry[]> {
  const t = context.translator.t.bind(context.translator);
  const actions = TERMINAL_ACTION_NAMES.filter(
    (name) => !name.startsWith("selectTab") && name !== "commandPalette",
  ).map((name) => ({
    label: t(`action.${name}` as MessageKey),
    section: t("palette.actions"),
    run: () => workspace.palette!.runAction(name),
  }));
  const sessions = await workspace.sessions
    .list()
    .then((document) => document.sessions)
    .catch(() => []);
  return [
    ...actions,
    ...sessions.map((session) => ({
      label: t("palette.openSession", { name: session.name }),
      section: t("palette.sessions"),
      run: () => {
        if (!context.isBlocked())
          context.tabs.openLaunch(sessionLaunch(session), "tab");
      },
    })),
  ];
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
    ...(options.initialLaunch ? { initialLaunch: options.initialLaunch } : {}),
    ...(options.initialWorkspace
      ? { initialWorkspace: options.initialWorkspace }
      : {}),
    ...(options.reportWorkspace
      ? { onWorkspaceChange: options.reportWorkspace }
      : {}),
    dividerLabel: translator.t("pane.divider"),
    translator,
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

// Per-window helpers created before the tabs: translations, the header
// toolbar, the broadcast indicator (which stops broadcasting through the
// tabs) and highlighting.
export function windowServices(
  document: Document,
  options: TerminalWindowPageOptions,
  tabs: () => TerminalTabs,
): {
  readonly translator: Translator;
  readonly toolbar: HeaderToolbar | undefined;
  readonly broadcastIndicator: BroadcastIndicator;
  readonly highlighting: HighlightingController | undefined;
} {
  const translator = options.translator ?? createTranslator("en");
  const toolbar =
    options.chrome && options.toolbar
      ? createHeaderToolbar(document, {
          translator,
          ...options.toolbar,
          hasCommands: options.workspace?.commands !== undefined,
        })
      : undefined;
  return {
    translator,
    toolbar,
    broadcastIndicator: createBroadcastIndicator(document, {
      translator,
      stop: () => tabs().handleCommand({ action: "toggle-broadcast" }),
      onChange: (active) => toolbar?.setPressed("broadcast", active),
    }),
    highlighting: options.highlights
      ? createHighlightingController(options.highlights)
      : undefined,
  };
}
