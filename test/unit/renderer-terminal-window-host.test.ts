// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";

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
      window,
      vi.fn(async () => ({ dispose })),
    );
    await host.ready;

    window.dispatchEvent(new Event("pagehide"));
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a Surface that mounts after page teardown", async () => {
    const dispose = vi.fn();
    let finishMount: ((surface: { dispose(): void }) => void) | undefined;
    const pendingMount = new Promise<{ dispose(): void }>((resolve) => {
      finishMount = resolve;
    });
    const host = mountTerminalWindowPage(
      document.createElement("main"),
      createAdapter(),
      window,
      vi.fn(() => pendingMount),
    );

    window.dispatchEvent(new Event("pagehide"));
    finishMount!({ dispose });
    await host.ready;
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });
});
