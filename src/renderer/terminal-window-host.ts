import {
  subscribeToWindowAttention,
  type WindowAttentionBridge,
} from "./window-attention";
import type {
  InitialLayout,
  TerminalLayoutBridge,
} from "../shared/terminal-layout";
import { forwardFieldContextMenu } from "./field-context-menu";
import { createCompanionContent } from "./companion-content";
import type { HostedContentBridge } from "../shared/extension-view";
import { mountWindowChrome, type WindowChromeBridge } from "./window-chrome";
import { createCommandPalette } from "./command-palette";
import type { CommandPaletteBridge } from "../shared/command-palette";
import { mountWindowOverlays } from "./window-dialogs";
import type { SettingsBridge } from "../shared/settings";
import type { SettingsTabSelection } from "../shared/terminal-panes";
import { surfaceLabels, windowLanguage } from "./renderer-language";
import { DEFAULT_LANGUAGE } from "../shared/i18n";
import { bindTerminalWindowLanguage } from "./terminal-window-language";
import type { AboutBridge } from "../shared/about";
import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import {
  mountTerminalSurface,
  type TerminalSurface,
  type TerminalSurfaceConfiguration,
  type TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { TerminalSessionId } from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalTheme } from "../shared/terminal-theme";
import type { TerminalFontData } from "../shared/terminal-font-data";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import {
  createTerminalTabs,
  type TerminalTabs,
  type TerminalTabsOptions,
} from "./terminal-tabs";
import type { TerminalHostClipboard } from "./terminal-pane-context-menu";
import type { WindowSnippetsSource } from "./snippets-host";
import { subscribeToWindowTools } from "./window-tool-subscriptions";
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
import { applyWindowInsets, applyWindowTheme } from "./terminal-window-theme";
import type { TerminalWindowActionSubscriptions } from "./terminal-window-actions";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export interface TerminalWindowPageElements {
  readonly tabStrip: HTMLElement;
  readonly tabsContainer: HTMLElement;
  readonly auxiliaryPanel?: HTMLElement;
}

interface TerminalWindowPageOptions extends TerminalWindowActionSubscriptions {
  readonly initialLayout?: InitialLayout;
  readonly layout?: TerminalLayoutBridge;
  readonly semanticInput?: import("../shared/semantic-input").SemanticInputBridge;
  readonly filesTerminalDrag?: import("../shared/files-terminal-drag").FilesTerminalDragBridge;
  readonly hostedContent?: HostedContentBridge;
  readonly mirrorTyping?: import("../shared/mirror-typing").MirrorTypingBridge;
  readonly about?: AboutBridge;
  readonly palette?: CommandPaletteBridge;
  readonly settings?: SettingsBridge;
  readonly extensions?: import("../shared/extensions").ExtensionsBridge;
  readonly createAdapter: (
    fontConfigurationId?: string,
    workingDirectoryOf?: TerminalSessionId,
    launchToken?: string,
    restoreToken?: string,
  ) => ElectronTerminalAdapter;
  readonly sshPane?: (token: string, accepted: boolean | null) => void;
  readonly configuration?: TerminalRendererConfiguration;
  readonly chrome?: WindowChromeBridge;
  readonly page?: Pick<
    Window,
    "addEventListener" | "removeEventListener" | "document"
  >;
  readonly mount?: MountTerminalSurface;
  readonly onSurfaceFailure?: (message: string) => void;
  readonly loadFontData?: (family?: string) => Promise<TerminalFontData>;
  readonly subscribeToConfigurationUpdates?: (
    listener: (configuration: TerminalRendererConfiguration) => void,
  ) => () => void;
  readonly userFileErrorBanner?: HTMLElement;
  readonly surfaceFailureBanner?: HTMLElement;
  readonly clipboard?: TerminalHostClipboard;
  readonly droppedFilePathInsertion?: (files: readonly File[]) => string;
  readonly subscribeToTabTitles?: (
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ) => () => void;
  readonly notifyTabSelection?: (
    sessionId: TerminalSessionId | null | SettingsTabSelection,
    tabSessionIds?: readonly TerminalSessionId[],
  ) => void;
  readonly syncTabTitle?: (sessionId: TerminalSessionId) => void;
  readonly notifyTabsEmpty?: (reason?: "rendering-failure") => void;
  readonly onTitleRequest?: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly onBell?: (sessionId: TerminalSessionId) => void;
  readonly attention?: WindowAttentionBridge;
  readonly onExternalLink?: (url: string) => void;
  readonly loadLocalImage?: (
    source?: LocalImageActivation,
  ) => Promise<LocalImageData | null>;
  readonly subscribeToLocalImageOpen?: (listener: () => void) => () => void;
  readonly snippets?: WindowSnippetsSource;
}

export interface TerminalWindowPageHost {
  readonly ready: Promise<void>;
  dispose(): void;
}

// eslint-disable-next-line complexity, max-lines-per-function -- Keep the window's overlay and subscription lifetimes together.
export function mountTerminalWindowPage(
  elements: TerminalWindowPageElements,
  options: TerminalWindowPageOptions,
): TerminalWindowPageHost {
  const page = options.page ?? window;
  const mount = options.mount ?? mountTerminalSurface;
  let disposed = false;
  let removeConfigurationUpdateListener: (() => void) | undefined;
  let removeTabTitleListener: (() => void) | undefined;
  let removeAttentionListeners: (() => void) | undefined;
  let removeToolSubscriptions: (() => void) | undefined;
  let auxiliaryPanel: AuxiliaryPanel | undefined;
  let removeLocalImageOpenListener: (() => void) | undefined;
  let localImagePreview: LocalImagePreview | undefined;
  // Buffered bridge opens replay inside construction, before `dialogs` is
  // assigned. Activity must already own exclusion, chrome and hover then.
  let dialogsActive = false;
  let palette: ReturnType<typeof createCommandPalette> | undefined;
  let clearFilesDrop = () => {};
  const modalActive = () => dialogsActive || (palette?.isActive() ?? false);
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

  const applyPageTheme = bindPageTheme(
    page.document,
    elements.tabsContainer,
    options.configuration,
  );

  const language = windowLanguage(options.configuration);
  const pageLabels = bindTerminalWindowLanguage(
    page.document,
    elements.tabStrip,
    language,
    options,
  );
  const surfaceOptions: TerminalTabsOptions["surfaceOptions"] = {
    ...activeSurfaceConfiguration,
    background: "host",
    focus: false,
    ...(fontGenerations ? { acquireFontInputs: fontGenerations.acquire } : {}),
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.onExternalLink
      ? { onExternalLink: options.onExternalLink }
      : {}),
    ...localImageSurfaceOptions(
      options.loadLocalImage,
      previewActive,
      hoverAvailabilityListeners,
      (source) =>
        tabs.openOverlay(() => {
          if (!disposed && !modalActive()) void localImagePreview?.open(source);
        }),
    ),
    ...pageLabels.surfaceOptions,
  };

  const { clipboard: _hostClipboard, ...fieldOptions } = options;
  const fieldClipboard = options.clipboard
    ? {
        ...options.clipboard,
        requestContextMenu: forwardFieldContextMenu(options.clipboard, (c) =>
          tabs.fieldClipboard(c),
        ),
      }
    : undefined;
  const companion = createCompanionContent(
    elements.tabsContainer,
    elements.auxiliaryPanel,
    options.hostedContent,
    {
      language,
      ...(fieldClipboard ? { clipboard: fieldClipboard } : {}),
      focusTerminal: () => tabs.focusSelected(),
      blocked: previewActive,
    },
  );
  auxiliaryPanel = companion.panel;
  companion.applyConfiguration(options.configuration);
  const tabs: TerminalTabs = createTerminalTabs(
    { strip: elements.tabStrip, container: elements.tabsContainer },
    {
      language,
      mirrorTyping: options.mirrorTyping,
      initialLayout: options.initialLayout,
      layout: options.layout,
      notifySelectionRevision: (revision) => {
        auxiliaryPanel?.cancelDefaultOpen();
        clearFilesDrop();
        options.semanticInput?.selection(revision);
      },
      ...(options.settings ? { settings: options.settings } : {}),
      ...(options.extensions ? { extensions: options.extensions } : {}),
      hostedContent: options.hostedContent,
      hostedPresentation: companion.presentation,
      selectContent: companion.select,
      isSshSourceForeground: companion.isSourceForeground,
      isDialogShown: companion.dialogShown,
      closeDialog: companion.closeDialog,
      createAdapter: (...intent) =>
        options.createAdapter(fontConfigurationId, ...intent),
      sshPane: options.sshPane,
      canFocus: () => !disposed && !previewActive(),
      canAutoFocus: (unchangedFocus) =>
        !previewActive() &&
        !companion.dialogShown() &&
        !companion.presentation.ownsFocus() &&
        (unchangedFocus || !companion.ownsPanelFocus()),
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
      ...(options.attention ? { notifyDesktop: options.attention.notify } : {}),
      syncTitle: (sessionId) => options.syncTabTitle?.(sessionId),
      toggleTitleBar: () => chrome?.toggleTitleBar() ?? false,
    },
  );

  // Native window blur revokes pending panel intent through main's command.
  // DOM blur alone also occurs when an owned child is created before publication.
  const onPageFocus = () => {
    if (
      !previewActive() &&
      !companion.dialogShown() &&
      !companion.ownsPanelFocus()
    )
      tabs.focusSelected();
  };
  const chrome = options.chrome
    ? mountWindowChrome(page.document, options.chrome, onPageFocus, language)
    : undefined;

  const onOverlayActivity = () => {
    const active = previewActive();
    clearFilesDrop();
    elements.tabStrip.inert = active;
    elements.tabsContainer.inert = active;
    chrome?.setPreviewActive(active);
    auxiliaryPanel?.setBlocked(active);
    tabs.setBlocked(active);
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
      tabs.openOverlay(() => {
        if (!disposed && !modalActive()) void localImagePreview?.open();
      });
    });
  }

  const { dialogs, palette: mountedPalette } = mountWindowOverlays(
    page.document,
    {
      ...fieldOptions,
      ...(fieldClipboard ? { clipboard: fieldClipboard } : {}),
    },
    tabs,
    language,
    () => !disposed && !previewActive(),
    {
      dialogs(active) {
        dialogsActive = active;
        onOverlayActivity();
      },
      overlay: onOverlayActivity,
    },
  );
  palette = mountedPalette;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("pagehide", dispose);
    page.removeEventListener("focus", onPageFocus);
    removeToolSubscriptions?.();
    removeConfigurationUpdateListener?.();
    pageLabels.dispose();
    removeTabTitleListener?.();
    removeAttentionListeners?.();
    removeLocalImageOpenListener?.();
    palette?.dispose();
    dialogs.dispose();
    chrome?.dispose();
    localImagePreview?.dispose();
    localImagePreview = undefined;
    companion.dispose();
    auxiliaryPanel = undefined;
    tabs.dispose();
    fontGenerations?.dispose();
  };
  page.addEventListener("pagehide", dispose, { once: true });
  page.addEventListener("focus", onPageFocus);

  removeConfigurationUpdateListener = options.subscribeToConfigurationUpdates?.(
    (configuration) => {
      if (disposed) return;
      language.set(configuration.language);
      companion.applyConfiguration(configuration);
      fontConfigurationId = configuration.fontConfigurationId;
      applyWindowInsets(page.document, configuration, !chrome);
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
  if (options.attention)
    removeAttentionListeners = subscribeToWindowAttention(
      options.attention,
      tabs,
    );

  // Command reception must not wait for the first Surface's mount settlement.
  // Pending tabs already own cancellation; unavailable Surface actions are no-ops.
  try {
    const tools = subscribeToWindowTools(
      page.document,
      {
        ...fieldOptions,
        ...(fieldClipboard ? { clipboard: fieldClipboard } : {}),
      },
      {
        tabs,
        panel: auxiliaryPanel,
        language,
        blocked: previewActive,
        semanticBlocked: companion.presentation.isInputBlocked,
        modalClipboard: (action) => palette?.clipboardAction(action) ?? false,
        focusTerminal: companion.focusTerminal,
        sourceForeground: companion.isSourceForeground,
        sourceSelected: companion.isSourceSelected,
        togglePanelSide: companion.toggleSide,
      },
    );
    clearFilesDrop = tools.clearFileDrop;
    removeToolSubscriptions = tools.unsubscribe;
  } catch (error) {
    dispose();
    throw error;
  }

  return { ready: tabs.ready, dispose };
}

function bindPageTheme(
  document: Document,
  container: HTMLElement,
  configuration: TerminalRendererConfiguration | undefined,
) {
  const apply = (theme: TerminalTheme, transparency: number) =>
    applyWindowTheme(document, container, theme, transparency);
  if (configuration) {
    applyWindowInsets(document, configuration);
    apply(configuration.terminalTheme, configuration.transparency);
  }
  return apply;
}

function localImageSurfaceOptions(
  load: TerminalWindowPageOptions["loadLocalImage"],
  blocked: () => boolean,
  listeners: Set<() => void>,
  activate: (source: LocalImageActivation) => void,
): Pick<
  TerminalSurfaceOptions,
  "linkHoverAvailability" | "onLocalImageActivation"
> {
  return load
    ? {
        linkHoverAvailability: {
          isEnabled: () => !blocked(),
          subscribe(listener) {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        },
        onLocalImageActivation: activate,
      }
    : {};
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
    first.contextMenuEnabled === second.contextMenuEnabled &&
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
    contextMenuEnabled: configuration.terminalContextMenuEnabled ?? true,
    scrollbackLines: configuration.scrollbackLines,
    padding: configuration.terminalPadding,
    optionKeyMode: configuration.optionKeyMode,
    theme: configuration.terminalTheme,
  };
}
