import { mountResttyTerminalSurface as mountRealSurface } from "../../src/terminal-surface/restty-terminal-surface";

let mounts = 0;
let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});
Object.assign(globalThis, {
  releasePendingTab: release,
  pendingTabHeld: false,
  pendingTabMountedAndFocused: false,
});

// The production renderer and tab owner use the real Restty mount. Only B's
// font acquisition is held, before rendering readiness and Adapter.start.
export const mountResttyTerminalSurface: typeof mountRealSurface = async (
  container,
  adapter,
  options = {},
) => {
  mounts += 1;
  const second = mounts === 2;
  const acquire = options.acquireFontInputs;
  if (!acquire) throw new Error("Fixture requires production font acquisition");
  const surface = await mountRealSurface(container, adapter, {
    ...options,
    async acquireFontInputs(family, signal) {
      if (second) {
        Object.assign(globalThis, { pendingTabHeld: true });
        await gate;
      }
      return acquire(family, signal);
    },
  });
  if (second) {
    const focus = surface.focus.bind(surface);
    surface.focus = () => {
      focus();
      // The production pane owner publishes pane.surface before calling focus.
      // Native READY and even mount resolution alone cannot witness that point.
      Object.assign(globalThis, { pendingTabMountedAndFocused: true });
    };
  }
  return surface;
};
