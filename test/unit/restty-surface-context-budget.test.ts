// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { createRendererContextBudget } from "../../src/terminal-surface/renderer-context-budget";

function createAdapter() {
  return {
    adapter: {
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    },
  };
}

describe("Restty Surface GPU context budget", () => {
  beforeEach(() => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
  });

  it("gives a hidden Surface's context back past the budget and draws it again when shown", async () => {
    const rendererContexts = createRendererContextBudget(1);
    const first = createAdapter();
    const second = createAdapter();
    const onFatalError = vi.fn();
    const shownBox = { width: 0 };
    const firstContainer = document.createElement("main");
    firstContainer.getBoundingClientRect = () =>
      ({ width: shownBox.width, height: shownBox.width }) as DOMRect;
    const surface = await mountResttyTerminalSurface(
      firstContainer,
      first.adapter,
      { rendererContexts, onFatalError },
    );
    const a = harness.instances[0]!;
    const releasedCanvas = a.canvas;

    // A second Surface needs a context: the hidden first one gives its back.
    await mountResttyTerminalSurface(
      document.createElement("main"),
      second.adapter,
      { rendererContexts, onFatalError },
    );
    const b = harness.instances[1]!;
    expect(a.pane.runtime.render.release).toHaveBeenCalledOnce();
    expect(b.pane.runtime.render.release).not.toHaveBeenCalled();
    expect(a.canvas).not.toBe(releasedCanvas);
    // The deliberate loss arrives later on the old canvas; nothing fails.
    releasedCanvas.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    expect(onFatalError).not.toHaveBeenCalled();
    expect(first.adapter.close).not.toHaveBeenCalled();
    expect(a.destroy).not.toHaveBeenCalled();

    // Shown again: a new context, drawn in the same task; b, hidden, releases.
    shownBox.width = 100;
    a.pane.runtime.render.refresh.mockClear();
    surface.focus();
    expect(a.pane.runtime.render.restore).toHaveBeenCalledOnce();
    expect(a.pane.runtime.render.refresh).toHaveBeenCalled();
    expect(b.pane.runtime.render.release).toHaveBeenCalledOnce();

    // A real loss on the restored canvas still fails only this Surface.
    a.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(onFatalError).toHaveBeenCalledExactlyOnceWith({
      kind: "backend-loss",
    });
    expect(first.adapter.close).toHaveBeenCalledExactlyOnceWith(
      "rendering-failure",
    );
    expect(second.adapter.close).not.toHaveBeenCalled();
  });

  it("fails the Surface when a released context can't be created again", async () => {
    const rendererContexts = createRendererContextBudget(0);
    const { adapter } = createAdapter();
    const onFatalError = vi.fn();
    const container = document.createElement("main");
    let width = 0;
    container.getBoundingClientRect = () =>
      ({ width, height: width }) as DOMRect;
    const surface = await mountResttyTerminalSurface(container, adapter, {
      rendererContexts,
      onFatalError,
    });
    const restty = harness.instances[0]!;
    expect(restty.pane.runtime.render.release).toHaveBeenCalledOnce();

    restty.pane.runtime.render.restore.mockReturnValueOnce(false);
    width = 100;
    surface.focus();
    expect(onFatalError).toHaveBeenCalledExactlyOnceWith({
      kind: "backend-loss",
    });
    expect(adapter.close).toHaveBeenCalledExactlyOnceWith("rendering-failure");
    expect(restty.destroy).toHaveBeenCalledOnce();
  });
  it("ends only the releasing Surface when giving its context back throws", async () => {
    const rendererContexts = createRendererContextBudget(1);
    const first = createAdapter();
    const second = createAdapter();
    const firstFailure = vi.fn();
    const secondFailure = vi.fn();
    await mountResttyTerminalSurface(
      document.createElement("main"),
      first.adapter,
      { rendererContexts, onFatalError: firstFailure },
    );
    harness.instances[0]!.pane.runtime.render.release.mockImplementationOnce(
      () => {
        throw new Error("half-swapped canvas");
      },
    );

    await mountResttyTerminalSurface(
      document.createElement("main"),
      second.adapter,
      { rendererContexts, onFatalError: secondFailure },
    );
    expect(firstFailure).toHaveBeenCalledExactlyOnceWith({
      kind: "backend-loss",
    });
    expect(first.adapter.close).toHaveBeenCalledWith("rendering-failure");
    expect(secondFailure).not.toHaveBeenCalled();
    expect(second.adapter.start).toHaveBeenCalledOnce();
  });
});
