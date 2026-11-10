// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import {
  cancellationBridge,
  deferred,
} from "../fixtures/initialization-cancellation-harness";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

describe("cancelled later-tab initialization through the production host and Adapter", () => {
  // fonts and runtime-rejection run as first-tab cases in restty-terminal-surface.
  it.each([
    "runtime",
    "fonts-rejection",
    "startup",
    "startup-rejection",
  ] as const)("keeps A usable after closing B at %s", async (boundary) => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
    harness.setInitGate(undefined);
    const gate = deferred();
    const startup = boundary.startsWith("startup");
    const { bridge, outputs, exits } = cancellationBridge(
      startup ? gate.promise : undefined,
    );
    const onSurfaceFailure = vi.fn();
    const released = [vi.fn(), vi.fn()];
    let command!: (value: TerminalTabCommand) => void;
    let mounts = 0;
    let settled = 0;
    const tabStrip = document.createElement("nav");
    const tabsContainer = document.createElement("div");
    document.body.replaceChildren(tabStrip, tabsContainer);
    const page = mountTerminalWindowPage(
      { tabStrip, tabsContainer },
      {
        createAdapter: () => createElectronTerminalAdapter(bridge),
        onSurfaceFailure,
        subscribeToTabCommands(listener) {
          command = listener;
          return () => {};
        },
        async mount(container, adapter, options) {
          const index = mounts++;
          try {
            return await mountResttyTerminalSurface(container, adapter, {
              ...options,
              async acquireFontInputs() {
                if (index === 1 && boundary.startsWith("fonts"))
                  await gate.promise;
                return { fonts: [], release: released[index]! };
              },
            });
          } finally {
            settled += 1;
          }
        },
      },
    );
    try {
      await page.ready;
      const a = harness.instances[0]!;
      if (boundary.startsWith("runtime")) harness.setInitGate(gate.promise);
      command({ action: "new" });
      await vi.waitFor(() => {
        if (startup) expect(bridge.start).toHaveBeenCalledTimes(2);
        else if (boundary.startsWith("runtime"))
          expect(harness.instances[1]!.state).toBe("initializing");
        else expect(mounts).toBe(2);
      });
      const bBeforeClose = harness.instances[1];
      const lateListeners = [...(bBeforeClose?.listeners ?? [])];
      command({ action: "close" });
      expect(tabsContainer.children).toHaveLength(1);
      for (const listener of lateListeners) {
        listener({ type: "title", title: "cancelled owner" });
        listener({ type: "bell" });
      }
      if (bBeforeClose) {
        expect(
          bBeforeClose.options.services.ptyTransport.sendInput(
            "cancelled input",
          ),
        ).toBe(false);
        bBeforeClose.canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        );
      }
      expect(onSurfaceFailure).not.toHaveBeenCalled();
      if (boundary.endsWith("rejection"))
        gate.reject(new Error("late initialization rejection"));
      else gate.resolve();
      await vi.waitFor(() => expect(settled).toBe(2));
      expect(onSurfaceFailure).not.toHaveBeenCalled();
      expect(bridge.start).toHaveBeenCalledTimes(startup ? 2 : 1);
      expect(bridge.close.mock.calls).toEqual(
        startup && boundary !== "startup-rejection" ? [["s2", undefined]] : [],
      );
      expect(released[1]).toHaveBeenCalledTimes(
        boundary === "fonts-rejection" ? 0 : 1,
      );
      expect(released[0]).not.toHaveBeenCalled();
      const b = harness.instances[1];
      if (b) {
        expect(b.destroy).toHaveBeenCalledOnce();
        expect(b.listeners.size).toBe(0);
        b.emit({ type: "bell" });
        b.canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        );
        expect(b.options.services.ptyTransport.sendInput("late")).toBe(false);
      }
      expect(onSurfaceFailure).not.toHaveBeenCalled();
      expect(outputs.size).toBe(1);
      expect(exits.size).toBe(1);
      expect(a.destroy).not.toHaveBeenCalled();
      expect(
        a.options.services.ptyTransport.sendInput("A remains usable"),
      ).toBe(true);
      expect(bridge.input).toHaveBeenCalledExactlyOnceWith(
        "s1",
        "A remains usable",
      );
      for (const output of outputs) output("s1", "healthy output", 14);
      expect(a.sendInput).toHaveBeenCalledWith("healthy output", "pty");
    } finally {
      gate.resolve();
      harness.setInitGate(undefined);
      page.dispose();
    }
    expect(released[0]).toHaveBeenCalledOnce();
    expect(outputs.size).toBe(0);
    expect(exits.size).toBe(0);
  });
});
