import { describe, expect, it, vi } from "vitest";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import type {
  TerminalExit,
  TerminalSessionId,
} from "../../src/shared/terminal-contract";

function createBridgeHarness() {
  let resolveStart: (sessionId: TerminalSessionId) => void = () => {};
  let emitOutput: (
    sessionId: TerminalSessionId,
    data: string,
    end: number,
  ) => void = () => {};
  let emitExit: (
    sessionId: TerminalSessionId,
    exit: TerminalExit,
  ) => void = () => {};
  const removeOutputListener = vi.fn();
  const removeExitListener = vi.fn();
  const bridge = {
    start: vi.fn(
      () =>
        new Promise<TerminalSessionId>((resolve) => {
          resolveStart = resolve;
        }),
    ),
    input: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    acknowledgeOutput: vi.fn(),
    onOutput: vi.fn(
      (
        listener: (
          sessionId: TerminalSessionId,
          data: string,
          end: number,
        ) => void,
      ) => {
        emitOutput = listener;
        return removeOutputListener;
      },
    ),
    onExit: vi.fn(
      (
        listener: (sessionId: TerminalSessionId, exit: TerminalExit) => void,
      ) => {
        emitExit = listener;
        return removeExitListener;
      },
    ),
  };
  return {
    bridge: bridge as unknown as TerminalBridge,
    calls: bridge,
    startSession: (sessionId: TerminalSessionId) => resolveStart(sessionId),
    output: (sessionId: TerminalSessionId, data: string, end = data.length) =>
      emitOutput(sessionId, data, end),
    exit: (sessionId: TerminalSessionId, exit: TerminalExit) =>
      emitExit(sessionId, exit),
    removeOutputListener,
    removeExitListener,
  };
}

describe("renderer Electron terminal adapter", () => {
  it("releases a late Surface registration after cancellation without starting a PTY", async () => {
    const harness = createBridgeHarness();
    let resolve!: (id: string) => void;
    const retained = new Promise<string>((finish) => {
      resolve = finish;
    });
    const bridge = {
      ...harness.bridge,
      retainSurface: vi.fn(() => retained),
      releaseSurface: vi.fn(),
    };
    const adapter = createElectronTerminalAdapter(bridge, "configuration");
    const started = adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
    const rejected = expect(started).rejects.toThrow("closed before start");
    adapter.close();
    resolve("surface");
    await rejected;
    adapter.close();
    expect(bridge.retainSurface).toHaveBeenCalledExactlyOnceWith(
      "configuration",
    );
    expect(bridge.releaseSurface).toHaveBeenCalledExactlyOnceWith("surface");
    expect(harness.calls.start).not.toHaveBeenCalled();
    expect(harness.calls.close).not.toHaveBeenCalled();
  });

  it("retains its issued snapshot and closes one accepted late native session", async () => {
    const harness = createBridgeHarness();
    const bridge = {
      ...harness.bridge,
      retainSurface: vi.fn(async () => "surface"),
      releaseSurface: vi.fn(),
    };
    const adapter = createElectronTerminalAdapter(bridge, "configuration");
    const started = adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
    await vi.waitFor(() =>
      expect(harness.calls.start).toHaveBeenCalledExactlyOnceWith("surface"),
    );
    adapter.close();
    harness.startSession("s1");
    await started;
    adapter.close();
    expect(bridge.releaseSurface).toHaveBeenCalledExactlyOnceWith("surface");
    expect(harness.calls.close).toHaveBeenCalledExactlyOnceWith(
      "s1",
      undefined,
    );
  });

  it("observes rejected registration without acquiring a PTY or releasing an unknown owner", async () => {
    const harness = createBridgeHarness();
    const bridge = {
      ...harness.bridge,
      retainSurface: vi.fn(async () => {
        throw new Error("rejected owner");
      }),
      releaseSurface: vi.fn(),
    };
    const adapter = createElectronTerminalAdapter(bridge, "configuration");
    await expect(
      adapter.start({ onOutput: vi.fn(), onExit: vi.fn() }),
    ).rejects.toThrow("rejected owner");
    adapter.close();
    expect(harness.calls.start).not.toHaveBeenCalled();
    expect(bridge.releaseSurface).not.toHaveBeenCalled();
  });

  it("routes startup parser replies and a failure close once after establishing ownership", async () => {
    const harness = createBridgeHarness();
    const adapter = createElectronTerminalAdapter(harness.bridge);
    const started = adapter.start({
      onOutput: () => {
        adapter.write("\u001b[?1;2c");
        adapter.close("rendering-failure");
      },
      onExit: vi.fn(),
    });
    harness.output("s1", "\u001b[c");
    harness.startSession("s1");
    await started;
    expect(harness.calls.input).toHaveBeenCalledExactlyOnceWith(
      "s1",
      "\u001b[?1;2c",
    );
    expect(harness.calls.close).toHaveBeenCalledExactlyOnceWith(
      "s1",
      "rendering-failure",
    );
  });

  it("binds to the started session id and forwards only its own output and exit", async () => {
    const harness = createBridgeHarness();
    const adapter = createElectronTerminalAdapter(harness.bridge);
    const onOutput = vi.fn();
    const onExit = vi.fn();

    expect(adapter.sessionId()).toBeUndefined();
    const started = adapter.start({ onOutput, onExit });
    harness.startSession("s2");
    await started;
    expect(adapter.sessionId()).toBe("s2");
    harness.output("s2", "own output");
    harness.output("s1", "foreign output");
    harness.exit("s3", { exitCode: 0, signal: 0 });
    adapter.write("typed input");
    adapter.resize({ cols: 120, rows: 40 });
    harness.exit("s2", { exitCode: 0, signal: 15 });
    // After its own exit the adapter no longer addresses the retired id.
    adapter.write("late input");
    adapter.resize({ cols: 90, rows: 30 });
    adapter.close();

    expect(onOutput).toHaveBeenCalledOnce();
    expect(onOutput).toHaveBeenCalledWith("own output");
    expect(harness.calls.acknowledgeOutput).toHaveBeenCalledExactlyOnceWith(
      "s2",
      10,
    );
    expect(onExit).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: 15 });
    expect(harness.calls.input).toHaveBeenCalledWith("s2", "typed input");
    expect(harness.calls.resize).toHaveBeenCalledWith("s2", {
      cols: 120,
      rows: 40,
    });
    expect(harness.calls.input).toHaveBeenCalledOnce();
    expect(harness.calls.resize).toHaveBeenCalledOnce();
    expect(harness.calls.close).not.toHaveBeenCalled();
  });

  it("buffers early output until the session id is known without accepting early input", async () => {
    const harness = createBridgeHarness();
    const adapter = createElectronTerminalAdapter(harness.bridge);
    const onOutput = vi.fn();

    const started = adapter.start({ onOutput, onExit: vi.fn() });
    adapter.write("too early");
    adapter.resize({ cols: 80, rows: 24 });
    harness.output("s1", "early output", 12);
    harness.output("s9", "foreign early output", 20);
    harness.startSession("s1");
    await started;
    adapter.write("after start");

    expect(onOutput).toHaveBeenCalledExactlyOnceWith("early output");
    expect(harness.calls.acknowledgeOutput).toHaveBeenCalledExactlyOnceWith(
      "s1",
      12,
    );
    expect(harness.calls.input).toHaveBeenCalledOnce();
    expect(harness.calls.input).toHaveBeenCalledWith("s1", "after start");
    expect(harness.calls.resize).not.toHaveBeenCalled();
  });

  it("preserves a crossing native read buffered before the session id is known", async () => {
    const harness = createBridgeHarness();
    const adapter = createElectronTerminalAdapter(harness.bridge);
    const onOutput = vi.fn();
    const chunk = "x".repeat(64 * 1024);

    const started = adapter.start({ onOutput, onExit: vi.fn() });
    harness.output("s1", chunk, chunk.length);
    harness.output("s1", chunk, chunk.length * 2);
    harness.output("s1", chunk, chunk.length * 3);
    harness.startSession("s1");
    await started;

    expect(onOutput).toHaveBeenCalledTimes(3);
    expect(harness.calls.acknowledgeOutput.mock.calls).toEqual([
      ["s1", chunk.length],
      ["s1", chunk.length * 2],
      ["s1", chunk.length * 3],
    ]);
  });

  it("closes its session exactly once even when close races the start round-trip", async () => {
    const harness = createBridgeHarness();
    const adapter = createElectronTerminalAdapter(harness.bridge);

    const started = adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
    adapter.close();
    expect(harness.calls.close).not.toHaveBeenCalled();
    harness.startSession("s1");
    await started;
    adapter.close();

    expect(harness.calls.close).toHaveBeenCalledOnce();
    expect(harness.calls.close).toHaveBeenCalledWith("s1", undefined);
    expect(harness.removeOutputListener).toHaveBeenCalledOnce();
    expect(harness.removeExitListener).toHaveBeenCalledOnce();
  });

  it("cannot start twice and stops writing after close", async () => {
    const harness = createBridgeHarness();
    const adapter = createElectronTerminalAdapter(harness.bridge);

    const started = adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
    harness.startSession("s1");
    await started;
    await expect(
      adapter.start({ onOutput: vi.fn(), onExit: vi.fn() }),
    ).rejects.toThrow("Terminal Adapter cannot be started twice");
    adapter.close();
    adapter.write("after close");
    adapter.resize({ cols: 100, rows: 30 });

    expect(harness.calls.close).toHaveBeenCalledOnce();
    expect(harness.calls.close).toHaveBeenCalledWith("s1", undefined);
    expect(harness.calls.input).not.toHaveBeenCalled();
    expect(harness.calls.resize).not.toHaveBeenCalled();
  });
});
