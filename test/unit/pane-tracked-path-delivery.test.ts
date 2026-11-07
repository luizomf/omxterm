// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { cancellationBridge } from "../fixtures/initialization-cancellation-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

afterEach(() => vi.restoreAllMocks());

it.each(["accepted", "rejected", "unknown"] as const)(
  "preserves the %s tracked receipt through the mounted pane adapter",
  async (receipt) => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
    harness.setInitGate(undefined);
    const { bridge } = cancellationBridge();
    bridge.inputTracked = vi.fn(async () => receipt);
    const tabStrip = document.createElement("nav");
    const tabsContainer = document.createElement("div");
    document.body.replaceChildren(tabStrip, tabsContainer);
    let surface: TerminalSurface | undefined;
    const host = mountTerminalWindowPage(
      { tabStrip, tabsContainer },
      {
        createAdapter: () => createElectronTerminalAdapter(bridge),
        mount: async (container, adapter, options) => {
          surface = await mountResttyTerminalSurface(
            container,
            adapter,
            options,
          );
          return surface;
        },
      },
    );
    try {
      await vi.waitFor(() => expect(surface).toBeDefined());
      await expect(surface!.injectTracked!("'/synthetic/a b' ")).resolves.toBe(
        receipt === "accepted",
      );
      expect(bridge.inputTracked).toHaveBeenCalledWith(
        "s1",
        "'/synthetic/a b' ",
      );
      expect(bridge.input).not.toHaveBeenCalled();
    } finally {
      host.dispose();
    }
  },
);
