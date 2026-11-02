import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const localRequire = createRequire(import.meta.url);
const parentFile = "parent-pty-diagnostic.jsonl";
function setup(evidence: string, diagnostic: boolean) {
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    getVersion: () => "1",
    getAppPath: () => "/stage/app.asar",
    quit() {},
  });
  const electron = {
    app,
    ipcMain: new EventEmitter(),
    dialog: {},
    BrowserWindow: { getAllWindows: () => [] },
    webContents: {},
  };
  class Terminal extends EventEmitter {
    pid = 0;
    calls: string[] = [];
    constructor() {
      super();
      this._forwardEvents();
    }
    _forwardEvents() {}
    write(text: string) {
      // This is the original PTY method: evidence must already exist here.
      if (diagnostic) {
        const rows = readFileSync(path.join(evidence, parentFile), "utf8");
        expect(rows).toContain("pty-write");
      }
      this.calls.push(text);
      return "forwarded";
    }
    onData(listener: (text: string) => void) {
      this.on("data", listener);
      return { dispose: () => this.off("data", listener) };
    }
    onExit(listener: () => void) {
      this.on("exit", listener);
      return { dispose: () => this.off("exit", listener) };
    }
  }
  const moduleApi = {
    createRequire: () => () => ({ Terminal }),
    syncBuiltinESMExports() {},
  };
  function load(file: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, unknown> };
    const factory = runInNewContext(
      `(function(module, require) {\n${readFileSync(file, "utf8")}\n})`,
      {
        Buffer,
        process: {
          platform: "win32",
          arch: "arm64",
          pid: 41,
          execPath: "/stage/app.exe",
          versions: { electron: "43" },
        },
      },
    ) as (module: object, require: (name: string) => unknown) => void;
    factory(module, (name: string) =>
      Object.hasOwn(modules, name)
        ? modules[name]
        : (localRequire(name) as unknown),
    );
    return module.exports;
  }
  const observation = load("test/fixtures/snippets-observer.cjs", {
    electron,
    "node:module": moduleApi,
    "node:child_process": { fork() {} },
    "./snippets-windows-cpr.cjs": localRequire(
      "../fixtures/snippets-windows-cpr.cjs",
    ) as unknown,
  });
  let selected:
    { ptys: Array<{ writes: string[]; output: string }> } | undefined;
  const trackedObservation = {
    observe(options: object, packageRequire: (name: string) => unknown) {
      selected = (
        observation.observe as (
          options: object,
          packageRequire: (name: string) => unknown,
        ) => typeof selected
      )(options, packageRequire);
      return selected;
    },
  };
  const observer = load("test/fixtures/snippets-windows-exact-observer.cjs", {
    electron,
    "node:module": moduleApi,
    "./snippets-observer.cjs": trackedObservation,
    "./snippets-windows-readiness.cjs": {
      startWindowsProbeReadiness: () => ({ dispose() {} }),
    },
    "./snippets-scenario.cjs": { runScenario() {} },
    "./snippets-windows-parser.cjs": { createInputHandler() {} },
    "./fixture-processes.cjs": { fixtureProcesses: () => [] },
    "./snippets-child-input-diagnostic.cjs": localRequire(
      "../fixtures/snippets-child-input-diagnostic.cjs",
    ) as unknown,
  }) as { arm(options: object): void; abort(): void };
  observer.arm({
    version: "1",
    asar: "/stage/app.asar",
    executable: "/stage/app.exe",
    electronVersion: "43",
    evidence,
    publicCatalog: true,
    publicChildInputDiagnostic: diagnostic,
  });
  return {
    Terminal,
    selected: () => selected!,
    cleanup() {
      observer.abort();
      app.emit("will-quit");
    },
  };
}

it("persists attachment, prior output and attempted write before the original call without scenario finalization", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-pty-"));
  try {
    const { Terminal, selected, cleanup } = setup(evidence, true);
    const terminal = new Terminal();
    terminal.emit("data", "startup\u001b[c");
    terminal.pid = 9384;
    expect(terminal.write("\u001b[[C")).toBe("forwarded");
    const rows = readFileSync(path.join(evidence, parentFile), "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows.map((row) => row.kind)).toEqual([
      "start",
      "pty-attached",
      "pty-output",
      "pty-write",
    ]);
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
    expect(
      rows.every(
        (row) =>
          typeof row.utc === "string" && !Number.isNaN(Date.parse(row.utc)),
      ),
    ).toBe(true);
    expect(
      rows.every(
        (row, index) =>
          index === 0 ||
          BigInt(row.monotonicNs as string) >=
            BigInt(rows[index - 1]!.monotonicNs as string),
      ),
    ).toBe(true);
    expect(rows[1]).toMatchObject({ ptyIndex: 0, pid: 0, pidKnown: false });
    expect(rows[3]).toMatchObject({
      ptyIndex: 0,
      pid: 9384,
      pidKnown: true,
      boundary: "pre-call-write",
      encoding: "utf16le-base64",
      data: Buffer.from("\u001b[[C", "utf16le").toString("base64"),
    });
    expect(terminal.calls).toEqual(["\u001b[[C"]);
    expect(selected().ptys[0]).toMatchObject({
      writes: ["\u001b[[C"],
      output: "startup\u001b[c",
    });
    cleanup();
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("keeps child and parent journals separate in the same evidence directory", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "paired-pty-"));
  try {
    const helper = localRequire(
      "../fixtures/snippets-child-input-diagnostic.cjs",
    ) as {
      startChildInputDiagnostic(directory: string): {
        input(chunk: Buffer, before: number): void;
        close(code: number): void;
      };
      startParentPtyDiagnostic(directory: string): {
        trace(event: object): void;
        close(): void;
      };
    };
    const child = helper.startChildInputDiagnostic(evidence);
    const parent = helper.startParentPtyDiagnostic(evidence);
    child.input(Buffer.from("child"), 0);
    parent.trace({ kind: "pty-write", ptyIndex: 0, pid: 4, data: "parent" });
    child.close(0);
    parent.close();
    const childText = readFileSync(
      path.join(evidence, "child-input-diagnostic.jsonl"),
      "utf8",
    );
    const parentText = readFileSync(path.join(evidence, parentFile), "utf8");
    expect(childText).toContain(Buffer.from("child").toString("base64"));
    expect(parentText).toContain(
      Buffer.from("parent", "utf16le").toString("base64"),
    );
    expect(childText).not.toContain("pty-write");
    expect(parentText).not.toContain('"kind":"stdin"');
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("does no parent capture in ordinary public mode", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-default-"));
  try {
    const h = setup(evidence, false);
    const terminal = new h.Terminal();
    terminal.emit("data", "ready");
    expect(terminal.write("literal")).toBe("forwarded");
    expect(existsSync(path.join(evidence, parentFile))).toBe(false);
    expect(
      existsSync(path.join(evidence, "parent-pty-capture-error.json")),
    ).toBe(false);
    h.cleanup();
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("preserves receiver, argument, call count and the original thrown value", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-throw-"));
  try {
    const h = setup(evidence, true);
    const failure = Error("original PTY failure");
    const received: Array<[unknown, string]> = [];
    h.Terminal.prototype.write = function (text: string) {
      expect(readFileSync(path.join(evidence, parentFile), "utf8")).toContain(
        "pty-write",
      );
      received.push([this, text]);
      throw failure;
    };
    const terminal = new h.Terminal();
    const receiver: unknown = { arbitrary: true };
    expect(() =>
      terminal.write.call(receiver as typeof terminal, "\u001b[[C"),
    ).toThrow(failure);
    expect(received).toEqual([[receiver, "\u001b[[C"]]);
    expect(h.selected().ptys[0]!.writes).toEqual(["\u001b[[C"]);
    h.cleanup();
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("leaves an existing parent journal unchanged and forwards despite capture open failure", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-existing-"));
  try {
    const journal = path.join(evidence, parentFile);
    writeFileSync(journal, "prior");
    const h = setup(evidence, true);
    h.Terminal.prototype.write = function (text: string) {
      this.calls.push(text);
      return "forwarded";
    };
    const terminal = new h.Terminal();
    expect(terminal.write("exact")).toBe("forwarded");
    expect(terminal.calls).toEqual(["exact"]);
    expect(readFileSync(journal, "utf8")).toBe("prior");
    expect(
      JSON.parse(
        readFileSync(
          path.join(evidence, "parent-pty-capture-error.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      stage: "open",
      classification: "synthetic-parent-pty-attempts-not-qualification",
    });
    h.cleanup();
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("forwards unchanged when an actual pre-call journal write fails", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-forward-error-"));
  const fs = localRequire("node:fs") as typeof import("node:fs");
  try {
    const h = setup(evidence, true);
    const seen: Array<[unknown, string]> = [];
    h.Terminal.prototype.write = function (text: string) {
      seen.push([this, text]);
      return "unchanged return";
    };
    const terminal = new h.Terminal();
    const receiver = {};
    const write = vi.spyOn(fs, "writeSync").mockImplementationOnce(() => {
      throw Error("synthetic write failure");
    });
    try {
      expect(
        terminal.write.call(receiver as typeof terminal, "\u001b[[C"),
      ).toBe("unchanged return");
    } finally {
      write.mockRestore();
    }
    expect(seen).toEqual([[receiver, "\u001b[[C"]]);
    expect(h.selected().ptys[0]!.writes).toEqual(["\u001b[[C"]);
    expect(
      JSON.parse(
        readFileSync(
          path.join(evidence, "parent-pty-capture-error.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ stage: "write" });
    h.cleanup();
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("bounds parent data and marks truncation instead of retaining partial chunks", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-bound-"));
  try {
    const { startParentPtyDiagnostic } = localRequire(
      "../fixtures/snippets-child-input-diagnostic.cjs",
    ) as {
      startParentPtyDiagnostic(path: string): {
        trace(event: object): void;
        close(): void;
      };
    };
    const journal = startParentPtyDiagnostic(evidence);
    journal.trace({ kind: "pty-attached", ptyIndex: 0, pid: null });
    journal.trace({
      kind: "pty-output",
      ptyIndex: 0,
      pid: 0,
      data: "x".repeat(32769),
    });
    journal.close();
    const rows = readFileSync(path.join(evidence, parentFile), "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { kind: string; reason?: string });
    expect(rows.at(-1)).toMatchObject({
      kind: "capture-truncated",
      reason: "pty-data-byte-bound",
    });
    expect(rows.some((row) => row.kind === "pty-output")).toBe(false);
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("preserves raw string code units and event chunk boundaries", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-chunks-"));
  try {
    const { startParentPtyDiagnostic } = localRequire(
      "../fixtures/snippets-child-input-diagnostic.cjs",
    ) as {
      startParentPtyDiagnostic(path: string): {
        trace(event: object): void;
        close(): void;
      };
    };
    const journal = startParentPtyDiagnostic(evidence);
    const chunks = ["a\u001b[", "[C", "\ud800", "é"];
    for (const data of chunks)
      journal.trace({ kind: "pty-output", ptyIndex: 0, pid: 5, data });
    journal.close();
    const rows = readFileSync(path.join(evidence, parentFile), "utf8")
      .trimEnd()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            kind: string;
            data: string;
            encoding: string;
            boundary: string;
          },
      );
    const output = rows.filter((row) => row.kind === "pty-output");
    expect(
      output.map((row) => Buffer.from(row.data, "base64").toString("utf16le")),
    ).toEqual(chunks);
    expect(
      output.every(
        (row) =>
          row.encoding === "utf16le-base64" &&
          row.boundary === "observed-output",
      ),
    ).toBe(true);
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("marks event-count exhaustion and non-string data as incomplete", () => {
  const { startParentPtyDiagnostic } = localRequire(
    "../fixtures/snippets-child-input-diagnostic.cjs",
  ) as {
    startParentPtyDiagnostic(path: string): {
      trace(event: object): void;
      close(): void;
    };
  };
  for (const nonString of [false, true]) {
    const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-incomplete-"));
    try {
      const journal = startParentPtyDiagnostic(evidence);
      if (nonString)
        journal.trace({
          kind: "pty-write",
          ptyIndex: 0,
          pid: 5,
          data: null,
          dataType: "object",
        });
      else
        for (let i = 0; i < 300; i++)
          journal.trace({ kind: "pty-attached", ptyIndex: 0, pid: null });
      journal.close();
      const rows = readFileSync(path.join(evidence, parentFile), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as { kind: string; reason?: string });
      expect(rows.length).toBeLessThanOrEqual(256);
      expect(rows.at(-1)).toMatchObject({
        kind: "capture-truncated",
        reason: nonString ? "non-string-pty-data" : "event-or-serialized-bound",
      });
    } finally {
      rmSync(evidence, { recursive: true, force: true });
    }
  }
});

it("does not capture data from an unexpected second PTY", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-other-pty-"));
  try {
    const { startParentPtyDiagnostic } = localRequire(
      "../fixtures/snippets-child-input-diagnostic.cjs",
    ) as {
      startParentPtyDiagnostic(path: string): {
        trace(event: object): void;
        close(): void;
      };
    };
    const journal = startParentPtyDiagnostic(evidence);
    journal.trace({ kind: "pty-attached", ptyIndex: 1, pid: 7 });
    journal.trace({
      kind: "pty-write",
      ptyIndex: 1,
      pid: 7,
      data: "not-controlled",
    });
    journal.close();
    const text = readFileSync(path.join(evidence, parentFile), "utf8");
    expect(text).toContain("unexpected-pty-index");
    expect(text).not.toContain(
      Buffer.from("not-controlled", "utf16le").toString("base64"),
    );
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("reports a parent journal write error without throwing into the observer", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "parent-io-error-"));
  const fs = localRequire("node:fs") as typeof import("node:fs");
  try {
    const { startParentPtyDiagnostic } = localRequire(
      "../fixtures/snippets-child-input-diagnostic.cjs",
    ) as {
      startParentPtyDiagnostic(path: string): {
        trace(event: object): void;
        close(): void;
      };
    };
    const journal = startParentPtyDiagnostic(evidence);
    const write = vi.spyOn(fs, "writeSync").mockImplementationOnce(() => {
      throw Error("synthetic write failure");
    });
    try {
      expect(() =>
        journal.trace({ kind: "pty-write", ptyIndex: 0, pid: 42, data: "x" }),
      ).not.toThrow();
    } finally {
      write.mockRestore();
    }
    journal.close();
    expect(
      JSON.parse(
        readFileSync(
          path.join(evidence, "parent-pty-capture-error.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      stage: "write",
      completeEvents: 1,
      capturedPtyDataBytes: 0,
    });
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});
