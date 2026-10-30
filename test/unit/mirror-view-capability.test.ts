import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { createMirrorInputLease } from "../../src/main/mirror-input-lease";
import { applicationViews } from "../../src/main/application-extension-views";
import type { ApplicationExtensionsOptions } from "../../src/main/application-extensions";
import type { ExtensionViewHostOptions } from "../../src/main/extension-view-host";
import { pin } from "../fixtures/extension-runtime-controlled";

const adapter = vi.hoisted(() => ({
  options: undefined as ExtensionViewHostOptions | undefined,
}));
vi.mock("electron", () => ({ ipcMain: {} }));
vi.mock("../../src/main/extension-view-ipc", () => ({
  startExtensionViewHost: (options: ExtensionViewHostOptions) => {
    adapter.options = options;
    return {
      open: async () => ({ id: "owned-view" }),
      retire: async () => ({ status: "settled" }),
      captureFocusIntent: vi.fn(),
    };
  },
}));
it.each([false, true])(
  "routes only the declared own-view mirror capability (declared=%s)",
  async (declared) => {
    const version = pin();
    version.manifest.view = {
      entry: "index.html",
      title: "Mirror Typing",
      action: "test.backend.open",
      context: "window",
    };
    if (declared) version.manifest.capabilities = ["terminal.mirrorTyping.v1"];
    const request = vi.fn(async () => ({ ok: true }));
    const bind = vi.fn();
    const mirrorTyping = {
      capture: vi.fn(),
      bind,
      request,
      register: vi.fn(),
      stopped: vi.fn(),
      retire: vi.fn<(window: BrowserWindow, context?: string) => void>(),
      selectionChanged: vi.fn(),
      dispose: vi.fn(),
    };
    const options = {
      applicationRoot: "/synthetic",
      mirrorTyping,
      ssh: { open: vi.fn() },
      layout: { capture: vi.fn(), open: vi.fn() },
      keybind: vi.fn(),
      translator: vi.fn(),
      sendAction: vi.fn(),
      changed: vi.fn(),
      isTrustedSender: vi.fn(),
    } satisfies ApplicationExtensionsOptions;
    const lifetime = new AbortController();
    const call = vi.fn();
    const admit = vi.fn();
    const window = {
      getContentSize: () => [800, 600],
    } as unknown as BrowserWindow;
    const retired = vi.fn();
    const views = applicationViews(options, {
      pin: version,
      target: {
        owner: window,
        signal: lifetime.signal,
        terminalDirectory: null,
        mirrorContext: "captured-context",
      },
      signal: lifetime.signal,
      call,
      admit,
      retired,
    });
    await views.open();
    const signal = new AbortController().signal;
    const value = { operation: "terminal.mirrorTyping.v1", action: "describe" };
    const context = { id: "owned-view", isCurrentVisible: () => true };
    const invocation = adapter.options!.onRequest!(value, signal, context);
    if (declared) {
      await expect(invocation).resolves.toEqual({ ok: true });
      expect(request).toHaveBeenCalledWith(
        window,
        "captured-context",
        "owned-view",
        value,
        signal,
        admit,
      );
    } else {
      await expect(invocation).rejects.toThrow("unavailable");
      expect(request).not.toHaveBeenCalled();
    }
    expect(call).not.toHaveBeenCalled();
    expect(bind).toHaveBeenCalledTimes(1);
    if (declared) {
      const sessions = new Map([
        ["s1", {}],
        ["s2", {}],
      ]);
      const write = vi.fn();
      const lease = createMirrorInputLease({
        current: (id) => sessions.get(id),
        selected: () => true,
        focused: (id) => id === "s1",
        windowFocused: () => true,
        available: () => true,
        write,
        stopped: vi.fn(),
      });
      const token = lease.grant(["s1", "s2"], "s1", lifetime.signal);
      mirrorTyping.retire.mockImplementation((_window, context) => {
        if (context === "captured-context") lease.revoke();
      });
      adapter.options!.onState!("retiring");
      lease.input({
        lease: token,
        sequence: 1,
        sourceSessionId: "s1",
        data: "must drop",
      });
      expect(write).not.toHaveBeenCalled();
      expect(lifetime.signal.aborted).toBe(false);
      expect(retired).not.toHaveBeenCalled();
      adapter.options!.onState!("failed", {
        status: "failed",
        reason: "cleanup",
      });
      expect(retired).not.toHaveBeenCalled();
      adapter.options!.onViewRevoked!("owned-view");
      expect(mirrorTyping.retire).toHaveBeenLastCalledWith(
        window,
        "captured-context",
      );
    }
    lifetime.abort();
    await expect(
      adapter.options!.onRequest!(value, signal, context),
    ).rejects.toThrow("unavailable");
  },
);
