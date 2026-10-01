import assert from "node:assert/strict";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type {
  IpcHandler,
  IpcListener,
} from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { spawnFixturePty } from "./native-fixture-pty";

const handlers = new Map<string, IpcHandler>();
const listeners = new Map<string, IpcListener>();
let failures = 0;
let diagnostics = 0;
let escaped = 0;
let exits = 0;
let nextExecutable = "/bin/cat";
const router = registerTerminalIpcRouter(
  {
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    removeHandler: (channel) => {
      handlers.delete(channel);
    },
    removeListener: (channel) => {
      listeners.delete(channel);
    },
  },
  {
    write(event) {
      if (event.name === "pty.resize-failed") {
        assert.equal(
          event.reason,
          "closed-pty",
          "Unexpected actionable native failure",
        );
        diagnostics += 1;
      }
      return true;
    },
  },
);
let siblingOutput = "";
const mainFrame = {};
const webContents = {
  mainFrame,
  isDestroyed: () => false,
  send(channel: string, payload: unknown) {
    if (channel === terminalIpc.output) {
      const output = payload as { sessionId: string; data: string };
      if (output.sessionId === "s1")
        siblingOutput = (siblingOutput + output.data).slice(-1024);
    }
  },
};
const trusted = { sender: webContents, senderFrame: mainFrame };
const ended = new Set<string>();
router.registerController({
  windowId: 1,
  configuration: {
    fontSize: 16,
    fontLineHeight: 1,
    fontLigatures: true,
    terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
    scrollbackLines: 10_000,
    optionKeyMode: "none",
    nativeTitleInset: 0,
    transparency: 0,
    showTabBar: true,
    terminalTheme: DEFAULT_TERMINAL_THEME,
    userFileErrors: [],
  },
  webContents,
  createSession(callbacks) {
    let nativeExited = false;
    return createLocalTerminalSession(
      (file, args, options) => {
        const pty = spawnFixturePty(file, args, options);
        pty.onExit(() => {
          nativeExited = true;
        });
        const resize = pty.resize.bind(pty);
        pty.resize = (cols, rows) => {
          try {
            resize(cols, rows);
          } catch (error) {
            // Observe the real native error; never close a descriptor or inject one.
            assert.equal(
              nativeExited,
              false,
              "Failure must precede native exit notification",
            );
            assert.ok(error instanceof Error);
            assert.equal(error.message, "ioctl(2) failed, EBADF");
            failures += 1;
            throw error;
          }
        };
        return pty;
      },
      {
        shell: "/bin/sh",
        launchRequest: {
          kind: "explicit-command",
          executable: nextExecutable,
          arguments: [],
        },
        platform: process.platform,
        homeDirectory: process.cwd(),
        environment: process.env,
        applicationVersionProvider: { getVersion: () => "resize-test" },
        ...callbacks,
      },
    );
  },
  onSessionStartError() {
    throw new Error("Unexpected spawn failure");
  },
  onSessionExit(exit, context) {
    assert.deepEqual(exit, { exitCode: 0, signal: 0 });
    assert.equal(context.closeRequested, false);
    assert.equal(context.liveSessions, context.sessionId === "s1" ? 0 : 1);
    ended.add(context.sessionId);
    exits += 1;
  },
  onSessionStarted() {},
  onSessionSelected() {},
  onTitleRequest() {},
  onBell() {},
  onUserInteraction() {},
  writeClipboardText() {},
  readClipboardText: () => "",
  confirmPaste: async () => false,
  showClipboardContextMenu() {},
  openExternalLink: async () => {},
  onExternalLinkOpenError() {},
  loadSnippets: async () => ({ snippets: [] }),
  loadLocalImage: async () => null,
});
const start = handlers.get(terminalIpc.start)!;
const resize = listeners.get(terminalIpc.resize)!;
const input = listeners.get(terminalIpc.input)!;
const deadline = Date.now() + 20_000;
async function observe(predicate: () => boolean) {
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Native resize observation timed out");
    await yieldTurn();
  }
}
try {
  assert.equal(start(trusted), "s1");
  nextExecutable =
    process.platform === "darwin" ? "/usr/bin/true" : "/bin/true";
  for (let index = 0; index < 100; index += 1) {
    const sessionId = start(trusted) as string;
    await observe(() => {
      if (ended.has(sessionId)) return true;
      for (let burst = 0; burst < 8; burst += 1) {
        try {
          resize(trusted, { sessionId, cols: 100, rows: 30 });
        } catch {
          escaped += 1;
        }
      }
      return false;
    });
  }
  assert.ok(failures > 0, "No native closure race was exercised");
  assert.equal(
    escaped,
    0,
    "Native resize exceptions escaped the production IPC listener",
  );
  assert.equal(
    diagnostics,
    failures,
    "Every failed native resize must have safe teardown diagnostics",
  );
  assert.equal(
    exits,
    100,
    "Only actual native exits may complete racing sessions",
  );
  resize(trusted, { sessionId: "s1", cols: 120, rows: 40 });
  input(trusted, { sessionId: "s1", data: "__SIBLING_USABLE__\n" });
  await observe(() => siblingOutput.includes("__SIBLING_USABLE__"));
  // End the sibling through real terminal EOF rather than synthesizing exit.
  input(trusted, { sessionId: "s1", data: "\u0004" });
  await observe(() => ended.has("s1"));
  assert.equal(exits, 101);
  process.stdout.write(
    `__OMXTERM_RESIZE_RACE__${JSON.stringify({ sessions: 100, failures, diagnostics, escaped, exits, siblingUsable: true })}\n`,
  );
} finally {
  router.dispose();
  siblingOutput = "";
}
