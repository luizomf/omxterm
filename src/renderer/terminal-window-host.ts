import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import {
  mountTerminalSurface,
  type TerminalClipboard,
  type TerminalSurface,
  type TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { TerminalFontZoom } from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import {
  createSnippetsSidebar,
  type SnippetsSidebar,
} from "./snippets-sidebar";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

interface TerminalWindowPageOptions {
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
  readonly onTitleRequest?: (request: string) => void;
  readonly onBell?: () => void;
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
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalWindowPageOptions = {},
): TerminalWindowPageHost {
  const page = options.page ?? window;
  const mount = options.mount ?? mountTerminalSurface;
  let disposed = false;
  let surface: TerminalSurface | undefined;
  let removeZoomListener: (() => void) | undefined;
  let removeClipboardActionListener: (() => void) | undefined;
  let snippetsSidebar: SnippetsSidebar | undefined;
  let removeSnippetsToggleListener: (() => void) | undefined;
  const onPageFocus = () => surface?.focus();

  if (options.configuration) {
    const background = options.configuration.terminalTheme.colors.background;
    page.document.documentElement.style.setProperty(
      "--terminal-background",
      background,
    );
    page.document.body.style.setProperty("--terminal-background", background);
    container.style.setProperty("--terminal-background", background);
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("pagehide", onPageHide);
    page.removeEventListener("focus", onPageFocus);
    removeZoomListener?.();
    removeClipboardActionListener?.();
    removeSnippetsToggleListener?.();
    snippetsSidebar?.dispose();
    snippetsSidebar = undefined;
    surface?.dispose();
    surface = undefined;
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  page.addEventListener("focus", onPageFocus);
  const surfaceOptions = {
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
    ...(options.onTitleRequest
      ? { onTitleRequest: options.onTitleRequest }
      : {}),
    ...(options.onBell ? { onBell: options.onBell } : {}),
    ...(options.onExternalLink
      ? { onExternalLink: options.onExternalLink }
      : {}),
  };
  const ready = mount(container, adapter, surfaceOptions).then(
    (mountedSurface) => {
      if (disposed) {
        mountedSurface.dispose();
        return;
      }
      surface = mountedSurface;
      if (page.document.hasFocus()) surface.focus();
      removeZoomListener = options.subscribeToFontZoom?.((command) =>
        surface?.zoom(command),
      );
      removeClipboardActionListener = options.subscribeToClipboardActions?.(
        (action) => {
          if (action === "copy") void surface?.copy();
          else if (action === "paste") void surface?.paste();
          else surface?.selectAll();
        },
      );
      if (options.snippets) {
        const sidebar = createSnippetsSidebar(options.snippets.element, {
          loadSnippets: options.snippets.load,
          inject: (snippet) =>
            void surface?.inject(snippet.body, { submit: snippet.execute }),
          focusTerminal: () => surface?.focus(),
        });
        snippetsSidebar = sidebar;
        removeSnippetsToggleListener = options.snippets.subscribeToToggle(
          () => void sidebar.toggle(),
        );
      }
    },
  );

  return { ready, dispose };
}
