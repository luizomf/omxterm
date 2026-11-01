import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const probe = path.resolve("test/fixtures/snippets-windows-probe.cjs");
const ordinaryEnvironment = { ...process.env };
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC;
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC;
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE;
delete ordinaryEnvironment.OMXTERM_SNIPPETS_PACKAGED_EVIDENCE;
const insert = Buffer.from("  SNIPPETS_INSERT  ");
const cpr = Buffer.from("\u001b[2;1R");

type CaptureEvent = {
  kind: string;
  sequence: number;
  data?: string;
  lineLength?: number;
  draft?: string | null;
  matches?: boolean;
};
function events(directory: string): CaptureEvent[] {
  return readFileSync(
    path.join(directory, "child-input-diagnostic.jsonl"),
    "utf8",
  )
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as CaptureEvent);
}

it.each([
  { name: "exact", input: insert },
  { name: "cursor-report prefix", input: Buffer.concat([cpr, insert]) },
  {
    name: "focus-report suffix",
    input: Buffer.concat([insert, Buffer.from("\u001b[O")]),
  },
  { name: "duplicate", input: Buffer.concat([insert, insert]) },
  { name: "invalid byte", input: Buffer.concat([insert, Buffer.from([0xff])]) },
  {
    name: "unexpected submitted byte",
    input: Buffer.concat([insert, Buffer.from("x\r")]),
  },
  { name: "explicit Enter", input: Buffer.concat([insert, Buffer.from("\r")]) },
])(
  "preserves ordinary probe behavior for $name while recording literal input",
  ({ input }) => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "snippets-capture-parity-"),
    );
    try {
      const settings = { input, encoding: "utf8" as const, timeout: 5_000 };
      const baseline = spawnSync(process.execPath, [probe], {
        ...settings,
        env: ordinaryEnvironment,
      });
      const captured = spawnSync(process.execPath, [probe], {
        ...settings,
        env: {
          ...ordinaryEnvironment,
          OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE: "1",
          OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: directory,
        },
      });
      expect(captured.error).toBeUndefined();
      expect({
        status: captured.status,
        stdout: captured.stdout,
        stderr: captured.stderr,
      }).toEqual({
        status: baseline.status,
        stdout: baseline.stdout,
        stderr: baseline.stderr,
      });
      expect(captured.stdout).not.toContain(
        "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED",
      );
      const rows = events(directory);
      const chunks = rows.filter((row) => row.kind === "stdin");
      expect(
        Buffer.concat(chunks.map((row) => Buffer.from(row.data!, "base64"))),
      ).toEqual(input);
      expect(rows.map((row) => row.sequence)).toEqual(
        rows.map((_row, i) => i + 1),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it("keeps the legacy diagnostic marker when both capture flags are set", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "snippets-capture-both-"),
  );
  try {
    const result = spawnSync(process.execPath, [probe], {
      input: insert,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "1",
        OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: directory,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED\n");
    const recorded = events(directory);
    expect(recorded[0]).toMatchObject({
      childInputCapture: true,
      insertDiagnostic: true,
      readinessDiagnostic: false,
    });
    const chunks = recorded.filter((event) => event.kind === "stdin");
    expect(
      Buffer.concat(chunks.map((event) => Buffer.from(event.data!, "base64"))),
    ).toEqual(insert);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("preserves the probe error when capture-only cannot open its exclusive journal", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "snippets-capture-existing-"),
  );
  try {
    const journal = path.join(directory, "child-input-diagnostic.jsonl");
    writeFileSync(journal, "prior");
    const input = Buffer.from("unexpected\r");
    const settings = { input, encoding: "utf8" as const, timeout: 5_000 };
    const baseline = spawnSync(process.execPath, [probe], {
      ...settings,
      env: ordinaryEnvironment,
    });
    const captured = spawnSync(process.execPath, [probe], {
      ...settings,
      env: {
        ...ordinaryEnvironment,
        OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: directory,
      },
    });
    expect({
      status: captured.status,
      stdout: captured.stdout,
      stderr: captured.stderr,
    }).toEqual({
      status: baseline.status,
      stdout: baseline.stdout,
      stderr: baseline.stderr,
    });
    expect(captured.status).toBe(1);
    expect(readFileSync(journal, "utf8")).toBe("prior");
    expect(
      JSON.parse(
        readFileSync(
          path.join(directory, "child-input-capture-error.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ stage: "open" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("records separate callbacks when later input clears the scheduled draft timer", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "snippets-capture-callbacks-"),
  );
  try {
    const stdin = Object.assign(new EventEmitter(), {
      isTTY: false,
      pause() {},
    });
    const output: string[] = [];
    const fake = Object.assign(new EventEmitter(), {
      env: {
        OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE: "1",
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: directory,
      },
      stdin,
      stdout: { write: (value: string) => output.push(value) },
      stderr: { write() {} },
      pid: 123,
      ppid: 122,
      version: "test",
      platform: "win32",
      arch: "arm64",
      exit() {
        throw Error("unexpected exit");
      },
    });
    const timers = new Map<number, () => void>();
    let next = 0;
    runInNewContext(readFileSync(probe, "utf8"), {
      Buffer,
      process: fake,
      require: createRequire(probe),
      setTimeout: (fn: () => void) => {
        const id = ++next;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    });
    stdin.emit("data", insert);
    expect(timers.size).toBe(1);
    stdin.emit("data", cpr);
    expect(timers.size).toBe(0);
    fake.emit("exit", 0);
    const rows = events(directory);
    expect(
      rows
        .filter((row) => row.kind === "stdin")
        .map((row) => Buffer.from(row.data!, "base64")),
    ).toEqual([insert, cpr]);
    expect(
      rows
        .filter((row) => row.kind === "input-processed")
        .map((row) => [row.lineLength, row.draft]),
    ).toEqual([
      [19, "insert"],
      [25, null],
    ]);
    expect(rows.some((row) => row.kind === "draft-scheduled")).toBe(true);
    expect(rows.some((row) => row.kind === "draft-timer")).toBe(false);
    expect(output.join("")).not.toContain("SNIPPETS_INSERT_DRAFT_RECEIPT");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
