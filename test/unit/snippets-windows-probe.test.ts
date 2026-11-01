import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createInputHandler } from "restty/internal";
import { expect, it, vi } from "vitest";

const probe = path.resolve("test/fixtures/snippets-windows-probe.cjs");
const require = createRequire(import.meta.url);
const { startChildInputDiagnostic } =
  require("../fixtures/snippets-child-input-diagnostic.cjs") as {
    startChildInputDiagnostic(directory: string): {
      record(kind: string, fields?: object): boolean;
      input(chunk: unknown, lineLengthBefore: number): void;
      close(code: number): void;
    };
  };
type CaptureEvent = {
  kind: string;
  sequence: number;
  monotonicNs: string;
  phase?: string;
  data?: string;
  bytes?: number;
  lineLength?: number;
  lineLengthBefore?: number;
  draft?: string | null;
  checkpointVisible?: boolean;
  reason?: string;
};
const readCapture = (directory: string): CaptureEvent[] =>
  readFileSync(path.join(directory, "child-input-diagnostic.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as CaptureEvent);
const ordinaryEnvironment = { ...process.env };
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC;
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC;
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE;
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;

it("initializes a real Restty parser with focus reporting and bracketed paste disabled", () => {
  const parser = createInputHandler();
  parser.filterOutput("\u001b[?1004h\u001b[?9001h\u001b[?2004h");
  expect(parser.isFocusReporting()).toBe(true);
  expect(parser.isBracketedPaste()).toBe(true);
  const output = execFileSync(process.execPath, [probe], {
    input: "",
    encoding: "utf8",
    timeout: 5_000,
    env: ordinaryEnvironment,
  });
  parser.filterOutput(output);
  expect(parser.isFocusReporting()).toBe(false);
  expect(parser.isBracketedPaste()).toBe(false);
});

it("acknowledges exact controlled Windows lines and discards an interrupted draft", () => {
  const output = execFileSync(process.execPath, [probe], {
    input:
      "  SNIPPETS_INSERT  \rSNIPPETS_RUN\rdiscarded\u0003  SNIPPETS_INSERT  \rSNIPPETS_PING\r",
    encoding: "utf8",
    timeout: 5_000,
    env: ordinaryEnvironment,
  });
  expect(output).toBe(
    "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\n" +
      "SNIPPETS_INSERT_RECEIPT\nSNIPPETS_RUN_RECEIPT\n" +
      "SNIPPETS_DRAFT_CLEARED\nSNIPPETS_INSERT_RECEIPT\n" +
      "SNIPPETS_AFTER_RETIREMENT\n",
  );
});

it("acknowledges the exact 19-byte Insert draft before Enter in an ordinary run", () => {
  const output = execFileSync(process.execPath, [probe], {
    input: Buffer.from("2020534e4950504554535f494e534552542020", "hex"),
    encoding: "utf8",
    timeout: 5_000,
    env: ordinaryEnvironment,
  });
  expect(output).toBe(
    "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\n" +
      "SNIPPETS_INSERT_DRAFT_RECEIPT\n",
  );
});

it("captures the exact child input in an ordinary run without the diagnostic marker", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-capture-only-"),
  );
  const input = Buffer.from("  SNIPPETS_INSERT  ");
  try {
    const baseline = execFileSync(process.execPath, [probe], {
      input,
      encoding: "utf8",
      timeout: 5_000,
      env: ordinaryEnvironment,
    });
    const output = execFileSync(process.execPath, [probe], {
      input,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
      },
    });
    expect(output).toBe(baseline);
    expect(output).not.toContain("SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED");
    const events = readCapture(evidence);
    expect(events[0]).toMatchObject({
      childInputCapture: true,
      insertDiagnostic: false,
      readinessDiagnostic: false,
    });
    expect(events.slice(0, 4).map((event) => event.kind)).toEqual([
      "start",
      "raw-mode",
      "ready-write",
      "listener-attached",
    ]);
    const chunks = events.filter((event) => event.kind === "stdin");
    expect(chunks[0]?.lineLengthBefore).toBe(0);
    expect(
      Buffer.concat(chunks.map((event) => Buffer.from(event.data!, "base64"))),
    ).toEqual(input);
    expect(events.find((event) => event.kind === "draft-timer")).toMatchObject({
      phase: "draft-timer",
      draft: "insert",
      matches: true,
    });
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("retains exact child input chunks from startup without changing a contaminated draft", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "snippets-child-input-"));
  const input = Buffer.concat([
    Buffer.from("\u001b[2;1R"),
    Buffer.from("  SNIPPETS_INSERT  "),
  ]);
  try {
    const output = execFileSync(process.execPath, [probe], {
      input,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
      },
    });
    expect(output).not.toContain("SNIPPETS_INSERT_DRAFT_RECEIPT");
    const events = readCapture(evidence);
    expect(events[0]).toMatchObject({
      kind: "start",
      childInputCapture: false,
      insertDiagnostic: true,
      readinessDiagnostic: false,
      stdinIsTTY: null,
      stdoutIsTTY: null,
      stdinIsRaw: null,
      limits: { events: 256, inputBytes: 65536, serializedBytes: 262144 },
    });
    expect(events.some((event) => event.kind === "listener-attached")).toBe(
      true,
    );
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_event, index) => index + 1),
    );
    expect(
      events.every(
        (event, index) =>
          index === 0 ||
          BigInt(event.monotonicNs) >= BigInt(events[index - 1]!.monotonicNs),
      ),
    ).toBe(true);
    const chunks = events.filter((event) => event.kind === "stdin");
    expect(
      Buffer.concat(chunks.map((event) => Buffer.from(event.data!, "base64"))),
    ).toEqual(input);
    expect(chunks.reduce((sum, event) => sum + event.bytes!, 0)).toBe(
      input.length,
    );
    expect(
      events.find((event) => event.kind === "input-processed"),
    ).toMatchObject({
      phase: "stdin-callback",
      lineLength: input.length,
      draft: null,
    });
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("records a visible checkpoint and the actual draft timer without changing the receipt", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "snippets-child-phase-"));
  try {
    writeFileSync(path.join(evidence, "child-input-checkpoint.json"), "{}");
    const baselineEnv: NodeJS.ProcessEnv = {
      ...ordinaryEnvironment,
      OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
    };
    delete baselineEnv.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;
    const baseline = execFileSync(process.execPath, [probe], {
      input: Buffer.from("  SNIPPETS_INSERT  "),
      encoding: "utf8",
      timeout: 5_000,
      env: baselineEnv,
    });
    const output = execFileSync(process.execPath, [probe], {
      input: Buffer.from("  SNIPPETS_INSERT  "),
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
      },
    });
    expect(output).toBe(baseline);
    expect(output).toContain("SNIPPETS_INSERT_DRAFT_RECEIPT\n");
    const events = readCapture(evidence);
    expect(
      events.find((event) => event.kind === "stdin")?.checkpointVisible,
    ).toBe(true);
    expect(
      events.find((event) => event.kind === "draft-scheduled"),
    ).toMatchObject({ draft: "insert", phase: "stdin-callback" });
    expect(events.find((event) => event.kind === "draft-timer")).toMatchObject({
      draft: "insert",
      phase: "draft-timer",
      matches: true,
    });
    expect(events.some((event) => event.kind === "draft-receipt-write")).toBe(
      true,
    );
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("records ordered raw chunks on either side of the observable checkpoint hint", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-child-chunks-"),
  );
  try {
    const capture = startChildInputDiagnostic(evidence);
    const before = Buffer.from([0x1b, 0x5b, 0x32, 0x3b, 0x31, 0x52]);
    const after = Buffer.from("  SNIPPETS_INSERT  ");
    capture.input(before, 0);
    writeFileSync(path.join(evidence, "child-input-checkpoint.json"), "{}");
    capture.input(after, before.length);
    capture.close(0);
    const chunks = readCapture(evidence).filter(
      (event) => event.kind === "stdin",
    );
    expect(chunks.map((event) => event.checkpointVisible)).toEqual([
      false,
      true,
    ]);
    expect(chunks.map((event) => Buffer.from(event.data!, "base64"))).toEqual([
      before,
      after,
    ]);
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("does not create child-input evidence in ordinary mode", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-child-ordinary-"),
  );
  try {
    const output = execFileSync(process.execPath, [probe], {
      input: Buffer.from("  SNIPPETS_INSERT  "),
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
      },
    });
    expect(output).toContain("SNIPPETS_INSERT_DRAFT_RECEIPT\n");
    expect(
      existsSync(path.join(evidence, "child-input-diagnostic.jsonl")),
    ).toBe(false);
    expect(
      existsSync(path.join(evidence, "child-input-capture-error.json")),
    ).toBe(false);
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("preserves probe errors and input bytes in the child journal", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "snippets-child-error-"));
  const input = Buffer.from("\u001b[2;1R  SNIPPETS_INSERT  \r");
  try {
    const baselineEnv: NodeJS.ProcessEnv = {
      ...ordinaryEnvironment,
      OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
    };
    delete baselineEnv.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;
    const baseline = spawnSync(process.execPath, [probe], {
      input,
      encoding: "utf8",
      timeout: 5_000,
      env: baselineEnv,
    });
    const result = spawnSync(process.execPath, [probe], {
      input,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
      },
    });
    expect(result.status).toBe(1);
    expect(result.status).toBe(baseline.status);
    expect(result.stdout).toBe(baseline.stdout);
    expect(result.stderr).toBe(baseline.stderr);
    expect(result.stderr).toContain("Unexpected controlled probe input");
    const events = readCapture(evidence);
    expect(
      Buffer.concat(
        events
          .filter((event) => event.kind === "stdin")
          .map((event) => Buffer.from(event.data!, "base64")),
      ),
    ).toEqual(input);
    expect(events.find((event) => event.kind === "probe-error")).toMatchObject({
      phase: "stdin-callback",
      lineLength: input.length - 1,
    });
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("retains a pre-existing journal and reports capture failure without changing probe behavior", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-child-existing-"),
  );
  const file = path.join(evidence, "child-input-diagnostic.jsonl");
  try {
    writeFileSync(file, "prior");
    const output = execFileSync(process.execPath, [probe], {
      input: "  SNIPPETS_INSERT  ",
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
      },
    });
    expect(output).toContain("SNIPPETS_INSERT_DRAFT_RECEIPT\n");
    expect(readFileSync(file, "utf8")).toBe("prior");
    const failure = JSON.parse(
      readFileSync(
        path.join(evidence, "child-input-capture-error.json"),
        "utf8",
      ),
    ) as { stage: string; error: string };
    expect(failure.stage).toBe("open");
    expect(failure.error).toContain("EEXIST");
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("records a mid-stream journal write failure without throwing into the probe", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-child-write-error-"),
  );
  const fs = require("node:fs") as typeof import("node:fs");
  try {
    const capture = startChildInputDiagnostic(evidence);
    const write = vi.spyOn(fs, "writeSync").mockImplementationOnce(() => {
      throw Error("synthetic journal write failure");
    });
    try {
      expect(capture.record("synthetic", { phase: "test" })).toBe(false);
    } finally {
      write.mockRestore();
    }
    capture.close(0);
    const failure = JSON.parse(
      readFileSync(
        path.join(evidence, "child-input-capture-error.json"),
        "utf8",
      ),
    ) as { stage: string; error: string };
    expect(failure.stage).toBe("write");
    expect(failure.error).toContain("synthetic journal write failure");
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("marks capture truncation without silently retaining a partial input chunk", () => {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "snippets-child-bound-"));
  try {
    const capture = startChildInputDiagnostic(evidence);
    const raw = Buffer.from([0, 0x1b, 0xff, 13]);
    capture.input(raw, 0);
    capture.input(Buffer.alloc(65536), raw.length);
    capture.close(0);
    const events = readCapture(evidence);
    expect(Buffer.from(events[0]!.data!, "base64")).toEqual(raw);
    expect(events.at(-1)).toMatchObject({
      kind: "capture-truncated",
      reason: "input-byte-bound",
    });
    expect(events.filter((event) => event.kind === "stdin")).toHaveLength(1);
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("bounds the number of recorded callback events and marks truncation", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-child-events-"),
  );
  try {
    const capture = startChildInputDiagnostic(evidence);
    for (let i = 0; i < 300; i++)
      capture.record("synthetic", { phase: "test" });
    capture.close(0);
    const events = readCapture(evidence);
    expect(events.length).toBeLessThanOrEqual(256);
    expect(events.at(-1)).toMatchObject({
      kind: "capture-truncated",
      reason: "event-or-serialized-bound",
    });
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("marks oversized records and non-Buffer callbacks explicitly", () => {
  const evidence = mkdtempSync(
    path.join(os.tmpdir(), "snippets-child-json-bound-"),
  );
  try {
    const capture = startChildInputDiagnostic(evidence);
    capture.input("not a Buffer", 0);
    capture.record("oversized", { data: "x".repeat(300_000) });
    capture.close(0);
    const events = readCapture(evidence);
    expect(events[0]).toMatchObject({
      kind: "non-buffer-stdin",
      phase: "stdin-callback",
    });
    expect(events.at(-1)).toMatchObject({
      kind: "capture-truncated",
      reason: "event-or-serialized-bound",
    });
    expect(
      statSync(path.join(evidence, "child-input-diagnostic.jsonl")).size,
    ).toBeLessThanOrEqual(262144);
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
});

it("diagnostically acknowledges the exact inserted line before Enter", () => {
  const output = execFileSync(process.execPath, [probe], {
    input: "  SNIPPETS_INSERT  ",
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...ordinaryEnvironment,
      OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
    },
  });
  expect(output).toBe(
    "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\n" +
      "SNIPPETS_INSERT_DRAFT_RECEIPT\n" +
      "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\n",
  );
});

it.each([
  { name: "prefix", input: Buffer.from("  SNIPPETS_INSERT ") },
  { name: "extra", input: Buffer.from("  SNIPPETS_INSERT  x") },
  {
    name: "duplicate",
    input: Buffer.from("  SNIPPETS_INSERT    SNIPPETS_INSERT  "),
  },
  {
    name: "invalid byte",
    input: Buffer.concat([
      Buffer.from("  SNIPPETS_INSERT  "),
      Buffer.from([0xff]),
    ]),
  },
  { name: "premature Enter", input: Buffer.from("  SNIPPETS_INSERT  \r") },
])("does not acknowledge the exact draft for $name", ({ input }) => {
  const output = execFileSync(process.execPath, [probe], {
    input,
    encoding: "utf8",
    timeout: 5_000,
    env: ordinaryEnvironment,
  });
  expect(output).not.toContain("SNIPPETS_INSERT_DRAFT_RECEIPT");
});

it("rejects extra bytes arriving after the Insert draft receipt before Enter", async () => {
  const child = spawn(process.execPath, [probe], {
    env: ordinaryEnvironment,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let failure = "";
  child.stderr
    .setEncoding("utf8")
    .on("data", (chunk: string) => (failure += chunk));
  const closed = once(child, "close");
  const observed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("probe receipt timeout")),
      2_000,
    );
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
      if (output.includes("SNIPPETS_INSERT_DRAFT_RECEIPT\n")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  try {
    child.stdin.write("  SNIPPETS_INSERT  ");
    await observed;
    child.stdin.end("x\r");
    const [code] = (await closed) as [number | null, NodeJS.Signals | null];
    expect(code).toBe(1);
    expect(failure).toContain("Unexpected controlled probe input");
    expect(output).not.toContain("SNIPPETS_INSERT_RECEIPT\n");
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

it("acknowledges a quiet exact Run draft without executing it", () => {
  const output = execFileSync(process.execPath, [probe], {
    input: Buffer.from("SNIPPETS_RUN"),
    encoding: "utf8",
    timeout: 5_000,
    env: ordinaryEnvironment,
  });
  expect(output).toContain("SNIPPETS_RUN_DRAFT_RECEIPT\n");
  expect(output).not.toContain("SNIPPETS_RUN_RECEIPT\n");
});

it("does not report a diagnostic receipt for an exact prefix with extra data", () => {
  const output = execFileSync(process.execPath, [probe], {
    input: "  SNIPPETS_INSERT  EXTRA",
    encoding: "utf8",
    timeout: 5_000,
    env: {
      ...ordinaryEnvironment,
      OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
    },
  });
  expect(output).toBe("\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\n");
});

it.each(["SNIPPETS_RUN-extra", "constructor"])(
  "refuses unexpected line %s instead of reporting success",
  (line) => {
    expect(() =>
      execFileSync(process.execPath, [probe], {
        input: line + "\r",
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["pipe", "pipe", "pipe"],
        env: ordinaryEnvironment,
      }),
    ).toThrow();
  },
);
