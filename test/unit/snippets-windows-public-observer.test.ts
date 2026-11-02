import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it.each([
  "joined",
  "backend-open",
  "backend-nonzero",
  "pty-live",
  "identity-live",
  "wrong-backend-identity",
  "duplicate-identity",
])(
  "public observation retains both backend identities for Quit: %s",
  async (outcome) => {
    const events = new EventEmitter();
    const app = Object.assign(events, {
      isPackaged: true,
      getVersion: () => "1",
      getAppPath: () => "/stage/app.asar",
      quit: () => events.emit("will-quit"),
    });
    const pty = { pid: 1, exited: outcome !== "pty-live" };
    const children = [
      { pid: 2, closed: true, exit: { code: 0, signal: null } },
      {
        pid: 3,
        closed: outcome !== "backend-open",
        exit: { code: outcome === "backend-nonzero" ? 1 : 0, signal: null },
      },
    ];
    const identities = [1, 2, 3].map((pid) => ({ pid, identity: `id${pid}` }));
    if (outcome === "wrong-backend-identity")
      identities[2] = { pid: 4, identity: "id4" };
    if (outcome === "duplicate-identity") identities[2] = identities[1]!;
    let quitReceipt: { joined: boolean; identities: unknown[] } | undefined;
    let publicCalls = 0;
    const module = {
      exports: {} as {
        arm(options: object): void;
        run(): Promise<unknown>;
        quit(): void;
      },
    };
    runInNewContext(
      readFileSync("test/fixtures/snippets-windows-exact-observer.cjs", "utf8"),
      {
        module,
        process: {
          platform: "win32",
          arch: "arm64",
          pid: 41,
          execPath: "/stage/app.exe",
          versions: { electron: "43", node: "24" },
        },
        console,
        require(name: string) {
          if (name === "electron")
            return {
              app,
              ipcMain: {},
              BrowserWindow: { getAllWindows: () => [] },
              webContents: {},
            };
          if (name === "node:assert/strict") return assert;
          if (name === "node:path") return path;
          if (name === "node:fs")
            return {
              writeFileSync(_file: string, text: string) {
                quitReceipt = JSON.parse(text) as typeof quitReceipt;
              },
            };
          if (name === "node:module")
            return { createRequire: () => () => ({}) };
          if (name === "./snippets-observer.cjs")
            return { observe: () => ({ ptys: [], children, restore() {} }) };
          if (name === "./snippets-windows-readiness.cjs")
            return {
              startWindowsProbeReadiness: () => ({
                ready() {},
                snapshot() {},
                dispose() {},
              }),
            };
          if (name === "./snippets-windows-parser.cjs")
            return { createInputHandler() {} };
          if (name === "./fixture-processes.cjs")
            return {
              fixtureProcesses: () =>
                outcome === "identity-live" ? [identities[2]] : [],
            };
          if (name === "./snippets-scenario.cjs")
            return {
              runScenario: () => {
                throw Error("local scenario selected");
              },
            };
          if (name === "./snippets-windows-public-scenario.cjs")
            return {
              runPublicScenario: ({ ptys }: { ptys: unknown[] }) => {
                publicCalls++;
                ptys.push(pty);
                return {
                  checks: ["public"],
                  identities,
                  retirementIdentity: identities[0],
                };
              },
            };
          throw Error(`unexpected require ${name}`);
        },
      },
    );
    module.exports.arm({
      version: "1",
      asar: "/stage/app.asar",
      executable: "/stage/app.exe",
      electronVersion: "43",
      publicCatalog: true,
      evidence: "/evidence",
    });
    const window = new EventEmitter();
    app.emit("browser-window-created", {}, window);
    window.emit("ready-to-show");
    const result = await module.exports.run();
    expect(publicCalls).toBe(1);
    expect(result).toEqual({ checks: ["public"] });
    module.exports.quit();
    expect(quitReceipt?.joined).toBe(outcome === "joined");
    if (outcome === "joined") expect(quitReceipt?.identities).toHaveLength(3);
  },
);
