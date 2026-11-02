// Finite controller of the real packaged executable, supervised by runNativeFixture.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspector, until } from "./packaged-inspector";
import { createWindowsInspectorWorkers } from "./snippets-windows-inspector-workers";
import { spawnFixtureProcess } from "./native-fixture-ownership";
import {
  collectFixtureDescendants,
  fixtureProcesses,
  type FixtureProcess,
} from "./native-fixture-processes";

interface Options {
  root: string;
  evidence: string;
  executable: string;
  asar: string;
  archive: string;
  archiveSha256: string;
  version: string;
  node: string;
  electronVersion: string;
  entrySha256: string;
  earlyLoaderProof: {
    sourceSha256: string;
    lineNumber: number;
    columnNumber: number;
  };
  inputMarker: string;
  probe?: boolean;
  publicCatalog?: boolean;
}
interface Pause {
  reason: string;
  hitBreakpoints: string[];
  callFrames: Array<{
    callFrameId: string;
    functionName?: string;
    functionLocation?: {
      scriptId: string;
      lineNumber: number;
      columnNumber: number;
    };
    scopeChain?: Array<{ type: string }>;
    location: { scriptId: string; lineNumber: number; columnNumber: number };
  }>;
}

// eslint-disable-next-line max-lines-per-function -- One owner keeps paused-entry ordering and actual child settlement together.
export async function runWindowsExactController(optionsFile: string) {
  const options = JSON.parse(await readFile(optionsFile, "utf8")) as Options;
  const { root, evidence, executable, asar } = options;
  const systemRoot = process.env.SystemRoot;
  assert.ok(
    systemRoot && path.isAbsolute(systemRoot),
    "absolute SystemRoot required",
  );
  const env: NodeJS.ProcessEnv = {
    SystemRoot: systemRoot,
    PATH: [
      path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0"),
      path.join(systemRoot, "System32"),
      systemRoot,
    ].join(path.delimiter),
    HOME: path.join(root, "home"),
    USERPROFILE: path.join(root, "home"),
    APPDATA: path.join(root, "appdata"),
    LOCALAPPDATA: path.join(root, "localappdata"),
    TEMP: path.join(root, "temp"),
    TMP: path.join(root, "temp"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_STATE_HOME: path.join(root, "state"),
  };
  const json = (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  const child = spawnFixtureProcess(() => {
    const native = spawn(
      executable,
      [
        "--inspect-brk=127.0.0.1:0",
        `--user-data-dir=${path.join(root, "profile")}`,
        "-e",
        options.node,
        path.join(root, "snippets-windows-probe.cjs"),
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.ok(native.pid, "Packaged native spawn accepted");
    return Object.assign(native, { pid: native.pid });
  });
  const limit = 1024 * 1024;
  let stdout = "",
    stderr = "",
    stdoutEnded = false,
    stderrEnded = false,
    truncated = false,
    closed = false;
  let outcome:
    { code: number | null; signal: NodeJS.Signals | null } | undefined;
  let trackingError: unknown;
  child.on("error", (error) => {
    trackingError ??= error;
  });
  child.on("exit", (code, signal) => {
    outcome = { code, signal };
  });
  child.on("close", () => {
    closed = true;
  });
  child.stdout.on("data", (chunk: Buffer) => {
    if (Buffer.byteLength(stdout) + chunk.length > limit) truncated = true;
    stdout = (stdout + String(chunk)).slice(0, limit);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    if (Buffer.byteLength(stderr) + chunk.length > limit) truncated = true;
    stderr = (stderr + String(chunk)).slice(0, limit);
  });
  child.stdout.on("end", () => {
    stdoutEnded = true;
  });
  child.stderr.on("end", () => {
    stderrEnded = true;
  });
  child.stdout.on("error", (error) => {
    trackingError ??= error;
  });
  child.stderr.on("error", (error) => {
    trackingError ??= error;
  });
  const failures: unknown[] = [];
  const owned = new Map<number, FixtureProcess>();
  let client: Awaited<ReturnType<typeof inspector>> | undefined;
  let armed = false;
  const workers = createWindowsInspectorWorkers(
    pathToFileURL(
      path.join(asar, "node_modules/node-pty/lib/worker/conoutSocketWorker.js"),
    ).href,
    (method, params, timeout) => {
      assert.ok(client, "owned inspector is connected");
      return client.request(method, params, timeout);
    },
  );
  const observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(asar, "package.json"))})(${JSON.stringify(path.join(root, "snippets-windows-exact-observer.cjs"))})`;
  const entryUrl = pathToFileURL(path.join(asar, "dist/main/index.js")).href;
  try {
    const leader = fixtureProcesses().find((row) => row.pid === child.pid);
    assert.ok(
      leader && leader.parent === process.pid && leader.identity,
      "owned main creation identity",
    );
    owned.set(leader.pid, leader);
    const collect = () => {
      const rows = fixtureProcesses();
      collectFixtureDescendants(rows, owned);
      return rows.filter(
        (row) => owned.get(row.pid)?.identity === row.identity,
      );
    };
    const verifyLeader = () => {
      const current = collect().find((row) => row.pid === leader.pid);
      assert.deepEqual(current, leader, "main creation identity changed");
    };
    await json("launch.json", { leader, executable, entryUrl });
    await until(
      () =>
        /Debugger listening on ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+\r?\n/.test(
          stderr,
        ),
      "owned loopback inspector",
    );
    const endpoints = [
      ...stderr.matchAll(
        /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)\r?\n/g,
      ),
    ];
    assert.equal(endpoints.length, 1, "one endpoint from owned child stderr");
    verifyLeader();
    client = await inspector(endpoints[0]![1]!, workers.notification);
    await client.request("Debugger.enable", {}, 5000);
    const bp = (await client.request(
      "Debugger.setBreakpointByUrl",
      { url: entryUrl, lineNumber: 0 },
      5000,
    )) as { breakpointId?: unknown };
    assert.equal(typeof bp.breakpointId, "string");
    await client.request("Runtime.runIfWaitingForDebugger", {}, 5000);
    const pause = (await client.nextEvent("Debugger.paused", 5000)) as Pause;
    const verifyPausePid = async (frame: string) => {
      const reply = (await client!.request(
        "Debugger.evaluateOnCallFrame",
        {
          callFrameId: frame,
          expression: "({pid: process.pid})",
          returnByValue: true,
        },
        5000,
      )) as { result?: { value?: { pid?: unknown } } };
      assert.equal(
        reply.result?.value?.pid,
        leader.pid,
        "inspector endpoint PID mismatch",
      );
      verifyLeader();
    };
    assert.ok(pause.callFrames?.[0]?.callFrameId, "debugger pause frame");
    await verifyPausePid(pause.callFrames[0].callFrameId);
    const frame = pause.callFrames[0]!;
    const location = frame.location;
    const bootUrl = client.scriptUrl(location.scriptId);
    await json("initial-pause.json", { pause, bootUrl, entryUrl });
    assert.equal(
      pause.reason,
      "Break on start",
      "not an initial startup pause",
    );
    assert.deepEqual(pause.hitBreakpoints, [], "already at a later breakpoint");
    assert.equal(bootUrl, entryUrl, "unidentified initial production script");
    assert.deepEqual(location, {
      scriptId: location.scriptId,
      lineNumber: 0,
      columnNumber: 0,
    });
    assert.deepEqual(frame.functionLocation, location, "not the module start");
    assert.ok(
      frame.scopeChain?.some((scope) => scope.type === "module"),
      "module scope missing",
    );
    const possible = (await client.request(
      "Debugger.getPossibleBreakpoints",
      {
        start: { scriptId: location.scriptId, lineNumber: 0, columnNumber: 0 },
      },
      5000,
    )) as {
      locations?: Array<{
        scriptId: string;
        lineNumber: number;
        columnNumber: number;
      }>;
    };
    assert.ok(
      possible.locations?.length,
      "entry executable locations unavailable",
    );
    assert.ok(
      possible.locations.every(
        (item) =>
          item.scriptId === location.scriptId &&
          Number.isSafeInteger(item.lineNumber) &&
          item.lineNumber >= 0 &&
          Number.isSafeInteger(item.columnNumber) &&
          item.columnNumber >= 0,
      ),
      "invalid executable locations",
    );
    const firstExecutable = possible.locations.reduce((first, item) =>
      item.lineNumber < first.lineNumber ||
      (item.lineNumber === first.lineNumber &&
        item.columnNumber < first.columnNumber)
        ? item
        : first,
    );
    const loader = pause.callFrames.find(
      (item) =>
        client!.scriptUrl(item.location.scriptId) ===
        "node:internal/modules/esm/module_job",
    );
    assert.ok(loader, "instantiation loader frame missing");
    assert.equal(loader.functionName, "#asyncInstantiate");
    assert.deepEqual(
      {
        lineNumber: loader.location.lineNumber,
        columnNumber: loader.location.columnNumber,
      },
      {
        lineNumber: options.earlyLoaderProof.lineNumber,
        columnNumber: options.earlyLoaderProof.columnNumber,
      },
      "not the verified pre-evaluation loader call",
    );
    const source = async (scriptId: string) => {
      const response = (await client!.request(
        "Debugger.getScriptSource",
        { scriptId },
        5000,
      )) as { scriptSource?: unknown };
      assert.equal(typeof response.scriptSource, "string");
      return response.scriptSource as string;
    };
    const entrySource = await source(location.scriptId),
      loaderSource = await source(loader.location.scriptId);
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    assert.equal(
      hash(entrySource),
      options.entrySha256,
      "paused entry bytes changed",
    );
    assert.equal(
      hash(loaderSource),
      options.earlyLoaderProof.sourceSha256,
      "unverified runtime loader",
    );
    await writeFile(path.join(evidence, "entry-source.js"), entrySource);
    await writeFile(path.join(evidence, "loader-source.js"), loaderSource);
    await json("entry-pause.json", {
      pause,
      classification: "verified-instantiation-before-evaluation",
      url: bootUrl,
      entryUrl,
      possible,
      firstExecutable,
      entrySha256: hash(entrySource),
      loaderProof: options.earlyLoaderProof,
    });
    await verifyPausePid(frame.callFrameId);
    const reply = (await client.request(
      "Debugger.evaluateOnCallFrame",
      {
        callFrameId: frame.callFrameId,
        expression: `${observer}.arm(${JSON.stringify(options)})`,
        returnByValue: true,
      },
      5000,
    )) as {
      result?: {
        value?: {
          pid?: unknown;
          armed?: unknown;
          windows?: unknown;
          ptys?: unknown;
        };
      };
    };
    const attachment = reply.result?.value;
    assert.deepEqual(
      {
        pid: attachment?.pid,
        armed: attachment?.armed,
        windows: attachment?.windows,
        ptys: attachment?.ptys,
      },
      { pid: leader.pid, armed: true, windows: 0, ptys: 0 },
    );
    armed = true;
    verifyLeader();
    await json("attachment.json", attachment);
    await client.request(
      "Debugger.removeBreakpoint",
      { breakpointId: bp.breakpointId },
      5000,
    );
    await client.request(
      "NodeWorker.enable",
      { waitForDebuggerOnStart: true },
      5000,
    );
    await client.request("Debugger.resume", {}, 5000);
    if (options.probe) {
      await json(
        "probe.json",
        await client.evaluate(`${observer}.probe()`, 120000),
      );
    } else {
      await json(
        "scenario.json",
        await client.evaluate(
          `${observer}.run()`,
          options.publicCatalog === true ? 240000 : 120000,
        ),
      );
    }
    await workers.finish();
    verifyLeader();
    await client.evaluate(
      `${observer}.${options.probe ? "probeQuit" : "quit"}(); true`,
      5000,
    );
    await until(
      async () =>
        (
          await readFile(path.join(evidence, "quit.json"), "utf8").catch(
            () => "",
          )
        ).length > 0,
      "normal Quit receipt",
    );
    const quit = JSON.parse(
      await readFile(path.join(evidence, "quit.json"), "utf8"),
    ) as { joined?: unknown };
    assert.equal(quit.joined, true, "normal PTY/backend Quit");
    client.close();
    client = undefined;
    await until(
      () => closed && stdoutEnded && stderrEnded && collect().length === 0,
      "normal main exit, both EOFs and captured descendant settlement",
      5000,
    );
    assert.deepEqual(outcome, { code: 0, signal: null }, "actual main exit");
    assert.equal(truncated, false, "main output truncated");
    assert.equal(
      [
        ...stderr.matchAll(
          /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)\r?\n/g,
        ),
      ].length,
      1,
      "inspector endpoint changed",
    );
    if (trackingError) throw trackingError;
    assert.equal(collect().length, 0, "captured process still alive");
    await workers.finish();
  } catch (error) {
    failures.push(error);
    if (client && armed) {
      try {
        await json(
          "observer-failure.json",
          await client.evaluate(`${observer}.diagnose()`, 3000),
        );
      } catch (failure) {
        failures.push(failure);
      }
      try {
        await client.evaluate(`${observer}.abort(); true`, 5000);
      } catch (failure) {
        failures.push(failure);
      }
    }
  } finally {
    client?.close();
    try {
      await json("worker-inspector.json", workers.snapshot());
      await json("controller.json", {
        outcome,
        closed,
        stdoutEnded,
        stderrEnded,
        truncated,
        owned: [...owned.values()],
        stdout,
        stderr,
        failures: failures.map(String),
      });
    } finally {
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "Exact Windows Snippets controller failed",
    );
}
