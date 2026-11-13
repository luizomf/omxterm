import { expect, it, vi } from "vitest";
import { createWorkingDirectoryTracker } from "../../src/main/terminal-working-directories";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";
import { terminalIpc } from "../../src/shared/terminal-ipc";
it("distinguishes launch-only, invalidated and newer reported provenance", () => {
  const tracker = createWorkingDirectoryTracker({
    platform: "linux",
    hostName: () => "local",
  });
  tracker.launched("s1", "/launch");
  expect(tracker.provenance("s1")).toEqual({
    kind: "launch-local",
    path: "/launch",
  });
  tracker.observe("s1", "\u001b]7;file://remote/private\u0007");
  expect(tracker.provenance("s1")).toEqual({ kind: "home" });
  tracker.observe("s1", "\u001b]7;file://localhost/reported\u0007");
  expect(tracker.provenance("s1")).toEqual({
    kind: "reported-local",
    path: "/reported",
  });
  tracker.observe("s1", "\u001b]7;file://localhost/" + "x".repeat(4096));
  expect(tracker.provenance("s1")).toEqual({ kind: "home" });
  tracker.observe("s1", "\u0007\u001b]7;file://localhost/again%0a\u0007");
  expect(tracker.provenance("s1")).toEqual({ kind: "home" });
  tracker.forget("s1");
  expect(tracker.provenance("s1")).toEqual({ kind: "home" });
});
it("consumes a restored token once, explicitly selects Default Shell and keeps pending -e for ordinary start", () => {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const contents = { mainFrame: {}, send: vi.fn(), isDestroyed: () => false };
  const owner = { sender: contents, senderFrame: contents.mainFrame };
  let tokenAvailable = true;
  let commandAvailable = true;
  const callbacks: SessionCallbacks[] = [];
  const createSession = vi.fn(
    (
      next: SessionCallbacks,
      _directory?: string,
      _ssh?: unknown,
      restored?: boolean,
    ) => {
      callbacks.push(next);
      const explicit = !restored && commandAvailable;
      if (!restored) commandAvailable = false;
      return {
        launchKind: explicit
          ? ("explicit-command" as const)
          : ("default-shell" as const),
        close: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => explicit,
      };
    },
  );
  const controller = router.registerController({
    ...clipboardOptions(),
    webContents: contents,
    homeDirectory: "/home/test",
    createSession,
    onSessionExit: vi.fn(),
    onSessionStartError: vi.fn(),
    consumeLayoutLaunch() {
      if (!tokenAvailable) throw new Error("consumed");
      tokenAvailable = false;
      return "/restored";
    },
  });
  const start = ipc.handlers.get(terminalIpc.start)!;
  const token = "00000000-0000-0000-0000-000000000001";
  start(owner, { restoreToken: token });
  expect(createSession.mock.calls[0]?.slice(1)).toEqual([
    "/restored",
    undefined,
    true,
    "s1",
    undefined,
  ]);
  expect(commandAvailable).toBe(true);
  expect(controller.layoutDirectory!("s1")).toEqual({
    kind: "launch-local",
    path: "/restored",
  });
  expect(() => start(owner, { restoreToken: token })).toThrow("consumed");
  start(owner);
  expect(commandAvailable).toBe(false);
  callbacks[1]!.onOutput("\u001b]7;file://localhost/explicit\u0007");
  expect(controller.layoutDirectory!("s2")).toEqual({ kind: "home" });
  callbacks[0]!.onExit({ exitCode: 0, signal: 0 });
  expect(controller.layoutDirectory!("s1")).toEqual({ kind: "home" });
  expect(() => controller.layoutDirectory!("s999")).toThrow();
  router.dispose();
});
it("keeps a reopened pane's unavailable folder until the shell reports another", async () => {
  const { prepareSavedLayout } =
    await import("../../src/main/terminal-layout-transfer");
  const { savedLayout } = await import("../fixtures/restoration-layout");
  const plan = await prepareSavedLayout(
    savedLayout(),
    "/home/test",
    async (directory) => directory !== "/synthetic/reported",
  );
  const [missing] = plan.initial.tabs[0]!.panes;
  expect(plan.directories.get(missing!)).toBe("/home/test");
  expect([...plan.remembered!.entries()]).toEqual([
    [missing, "/synthetic/reported"],
  ]);

  const tracker = createWorkingDirectoryTracker({
    platform: "linux",
    hostName: () => "local",
  });
  tracker.launched("s1", "/home/test", { remembered: "/synthetic/reported" });
  expect(tracker.provenance("s1")).toEqual({
    kind: "launch-local",
    path: "/synthetic/reported",
  });
  tracker.observe("s1", "\u001b]7;file://localhost/moved\u0007");
  expect(tracker.provenance("s1")).toEqual({
    kind: "reported-local",
    path: "/moved",
  });
});
