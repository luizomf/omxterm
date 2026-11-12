import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";
import { terminalIpc } from "../../src/shared/terminal-ipc";

// A real process stands in for the shell: it never sends OSC 7, so the
// split and the layout must come from its working directory.
it.skipIf(process.platform === "win32")(
  "starts a split in the source shell's folder and saves that folder",
  async () => {
    const folder = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-shell-cwd-")),
    );
    const shell = spawn("sleep", ["30"], { cwd: folder, stdio: "ignore" });
    try {
      const ipc = createIpcHarness();
      const router = registerTerminalIpcRouter(ipc.ipcMain);
      const contents = {
        mainFrame: {},
        send: vi.fn(),
        isDestroyed: () => false,
      };
      const owner = { sender: contents, senderFrame: contents.mainFrame };
      const createSession = vi.fn(
        (_next: SessionCallbacks, _directory?: string) => ({
          launchKind: "default-shell" as const,
          processId: shell.pid!,
          close: vi.fn(),
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
        }),
      );
      const controller = router.registerController({
        ...clipboardOptions(),
        webContents: contents,
        homeDirectory: os.homedir(),
        createSession,
        onSessionExit: vi.fn(),
        onSessionStartError: vi.fn(),
      });
      const start = ipc.handlers.get(terminalIpc.start)!;
      expect(start(owner)).toBe("s1");
      expect(await start(owner, { workingDirectoryOf: "s1" })).toBe("s2");
      expect(createSession.mock.calls[1]![1]).toBe(folder);
      await controller.refreshDirectories!();
      expect(controller.layoutDirectory!("s1")).toEqual({
        kind: "reported-local",
        path: folder,
      });
      router.dispose();
    } finally {
      shell.kill();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
