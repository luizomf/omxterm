import assert from "node:assert/strict";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { createTabRemovalReadiness } from "./tab-removal-readiness";

interface Renderer {
  executeJavaScript(script: string, userGesture: boolean): Promise<unknown>;
  send(channel: string, command: TerminalTabCommand): void;
}
interface Context {
  readonly control: string | undefined;
  readonly selected: () => string;
  readonly sessionCount: () => number;
  readonly readiness: ReturnType<typeof createTabRemovalReadiness>;
  readonly mark: (
    name: "early-command-observed" | "readiness-pending" | "surface-released",
  ) => void;
}
interface SurfaceControlState {
  heldSurface: boolean;
  newCommands: number;
  hostReady: boolean;
}
const controlState = (renderer: Renderer) =>
  renderer.executeJavaScript(
    "globalThis.__omxtermTabRemovalControl.state()",
    true,
  ) as Promise<SurfaceControlState>;

// The same first-action orchestration used by the native main and headless tests.
export async function initialTabRemovalReadiness(
  renderer: Renderer,
  context: Context,
) {
  const { control, readiness } = context;
  const { waitFor, step } = readiness;
  if (control === "early-command") {
    await waitFor(
      "control-held-surface",
      async () =>
        (await controlState(renderer)).heldSurface &&
        context.selected() === "s1",
    );
    assert.equal(context.selected(), "s1");
    assert.equal(context.sessionCount(), 1);
    const before = await controlState(renderer);
    assert.equal(before.hostReady, false);
    assert.equal(before.newCommands, 0);
    renderer.send(terminalIpc.tabCommand, { action: "new" });
    await waitFor("control-held-surface", async () => {
      const state = await controlState(renderer);
      return state.heldSurface && !state.hostReady && state.newCommands === 1;
    });
    assert.equal(context.selected(), "s1");
    assert.equal(context.sessionCount(), 1);
    context.mark("early-command-observed");
    await releaseSurface(renderer, context);
    return;
  }
  let completed = false;
  const gate = readiness
    .initial(
      () => context.selected() === "s1",
      () =>
        renderer.executeJavaScript(
          control === "held-renderer"
            ? "globalThis.__omxtermTabRemovalControl.waitForHost().then(() => globalThis.__omxtermTabRemovalControl.holdRendererBoundary())"
            : "globalThis.__omxtermTabRemovalControl.waitForHost()",
          true,
        ),
    )
    .then(() => {
      completed = true;
    });
  void gate.catch(() => {});
  if (control === "held-surface") {
    await waitFor(
      "control-held-surface",
      async () =>
        (await controlState(renderer)).heldSurface &&
        context.selected() === "s1",
    );
    await step("control-held-surface", async () => {
      const state = await controlState(renderer);
      assert.equal(context.selected(), "s1");
      assert.equal(state.hostReady, false);
      assert.equal(completed, false);
      assert.equal(context.sessionCount(), 1);
      assert.equal(state.newCommands, 0);
      context.mark("readiness-pending");
    });
    await releaseSurface(renderer, context);
  }
  await gate;
}
async function releaseSurface(renderer: Renderer, context: Context) {
  await context.readiness.step("control-release-surface", () =>
    renderer.executeJavaScript(
      "globalThis.__omxtermTabRemovalControl.release()",
      true,
    ),
  );
  context.mark("surface-released");
}
