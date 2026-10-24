// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import {
  MAX_TERMINAL_EXPORT_BYTES,
  type TerminalTabCommand,
} from "../../src/shared/terminal-contract";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import { createFakeSurface } from "../fixtures/terminal-tabs-harness";

const native = vi.hoisted(() => ({
  template: [] as Array<{ label?: string; click?: () => void }>,
}));
vi.mock("electron", () => ({
  app: {},
  dialog: {},
  Menu: {
    buildFromTemplate(template: typeof native.template) {
      native.template = template;
      return { popup() {} };
    },
  },
}));
import { popupTerminalContextMenu } from "../../src/main/terminal-export";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";

afterEach(() => vi.restoreAllMocks());

async function setup() {
  document.body.replaceChildren();
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  document.body.append(tabStrip, tabsContainer);
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  const surfaceOptions: TerminalSurfaceOptions[] = [];
  const handlers: TerminalSessionHandlers[] = [];
  let command!: (command: TerminalTabCommand) => void;
  let onExport!: Parameters<TerminalBridge["onExportRequest"]>[0];
  const save = vi.fn(async () => {});
  const clipboard = {
    readText: async () => "",
    writeText: async () => {},
    confirmPaste: async () => true,
    requestContextMenu: vi.fn(
      (
        request: Parameters<TerminalBridge["requestClipboardContextMenu"]>[0],
      ) => {
        popupTerminalContextMenu(
          {
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              send(channel: string, payload: never) {
                if (channel === terminalIpc.exportRequest) onExport(payload);
              },
            },
          } as never,
          request,
        );
      },
    ),
  };
  let nextSession = 0;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      page: window,
      clipboard,
      createAdapter() {
        const id = `s${++nextSession}`;
        return {
          sessionId: () => id,
          start: async (listener: TerminalSessionHandlers) => {
            handlers.push(listener);
          },
          write() {},
          resize() {},
          close() {},
        };
      },
      async mount(_container, adapter, options) {
        surfaceOptions.push(options);
        await adapter.start({ onOutput() {}, onExit() {} });
        const surface = createFakeSurface();
        surface.exportText.mockReturnValue(`source ${surfaces.length}`);
        surfaces.push(surface);
        return surface;
      },
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      subscribeToExportRequests(listener) {
        onExport = listener;
        return () => {};
      },
      saveTerminalExport: save,
    },
  );
  await host.ready;
  return {
    host,
    surfaces,
    surfaceOptions,
    handlers,
    save,
    clipboard,
    command: (value: Parameters<typeof command>[0]) => command(value),
    open(index = 0) {
      surfaceOptions[index]!.clipboard!.requestContextMenu({
        target: "terminal",
        hasSelection: false,
      });
      return native.template.find((item) => item.label?.startsWith("Export"))!
        .click!;
    },
  };
}

describe("contextual export ownership through popup and window host", () => {
  it.each([
    "exit",
    "signal",
    "fatal",
    "close",
    "switch",
    "stale",
    "field",
    "dispose",
  ] as const)("does not export a replacement after %s", async (action) => {
    const view = await setup();
    view.command({ action: "new" });
    await vi.waitFor(() => expect(view.surfaces).toHaveLength(2));
    view.command({ action: "select", position: 1 });
    const click = view.open();
    if (action === "exit" || action === "signal")
      view.handlers[0]!.onExit({
        exitCode: 0,
        signal: action === "exit" ? 0 : 9,
      });
    if (action === "fatal")
      view.surfaceOptions[0]!.onFatalError!("Synthetic failure");
    if (action === "close") view.command({ action: "close" });
    if (action === "switch") {
      view.command({ action: "next" });
      view.command({ action: "previous" });
    }
    if (action === "stale") view.open();
    if (action === "field")
      view.surfaceOptions[0]!.clipboard!.requestContextMenu({
        target: "field",
      });
    if (action === "dispose") view.host.dispose();
    click();
    expect(view.save).not.toHaveBeenCalled();
    expect(
      view.surfaces.every(
        (surface) => surface.exportText.mock.calls.length === 0,
      ),
    ).toBe(true);
    view.host.dispose();
  });

  it("snapshots the original text once before a later tab switch", async () => {
    const view = await setup();
    const click = view.open();
    click();
    click();
    view.command({ action: "new" });
    click();
    expect(view.save).toHaveBeenCalledExactlyOnceWith({
      kind: "content",
      text: "source 0",
    });
    view.host.dispose();
  });

  it("ignores a superseded callback without consuming the current context", async () => {
    const view = await setup();
    const stale = view.open();
    const current = view.open();
    stale();
    expect(view.save).not.toHaveBeenCalled();
    current();
    expect(view.save).toHaveBeenCalledExactlyOnceWith({
      kind: "content",
      text: "source 0",
    });
    view.host.dispose();
  });

  it.each([0, 1])(
    "reports UTF-8 text at limit + %s bytes without oversized IPC or truncation",
    async (over) => {
      const view = await setup();
      const text =
        "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2) + (over ? "a" : "");
      view.surfaces[0]!.exportText.mockReturnValue(text);
      view.open()();
      expect(view.save).toHaveBeenCalledExactlyOnceWith(
        over ? { notice: "too-large" } : { kind: "content", text },
      );
      view.host.dispose();
    },
  );
});
