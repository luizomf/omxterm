// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createPaneContextMenu } from "../../src/renderer/terminal-pane-context-menu";
import { appendTab } from "../../src/renderer/terminal-panes";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import {
  MAX_TERMINAL_EXPORT_BYTES,
  type TerminalClipboardAction,
  type TerminalContextMenuRequest,
  type TerminalExportContext,
  type TerminalTabCommand,
} from "../../src/shared/terminal-contract";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import { createFakeSurface } from "../fixtures/terminal-tabs-harness";

afterEach(() => vi.restoreAllMocks());

// Host tests use the production pane popup owner. The real main claim and IPC
// save path are exercised separately in terminal-context-menu-routing.test.ts.
async function setup() {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  document.body.replaceChildren(tabStrip, tabsContainer);
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  const surfaceOptions: TerminalSurfaceOptions[] = [];
  const handlers: TerminalSessionHandlers[] = [];
  let command!: (command: TerminalTabCommand) => void;
  let onExport!: Parameters<TerminalBridge["onExportRequest"]>[0];
  let onClipboard!: Parameters<TerminalBridge["onClipboardAction"]>[0];
  let opened!: () => void;
  let togglePanel!: () => void;
  const save = vi.fn<TerminalBridge["saveTerminalExport"]>(async () => {});
  const clipboard = {
    readText: vi.fn(async () => ""),
    writeText: vi.fn(async () => {}),
    confirmPaste: vi.fn(async () => true),
    requestContextMenu: vi.fn<(request?: TerminalContextMenuRequest) => void>(),
  };
  const aside = document.createElement("aside");
  aside.hidden = true;
  document.body.append(aside);
  vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  let nextSession = 0;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer, auxiliaryPanel: aside },
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
      async mount(container, adapter, options) {
        surfaceOptions.push(options);
        vi.spyOn(
          container.closest(".terminal-tab")!,
          "getBoundingClientRect",
        ).mockReturnValue({ width: 1200, height: 800 } as DOMRect);
        await adapter.start({ onOutput() {}, onExit() {} });
        adapter.resize({ cols: 120, rows: 40 });
        const surface = createFakeSurface();
        surface.exportText.mockReturnValue(`source ${surfaces.length}`);
        surfaces.push(surface);
        return surface;
      },
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen(listener) {
          opened = listener;
          return () => {};
        },
      },
      snippets: {
        load: async () => ({ snippets: [] }),
        subscribeToToggle(listener) {
          togglePanel = listener;
          return () => {};
        },
      },
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      subscribeToClipboardActions(listener) {
        onClipboard = listener;
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
    command: (value: TerminalTabCommand) => command(value),
    deliver: (context: TerminalExportContext) => onExport(context),
    copy: (context: TerminalExportContext) =>
      onClipboard("copy", context.target),
    clipboardAction: (
      action: TerminalClipboardAction,
      context: TerminalExportContext,
    ) => onClipboard(action, context.target),
    block: () => opened(),
    unblock: () =>
      document.querySelector<HTMLButtonElement>(".about-close")!.click(),
    openPanel: () => togglePanel(),
    open(index = 0, hasSelection = false): TerminalExportContext {
      surfaceOptions[index]!.onContextMenu?.();
      surfaceOptions[index]!.clipboard!.requestContextMenu({
        target: "terminal",
        hasSelection,
      });
      const request = clipboard.requestContextMenu.mock.calls.at(-1)![0]!;
      return {
        kind: hasSelection ? "selection" : "content",
        target: { sessionId: request.sessionId, menuId: request.menuId },
      };
    },
  };
}

describe("renderer contextual export lifetime", () => {
  it.each([
    "exit",
    "signal",
    "fatal",
    "close",
    "tab away/back",
    "pane away/back",
    "replacement",
    "field",
    "panel field",
    "dispose",
  ] as const)("does not read or save after %s", async (change) => {
    const view = await setup();
    try {
      view.command({ action: "new" });
      await vi.waitFor(() => expect(view.surfaces).toHaveLength(2));
      view.command({ action: "previous" });
      if (change === "pane away/back") {
        view.command({ action: "split", direction: "right" });
        await vi.waitFor(() => expect(view.surfaces).toHaveLength(3));
      }
      const context = view.open();
      if (change === "exit" || change === "signal")
        view.handlers[0]!.onExit({
          exitCode: 0,
          signal: change === "exit" ? 0 : 9,
        });
      if (change === "fatal")
        view.surfaceOptions[0]!.onFatalError!({ kind: "backend-loss" });
      if (change === "close") view.command({ action: "close" });
      if (change === "tab away/back") {
        view.command({ action: "next" });
        view.command({ action: "previous" });
      }
      if (change === "pane away/back") {
        view.command({ action: "focus-pane", target: "next" });
        view.command({ action: "focus-pane", target: "previous" });
      }
      if (change === "replacement") view.open();
      if (change === "field")
        view.surfaceOptions[0]!.clipboard!.requestContextMenu({
          target: "field",
        });
      if (change === "panel field") {
        view.openPanel();
        document
          .querySelector("aside input")!
          .dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
          );
      }
      if (change === "dispose") view.host.dispose();
      view.deliver(context);
      expect(view.save).not.toHaveBeenCalled();
      for (const surface of view.surfaces)
        expect(surface.exportText).not.toHaveBeenCalled();
      if (change === "field" || change === "panel field")
        expect(view.clipboard.requestContextMenu).toHaveBeenLastCalledWith();
    } finally {
      view.host.dispose();
    }
  });

  it("ignores stale identity without consuming the newer popup", async () => {
    const view = await setup();
    try {
      const stale = view.open();
      const current = view.open(0, true);
      view.deliver(stale);
      view.deliver({
        ...current,
        target: { ...current.target, sessionId: "s99" },
      });
      expect(view.save).not.toHaveBeenCalled();
      view.deliver(current);
      view.deliver(current);
      expect(view.save).toHaveBeenCalledExactlyOnceWith({
        kind: "selection",
        text: "source 0",
      });
      expect(view.surfaces[0]!.exportText).toHaveBeenCalledExactlyOnceWith(
        "selection",
      );
    } finally {
      view.host.dispose();
    }
  });

  it.each([false, true])(
    "consumes a matching wrong-kind callback (selection offered: %s)",
    async (selection) => {
      const view = await setup();
      try {
        const context = view.open(0, selection);
        view.deliver({ ...context, kind: selection ? "content" : "selection" });
        view.deliver(context);
        expect(view.save).not.toHaveBeenCalled();
        expect(view.surfaces[0]!.exportText).not.toHaveBeenCalled();
        view.deliver(view.open(0, selection));
        expect(view.save).toHaveBeenCalledOnce();
      } finally {
        view.host.dispose();
      }
    },
  );

  it("consumes blocked delivery rather than replaying it when About closes", async () => {
    const view = await setup();
    try {
      const context = view.open();
      view.block();
      view.deliver(context);
      view.unblock();
      view.deliver(context);
      expect(view.save).not.toHaveBeenCalled();
      expect(view.surfaces[0]!.exportText).not.toHaveBeenCalled();
      view.deliver(view.open());
      expect(view.save).toHaveBeenCalledOnce();
    } finally {
      view.host.dispose();
    }
  });

  it.each(["close-pane", "prepare-close-pane"] as const)(
    "delivers authorized %s when About opens before target receipt",
    async (action) => {
      const view = await setup();
      try {
        view.command({ action: "split", direction: "right" });
        await vi.waitFor(() => expect(view.surfaces).toHaveLength(2));
        const context = view.open(1);
        view.block();
        expect(
          document.querySelector<HTMLDialogElement>(".about-dialog")?.open,
        ).toBe(true);
        view.command({ action, target: context.target });
        if (action === "prepare-close-pane")
          view.command({ action: "resolve-close-pane", confirmed: true });
        // The targeted lifecycle interaction is consumed once, despite About.
        view.command({ action, target: context.target });
        if (action === "prepare-close-pane")
          view.command({ action: "resolve-close-pane", confirmed: true });
        expect(view.surfaces[1]!.dispose).toHaveBeenCalledOnce();
        expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
        expect(view.save).not.toHaveBeenCalled();
      } finally {
        view.host.dispose();
      }
    },
  );

  it.each([
    ["copy", "copy"],
    ["paste", "paste"],
    ["select-all", "selectAll"],
  ] as const)(
    "consumes blocked popup %s without replay or export adoption",
    async (action, effect) => {
      const view = await setup();
      try {
        const context = view.open();
        view.block();
        view.clipboardAction(action, context);
        expect(view.surfaces[0]![effect]).not.toHaveBeenCalled();
        view.unblock();
        view.clipboardAction(action, context);
        view.deliver(context);
        expect(view.surfaces[0]![effect]).not.toHaveBeenCalled();
        expect(view.surfaces[0]!.exportText).not.toHaveBeenCalled();
        expect(view.save).not.toHaveBeenCalled();
        view.clipboardAction(action, view.open());
        expect(view.surfaces[0]![effect]).toHaveBeenCalledOnce();
      } finally {
        view.host.dispose();
      }
    },
  );

  it.each(["copy", "paste", "select-all", "export"] as const)(
    "a blocked stale %s target cannot consume a newer popup",
    async (action) => {
      const view = await setup();
      try {
        const stale = view.open();
        const current = view.open(0, true);
        view.block();
        if (action === "export") view.deliver(stale);
        else view.clipboardAction(action, stale);
        view.unblock();
        view.deliver(current);
        expect(view.save).toHaveBeenCalledExactlyOnceWith({
          kind: "selection",
          text: "source 0",
        });
        expect(view.surfaces[0]!.exportText).toHaveBeenCalledExactlyOnceWith(
          "selection",
        );
        expect(view.surfaces[0]!.copy).not.toHaveBeenCalled();
        expect(view.surfaces[0]!.paste).not.toHaveBeenCalled();
        expect(view.surfaces[0]!.selectAll).not.toHaveBeenCalled();
      } finally {
        view.host.dispose();
      }
    },
  );

  it.each(["copy first", "export first", "close first"] as const)(
    "shares one popup consumption with %s",
    async (order) => {
      const view = await setup();
      try {
        const context = view.open();
        if (order === "copy first") view.copy(context);
        if (order === "close first")
          view.command({ action: "close-pane", target: context.target });
        view.deliver(context);
        view.copy(context);
        expect(view.save).toHaveBeenCalledTimes(
          order === "export first" ? 1 : 0,
        );
        expect(view.surfaces[0]!.copy).toHaveBeenCalledTimes(
          order === "copy first" ? 1 : 0,
        );
        expect(view.surfaces[0]!.exportText).toHaveBeenCalledTimes(
          order === "export first" ? 1 : 0,
        );
      } finally {
        view.host.dispose();
      }
    },
  );

  it("asks main for a failure notice when the core text read throws", async () => {
    const view = await setup();
    try {
      view.surfaces[0]!.exportText.mockImplementationOnce(() => {
        throw new Error("core read failed");
      });
      view.deliver(view.open());
      expect(view.save).toHaveBeenCalledExactlyOnceWith({ notice: "failed" });
    } finally {
      view.host.dispose();
    }
  });

  it("snapshots once synchronously before a pending save and later tab switch", async () => {
    const view = await setup();
    let finish!: () => void;
    view.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    try {
      const context = view.open(0, true);
      view.deliver(context);
      expect(view.surfaces[0]!.exportText).toHaveBeenCalledExactlyOnceWith(
        "selection",
      );
      view.surfaces[0]!.exportText.mockReturnValue("changed later");
      view.command({ action: "new" });
      view.deliver(context);
      expect(view.save).toHaveBeenCalledExactlyOnceWith({
        kind: "selection",
        text: "source 0",
      });
      expect(view.surfaces[0]!.selectAll).not.toHaveBeenCalled();
      expect(view.surfaces[0]!.copy).not.toHaveBeenCalled();
      finish();
    } finally {
      finish?.();
      view.host.dispose();
    }
  });
});

describe("renderer UTF-8 export preflight", () => {
  it.each([
    "ASCII",
    "two-byte",
    "surrogate pair",
    "unpaired high",
    "unpaired low",
  ] as const)(
    "accepts exactly 16 MiB of %s and sends only the notice for one byte more",
    async (encoding) => {
      const view = await setup();
      try {
        const unit =
          encoding === "ASCII"
            ? "a"
            : encoding === "two-byte"
              ? "é"
              : encoding === "surrogate pair"
                ? "😀"
                : encoding === "unpaired high"
                  ? "\ud800"
                  : "\udc00";
        const bytes =
          encoding === "ASCII"
            ? 1
            : encoding === "two-byte"
              ? 2
              : encoding === "surrogate pair"
                ? 4
                : 3;
        const text =
          unit.repeat(Math.floor(MAX_TERMINAL_EXPORT_BYTES / bytes)) +
          "a".repeat(MAX_TERMINAL_EXPORT_BYTES % bytes);
        // Node's independent UTF-8 encoder also specifies replacement of lone surrogates.
        expect(Buffer.byteLength(text, "utf8")).toBe(16 * 1024 * 1024);
        view.surfaces[0]!.exportText.mockReturnValue(text);
        view.deliver(view.open());
        expect(view.save).toHaveBeenCalledOnce();
        const accepted = view.save.mock.lastCall![0];
        expect(accepted).toMatchObject({ kind: "content" });
        // Keep a failed bound control from printing 16 MiB of synthetic text.
        expect("text" in accepted && accepted.text === text).toBe(true);
        view.surfaces[0]!.exportText.mockReturnValue(text + "a");
        view.deliver(view.open());
        expect(view.save).toHaveBeenLastCalledWith({ notice: "too-large" });
        expect(view.save).toHaveBeenCalledTimes(2);
        expect(view.surfaces[0]!.exportText).toHaveBeenCalledTimes(2);
      } finally {
        view.host.dispose();
      }
    },
  );
});

it("rechecks exact Surface identity even when the same pane remains focused", () => {
  const parent = document.createElement("div");
  const pane = appendTab(parent, () => ({
    sessionId: () => "s1",
    start: async () => {},
    write() {},
    resize() {},
    close() {},
  }));
  const original = createFakeSurface();
  const replacement = createFakeSurface();
  pane.surface = original;
  const popup = createPaneContextMenu({
    focusedPane: () => pane,
    disposed: () => false,
    canInteract: () => true,
  });
  const target = popup.capture(pane, false)!;
  expect(target).toEqual({ sessionId: "s1", menuId: 1 });
  pane.surface = replacement;
  expect(
    popup.exportRequest({ kind: "content", target }, true),
  ).toBeUndefined();
  pane.surface = original;
  expect(
    popup.exportRequest({ kind: "content", target }, true),
  ).toBeUndefined();
  expect(original.exportText).not.toHaveBeenCalled();
  expect(replacement.exportText).not.toHaveBeenCalled();
  const next = popup.capture(pane, false)!;
  expect(popup.exportRequest({ kind: "content", target: next }, true)).toEqual({
    kind: "content",
    text: "",
  });
  popup.dispose();
});
