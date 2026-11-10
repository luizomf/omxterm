import type { IPty } from "node-pty";
import { expect, it, vi } from "vitest";
import {
  createLocalTerminalSession,
  type LocalTerminalSession,
} from "../../src/main/local-terminal-session";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import { snippetTarget } from "../../src/renderer/snippet-target";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { MAX_TERMINAL_PAYLOAD_BYTES } from "../../src/shared/terminal-contract";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

async function fixture() {
  const ipc = createIpcHarness();
  const events = vi.fn();
  const router = registerTerminalIpcRouter(ipc.ipcMain, { write: events });
  const frame = {};
  const contents = {
    mainFrame: frame,
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  };
  const owner = { sender: contents, senderFrame: frame };
  let exit!: (event: { exitCode: number; signal?: number }) => void;
  const pty = {
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn((listener: typeof exit) => {
      exit = listener;
      return { dispose: vi.fn() };
    }),
  };
  let session!: LocalTerminalSession;
  const interaction = vi.fn();
  router.registerController({
    ...clipboardOptions(),
    onUserInteraction: interaction,
    webContents: contents,
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    createSession: (callbacks) =>
      (session = createLocalTerminalSession(() => pty as unknown as IPty, {
        shell: "/bin/sh",
        platform: "darwin",
        homeDirectory: "/tmp",
        applicationVersionProvider: { getVersion: () => "test" },
        environment: {},
        ...callbacks,
      })),
  });
  const bridge = {
    start: async () => ipc.handlers.get(terminalIpc.start)!(owner),
    input: (sessionId: string, data: string) =>
      ipc.listeners.get(terminalIpc.input)!(owner, { sessionId, data }),
    inputTracked: async (sessionId: string, data: string) =>
      ipc.handlers.get(terminalIpc.trackedInput)!(owner, { sessionId, data }),
    onOutput: () => () => {},
    onExit: () => () => {},
    close: () => {},
  } as unknown as TerminalBridge;
  const adapter = createElectronTerminalAdapter(bridge);
  await adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    write: (chunk) => adapter.write(chunk),
    writeTracked: (chunk) => adapter.writeTracked!(chunk),
  });
  return {
    ipc,
    router,
    owner,
    frame,
    contents,
    pty,
    exit: () => exit({ exitCode: 0 }),
    session,
    adapter,
    delivery,
    interaction,
    events,
  };
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

it("does not report path delivery when main observes PTY exit before the renderer", async () => {
  const f = await fixture();
  // Main has processed exit; its message has deliberately not reached renderer.
  f.exit();
  expect(f.contents.send).toHaveBeenCalledWith(
    terminalIpc.exit,
    expect.objectContaining({ sessionId: "s1" }),
  );
  const surface = {
    injectTracked: (text: string) => f.delivery.deliverTracked(text),
  } as unknown as TerminalSurface;
  const target = snippetTarget({
    removed: false,
    ended: false,
    snippetTargetListeners: new Set(),
    surface,
  })!;
  expect(await target.deliverAndReport!("'/tmp/file'")).toBe(false);
  expect(f.pty.write).not.toHaveBeenCalled();
  f.router.dispose();
});

it("stops remaining path chunks when main exits after the first accepted chunk", async () => {
  const f = await fixture();
  let resume!: () => void;
  const pause = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    write: (chunk) => f.adapter.write(chunk),
    writeTracked: (chunk) => f.adapter.writeTracked!(chunk),
    chunkBytes: 4,
    pauseBetweenChunks: () => pause,
  });
  const result = delivery.deliverTracked("abcdefghijkl");
  await flush();
  expect(f.pty.write).toHaveBeenCalledExactlyOnceWith("abcd");
  f.exit();
  resume();
  await expect(result).resolves.toBe(false);
  expect(f.pty.write).toHaveBeenCalledOnce();
  f.router.dispose();
});

it("acknowledges live-session writes only after node-pty returns, without changing ordinary input", async () => {
  const f = await fixture();
  expect(await f.delivery.deliverTracked("'/tmp/file'")).toBe(true);
  expect(f.pty.write).toHaveBeenCalledExactlyOnceWith("'/tmp/file'");
  expect(f.interaction).toHaveBeenCalledOnce();
  f.adapter.write("ordinary key");
  expect(f.pty.write).toHaveBeenLastCalledWith("ordinary key");
  expect(f.interaction).toHaveBeenCalledTimes(2);
  f.router.dispose();
});

it("authenticates tracked senders and rejects invalid, foreign or closed sessions without writing", async () => {
  const f = await fixture();
  const tracked = f.ipc.handlers.get(terminalIpc.trackedInput)!;
  const payload = { sessionId: "s1", data: "private" };
  expect(() => tracked({ ...f.owner, senderFrame: {} }, payload)).toThrow();
  expect(() =>
    tracked({ sender: { ...f.contents }, senderFrame: f.frame }, payload),
  ).toThrow();
  f.contents.isDestroyed.mockReturnValueOnce(true);
  expect(() => tracked(f.owner, payload)).toThrow();
  for (const invalid of [
    null,
    { sessionId: "s0", data: "x" },
    { sessionId: "s1234567890", data: "x" },
    { sessionId: "s1", data: "" },
    { sessionId: "s1", data: "x".repeat(MAX_TERMINAL_PAYLOAD_BYTES + 1) },
    { sessionId: "s1", data: "🙂".repeat(MAX_TERMINAL_PAYLOAD_BYTES / 4 + 1) },
    { sessionId: "s1", data: "x", extra: true },
    { sessionId: "s2", data: "x" },
  ])
    expect(tracked(f.owner, invalid)).toBe("rejected");
  // The local wrapper independently checks liveness, even if controller state lags.
  f.session.close();
  expect(tracked(f.owner, payload)).toBe("rejected");
  expect(f.pty.write).not.toHaveBeenCalled();
  expect(JSON.stringify(f.events.mock.calls)).not.toContain("private");
  f.router.dispose();
  expect(f.ipc.handlers.has(terminalIpc.trackedInput)).toBe(false);
});

it("treats a native write exception or reentrant exit as uncertain", async () => {
  const f = await fixture();
  f.pty.write.mockImplementationOnce(() => {
    throw new Error("native");
  });
  expect(await f.adapter.writeTracked!("first")).toBe("unknown");
  f.pty.write.mockImplementationOnce(() => f.exit());
  expect(await f.adapter.writeTracked!("second")).toBe("unknown");
  expect(await f.adapter.writeTracked!("third")).toBe("rejected");
  expect(f.pty.write.mock.calls.flat()).toEqual(["first", "second"]);
  f.router.dispose();
});

it.each(["rejected", "unknown"] as const)(
  "stops a partially accepted path on a %s receipt before the next queued request",
  async (last) => {
    let finish!: (receipt: "accepted") => void;
    const pending = new Promise<"accepted">((resolve) => {
      finish = resolve;
    });
    const writeTracked = vi
      .fn<(chunk: string) => Promise<"accepted" | "rejected" | "unknown">>()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(last);
    const write = vi.fn<(chunk: string) => void>();
    const delivery = createSemanticInputDelivery({
      isLive: () => true,
      isBracketedPasteEnabled: () => false,
      write,
      writeTracked,
      chunkBytes: 4,
    });
    const path = delivery.deliverTracked("abcdefghijkl");
    const later = delivery.deliver("next");
    await flush();
    expect(writeTracked).toHaveBeenCalledExactlyOnceWith("abcd");
    expect(write).not.toHaveBeenCalled();
    finish("accepted");
    await expect(path).resolves.toBe(false);
    await expect(later).resolves.toBe(true);
    expect(writeTracked.mock.calls.flat()).toEqual(["abcd", "efgh"]);
    expect(write.mock.calls.flat()).toEqual(["next"]);
    expect([
      ...writeTracked.mock.calls.flat(),
      ...write.mock.calls.flat(),
    ]).not.toContain("\r");
  },
);

it("times out a missing receipt, refuses queued input, and never resumes that path after a late receipt", async () => {
  vi.useFakeTimers();
  try {
    let finish!: (receipt: "accepted") => void;
    const pending = new Promise<"accepted">((resolve) => {
      finish = resolve;
    });
    const writeTracked = vi.fn(() => pending);
    const write = vi.fn();
    const delivery = createSemanticInputDelivery({
      isLive: () => true,
      isBracketedPasteEnabled: () => false,
      write,
      writeTracked,
      chunkBytes: 4,
    });
    const path = delivery.deliverTracked("abcdefghijkl");
    const later = delivery.deliver("queued");
    await flush();
    expect(writeTracked).toHaveBeenCalledExactlyOnceWith("abcd");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(path).resolves.toBe(false);
    await expect(later).resolves.toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(await delivery.deliverTracked("retry")).toBe(false);
    finish("accepted");
    await flush();
    expect(await delivery.deliver("ok")).toBe(true);
    expect(write).toHaveBeenCalledExactlyOnceWith("ok");
    expect(writeTracked).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it.each(["timeout", "rejected", "unknown"] as const)(
  "closes a bracketed path that stops on %s before any later input",
  async (failure) => {
    vi.useFakeTimers();
    try {
      let finish!: (receipt: "accepted") => void;
      const late = new Promise<"accepted">((resolve) => {
        finish = resolve;
      });
      const writeTracked = vi
        .fn<(chunk: string) => Promise<"accepted" | "rejected" | "unknown">>()
        .mockResolvedValueOnce("accepted")
        .mockReturnValueOnce(
          failure === "timeout" ? late : Promise.resolve(failure),
        );
      const write = vi.fn<(chunk: string) => void>();
      const delivery = createSemanticInputDelivery({
        isLive: () => true,
        isBracketedPasteEnabled: () => true,
        write,
        writeTracked,
        chunkBytes: 8,
      });
      const path = delivery.deliverTracked("abcdefghijkl");
      await vi.advanceTimersByTimeAsync(5000);
      await expect(path).resolves.toBe(false);
      expect(writeTracked.mock.calls.flat()).toEqual([
        "\u001b[200~ab",
        "cdefghij",
      ]);
      expect(write.mock.calls.flat()).toEqual(["\u001b[201~"]);
      finish("accepted");
      await flush();
      expect(writeTracked).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  },
);

it("does not repeat the closing marker when the final bracketed chunk fails", async () => {
  const writeTracked = vi
    .fn<(chunk: string) => Promise<"accepted" | "rejected" | "unknown">>()
    .mockResolvedValueOnce("accepted")
    .mockResolvedValueOnce("unknown");
  const write = vi.fn<(chunk: string) => void>();
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => true,
    write,
    writeTracked,
    chunkBytes: 8,
  });
  expect(await delivery.deliverTracked("ab")).toBe(false);
  expect(writeTracked.mock.calls.flat().join("")).toBe(
    "\u001b[200~ab\u001b[201~",
  );
  expect(write).not.toHaveBeenCalled();
});

it.each(["rejected IPC", "invalid receipt"])(
  "fails closed after %s without sending later queued input",
  async (mode) => {
    const write = vi.fn();
    const writeTracked =
      mode === "rejected IPC"
        ? vi.fn(async () => {
            throw new Error("lost");
          })
        : vi.fn(async () => "invalid" as "accepted");
    const delivery = createSemanticInputDelivery({
      isLive: () => true,
      isBracketedPasteEnabled: () => false,
      write,
      writeTracked,
    });
    const path = delivery.deliverTracked("path");
    const later = delivery.deliver("later", { submit: true });
    await expect(path).resolves.toBe(false);
    await expect(later).resolves.toBe(false);
    expect(await delivery.deliverTracked("retry")).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(writeTracked).toHaveBeenCalledOnce();
  },
);

it("fails closed without a receipt-capable adapter and never falls back to ordinary injection", async () => {
  const write = vi.fn();
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    write,
  });
  expect(await delivery.deliverTracked("path")).toBe(false);
  expect(write).not.toHaveBeenCalled();
  const inject = vi.fn(async () => true);
  const target = snippetTarget({
    removed: false,
    ended: false,
    snippetTargetListeners: new Set(),
    surface: { inject } as unknown as TerminalSurface,
  });
  expect(await target!.deliverAndReport!("path")).toBe(false);
  expect(inject).not.toHaveBeenCalled();
  expect(await delivery.deliver("ordinary", { submit: true })).toBe(true);
  expect(write.mock.calls.flat()).toEqual(["ordinary", "\r"]);
});

it("keeps a pending tracked path on its captured Surface after selection changes", async () => {
  let finish!: (receipt: "accepted") => void;
  const pending = new Promise<"accepted">((resolve) => {
    finish = resolve;
  });
  const tracked = vi.fn(() => pending);
  const ordinary = vi.fn();
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    write: ordinary,
    writeTracked: tracked,
  });
  const surface = {
    injectTracked: vi.fn((text: string) => delivery.deliverTracked(text)),
  } as unknown as TerminalSurface;
  const other = { injectTracked: vi.fn() } as unknown as TerminalSurface;
  let current = true;
  const tab = {
    removed: false,
    ended: false,
    snippetTargetListeners: new Set<() => void>(),
    surface,
  };
  const target = snippetTarget(tab, () => current)!;
  const result = target.deliverAndReport!("captured");
  await flush();
  current = false;
  const replacement = snippetTarget({ ...tab, surface: other });
  finish("accepted");
  await expect(result).resolves.toBe(true);
  expect(target.isCurrent!()).toBe(false);
  expect(replacement).toBeDefined();
  expect(other.injectTracked).not.toHaveBeenCalled();
  expect(ordinary).not.toHaveBeenCalled();
  expect(tracked).toHaveBeenCalledExactlyOnceWith("captured");
});
