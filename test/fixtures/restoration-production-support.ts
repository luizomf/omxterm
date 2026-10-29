import assert from "node:assert/strict";
import { app, BrowserWindow, Menu, type WebContents } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";
import type * as NodePty from "node-pty";
import { spawnFixturePty } from "./native-fixture-pty";
import { spawnFixtureProcess } from "./native-fixture-ownership";

export async function isolateRestorationProfile(root: string) {
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "arm64");
  assert.notEqual(process.getuid?.(), 0);
  const account = os.userInfo();
  assert.ok(
    ["/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh"].includes(
      account.shell ?? "",
    ),
    "prepared sh/bash account required",
  );
  const home = path.join(root, "home");
  const profile = path.join(root, "profile");
  const reported = path.join(root, "owned-folders", "reported");
  const missing = path.join(root, "owned-folders", "vanishes");
  for (const directory of [
    home,
    profile,
    reported,
    missing,
    path.join(root, "config", "omxterm"),
    path.join(root, "data"),
  ])
    await mkdir(directory, { recursive: true });
  app.setPath("userData", profile);
  Object.assign(process.env, {
    HOME: home,
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
  });
  // Same isolation seam as production-shutdown; retain the real account shell.
  const userInfo = os.userInfo;
  os.userInfo = ((...args: Parameters<typeof userInfo>) => ({
    ...userInfo(...args),
    homedir: home,
  })) as typeof userInfo;
  syncBuiltinESMExports();
  const startup =
    "unset PROMPT_COMMAND\nHISTFILE=/dev/null\nPS1='layout> '\nprintf '\\nOMX_LAYOUT_READY\\n'\n";
  for (const name of [".profile", ".bash_profile"])
    await writeFile(path.join(home, name), startup);
  await writeFile(
    path.join(root, "config/omxterm/config.json"),
    JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
  );
  return { home, profile, reported, missing };
}

// Same production-entry observation seam as files-production and
// production-shutdown: never replace a renderer, router, PTY or quit barrier.
export function observeRestorationProduction(source: string) {
  const require = createRequire(path.join(source, "package.json"));
  const ptys: {
    terminal: NodePty.IPty;
    pid: number;
    cwd: string | undefined;
    output: string;
    writes: string;
    sizes: [number, number][];
    exited: boolean;
  }[] = [];
  const pty = require("node-pty") as typeof NodePty;
  const spawn = pty.spawn;
  pty.spawn = (...args) => {
    const terminal = spawnFixturePty(...args, { spawn });
    // Restoration must use the actual account's Default Shell, never replay -e.
    assert.deepEqual(args[1], ["-l"]);
    const record = {
      terminal,
      pid: terminal.pid,
      cwd: args[2]?.cwd,
      output: "",
      writes: "",
      sizes: [[80, 24]] as [number, number][],
      exited: false,
    };
    ptys.push(record);
    terminal.onData((data) => {
      record.output = (record.output + data).slice(-65536);
    });
    terminal.onExit(() => {
      record.exited = true;
    });
    const resize = terminal.resize.bind(terminal);
    terminal.resize = (cols, rows) => {
      record.sizes.push([cols, rows]);
      resize(cols, rows);
    };
    const write = terminal.write.bind(terminal);
    terminal.write = (data) => {
      record.writes = (record.writes + data).slice(-16384);
      write(data);
    };
    return terminal;
  };
  const children: {
    child: import("node:child_process").ChildProcess;
    pid: number;
    closed: boolean;
  }[] = [];
  const childProcess =
    require("node:child_process") as typeof import("node:child_process");
  const fork = childProcess.fork;
  childProcess.fork = ((...args: Parameters<typeof fork>) => {
    const backend = String(args[0]).endsWith("extension-runtime/bootstrap.mjs");
    const child = backend
      ? spawnFixtureProcess(
          () => {
            const started = fork(...args);
            assert.ok(started.pid);
            return started as typeof started & { pid: number };
          },
          (started, exited) => {
            started.once("exit", exited);
            return () => {
              started.removeListener("exit", exited);
            };
          },
        )
      : fork(...args);
    if (backend) {
      assert.ok(child.pid);
      const record = { child, pid: child.pid, closed: false };
      children.push(record);
      child.once("close", () => {
        record.closed = true;
      });
    }
    return child;
  }) as typeof fork;
  syncBuiltinESMExports();
  return { ptys, children };
}
export async function until(
  check: () => boolean | Promise<boolean>,
  label: string,
  timeout = 15000,
) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${label}`);
}
export async function focus(window: BrowserWindow) {
  window.focus();
  await until(
    () => BrowserWindow.getFocusedWindow() === window,
    "owned native window focus",
  );
}
export function menu(window: BrowserWindow, label: string) {
  const search = (
    items: Electron.MenuItem[],
  ): Electron.MenuItem | undefined => {
    for (const item of items) {
      if (item.label.replace(/…$/, "") === label) return item;
      const child = item.submenu && search(item.submenu.items);
      if (child) return child;
    }
    return undefined;
  };
  const item = search(Menu.getApplicationMenu()!.items);
  assert.ok(item?.enabled, `menu ${label}`);
  (
    item.click as (
      item: Electron.MenuItem,
      window: BrowserWindow,
      event: unknown,
    ) => void
  )(item, window, {});
}
export function text(contents: WebContents): Promise<string> {
  return contents.executeJavaScript(
    "document.body.textContent",
  ) as Promise<string>;
}
export async function click(contents: WebContents, label: string) {
  await contents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.closest('[hidden]'));
    if (!button || button.disabled || button.closest('[inert]')) throw Error('button unavailable');
    button.click();
  })()`);
}
export async function selectPane(
  window: BrowserWindow,
  tab: number,
  pane: number,
) {
  await focus(window);
  const core = window.webContents;
  await core.executeJavaScript(
    `document.querySelectorAll('#tab-strip [role=tab]')[${tab}]?.click()`,
  );
  await until(
    () =>
      core.executeJavaScript(
        `!!document.querySelectorAll('.terminal-tab')[${tab}]?.querySelectorAll('.terminal-surface')[${pane}]?.querySelector('canvas')`,
      ),
    "pane canvas",
  );
  const point = (await core.executeJavaScript(
    `(() => {
      const canvas = document.querySelectorAll('.terminal-tab')[${tab}].querySelectorAll('.terminal-surface')[${pane}].querySelector('canvas');
      const r = canvas.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      if (r.width <= 0 || r.height <= 0 || document.elementFromPoint(x, y) !== canvas)
        throw Error('pane canvas is not a visible pointer target');
      return {x, y};
    })()`,
  )) as { x: number; y: number };
  core.sendInputEvent({
    type: "mouseDown",
    ...point,
    button: "left",
    clickCount: 1,
  });
  core.sendInputEvent({
    type: "mouseUp",
    ...point,
    button: "left",
    clickCount: 1,
  });
  await until(
    () =>
      core.executeJavaScript(
        `document.activeElement?.closest('.terminal-surface') === document.querySelectorAll('.terminal-tab')[${tab}]?.querySelectorAll('.terminal-surface')[${pane}]`,
      ),
    "selected pane owns input",
  );
}
export async function input(contents: WebContents, command: string) {
  await contents.insertText(command);
  contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
}
export function quote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
