import { mountResttyTerminalSurface as mount } from "../../src/terminal-surface/restty-terminal-surface";
import { TAB_REMOVAL_CONTROL_PREFIX } from "./tab-removal-readiness";

// This module replaces only the fixture entry's mount import, never shipping code.
const control = new URLSearchParams(location.search).get("tabRemovalControl");
let first = true;
let heldSurface = false;
let newCommands = 0;
let releaseSurface = () => {};
const globals = globalThis as typeof globalThis & {
  __omxtermTabRemovalControl?: {
    state(): { heldSurface: boolean; newCommands: number };
    release(): void;
    holdRendererBoundary(): Promise<never>;
  };
};
globals.__omxtermTabRemovalControl = {
  state: () => ({ heldSurface, newCommands }),
  release: () => releaseSurface(),
  holdRendererBoundary() {
    console.log(`${TAB_REMOVAL_CONTROL_PREFIX}held-renderer-boundary`);
    return new Promise<never>(() => {});
  },
};
if (control !== "ordinary") {
  // Observe actual IPC arrival without forwarding a dropped command to the host.
  const dispose = window.omxterm.terminal.onTabCommand((command) => {
    if (command.action === "new") newCommands += 1;
  });
  window.addEventListener("pagehide", dispose, { once: true });
}

export async function mountResttyTerminalSurface(
  ...args: Parameters<typeof mount>
) {
  const surface = await mount(...args);
  const initial = first;
  first = false;
  if (initial && (control === "held-surface" || control === "early-command")) {
    heldSurface = true;
    console.log(`${TAB_REMOVAL_CONTROL_PREFIX}actual-surface-held`);
    const signal = args[2]?.abortSignal;
    const cancel = () => releaseSurface();
    await new Promise<void>((resolve) => {
      releaseSurface = resolve;
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) resolve();
    }).finally(() => {
      signal?.removeEventListener("abort", cancel);
      heldSurface = false;
    });
  }
  return surface;
}
