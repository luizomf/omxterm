import { mountWindowChrome, type WindowChromeBridge } from "./window-chrome";
import { mountWindowDialogs } from "./window-dialogs";
import type { SettingsBridge } from "../shared/settings";
import { surfaceLabels, windowLanguage } from "./renderer-language";
import { DEFAULT_LANGUAGE } from "../shared/i18n";
import { bindTerminalWindowLanguage } from "./terminal-window-language";
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
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { TerminalExportOptions } from "./terminal-export-requests";
import { subscribeToGuardedActions } from "./terminal-guarded-actions";
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
import { mountSnippetsPanel } from "./snippets-host";
import type { SnippetPreview } from "./snippet-preview";
import type { AuxiliaryPanel } from "./auxiliary-panel";
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
import { terminalPaneAccent } from "./terminal-pane-accent";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export interface TerminalWindowPageElements {
  readonly tabStrip: HTMLElement;
  readonly tabsContainer: HTMLElement;
}

export interface TerminalWindowPageOptions extends TerminalExportOptions {
  readonly about?: AboutBridge;
  readonly settings?: SettingsBridge;
  readonly createAdapter: (
    fontConfigurationId?: string,
    workingDirectoryOf?: TerminalSessionId,
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
  readonly surfaceFailureBanner?: HTMLElement;
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
  readonly subscribeToTabTitles?: (
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ) => () => void;
  readonly notifyTabSelection?: (
    sessionId: TerminalSessionId | null,
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
  let auxiliaryPanel: AuxiliaryPanel | undefined;
  let removeSnippetsToggleListener: (() => void) | undefined;
  let removeLocalImageOpenListener: (() => void) | undefined;
  let localImagePreview: LocalImagePreview | undefined;
  let dialogs: ReturnType<typeof mountWindowDialogs> | undefined;
  // Buffered bridge opens replay inside construction, before `dialogs` is
  // assigned. Activity must already own exclusion, chrome and hover then.
  let dialogsActive = false;
  let snippetPreview: SnippetPreview | undefined;
  const modalActive = () =>
    dialogsActive || (snippetPreview?.isActive() ?? false);
  const previewActive = () =>
    (localImagePreview?.isActive() ?? false) || modalActive();
  const hoverAvailabilityListeners = new Set<() => void>();
  let fontConfigurationId = options.configuration?.fontConfigurationId;
  let activeFontFamily = options.configuration?.fontFamily;
  const fontGenerations = options.loadFontData
    ? createTerminalFontGenerationOwner(options.loadFontData, activeFontFamily)
    : undefined;
  let activeSurfaceConfiguration = options.configuration
    ? surfaceConfiguration(options.configuration)
    : undefined;

  const applyPageTheme = (theme: TerminalTheme, transparency: number) =>
    applyWindowTheme(
      page.document,
      elements.tabsContainer,
      theme,
      transparency,
    );

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

  const language = windowLanguage(options.configuration);
  const pageLabels = bindTerminalWindowLanguage(
    page.document,
    elements.tabStrip,
    language,
    options,
  );
  const surfaceOptions: TerminalSurfaceOptions = {
    ...activeSurfaceConfiguration,
    background: "host",
    focus: false,
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
            if (!modalActive()) void localImagePreview?.open(source);
          },
        }
      : {}),
    ...pageLabels.surfaceOptions,
  };

  const tabs: TerminalTabs = createTerminalTabs(
    { strip: elements.tabStrip, container: elements.tabsContainer },
    {
      language,
      createAdapter: (workingDirectoryOf) =>
        options.createAdapter(fontConfigurationId, workingDirectoryOf),
      canFocus: () => !disposed && !previewActive(),
      canAutoFocus: (unchangedFocus) =>
        !previewActive() && (unchangedFocus || !auxiliaryPanel?.ownsFocus()),
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

  const onPageFocus = () => {
    if (!previewActive() && !auxiliaryPanel?.ownsFocus()) tabs.focusSelected();
  };
  const chrome = options.chrome
    ? mountWindowChrome(page.document, options.chrome, onPageFocus, language)
    : undefined;

  const onOverlayActivity = () => {
    const active = previewActive();
    elements.tabStrip.inert = active;
    elements.tabsContainer.inert = active;
    chrome?.setPreviewActive(active);
    auxiliaryPanel?.setBlocked(active);
    for (const listener of hoverAvailabilityListeners) listener();
  };
  if (options.loadLocalImage) {
    localImagePreview = createLocalImagePreview(page.document, {
      language,
      loadImage: options.loadLocalImage,
      focusTerminal: () => tabs.focusSelected(),
      onActivityChange: onOverlayActivity,
    });
    removeLocalImageOpenListener = options.subscribeToLocalImageOpen?.(() => {
      if (!modalActive()) void localImagePreview?.open();
    });
  }

  dialogs = mountWindowDialogs(
    page.document,
    options,
    () => !disposed && !previewActive(),
    {
      language,
      focusTerminal: tabs.focusSelected,
      onActivityChange(active) {
        dialogsActive = active;
        onOverlayActivity();
      },
    },
  );
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
    pageLabels.dispose();
    removeTabCommandListener?.();
    removeTabTitleListener?.();
    removeSnippetsToggleListener?.();
    removeLocalImageOpenListener?.();
    dialogs?.dispose();
    dialogs = undefined;
    chrome?.dispose();
    localImagePreview?.dispose();
    localImagePreview = undefined;
    snippetPreview?.dispose();
    snippetPreview = undefined;
    auxiliaryPanel?.dispose();
    auxiliaryPanel = undefined;
    tabs.dispose();
    fontGenerations?.dispose();
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  page.addEventListener("focus", onPageFocus);

  removeConfigurationUpdateListener = options.subscribeToConfigurationUpdates?.(
    (configuration) => {
      if (disposed) return;
      language.set(configuration.language);
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
      (action) => dialogs?.editClipboard(action, options.clipboard),
      (action) => auxiliaryPanel?.clipboardAction(action) ?? false,
    );
    removeTabCommandListener = options.subscribeToTabCommands?.((command) => {
      if (previewActive() && MODAL_COMPETING_TAB_ACTIONS.has(command.action))
        return;
      tabs.handleCommand(command);
    });
    if (options.snippets) {
      const snippets = options.snippets;
      const mounted = mountSnippetsPanel(page.document, snippets, {
        tabs,
        language,
        clipboard: options.clipboard,
        blocked: previewActive,
        onPreviewActivity: onOverlayActivity,
      });
      const panel = mounted.panel;
      auxiliaryPanel = panel;
      snippetPreview = mounted.preview;
      panel.setBlocked(previewActive());
      removeSnippetsToggleListener = snippets.subscribeToToggle(() =>
        panel.toggle("snippets"),
      );
    }
  });

  return { ready, dispose };
}

// Closure preparation/resolution and failure acknowledgement are deliberately
// absent: modal ownership suppresses competing navigation, not lifecycle delivery.
const MODAL_COMPETING_TAB_ACTIONS = new Set<TerminalTabCommand["action"]>([
  "new",
  "next",
  "previous",
  "select",
  "split",
  "focus-pane",
  "equalize-panes",
]);

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

function applyWindowTheme(
  document: Document,
  tabs: HTMLElement,
  theme: TerminalTheme,
  transparency: number,
): void {
  const { background, foreground } = theme.colors;
  const style = document.documentElement.style;
  style.setProperty("--terminal-background-opacity", String(1 - transparency));
  style.setProperty("--terminal-background", background);
  style.setProperty("--terminal-foreground", foreground);
  style.setProperty("--terminal-pane-accent", terminalPaneAccent(theme));
  document.body.style.setProperty("--terminal-background", background);
  tabs.style.setProperty("--terminal-background", background);
}

function sameSurfaceConfiguration(
  first: TerminalSurfaceConfiguration,
  second: TerminalSurfaceConfiguration,
): boolean {
  const firstSystemFont = first.appearance.systemFont;
  const secondSystemFont = second.appearance.systemFont;
  return (
    first.labels === second.labels &&
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
    labels: surfaceLabels(configuration.language ?? DEFAULT_LANGUAGE),
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
