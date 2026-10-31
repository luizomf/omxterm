// Finite controller launched under runNativeFixture, never a replacement app entry.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspector, until } from "./packaged-inspector";
import { spawnFixtureProcess } from "./native-fixture-ownership";
import {
  fixtureProcesses,
  collectFixtureDescendants,
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
  readiness: string;
  quartzTool?: string;
  // The same exact-package controller also owns the bounded Files observer.
  observer?: "files-packaged.cjs";
}
export async function runDmgController(optionsFile: string) {
  const options = JSON.parse(await readFile(optionsFile, "utf8")) as Options;
  const { root, evidence, executable, asar } = options;
  assert.ok(
    options.observer === undefined || options.observer === "files-packaged.cjs",
  );
  const json = (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), JSON.stringify(value, null, 2));
  const env: NodeJS.ProcessEnv = {
    HOME: path.join(root, "home"),
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    XDG_DATA_HOME: path.join(root, "data"),
  };
  for (const key of ["LANG", "USER", "LOGNAME", "TMPDIR"])
    if (process.env[key]) env[key] = process.env[key];
  const child = spawnFixtureProcess(() => {
    const native = spawn(
      executable,
      [
        "--inspect=127.0.0.1:0",
        `--user-data-dir=${path.join(root, "profile")}`,
        "-e",
        "/bin/sh",
        path.join(root, "shell.sh"),
        options.readiness,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.ok(native.pid, "Packaged native spawn accepted");
    return Object.assign(native, { pid: native.pid });
  });
  let stderr = "",
    stdout = "",
    outcome: { code: number | null; signal: NodeJS.Signals | null } | undefined,
    closed = false,
    trackingError: unknown;
  child.on("error", (error) => {
    trackingError ??= error;
  });
  child.on("exit", (code, signal) => {
    outcome = { code, signal };
  });
  child.on("close", () => {
    closed = true;
  });
  child.stdout.on("data", (chunk) => {
    stdout = (stdout + String(chunk)).slice(-65536);
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-65536);
  });
  const owned = new Map<number, FixtureProcess>();
  let client: Awaited<ReturnType<typeof inspector>> | undefined;
  const observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(asar, "package.json"))})(${JSON.stringify(path.join(root, options.observer ?? "snippets-appimage.cjs"))})`;
  const failures: unknown[] = [];
  const collect = () => {
    const rows = fixtureProcesses();
    collectFixtureDescendants(rows, owned);
    return rows.filter((row) => owned.get(row.pid)?.identity === row.identity);
  };
  const monitor = setInterval(() => {
    try {
      collect();
    } catch (error) {
      trackingError ??= error;
    }
  }, 100);
  try {
    const leader = fixtureProcesses().find((row) => row.pid === child.pid);
    assert.ok(leader, "Native main identity acquisition");
    owned.set(leader.pid, leader);
    await json("launch.json", { leader, executable, root });
    await until(
      async () =>
        (await readFile(options.readiness, "utf8").catch(() => "")).length > 0,
      "initial PTY readiness",
    );
    const readiness = JSON.parse(await readFile(options.readiness, "utf8")) as {
      mainPid: number;
      probePid: number;
    };
    const rows = collect();
    assert.equal(readiness.mainPid, leader.pid);
    assert.ok(
      rows.some(
        (row) => row.pid === leader.pid && row.identity === leader.identity,
      ),
    );
    assert.ok(
      rows.some(
        (row) => row.pid === readiness.probePid && row.parent === leader.pid,
      ),
      "Readiness PTY belongs to actual main",
    );
    await until(
      () => /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(stderr),
      "loopback inspector",
    );
    const url =
      /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/.exec(
        stderr,
      )?.[1];
    assert.ok(url);
    client = await inspector(url);
    await json(
      "attachment.json",
      await client.evaluate(
        `${observer}.inspect(${JSON.stringify(options)})`,
        5000,
      ),
    );
    await json(
      "scenario.json",
      await client.evaluate(
        `${observer}.run(${JSON.stringify(options)})`,
        120000,
      ),
    );
    await client.evaluate(`${observer}.quit(); true`, 5000);
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
    ) as { joined: boolean; baselineExited: boolean };
    assert.equal(quit.joined, true);
    assert.equal(quit.baselineExited, true);
    client.close();
    client = undefined;
    await until(
      () => closed && collect().length === 0,
      "normal main/streams/descendant settlement",
      5000,
    );
    assert.deepEqual(outcome, { code: 0, signal: null });
    if (trackingError) throw trackingError;
  } catch (error) {
    failures.push(error);
    if (client) {
      try {
        await json(
          "observer-failure.json",
          await client.evaluate(`${observer}.diagnose()`, 3000),
        );
      } catch (error) {
        failures.push(error);
      }
      try {
        await client.evaluate(`${observer}.abort(); true`, 5000);
      } catch (error) {
        failures.push(error);
      }
    }
  } finally {
    client?.close();
    clearInterval(monitor);
    // No broad kill here: the outer supervisor joins every descendant even on
    // controller cancellation. Profile and Quartz evidence live outside its root.
    try {
      await json("controller.json", {
        outcome,
        closed,
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
    throw new AggregateError(failures, "Exact DMG campaign failed");
}
