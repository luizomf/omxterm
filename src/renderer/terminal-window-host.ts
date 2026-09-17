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
  readonly createAdapter: () => ElectronTerminalAdapter;
  readonly configuration?: TerminalRendererConfiguration;
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
  readonly subscribeToTabTitles?: (
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ) => () => void;
  readonly notifyTabSelection?: (sessionId: TerminalSessionId) => void;
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
  let removeZoomListener: (() => void) | undefined;
  let removeConfigurationUpdateListener: (() => void) | undefined;
  let removeClipboardActionListener: (() => void) | undefined;
  let removeTabCommandListener: (() => void) | undefined;
  let removeTabTitleListener: (() => void) | undefined;
  let snippetsSidebar: SnippetsSidebar | undefined;
  let removeSnippetsToggleListener: (() => void) | undefined;
  let removeLocalImageOpenListener: (() => void) | undefined;
  let localImagePreview: LocalImagePreview | undefined;
  let activeSurfaceConfiguration = options.configuration
    ? surfaceConfiguration(options.configuration)
    : undefined;

  const applyPageTheme = (theme: TerminalTheme) => {
    const { background, foreground } = theme.colors;
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
    applyPageTheme(options.configuration.terminalTheme);
  }

  const surfaceOptions: TerminalSurfaceOptions = {
    ...activeSurfaceConfiguration,
    ...(options.loadFontData ? { loadFontData: options.loadFontData } : {}),
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.onExternalLink
      ? { onExternalLink: options.onExternalLink }
      : {}),
    ...(options.loadLocalImage
      ? {
          onLocalImageActivation: (source: LocalImageActivation) =>
            void localImagePreview?.open(source),
        }
      : {}),
    ...(options.onSurfaceFailure
      ? { onFatalError: options.onSurfaceFailure }
      : {}),
  };

  const tabs: TerminalTabs = createTerminalTabs(
    { strip: elements.tabStrip, container: elements.tabsContainer },
    {
      createAdapter: options.createAdapter,
      mount,
      surfaceOptions,
      ...(options.notifyTabSelection
        ? { notifySelection: options.notifyTabSelection }
        : {}),
      ...(options.onTitleRequest
        ? { notifyTitle: options.onTitleRequest }
        : {}),
      ...(options.onBell ? { notifyBell: options.onBell } : {}),
    },
  );

  if (options.loadLocalImage) {
    localImagePreview = createLocalImagePreview(page.document, {
      loadImage: options.loadLocalImage,
      focusTerminal: () => tabs.focusSelected(),
    });
    removeLocalImageOpenListener = options.subscribeToLocalImageOpen?.(
      () => void localImagePreview?.open(),
    );
  }

  const previewActive = () => localImagePreview?.isActive() ?? false;
  const onPageFocus = () => {
    if (!previewActive()) tabs.focusSelected();
  };
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
    removeSnippetsToggleListener?.();
    removeLocalImageOpenListener?.();
    localImagePreview?.dispose();
    localImagePreview = undefined;
    snippetsSidebar?.dispose();
    snippetsSidebar = undefined;
    tabs.dispose();
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  page.addEventListener("focus", onPageFocus);
  page.document.addEventListener("dragover", onDragOver, true);
  page.document.addEventListener("drop", onDrop, true);

  removeConfigurationUpdateListener = options.subscribeToConfigurationUpdates?.(
    (configuration) => {
      page.document.documentElement.style.setProperty(
        "--native-title-inset",
        `${configuration.nativeTitleInset}px`,
      );
      applyPageTheme(configuration.terminalTheme);
      const nextSurfaceConfiguration = surfaceConfiguration(configuration);
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
    removeTabTitleListener = options.subscribeToTabTitles?.(
      (sessionId, title) => tabs.setSessionTitle(sessionId, title),
    );
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

function sameSurfaceConfiguration(
  first: TerminalSurfaceConfiguration,
  second: TerminalSurfaceConfiguration,
): boolean {
  const firstSystemFont = first.appearance.systemFont;
  const secondSystemFont = second.appearance.systemFont;
  return (
    first.appearance.fontSize === second.appearance.fontSize &&
    first.appearance.lineHeight === second.appearance.lineHeight &&
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
