import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runWindowsExactController } from "../fixtures/snippets-windows-exact-controller";
import * as cdp from "../fixtures/packaged-inspector";
import * as processes from "../fixtures/native-fixture-processes";
import * as workers from "../fixtures/snippets-windows-inspector-workers";
import { spawnFixtureProcess } from "../fixtures/native-fixture-ownership";

vi.mock("node:child_process", { spy: true });
vi.mock("../fixtures/packaged-inspector", { spy: true });
vi.mock("../fixtures/native-fixture-processes", { spy: true });
vi.mock("../fixtures/snippets-windows-inspector-workers", { spy: true });
vi.mock("../fixtures/native-fixture-ownership", { spy: true });
let root: string;
let options: string;
let mode: string;
let live: boolean;
let calls: string[];
let child: EventEmitter & {
  pid: number;
  stdout: PassThrough;
  stderr: PassThrough;
  unref: () => void;
};
let fake: {
  request: (method: string, params?: object) => Promise<unknown>;
  nextEvent: () => Promise<unknown>;
  scriptUrl: (id: string) => string | undefined;
  evaluate: (expression: string) => Promise<unknown>;
  close: () => void;
};

beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "exact-controller-"));
  options = path.join(root, "options.json");
  mode = "normal";
  live = true;
  calls = [];
  vi.mocked(workers.createWindowsInspectorWorkers).mockReturnValue({
    notification() {},
    async finish() {},
    snapshot: () => ({
      identity: null,
      stage: 3,
      paused: true,
      complete: true,
      detached: false,
      error: null,
      trace: [],
    }),
  });
  vi.stubEnv("SystemRoot", root);
  child = Object.assign(new EventEmitter(), {
    pid: 41,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    unref: vi.fn(),
  });
  vi.mocked(childProcess.spawn).mockReturnValue(child as never);
  vi.mocked(spawnFixtureProcess).mockImplementation((start) => start());
  vi.mocked(processes.fixtureProcesses).mockImplementation(() => {
    const childRow = { pid: 42, parent: 41, identity: "12346" };
    return live
      ? [
          { pid: 41, parent: process.pid, identity: "12345" },
          ...(mode === "surviving-child" ? [childRow] : []),
        ]
      : mode === "surviving-child"
        ? [childRow]
        : [];
  });
  vi.mocked(cdp.until).mockImplementation(async (check, label) => {
    if (label === "owned loopback inspector")
      child.stderr.write(
        mode === "partial-endpoint"
          ? "Debugger listening on ws://127.0.0.1:1234/ab"
          : "Debugger listening on ws://127.0.0.1:1234/abcd\n",
      );
    await new Promise((resolve) => setImmediate(resolve));
    if (!(await check())) throw new Error(`Timed out: ${label}`);
  });
  fake = {
    async request(method, params) {
      calls.push(method);
      if (method === "Debugger.setBreakpointByUrl")
        return { breakpointId: "entry" };
      if (method === "Debugger.getPossibleBreakpoints")
        return {
          locations:
            mode === "empty-locations"
              ? []
              : [
                  {
                    scriptId: mode === "foreign-locations" ? "other" : "entry",
                    lineNumber: 5,
                    columnNumber: 0,
                  },
                ],
        };
      if (method === "Debugger.getScriptSource")
        return {
          scriptSource:
            (params as { scriptId: string }).scriptId === "loader"
              ? mode === "changed-loader"
                ? "unverified-loader"
                : "verified-loader"
              : mode === "changed-entry"
                ? "changed-entry"
                : "entry-source",
        };
      if (method === "Debugger.evaluateOnCallFrame") {
        const expression = (params as { expression: string }).expression;
        if (expression.includes(".arm(")) {
          calls.push("arm");
          return {
            result: {
              value: {
                pid: mode === "wrong-pid" ? 42 : 41,
                armed: true,
                windows: mode === "late-window" ? 1 : 0,
                ptys: mode === "late-pty" ? 1 : 0,
              },
            },
          };
        }
        return { result: { value: { pid: mode === "wrong-pid" ? 42 : 41 } } };
      }
      return {};
    },
    async nextEvent() {
      return {
        reason: mode === "late" ? "other" : "Break on start",
        hitBreakpoints: [],
        callFrames: [
          {
            callFrameId: "entry-frame",
            functionLocation:
              mode === "missing-function-location"
                ? undefined
                : {
                    scriptId: "entry",
                    lineNumber: 0,
                    columnNumber: 0,
                  },
            location: {
              scriptId: "entry",
              lineNumber: mode === "late-first" ? 1 : 0,
              columnNumber: 0,
            },
            scopeChain:
              mode === "missing-module-scope" ? [] : [{ type: "module" }],
          },
          {
            callFrameId: "loader-frame",
            functionName: "#asyncInstantiate",
            location: {
              scriptId: "loader",
              lineNumber: mode === "late-loader-call" ? 453 : 452,
              columnNumber: 8,
            },
          },
        ],
      };
    },
    scriptUrl(id) {
      if (id === "loader")
        return mode === "missing-loader"
          ? "node:other"
          : "node:internal/modules/esm/module_job";
      return mode === "unknown-initial-script"
        ? "file:///other/app.asar/dist/main/index.js"
        : pathToFileURL(
            path.join(root, "resources/app.asar/dist/main/index.js"),
          ).href;
    },
    async evaluate(expression) {
      if (expression.includes(".probe()")) {
        calls.push("probe");
        return {
          classification: "early-arm-probe-not-qualification",
          ready: true,
        };
      }
      if (expression.includes(".probeQuit()")) {
        calls.push("probeQuit");
        await fs.writeFile(
          path.join(root, "quit.json"),
          JSON.stringify({ joined: true }),
        );
      }
      if (expression.includes(".run(")) {
        calls.push("run");
        if (mode === "disconnect")
          throw new Error("Inspector closed during request");
        return { checks: ["controlled"] };
      }
      if (expression.includes(".quit()")) {
        calls.push("quit");
        await fs.writeFile(
          path.join(root, "quit.json"),
          JSON.stringify({ joined: true }),
        );
      }
      return true;
    },
    close() {
      if (mode !== "no-exit") child.emit("exit", 0, null);
      child.stdout.end();
      if (mode !== "no-eof") child.stderr.end();
      if (mode !== "no-close") child.emit("close");
      live = false;
    },
  };
  vi.mocked(cdp.inspector).mockResolvedValue(fake as never);
  await fs.writeFile(
    options,
    JSON.stringify({
      root,
      evidence: root,
      executable: path.join(root, "OMXTerm.exe"),
      asar: path.join(root, "resources/app.asar"),
      archive: path.join(root, "snippets.omxext"),
      archiveSha256: "digest",
      version: "1",
      node: process.execPath,
      electronVersion: "43.8.1",
      entrySha256: createHash("sha256").update("entry-source").digest("hex"),
      earlyLoaderProof: {
        sourceSha256: createHash("sha256")
          .update("verified-loader")
          .digest("hex"),
        lineNumber: 452,
        columnNumber: 8,
      },
      inputMarker: path.join(root, "marker.json"),
    }),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

it("arms the first-entry observer before continuing into the shared campaign and joins normal exit", async () => {
  await runWindowsExactController(options);
  expect(calls.indexOf("arm")).toBeGreaterThan(
    calls.indexOf("Runtime.runIfWaitingForDebugger"),
  );
  expect(calls.lastIndexOf("Debugger.resume")).toBeGreaterThan(
    calls.indexOf("arm"),
  );
  expect(calls.indexOf("run")).toBeGreaterThan(
    calls.lastIndexOf("Debugger.resume"),
  );
  expect(calls.indexOf("quit")).toBeGreaterThan(calls.indexOf("run"));
  const receipt = JSON.parse(
    await fs.readFile(path.join(root, "controller.json"), "utf8"),
  ) as { failures: string[]; stdoutEnded: boolean; stderrEnded: boolean };
  expect(receipt).toMatchObject({
    failures: [],
    stdoutEnded: true,
    stderrEnded: true,
  });
  const spawnOptions = vi.mocked(childProcess.spawn).mock.calls[0]![2];
  expect(spawnOptions?.env?.PATH?.split(path.delimiter)).toContain(
    path.join(root, "System32", "WindowsPowerShell", "v1.0"),
  );
  expect(spawnOptions?.env).not.toHaveProperty("NODE_OPTIONS");
});

it("arms at the verified instantiation pause before a later first executable location", async () => {
  mode = "first-entry";
  await runWindowsExactController(options);
  expect(calls).toContain("Debugger.getPossibleBreakpoints");
  expect(calls.indexOf("arm")).toBeLessThan(
    calls.indexOf("Debugger.removeBreakpoint"),
  );
  expect(calls.indexOf("Debugger.removeBreakpoint")).toBeLessThan(
    calls.indexOf("Debugger.resume"),
  );
});

it("offers a readiness-only probe without running the Snippets campaign", async () => {
  const config = JSON.parse(await fs.readFile(options, "utf8")) as object;
  await fs.writeFile(options, JSON.stringify({ ...config, probe: true }));
  await runWindowsExactController(options);
  expect(calls).toContain("probe");
  expect(calls).toContain("probeQuit");
  expect(calls).not.toContain("run");
  expect(
    JSON.parse(await fs.readFile(path.join(root, "probe.json"), "utf8")),
  ).toMatchObject({
    classification: "early-arm-probe-not-qualification",
    ready: true,
  });
});

it("does not resume an unidentified initial script that could already be a production entry", async () => {
  mode = "unknown-initial-script";
  await expect(runWindowsExactController(options)).rejects.toThrow();
  expect(calls).not.toContain("Debugger.resume");
  expect(calls).not.toContain("arm");
});

it.each([
  "empty-locations",
  "foreign-locations",
  "changed-loader",
  "changed-entry",
  "missing-function-location",
  "missing-module-scope",
  "late-loader-call",
  "missing-loader",
  "wrong-pid",
  "late",
  "late-first",
  "late-window",
  "late-pty",
  "partial-endpoint",
  "disconnect",
  "no-exit",
  "no-eof",
  "no-close",
  "surviving-child",
])(
  "refuses %s instead of converting cleanup into a normal campaign",
  async (selected) => {
    mode = selected;
    await expect(runWindowsExactController(options)).rejects.toThrow(
      "Exact Windows Snippets controller failed",
    );
    const receipt = JSON.parse(
      await fs.readFile(path.join(root, "controller.json"), "utf8"),
    ) as { failures: string[] };
    expect(receipt.failures.length).toBeGreaterThan(0);
    if (["wrong-pid", "late", "late-first"].includes(selected)) {
      expect(calls).not.toContain("arm");
      expect(calls).not.toContain("run");
    }
  },
);
