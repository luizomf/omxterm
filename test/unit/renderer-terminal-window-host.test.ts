// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalFontZoom } from "../../src/shared/terminal-contract";

function createAdapter() {
  return {
    start: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
}

describe("renderer Terminal Window page host", () => {
  it("disposes the mounted Surface exactly once on page teardown", async () => {
    const dispose = vi.fn();
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(async () => ({ dispose, zoom: vi.fn() })),
      },
    );
    await host.ready;

    window.dispatchEvent(new Event("pagehide"));
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a Surface that mounts after page teardown", async () => {
    const dispose = vi.fn();
    let finishMount:
      | ((surface: {
          dispose(): void;
          zoom(command: TerminalFontZoom): void;
        }) => void)
      | undefined;
    const pendingMount = new Promise<{
      dispose(): void;
      zoom(command: TerminalFontZoom): void;
    }>((resolve) => {
      finishMount = resolve;
    });
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        page: window,
        mount: vi.fn(() => pendingMount),
      },
    );

    window.dispatchEvent(new Event("pagehide"));
    finishMount!({ dispose, zoom: vi.fn() });
    await host.ready;
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("applies supplied appearance and independent native zoom to its Surface", async () => {
    const zoom = vi.fn();
    const listeners = new Set<(command: TerminalFontZoom) => void>();
    const removeZoomListener = vi.fn((listener) => listeners.delete(listener));
    const mount = vi.fn(async () => ({ dispose: vi.fn(), zoom }));
    const appearance = {
      fontSize: 19,
      systemFont: { family: "SF Mono", available: true },
    } as const;
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      {
        appearance,
        page: window,
        mount,
        subscribeToFontZoom(listener) {
          listeners.add(listener);
          return () => removeZoomListener(listener);
        },
      },
    );
    await host.ready;

    for (const listener of listeners) listener("in");

    expect(mount).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Object),
      { appearance },
    );
    expect(zoom).toHaveBeenCalledWith("in");

    host.dispose();
    expect(removeZoomListener).toHaveBeenCalledOnce();
  });
});
