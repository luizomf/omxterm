import { mountResttyTerminalSurface as mount } from "../../src/terminal-surface/restty-terminal-surface";
import { TAB_REMOVAL_CONTROL_PREFIX } from "./tab-removal-readiness";
import { observeHostTabCommands } from "./host-tab-command-readiness";

// This module replaces only the fixture entry's mount import, never shipping code.
const control = new URLSearchParams(location.search).get("tabRemovalControl");
let first = true;
let heldSurface = false;
let newCommands = 0;
let releaseSurface = () => {};
const host = observeHostTabCommands(window.omxterm.terminal.onTabCommand);
export const observeTabRemovalCommands = host.subscribe;
const globals = globalThis as typeof globalThis & {
  __omxtermTabRemovalControl?: {
    state(): { heldSurface: boolean; newCommands: number; hostReady: boolean };
    waitForHost(): Promise<void>;
    release(): void;
    holdRendererBoundary(): Promise<never>;
  };
};
globals.__omxtermTabRemovalControl = {
  state: () => ({ heldSurface, newCommands, hostReady: host.ready }),
  waitForHost: host.wait,
  release: () => releaseSurface(),
  holdRendererBoundary() {
    console.log(`${TAB_REMOVAL_CONTROL_PREFIX}held-renderer-boundary`);
    return new Promise<never>(() => {});
  },
};
// This listener proves arrival only, never host readiness or consumption.
const removeObserver =
  control !== "ordinary"
    ? window.omxterm.terminal.onTabCommand((command) => {
        if (command.action === "new") newCommands += 1;
      })
    : undefined;
window.addEventListener(
  "pagehide",
  () => {
    host.dispose();
    removeObserver?.();
  },
  { once: true },
);

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
