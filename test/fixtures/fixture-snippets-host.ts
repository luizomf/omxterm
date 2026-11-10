import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { dialog, ipcMain, type BrowserWindow } from "electron";
import { startApplicationExtensions } from "../../src/main/application-extensions";
import { extensionInvocationTarget } from "../../src/main/extension-invocation-target";
import { registerSemanticInputIpc } from "../../src/main/semantic-input-ipc";
import { createWindowActionSender } from "../../src/main/window-action-delivery";
import { translatorFor } from "../../src/shared/i18n";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { spawnFixtureProcess } from "./native-fixture-ownership";

/** Production Snippets composition for fixture windows; no terminal input shortcut. */
export async function startFixtureSnippetsHost(
  root: string,
  window: BrowserWindow,
  router: TerminalIpcRouter,
) {
  const require = createRequire(__filename);
  const childProcess =
    require("node:child_process") as typeof import("node:child_process");
  const fork = childProcess.fork;
  const children: {
    closed: boolean;
    exit: { code: number | null; signal: NodeJS.Signals | null } | null;
    close: Promise<void>;
  }[] = [];
  childProcess.fork = ((...args: Parameters<typeof fork>) => {
    if (args[0] !== path.join(root, "extension-runtime", "bootstrap.mjs"))
      return fork(...args);
    return spawnFixtureProcess(() => {
      const child = fork(...args);
      let closed!: () => void;
      const record = {
        closed: false,
        exit: null as {
          code: number | null;
          signal: NodeJS.Signals | null;
        } | null,
        close: new Promise<void>((resolve) => {
          closed = resolve;
        }),
      };
      children.push(record);
      child.once("exit", (code, signal) => {
        record.exit = { code, signal };
      });
      child.once("close", () => {
        record.closed = true;
        closed();
      });
      assert.ok(child.pid, "backend spawn must have an owned PID");
      return child as typeof child & { pid: number };
    });
  }) as typeof fork;
  syncBuiltinESMExports();
  const semanticInput = registerSemanticInputIpc({
    ipc: ipcMain,
    trusted: router.isTrustedSender,
    quitting: () => false,
  });
  semanticInput.register(window);
  const target = extensionInvocationTarget(window);
  const { sendAction } = createWindowActionSender(() => undefined);
  let extensions:
    Awaited<ReturnType<typeof startApplicationExtensions>> | undefined;
  try {
    extensions = await startApplicationExtensions({
      applicationRoot: root,
      semanticInput,
      isTrustedSender: router.isTrustedSender,
      translator: () => translatorFor("en-US"),
      changed() {},
      sendAction,
      keybind() {},
      ssh: {
        open: async () => {
          throw new Error("SSH is not declared by Snippets");
        },
      },
      layout: {
        capture: () => {
          throw new Error("Layout is not declared by Snippets");
        },
        open: async () => {
          throw new Error("Layout is not declared by Snippets");
        },
      },
    });
    extensions.registerWindow(window, (source, context) =>
      target.capture(() => undefined, source, context),
    );
  } catch (error) {
    try {
      if (extensions && !(await extensions.dispose()))
        throw new Error("Snippets startup retirement not settled");
      semanticInput.dispose();
      childProcess.fork = fork;
      syncBuiltinESMExports();
    } catch {
      // A rejected startup may be treated as settled only after all owned
      // setup resources have actually retired, including on disposal errors.
      process.stderr.write("Snippets startup ownership not settled\n");
      return new Promise<never>(() => {});
    }
    throw error;
  }
  let disposal: Promise<boolean> | undefined;
  let installation: Promise<void> | undefined;
  return {
    started: target.started,
    selected: target.selected,
    ended: target.ended,
    hasLiveTarget(sessionId: string) {
      const captured = target.capture(() => undefined);
      return captured.sourceSessionId === sessionId && !captured.signal.aborted;
    },
    toggle: () => extensions.toggleSnippets(window),
    assertActivated() {
      assert.equal(children.length, 1, "one real Snippets backend started");
      assert.equal(children[0]!.exit, null, "Snippets backend remains live");
    },
    install() {
      installation ??= (async () => {
        const archive = path.join(root, "snippets.omxext");
        const digest = createHash("sha256")
          .update(await readFile(archive))
          .digest("hex");
        const open = dialog.showOpenDialog;
        const message = dialog.showMessageBox;
        let approved = 0;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [archive],
        });
        dialog.showMessageBox = (async (
          _owner: Electron.BaseWindow,
          prompt: Electron.MessageBoxOptions,
        ) => {
          assert.equal(prompt.title, "Trust extension code?");
          assert.ok(
            prompt.detail?.includes(digest),
            "consent names exact archive digest",
          );
          approved++;
          return { response: 1, checkboxChecked: false };
        }) as typeof dialog.showMessageBox;
        try {
          const result = (await window.webContents.executeJavaScript(
            "window.omxterm.extensions.request({ operation: 'install' })",
            true,
          )) as {
            ok: boolean;
            entries?: { id: string; enabled: boolean; local: string }[];
          };
          assert.equal(result.ok, true, "ordinary extension installation");
          assert.equal(approved, 1);
          assert.equal(
            children.length,
            0,
            "installation does not activate code",
          );
          assert.ok(
            result.entries?.some(
              (entry) =>
                entry.id === "omxterm.snippets" &&
                entry.enabled &&
                entry.local === "dormant",
            ),
          );
        } finally {
          dialog.showOpenDialog = open;
          dialog.showMessageBox = message;
        }
      })();
      return installation;
    },
    dispose() {
      disposal ??= (async () => {
        await installation?.catch(() => {});
        const settled = await extensions.dispose();
        if (!settled) return false;
        await Promise.all(children.map((child) => child.close));
        semanticInput.dispose();
        childProcess.fork = fork;
        syncBuiltinESMExports();
        return children.every(
          (child) =>
            child.closed &&
            child.exit?.code === 0 &&
            child.exit.signal === null,
        );
      })();
      return disposal;
    },
  };
}
