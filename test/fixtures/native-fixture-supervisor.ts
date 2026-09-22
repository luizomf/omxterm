import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  nativeFixtureEnvironment,
  fixtureProcesses,
  collectFixtureDescendants,
  terminateFixtureProcesses,
  type FixtureProcess,
} from "./native-fixture-processes";

interface Request {
  readonly executable: string;
  readonly args: string[];
  readonly root: string;
  readonly timeout: number;
  readonly evidencePath: string;
  readonly parent?: FixtureProcess;
  readonly externalChild?: boolean;
}

interface ExternalExit {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: string;
}

function readRecord<T>(root: string, name: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path.join(root, name), "utf8")) as T;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return undefined;
    throw error;
  }
}

async function readNativeOutput(
  root: string,
  name: string,
  launched: boolean,
): Promise<string> {
  try {
    return await readFile(path.join(root, name), "utf8");
  } catch (error) {
    if (!launched && (error as NodeJS.ErrnoException).code === "ENOENT")
      return "";
    throw error;
  }
}

function start(request: Request): void {
  void supervise(request).catch(async (error: unknown) => {
    await mkdir(path.dirname(request.evidencePath), { recursive: true });
    await writeFile(
      request.evidencePath,
      `${JSON.stringify({ reason: "supervisor-error", error: String(error) })}\n`,
      { flag: "wx" },
    );
    if (process.connected) process.disconnect();
    process.exit(1);
  });
}
if (process.argv[2]) {
  const requestPath = process.argv[2];
  void readFile(requestPath, "utf8").then((text) =>
    start(JSON.parse(text) as Request),
  );
} else process.once("message", start);
// An abandoned worker must not take its cleanup owner with it.
process.on("SIGTERM", () => process.emit("disconnect"));
process.on("SIGINT", () => process.emit("disconnect"));

async function supervise(request: Request): Promise<void> {
  const rootIdentity = await lstat(request.root);
  const owned = new Map<number, FixtureProcess>();
  let reason = "exit";
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let resolveEnd: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    resolveEnd = resolve;
  });
  const interrupt = () => {
    reason = "parent-disconnected";
    resolveEnd();
  };
  process.once("disconnect", interrupt);
  const connected = request.parent !== undefined || process.connected;
  if (!connected) {
    interrupt();
  }
  const child =
    connected && !request.externalChild
      ? spawn(request.executable, request.args, {
          cwd: request.root,
          detached: true,
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          env: nativeFixtureEnvironment(request.root),
        })
      : undefined;
  const pipesClosed = child
    ? new Promise<void>((resolve) => child.once("close", () => resolve()))
    : Promise.resolve();
  if (child) {
    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr!.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("message", (message: unknown) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        message.type !== "fixture-interrupted" ||
        !("signal" in message) ||
        (message.signal !== "SIGINT" && message.signal !== "SIGTERM")
      )
        return;
      reason = `fixture-${message.signal}`;
      resolveEnd();
    });
    child.once("error", (error) => {
      reason = "spawn-error";
      stderr += `${error.message}\n`;
      resolveEnd();
    });
    child.once("exit", (code, receivedSignal) => {
      exitCode = code;
      signal = receivedSignal;
      resolveEnd();
    });
  }
  const sample = () => {
    const rows = fixtureProcesses();
    if (
      request.parent &&
      !rows.some(
        (row) =>
          row.pid === request.parent!.pid &&
          row.identity === request.parent!.identity,
      )
    )
      interrupt();
    if (child?.pid && owned.size === 0) {
      const leader = rows.find((row) => row.pid === child.pid);
      if (leader && child.exitCode === null && child.signalCode === null)
        owned.set(leader.pid, leader);
    }
    if (request.externalChild) {
      const leader = readRecord<FixtureProcess>(
        request.root,
        "native-process.json",
      );
      if (leader && owned.size === 0) owned.set(leader.pid, leader);
      const exit = readRecord<ExternalExit>(request.root, "native-exit.json");
      if (exit) {
        exitCode = exit.exitCode;
        signal = exit.signal;
        if (reason === "exit") reason = exit.reason;
        resolveEnd();
      }
    }
    collectFixtureDescendants(rows, owned);
  };
  let inspectionError: string | undefined;
  const inspect = () => {
    try {
      sample();
    } catch (error) {
      inspectionError = String(error);
      reason = "inspection-error";
      resolveEnd();
    }
  };
  inspect();
  const monitor = setInterval(inspect, 500);
  const timeout = setTimeout(() => {
    reason = "timeout";
    resolveEnd();
  }, request.timeout);
  if (request.externalChild)
    await writeFile(path.join(request.root, "supervisor-ready"), "ready\n", {
      flag: "wx",
    });
  await ended;
  clearTimeout(timeout);
  clearInterval(monitor);
  process.removeListener("disconnect", interrupt);
  const cleanupErrors: string[] = inspectionError ? [inspectionError] : [];
  try {
    sample();
    await terminateFixtureProcesses(owned);
    if (request.externalChild) {
      stdout = await readNativeOutput(
        request.root,
        "native-stdout",
        owned.size > 0,
      );
      stderr = await readNativeOutput(
        request.root,
        "native-stderr",
        owned.size > 0,
      );
      const exit = readRecord<ExternalExit>(request.root, "native-exit.json");
      if (exit) {
        exitCode = exit.exitCode;
        signal = exit.signal;
      }
    }
    const currentRoot = await lstat(request.root);
    if (
      currentRoot.dev !== rootIdentity.dev ||
      currentRoot.ino !== rootIdentity.ino ||
      currentRoot.isSymbolicLink()
    )
      throw new Error("Fixture root identity changed; refusing removal");
    await rm(request.root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch (error) {
    cleanupErrors.push(String(error));
  }
  // Preserve the final exit event and buffered diagnostics, without letting an
  // escaped inherited pipe keep the supervisor alive indefinitely.
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    pipesClosed,
    new Promise<void>((resolve) => {
      closeTimer = setTimeout(() => {
        cleanupErrors.push("Fixture streams did not close after cleanup");
        resolve();
      }, 1_000);
    }),
  ]);
  clearTimeout(closeTimer);
  child?.stdout!.destroy();
  child?.stderr!.destroy();
  const result = {
    exitCode,
    signal,
    reason,
    stdout,
    stderr,
    cleanupErrors,
    ownedProcesses: [...owned.values()],
  };
  // Keep the mechanical outcome even when no test worker remains to report it.
  await mkdir(path.dirname(request.evidencePath), { recursive: true });
  await writeFile(
    request.evidencePath,
    `${JSON.stringify(result, null, 2)}\n`,
    { flag: "wx" },
  );
  const status =
    reason === "exit" && exitCode === 0 && cleanupErrors.length === 0 ? 0 : 1;
  if (process.connected) {
    process.send?.(result, () => {
      if (process.connected) process.disconnect();
      process.exit(status);
    });
  } else process.exit(status);
}
