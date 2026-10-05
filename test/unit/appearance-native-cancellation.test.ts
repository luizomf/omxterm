import * as childProcess from "node:child_process";
import * as filesystem from "node:fs/promises";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("joins an appearance test's cancelled active owner before releasing its outer finish hook", async () => {
  // Execute the actual suite callback, preparation and runner. Replace only
  // registration, compilation and the external native-owner transport.
  const entry = path.resolve(
    "test/integration/restty-appearance-rendering.test.ts",
  );
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
  let callback!: (context: unknown) => Promise<void>;
  let root: string | undefined;
  let decode!: (text: string) => unknown;
  let notifyLaunch!: () => void;
  const launched = new Promise<void>((resolve) => {
    notifyLaunch = resolve;
  });
  let notifyCancel!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    notifyCancel = resolve;
  });
  const owner = Object.assign(new EventEmitter(), {
    connected: true,
    send(request: { root: string }) {
      root = request.root;
      notifyLaunch();
    },
    disconnect() {
      this.connected = false;
      notifyCancel();
    },
  });
  const require = createRequire(import.meta.url);
  runInNewContext(
    compiled.outputFiles[0]!.text + "\nreceiveDecoder(JSON.parse);",
    {
      process: { ...process, platform: "linux" },
      Buffer,
      URL,
      console,
      setTimeout,
      clearTimeout,
      receiveDecoder(value: typeof decode) {
        decode = value;
      },
      require(id: string) {
        if (id === "vitest")
          return {
            expect,
            describe: (_name: string, suite: () => void) => suite(),
            it: (_name: string, test: typeof callback) => {
              callback = test;
            },
          };
        if (id === "esbuild") return { build: async () => ({}) };
        if (id === "node:child_process")
          return {
            ...childProcess,
            fork: () => owner,
            spawn: () => {
              throw new Error("Unexpected native launch");
            },
          };
        if (id === "node:path")
          return {
            ...path,
            resolve: (...parts: string[]) =>
              parts[0] === ".scratch/native-fixtures"
                ? path.join(
                    root ?? path.dirname(entry),
                    ".synthetic-appearance-receipts",
                    ...parts.slice(1),
                  )
                : path.resolve(...parts),
          };
        return require(id) as unknown;
      },
    },
  );
  // Allocate the receipt scope outside the delegated profile. It remains
  // independently owned even when the fake supervisor removes that profile.
  const scope = await filesystem.mkdtemp(
    path.resolve(".scratch/appearance-cancellation-"),
  );
  root = scope;
  let released = false;
  const operation = callback({
    signal: controller.signal,
    onTestFinished: (finish: () => Promise<void>) => finalizers.push(finish),
  }).then(
    () => {
      released = true;
      return undefined;
    },
    (error: unknown) => {
      released = true;
      return error;
    },
  );
  try {
    await launched;
    controller.abort(new Error("Controlled outer test cancellation"));
    await cancelled;
    expect(finalizers).toHaveLength(1);
    let finished = false;
    const finishing = finalizers[0]!().then(() => {
      finished = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(released).toBe(false);
    expect(finished).toBe(false);
    expect(existsSync(root!)).toBe(true);
    await filesystem.rm(root!, { recursive: true, force: true });
    owner.emit(
      "message",
      decode(
        JSON.stringify({
          exitCode: null,
          signal: null,
          reason: "interrupted",
          stdout: "",
          stderr: "",
          cleanupErrors: [],
        }),
      ),
    );
    owner.emit("close");
    await finishing;
    const failure = await operation;
    // Settlement preserves cancellation as failure, never a passing result.
    expect(failure).toBeInstanceOf(Error);
    expect(released).toBe(true);
    expect(finished).toBe(true);
    expect(existsSync(root!)).toBe(false);
    expect(finalizers).toHaveLength(1); // no next appearance launch
  } finally {
    controller.abort();
    await filesystem.rm(scope, { recursive: true, force: true });
    if (root !== scope)
      await filesystem.rm(root!, { recursive: true, force: true });
  }
});
