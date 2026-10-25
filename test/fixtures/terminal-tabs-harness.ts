import { vi } from "vitest";
import {
  createTerminalTabs,
  type PaneLaunch,
  type TerminalTabsOptions,
} from "../../src/renderer/terminal-tabs";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";

export function createFakeSurface() {
  return {
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    zoom: vi.fn(),
    copy: vi.fn(async () => undefined),
    paste: vi.fn(async () => undefined),
    inject: vi.fn(async () => {}),
    selectAll: vi.fn(),
    toggleSearch: vi.fn(),
    dispose: vi.fn(),
  };
}
interface FakeAdapter extends ElectronTerminalAdapter {
  handlers: TerminalSessionHandlers | undefined;
}
export function createTabsHarness(
  options: {
    failMountAt?: number;
    surfaceOptions?: TerminalSurfaceOptions;
    confirmBroadcast?: (targetCount: number) => Promise<boolean>;
    onBroadcastChange?: (targetCount: number) => void;
    initialLaunch?: PaneLaunch;
    initialWorkspace?: TerminalTabsOptions["initialWorkspace"];
    onWorkspaceChange?: TerminalTabsOptions["onWorkspaceChange"];
    paneBusy?: TerminalTabsOptions["paneBusy"];
    detachTab?: TerminalTabsOptions["detachTab"];
    endedSolution?: TerminalTabsOptions["endedSolution"];
  } = {},
) {
  document.body.innerHTML = "";
  document.body.className = "";
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const strip = document.createElement("nav");
  strip.hidden = true;
  const container = document.createElement("div");
  document.body.append(strip, container);
  const adapters: FakeAdapter[] = [];
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  let nextSession = 1;
  const createAdapter = vi.fn((): ElectronTerminalAdapter => {
    const allocatedSessionId = `s${nextSession}`;
    let sessionId: string | undefined;
    nextSession += 1;
    const adapter: FakeAdapter = {
      handlers: undefined,
      sessionId: () => sessionId,
      start: vi.fn(async (handlers: TerminalSessionHandlers) => {
        sessionId = allocatedSessionId;
        adapter.handlers = handlers;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    adapters.push(adapter);
    return adapter;
  });
  let mountCount = 0;
  const mountedSurfaceOptions: TerminalSurfaceOptions[] = [];
  const mount = vi.fn(
    async (
      _container: HTMLElement,
      adapter: TerminalSessionAdapter,
      surfaceOptions: TerminalSurfaceOptions,
    ) => {
      mountCount += 1;
      if (mountCount === options.failMountAt)
        throw new Error("The Default Shell could not be started");
      mountedSurfaceOptions.push(surfaceOptions);
      await adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
      const surface = createFakeSurface();
      surfaces.push(surface);
      return surface;
    },
  );
  const notifySelection = vi.fn();
  const notifyTitle = vi.fn();
  const notifyBell = vi.fn();
  const tabs = createTerminalTabs(
    { strip, container },
    {
      createAdapter,
      mount,
      surfaceOptions: options.surfaceOptions ?? {},
      notifySelection,
      notifyTitle,
      notifyBell,
      ...(options.confirmBroadcast
        ? { confirmBroadcast: options.confirmBroadcast }
        : {}),
      ...(options.onBroadcastChange
        ? { onBroadcastChange: options.onBroadcastChange }
        : {}),
      ...(options.initialLaunch
        ? { initialLaunch: options.initialLaunch }
        : {}),
      ...(options.initialWorkspace
        ? { initialWorkspace: options.initialWorkspace }
        : {}),
      ...(options.paneBusy ? { paneBusy: options.paneBusy } : {}),
      ...(options.detachTab ? { detachTab: options.detachTab } : {}),
      ...(options.endedSolution
        ? { endedSolution: options.endedSolution }
        : {}),
      ...(options.onWorkspaceChange
        ? { onWorkspaceChange: options.onWorkspaceChange }
        : {}),
    },
  );
  return {
    tabs,
    createAdapter,
    strip,
    container,
    adapters,
    surfaces,
    mount,
    mountedSurfaceOptions,
    notifySelection,
    notifyTitle,
    notifyBell,
  };
}
export function visibleContainers(container: HTMLElement): number[] {
  return [...container.children].map((child, index) =>
    (child as HTMLElement).hidden ? -1 : index,
  );
}
export function selectedStates(strip: HTMLElement): string[] {
  return [...strip.querySelectorAll("button")].map(
    (button) => `${button.textContent}:${button.getAttribute("aria-selected")}`,
  );
}
export function dragTabTo(
  strip: HTMLElement,
  sourceIndex: number,
  clientX: number,
) {
  const buttons = [...strip.querySelectorAll("button")];
  buttons.forEach((button, index) =>
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      left: index * 100,
      right: (index + 1) * 100,
      width: 100,
    } as DOMRect),
  );
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: vi.fn(),
  };
  const dragStart = new Event("dragstart", { bubbles: true });
  Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
  buttons[sourceIndex]!.dispatchEvent(dragStart);
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperties(drop, {
    clientX: { value: clientX },
    dataTransfer: { value: dataTransfer },
  });
  strip.dispatchEvent(drop);
}
