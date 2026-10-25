import { createTranslator, type Translator } from "../shared/i18n";
import { passwordOffer } from "./sessions/session-password-offer";
import { sshSolution } from "./sessions/ssh-solution";
import {
  createSessionActivity,
  openPanesOption,
  type SessionActivity,
} from "./sessions/session-activity";
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
import { chooseTerminals } from "./commands/terminal-picker";
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
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import { createHeaderToolbar, type HeaderToolbar } from "./header-toolbar";
import { showContextMenu } from "./ui/context-menu";
import { createFilesPanel } from "./files/files-panel";
import { createAssistantPanel } from "./assistant/assistant-panel";
import { openAboutDialog } from "./about/about-dialog";
import { installFileHoverPreview } from "./files/file-hover-preview";
import {
  createDirectoryTracker,
  type DirectoryTracker,
} from "./files/directory-tracker";

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
    readonly directories: DirectoryTracker;
    readonly clipboard?: Pick<TerminalClipboard, "writeText"> | undefined;
    // The terminal area, for hover previews of printed file names.
    readonly terminalArea?: HTMLElement;
    readonly viewImage?: (filePath: string) => void;
    readonly sessionActivity?: SessionActivity | undefined;
  },
): () => void {
  const document = workspace.element.ownerDocument;
  const toaster = createToaster(document);
  async function runInTerminals(command: string) {
    // A pane running a program (an editor, a pager) would receive the
    // command as typed text, so it is offered unchecked.
    const targets = await Promise.all(
      context.tabs.paneTargets().map(async (target) => {
        const state =
          target.sessionId && workspace.sessionDirectory
            ? await workspace
                .sessionDirectory(target.sessionId)
                .catch(() => null)
            : null;
        return state?.busy ? { ...target, busy: true } : target;
      }),
    );
    const chosen = await chooseTerminals(
      document,
      context.translator,
      command,
      targets,
    );
    if (!chosen || context.isBlocked()) return;
    const count = chosen.filter((target) => target.run(command)).length;
    toaster.notify(context.translator.t("commands.sentTo", { count }));
    context.focusTerminal();
  }
  function openPreferences(page?: MessageKey) {
    if (
      !workspace.preferences ||
      context.isBlocked() ||
      document.querySelector(".preferences-dialog")
    )
      return;
    void openPreferencesDialog(document, {
      translator: context.translator,
      bridge: workspace.preferences,
      ...(workspace.highlights ? { openHighlightRules } : {}),
      ...(workspace.assistant ? { assistant: workspace.assistant } : {}),
      ...(page ? { page } : {}),
    }).catch((cause: unknown) => toaster.notify(String(cause)));
  }
  const sidebar = createWorkspaceSidebar(workspace.element, {
    translator: context.translator,
    focusTerminal: context.focusTerminal,
    onChange(panelId) {
      context.toolbar?.setPressed("sessions", panelId === "sessions");
      context.toolbar?.setPressed("commands", panelId === "commands");
      context.toolbar?.setPressed("files", panelId === "files");
      context.toolbar?.setPressed("assistant", panelId === "assistant");
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
            ...openPanesOption(context.tabs, context.sessionActivity),
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
                  run: ({ text, submit, multiple }) => {
                    if (context.isBlocked()) return;
                    if (multiple) {
                      void runInTerminals(text);
                      return;
                    }
                    context.tabs.injectSnippet(text, { submit });
                    context.focusTerminal();
                  },
                }),
            },
          ]
        : []),
      ...(workspace.files
        ? [
            {
              id: "files",
              label: "sidebar.files" as const,
              create: () =>
                createFilesPanel(document, {
                  translator: context.translator,
                  bridge: workspace.files!,
                  directories: context.directories,
                  focusedSessionId: () => context.tabs.focusedSessionId(),
                  focusedPane: async () => {
                    const id = context.tabs.focusedSessionId();
                    return id === undefined || !workspace.sessionDirectory
                      ? null
                      : workspace.sessionDirectory(id);
                  },
                  sendKeys: (keys) => {
                    if (!context.isBlocked()) context.tabs.sendKeys(keys);
                  },
                  runCommand: (command) => {
                    if (!context.isBlocked())
                      context.tabs.injectSnippet(command, { submit: true });
                  },
                  notify: toaster.notify,
                  copyText: (text) => void context.clipboard?.writeText(text),
                  typeInTerminal: (text, submit) => {
                    if (context.isBlocked()) return;
                    context.tabs.injectSnippet(text, { submit });
                    if (submit) context.focusTerminal();
                  },
                }),
            },
          ]
        : []),
      ...(workspace.assistant
        ? [
            {
              id: "assistant",
              label: "sidebar.assistant" as const,
              create: () =>
                createAssistantPanel(document, {
                  translator: context.translator,
                  bridge: workspace.assistant!,
                  notify: toaster.notify,
                  copyText: (text) => void context.clipboard?.writeText(text),
                  selection: () => context.tabs.focusedSelection(),
                  openPreferences: () => openPreferences("prefs.assistant"),
                  typeInTerminal: (text, submit) => {
                    if (context.isBlocked()) return;
                    context.tabs.injectSnippet(text, { submit });
                    if (submit) context.focusTerminal();
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
  const removeFilesToggle = workspace.files?.onToggle(() => {
    if (!context.isBlocked()) sidebar.toggle("files");
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
  const removePreferences = workspace.preferences?.onOpen(() =>
    openPreferences(),
  );
  // Save Output to File, from the terminal's right-click menu.
  const removeSaveOutput = workspace.saveOutput?.onRequest(() => {
    if (context.isBlocked()) return;
    const text = context.tabs.focusedOutput();
    if (text.trim() === "") {
      toaster.notify(context.translator.t("output.empty"));
      return;
    }
    void workspace
      .saveOutput!.save(text)
      .then((name) => {
        if (name)
          toaster.notify(context.translator.t("output.saved", { name }));
      })
      .catch((cause: unknown) => toaster.notify(String(cause)));
  });
  const removeAssistantToggle = workspace.assistant?.onToggle(() => {
    if (!context.isBlocked()) sidebar.toggle("assistant");
  });
  const removeFileHover = mountFileHover(workspace, context, toaster.notify);
  const removeAbout = workspace.about?.onOpen(() => {
    if (context.isBlocked() || document.querySelector(".about-dialog")) return;
    void openAboutDialog(
      document,
      context.translator,
      workspace.about!,
      toaster.notify,
    ).catch((cause: unknown) => toaster.notify(String(cause)));
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
    removeAssistantToggle?.();
    removeAbout?.();
    removeFileHover?.();
    removeSaveOutput?.();
    removePaletteToggle?.();
    palette?.dispose();
    removeCommandsToggle?.();
    removeFilesToggle?.();
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
  services: ReturnType<typeof windowServices>,
): Omit<TerminalTabsOptions, "createAdapter" | "mount" | "surfaceOptions"> {
  const { translator, broadcastIndicator, highlighting, directories } =
    services;
  const activity = services.sessionActivity;
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
    surfaceLabel: translator.t("terminal.surface"),
    ...(options.workspace?.sessionDirectory
      ? { paneBusy: paneBusy(options.workspace.sessionDirectory) }
      : {}),
    ...(options.detachTab ? { detachTab: options.detachTab } : {}),
    translator,
    endedBanner: {
      ended: (exitCode) => translator.t("sessions.ended", { code: exitCode }),
      reconnect: translator.t("sessions.reconnect"),
      close: translator.t("common.close"),
      solution: translator.t("sessions.solution"),
    },
    ...(options.workspace
      ? {
          endedOffer: passwordOffer(options.workspace.sessions, translator),
          ...(activity
            ? {
                describeRemote: activity.describeRemote,
                onPanesChange: activity.panesChanged,
              }
            : {}),
          endedSolution: sshSolution(
            options.workspace.element.ownerDocument,
            options.workspace.sessions,
            translator,
          ),
        }
      : {}),
    onBroadcastChange: (targetCount) => broadcastIndicator.show(targetCount),
    ...(options.confirmBroadcast
      ? { confirmBroadcast: options.confirmBroadcast }
      : {}),
    // The Files panel follows the focused pane's directory.
    onWorkingDirectory(sessionId, uri) {
      directories.report(sessionId, uri);
      options.reportWorkingDirectory?.(sessionId, uri);
    },
    ...(options.notifyTabsEmpty
      ? { notifyEmpty: options.notifyTabsEmpty }
      : {}),
    notifySelection(sessionId, siblings) {
      directories.focus(sessionId);
      options.notifyTabSelection?.(sessionId, siblings);
    },
    ...(options.onTitleRequest ? { notifyTitle: options.onTitleRequest } : {}),
    ...(options.onBell ? { notifyBell: options.onBell } : {}),
    syncTitle: (sessionId) => options.syncTabTitle?.(sessionId),
  };
}

// Whether a program runs in any of the given panes, as main sees them.
function paneBusy(
  state: NonNullable<
    NonNullable<TerminalWindowPageOptions["workspace"]>["sessionDirectory"]
  >,
) {
  return async (sessionIds: readonly string[]) =>
    (
      await Promise.all(sessionIds.map((id) => state(id).catch(() => null)))
    ).some((pane) => pane?.busy === true);
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
  readonly directories: DirectoryTracker;
  readonly broadcastIndicator: BroadcastIndicator;
  readonly highlighting: HighlightingController | undefined;
  readonly sessionActivity: SessionActivity | undefined;
} {
  const translator = options.translator ?? createTranslator("en");
  const toolbar =
    options.chrome && options.toolbar
      ? createHeaderToolbar(document, {
          translator,
          ...options.toolbar,
          hasCommands: options.workspace?.commands !== undefined,
          hasFiles: options.workspace?.files !== undefined,
          hasAssistant: options.workspace?.assistant !== undefined,
          openTabs: (position) =>
            showContextMenu(
              document,
              position,
              tabs()
                .tabList()
                .map((tab, index) => ({
                  label: `${tab.selected ? "● " : ""}${index + 1}. ${tab.label}`,
                  action: () => tabs().selectTab(index),
                })),
            ),
        })
      : undefined;
  return {
    translator,
    toolbar,
    directories: createDirectoryTracker(() => tabs().focusedSessionId()),
    broadcastIndicator: createBroadcastIndicator(document, {
      translator,
      stop: () => tabs().handleCommand({ action: "toggle-broadcast" }),
      onChange: (active) => toolbar?.setPressed("broadcast", active),
    }),
    highlighting: options.highlights
      ? createHighlightingController(options.highlights)
      : undefined,
    sessionActivity: options.workspace
      ? createSessionActivity(options.workspace.sessions, translator)
      : undefined,
  };
}

// Hover previews of file names printed in local terminals.
function mountFileHover(
  workspace: NonNullable<TerminalWindowPageOptions["workspace"]>,
  context: Parameters<typeof mountWorkspace>[1],
  notify: (message: string) => void,
): (() => void) | undefined {
  if (!workspace.files || !workspace.sessionDirectory || !context.terminalArea)
    return undefined;
  return installFileHoverPreview(workspace.element.ownerDocument, {
    container: context.terminalArea,
    translator: context.translator,
    files: workspace.files,
    fileAtPoint: (x, y) => context.tabs.fileAtPoint(x, y),
    sessionDirectory: workspace.sessionDirectory,
    isBlocked: context.isBlocked,
    copyText: (text) => context.clipboard?.writeText(text) ?? Promise.resolve(),
    insertText: (text) => {
      if (context.isBlocked()) return;
      context.tabs.injectSnippet(text, { submit: false });
      context.focusTerminal();
    },
    notify,
    ...(context.viewImage ? { viewImage: context.viewImage } : {}),
  });
}
