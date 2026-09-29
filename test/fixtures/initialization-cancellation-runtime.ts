import {
  PatchedRestty as RealRestty,
  type PatchedResttyConfig,
} from "../../src/terminal-surface/restty-runtime-contract";
export * from "../../src/terminal-surface/restty-runtime-contract";

export const cancellationEvidence = {
  held: false,
  settled: false,
  destroyed: 0,
  subscriptions: 0,
  leases: 0,
  fatals: 0,
};
let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});
Object.assign(globalThis, {
  cancellationEvidence,
  releaseCancelledInitialization: release,
});
export const fontBoundary =
  new URLSearchParams(location.search).get("boundary") === "fonts";
export async function holdInitialization() {
  cancellationEvidence.held = true;
  await gate;
}
let instances = 0;

// Hold the real B runtime's readiness continuation, after actual font/core/WebGL
// initialization and before the production Surface can request a native PTY.
export class PatchedRestty extends RealRestty {
  private readonly second: boolean;
  constructor(options: PatchedResttyConfig) {
    super(options);
    this.second = ++instances === 2;
    const destroy = this.destroy.bind(this);
    this.destroy = () => {
      if (this.second) cancellationEvidence.destroyed += 1;
      destroy();
    };
    if (!this.second) return;
    const pane = super.getActivePane()!;
    const init = pane.runtime.lifecycle.init.bind(pane.runtime.lifecycle);
    pane.runtime.lifecycle.init = async () => {
      await init();
      if (!fontBoundary) await holdInitialization();
    };
    const subscribe = pane.runtime.events.subscribe.bind(pane.runtime.events);
    pane.runtime.events.subscribe = (listener) => {
      cancellationEvidence.subscriptions += 1;
      const remove = subscribe(listener);
      return () => {
        cancellationEvidence.subscriptions -= 1;
        remove();
      };
    };
  }
}
