import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import {
  mountTerminalSurface,
  type TerminalSurface,
} from "../terminal-surface/terminal-surface";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
) => Promise<TerminalSurface>;

export interface TerminalWindowPageHost {
  readonly ready: Promise<void>;
  dispose(): void;
}

export function mountTerminalWindowPage(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  page: Pick<Window, "addEventListener" | "removeEventListener"> = window,
  mount: MountTerminalSurface = mountTerminalSurface,
): TerminalWindowPageHost {
  let disposed = false;
  let surface: TerminalSurface | undefined;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    page.removeEventListener("pagehide", onPageHide);
    surface?.dispose();
    surface = undefined;
  };
  const onPageHide = () => dispose();

  page.addEventListener("pagehide", onPageHide, { once: true });
  const ready = mount(container, adapter).then((mountedSurface) => {
    if (disposed) {
      mountedSurface.dispose();
      return;
    }
    surface = mountedSurface;
  });

  return { ready, dispose };
}
