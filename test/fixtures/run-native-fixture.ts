import { execFileSync, fork, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import {
  isNativeFixtureResult,
  readOutcome,
  type NativeFixtureResult,
} from "./native-fixture-outcome";
export type { NativeFixtureResult } from "./native-fixture-outcome";
import { removeFailedFixture } from "./remove-failed-fixture";
import {
  nativeFixtureRecoveryRefusal,
  recoverNativeFixtureReceipt,
} from "./native-fixture-recovery";
import { FIXTURE_PROCESS_DIRECTORY } from "./native-fixture-ownership";
import {
  fixtureProcesses,
  nativeFixtureEnvironment,
} from "./native-fixture-processes";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";
import { finished } from "node:stream/promises";
import type { TestContext } from "vitest";

export type NativeFixtureTestContext = Pick<
  TestContext,
  "signal" | "onTestFinished"
>;

interface NativeFixtureOptions {
  readonly executable: string;
  readonly args: string[];
  readonly root: string;
  readonly timeout: number;
  readonly evidencePath?: string;
  readonly completionFile?: string;
  readonly testContext?: NativeFixtureTestContext;
  // File-only fixture preparation belongs to this same joined operation.
  readonly prepare?: () => Promise<void>;
}

type NativeFixtureRequest = Omit<
  NativeFixtureOptions,
  "testContext" | "evidencePath" | "prepare"
> & {
  readonly evidencePath: string;
  readonly cancellationToken: string;
};

// The receipt directory is the existing runner's coordination scope. Keep the
// first uncertain owner visible across Vitest workers, not only in module state.
const blockedReceipts = new Set<string>();
const scopeInspections = new Map<string, Promise<void>>();

async function inspectReceiptScope(
  blockedPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const previous = scopeInspections.get(blockedPath) ?? Promise.resolve();
  const inspection = previous
    .catch(() => undefined)
    .then(async () => {
      signal?.throwIfAborted();
      const present = await lstat(blockedPath).then(
        () => true,
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw nativeFixtureRecoveryRefusal(
            "stop receipt inspection unavailable",
            blockedPath,
          );
        },
      );
      if (blockedReceipts.has(blockedPath) || present) {
        await recoverNativeFixtureReceipt(blockedPath, signal);
        blockedReceipts.delete(blockedPath);
      }
    });
  scopeInspections.set(blockedPath, inspection);
  try {
    await inspection;
  } finally {
    if (scopeInspections.get(blockedPath) === inspection)
      scopeInspections.delete(blockedPath);
  }
}

class SettledFixtureError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : "Native fixture failed after settlement",
      { cause },
    );
  }
}

function failureAfterOutcome(
  error: unknown,
  result: NativeFixtureResult | undefined,
): unknown {
  return result?.cleanupErrors.length === 0
    ? new SettledFixtureError(error)
    : error;
}

async function runWindowsSupervisor(
  supervisorPath: string,
  request: NativeFixtureRequest,
  signal: AbortSignal | undefined,
  handedOff: () => void,
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
  signal?.throwIfAborted();
  handedOff();
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
  // The supervisor owns the execution deadline. No guessed total cleanup
  // deadline can authorize returning while that owner is still alive.
  let launched = false;
  let failure: unknown;
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation ??= writeFile(
      path.join(request.root, "native-cancel.json"),
      JSON.stringify({ token: request.cancellationToken }),
      { flag: "wx" },
    ).catch((error) => {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" &&
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      )
        failure ??= error;
    });
  };
  const launchIfReady = () => {
    if (
      launched ||
      cancellation ||
      signal?.aborted ||
      !existsSync(path.join(request.root, "supervisor-ready"))
    )
      return;
    launched = true;
    try {
      startWindowsFixture(request);
    } catch (error) {
      failure ??= error;
      cancel();
    }
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    while (true) {
      let result: NativeFixtureResult | undefined;
      try {
        result = await readOutcome(request.evidencePath);
      } catch (error) {
        failure ??= error;
        cancel();
      }
      let disappeared = false;
      try {
        process.kill(supervisorPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH")
          disappeared = true;
        else {
          failure ??= error;
          cancel();
        }
      }
      if (disappeared) {
        // Publication may follow the initial missing read. Never infer success
        // from a completed file while its cleanup owner is still alive.
        const finalResult = await readOutcome(request.evidencePath);
        if (failure) throw failureAfterOutcome(failure, finalResult);
        if (finalResult) return finalResult;
        throw new Error(
          "Native fixture supervisor disappeared without an outcome; profile retained for inspection",
        );
      }
      if (!result) launchIfReady();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await cancellation;
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
    // Write ahead of the interruptible native call. Only creation identity or
    // the child's actual failed/completed launch event settles this evidence.
    writeFileSync(
      path.join(request.root, "native-bootstrap-pending"),
      "pending\n",
      {
        flag: "wx",
      },
    );
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

async function prepareSupervisor(
  request: NativeFixtureRequest,
  testContext: NativeFixtureTestContext | undefined,
  prepare: (() => Promise<void>) | undefined,
) {
  testContext?.signal.throwIfAborted();
  const identity = await lstat(request.root);
  if (
    !identity.isDirectory() ||
    identity.isSymbolicLink() ||
    existsSync(path.join(request.root, FIXTURE_PROCESS_DIRECTORY))
  )
    throw new Error(
      "Fixture profile is not a fresh unhanded directory; refusing preparation or removal",
    );
  const unchanged = async () => {
    const current = await lstat(request.root);
    if (
      current.dev !== identity.dev ||
      current.ino !== identity.ino ||
      current.isSymbolicLink()
    )
      throw new Error(
        "Fixture root identity changed; refusing preparation cleanup or handoff",
      );
  };
  let registered = false;
  const cleanup = async (error: unknown): Promise<never> => {
    // All started file writers have settled. This closure remains responsible
    // through caller resumption and Windows request publication until handoff.
    try {
      await unchanged();
      if (
        !registered &&
        existsSync(path.join(request.root, FIXTURE_PROCESS_DIRECTORY))
      )
        throw new Error(
          "Fixture ownership changed; refusing preparation cleanup",
        );
    } catch (inspectionError) {
      if ((inspectionError as NodeJS.ErrnoException).code === "ENOENT")
        throw error;
      throw new AggregateError(
        [error, inspectionError],
        "Fixture preparation and profile identity inspection failed",
        { cause: error },
      );
    }
    return removeFailedFixture(request.root, error);
  };
  try {
    testContext?.signal.throwIfAborted();
    await prepare?.();
    testContext?.signal.throwIfAborted();
    await unchanged();
    testContext?.signal.throwIfAborted();
    await mkdir(path.join(request.root, FIXTURE_PROCESS_DIRECTORY));
    registered = true;
    testContext?.signal.throwIfAborted();
    const supervisorPath = path.join(
      request.root,
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
    testContext?.signal.throwIfAborted();
    await unchanged();
    testContext?.signal.throwIfAborted();
    return { supervisorPath, cleanup };
  } catch (error) {
    return cleanup(error);
  }
}

// The detached supervisor owns both the native tree and the disposable profile.
// Joining is separate from the child execution deadline: cancellation must not
// let a timed-out test or a continuation loop release a still-owned desktop.
export function runNativeFixture(
  options: NativeFixtureOptions,
): Promise<NativeFixtureResult> {
  const { testContext, prepare, ...nativeOptions } = options;
  const request: NativeFixtureRequest = {
    ...nativeOptions,
    evidencePath:
      options.evidencePath ??
      path.resolve(".scratch/native-fixtures", `${randomUUID()}.json`),
    cancellationToken: randomUUID(),
  };
  const blockedPath = path.resolve(
    path.dirname(request.evidencePath),
    "ownership-blocked.json",
  );
  let handedOff = false;
  const blockUncertainOwner = async () => {
    blockedReceipts.add(blockedPath);
    try {
      await mkdir(path.dirname(blockedPath), { recursive: true });
      await writeFile(
        blockedPath,
        JSON.stringify({
          root: request.root,
          evidencePath: request.evidencePath,
        }) + "\n",
        { flag: "wx" },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        // Without a durable stop receipt, releasing this operation could allow
        // a fresh Vitest worker to launch over an uncertain native owner.
        process.stderr.write(
          "Native fixture ownership unresolved; cannot publish stop receipt\n",
        );
        await new Promise<never>(() => {});
      }
    }
  };
  const operation = (async () => {
    await inspectReceiptScope(blockedPath, testContext?.signal);
    testContext?.signal.throwIfAborted();
    const prepared = await prepareSupervisor(request, testContext, prepare);
    try {
      testContext?.signal.throwIfAborted();
      let result: NativeFixtureResult;
      if (process.platform === "win32")
        result = await runWindowsSupervisor(
          prepared.supervisorPath,
          request,
          testContext?.signal,
          () => {
            handedOff = true;
          },
        );
      else {
        handedOff = true;
        const supervisor = fork(prepared.supervisorPath, [], {
          detached: true,
          stdio: ["ignore", "ignore", "pipe", "ipc"],
          execArgv: [],
        });
        let diagnostic = "";
        supervisor.stderr?.setEncoding("utf8");
        supervisor.stderr?.on("data", (chunk: string) => {
          diagnostic += chunk;
        });
        const cancel = () => {
          if (supervisor.connected) supervisor.disconnect();
        };
        try {
          result = await new Promise<NativeFixtureResult>((resolve, reject) => {
            let received: unknown;
            let transportError: unknown;
            supervisor.once("error", (error) => {
              transportError = error;
              cancel();
            });
            supervisor.once("message", (message: unknown) => {
              received = message;
            });
            let exited = false;
            let drained = !supervisor.stderr;
            let settling = false;
            const settle = () => {
              if (!exited || !drained || settling) return;
              settling = true;
              void (async () => {
                // Cancellation deliberately uses the existing disconnect path;
                // its settled result remains in the authoritative journal.
                const finalResult = isNativeFixtureResult(received)
                  ? received
                  : await readOutcome(request.evidencePath);
                if (transportError)
                  throw failureAfterOutcome(transportError, finalResult);
                if (finalResult) return finalResult;
                throw new Error(
                  `Native fixture supervisor returned no result: ${diagnostic}`,
                );
              })().then(resolve, reject);
            };
            // A caller-initiated IPC disconnect can leave ChildProcess's
            // composite close counter incomplete. Join actual process exit and
            // the owned stderr stream, not that bookkeeping event alone.
            supervisor.once("exit", () => {
              exited = true;
              settle();
            });
            supervisor.once("close", () => {
              exited = true;
              settle();
            });
            if (supervisor.stderr)
              void finished(supervisor.stderr, { cleanup: true }).then(
                () => {
                  drained = true;
                  settle();
                },
                (error) => {
                  transportError = error;
                  drained = true;
                  cancel();
                  settle();
                },
              );
            try {
              supervisor.send(request, (error) => {
                if (error) {
                  transportError = error;
                  cancel();
                }
              });
            } catch (error) {
              transportError = error;
              cancel();
            }
            testContext?.signal.addEventListener("abort", cancel, {
              once: true,
            });
            if (testContext?.signal.aborted) cancel();
          });
        } finally {
          testContext?.signal.removeEventListener("abort", cancel);
        }
      }
      if (result.cleanupErrors.length !== 0) await blockUncertainOwner();
      return result;
    } catch (error) {
      if (!handedOff) return prepared.cleanup(error);
      if (!(error instanceof SettledFixtureError)) await blockUncertainOwner();
      throw error;
    }
  })();
  if (testContext && !testContext.signal.aborted)
    testContext.onTestFinished(async () => {
      await operation.catch(() => undefined);
    }, 0);
  return operation;
}
