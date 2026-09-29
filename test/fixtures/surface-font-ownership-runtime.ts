import {
  PatchedRestty as RealRestty,
  type PatchedResttyConfig,
} from "../../src/terminal-surface/restty-runtime-contract";
export * from "../../src/terminal-surface/restty-runtime-contract";

const evidence = { held: false, lineHeights: [] as number[] };
let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});
Object.assign(globalThis, {
  fontOwnershipRuntime: evidence,
  releaseFontInitialization: release,
});

// Hold the real initial runtime after fonts/core/WebGL are ready, before the
// production Surface continuation can start its native PTY.
export class PatchedRestty extends RealRestty {
  constructor(options: PatchedResttyConfig) {
    super(options);
    evidence.lineHeights.push(options.terminal.lineHeight);
    if (evidence.lineHeights.length !== 1) return;
    const pane = super.getActivePane()!;
    const initialize = pane.runtime.lifecycle.init.bind(pane.runtime.lifecycle);
    pane.runtime.lifecycle.init = async () => {
      await initialize();
      evidence.held = true;
      await gate;
    };
  }
}
