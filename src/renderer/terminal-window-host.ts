import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import {
  mountTerminalSurface,
  type TerminalClipboard,
  type TerminalSurface,
  type TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { TerminalFontZoom } from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

interface TerminalWindowPageOptions {
  readonly configuration?: TerminalRendererConfiguration;
  readonly page?: Pick<Window, "addEventListener" | "removeEventListener">;
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

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("pagehide", onPageHide);
    removeZoomListener?.();
    removeClipboardActionListener?.();
    surface?.dispose();
    surface = undefined;
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  const surfaceOptions = {
    ...(options.configuration
      ? {
          appearance: {
            fontSize: options.configuration.fontSize,
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
          optionKeyMode: options.configuration.optionKeyMode,
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
    },
  );

  return { ready, dispose };
}
