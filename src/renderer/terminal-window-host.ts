import { mountWindowChrome, type WindowChromeBridge } from "./window-chrome";
import { mountAboutDialog } from "./about/about-dialog";
import type { AboutBridge } from "../shared/about";
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
  TerminalExportKind,
  TerminalExportRequest,
} from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { TerminalTheme } from "../shared/terminal-theme";
import type { TerminalFontData } from "../shared/terminal-font-data";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import {
  createTerminalTabs,
  TERMINAL_TAB_DRAG_DATA_TYPE,
  type TerminalTabs,
} from "./terminal-tabs";
import {
  createSnippetsSidebar,
  type SnippetsSidebar,
} from "./snippets-sidebar";
import { renderUserFileErrorBanner } from "./user-file-error-banner";
import {
  createLocalImagePreview,
  type LocalImagePreview,
} from "./local-image-preview";
import type {
  LocalImageActivation,
  LocalImageData,
} from "../shared/local-image";
import { createTerminalFontGenerationOwner } from "./terminal-font-generations";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export interface TerminalWindowPageElements {
  readonly tabStrip: HTMLElement;
  readonly tabsContainer: HTMLElement;
}

interface TerminalWindowPageOptions {
  readonly about?: AboutBridge;
  readonly createAdapter: (
    fontConfigurationId?: string,
  ) => ElectronTerminalAdapter;
  readonly configuration?: TerminalRendererConfiguration;
  readonly chrome?: WindowChromeBridge;
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
  readonly subscribeToFind?: (listener: () => void) => () => void;
  readonly subscribeToExportRequests?: (
    listener: (kind: TerminalExportKind) => void,
  ) => () => void;
  readonly saveTerminalExport?: (
    request: TerminalExportRequest,
  ) => Promise<void>;
  readonly subscribeToTabTitles?: (
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ) => () => void;
  readonly notifyTabSelection?: (sessionId: TerminalSessionId) => void;
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
  let removeConfigurationUpdateListener: (() => void) | undefined;
  let removeTabCommandListener: (() => void) | undefined;
  let removeTabTitleListener: (() => void) | undefined;
  let removeGuardedActionListeners: (() => void) | undefined;
  let snippetsSidebar: SnippetsSidebar | undefined;
  let removeSnippetsToggleListener: (() => void) | undefined;
  let removeLocalImageOpenListener: (() => void) | undefined;
  let localImagePreview: LocalImagePreview | undefined;
  let about: ReturnType<typeof mountAboutDialog>;
  const previewActive = () =>
    (localImagePreview?.isActive() ?? false) || (about?.isActive() ?? false);
  const hoverAvailabilityListeners = new Set<() => void>();
  let fontConfigurationId = options.configuration?.fontConfigurationId;
  let activeFontFamily = options.configuration?.fontFamily;
  const fontGenerations = options.loadFontData
    ? createTerminalFontGenerationOwner(options.loadFontData, activeFontFamily)
    : undefined;
  let activeSurfaceConfiguration = options.configuration
    ? surfaceConfiguration(options.configuration)
    : undefined;

  const applyPageTheme = (theme: TerminalTheme, transparency: number) => {
    const { background, foreground } = theme.colors;
    page.document.documentElement.style.setProperty(
      "--terminal-background-opacity",
      String(1 - transparency),
    );
    page.document.documentElement.style.setProperty(
      "--terminal-background",
      background,
    );
    page.document.documentElement.style.setProperty(
      "--terminal-foreground",
      foreground,
    );
    page.document.body.style.setProperty("--terminal-background", background);
    elements.tabsContainer.style.setProperty(
      "--terminal-background",
      background,
    );
  };

  if (options.configuration) {
    page.document.documentElement.style.setProperty(
      "--native-title-inset",
      `${options.configuration.nativeTitleInset}px`,
    );
    applyPageTheme(
      options.configuration.terminalTheme,
      options.configuration.transparency,
    );
  }

  const surfaceOptions: TerminalSurfaceOptions = {
    ...activeSurfaceConfiguration,
    background: "host",
    ...(fontGenerations ? { acquireFontInputs: fontGenerations.acquire } : {}),
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.onExternalLink
      ? { onExternalLink: options.onExternalLink }
      : {}),
    ...(options.loadLocalImage
      ? {
          linkHoverAvailability: {
            isEnabled: () => !previewActive(),
            subscribe(listener: () => void) {
              hoverAvailabilityListeners.add(listener);
              return () => {
                hoverAvailabilityListeners.delete(listener);
              };
            },
          },
          onLocalImageActivation: (source: LocalImageActivation) => {
            if (!about?.isActive()) void localImagePreview?.open(source);
          },
        }
      : {}),
    ...(options.onSurfaceFailure
      ? { onFatalError: options.onSurfaceFailure }
      : {}),
  };

  const tabs: TerminalTabs = createTerminalTabs(
    { strip: elements.tabStrip, container: elements.tabsContainer },
    {
      createAdapter: () => options.createAdapter(fontConfigurationId),
      canFocus: () => !disposed && !about?.isActive(),
      mount,
      surfaceOptions,
      showTabBar: options.configuration?.showTabBar ?? true,
      ...(options.notifyTabsEmpty
        ? { notifyEmpty: options.notifyTabsEmpty }
        : {}),
      ...(options.notifyTabSelection
        ? { notifySelection: options.notifyTabSelection }
        : {}),
      ...(options.onTitleRequest
        ? { notifyTitle: options.onTitleRequest }
        : {}),
      ...(options.onBell ? { notifyBell: options.onBell } : {}),
      syncTitle: (sessionId) => options.syncTabTitle?.(sessionId),
    },
  );

  const chrome = options.chrome
    ? mountWindowChrome(page.document, options.chrome, () => {
        if (!previewActive()) tabs.focusSelected();
      })
    : undefined;

  if (options.loadLocalImage) {
    localImagePreview = createLocalImagePreview(page.document, {
      loadImage: options.loadLocalImage,
      focusTerminal: () => tabs.focusSelected(),
      onActivityChange: () => {
        chrome?.setPreviewActive(previewActive());
        for (const listener of hoverAvailabilityListeners) listener();
      },
    });
    removeLocalImageOpenListener = options.subscribeToLocalImageOpen?.(() => {
      if (!about?.isActive()) void localImagePreview?.open();
    });
  }

  about = mountAboutDialog(
    page.document,
    options.about,
    () => !disposed && !localImagePreview?.isActive(),
    {
      focusTerminal: tabs.focusSelected,
      onActivityChange: (active) => {
        chrome?.setPreviewActive(
          active || (localImagePreview?.isActive() ?? false),
        );
        for (const listener of hoverAvailabilityListeners) listener();
      },
    },
  );
  const onPageFocus = () => {
    if (!previewActive()) tabs.focusSelected();
  };
  const removeFileDrops = installFileDrops(
    page.document,
    previewActive,
    tabs.injectText,
    options.droppedFilePathInsertion,
  );
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("pagehide", onPageHide);
    page.removeEventListener("focus", onPageFocus);
    removeFileDrops();
    removeGuardedActionListeners?.();
    removeConfigurationUpdateListener?.();
    removeTabCommandListener?.();
    removeTabTitleListener?.();
    removeSnippetsToggleListener?.();
    removeLocalImageOpenListener?.();
    about?.dispose();
    about = undefined;
    chrome?.dispose();
    localImagePreview?.dispose();
    localImagePreview = undefined;
    snippetsSidebar?.dispose();
    snippetsSidebar = undefined;
    tabs.dispose();
    fontGenerations?.dispose();
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  page.addEventListener("focus", onPageFocus);

  removeConfigurationUpdateListener = options.subscribeToConfigurationUpdates?.(
    (configuration) => {
      if (disposed) return;
      fontConfigurationId = configuration.fontConfigurationId;
      if (!chrome)
        page.document.documentElement.style.setProperty(
          "--native-title-inset",
          `${configuration.nativeTitleInset}px`,
        );
      applyPageTheme(configuration.terminalTheme, configuration.transparency);
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
    removeGuardedActionListeners = subscribeToGuardedActions(
      options,
      tabs,
      previewActive,
    );
    removeTabCommandListener = options.subscribeToTabCommands?.((command) => {
      if (
        about?.isActive() &&
        ["new", "next", "previous", "select"].includes(command.action)
      )
        return;
      tabs.handleCommand(command);
    });
    if (options.snippets) {
      const sidebar = createSnippetsSidebar(options.snippets.element, {
        loadSnippets: options.snippets.load,
        inject: (snippet) => {
          if (!previewActive())
            tabs.injectSnippet(snippet.body, { submit: snippet.execute });
        },
        focusTerminal: onPageFocus,
      });
      snippetsSidebar = sidebar;
      removeSnippetsToggleListener = options.snippets.subscribeToToggle(() => {
        if (!previewActive()) void sidebar.toggle();
      });
    }
  });

  return { ready, dispose };
}

// Terminal-directed actions are ignored while a preview or About owns input.
function subscribeToGuardedActions(
  options: TerminalWindowPageOptions,
  tabs: TerminalTabs,
  blocked: () => boolean,
): () => void {
  const removals = [
    options.subscribeToFontZoom?.((command) => {
      if (!blocked()) tabs.zoom(command);
    }),
    options.subscribeToClipboardActions?.((action) => {
      if (!blocked()) tabs.clipboardAction(action);
    }),
    options.subscribeToTabBarToggle?.(() => {
      if (!blocked()) tabs.toggleTabBar();
    }),
    options.subscribeToFind?.(() => {
      if (!blocked()) tabs.find();
    }),
    // The text is read now, before any dialog, so a later tab switch cannot
    // substitute another tab's content. Main reports save outcomes.
    options.subscribeToExportRequests?.((kind) => {
      const text = blocked() ? undefined : tabs.exportText(kind);
      if (text !== undefined)
        void options.saveTerminalExport?.({ kind, text }).catch(() => {});
    }),
  ];
  return () => {
    for (const remove of removals) remove?.();
  };
}

function installFileDrops(
  document: Document,
  blocked: () => boolean,
  inject: (text: string) => void,
  format: TerminalWindowPageOptions["droppedFilePathInsertion"],
): () => void {
  const isInternalTabDrag = (event: DragEvent) =>
    [...(event.dataTransfer?.types ?? [])].includes(
      TERMINAL_TAB_DRAG_DATA_TYPE,
    );
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (blocked() || !isInternalTabDrag(event)) event.stopPropagation();
  };
  const onDrop = (event: DragEvent) => {
    // Capture before the Surface can interpret a native file URI.
    event.preventDefault();
    if (blocked()) {
      event.stopPropagation();
      return;
    }
    if (isInternalTabDrag(event)) return;
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (!files?.length || !format) return;
    const insertion = format([...files]);
    if (insertion.length > 0) inject(insertion);
  };
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("drop", onDrop, true);
  return () => {
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("drop", onDrop, true);
  };
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
