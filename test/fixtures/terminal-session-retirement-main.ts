import assert from "node:assert/strict";
import { setImmediate as yieldTurn } from "node:timers/promises";
import type { IPty } from "node-pty";
import {
  createLocalTerminalSession,
  type LocalTerminalSession,
} from "../../src/main/local-terminal-session";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type {
  IpcHandler,
  IpcListener,
  TerminalSessionEndContext,
} from "../../src/main/terminal-ipc-types";
import type { TerminalExit } from "../../src/shared/terminal-contract";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { spawnFixturePty } from "./native-fixture-pty";

const handlers = new Map<string, IpcHandler>();
const listeners = new Map<string, IpcListener>();
const router = registerTerminalIpcRouter({
  handle: (channel, value) => {
    handlers.set(channel, value);
  },
  on: (channel, value) => {
    listeners.set(channel, value);
  },
  removeHandler: (channel) => {
    handlers.delete(channel);
  },
  removeListener: (channel) => {
    listeners.delete(channel);
  },
});
const sessionRefs: WeakRef<LocalTerminalSession>[] = [];
const nativeRefs: WeakRef<IPty>[] = [];
const ended = new Map<
  string,
  { exit: TerminalExit; context: TerminalSessionEndContext }
>();
let executable = "/bin/cat";
let interactions = 0;
let titles = 0;
let bells = 0;
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
const owner = { sender: webContents, senderFrame: mainFrame };
const controller = router.registerController({
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
    const session = createLocalTerminalSession(
      (file, args, options) => {
        const pty = spawnFixturePty(file, args, options);
        if (file !== "/bin/cat") nativeRefs.push(new WeakRef(pty));
        return pty;
      },
      {
        shell: "/bin/sh",
        launchRequest: { kind: "explicit-command", executable, arguments: [] },
        platform: process.platform,
        homeDirectory: process.cwd(),
        environment: process.env,
        applicationVersionProvider: { getVersion: () => "retirement-test" },
        ...callbacks,
      },
    );
    if (executable !== "/bin/cat") sessionRefs.push(new WeakRef(session));
    // No mock call/result journal, callback array or strong-reference history.
    return session;
  },
  onSessionStartError() {
    throw new Error("Unexpected native spawn failure");
  },
  onSessionExit(exit, context) {
    ended.set(context.sessionId, { exit, context });
  },
  onSessionStarted() {},
  onSessionSelected() {},
  onTitleRequest() {
    titles += 1;
  },
  onBell() {
    bells += 1;
  },
  onUserInteraction() {
    interactions += 1;
  },
  writeClipboardText() {},
  readClipboardText: () => "",
  confirmPaste: async () => false,
  showClipboardContextMenu() {},
  openExternalLink: async () => {},
  onExternalLinkOpenError() {},
  loadSnippets: async () => ({ snippets: [] }),
  loadLocalImage: async () => null,
});
const start = () => handlers.get(terminalIpc.start)!(owner) as string;
const send = (channel: string, payload: unknown) =>
  listeners.get(channel)!(owner, payload);
const deadline = Date.now() + 20_000;
async function observe(predicate: () => boolean) {
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Native retirement observation timed out");
    await yieldTurn();
  }
}
async function retained() {
  // WeakRef dereferences keep targets alive until the next job. Yield before
  // every GC and after it, and never carry dereferenced targets across turns.
  await yieldTurn();
  globalThis.gc!();
  await yieldTurn();
  return {
    sessions: sessionRefs.filter((ref) => ref.deref() !== undefined).length,
    natives: nativeRefs.filter((ref) => ref.deref() !== undefined).length,
  };
}
try {
  assert.equal(
    typeof globalThis.gc,
    "function",
    "Fixture requires --expose-gc",
  );
  assert.equal(start(), "s1");
  send(terminalIpc.tabSelected, { sessionId: "s1" });
  executable = process.platform === "darwin" ? "/usr/bin/true" : "/bin/true";
  const batches = [];
  for (let batch = 0; batch < 4; batch += 1) {
    for (let index = 0; index < 25; index += 1) {
      const sessionId = start();
      await observe(() => ended.has(sessionId));
      const result = ended.get(sessionId)!;
      assert.deepEqual(result.exit, { exitCode: 0, signal: 0 });
      assert.deepEqual(result.context, {
        sessionId,
        launchKind: "explicit-command",
        closeRequested: false,
        liveSessions: 1,
      });
      // Drop even the immutable test-owned end record before collection.
      ended.delete(sessionId);
      send(terminalIpc.close, { sessionId });
      assert.equal(controller.hasBusySession(), true);
      assert.equal(controller.hasBusySelectedSession(), true);
    }
    let remaining = await retained();
    for (
      let attempt = 0;
      attempt < 10 && (remaining.sessions || remaining.natives);
      attempt += 1
    )
      remaining = await retained();
    batches.push(remaining);
    assert.deepEqual(
      remaining,
      { sessions: 0, natives: 0 },
      "Exited wrappers retained while controller is alive",
    );
  }
  const stale = { sessionId: "s2" };
  send(terminalIpc.input, { ...stale, data: "stale" });
  send(terminalIpc.resize, { ...stale, cols: 100, rows: 30 });
  send(terminalIpc.title, { ...stale, title: "stale" });
  send(terminalIpc.bell, stale);
  send(terminalIpc.outputAck, { ...stale, end: 1 });
  assert.equal(interactions, 0);
  assert.equal(titles, 0);
  assert.equal(bells, 0);
  send(terminalIpc.resize, { sessionId: "s1", cols: 120, rows: 40 });
  send(terminalIpc.input, { sessionId: "s1", data: "__SIBLING_USABLE__\n" });
  await observe(() => siblingOutput.split("__SIBLING_USABLE__").length === 3);
  send(terminalIpc.input, { sessionId: "s1", data: "\u0004" });
  await observe(() => ended.has("s1"));
  assert.deepEqual(ended.get("s1")!.exit, { exitCode: 0, signal: 0 });
  assert.equal(ended.get("s1")!.context.liveSessions, 0);
  assert.equal(controller.hasBusySession(), false);
  assert.equal(controller.hasBusySelectedSession(), false);
  assert.deepEqual(router.activeTerminalSurfaceFontConfigurations(), []);
  process.stdout.write(
    `__OMXTERM_RETIREMENT__${JSON.stringify({ created: 100, batches, actualExits: 101, staleInteractions: 0, siblingUsable: true })}\n`,
  );
} finally {
  router.dispose();
  siblingOutput = "";
  ended.clear();
}
