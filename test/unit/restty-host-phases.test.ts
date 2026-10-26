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
import {
  recordResttyHostPhase,
  recordOutputRefitProgress,
  recordOutputRefitBoundary,
} from "../fixtures/restty-host-phases";

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

it("bounds refit progress to fixed numeric metadata and never substitutes diagnostic sink success", () => {
  const sink = vi
    .mocked(fs.writeSync)
    .mockClear()
    .mockImplementation(() => 0);
  const progress = {
    sourceBytes: 65_698,
    checkpoints: 0,
    cumulativeAck: 65_698,
    pendingBytes: 0,
    pauseCount: 1,
    resumeCount: 1,
    privatePayload: "never publish",
  };
  recordOutputRefitProgress("private text" as never, progress);
  recordOutputRefitProgress("continuation-output", undefined);
  recordOutputRefitProgress("resize-failure", undefined);
  recordOutputRefitProgress("continuation-output", {
    ...progress,
    pendingBytes: NaN,
  });
  recordOutputRefitProgress(
    "resize-failure",
    progress,
    undefined,
    "private error" as never,
  );
  expect(sink).not.toHaveBeenCalled();
  recordOutputRefitProgress("continuation-output", progress);
  expect(String(sink.mock.calls[0]![1])).not.toContain("never publish");
  expect(String(sink.mock.calls[0]![1]).length).toBeLessThan(512);
  sink.mockImplementation(() => {
    throw new Error("sink unavailable");
  });
  expect(() =>
    recordOutputRefitProgress("continuation-failure", progress),
  ).not.toThrow();
});

it("validates the fixed width/grid boundary schema without leaking extra context or sink errors", () => {
  const sink = vi
    .mocked(fs.writeSync)
    .mockClear()
    .mockImplementation(() => 0);
  const boundary = {
    countBefore: 3,
    requestCount: 4,
    expectedCols: 60,
    expectedRows: 24,
    latestRequestedCols: 59,
    latestRequestedRows: 24,
    privateError: "never publish",
  };
  recordOutputRefitBoundary("private phase" as never, boundary);
  recordOutputRefitBoundary("width-enter", boundary, "fulfilled");
  recordOutputRefitBoundary(
    "width-settled",
    boundary,
    "private error" as never,
  );
  recordOutputRefitBoundary("grid-first", boundary, "false" as never);
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    recordOutputRefitBoundary("width-enter", {
      ...boundary,
      requestCount: invalid,
    });
  expect(sink).not.toHaveBeenCalled();
  recordOutputRefitBoundary("width-enter", boundary);
  recordOutputRefitBoundary("width-settled", boundary, "rejected");
  recordOutputRefitBoundary("grid-first", boundary, false);
  const records = sink.mock.calls.map(
    ([, value]) =>
      JSON.parse(
        String(value).slice("__OMXTERM_OUTPUT_REFIT_PROGRESS__".length),
      ) as Record<string, unknown>,
  );
  expect(
    records.map(({ phase, outcome, predicate }) => [phase, outcome, predicate]),
  ).toEqual([
    ["width-enter", undefined, undefined],
    ["width-settled", "rejected", undefined],
    ["grid-first", undefined, false],
  ]);
  expect(
    sink.mock.calls.every(
      ([, value]) =>
        String(value).length < 512 && !String(value).includes("never publish"),
    ),
  ).toBe(true);
  sink.mockImplementation(() => {
    throw Error("closed sink");
  });
  expect(() =>
    recordOutputRefitBoundary("width-settled", boundary, "fulfilled"),
  ).not.toThrow();
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
