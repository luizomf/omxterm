// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { popupHarness } from "../fixtures/terminal-context-menu-harness";

afterEach(() => vi.restoreAllMocks());

const popupActions = [
  ["Copy", "copy"],
  ["Paste", "paste"],
  ["Select All", "selectAll"],
  ["Close Pane", "dispose"],
  ["Export Terminal Content…", "exportText"],
] as const;

describe("export through the shared native popup and trusted save IPC", () => {
  it.each([false, true])(
    "snapshots the fixed kind and clicked target before request mutation (selection: %s)",
    async (selection) => {
      const view = await popupHarness();
      try {
        view.surfaces[0]!.exportText.mockReturnValue("clicked pane é 😀");
        view.surfaces[1]!.exportText.mockReturnValue("other pane");
        const activate = view.open(0, selection);
        const label = selection
          ? "Export Selection…"
          : "Export Terminal Content…";
        const offer = { sessionId: "s1", menuId: 1, hasSelection: selection };
        const labels = view.requestMenu(offer);
        expect(labels).toContain(label);
        offer.sessionId = "s99";
        offer.menuId = 99;
        offer.hasSelection = !selection;
        view.clickCurrent(label);
        activate(label);
        const kind = selection ? "selection" : "content";
        expect(view.sentExports).toEqual([
          { kind, target: { sessionId: "s1", menuId: 1 } },
        ]);
        expect(view.surfaces[0]!.exportText).toHaveBeenCalledExactlyOnceWith(
          kind,
        );
        expect(view.surfaces[1]!.exportText).not.toHaveBeenCalled();
        expect(view.saveIpc).toHaveBeenCalledExactlyOnceWith({
          kind,
          text: "clicked pane é 😀",
        });
        expect(view.save).toHaveBeenCalledExactlyOnceWith(
          { kind, text: "clicked pane é 😀" },
          expect.any(Function),
        );
      } finally {
        view.dispose();
      }
    },
  );

  it.each([
    "exit",
    "fatal",
    "selection",
    "replacement popup",
    "field",
    "disposal",
  ] as const)(
    "rejects export delivery held in transport across %s",
    async (change) => {
      const view = await popupHarness();
      try {
        view.holdExport();
        view.open()("Export Terminal Content…");
        expect(view.sentExports).toEqual([
          { kind: "content", target: { sessionId: "s2", menuId: 1 } },
        ]);
        if (change === "exit")
          view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
        else if (change === "fatal")
          view.mountedSurfaceOptions[1]!.onFatalError!({
            kind: "backend-loss",
          });
        else if (change === "selection") {
          view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
          view.tabs.handleCommand({ action: "focus-pane", target: "next" });
        } else if (change === "replacement popup") view.open();
        else if (change === "field")
          view.mountedSurfaceOptions[1]!.clipboard!.requestContextMenu({
            target: "field",
          });
        else view.tabs.dispose();
        view.deliverExports();
        expect(view.saveIpc).not.toHaveBeenCalled();
        expect(view.save).not.toHaveBeenCalled();
        for (const surface of view.surfaces)
          expect(surface.exportText).not.toHaveBeenCalled();
      } finally {
        view.dispose();
      }
    },
  );

  it("a stale native export callback leaves the replacement popup claim intact", async () => {
    const view = await popupHarness();
    try {
      const old = view.open(0, false);
      const current = view.open(0, true);
      old("Export Terminal Content…");
      expect(view.sentExports).toEqual([]);
      current("Export Selection…");
      expect(view.sentExports).toEqual([
        { kind: "selection", target: { sessionId: "s1", menuId: 2 } },
      ]);
      expect(view.saveIpc).toHaveBeenCalledExactlyOnceWith({
        kind: "selection",
        text: "",
      });
    } finally {
      view.dispose();
    }
  });

  it.each(popupActions)(
    "%s consumes the same main claim as export and all other popup actions",
    async (first) => {
      const view = await popupHarness();
      try {
        const activate = view.open();
        activate(first);
        for (const [label] of popupActions) activate(label);
        expect(view.sentExports).toHaveLength(
          first === "Export Terminal Content…" ? 1 : 0,
        );
        expect(view.saveIpc).toHaveBeenCalledTimes(
          first === "Export Terminal Content…" ? 1 : 0,
        );
        for (const [label, operation] of popupActions)
          expect(view.surfaces[1]![operation]).toHaveBeenCalledTimes(
            first === label ? 1 : 0,
          );
      } finally {
        view.dispose();
      }
    },
  );
});

describe("main-authorized popup delivery across modal activation", () => {
  it.each([false, true])(
    "delivers held Close Pane after interaction blocks (Busy: %s)",
    async (busy) => {
      const view = await popupHarness(busy);
      try {
        view.holdCommands();
        view.open(1)("Close Pane");
        await vi.waitFor(() =>
          expect(view.pendingCommands()).toHaveLength(busy ? 2 : 1),
        );
        const commands = view.pendingCommands();
        expect(commands[0]).toEqual({
          action: busy ? "prepare-close-pane" : "close-pane",
          target: { sessionId: "s2", menuId: 1 },
        });
        if (busy)
          expect(commands[1]).toEqual({
            action: "resolve-close-pane",
            confirmed: true,
          });
        expect(view.confirm).toHaveBeenCalledTimes(busy ? 1 : 0);
        view.setInteractionBlocked(true);
        view.deliverCommands();
        for (const command of commands) view.tabs.handleCommand(command);
        expect(view.surfaces[1]!.dispose).toHaveBeenCalledOnce();
        expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
        expect(view.nativeClose).toHaveBeenCalledOnce();
        expect(view.save).not.toHaveBeenCalled();
      } finally {
        view.dispose();
      }
    },
  );
});

describe("retained terminal context menu callbacks", () => {
  it("retains main-frame validation and refuses unknown/dead session targets", async () => {
    const view = await popupHarness();
    const offer = {
      sessionId: "s2",
      menuId: 1,
      hasSelection: false,
      closePane: true,
    };
    expect(view.requestMenu(offer, {})).toEqual([]);
    expect(view.requestMenu({ ...offer, sessionId: "s99" })).toEqual([]);
    view.sessions[1]!.onExit({ exitCode: 0, signal: 9 });
    expect(view.requestMenu(offer)).toEqual([]);
    expect(view.confirm).not.toHaveBeenCalled();
    view.dispose();
  });

  it("preserves the no-argument field menu without Close Pane", async () => {
    const view = await popupHarness();
    expect(view.requestMenu()).toEqual(["Copy", "Paste", "Select All"]);
    view.dispose();
  });

  it.each(popupActions)(
    "delivers %s only to the clicked live pane, once",
    async (label, operation) => {
      const view = await popupHarness();
      const activate = view.open(0); // The other pane had focus before right-click.
      activate(label);
      activate(label);
      expect(view.surfaces[0]![operation]).toHaveBeenCalledOnce();
      expect(view.surfaces[1]![operation]).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it.each([
    "pane focus",
    "tab selection",
    "tab removal",
    "window change",
    "window destruction",
    "window removal",
    "controller disposal",
    "renderer disposal",
    "failed pane",
  ] as const)(
    "makes all retained popup actions inert after %s",
    async (change) => {
      const view = await popupHarness(true);
      const activate = view.open();
      if (change === "pane focus") {
        view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
        view.tabs.handleCommand({ action: "focus-pane", target: "next" });
      } else if (change === "tab selection" || change === "tab removal") {
        view.tabs.handleCommand({ action: "new" });
        await vi.waitFor(() => expect(view.surfaces).toHaveLength(3));
        if (change === "tab removal") {
          view.tabs.handleCommand({ action: "previous" });
          view.tabs.handleCommand({ action: "close" });
        } else view.tabs.handleCommand({ action: "previous" });
      } else if (change === "window change") await view.changeWindow();
      else if (change === "window destruction") view.destroy();
      else if (change === "window removal") view.removeWindow();
      else if (change === "controller disposal") view.disposeController();
      else if (change === "renderer disposal") view.tabs.dispose();
      else view.sessions[1]!.onExit({ exitCode: 0, signal: 9 });
      for (const surface of view.surfaces) {
        surface.copy.mockClear();
        surface.paste.mockClear();
        surface.selectAll.mockClear();
        surface.dispose.mockClear();
      }
      view.inspectBusy.mockClear();
      for (const action of [
        "Export Terminal Content…",
        "Copy",
        "Paste",
        "Select All",
        "Close Pane",
      ])
        activate(action);
      for (const surface of view.surfaces) {
        expect(surface.copy).not.toHaveBeenCalled();
        expect(surface.paste).not.toHaveBeenCalled();
        expect(surface.selectAll).not.toHaveBeenCalled();
        expect(surface.dispose).not.toHaveBeenCalled();
        expect(surface.exportText).not.toHaveBeenCalled();
      }
      expect(view.saveIpc).not.toHaveBeenCalled();
      expect(view.save).not.toHaveBeenCalled();
      expect(view.otherWindow.webContents.send).not.toHaveBeenCalled();
      expect(view.inspectBusy).not.toHaveBeenCalled();
      expect(view.confirm).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it.each(["exit", "selection", "replacement popup", "disposal"] as const)(
    "rejects clipboard delivery held in transport across %s",
    async (change) => {
      const view = await popupHarness();
      const activate = view.open();
      view.holdClipboard();
      activate("Paste");
      if (change === "exit")
        view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
      else if (change === "selection")
        view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
      else if (change === "replacement popup") view.open();
      else view.tabs.dispose();
      view.deliverClipboard();
      for (const surface of view.surfaces)
        expect(surface.paste).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it("retains Busy close ownership and shares the existing Close Tab slot", async () => {
    const view = await popupHarness(true);
    let resolve!: (confirmed: boolean) => void;
    view.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const activate = view.open();
    activate("Close Pane");
    activate("Export Terminal Content…");
    expect(view.sentExports).toEqual([]);
    expect(view.saveIpc).not.toHaveBeenCalled();
    const shared = view.application.closeSelectedTab();
    view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
    expect(view.confirm).toHaveBeenCalledOnce();
    resolve(true);
    await shared;
    expect(view.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
    view.dispose();
  });

  it.each([false, true])(
    "a %s Busy decision never closes a replacement after target exit",
    async (confirmed) => {
      const view = await popupHarness(true);
      let resolve!: (confirmed: boolean) => void;
      view.confirm.mockImplementationOnce(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          }),
      );
      view.open()("Close Pane");
      const pending = view.application.closeSelectedPane();
      view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
      resolve(confirmed);
      await pending;
      expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it("does not inspect Busy state or confirm a superseded popup", async () => {
    const view = await popupHarness(true);
    const activateOld = view.open();
    view.open();
    view.inspectBusy.mockClear();
    activateOld("Close Pane");
    expect(view.inspectBusy).not.toHaveBeenCalled();
    expect(view.confirm).not.toHaveBeenCalled();
    view.dispose();
  });

  it("does not paste into a survivor when the popup's pane exits", async () => {
    const view = await popupHarness();
    const activate = view.open();
    view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
    activate("Paste");
    expect(view.surfaces[0]!.paste).not.toHaveBeenCalled();
    view.dispose();
  });

  it("does not close a survivor when the popup's pane exits before activation", async () => {
    const view = await popupHarness();
    const activate = view.open();
    view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
    activate("Close Pane");
    expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll("main")).toHaveLength(1);
    view.dispose();
  });
});
