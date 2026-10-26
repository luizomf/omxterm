import { build } from "esbuild";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { recordResttyHostPhase } from "../fixtures/restty-host-phases";

vi.mock("node:fs", { spy: true });
afterEach(() => vi.restoreAllMocks());

it("rejects arbitrary context, phase, status and out-of-range checkpoint values without leaking them", () => {
  const sink = vi.mocked(fs.writeSync).mockImplementation(() => 0);
  for (const checkpoint of [-1, 16, 0.5, NaN, "private path"])
    recordResttyHostPhase("checkpoint-copy", "begin", checkpoint as never);
  recordResttyHostPhase("private terminal payload" as never, "begin");
  recordResttyHostPhase("dom-focus", "private clipboard" as never);
  recordResttyHostPhase("dom-focus", "begin", 0);
  expect(sink).not.toHaveBeenCalled();
  sink.mockImplementation(() => {
    throw new Error("sink unavailable");
  });
  expect(() => recordResttyHostPhase("first-session", "begin")).not.toThrow();
});

it("records actual emitted main app-ready entry/completion around the existing Electron promise", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-host-app-phase-"));
  try {
    await build({
      absWorkingDir: fileURLToPath(new URL("../..", import.meta.url)),
      entryPoints: ["test/fixtures/restty-host-main.ts"],
      bundle: true,
      external: ["electron", "node-pty"],
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(root, "main.cjs"),
    });
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finish!: (code: number) => void;
    const exited = new Promise<number>((resolve) => {
      finish = resolve;
    });
    const app = Object.assign(new EventEmitter(), {
      whenReady: () => ready,
      setPath() {},
      exit: (code: number) => finish(code),
    });
    const stop = new Error(
      "Stop after actual app-ready continuation, before any window",
    );
    const lines: string[] = [];
    const require = createRequire(import.meta.url);
    const nativeFs = require("node:fs") as typeof fs;
    runInNewContext(await readFile(path.join(root, "main.cjs"), "utf8"), {
      __dirname: root,
      Buffer,
      console,
      TextEncoder,
      TextDecoder,
      process: { ...process, argv: [], on() {}, stderr: { write() {} } },
      require(name: string) {
        if (name === "electron")
          return {
            app,
            BrowserWindow: { getAllWindows: () => [] },
            session: {
              defaultSession: {
                setPermissionRequestHandler() {
                  throw stop;
                },
              },
            },
          };
        if (name === "node-pty")
          return {
            spawn() {
              throw new Error("No PTY allowed");
            },
          };
        if (name === "node:fs")
          return {
            ...nativeFs,
            writeSync(_fd: number, text: string) {
              lines.push(text);
            },
          };
        return require(name) as unknown;
      },
    });
    const records = () =>
      lines.map(
        (line) =>
          JSON.parse(line.slice("__OMXTERM_RESTTY_HOST_PHASE__".length)) as {
            phase: string;
            status: string;
          },
      );
    expect(records()).toMatchObject([{ phase: "app-ready", status: "begin" }]);
    release();
    expect(await exited).toBe(1); // Deliberate cut, not acceptance of a native failure.
    expect(records()).toMatchObject([
      { phase: "app-ready", status: "begin" },
      { phase: "app-ready", status: "complete" },
    ]);
    expect(lines).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
