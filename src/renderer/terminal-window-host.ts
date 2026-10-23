import {
  applyWindowFrame,
  mountWindowChrome,
  type WindowChromeBridge,
} from "./window-chrome";
import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import {
  mountTerminalSurface,
  type TerminalClipboard,
  type TerminalSurface,
  type TerminalSurfaceConfiguration,
  type TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type {
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { TerminalTheme } from "../shared/terminal-theme";
import type { TerminalLaunchSpec } from "../shared/terminal-launch";
import type { TerminalFontData } from "../shared/terminal-font-data";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import {
  createTerminalTabs,
  TERMINAL_TAB_DRAG_DATA_TYPE,
  type PaneLaunch,
  type TerminalTabs,
} from "./terminal-tabs";
import {
  createSnippetsSidebar,
  type SnippetsSidebar,
} from "./snippets-sidebar";
import { renderUserFileErrorBanner } from "./user-file-error-banner";
import type { LocalImagePreview } from "./local-image-preview";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../shared/local-image";
import { createTerminalFontGenerationOwner } from "./terminal-font-generations";
import type { Translator } from "../shared/i18n";
import {
  createWindowImagePreview,
  searchLabels,
  snippetsLabels,
  windowChromeLabels,
} from "./terminal-window-parts";
import type { WorkspacePlan, WorkspaceSnapshot } from "../shared/workspace";
import type { TerminalActionName } from "../shared/terminal-keybinds";
import type { HeaderToolbarOptions } from "./header-toolbar";
import type {
  CommandsBridge,
  HighlightsBridge,
  SessionsBridge,
  BackupBridge,
  PreferencesBridge,
  FilesBridge,
  AboutBridge,
  AssistantBridge,
} from "../shared/terminal-bridge";
import {
  mountWorkspace,
  windowServices,
  windowTabsOptions,
} from "./terminal-window-workspace";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export interface TerminalWindowPageElements {
  readonly tabStrip: HTMLElement;
  readonly tabsContainer: HTMLElement;
}

export interface TerminalWindowPageOptions {
  readonly createAdapter: (
    fontConfigurationId?: string,
    launch?: TerminalLaunchSpec,
  ) => ElectronTerminalAdapter;
  readonly configuration?: TerminalRendererConfiguration;
  readonly chrome?: WindowChromeBridge;
  // Header toolbar actions; the toolbar needs the window chrome to host it.
  readonly toolbar?: Pick<HeaderToolbarOptions, "runAction" | "openMainMenu">;
  readonly page?: Pick<
    Window,
    "addEventListener" | "removeEventListener" | "document"
  >;
  readonly mount?: MountTerminalSurface;
  readonly onSurfaceFailure?: (message: string) => void;
  readonly loadFontData?: (family?: string) => Promise<TerminalFontData>;
  readonly subscribeToFontZoom?: (
    listener: (command: TerminalFontZoom) => void,
  ) => () => void;
  readonly subscribeToConfigurationUpdates?: (
    listener: (configuration: TerminalRendererConfiguration) => void,
  ) => () => void;
  readonly userFileErrorBanner?: HTMLElement;
  readonly clipboard?: TerminalClipboard;
  readonly subscribeToClipboardActions?: (
    listener: (action: "copy" | "paste" | "select-all") => void,
  ) => () => void;
  readonly droppedFilePathInsertion?: (files: readonly File[]) => string;
  readonly subscribeToTabCommands?: (
    listener: (command: TerminalTabCommand) => void,
  ) => () => void;
  readonly subscribeToTabBarToggle?: (listener: () => void) => () => void;
  readonly subscribeToTabTitles?: (
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ) => () => void;
  readonly notifyTabSelection?: (
    sessionId: TerminalSessionId,
    tabSessionIds?: readonly TerminalSessionId[],
  ) => void;
  readonly syncTabTitle?: (sessionId: TerminalSessionId) => void;
  readonly notifyTabsEmpty?: (reason?: "rendering-failure") => void;
  readonly onTitleRequest?: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly onBell?: (sessionId: TerminalSessionId) => void;
  readonly onExternalLink?: (url: string) => void;
  readonly loadLocalImage?: (
    source?: LocalImageActivation,
  ) => Promise<LocalImageData | null>;
  readonly subscribeToLocalImageOpen?: (listener: () => void) => () => void;
  readonly translator?: Translator;
  readonly confirmBroadcast?: (targetCount: number) => Promise<boolean>;
  readonly reportWorkingDirectory?: (
    sessionId: TerminalSessionId,
    uri: string,
  ) => void;
  readonly highlights?: HighlightsBridge;
  // How the first tab opens, for example the SSH target given with --ssh.
  readonly initialLaunch?: PaneLaunch;
  // A saved workspace to reopen instead of the first tab.
  readonly initialWorkspace?: WorkspacePlan;
  readonly reportWorkspace?: (snapshot: WorkspaceSnapshot) => void;
  readonly detachTab?: (snapshot: WorkspaceSnapshot) => Promise<boolean>;
  readonly workspace?: {
    readonly element: HTMLElement;
    readonly sessions: SessionsBridge;
    readonly commands?: CommandsBridge;
    readonly backup?: BackupBridge;
    readonly highlights?: HighlightsBridge;
    readonly preferences?: PreferencesBridge;
    readonly files?: FilesBridge;
    readonly assistant?: AssistantBridge;
    readonly about?: AboutBridge;
    readonly saveOutput?: {
      readonly onRequest: (listener: () => void) => () => void;
      readonly save: (text: string) => Promise<string | null>;
    };
    readonly sessionDirectory?: (sessionId: TerminalSessionId) => Promise<{
      readonly directory: string | null;
      readonly busy: boolean;
    } | null>;
    readonly palette?: {
      readonly onToggle: (listener: () => void) => () => void;
      readonly runAction: (action: TerminalActionName) => void;
    };
  };
  readonly snippets?: {
    readonly element: HTMLElement;
    readonly load: () => Promise<TerminalSnippetsResponse>;
    readonly subscribeToToggle: (listener: () => void) => () => void;
  };
}

export interface TerminalWindowPageHost {
  readonly ready: Promise<void>;
  dispose(): void;
}

export function mountTerminalWindowPage(
  elements: TerminalWindowPageElements,
  options: TerminalWindowPageOptions,
): TerminalWindowPageHost {
  const page = options.page ?? window;
  const mount = options.mount ?? mountTerminalSurface;
  let disposed = false;
  let removeZoomListener: (() => void) | undefined;
  let removeConfigurationUpdateListener: (() => void) | undefined;
  let removeClipboardActionListener: (() => void) | undefined;
  let removeTabCommandListener: (() => void) | undefined;
  let removeTabTitleListener: (() => void) | undefined;
  let removeTabBarToggleListener: (() => void) | undefined;
  let snippetsSidebar: SnippetsSidebar | undefined;
  let disposeWorkspace: (() => void) | undefined;
  let removeSnippetsToggleListener: (() => void) | undefined;
  let removeLocalImageOpenListener: (() => void) | undefined;
  let localImagePreview: LocalImagePreview | undefined;
  const hoverAvailabilityListeners = new Set<() => void>();
  let fontConfigurationId = options.configuration?.fontConfigurationId;
  let activeFontFamily = options.configuration?.fontFamily;
  const fontGenerations = options.loadFontData
    ? createTerminalFontGenerationOwner(options.loadFontData, activeFontFamily)
    : undefined;
  let activeSurfaceConfiguration = options.configuration
    ? surfaceConfiguration(options.configuration)
    : undefined;

  // Theme tint, then the window frame (corner radius, auto-hiding bar).
  const applyPageTheme = (configuration: TerminalRendererConfiguration) =>
    paintPage(page.document, elements.tabsContainer, configuration);

  if (options.configuration) {
    page.document.documentElement.style.setProperty(
      "--native-title-inset",
      `${options.configuration.nativeTitleInset}px`,
    );
    applyPageTheme(options.configuration);
  }

  const surfaceOptions: TerminalSurfaceOptions = {
    ...activeSurfaceConfiguration,
    background: "host",
    ...(options.translator
      ? { searchLabels: searchLabels(options.translator) }
      : {}),
    ...(fontGenerations ? { acquireFontInputs: fontGenerations.acquire } : {}),
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.onExternalLink
      ? { onExternalLink: options.onExternalLink }
      : {}),
    ...(options.loadLocalImage
      ? {
          linkHoverAvailability: {
            isEnabled: () => !(localImagePreview?.isActive() ?? false),
            subscribe(listener: () => void) {
              hoverAvailabilityListeners.add(listener);
              return () => {
                hoverAvailabilityListeners.delete(listener);
              };
            },
          },
          onLocalImageActivation: (source: LocalImageActivation) =>
            void localImagePreview?.open(source),
        }
      : {}),
    ...(options.onSurfaceFailure
      ? { onFatalError: options.onSurfaceFailure }
      : {}),
  };

  const { translator, toolbar, broadcastIndicator, highlighting, directories } =
    windowServices(page.document, options, () => tabs);
  const tabs: TerminalTabs = createTerminalTabs(
    { strip: elements.tabStrip, container: elements.tabsContainer },
    {
      ...windowTabsOptions(
        options,
        translator,
        broadcastIndicator,
        highlighting,
        directories,
      ),
      createAdapter: (launch) =>
        launch === undefined
          ? options.createAdapter(fontConfigurationId)
          : options.createAdapter(fontConfigurationId, launch),
      mount,
      surfaceOptions,
    },
  );

  const previewActive = () => localImagePreview?.isActive() ?? false;
  const onPageFocus = () => {
    if (!previewActive()) tabs.focusSelected();
  };
  const chrome = options.chrome
    ? mountWindowChrome(
        page.document,
        options.chrome,
        onPageFocus,
        toolbar,
        translator ? windowChromeLabels(translator) : undefined,
      )
    : undefined;

  if (options.loadLocalImage) {
    localImagePreview = createWindowImagePreview(
      page.document,
      options,
      translator,
      () => tabs,
      () => {
        chrome?.setPreviewActive(localImagePreview?.isActive() ?? false);
        for (const listener of hoverAvailabilityListeners) listener();
      },
    );
    removeLocalImageOpenListener = options.subscribeToLocalImageOpen?.(
      () => void localImagePreview?.open(),
    );
  }

  const isInternalTabDrag = (event: DragEvent) =>
    [...(event.dataTransfer?.types ?? [])].includes(
      TERMINAL_TAB_DRAG_DATA_TYPE,
    );
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (previewActive() || !isInternalTabDrag(event)) event.stopPropagation();
  };
  const onDrop = (event: DragEvent) => {
    // Capture before the Terminal Surface or another target can interpret a native file URI.
    event.preventDefault();
    if (previewActive()) {
      event.stopPropagation();
      return;
    }
    if (isInternalTabDrag(event)) return;
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0 || !options.droppedFilePathInsertion)
      return;
    const insertion = options.droppedFilePathInsertion([...files]);
    if (insertion.length > 0) tabs.injectText(insertion);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("pagehide", onPageHide);
    page.removeEventListener("focus", onPageFocus);
    page.document.removeEventListener("dragover", onDragOver, true);
    page.document.removeEventListener("drop", onDrop, true);
    removeZoomListener?.();
    removeConfigurationUpdateListener?.();
    removeClipboardActionListener?.();
    removeTabCommandListener?.();
    removeTabTitleListener?.();
    removeTabBarToggleListener?.();
    removeSnippetsToggleListener?.();
    removeLocalImageOpenListener?.();
    chrome?.dispose();
    localImagePreview?.dispose();
    localImagePreview = undefined;
    snippetsSidebar?.dispose();
    snippetsSidebar = undefined;
    disposeWorkspace?.();
    tabs.dispose();
    broadcastIndicator.dispose();
    highlighting?.dispose();
    fontGenerations?.dispose();
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  page.addEventListener("focus", onPageFocus);
  page.document.addEventListener("dragover", onDragOver, true);
  page.document.addEventListener("drop", onDrop, true);

  removeConfigurationUpdateListener = options.subscribeToConfigurationUpdates?.(
    (configuration) => {
      if (disposed) return;
      fontConfigurationId = configuration.fontConfigurationId;
      if (!chrome)
        page.document.documentElement.style.setProperty(
          "--native-title-inset",
          `${configuration.nativeTitleInset}px`,
        );
      applyPageTheme(configuration);
      const nextSurfaceConfiguration = surfaceConfiguration(configuration);
      if (configuration.fontFamily !== activeFontFamily) {
        activeFontFamily = configuration.fontFamily;
        fontGenerations?.select(activeFontFamily);
      }
      if (
        !activeSurfaceConfiguration ||
        !sameSurfaceConfiguration(
          activeSurfaceConfiguration,
          nextSurfaceConfiguration,
        )
      )
        tabs.applyConfiguration(nextSurfaceConfiguration);
      activeSurfaceConfiguration = nextSurfaceConfiguration;
      if (options.userFileErrorBanner)
        renderUserFileErrorBanner(
          options.userFileErrorBanner,
          configuration.userFileErrors,
        );
    },
  );

  // Startup reconciliation can arrive before the first Surface is ready.
  removeTabTitleListener = options.subscribeToTabTitles?.((sessionId, title) =>
    tabs.setSessionTitle(sessionId, title),
  );

  const ready = tabs.ready.then(() => {
    if (disposed) return;
    removeZoomListener = options.subscribeToFontZoom?.((command) => {
      if (!previewActive()) tabs.zoom(command);
    });
    removeClipboardActionListener = options.subscribeToClipboardActions?.(
      (action) => {
        if (!previewActive()) tabs.clipboardAction(action);
      },
    );
    removeTabCommandListener = options.subscribeToTabCommands?.((command) =>
      tabs.handleCommand(command),
    );
    removeTabBarToggleListener = options.subscribeToTabBarToggle?.(() => {
      if (!previewActive()) tabs.toggleTabBar();
    });
    if (options.snippets) {
      const sidebar = createSnippetsSidebar(options.snippets.element, {
        loadSnippets: options.snippets.load,
        inject: (snippet) => {
          if (!previewActive())
            tabs.injectSnippet(snippet.body, { submit: snippet.execute });
        },
        focusTerminal: onPageFocus,
        labels: snippetsLabels(options.translator),
      });
      snippetsSidebar = sidebar;
      removeSnippetsToggleListener = options.snippets.subscribeToToggle(() => {
        if (!previewActive()) void sidebar.toggle();
      });
    }
    if (options.workspace)
      disposeWorkspace = mountWorkspace(options.workspace, {
        translator,
        tabs,
        isBlocked: previewActive,
        focusTerminal: onPageFocus,
        toolbar,
        directories,
        clipboard: options.clipboard,
        terminalArea: elements.tabsContainer,
        viewImage: (path) =>
          void localImagePreview?.open({ source: "native-path", path }),
      });
  });

  return { ready, dispose };
}

function paintPage(
  document: Document,
  tabsContainer: HTMLElement,
  configuration: TerminalRendererConfiguration,
): void {
  paintPageTheme(
    document,
    tabsContainer,
    configuration.terminalTheme,
    configuration.transparency,
  );
  applyWindowFrame(document, configuration);
}

// The Terminal Theme tints the page, chrome and every tab container.
function paintPageTheme(
  document: Document,
  tabsContainer: HTMLElement,
  theme: TerminalTheme,
  transparency: number,
): void {
  const { background, foreground } = theme.colors;
  const root = document.documentElement.style;
  root.setProperty("--terminal-background-opacity", String(1 - transparency));
  root.setProperty("--terminal-background", background);
  root.setProperty("--terminal-foreground", foreground);
  document.body.style.setProperty("--terminal-background", background);
  tabsContainer.style.setProperty("--terminal-background", background);
}

function sameSurfaceConfiguration(
  first: TerminalSurfaceConfiguration,
  second: TerminalSurfaceConfiguration,
): boolean {
  const firstSystemFont = first.appearance.systemFont;
  const secondSystemFont = second.appearance.systemFont;
  return (
    first.appearance.fontSize === second.appearance.fontSize &&
    first.appearance.lineHeight === second.appearance.lineHeight &&
    first.appearance.ligatures === second.appearance.ligatures &&
    firstSystemFont?.family === secondSystemFont?.family &&
    firstSystemFont?.available === secondSystemFont?.available &&
    first.scrollbackLines === second.scrollbackLines &&
    first.optionKeyMode === second.optionKeyMode &&
    first.padding.top === second.padding.top &&
    first.padding.right === second.padding.right &&
    first.padding.bottom === second.padding.bottom &&
    first.padding.left === second.padding.left &&
    first.theme.version === second.theme.version &&
    first.theme.name === second.theme.name &&
    (
      Object.keys(first.theme.colors) as Array<keyof TerminalTheme["colors"]>
    ).every((key) => first.theme.colors[key] === second.theme.colors[key])
  );
}

function surfaceConfiguration(
  configuration: TerminalRendererConfiguration,
): TerminalSurfaceConfiguration {
  return {
    appearance: {
      fontSize: configuration.fontSize,
      lineHeight: configuration.fontLineHeight,
      ligatures: configuration.fontLigatures,
      ...(configuration.fontFamily
        ? {
            systemFont: {
              family: configuration.fontFamily,
              available: true,
            },
          }
        : {}),
    },
    scrollbackLines: configuration.scrollbackLines,
    padding: configuration.terminalPadding,
    optionKeyMode: configuration.optionKeyMode,
    theme: configuration.terminalTheme,
  };
}
