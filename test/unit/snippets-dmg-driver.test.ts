import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { runDmgController } from "../fixtures/snippets-dmg-driver";
import * as inspector from "../fixtures/packaged-inspector";
import * as processes from "../fixtures/native-fixture-processes";
import { spawnFixtureProcess } from "../fixtures/native-fixture-ownership";
vi.mock("node:child_process", { spy: true });
vi.mock("node:fs/promises", { spy: true });
vi.mock("../fixtures/packaged-inspector", { spy: true });
vi.mock("../fixtures/native-fixture-processes", { spy: true });
vi.mock("../fixtures/native-fixture-ownership", { spy: true });
let root: string;
let options: string;
let mode: string;
let inventory: processes.FixtureProcess[];
let inventoryFailure: boolean;
let child: EventEmitter & {
  pid: number;
  stdout: PassThrough;
  stderr: PassThrough;
  unref: ReturnType<typeof vi.fn>;
};
let client: {
  evaluate: Mock<(expression: string, timeout?: number) => Promise<unknown>>;
  close: Mock<() => void>;
};
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "dmg-driver-unit-"));
  options = path.join(root, "options.json");
  mode = "success";
  inventoryFailure = false;
  inventory = [
    { pid: 41, parent: 1, identity: "main-start" },
    { pid: 42, parent: 41, identity: "pty-start" },
  ];
  child = Object.assign(new EventEmitter(), {
    pid: 41,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    unref: vi.fn(),
  });
  vi.mocked(childProcess.spawn).mockReturnValue(child as never);
  vi.mocked(spawnFixtureProcess).mockImplementation((spawn) => spawn());
  vi.mocked(processes.fixtureProcesses).mockImplementation(() => {
    if (inventoryFailure) {
      inventoryFailure = false;
      throw new Error("census failed");
    }
    return inventory;
  });
  // Keep the real collectFixtureDescendants: ownership/conjunction use actual code.
  vi.mocked(inspector.until).mockImplementation(async (check, label) => {
    if (label === "loopback inspector")
      child.stderr.write("Debugger listening on ws://127.0.0.1:1234/abcd\n");
    if (!(await check())) throw new Error("Timed out: " + label);
  });
  client = {
    evaluate: vi.fn(async (expression: string) => {
      if (expression.includes(".run(")) {
        if (mode === "inspector-lost")
          throw new Error("Inspector closed during request");
        if (mode === "tracking-failure") {
          inventoryFailure = true;
          vi.advanceTimersByTime(100);
        }
        return { checks: ["scenario-observed"] };
      }
      if (expression.includes(".quit()") && mode !== "missing-quit")
        await fs.writeFile(
          path.join(root, "quit.json"),
          JSON.stringify({
            joined: mode !== "false-quit",
            baselineExited: mode !== "baseline-live",
          }),
        );
      return {};
    }),
    close: vi.fn(() => {
      if (mode !== "no-exit")
        child.emit("exit", mode === "native-failure" ? 1 : 0, null);
      if (mode !== "unclosed-stream") child.emit("close");
      inventory = mode === "surviving-descendant" ? [inventory[1]!] : [];
    }),
  };
  vi.mocked(inspector.inspector).mockResolvedValue(client);
  await fs.writeFile(
    options,
    JSON.stringify({
      root,
      evidence: root,
      executable: "/sealed/OMXTerm",
      asar: "/sealed/app.asar",
      archive: "/archive",
      archiveSha256: "digest",
      version: "1.0",
      readiness: path.join(root, "shell.json"),
      quartzTool: "/tool.json",
    }),
  );
  await fs.writeFile(
    path.join(root, "shell.json"),
    JSON.stringify({ mainPid: 41, probePid: 42 }),
  );
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
it("joins actual normal Quit, main exit, streams and descendants with sanitized native arguments", async () => {
  await runDmgController(options);
  const result = JSON.parse(
    await fs.readFile(path.join(root, "controller.json"), "utf8"),
  ) as { owned: unknown[] };
  expect(result).toMatchObject({
    outcome: { code: 0, signal: null },
    closed: true,
    failures: [],
  });
  expect(result.owned).toHaveLength(2);
  expect(inspector.until).toHaveBeenCalledWith(
    expect.any(Function),
    "normal main/streams/descendant settlement",
    5000,
  );
  const [executable, args, spawnOptions] = vi.mocked(childProcess.spawn).mock
    .calls[0]!;
  expect(executable).toBe("/sealed/OMXTerm");
  expect(args).toEqual([
    "--inspect=127.0.0.1:0",
    `--user-data-dir=${path.join(root, "profile")}`,
    "-e",
    "/bin/sh",
    path.join(root, "shell.sh"),
    path.join(root, "shell.json"),
  ]);
  expect(spawnOptions).toMatchObject({
    env: {
      HOME: path.join(root, "home"),
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    },
  });
  expect(spawnOptions?.env).not.toHaveProperty("NODE_OPTIONS");
  expect(spawnOptions?.env).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
  expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true);
  expect(child.unref).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  "missing-quit",
  "false-quit",
  "baseline-live",
  "surviving-descendant",
  "unclosed-stream",
  "no-exit",
  "native-failure",
  "tracking-failure",
  "inspector-lost",
])(
  "refuses %s and preserves the actual controller outcome for the outer owner",
  async (selected) => {
    mode = selected;
    await expect(runDmgController(options)).rejects.toThrow(
      "Exact DMG campaign failed",
    );
    const result = JSON.parse(
      await fs.readFile(path.join(root, "controller.json"), "utf8"),
    ) as { failures: unknown[] };
    const expected: Record<string, string> = {
      "missing-quit": "Timed out: normal Quit receipt",
      "false-quit": "false !== true",
      "baseline-live": "false !== true",
      "surviving-descendant":
        "Timed out: normal main/streams/descendant settlement",
      "unclosed-stream": "Timed out: normal main/streams/descendant settlement",
      "no-exit": "Expected values to be strictly deep-equal",
      "native-failure": "Expected values to be strictly deep-equal",
      "tracking-failure": "census failed",
      "inspector-lost": "Inspector closed during request",
    };
    expect(result.failures.map(String).join("\n")).toContain(expected[mode]);
    expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true);
    expect(child.unref).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    if (
      [
        "missing-quit",
        "false-quit",
        "baseline-live",
        "inspector-lost",
      ].includes(mode)
    )
      expect(
        client.evaluate.mock.calls.some(([expression]) =>
          String(expression).includes(".abort()"),
        ),
      ).toBe(true);
  },
);
it("runs the Files observer through the same owned native controller without Quartz or Linux flags", async () => {
  const input = JSON.parse(await fs.readFile(options, "utf8")) as Record<
    string,
    unknown
  >;
  delete input.quartzTool;
  await fs.writeFile(
    options,
    JSON.stringify({
      ...input,
      observer: "files-packaged.cjs",
      macosLifecycle: true,
      files: "/owned/files",
      trashLookup: "/lookup",
    }),
  );
  await runDmgController(options);
  expect(
    client.evaluate.mock.calls.some(
      ([expression]) =>
        expression.includes("files-packaged.cjs") &&
        expression.includes(".run("),
    ),
  ).toBe(true);
  expect(spawnFixtureProcess).toHaveBeenCalledOnce();
  expect(vi.mocked(childProcess.spawn).mock.calls[0]![1]).not.toContain(
    "--no-sandbox",
  );
});

it("preserves inspector attachment failure without claiming a scenario or Quit", async () => {
  vi.mocked(inspector.inspector).mockRejectedValue(
    new Error("attachment failed"),
  );
  await expect(runDmgController(options)).rejects.toThrow(
    "Exact DMG campaign failed",
  );
  expect(client.evaluate).not.toHaveBeenCalled();
  expect(child.unref).toHaveBeenCalledOnce();
});
it("settles controller stream handles even when evidence publication fails", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.writeFile).mockImplementation(async (file, data, options) => {
    if (String(file).endsWith("controller.json"))
      throw new Error("evidence failed");
    return actual.writeFile(file, data, options);
  });
  await expect(runDmgController(options)).rejects.toThrow("evidence failed");
  expect(child.stdout.destroyed && child.stderr.destroyed).toBe(true);
  expect(child.unref).toHaveBeenCalledOnce();
});
