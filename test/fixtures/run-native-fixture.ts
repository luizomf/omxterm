import { execFileSync, fork, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  fixtureProcesses,
  nativeFixtureEnvironment,
} from "./native-fixture-processes";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";

export interface NativeFixtureResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly cleanupErrors: readonly string[];
}

async function runWindowsSupervisor(
  supervisorPath: string,
  request: {
    readonly executable: string;
    readonly args: string[];
    readonly root: string;
    readonly timeout: number;
    readonly evidencePath: string;
  },
): Promise<NativeFixtureResult> {
  const parent = fixtureProcesses().find((row) => row.pid === process.pid);
  if (!parent)
    throw new Error("Cannot establish native fixture parent identity");
  const requestPath = path.join(request.root, "supervisor-request.json");
  // WMI launches under the caller's identity but outside the inherited Node Job.
  // A detached fork alone remains in that Job and dies with the test worker.
  // CREATE_BREAKAWAY_FROM_JOB also avoids inheriting WMI provider Job quotas.
  await writeFile(
    requestPath,
    JSON.stringify({ ...request, parent, externalChild: true }),
  );
  const command = [process.execPath, supervisorPath, requestPath]
    .map((value) => `"${value}"`)
    .join(" ");
  if (
    [process.execPath, supervisorPath, requestPath].some((value) =>
      value.includes('"'),
    )
  )
    throw new Error("Invalid supervisor executable path");
  const encoded = Buffer.from(command).toString("base64");
  const supervisorPid = Number(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
    $ErrorActionPreference = 'Stop'
    $command = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
    $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ CreateFlags = [uint32]16777216 }
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; ProcessStartupInformation = $startup }
    if ($result.ReturnValue -ne 0) { throw ('Native fixture supervisor creation failed: ' + $result.ReturnValue) }
    $result.ProcessId
  `,
      ],
      { timeout: 5_000, windowsHide: true, encoding: "utf8" },
    ),
  );
  if (!Number.isSafeInteger(supervisorPid) || supervisorPid <= 0)
    throw new Error("WMI returned no supervisor process identity");
  const deadline = Date.now() + request.timeout + 15_000;
  let launched = false;
  while (true) {
    try {
      const result = JSON.parse(
        await readFile(request.evidencePath, "utf8"),
      ) as NativeFixtureResult;
      if (result.reason === "supervisor-error")
        throw new Error(
          `Native fixture supervisor failed: ${JSON.stringify(result)}`,
        );
      return result;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof SyntaxError)
      )
        throw error;
      try {
        process.kill(supervisorPid, 0);
      } catch (inspectionError) {
        throw new Error(
          "Native fixture supervisor disappeared without an outcome; profile retained for inspection",
          { cause: inspectionError },
        );
      }
      if (Date.now() >= deadline)
        throw new Error(
          "Native fixture supervisor returned no outcome; profile retained for inspection",
        );
      if (
        !launched &&
        existsSync(path.join(request.root, "supervisor-ready"))
      ) {
        launched = true;
        startWindowsFixture(request);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function startWindowsFixture(request: {
  readonly root: string;
  readonly executable: string;
  readonly args: string[];
}): void {
  // Keep Electron in the caller's desktop/session and environment. Only the
  // cleanup owner runs through WMI; native streams outlive a killed worker.
  const stdout = openSync(path.join(request.root, "native-stdout"), "wx");
  const stderr = openSync(path.join(request.root, "native-stderr"), "wx");
  try {
    const child = spawn(request.executable, request.args, {
      cwd: request.root,
      env: nativeFixtureEnvironment(request.root),
      detached: false,
      stdio: ["ignore", stdout, stderr],
    });
    child.once("error", (error) => {
      appendFileSync(
        path.join(request.root, "native-stderr"),
        `${error.message}\n`,
      );
      writeFileSync(
        path.join(request.root, "native-exit.json"),
        JSON.stringify({ exitCode: null, signal: null, reason: "spawn-error" }),
      );
    });
    child.once("exit", (exitCode, signal) => {
      // The supervisor can already have removed the root after parent loss or
      // timeout. Never recreate it or overwrite its retained mechanical result.
      if (existsSync(request.root))
        writeFileSync(
          path.join(request.root, "native-exit.json"),
          JSON.stringify({ exitCode, signal, reason: "exit" }),
        );
    });
    if (child.pid) {
      const identity = fixtureProcesses().find((row) => row.pid === child.pid);
      if (identity)
        writeFileSync(
          path.join(request.root, "native-process.json"),
          JSON.stringify(identity),
        );
    }
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
}

// The detached supervisor owns both the native tree and the disposable profile.
// IPC disconnect survives a killed Vitest worker, unlike a worker-local timer.
export async function runNativeFixture(options: {
  readonly executable: string;
  readonly args: string[];
  readonly root: string;
  readonly timeout: number;
  readonly evidencePath?: string;
}): Promise<NativeFixtureResult> {
  const supervisorPath = path.join(
    options.root,
    "native-fixture-supervisor.cjs",
  );
  await build({
    entryPoints: [path.resolve("test/fixtures/native-fixture-supervisor.ts")],
    outfile: supervisorPath,
    bundle: true,
    platform: "node",
    format: "cjs",
    logLevel: "silent",
  });
  const request = {
    ...options,
    evidencePath:
      options.evidencePath ??
      path.resolve(".scratch/native-fixtures", `${randomUUID()}.json`),
  };
  if (process.platform === "win32")
    return runWindowsSupervisor(supervisorPath, request);
  const supervisor = fork(supervisorPath, [], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    execArgv: [],
  });
  let diagnostic = "";
  supervisor.stderr?.setEncoding("utf8");
  supervisor.stderr?.on("data", (chunk: string) => {
    diagnostic += chunk;
  });
  return new Promise((resolve, reject) => {
    let result: NativeFixtureResult | undefined;
    supervisor.once("error", reject);
    supervisor.once("message", (message: NativeFixtureResult) => {
      result = message;
    });
    supervisor.once("close", () => {
      if (result) resolve(result);
      else
        reject(
          new Error(
            `Native fixture supervisor returned no result: ${diagnostic}`,
          ),
        );
    });
    supervisor.send(request);
  });
}
