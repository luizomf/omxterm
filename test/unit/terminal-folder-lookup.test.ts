import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

const reads = vi.hoisted(() =>
  vi.fn(
    async (ids: readonly number[]) =>
      new Map(ids.map((id) => [id, "/work/project"])),
  ),
);
vi.mock("../../src/main/process-working-directory", () => ({
  createProcessDirectoryReader: () => reads,
}));

afterEach(() => {
  vi.useRealTimers();
  reads.mockClear();
});

// Windows shells' folders aren't looked up (PowerShell's location isn't its cwd).
describe.skipIf(process.platform === "win32")("tab folder lookup", () => {
  it("looks the folder up after quiet output at the prompt, never while a title or a program shows", async () => {
    vi.useFakeTimers();
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    let titled = false;
    let program = false;
    const onFolderChange = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    let callbacks:
      | Parameters<
          Parameters<typeof router.registerController>[0]["createSession"]
        >[0]
      | undefined;
    const controller = router.registerController({
      ...clipboardOptions(),
      webContents,
      homeDirectory: "/home/user",
      createSession(value) {
        callbacks = value;
        return {
          processId: 4242,
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => program,
          close: vi.fn(),
        };
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
      onFolderChange,
      showsFolder: () => !titled,
    });
    ipc.handlers.get(terminalIpc.start)!({
      sender: webContents,
      senderFrame: mainFrame,
    });

    callbacks!.onOutput("prompt");
    callbacks!.onOutput("more");
    await vi.advanceTimersByTimeAsync(999);
    expect(reads).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toHaveBeenCalledOnce();
    expect(onFolderChange).toHaveBeenLastCalledWith("s1", "project");

    // A title the shell set wins, so its folder isn't looked up.
    titled = true;
    callbacks!.onOutput("typing");
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toHaveBeenCalledOnce();

    // Nor when the title arrives during the quiet second.
    titled = false;
    callbacks!.onOutput("output");
    titled = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toHaveBeenCalledOnce();

    // A running program (top, tmux, a loop) can't change the shell's folder.
    titled = false;
    program = true;
    for (let i = 0; i < 5; i++) {
      callbacks!.onOutput("tick");
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(reads).toHaveBeenCalledOnce();
    program = false;

    // Without output, nothing is looked up.
    titled = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).toHaveBeenCalledOnce();
    callbacks!.onOutput("back to the folder");
    await vi.advanceTimersByTimeAsync(1000);
    expect(reads).toHaveBeenCalledTimes(2);

    controller.dispose();
    router.dispose();
  });
});
