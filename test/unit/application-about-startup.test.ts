import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { app, Menu } from "electron";
import { expect, it, vi } from "vitest";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { registerTerminalShutdown } from "../../src/main/terminal-shutdown";
import {
  hasAboutPhaseEvidence,
  readAboutDiagnostics,
} from "../fixtures/application-about-diagnostics";

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    app: Object.assign(new EventEmitter(), {
      setAboutPanelOptions: vi.fn(),
      isReady: () => true,
      getVersion: () => "1.0.0",
      commandLine: { getSwitchValue: () => "x11" },
      quit: vi.fn(),
      exit: vi.fn(),
    }),
    Menu: { setApplicationMenu: vi.fn() },
    nativeImage: {},
    dialog: {},
  };
});

it.for(["missing-result", "published-hang", "published-failure"] as const)(
  "reaches the intended About control phase without creating a window (%s)",
  async (mode) => {
    vi.clearAllMocks();
    vi.resetModules();
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-ordering-"));
    const entry = path.join(root, "entry.mjs");
    const result = path.join(root, "result.json");
    const diagnosticsPath = path.join(root, "diagnostics.jsonl");
    const argv = process.argv;
    const spawn = childProcess.spawn;
    const exitListeners = process.listeners("exit");
    const setMenu = Menu.setApplicationMenu;
    const trace: string[] = [];
    const native = app as unknown as EventEmitter;
    const createWindow = vi.fn(() => {
      throw new Error("About startup must not create its first window");
    });
    const unexpected = () => {
      throw new Error("Unexpected window action before About fixture shutdown");
    };
    const application = startTerminalApplication({
      createWindow,
      getSelectedWindow: () => undefined,
      showQuitConfirmation: unexpected,
      showCloseWindowConfirmation: unexpected,
      showCloseTabConfirmation: unexpected,
      showSessionFailure: unexpected,
      sendFontZoom: unexpected,
      sendClipboardAction: unexpected,
      sendSnippetsToggle: unexpected,
      sendFind: unexpected,
      sendTabBarToggle: unexpected,
      sendAuxiliaryPanelToggle: unexpected,
      sendTitleBarToggle: unexpected,
      sendLocalImageOpen: unexpected,
      toggleDeveloperTools: unexpected,
      sendTabCommand: unexpected,
      quit: () => app.quit(),
    });
    let willQuitPrevented = false;
    vi.mocked(app.quit).mockImplementation(() => {
      trace.push("normal-quit");
      const before = { preventDefault: vi.fn() };
      native.emit("before-quit", before);
      if (before.preventDefault.mock.calls.length) return;
      const will = { preventDefault: vi.fn() };
      native.emit("will-quit", will);
      willQuitPrevented = will.preventDefault.mock.calls.length > 0;
      if (!willQuitPrevented) trace.push("default-exit-0");
    });
    vi.mocked(app.exit).mockImplementation((code) => {
      trace.push(`exit-${code}`);
    });
    registerTerminalShutdown(app, {
      application: () => application,
      disposeSessions: () => trace.push("disposed"),
    });
    try {
      await writeFile(entry, "export {};\n");
      process.argv = [
        process.execPath,
        "fixture.mjs",
        entry,
        result,
        "development",
        `--fixture-${mode}`,
        `--fixture-about-diagnostics=${diagnosticsPath}`,
      ];
      vi.useFakeTimers();
      await import("../fixtures/application-about-main");
      const defaultMenu = { items: [] } as unknown as Electron.Menu;
      Menu.setApplicationMenu(defaultMenu);
      expect(application.isQuitting()).toBe(false);
      expect(app.exit).not.toHaveBeenCalled();
      const menu = {
        items: [
          {
            submenu: {
              items: [
                { label: "Reload User Configuration" },
                { id: "about", label: "About OMXTerm", click() {} },
              ],
            },
          },
        ],
      } as unknown as Electron.Menu;
      if (mode === "published-hang") {
        // Replace only the blocking OS primitive, not the fixture callback.
        // Throw to model never returning to the common Quit, without a sleep.
        const blocked = new Error("Fixture blocked after publication");
        const wait = vi.spyOn(Atomics, "wait").mockImplementation(() => {
          throw blocked;
        });
        expect(() => Menu.setApplicationMenu(menu)).toThrow(blocked);
        expect(wait).toHaveBeenCalledOnce();
        expect(application.isQuitting()).toBe(false);
        expect(trace).toEqual([]);
        expect(createWindow).not.toHaveBeenCalled();
        expect(JSON.parse(await readFile(result, "utf8"))).toMatchObject({
          aboutEntry: { label: "About OMXTerm", hasClick: true },
        });
        const diagnostics = await readAboutDiagnostics(diagnosticsPath);
        expect(diagnostics.records.at(-1)?.stage).toBe("observation-published");
        expect(hasAboutPhaseEvidence(diagnostics, mode)).toBe(true);
        return;
      }
      Menu.setApplicationMenu(menu);
      // This is the synchronous continuation at src/main/index.ts's menu seam.
      // No microtask or artificial native Quit-after-exit behavior is needed.
      expect(application.isQuitting()).toBe(true);
      expect(app.exit).not.toHaveBeenCalled();
      const firstWindow = application.newWindow();
      expect(createWindow).not.toHaveBeenCalled();
      expect(trace).toEqual(["normal-quit", "normal-quit", "disposed"]);
      if (mode === "missing-result") {
        await firstWindow;
        await expect(readFile(result)).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(app.exit).not.toHaveBeenCalled();
        const diagnostics = await readAboutDiagnostics(diagnosticsPath);
        expect(hasAboutPhaseEvidence(diagnostics, mode)).toBe(true);
        expect(
          diagnostics.records.some(
            (record) => record.stage === "observation-published",
          ),
        ).toBe(false);
        return;
      }
      expect(JSON.parse(await readFile(result, "utf8"))).toMatchObject({
        aboutEntry: { label: "About OMXTerm", hasClick: true },
        version: "1.0.0",
      });
      await firstWindow;
      expect(trace).toEqual([
        "normal-quit",
        "normal-quit",
        "disposed",
        "normal-quit",
        "exit-3",
      ]);
      expect(app.exit).toHaveBeenCalledExactlyOnceWith(3);
      expect(willQuitPrevented).toBe(true);
      const diagnostics = await readAboutDiagnostics(diagnosticsPath);
      expect(diagnostics.status).toBe("available");
      expect(diagnostics.records.map((record) => record.stage)).toEqual([
        "bootstrap",
        "producer-identity",
        "production-import",
        "menu-observation",
        "observation-publication",
        "observation-published",
        "quit-request",
        "before-quit",
        "before-quit",
        "before-quit",
        "will-quit",
        "failure-exit",
      ]);
      expect(
        diagnostics.records.every((record) => record.category === "none"),
      ).toBe(true);
      expect(hasAboutPhaseEvidence(diagnostics, "published-failure")).toBe(
        true,
      );
      // Observe unexpected creation without changing or inspecting the window.
      const window = { privatePayload: "must never be logged" };
      native.emit("browser-window-created", {}, window);
      const unexpectedWindow = await readAboutDiagnostics(diagnosticsPath);
      expect(unexpectedWindow.records.at(-1)?.stage).toBe("window-created");
      expect(hasAboutPhaseEvidence(unexpectedWindow, "published-failure")).toBe(
        false,
      );
      expect(await readFile(diagnosticsPath, "utf8")).not.toContain(
        "privatePayload",
      );
      native.emit("will-quit", { preventDefault() {} });
      expect(app.exit).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
      process.argv = argv;
      childProcess.spawn = spawn;
      syncBuiltinESMExports();
      Menu.setApplicationMenu = setMenu;
      native.removeAllListeners();
      for (const listener of process.listeners("exit"))
        if (!exitListeners.includes(listener))
          process.removeListener("exit", listener);
      await rm(root, { recursive: true, force: true });
    }
  },
);
