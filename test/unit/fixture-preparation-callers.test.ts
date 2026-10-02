import * as childProcess from "node:child_process";
import * as filesystem from "node:fs/promises";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import * as module from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { expect, it } from "vitest";

// As in supported-fixture-launch.test.ts, execute the actual entry/callback;
// replace only the external test registrar, builder and process boundaries.
const callers = [
  "restty-background-rendering",
  "restty-cursor-rendering",
  "restty-hover-readiness",
  "macos-window-blur",
];
it.each(callers)(
  "%s removes its owned root when setup fails before API delegation",
  async (name) => {
    const observation = await observeCaller(name, "setup failure");
    expect(observation.removed).toBe(true);
    expect(observation.removalAttempts).toBe(1);
    expect(observation.nativeRequests).toBe(0);
  },
);

it.each(callers)(
  "%s leaves a transferred profile with the supervisor after an uncertain launch",
  async (name) => {
    const observation = await observeCaller(name, "supervisor failure", true);
    expect(observation.failure).toBe(observation.setupFailure);
    expect(observation.removed).toBe(false);
    expect(observation.removalAttempts).toBe(0);
    expect(observation.nativeRequests).toBe(1);
  },
);

it.each(callers)(
  "%s preserves setup and removal errors when its unlaunched root cannot be removed",
  async (name) => {
    const observation = await observeCaller(name, "setup failure", true);
    const aggregate = observation.failure as AggregateError;
    expect(aggregate.name).toBe("AggregateError");
    expect(aggregate.cause).toBe(observation.setupFailure);
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(observation.setupFailure);
    expect(aggregate.errors[1]).toBe(observation.cleanupFailure);
    expect(observation.removed).toBe(false);
    expect(observation.removalAttempts).toBe(1);
    expect(observation.nativeRequests).toBe(0);
  },
);

it.each([false, true])(
  "hover preserves a failed builder and cleanup uncertainty (removal failure: %s)",
  async (removalFails) => {
    const observed = await observeCaller(
      "restty-hover-readiness",
      "build failure",
      removalFails,
    );
    expect(observed.nativeRequests).toBe(0);
    expect(observed.removalAttempts).toBe(1);
    expect(observed.removed).toBe(!removalFails);
    if (removalFails) {
      const aggregate = observed.failure as AggregateError;
      expect(aggregate.cause).toBe(observed.setupFailure);
      expect(aggregate.errors).toEqual([
        observed.setupFailure,
        observed.cleanupFailure,
      ]);
    } else expect(observed.failure).toBe(observed.setupFailure);
  },
);

it.each(["restty-cursor-rendering", "window-chrome"])(
  "%s prevents behavior preparation/launch after discovery settles on an ended context",
  async (name) => {
    const observed = await observeCaller(name, "phase abort");
    expect(observed.failure).toBe(observed.setupFailure);
    expect(observed.nativeRequests).toBe(1);
    expect(observed.preparedRoots).toHaveLength(1);
    expect(observed.finishHooks).toBe(1);
    expect(observed.roots).toHaveLength(1);
    expect(observed.removalAttempts).toBe(0);
  },
);

const contextualCallers = [
  "restty-cursor-rendering",
  "window-chrome",
  "restty-scrollback-rendering",
  "restty-hover-readiness",
  "restty-host-integration",
  "restty-host-oracles",
];
it.each(contextualCallers)(
  "%s cleans up its own allocation if context closes before API delegation",
  async (name) => {
    const observed = await observeCaller(name, "allocation abort");
    expect(observed.failure).toBe(observed.setupFailure);
    expect(observed.nativeRequests).toBe(0);
    expect(observed.preparedRoots).toHaveLength(0);
    expect(observed.finishHooks).toBe(0);
    expect(observed.roots).toHaveLength(1);
    expect(observed.removalAttempts).toBe(1);
    expect(observed.removed).toBe(true);
  },
);

it.each(contextualCallers)(
  "%s cannot prepare or launch from an already closed context",
  async (name) => {
    const observed = await observeCaller(name, "entry abort");
    expect(observed.failure).toBe(observed.setupFailure);
    expect(observed.nativeRequests).toBe(0);
    expect(observed.preparedRoots).toHaveLength(0);
    expect(observed.finishHooks).toBe(0);
    expect(observed.roots).toHaveLength(0);
    expect(observed.removalAttempts).toBe(0);
  },
);
it.each(
  [
    { name: "restty-scrollback-rendering", index: 1 },
    { name: "restty-host-integration", index: 1 },
    { name: "restty-host-integration", index: 2 },
    { name: "restty-host-integration", index: 3 },
  ].flatMap((callback) =>
    ["entry abort", "allocation abort"].map((mode) => ({
      ...callback,
      mode: mode as "entry abort" | "allocation abort",
    })),
  ),
)(
  "$name callback $index owns its allocation at $mode",
  async ({ name, index, mode }) => {
    const observed = await observeCaller(name, mode, false, index);
    expect(observed.failure).toBe(observed.setupFailure);
    expect(observed.nativeRequests).toBe(0);
    expect(observed.preparedRoots).toHaveLength(0);
    expect(observed.finishHooks).toBe(0);
    expect(observed.roots).toHaveLength(mode === "entry abort" ? 0 : 1);
    expect(observed.removalAttempts).toBe(mode === "entry abort" ? 0 : 1);
    expect(observed.removed).toBe(true);
  },
);

it.each([
  "window-chrome",
  "restty-scrollback-rendering",
  "restty-host-integration",
  "restty-host-oracles",
])(
  "%s preserves the handed-off profile after uncertain launch",
  async (name) => {
    const observed = await observeCaller(name, "supervisor failure", true);
    expect(observed.failure).toBe(observed.setupFailure);
    expect(observed.nativeRequests).toBe(1);
    expect(observed.removalAttempts).toBe(0);
    expect(observed.removed).toBe(false);
  },
);

it("native discovery controls cannot launch the next loop iteration after context closure", async () => {
  const observed = await observeCaller(
    "native-window-observation",
    "loop abort",
  );
  expect(observed.failure).toBeInstanceOf(Error);
  expect(observed.nativeRequests).toBe(1);
  expect(observed.preparedRoots).toHaveLength(1);
  expect(observed.finishHooks).toBe(1);
  expect(observed.roots).toHaveLength(1);
  expect(observed.removalAttempts).toBe(0);
});

async function observeCaller(
  name: string,
  failure:
    | "setup failure"
    | "supervisor failure"
    | "build failure"
    | "phase abort"
    | "loop abort"
    | "entry abort"
    | "allocation abort",
  removalFails = false,
  selectedCase?: number,
) {
  const entry = path.resolve(`test/integration/${name}.test.ts`);
  const compiled = await build({
    entryPoints: [entry],
    bundle: true,
    packages: "external",
    platform: "node",
    format: "cjs",
    write: false,
    define: { "import.meta.url": JSON.stringify(pathToFileURL(entry).href) },
  });
  const controller = new AbortController();
  const finalizers: (() => Promise<void>)[] = [];
  const context = {
    signal: controller.signal,
    onTestFinished: (finish: () => Promise<void>) => finalizers.push(finish),
  };
  const cases: (() => Promise<void>)[] = [];
  const register = (
    _name: string,
    test: (testContext: typeof context) => Promise<void>,
  ) => cases.push(() => test(context));
  const require = module.createRequire(import.meta.url);
  const stopped = new Error("Controlled external boundary failure");
  const cleanupFailure = new Error("Controlled owned-root removal failure");
  let root: string | undefined;
  const roots: string[] = [];
  const preparedRoots = new Set<string>();
  let nativeRequests = 0;
  let removalAttempts = 0;
  let decodePortResult!: (serialized: string) => unknown;
  runInNewContext(
    compiled.outputFiles[0]!.text + "\nreceiveDecoder(JSON.parse);",
    {
      receiveDecoder: (decode: (serialized: string) => unknown) => {
        decodePortResult = decode;
      },
      process: { ...process, platform: "linux" },
      Buffer,
      URL,
      TextEncoder,
      console,
      setTimeout,
      clearTimeout,
      require(id: string) {
        if (id === "vitest")
          return {
            expect,
            describe: Object.assign(
              (_label: string, suite: () => void) => suite(),
              {
                skipIf: () => (_label: string, suite: () => void) => suite(),
              },
            ),
            it: Object.assign(register, {
              // Exercise the macOS-only callback's ownership seam without launching
              // native processes or compiling its addon on the host.
              skipIf: () => register,
              for:
                (values: unknown[]) =>
                (
                  label: string,
                  _options: unknown,
                  test: (
                    value: unknown,
                    testContext: typeof context,
                  ) => Promise<void>,
                ) =>
                  values.forEach((value) =>
                    register(label, (testContext) => test(value, testContext)),
                  ),
              each:
                (values: unknown[]) =>
                (label: string, test: (value: unknown) => Promise<void>) =>
                  values.forEach((value) => register(label, () => test(value))),
            }),
          };
        if (id === "esbuild")
          return {
            build: async () => {
              preparedRoots.add(root!);
              if (failure === "build failure") throw stopped;
              return {};
            },
          };
        if (id === "node:fs/promises")
          return {
            ...filesystem,
            rm: async (...args: Parameters<typeof filesystem.rm>) => {
              if (args[0] === root) {
                removalAttempts += 1;
                if (removalFails) throw cleanupFailure;
              }
              return filesystem.rm(...args);
            },
            mkdtemp: async (...args: Parameters<typeof filesystem.mkdtemp>) => {
              root = (await filesystem.mkdtemp(...args)) as string;
              roots.push(root);
              if (failure === "allocation abort") controller.abort(stopped);
              return root;
            },
          };
        if (id === "node:path")
          return {
            ...path,
            resolve: (...args: string[]) =>
              args[0] === ".scratch/native-fixtures"
                ? path.resolve(root!, "synthetic-receipts", ...args.slice(1))
                : path.resolve(...args),
          };
        if (id === "node:module")
          return {
            ...module,
            createRequire: () => (target: string) => {
              if (target === "electron" && failure === "setup failure")
                throw stopped;
              return require(target) as unknown;
            },
          };
        if (id === "node:child_process")
          return {
            ...childProcess,
            spawn: () => {
              throw new Error("Unexpected native spawn");
            },
            execFile: () => {
              throw new Error("Unexpected native command");
            },
            fork: () =>
              Object.assign(new EventEmitter(), {
                connected: false,
                send(
                  this: EventEmitter,
                  request: { root: string; args: string[] },
                ) {
                  nativeRequests += 1;
                  if (
                    (failure === "phase abort" || failure === "loop abort") &&
                    request.args.some((value) =>
                      value.startsWith("--observation-kind="),
                    )
                  ) {
                    void settleObservation(this, request);
                    return;
                  }
                  // A send error is not settlement. Model the actual failed owner
                  // closing afterward; no native process was created by this port.
                  queueMicrotask(() => this.emit("close"));
                  throw stopped;
                },
              }),
          };
        return require(id) as unknown;
      },
    },
  );
  async function settleObservation(
    owner: EventEmitter,
    request: { root: string; args: string[] },
  ) {
    const argument = (name: string) =>
      request.args
        .find((value) => value.startsWith(`--observation-${name}=`))!
        .split("=")[1]!;
    const kind = argument("kind");
    const observations = (
      kind === "cursor" ? ["framed"] : ["framed", "app"]
    ).flatMap((recipe) =>
      (kind === "cursor"
        ? ["minimize", "restore"]
        : ["maximize", "restore"]
      ).map((action) => ({
        recipe,
        action,
        outcome: "observed",
        elapsedMs: 10,
      })),
    );
    const stdout =
      failure === "loop abort"
        ? "__OMXTERM_NATIVE_WINDOW_CONTROL__error\n"
        : `__OMXTERM_NATIVE_WINDOW__${JSON.stringify({ version: 1, id: argument("id"), kind, platform: "linux", dpr: kind === "cursor" ? 1 : 0, budgetMs: 25000, observations })}\n`;
    await filesystem.rm(request.root, { recursive: true, force: true });
    // Real IPC deserializes in the receiving realm; don't inject foreign Array
    // prototypes into the strict actual observation parser.
    owner.emit(
      "message",
      decodePortResult(
        JSON.stringify({
          exitCode: failure === "loop abort" ? 1 : 0,
          signal: null,
          reason: "exit",
          stdout,
          stderr: "",
          cleanupErrors: [],
        }),
      ),
    );
    controller.abort(stopped);
    owner.emit("close");
  }
  try {
    expect(cases.length).toBeGreaterThan(0);
    if (failure === "entry abort") controller.abort(stopped);
    const selected =
      selectedCase ??
      (failure === "phase abort" && name === "restty-cursor-rendering" ? 2 : 0);
    const observedFailure: unknown = await cases[selected]!().catch(
      (error: unknown) => error,
    );
    if (!removalFails && failure !== "loop abort")
      expect(observedFailure).toBe(stopped);
    return {
      removed: root === undefined || !existsSync(root),
      roots,
      preparedRoots: [...preparedRoots],
      finishHooks: finalizers.length,
      nativeRequests,
      removalAttempts,
      failure: observedFailure,
      setupFailure: stopped,
      cleanupFailure,
    };
  } finally {
    controller.abort();
    await Promise.all(finalizers.map((finish) => finish()));
    await Promise.all(
      roots.map((profile) =>
        filesystem.rm(profile, { recursive: true, force: true }),
      ),
    );
  }
}
