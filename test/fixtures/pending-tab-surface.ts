import { mountResttyTerminalSurface as mountRealSurface } from "../../src/terminal-surface/restty-terminal-surface";

let mounts = 0;
let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});
Object.assign(globalThis, {
  releasePendingTab: release,
  pendingTabHeld: false,
});

// The production renderer and tab owner use the real Restty mount. Only B's
// font acquisition is held, before rendering readiness and Adapter.start.
export const mountResttyTerminalSurface: typeof mountRealSurface = (
  container,
  adapter,
  options = {},
) => {
  mounts += 1;
  const second = mounts === 2;
  const acquire = options.acquireFontInputs;
  if (!acquire) throw new Error("Fixture requires production font acquisition");
  return mountRealSurface(container, adapter, {
    ...options,
    async acquireFontInputs(family, signal) {
      if (second) {
        Object.assign(globalThis, { pendingTabHeld: true });
        await gate;
      }
      return acquire(family, signal);
    },
  });
};
