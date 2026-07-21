import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import {
  mountTerminalSurface,
  type TerminalClipboard,
  type TerminalSurface,
  type TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type {
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import { createTerminalTabs, type TerminalTabs } from "./terminal-tabs";
import {
  createSnippetsSidebar,
  type SnippetsSidebar,
} from "./snippets-sidebar";

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
  readonly subscribeToFontZoom?: (
    listener: (command: TerminalFontZoom) => void,
  ) => () => void;
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
  let removeClipboardActionListener: (() => void) | undefined;
  let removeTabCommandListener: (() => void) | undefined;
  let removeTabTitleListener: (() => void) | undefined;
  let snippetsSidebar: SnippetsSidebar | undefined;
  let removeSnippetsToggleListener: (() => void) | undefined;

  if (options.configuration) {
    const background = options.configuration.terminalTheme.colors.background;
    page.document.documentElement.style.setProperty(
      "--native-title-inset",
      `${options.configuration.nativeTitleInset}px`,
    );
    page.document.documentElement.style.setProperty(
      "--terminal-background",
      background,
    );
    page.document.body.style.setProperty("--terminal-background", background);
    elements.tabsContainer.style.setProperty(
      "--terminal-background",
      background,
    );
  }

  const surfaceOptions: TerminalSurfaceOptions = {
    ...(options.configuration
      ? {
          appearance: {
            fontSize: options.configuration.fontSize,
            lineHeight: options.configuration.fontLineHeight,
            ...(options.configuration.fontFamily
              ? {
                  systemFont: {
                    family: options.configuration.fontFamily,
                    available: true,
                  },
                }
              : {}),
          },
          scrollbackLines: options.configuration.scrollbackLines,
          padding: options.configuration.terminalPadding,
          optionKeyMode: options.configuration.optionKeyMode,
          theme: options.configuration.terminalTheme,
        }
      : {}),
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.onExternalLink
      ? { onExternalLink: options.onExternalLink }
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

  const onPageFocus = () => tabs.focusSelected();
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onDrop = (event: DragEvent) => {
    // Capture before xterm or another target can interpret a native file URI.
    event.preventDefault();
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
    removeClipboardActionListener?.();
    removeTabCommandListener?.();
    removeTabTitleListener?.();
    removeSnippetsToggleListener?.();
    snippetsSidebar?.dispose();
    snippetsSidebar = undefined;
    tabs.dispose();
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  page.addEventListener("focus", onPageFocus);
  page.document.addEventListener("dragover", onDragOver, true);
  page.document.addEventListener("drop", onDrop, true);

  const ready = tabs.ready.then(() => {
    if (disposed) return;
    removeZoomListener = options.subscribeToFontZoom?.((command) =>
      tabs.zoom(command),
    );
    removeClipboardActionListener = options.subscribeToClipboardActions?.(
      (action) => tabs.clipboardAction(action),
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
        inject: (snippet) =>
          tabs.injectSnippet(snippet.body, { submit: snippet.execute }),
        focusTerminal: () => tabs.focusSelected(),
      });
      snippetsSidebar = sidebar;
      removeSnippetsToggleListener = options.snippets.subscribeToToggle(
        () => void sidebar.toggle(),
      );
    }
  });

  return { ready, dispose };
}
