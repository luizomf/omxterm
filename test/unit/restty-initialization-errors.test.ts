// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";

function createAdapter() {
  return {
    start: vi.fn(async () => {}),
    close: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
  };
}

describe("Surface initialization failure classification", () => {
  beforeEach(() => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
    harness.setInitGate(undefined);
  });
  it("reports genuine font acquisition failure without starting a PTY", async () => {
    const adapter = createAdapter();
    const onFatalError = vi.fn();
    await expect(
      mountResttyTerminalSurface(document.createElement("main"), adapter, {
        acquireFontInputs: async () => {
          throw new Error("font lookup failed");
        },
        onFatalError,
      }),
    ).rejects.toThrow("Failed to mount");
    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(
      "Failed to initialize the OMXTerm Terminal Surface: font lookup failed",
    );
    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.close).toHaveBeenCalledExactlyOnceWith("rendering-failure");
  });
  it("does not hide cleanup failure during expected cancellation", async () => {
    const adapter = createAdapter();
    const abort = new AbortController();
    const onFatalError = vi.fn();
    const release = vi.fn(() => {
      throw new Error("lease cleanup failed");
    });
    await expect(
      mountResttyTerminalSurface(document.createElement("main"), adapter, {
        abortSignal: abort.signal,
        acquireFontInputs: async () => {
          abort.abort();
          return { fonts: [], release };
        },
        onFatalError,
      }),
    ).rejects.toThrow("lease cleanup failed");
    expect(onFatalError).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(adapter.close).toHaveBeenCalledOnce();
  });
  it("cancels a font lookup without reporting a rendering failure", async () => {
    const abort = new AbortController();
    const adapter = createAdapter();
    const onFatalError = vi.fn();
    const release = vi.fn();
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
      {
        abortSignal: abort.signal,
        acquireFontInputs: async () => {
          abort.abort();
          return { fonts: [], release };
        },
        onFatalError,
      },
    );
    surface.dispose();
    expect(harness.instances).toHaveLength(0);
    expect(adapter.start).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(onFatalError).not.toHaveBeenCalled();
  });
});
